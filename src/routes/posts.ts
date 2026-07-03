import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { User } from '../models/User';
import { Post } from '../models/Post';
import { PostPhoto } from '../models/PostPhoto';
import { PostLike } from '../models/PostLike';
import { SavedPost } from '../models/SavedPost';
import { Comment } from '../models/Comment';
import { Friend } from '../models/Friend';
import { Notification } from '../models/Notification';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { createAndDeliverNotification } from '../services/NotificationService';
import { StorageService } from '../services/StorageService';
import { AuthRequest, authenticate } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { serializePost } from '../utils/helpers';
import { getIO } from '../io';

const router = Router();

// Feed
router.get('/feed/', authenticate, async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = 20;
  const friendIds = (await Friend.findAll({ where: { userId: req.user!.id }, attributes: ['friendId'] })).map(f => (f as any).friendId);

  const { count, rows } = await Post.findAndCountAll({
    where: { userId: { [Op.in]: [...friendIds, req.user!.id] }, isActive: true, expiresAt: { [Op.gt]: new Date() } },
    include: [
      { model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
      { model: PostPhoto, as: 'photos' },
    ],
    order: [['created_at', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });

  // Annotate with like/save status
  const postIds = rows.map(p => p.id);
  const userLikes = await PostLike.findAll({ where: { userId: req.user!.id, postId: { [Op.in]: postIds } } });
  const savedPosts = await SavedPost.findAll({ where: { userId: req.user!.id, postId: { [Op.in]: postIds } } });
  const allLikes = await PostLike.findAll({ where: { postId: { [Op.in]: postIds } } });

  const likedMap = new Set(userLikes.map(l => l.postId));
  const savedMap = new Set(savedPosts.map(s => s.postId));
  const countMap = new Map<number, number>();
  for (const l of allLikes) {
    countMap.set(l.postId, (countMap.get(l.postId) || 0) + 1);
  }

  const results = rows.map(p => {
    const json = p.toJSON();
    json.likeCount = countMap.get(p.id) || 0;
    (json as any).hasLiked = likedMap.has(p.id);
    (json as any).isSaved = savedMap.has(p.id);
    return serializePost(json, req.user!.id);
  });

  res.json({ count, next: null, previous: null, results });
});

// Get user posts
router.get('/user/:id/', authenticate, async (req: AuthRequest, res: Response) => {
  const posts = await Post.findAll({
    where: { userId: Number(req.params.id), isActive: true },
    include: [
      { model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
      { model: PostPhoto, as: 'photos' },
    ],
    order: [['created_at', 'DESC']],
  });
  res.json(posts.map(p => serializePost({ ...p.toJSON(), hasLiked: false, isSaved: false, likeCount: 0 }, req.user!.id)));
});

// Saved posts (must be before /:id/ to avoid matching "saved" as id)
router.get('/saved/', authenticate, async (req: AuthRequest, res: Response) => {
  const saved = await SavedPost.findAll({
    where: { userId: req.user!.id },
    include: [{
      model: Post,
      as: 'post',
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
        { model: PostPhoto, as: 'photos' },
      ],
    }],
    order: [['created_at', 'DESC']],
  });
  res.json({ results: saved.map(s => serializePost({ ...(s as any).post.toJSON(), hasLiked: false, isSaved: true, likeCount: 0 }, req.user!.id)) });
});

// Get single post
router.get('/:id/', authenticate, async (req: AuthRequest, res: Response) => {
  const post = await Post.findByPk(Number(req.params.id), {
    include: [
      { model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
      { model: PostPhoto, as: 'photos' },
    ],
  });
  if (!post) { res.status(404).json({ error: 'Post not found' }); return; }
  const hasLiked = !!(await PostLike.findOne({ where: { userId: req.user!.id, postId: post.id } }));
  const isSaved = !!(await SavedPost.findOne({ where: { userId: req.user!.id, postId: post.id } }));
  const likeCount = await PostLike.count({ where: { postId: post.id } });
  res.json(serializePost({ ...post.toJSON(), hasLiked, isSaved, likeCount }, req.user!.id));
});

// Create post
router.post('/create/', authenticate, upload.single('uploaded_photos'), async (req: AuthRequest, res: Response) => {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const post = await Post.create({
    userId: req.user!.id,
    caption: req.body.caption || '',
    location: req.body.location || '',
    latitude: req.body.latitude || null,
    longitude: req.body.longitude || null,
    expiresAt,
    isActive: true,
  } as any);
  try {
    if (req.file) {
      const isVideo = req.file.mimetype.startsWith('video/');
      const folder = isVideo ? 'videos' : 'posts';
      const imageUrl = await StorageService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, folder);
      await PostPhoto.create({ postId: post.id, image: imageUrl, order: 0, type: isVideo ? 'video' : 'photo' } as any);
    } else if (req.body.image_url) {
      await PostPhoto.create({ postId: post.id, image: req.body.image_url, order: 0, type: 'photo' } as any);
    }
  } catch (err) {
    await post.destroy();
    console.error('Failed to upload file to R2:', err);
    res.status(500).json({ error: 'Failed to upload media' });
    return;
  }
  const full = await Post.findByPk(post.id, {
    include: [
      { model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
      { model: PostPhoto, as: 'photos' },
    ],
  });
  res.status(201).json(serializePost({ ...full!.toJSON(), hasLiked: false, isSaved: false, likeCount: 0 }, req.user!.id));
});

// Update post
router.patch('/:id/', authenticate, async (req: AuthRequest, res: Response) => {
  const post = await Post.findByPk(Number(req.params.id));
  if (!post || post.userId !== req.user!.id) { res.status(404).json({ error: 'Post not found' }); return; }
  if (req.body.caption !== undefined) post.caption = req.body.caption;
  if (req.body.location !== undefined) post.location = req.body.location;
  if (req.body.latitude !== undefined) post.latitude = req.body.latitude;
  if (req.body.longitude !== undefined) post.longitude = req.body.longitude;
  await post.save();

  const full = await Post.findByPk(post.id, {
    include: [
      { model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
      { model: PostPhoto, as: 'photos' },
    ],
  });
  const hasLiked = !!(await PostLike.findOne({ where: { userId: req.user!.id, postId: post.id } }));
  const isSaved = !!(await SavedPost.findOne({ where: { userId: req.user!.id, postId: post.id } }));
  const likeCount = await PostLike.count({ where: { postId: post.id } });
  res.json(serializePost({ ...full!.toJSON(), hasLiked, isSaved, likeCount }, req.user!.id));
});

// Delete post
router.delete('/:id/', authenticate, async (req: AuthRequest, res: Response) => {
  const postId = Number(req.params.id);
  const post = await Post.findByPk(postId);
  if (!post || post.userId !== req.user!.id) { res.status(404).json({ error: 'Post not found' }); return; }
  // Delete photos from R2
  const photos = await PostPhoto.findAll({ where: { postId } });
  for (const photo of photos) {
    if (StorageService.isR2Url(photo.image)) {
      await StorageService.deleteFile(photo.image);
    }
  }
  // Cascade cleanup
  await Notification.destroy({ where: { postId } });
  await PostLike.destroy({ where: { postId } });
  await Comment.destroy({ where: { postId } });
  await SavedPost.destroy({ where: { postId } });
  await PostPhoto.destroy({ where: { postId } });
  await post.destroy();
  res.status(204).send();
});

// Like post
router.post('/:id/like/', authenticate, async (req: AuthRequest, res: Response) => {
  const post = await Post.findByPk(Number(req.params.id));
  if (!post) { res.status(404).json({ error: 'Post not found' }); return; }
  const [like, created] = await PostLike.findOrCreate({
    where: { userId: req.user!.id, postId: post.id } as any,
    defaults: { userId: req.user!.id, postId: post.id, likeType: req.body.like_type || 'like' } as any,
  });
  if (!created) {
    like.likeType = req.body.like_type || 'like';
    await like.save();
  }
  if (post.userId !== req.user!.id) {
    await createAndDeliverNotification({
      userId: post.userId,
      type: 'post_like',
      title: 'Post Liked',
      body: `${req.user!.firstName} liked your post`,
      actorId: req.user!.id,
      postId: post.id,
    });
  }
  res.json({ detail: 'Liked' });
});

// Unlike post
router.delete('/:id/unlike/', authenticate, async (req: AuthRequest, res: Response) => {
  await PostLike.destroy({ where: { userId: req.user!.id, postId: Number(req.params.id) } } as any);
  res.json({ detail: 'Unliked' });
});

// Save post
router.post('/:id/save/', authenticate, async (req: AuthRequest, res: Response) => {
  await SavedPost.findOrCreate({
    where: { userId: req.user!.id, postId: Number(req.params.id) } as any,
    defaults: { userId: req.user!.id, postId: Number(req.params.id) } as any,
  });
  res.json({ detail: 'Saved' });
});

// Unsave post
router.delete('/:id/unsave/', authenticate, async (req: AuthRequest, res: Response) => {
  await SavedPost.destroy({ where: { userId: req.user!.id, postId: Number(req.params.id) } } as any);
  res.json({ detail: 'Unsaved' });
});

// Comments
router.get('/:id/comments/', authenticate, async (req: AuthRequest, res: Response) => {
  const comments = await Comment.findAll({
    where: { postId: Number(req.params.id) },
    include: [{ model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] }],
    order: [['created_at', 'DESC']],
  });
  res.json(comments.map(c => ({
    id: c.id,
    post: c.postId,
    user: {
      id: (c as any).user?.id,
      username: (c as any).user?.username,
      first_name: (c as any).user?.firstName,
      last_name: (c as any).user?.lastName,
      profile_picture: (c as any).user?.profilePicture,
    },
    text: c.text,
    created_at: c.created_at,
  })));
});

router.post('/:id/comments/', authenticate, async (req: AuthRequest, res: Response) => {
  const comment = await Comment.create({
    postId: Number(req.params.id),
    userId: req.user!.id,
    text: req.body.text,
  } as any);
  const full = await Comment.findByPk(comment.id, {
    include: [{ model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] }],
  });
  const post = await Post.findByPk(Number(req.params.id));
  if (post && post.userId !== req.user!.id) {
    await createAndDeliverNotification({
      userId: post.userId,
      type: 'post_comment',
      title: 'New Comment',
      body: `${req.user!.firstName} commented on your post`,
      actorId: req.user!.id,
      postId: post.id,
    });

    // Create message in chat with post context
    const allConvs = await Conversation.findAll({
      include: [{
        model: User,
        as: 'participants',
        through: { attributes: [] },
      }],
    });
    let conv: any = allConvs.find(c =>
      (c as any).participants?.length === 2 &&
      (c as any).participants?.some((p: any) => p.id === req.user!.id) &&
      (c as any).participants?.some((p: any) => p.id === post!.userId)
    );
    if (!conv) {
      conv = await Conversation.create() as any;
      if (conv) await (conv as any).setParticipants([req.user!.id, post!.userId]);
    }
    if (conv) {
      const msg = await Message.create({
        conversationId: conv.id,
        senderId: req.user!.id,
        text: req.body.text || '',
        postId: post.id,
      } as any);
      await conv.update({ updated_at: new Date() });
      const msgFull = await Message.findByPk(msg.id, {
        include: [
          { model: User, as: 'sender', attributes: ['id', 'firstName', 'lastName', 'profilePicture'] },
          { model: Post, as: 'post', attributes: ['id', 'caption'] },
        ],
      });
      const msgData = {
        id: msg.id,
        conversation: conv.id,
        sender: { id: (msgFull as any)?.sender?.id, first_name: (msgFull as any)?.sender?.firstName, profile_picture: (msgFull as any)?.sender?.profilePicture },
        text: msg.text,
        image: msg.image,
        reply_to: null,
        post: (msgFull as any)?.post ? { id: (msgFull as any).post.id, caption: (msgFull as any).post.caption } : null,
        is_read: msg.isRead,
        created_at: msg.created_at,
      };
      const sio = getIO();
      sio?.to(`conversation:${conv.id}`).emit('message:new', msgData);
      sio?.to(`user:${post!.userId}`).emit('message:new', msgData);
      sio?.to(`user:${post!.userId}`).emit('conversation:updated', { conversationId: conv.id });
    }
  }
  res.status(201).json({
    id: comment.id,
    post: comment.postId,
    user: {
      id: (full as any)?.user?.id,
      username: (full as any)?.user?.username,
      first_name: (full as any)?.user?.firstName,
      last_name: (full as any)?.user?.lastName,
      profile_picture: (full as any)?.user?.profilePicture,
    },
    text: comment.text,
    created_at: comment.created_at,
  });
});

export default router;
