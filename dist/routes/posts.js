"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sequelize_1 = require("sequelize");
const User_1 = require("../models/User");
const Post_1 = require("../models/Post");
const PostPhoto_1 = require("../models/PostPhoto");
const PostLike_1 = require("../models/PostLike");
const SavedPost_1 = require("../models/SavedPost");
const Comment_1 = require("../models/Comment");
const Friend_1 = require("../models/Friend");
const Notification_1 = require("../models/Notification");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const helpers_1 = require("../utils/helpers");
const router = (0, express_1.Router)();
// Feed
router.get('/feed/', auth_1.authenticate, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = 20;
    const friendIds = (await Friend_1.Friend.findAll({ where: { userId: req.user.id }, attributes: ['friendId'] })).map(f => f.friendId);
    friendIds.push(req.user.id);
    const { count, rows } = await Post_1.Post.findAndCountAll({
        where: { userId: { [sequelize_1.Op.in]: friendIds }, isActive: true, expiresAt: { [sequelize_1.Op.gt]: new Date() } },
        include: [
            { model: User_1.User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
            { model: PostPhoto_1.PostPhoto, as: 'photos' },
        ],
        order: [['created_at', 'DESC']],
        offset: (page - 1) * pageSize,
        limit: pageSize,
    });
    // Annotate with like/save status
    const postIds = rows.map(p => p.id);
    const userLikes = await PostLike_1.PostLike.findAll({ where: { userId: req.user.id, postId: { [sequelize_1.Op.in]: postIds } } });
    const savedPosts = await SavedPost_1.SavedPost.findAll({ where: { userId: req.user.id, postId: { [sequelize_1.Op.in]: postIds } } });
    const allLikes = await PostLike_1.PostLike.findAll({ where: { postId: { [sequelize_1.Op.in]: postIds } } });
    const likedMap = new Set(userLikes.map(l => l.postId));
    const savedMap = new Set(savedPosts.map(s => s.postId));
    const countMap = new Map();
    for (const l of allLikes) {
        countMap.set(l.postId, (countMap.get(l.postId) || 0) + 1);
    }
    const results = rows.map(p => {
        const json = p.toJSON();
        json.likeCount = countMap.get(p.id) || 0;
        json.hasLiked = likedMap.has(p.id);
        json.isSaved = savedMap.has(p.id);
        return (0, helpers_1.serializePost)(json, req.user.id);
    });
    res.json({ count, next: null, previous: null, results });
});
// Get user posts
router.get('/user/:id/', auth_1.authenticate, async (req, res) => {
    const posts = await Post_1.Post.findAll({
        where: { userId: Number(req.params.id), isActive: true },
        include: [
            { model: User_1.User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
            { model: PostPhoto_1.PostPhoto, as: 'photos' },
        ],
        order: [['created_at', 'DESC']],
    });
    res.json(posts.map(p => (0, helpers_1.serializePost)({ ...p.toJSON(), hasLiked: false, isSaved: false, likeCount: 0 }, req.user.id)));
});
// Saved posts (must be before /:id/ to avoid matching "saved" as id)
router.get('/saved/', auth_1.authenticate, async (req, res) => {
    const saved = await SavedPost_1.SavedPost.findAll({
        where: { userId: req.user.id },
        include: [{
                model: Post_1.Post,
                as: 'post',
                include: [
                    { model: User_1.User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
                    { model: PostPhoto_1.PostPhoto, as: 'photos' },
                ],
            }],
        order: [['created_at', 'DESC']],
    });
    res.json({ results: saved.map(s => (0, helpers_1.serializePost)({ ...s.post.toJSON(), hasLiked: false, isSaved: true, likeCount: 0 }, req.user.id)) });
});
// Get single post
router.get('/:id/', auth_1.authenticate, async (req, res) => {
    const post = await Post_1.Post.findByPk(Number(req.params.id), {
        include: [
            { model: User_1.User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
            { model: PostPhoto_1.PostPhoto, as: 'photos' },
        ],
    });
    if (!post) {
        res.status(404).json({ error: 'Post not found' });
        return;
    }
    const hasLiked = !!(await PostLike_1.PostLike.findOne({ where: { userId: req.user.id, postId: post.id } }));
    const isSaved = !!(await SavedPost_1.SavedPost.findOne({ where: { userId: req.user.id, postId: post.id } }));
    const likeCount = await PostLike_1.PostLike.count({ where: { postId: post.id } });
    res.json((0, helpers_1.serializePost)({ ...post.toJSON(), hasLiked, isSaved, likeCount }, req.user.id));
});
// Create post
router.post('/create/', auth_1.authenticate, upload_1.upload.single('uploaded_photos'), async (req, res) => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const post = await Post_1.Post.create({
        userId: req.user.id,
        caption: req.body.caption || '',
        location: req.body.location || '',
        latitude: req.body.latitude || null,
        longitude: req.body.longitude || null,
        expiresAt,
        isActive: true,
    });
    if (req.file) {
        await PostPhoto_1.PostPhoto.create({ postId: post.id, image: `/uploads/${req.file.filename}`, order: 0 });
    }
    else if (req.body.image_url) {
        await PostPhoto_1.PostPhoto.create({ postId: post.id, image: req.body.image_url, order: 0 });
    }
    const full = await Post_1.Post.findByPk(post.id, {
        include: [
            { model: User_1.User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
            { model: PostPhoto_1.PostPhoto, as: 'photos' },
        ],
    });
    res.status(201).json((0, helpers_1.serializePost)({ ...full.toJSON(), hasLiked: false, isSaved: false, likeCount: 0 }, req.user.id));
});
// Update post
router.patch('/:id/', auth_1.authenticate, async (req, res) => {
    const post = await Post_1.Post.findByPk(Number(req.params.id));
    if (!post || post.userId !== req.user.id) {
        res.status(404).json({ error: 'Post not found' });
        return;
    }
    if (req.body.caption !== undefined)
        post.caption = req.body.caption;
    if (req.body.location !== undefined)
        post.location = req.body.location;
    await post.save();
    const full = await Post_1.Post.findByPk(post.id, {
        include: [
            { model: User_1.User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
            { model: PostPhoto_1.PostPhoto, as: 'photos' },
        ],
    });
    const hasLiked = !!(await PostLike_1.PostLike.findOne({ where: { userId: req.user.id, postId: post.id } }));
    const isSaved = !!(await SavedPost_1.SavedPost.findOne({ where: { userId: req.user.id, postId: post.id } }));
    const likeCount = await PostLike_1.PostLike.count({ where: { postId: post.id } });
    res.json((0, helpers_1.serializePost)({ ...full.toJSON(), hasLiked, isSaved, likeCount }, req.user.id));
});
// Delete post
router.delete('/:id/', auth_1.authenticate, async (req, res) => {
    const postId = Number(req.params.id);
    const post = await Post_1.Post.findByPk(postId);
    if (!post || post.userId !== req.user.id) {
        res.status(404).json({ error: 'Post not found' });
        return;
    }
    // Cascade cleanup
    await Notification_1.Notification.destroy({ where: { postId } });
    await PostLike_1.PostLike.destroy({ where: { postId } });
    await Comment_1.Comment.destroy({ where: { postId } });
    await SavedPost_1.SavedPost.destroy({ where: { postId } });
    await PostPhoto_1.PostPhoto.destroy({ where: { postId } });
    await post.destroy();
    res.status(204).send();
});
// Like post
router.post('/:id/like/', auth_1.authenticate, async (req, res) => {
    const post = await Post_1.Post.findByPk(Number(req.params.id));
    if (!post) {
        res.status(404).json({ error: 'Post not found' });
        return;
    }
    const [like, created] = await PostLike_1.PostLike.findOrCreate({
        where: { userId: req.user.id, postId: post.id },
        defaults: { userId: req.user.id, postId: post.id, likeType: req.body.like_type || 'like' },
    });
    if (!created) {
        like.likeType = req.body.like_type || 'like';
        await like.save();
    }
    if (post.userId !== req.user.id) {
        await Notification_1.Notification.create({
            userId: post.userId,
            type: 'post_like',
            title: 'Post Liked',
            body: `${req.user.firstName} liked your post`,
            actorId: req.user.id,
            postId: post.id,
        });
    }
    res.json({ detail: 'Liked' });
});
// Unlike post
router.delete('/:id/unlike/', auth_1.authenticate, async (req, res) => {
    await PostLike_1.PostLike.destroy({ where: { userId: req.user.id, postId: Number(req.params.id) } });
    res.json({ detail: 'Unliked' });
});
// Save post
router.post('/:id/save/', auth_1.authenticate, async (req, res) => {
    await SavedPost_1.SavedPost.findOrCreate({
        where: { userId: req.user.id, postId: Number(req.params.id) },
        defaults: { userId: req.user.id, postId: Number(req.params.id) },
    });
    res.json({ detail: 'Saved' });
});
// Unsave post
router.delete('/:id/unsave/', auth_1.authenticate, async (req, res) => {
    await SavedPost_1.SavedPost.destroy({ where: { userId: req.user.id, postId: Number(req.params.id) } });
    res.json({ detail: 'Unsaved' });
});
// Comments
router.get('/:id/comments/', auth_1.authenticate, async (req, res) => {
    const comments = await Comment_1.Comment.findAll({
        where: { postId: Number(req.params.id) },
        include: [{ model: User_1.User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] }],
        order: [['created_at', 'DESC']],
    });
    res.json(comments.map(c => ({
        id: c.id,
        post: c.postId,
        user: {
            id: c.user?.id,
            username: c.user?.username,
            first_name: c.user?.firstName,
            last_name: c.user?.lastName,
            profile_picture: c.user?.profilePicture,
        },
        text: c.text,
        created_at: c.created_at,
    })));
});
router.post('/:id/comments/', auth_1.authenticate, async (req, res) => {
    const comment = await Comment_1.Comment.create({
        postId: Number(req.params.id),
        userId: req.user.id,
        text: req.body.text,
    });
    const full = await Comment_1.Comment.findByPk(comment.id, {
        include: [{ model: User_1.User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] }],
    });
    const post = await Post_1.Post.findByPk(Number(req.params.id));
    if (post && post.userId !== req.user.id) {
        await Notification_1.Notification.create({
            userId: post.userId,
            type: 'post_comment',
            title: 'New Comment',
            body: `${req.user.firstName} commented on your post`,
            actorId: req.user.id,
            postId: post.id,
        });
    }
    res.status(201).json({
        id: comment.id,
        post: comment.postId,
        user: {
            id: full?.user?.id,
            username: full?.user?.username,
            first_name: full?.user?.firstName,
            last_name: full?.user?.lastName,
            profile_picture: full?.user?.profilePicture,
        },
        text: comment.text,
        created_at: comment.created_at,
    });
});
exports.default = router;
//# sourceMappingURL=posts.js.map