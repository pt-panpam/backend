"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sequelize_1 = require("sequelize");
const User_1 = require("../models/User");
const Conversation_1 = require("../models/Conversation");
const Message_1 = require("../models/Message");
const ConversationReadStatus_1 = require("../models/ConversationReadStatus");
const Call_1 = require("../models/Call");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const io_1 = require("../io");
const router = (0, express_1.Router)();
// Debug: check socket.io status
router.get('/debug/socket/', (_req, res) => {
    const sio = (0, io_1.getIO)();
    res.json({ ioAvailable: !!sio, rooms: sio?.sockets?.adapter?.rooms ? [...sio.sockets.adapter.rooms.keys()] : [] });
});
// List conversations
router.get('/conversations/', auth_1.authenticate, async (req, res) => {
    const userId = req.user.id;
    const convs = await Conversation_1.Conversation.findAll({
        include: [{
                model: User_1.User,
                as: 'participants',
                attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                through: { attributes: [] },
            }],
        order: [['updated_at', 'DESC']],
    });
    const results = await Promise.all(convs
        .filter(c => c.participants?.some((p) => p.id === userId))
        .map(async (c) => {
        const lastMsg = await Message_1.Message.findOne({ where: { conversationId: c.id }, order: [['created_at', 'DESC']] });
        const other = c.participants?.find((p) => p.id !== userId);
        const readStatus = await ConversationReadStatus_1.ConversationReadStatus.findOne({ where: { conversationId: c.id, userId } });
        let unreadCount = 0;
        if (lastMsg) {
            const where = { conversationId: c.id };
            if (readStatus?.lastReadMessageId) {
                const lastReadMsg = await Message_1.Message.findByPk(readStatus.lastReadMessageId);
                if (lastReadMsg)
                    where.created_at = { [sequelize_1.Op.gt]: lastReadMsg.created_at };
            }
            unreadCount = await Message_1.Message.count({ where: { ...where, senderId: { [sequelize_1.Op.ne]: userId } } });
        }
        return {
            id: c.id,
            other_user: other ? { id: other.id, username: other.username, first_name: other.firstName, last_name: other.lastName, profile_picture: other.profilePicture } : null,
            last_message: lastMsg ? {
                id: lastMsg.id,
                conversation: lastMsg.conversationId,
                sender: { id: lastMsg.senderId },
                text: lastMsg.text,
                image: lastMsg.image,
                is_read: lastMsg.isRead,
                created_at: lastMsg.created_at,
            } : null,
            unread_count: unreadCount,
            created_at: c.created_at,
            updated_at: c.updated_at,
        };
    }));
    res.json(results);
});
// Create or find 1-on-1 conversation
router.post('/conversations/create/', auth_1.authenticate, async (req, res) => {
    const { receiver_id } = req.body;
    if (!receiver_id) {
        res.status(400).json({ error: 'receiver_id required' });
        return;
    }
    const allConvs = await Conversation_1.Conversation.findAll({
        include: [{
                model: User_1.User,
                as: 'participants',
                through: { attributes: [] },
            }],
    });
    let conv = allConvs.find(c => c.participants?.length === 2 &&
        c.participants?.some((p) => p.id === req.user.id) &&
        c.participants?.some((p) => p.id === receiver_id));
    if (!conv) {
        conv = await Conversation_1.Conversation.create();
        if (!conv) {
            res.status(500).json({ error: 'Failed to create conversation' });
            return;
        }
        await conv.setParticipants([req.user.id, receiver_id]);
    }
    const other = conv.participants?.find((p) => p.id !== req.user.id);
    res.status(201).json({
        id: conv.id,
        other_user: other ? {
            id: other.id, username: other.username, first_name: other.firstName, last_name: other.lastName, profile_picture: other.profilePicture,
        } : null,
        participants: conv.participants?.map((p) => ({
            id: p.id, username: p.username, first_name: p.firstName, last_name: p.lastName, profile_picture: p.profilePicture,
        })),
        last_message: null,
        unread_count: 0,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
    });
});
// Get conversation messages
router.get('/conversations/:id/', auth_1.authenticate, async (req, res) => {
    const conv = await Conversation_1.Conversation.findByPk(Number(req.params.id), {
        include: [{
                model: User_1.User,
                as: 'participants',
                attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                through: { attributes: [] },
            }],
    });
    if (!conv) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
    }
    if (!conv.participants?.some((p) => p.id === req.user.id)) {
        res.status(403).json({ error: 'Not a participant' });
        return;
    }
    const messages = await Message_1.Message.findAll({
        where: { conversationId: conv.id },
        include: [{ model: User_1.User, as: 'sender', attributes: ['id', 'firstName', 'lastName', 'profilePicture'] }],
        order: [['created_at', 'ASC']],
    });
    const other = conv.participants?.find((p) => p.id !== req.user.id);
    res.json({
        id: conv.id,
        participants: conv.participants?.map((p) => ({
            id: p.id, username: p.username, first_name: p.firstName, last_name: p.lastName, profile_picture: p.profilePicture,
        })),
        other_user: other ? { id: other.id, username: other.username, first_name: other.firstName, last_name: other.lastName, profile_picture: other.profilePicture } : null,
        messages: messages.map(m => ({
            id: m.id,
            conversation: m.conversationId,
            sender: { id: m.sender?.id, first_name: m.sender?.firstName, profile_picture: m.sender?.profilePicture },
            text: m.text,
            image: m.image,
            is_read: m.isRead,
            created_at: m.created_at,
        })),
        created_at: conv.created_at,
        updated_at: conv.updated_at,
    });
});
// Start a conversation / send message
router.post('/send/', auth_1.authenticate, upload_1.upload.single('image'), async (req, res) => {
    const { receiver_id, text } = req.body;
    if (!receiver_id) {
        res.status(400).json({ error: 'receiver_id required' });
        return;
    }
    // Find existing conversation
    const allConvs = await Conversation_1.Conversation.findAll({
        include: [{
                model: User_1.User,
                as: 'participants',
                through: { attributes: [] },
            }],
    });
    let conv = allConvs.find(c => c.participants?.length === 2 &&
        c.participants?.some((p) => p.id === req.user.id) &&
        c.participants?.some((p) => p.id === receiver_id));
    if (!conv) {
        conv = await Conversation_1.Conversation.create();
        await conv.setParticipants([req.user.id, receiver_id]);
    }
    if (!conv) {
        res.status(500).json({ error: 'Failed to create conversation' });
        return;
    }
    const msg = await Message_1.Message.create({
        conversationId: conv.id,
        senderId: req.user.id,
        text: text || '',
        image: req.file ? `/uploads/${req.file.filename}` : (req.body.image_url || null),
    });
    await conv.update({ updated_at: new Date() });
    const full = await Message_1.Message.findByPk(msg.id, {
        include: [{ model: User_1.User, as: 'sender', attributes: ['id', 'firstName', 'lastName', 'profilePicture'] }],
    });
    const msgData = {
        id: msg.id,
        conversation: msg.conversationId,
        sender: { id: full?.sender?.id, first_name: full?.sender?.firstName, profile_picture: full?.sender?.profilePicture },
        text: msg.text,
        image: msg.image,
        is_read: msg.isRead,
        created_at: msg.created_at,
    };
    // Emit real-time events via Socket.IO
    const sio = (0, io_1.getIO)();
    console.log('[chat] emitting message:new', { convId: conv.id, receiver_id, sio: !!sio });
    sio?.to(`conversation:${conv.id}`).emit('message:new', msgData);
    sio?.to(`user:${receiver_id}`).emit('message:new', msgData);
    sio?.to(`user:${receiver_id}`).emit('conversation:updated', { conversationId: conv.id });
    res.status(201).json(msgData);
});
// Mark messages as read
router.post('/conversations/:id/read/', auth_1.authenticate, async (req, res) => {
    const lastMsg = await Message_1.Message.findOne({ where: { conversationId: Number(req.params.id) }, order: [['created_at', 'DESC']] });
    if (lastMsg) {
        await ConversationReadStatus_1.ConversationReadStatus.upsert({
            conversationId: parseInt(req.params.id),
            userId: req.user.id,
            lastReadMessageId: lastMsg.id,
        });
    }
    const sio = (0, io_1.getIO)();
    sio?.to(`conversation:${req.params.id}`).emit('message:read-receipt', {
        conversationId: parseInt(req.params.id),
        userId: req.user.id,
    });
    res.json({ detail: 'Read' });
});
// Initiate a call
router.post('/conversations/:id/call/initiate/', auth_1.authenticate, async (req, res) => {
    const conv = await Conversation_1.Conversation.findByPk(Number(req.params.id), {
        include: [{
                model: User_1.User,
                as: 'participants',
                through: { attributes: [] },
            }],
    });
    if (!conv) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
    }
    const other = conv.participants?.find((p) => p.id !== req.user.id);
    if (!other) {
        res.status(400).json({ error: 'No other participant' });
        return;
    }
    const callType = req.body.call_type || 'audio';
    const call = await Call_1.Call.create({
        conversationId: conv.id,
        callerId: req.user.id,
        calleeId: other.id,
        callType,
        status: 'missed',
    });
    res.status(201).json({
        id: call.id,
        conversation: call.conversationId,
        caller: { id: req.user.id },
        callee: { id: other.id },
        call_type: call.callType,
        status: call.status,
        created_at: call.created_at,
    });
});
// End a call
router.patch('/calls/:id/end/', auth_1.authenticate, async (req, res) => {
    const call = await Call_1.Call.findByPk(Number(req.params.id));
    if (!call) {
        res.status(404).json({ error: 'Call not found' });
        return;
    }
    call.status = 'answered';
    call.endedAt = new Date();
    if (call.startedAt) {
        call.duration = Math.floor((new Date().getTime() - new Date(call.startedAt).getTime()) / 1000);
    }
    await call.save();
    res.json({ detail: 'Call ended' });
});
// Get call history
router.get('/calls/', auth_1.authenticate, async (req, res) => {
    const calls = await Call_1.Call.findAll({
        where: { [sequelize_1.Op.or]: [{ callerId: req.user.id }, { calleeId: req.user.id }] },
        include: [
            { model: User_1.User, as: 'caller', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
            { model: User_1.User, as: 'callee', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
        ],
        order: [['created_at', 'DESC']],
    });
    res.json(calls);
});
exports.default = router;
//# sourceMappingURL=chat.js.map