"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Notification_1 = require("../models/Notification");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// List notifications
router.get('/', auth_1.authenticate, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = 20;
    const { count, rows } = await Notification_1.Notification.findAndCountAll({
        where: { userId: req.user.id },
        order: [['created_at', 'DESC']],
        offset: (page - 1) * pageSize,
        limit: pageSize,
    });
    const { User } = require('../models/User');
    const actorIds = [...new Set(rows.map(r => r.actorId).filter(Boolean))];
    const actors = await User.findAll({ where: { id: actorIds } });
    const actorMap = new Map(actors.map((a) => [a.id, a]));
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
router.get('/unread-count/', auth_1.authenticate, async (req, res) => {
    const count = await Notification_1.Notification.count({ where: { userId: req.user.id, isRead: false } });
    res.json({ count });
});
// Mark as read
router.post('/:id/read/', auth_1.authenticate, async (req, res) => {
    await Notification_1.Notification.update({ isRead: true }, { where: { id: req.params.id, userId: req.user.id } });
    res.json({ detail: 'Read' });
});
// Mark all as read
router.post('/read-all/', auth_1.authenticate, async (req, res) => {
    await Notification_1.Notification.update({ isRead: true }, { where: { userId: req.user.id, isRead: false } });
    res.json({ detail: 'All read' });
});
exports.default = router;
//# sourceMappingURL=notifications.js.map