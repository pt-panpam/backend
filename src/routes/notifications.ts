import { Router, Response } from 'express';
import { Notification } from '../models/Notification';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();

// List notifications
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.page_size as string) || 100;
  const { count, rows } = await Notification.findAndCountAll({
    where: { userId: req.user!.id },
    order: [['created_at', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  const { User } = require('../models/User');
  const actorIds = [...new Set(rows.map(r => r.actorId).filter(Boolean))];
  const actors = await User.findAll({ where: { id: actorIds } });
  const actorMap = new Map<number, any>(actors.map((a: any) => [a.id, a]));

  res.json({
    count,
    next: null,
    previous: null,
    results: rows.map(n => ({
      id: n.id,
      user: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      actor: n.actorId ? (() => {
        const a = actorMap.get(n.actorId);
        return a ? { id: a.id, username: a.username, first_name: a.firstName, last_name: a.lastName, profile_picture: a.profilePicture } : null;
      })() : null,
      post: n.postId,
      is_read: n.isRead,
      created_at: n.created_at,
    })),
  });
});

// Unread count
router.get('/unread-count/', authenticate, async (req: AuthRequest, res: Response) => {
  const count = await Notification.count({ where: { userId: req.user!.id, isRead: false } });
  res.json({ count });
});

// Mark as read
router.post('/:id/read/', authenticate, async (req: AuthRequest, res: Response) => {
  await Notification.update({ isRead: true }, { where: { id: req.params.id, userId: req.user!.id } });
  res.json({ detail: 'Read' });
});

// Mark all as read
router.post('/read-all/', authenticate, async (req: AuthRequest, res: Response) => {
  await Notification.update({ isRead: true }, { where: { userId: req.user!.id, isRead: false } });
  res.json({ detail: 'All read' });
});

export default router;
