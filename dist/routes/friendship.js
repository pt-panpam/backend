"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sequelize_1 = require("sequelize");
const User_1 = require("../models/User");
const FriendRequest_1 = require("../models/FriendRequest");
const Friend_1 = require("../models/Friend");
const Block_1 = require("../models/Block");
const Notification_1 = require("../models/Notification");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/requests/', auth_1.authenticate, async (req, res) => {
    const status = req.query.status || 'pending';
    const requests = await FriendRequest_1.FriendRequest.findAll({
        where: {
            [sequelize_1.Op.or]: [{ fromUserId: req.user.id }, { toUserId: req.user.id }],
            status,
        },
        include: [
            { model: User_1.User, as: 'fromUser', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
            { model: User_1.User, as: 'toUser', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
        ],
        order: [['created_at', 'DESC']],
    });
    res.json(requests.map(r => ({
        id: r.id,
        from_user: r.fromUser ? {
            id: r.fromUser.id,
            username: r.fromUser.username,
            first_name: r.fromUser.firstName,
            last_name: r.fromUser.lastName,
            profile_picture: r.fromUser.profilePicture,
        } : null,
        to_user: r.toUser ? {
            id: r.toUser.id,
            username: r.toUser.username,
            first_name: r.toUser.firstName,
            last_name: r.toUser.lastName,
            profile_picture: r.toUser.profilePicture,
        } : null,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
    })));
});
router.post('/requests/send/', auth_1.authenticate, async (req, res) => {
    const toUserId = req.body.user_id;
    if (toUserId === req.user.id) {
        res.status(400).json({ error: 'Cannot send friend request to yourself' });
        return;
    }
    const toUser = await User_1.User.findByPk(toUserId);
    if (!toUser || !toUser.isActive) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const existingFriend = await Friend_1.Friend.findOne({
        where: {
            [sequelize_1.Op.or]: [
                { userId: req.user.id, friendId: toUserId },
                { userId: toUserId, friendId: req.user.id },
            ],
        },
    });
    if (existingFriend) {
        res.status(400).json({ error: 'Already friends' });
        return;
    }
    let existing = await FriendRequest_1.FriendRequest.findOne({
        where: {
            [sequelize_1.Op.or]: [
                { fromUserId: req.user.id, toUserId },
                { fromUserId: toUserId, toUserId: req.user.id },
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
            await Notification_1.Notification.create({
                userId: toUserId,
                type: 'friend_request',
                title: 'New Friend Request',
                body: `${req.user.firstName} sent you a friend request`,
                actorId: req.user.id,
            });
            res.status(201).json(existing);
            return;
        }
    }
    const fr = await FriendRequest_1.FriendRequest.create({ fromUserId: req.user.id, toUserId, status: 'pending' });
    await Notification_1.Notification.create({
        userId: toUserId,
        type: 'friend_request',
        title: 'New Friend Request',
        body: `${req.user.firstName} sent you a friend request`,
        actorId: req.user.id,
    });
    res.status(201).json(fr);
});
router.post('/requests/:pk/accept/', auth_1.authenticate, async (req, res) => {
    const fr = await FriendRequest_1.FriendRequest.findOne({
        where: { id: Number(req.params.pk), toUserId: req.user.id, status: 'pending' },
    });
    if (!fr) {
        res.status(404).json({ error: 'Friend request not found' });
        return;
    }
    fr.status = 'accepted';
    await fr.save();
    await Friend_1.Friend.create({ userId: req.user.id, friendId: fr.fromUserId });
    await Friend_1.Friend.create({ userId: fr.fromUserId, friendId: req.user.id });
    await Notification_1.Notification.create({
        userId: fr.fromUserId,
        type: 'friend_accepted',
        title: 'Friend Request Accepted',
        body: `${req.user.firstName} accepted your friend request`,
        actorId: req.user.id,
    });
    res.json(fr);
});
router.post('/requests/:pk/reject/', auth_1.authenticate, async (req, res) => {
    const fr = await FriendRequest_1.FriendRequest.findOne({
        where: { id: Number(req.params.pk), toUserId: req.user.id, status: 'pending' },
    });
    if (!fr) {
        res.status(404).json({ error: 'Friend request not found' });
        return;
    }
    fr.status = 'rejected';
    await fr.save();
    res.json(fr);
});
router.post('/requests/:pk/cancel/', auth_1.authenticate, async (req, res) => {
    const fr = await FriendRequest_1.FriendRequest.findOne({
        where: { id: Number(req.params.pk), fromUserId: req.user.id, status: 'pending' },
    });
    if (!fr) {
        res.status(404).json({ error: 'Friend request not found' });
        return;
    }
    await fr.destroy();
    res.status(204).send();
});
router.post('/remove/', auth_1.authenticate, async (req, res) => {
    const friendId = req.body.user_id;
    if (!friendId) {
        res.status(400).json({ error: 'user_id is required' });
        return;
    }
    await Friend_1.Friend.destroy({
        where: {
            [sequelize_1.Op.or]: [
                { userId: req.user.id, friendId },
                { userId: friendId, friendId: req.user.id },
            ],
        },
    });
    await FriendRequest_1.FriendRequest.destroy({
        where: {
            [sequelize_1.Op.or]: [
                { fromUserId: req.user.id, toUserId: friendId },
                { fromUserId: friendId, toUserId: req.user.id },
            ],
            status: 'accepted',
        },
    });
    res.status(204).send();
});
router.get('/list/', auth_1.authenticate, async (req, res) => {
    const friendIds = await Friend_1.Friend.findAll({
        where: { userId: req.user.id },
        attributes: ['friendId'],
    });
    const ids = friendIds.map(f => f.friendId);
    const friends = await User_1.User.findAll({ where: { id: ids } });
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
router.post('/block/', auth_1.authenticate, async (req, res) => {
    const userId = req.body.user_id;
    if (!userId) {
        res.status(400).json({ error: 'user_id is required' });
        return;
    }
    if (userId === req.user.id) {
        res.status(400).json({ error: 'Cannot block yourself' });
        return;
    }
    const toBlock = await User_1.User.findByPk(userId);
    if (!toBlock || !toBlock.isActive) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    await Block_1.Block.findOrCreate({ where: { blockerId: req.user.id, blockedId: userId } });
    await Friend_1.Friend.destroy({
        where: {
            [sequelize_1.Op.or]: [
                { userId: req.user.id, friendId: userId },
                { userId, friendId: req.user.id },
            ],
        },
    });
    res.status(201).send();
});
router.post('/unblock/', auth_1.authenticate, async (req, res) => {
    await Block_1.Block.destroy({ where: { blockerId: req.user.id, blockedId: req.body.user_id } });
    res.status(204).send();
});
router.get('/blocked/', auth_1.authenticate, async (req, res) => {
    const blocks = await Block_1.Block.findAll({
        where: { blockerId: req.user.id },
        include: [{ model: User_1.User, as: 'blocked', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] }],
    });
    res.json(blocks.map(b => ({
        id: b.id,
        blocked_user: {
            id: b.blocked?.id,
            username: b.blocked?.username,
            first_name: b.blocked?.firstName,
            last_name: b.blocked?.lastName,
            profile_picture: b.blocked?.profilePicture,
        },
        created_at: b.created_at,
    })));
});
exports.default = router;
//# sourceMappingURL=friendship.js.map