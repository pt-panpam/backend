import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { User } from '../models/User';
import { FriendRequest } from '../models/FriendRequest';
import { Friend } from '../models/Friend';
import { Block } from '../models/Block';
import { createAndDeliverNotification } from '../services/NotificationService';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();

router.get('/requests/', authenticate, async (req: AuthRequest, res: Response) => {
  const status = (req.query.status as string) || 'pending';
  const requests = await FriendRequest.findAll({
    where: {
      [Op.or]: [{ fromUserId: req.user!.id }, { toUserId: req.user!.id }],
      status,
    },
    include: [
      { model: User, as: 'fromUser', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
      { model: User, as: 'toUser', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
    ],
    order: [['created_at', 'DESC']],
  });
  res.json(requests.map(r => ({
    id: r.id,
    from_user: r.fromUser ? {
      id: (r.fromUser as any).id,
      username: (r.fromUser as any).username,
      first_name: (r.fromUser as any).firstName,
      last_name: (r.fromUser as any).lastName,
      profile_picture: (r.fromUser as any).profilePicture,
    } : null,
    to_user: r.toUser ? {
      id: (r.toUser as any).id,
      username: (r.toUser as any).username,
      first_name: (r.toUser as any).firstName,
      last_name: (r.toUser as any).lastName,
      profile_picture: (r.toUser as any).profilePicture,
    } : null,
    status: r.status,
    created_at: r.created_at,
    updated_at: (r as any).updated_at,
  })));
});

router.post('/requests/send/', authenticate, async (req: AuthRequest, res: Response) => {
  const toUserId = req.body.user_id;
  if (toUserId === req.user!.id) {
    res.status(400).json({ error: 'Cannot send friend request to yourself' });
    return;
  }
  const toUser = await User.findByPk(toUserId);
  if (!toUser || !toUser.isActive) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const existingFriend = await Friend.findOne({
    where: {
      [Op.or]: [
        { userId: req.user!.id, friendId: toUserId },
        { userId: toUserId, friendId: req.user!.id },
      ],
    },
  });
  if (existingFriend) {
    res.status(400).json({ error: 'Already friends' });
    return;
  }
  let existing = await FriendRequest.findOne({
    where: {
      [Op.or]: [
        { fromUserId: req.user!.id, toUserId },
        { fromUserId: toUserId, toUserId: req.user!.id },
      ],
    },
  });
  if (existing) {
    if (existing.status === 'pending') {
      res.status(400).json({ error: 'Friend request already sent' });
      return;
    }
    if (existing.status === 'rejected') {
      existing.status = 'pending';
      await existing.save();
      await createAndDeliverNotification({
        userId: toUserId,
        type: 'friend_request',
        title: 'New Friend Request',
        body: `${req.user!.firstName} sent you a friend request`,
        actorId: req.user!.id,
      });
      res.status(201).json(existing);
      return;
    }
  }
  const fr = await FriendRequest.create({ fromUserId: req.user!.id, toUserId, status: 'pending' } as any);
  await createAndDeliverNotification({
    userId: toUserId,
    type: 'friend_request',
    title: 'New Friend Request',
    body: `${req.user!.firstName} sent you a friend request`,
    actorId: req.user!.id,
  });
  res.status(201).json(fr);
});

router.post('/requests/:pk/accept/', authenticate, async (req: AuthRequest, res: Response) => {
  const fr = await FriendRequest.findOne({
    where: { id: Number(req.params.pk), toUserId: req.user!.id, status: 'pending' },
  });
  if (!fr) { res.status(404).json({ error: 'Friend request not found' }); return; }
  fr.status = 'accepted';
  await fr.save();
  await Friend.create({ userId: req.user!.id, friendId: fr.fromUserId } as any);
  await Friend.create({ userId: fr.fromUserId, friendId: req.user!.id } as any);
  await createAndDeliverNotification({
    userId: fr.fromUserId,
    type: 'friend_accepted',
    title: 'Friend Request Accepted',
    body: `${req.user!.firstName} accepted your friend request`,
    actorId: req.user!.id,
  });
  res.json(fr);
});

router.post('/requests/:pk/reject/', authenticate, async (req: AuthRequest, res: Response) => {
  const fr = await FriendRequest.findOne({
    where: { id: Number(req.params.pk), toUserId: req.user!.id, status: 'pending' },
  });
  if (!fr) { res.status(404).json({ error: 'Friend request not found' }); return; }
  fr.status = 'rejected';
  await fr.save();
  res.json(fr);
});

router.post('/requests/:pk/cancel/', authenticate, async (req: AuthRequest, res: Response) => {
  const fr = await FriendRequest.findOne({
    where: { id: Number(req.params.pk), fromUserId: req.user!.id, status: 'pending' },
  });
  if (!fr) { res.status(404).json({ error: 'Friend request not found' }); return; }
  await fr.destroy();
  res.status(204).send();
});

router.post('/remove/', authenticate, async (req: AuthRequest, res: Response) => {
  const friendId = req.body.user_id;
  if (!friendId) { res.status(400).json({ error: 'user_id is required' }); return; }
  await Friend.destroy({
    where: {
      [Op.or]: [
        { userId: req.user!.id, friendId },
        { userId: friendId, friendId: req.user!.id },
      ],
    },
  });
  await FriendRequest.destroy({
    where: {
      [Op.or]: [
        { fromUserId: req.user!.id, toUserId: friendId },
        { fromUserId: friendId, toUserId: req.user!.id },
      ],
      status: 'accepted',
    },
  });
  res.status(204).send();
});

router.get('/list/', authenticate, async (req: AuthRequest, res: Response) => {
  const friendIds = await Friend.findAll({
    where: { userId: req.user!.id },
    attributes: ['friendId'],
  });
  const ids = friendIds.map(f => (f as any).friendId);
  const friends = await User.findAll({ where: { id: ids } });
  res.json(friends.map(f => ({
    id: f.id,
    username: f.username,
    first_name: f.firstName,
    last_name: f.lastName,
    profile_picture: f.profilePicture,
    bio: f.bio,
    last_seen: f.lastSeen,
    location: f.location,
  })));
});

router.post('/block/', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.body.user_id;
  if (!userId) { res.status(400).json({ error: 'user_id is required' }); return; }
  if (userId === req.user!.id) { res.status(400).json({ error: 'Cannot block yourself' }); return; }
  const toBlock = await User.findByPk(userId);
  if (!toBlock || !toBlock.isActive) { res.status(404).json({ error: 'User not found' }); return; }
  await Block.findOrCreate({ where: { blockerId: req.user!.id, blockedId: userId } as any });
  await Friend.destroy({
    where: {
      [Op.or]: [
        { userId: req.user!.id, friendId: userId },
        { userId, friendId: req.user!.id },
      ],
    },
  });
  res.status(201).send();
});

router.post('/unblock/', authenticate, async (req: AuthRequest, res: Response) => {
  await Block.destroy({ where: { blockerId: req.user!.id, blockedId: req.body.user_id } } as any);
  res.status(204).send();
});

router.get('/blocked/', authenticate, async (req: AuthRequest, res: Response) => {
  const blocks = await Block.findAll({
    where: { blockerId: req.user!.id },
    include: [{ model: User, as: 'blocked', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] }],
  });
  res.json(blocks.map(b => ({
    id: b.id,
    blocked_user: {
      id: (b as any).blocked?.id,
      username: (b as any).blocked?.username,
      first_name: (b as any).blocked?.firstName,
      last_name: (b as any).blocked?.lastName,
      profile_picture: (b as any).blocked?.profilePicture,
    },
    created_at: b.created_at,
  })));
});

export default router;
