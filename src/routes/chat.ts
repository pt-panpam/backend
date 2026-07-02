import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { Post } from '../models/Post';
import { ConversationReadStatus } from '../models/ConversationReadStatus';
import { Call } from '../models/Call';
import { Friend } from '../models/Friend';
import { AuthRequest, authenticate } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { getIO } from '../io';
import { StorageService } from '../services/StorageService';
import { createAndDeliverNotification } from '../services/NotificationService';

const router = Router();

async function areFriends(userId: number, otherId: number): Promise<boolean> {
  const f = await Friend.findOne({ where: { userId, friendId: otherId } });
  return !!f;
}

// Debug: check socket.io status
router.get('/debug/socket/', (_req, res) => {
  const sio = getIO()
  res.json({ ioAvailable: !!sio, rooms: sio?.sockets?.adapter?.rooms ? [...sio.sockets.adapter.rooms.keys()] : [] })
})

// List conversations
router.get('/conversations/', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const convs = await Conversation.findAll({
    include: [{
      model: User,
      as: 'participants',
      attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
      through: { attributes: [] },
    }],
    order: [['updated_at', 'DESC']],
  });

  const results = await Promise.all(convs
    .filter(c => (c as any).participants?.some((p: any) => p.id === userId))
    .map(async c => {
      const lastMsg = await Message.findOne({ where: { conversationId: c.id }, order: [['created_at', 'DESC']] });
      const other = (c as any).participants?.find((p: any) => p.id !== userId);
      const readStatus = await ConversationReadStatus.findOne({ where: { conversationId: c.id, userId } });
      let unreadCount = 0;
      if (lastMsg) {
        const where: any = { conversationId: c.id };
        if (readStatus?.lastReadMessageId) {
          const lastReadMsg = await Message.findByPk(readStatus.lastReadMessageId);
          if (lastReadMsg) where.created_at = { [Op.gt]: lastReadMsg.created_at };
        }
        unreadCount = await Message.count({ where: { ...where, senderId: { [Op.ne]: userId } } });
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
          reply_to: null,
          post: null,
          is_read: lastMsg.isRead,
          created_at: lastMsg.created_at,
        } : null,
        unread_count: unreadCount,
        disappearing_minutes: c.disappearingMinutes,
        is_request: c.isRequest,
        created_at: c.created_at,
        updated_at: c.updated_at,
      };
    }));
  res.json(results);
});

// Create or find 1-on-1 conversation
router.post('/conversations/create/', authenticate, async (req: AuthRequest, res: Response) => {
  const { receiver_id } = req.body;
  if (!receiver_id) { res.status(400).json({ error: 'receiver_id required' }); return; }

  const allConvs = await Conversation.findAll({
    include: [{
      model: User,
      as: 'participants',
      through: { attributes: [] },
    }],
  });
  let conv = allConvs.find(c =>
    (c as any).participants?.length === 2 &&
    (c as any).participants?.some((p: any) => p.id === req.user!.id) &&
    (c as any).participants?.some((p: any) => p.id === receiver_id)
  );

  if (!conv) {
    const friends = await areFriends(req.user!.id, receiver_id);
    conv = await Conversation.create({ isRequest: !friends } as any) as any;
    if (!conv) { res.status(500).json({ error: 'Failed to create conversation' }); return; }
    await (conv as any).setParticipants([req.user!.id, receiver_id]);
  }

  const other = (conv as any).participants?.find((p: any) => p.id !== req.user!.id);
  res.status(201).json({
    id: conv.id,
    other_user: other ? {
      id: other.id, username: other.username, first_name: other.firstName, last_name: other.lastName, profile_picture: other.profilePicture,
    } : null,
    participants: (conv as any).participants?.map((p: any) => ({
      id: p.id, username: p.username, first_name: p.firstName, last_name: p.lastName, profile_picture: p.profilePicture,
    })),
    last_message: null,
    unread_count: 0,
    is_request: conv.isRequest,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
  });
});

// Get conversation messages
router.get('/conversations/:id/', authenticate, async (req: AuthRequest, res: Response) => {
  const conv = await Conversation.findByPk(Number(req.params.id), {
    include: [{
      model: User,
      as: 'participants',
      attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
      through: { attributes: [] },
    }],
  });
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }
  if (!(conv as any).participants?.some((p: any) => p.id === req.user!.id)) {
    res.status(403).json({ error: 'Not a participant' }); return;
  }
  const allMessages = await Message.findAll({
    where: { conversationId: conv.id },
    include: [
      { model: User, as: 'sender', attributes: ['id', 'firstName', 'lastName', 'profilePicture'] },
      { model: Message, as: 'replyTo', attributes: ['id', 'text', 'image', 'senderId'] },
      { model: Post, as: 'post', attributes: ['id', 'caption'] },
    ],
    order: [['created_at', 'ASC']],
  });
  const cutoff = conv.disappearingMinutes > 0
    ? new Date(Date.now() - conv.disappearingMinutes * 60 * 1000)
    : null;
  const messages = cutoff ? allMessages.filter(m => new Date(m.created_at) > cutoff) : allMessages;
  const other = (conv as any).participants?.find((p: any) => p.id !== req.user!.id);
  res.json({
    id: conv.id,
    participants: (conv as any).participants?.map((p: any) => ({
      id: p.id, username: p.username, first_name: p.firstName, last_name: p.lastName, profile_picture: p.profilePicture,
    })),
    other_user: other ? { id: other.id, username: other.username, first_name: other.firstName, last_name: other.lastName, profile_picture: other.profilePicture } : null,
    disappearing_minutes: conv.disappearingMinutes,
    messages: messages.map(m => ({
      id: m.id,
      conversation: m.conversationId,
      sender: { id: (m as any).sender?.id, first_name: (m as any).sender?.firstName, profile_picture: (m as any).sender?.profilePicture },
      text: m.text,
      image: m.image,
      reply_to: (m as any).replyTo ? { id: (m as any).replyTo.id, text: (m as any).replyTo.text, image: (m as any).replyTo.image } : null,
      post: (m as any).post ? { id: (m as any).post.id, caption: (m as any).post.caption } : null,
      is_read: m.isRead,
      created_at: m.created_at,
    })),
    created_at: conv.created_at,
    updated_at: conv.updated_at,
  });
});

// Start a conversation / send message
router.post('/send/', authenticate, upload.single('image'), async (req: AuthRequest, res: Response) => {
  const receiver_id = Number(req.body.receiver_id);
  const text = req.body.text || (req.query.text as string) || '';
  const reply_to = req.body.reply_to || (req.query.reply_to as string);
  const post_id = req.body.post_id || (req.query.post_id as string);
  if (!receiver_id) { res.status(400).json({ error: 'receiver_id required' }); return; }

  // Find existing conversation
  const allConvs = await Conversation.findAll({
    include: [{
      model: User,
      as: 'participants',
      through: { attributes: [] },
    }],
  });
  let conv = allConvs.find(c =>
    (c as any).participants?.length === 2 &&
    (c as any).participants?.some((p: any) => p.id === req.user!.id) &&
    (c as any).participants?.some((p: any) => p.id === receiver_id)
  );

  if (!conv) {
    const friends = await areFriends(req.user!.id, receiver_id);
    conv = await Conversation.create({ isRequest: !friends } as any) as any;
    await (conv as any).setParticipants([req.user!.id, receiver_id]);
  }

  if (!conv) { res.status(500).json({ error: 'Failed to create conversation' }); return; }

  const msg = await Message.create({
    conversationId: conv.id,
    senderId: req.user!.id,
    text: text || '',
    image: req.file ? (await StorageService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'chat')) : (req.body.image_url || null),
    replyToId: reply_to ? Number(reply_to) : null,
    postId: post_id ? Number(post_id) : null,
  } as any);
  await conv.update({ updated_at: new Date() });

  const full = await Message.findByPk(msg.id, {
    include: [
      { model: User, as: 'sender', attributes: ['id', 'firstName', 'lastName', 'profilePicture'] },
      { model: Message, as: 'replyTo', attributes: ['id', 'text', 'image', 'senderId'] },
      { model: Post, as: 'post', attributes: ['id', 'caption'] },
    ],
  });

  const msgData = {
    id: msg.id,
    conversation: msg.conversationId,
    sender: { id: (full as any)?.sender?.id, first_name: (full as any)?.sender?.firstName, profile_picture: (full as any)?.sender?.profilePicture },
    text: msg.text,
    image: msg.image,
    reply_to: (full as any)?.replyTo ? { id: (full as any).replyTo.id, text: (full as any).replyTo.text, image: (full as any).replyTo.image } : null,
    post: (full as any)?.post ? { id: (full as any).post.id, caption: (full as any).post.caption } : null,
    is_read: msg.isRead,
    created_at: msg.created_at,
  };

  // Emit real-time events via Socket.IO
  const sio = getIO()
  console.log('[chat] emitting message:new', { convId: conv.id, receiver_id, sio: !!sio })
  sio?.to(`conversation:${conv.id}`).emit('message:new', msgData)
  sio?.to(`user:${receiver_id}`).emit('message:new', msgData)
  sio?.to(`user:${receiver_id}`).emit('conversation:updated', { conversationId: conv.id })

  // Create notification for the receiver
  const sender = req.user!
  const body = text ? (text.length > 100 ? text.slice(0, 100) + '...' : text) : (msg.image ? 'Sent a photo' : 'Sent a message')
  await createAndDeliverNotification({
    userId: Number(receiver_id),
    type: 'new_message',
    title: `${sender.firstName} ${sender.lastName}`,
    body,
    actorId: sender.id,
  });

  res.status(201).json(msgData);
});

// Send voice message
router.post('/send-voice/', authenticate, upload.single('voice'), async (req: AuthRequest, res: Response) => {
  const receiver_id = Number(req.body.receiver_id);
  if (!receiver_id) { res.status(400).json({ error: 'receiver_id required' }); return; }
  if (!req.file) { res.status(400).json({ error: 'voice file required' }); return; }

  // Find or create conversation (same logic as send route)
  const allConvs = await Conversation.findAll({
    include: [{
      model: User,
      as: 'participants',
      through: { attributes: [] },
    }],
  });
  let conv = allConvs.find(c =>
    (c as any).participants?.length === 2 &&
    (c as any).participants?.some((p: any) => p.id === req.user!.id) &&
    (c as any).participants?.some((p: any) => p.id === receiver_id)
  );

  if (!conv) {
    const { Op } = require('sequelize');
    const { Friend } = require('../models/Friend');
    const friends = await Friend.findOne({
      where: {
        [Op.or]: [
          { userId: req.user!.id, friendId: receiver_id },
          { userId: receiver_id, friendId: req.user!.id },
        ],
      },
    });
    conv = await Conversation.create({ isRequest: !friends } as any) as any;
    await (conv as any).setParticipants([req.user!.id, receiver_id]);
  }

  if (!conv) { res.status(500).json({ error: 'Failed to create conversation' }); return; }

  const msg = await Message.create({
    conversationId: conv.id,
    senderId: req.user!.id,
    text: '',
    audio: await StorageService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'voice'),
  } as any);
  await conv.update({ updated_at: new Date() });

  const msgData = {
    id: msg.id,
    conversation: msg.conversationId,
    sender: { id: req.user!.id },
    text: '',
    audio: msg.audio,
    image: null,
    reply_to: null,
    post: null,
    is_read: msg.isRead,
    created_at: msg.created_at,
  };

  const sio = getIO();
  sio?.to(`conversation:${conv.id}`).emit('message:new', msgData);
  sio?.to(`user:${receiver_id}`).emit('message:new', msgData);
  sio?.to(`user:${receiver_id}`).emit('conversation:updated', { conversationId: conv.id });

  res.status(201).json(msgData);
});

// Mark messages as read
router.post('/conversations/:id/read/', authenticate, async (req: AuthRequest, res: Response) => {
  const lastMsg = await Message.findOne({ where: { conversationId: Number(req.params.id) }, order: [['created_at', 'DESC']] });
  if (lastMsg) {
    await ConversationReadStatus.upsert({
      conversationId: parseInt(req.params.id as string),
      userId: req.user!.id,
      lastReadMessageId: lastMsg.id,
    } as any);
  }
  const sio = getIO()
  sio?.to(`conversation:${req.params.id}`).emit('message:read-receipt', {
    conversationId: parseInt(req.params.id as string),
    userId: req.user!.id,
  });
  // Also notify personal room so MessagesScreen gets the update
  sio?.to(`user:${req.user!.id}`).emit('conversation:updated', {
    conversationId: parseInt(req.params.id as string),
  });
  res.json({ detail: 'Read' });
});

// Initiate a call
router.post('/conversations/:id/call/initiate/', authenticate, async (req: AuthRequest, res: Response) => {
  const conv = await Conversation.findByPk(Number(req.params.id), {
    include: [{
      model: User,
      as: 'participants',
      through: { attributes: [] },
    }],
  });
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }
  const other = (conv as any).participants?.find((p: any) => p.id !== req.user!.id);
  if (!other) { res.status(400).json({ error: 'No other participant' }); return; }
  const callType = req.body.call_type || 'audio';
  const call = await Call.create({
    conversationId: conv.id,
    callerId: req.user!.id,
    calleeId: other.id,
    callType,
    status: 'missed',
  } as any);
  res.status(201).json({
    id: call.id,
    conversation: call.conversationId,
    caller: { id: req.user!.id },
    callee: { id: other.id },
    call_type: call.callType,
    status: call.status,
    created_at: call.created_at,
  });
});

// End a call
router.patch('/calls/:id/end/', authenticate, async (req: AuthRequest, res: Response) => {
  const call = await Call.findByPk(Number(req.params.id));
  if (!call) { res.status(404).json({ error: 'Call not found' }); return; }
  call.status = 'answered';
  call.endedAt = new Date();
  if (call.startedAt) {
    call.duration = Math.floor((new Date().getTime() - new Date(call.startedAt).getTime()) / 1000);
  }
  await call.save();
  res.json({ detail: 'Call ended' });
});

// Accept message request
router.post('/conversations/:id/accept-request/', authenticate, async (req: AuthRequest, res: Response) => {
  const conv = await Conversation.findByPk(Number(req.params.id));
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }
  const participants = await (conv as any).getParticipants();
  const other = participants.find((p: any) => p.id !== req.user!.id);
  if (!other) { res.status(400).json({ error: 'No other participant' }); return; }
  conv.isRequest = false;
  await conv.save();
  // Create mutual friendship
  const existing = await Friend.findOne({ where: { userId: req.user!.id, friendId: other.id } });
  if (!existing) {
    await Friend.create({ userId: req.user!.id, friendId: other.id } as any);
    await Friend.create({ userId: other.id, friendId: req.user!.id } as any);
  }
  const sio = getIO();
  sio?.to(`user:${req.user!.id}`).emit('conversation:updated', { conversationId: conv.id });
  sio?.to(`user:${other.id}`).emit('conversation:updated', { conversationId: conv.id });
  res.json({ detail: 'Request accepted' });
});

// Toggle disappearing messages
router.patch('/conversations/:id/disappearing/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conv = await Conversation.findByPk(Number(req.params.id));
    if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }
    const participants = await (conv as any).getParticipants();
    if (!participants.some((p: any) => p.id === req.user!.id)) {
      res.status(403).json({ error: 'Not a participant' }); return;
    }
    const minutes = req.body.minutes !== undefined ? Math.max(0, Number(req.body.minutes)) : 0;
    conv.disappearingMinutes = minutes;
    await conv.save();
    const sio = getIO();
    sio?.to(`conversation:${conv.id}`).emit('conversation:disappearing-update', {
      conversationId: conv.id,
      disappearingMinutes: minutes,
    });
    res.json({ disappearing_minutes: minutes });
  } catch (err: any) {
    console.error('[disappearing] error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Delete conversation (leave/remove for current user)
router.delete('/conversations/:id/', authenticate, async (req: AuthRequest, res: Response) => {
  const convId = Number(req.params.id);
  const conv = await Conversation.findByPk(convId);
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }

  // Remove the current user from participants
  const participants = await (conv as any).getParticipants();
  const isParticipant = participants.some((p: any) => p.id === req.user!.id);
  if (!isParticipant) { res.status(403).json({ error: 'Not a participant' }); return; }

  await (conv as any).removeParticipant(req.user!.id);
  res.status(204).send();
});

// Get call history
router.get('/calls/', authenticate, async (req: AuthRequest, res: Response) => {
  const calls = await Call.findAll({
    where: { [Op.or]: [{ callerId: req.user!.id }, { calleeId: req.user!.id }] },
    include: [
      { model: User, as: 'caller', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
      { model: User, as: 'callee', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'] },
    ],
    order: [['created_at', 'DESC']],
  });
  res.json(calls);
});

export default router;
