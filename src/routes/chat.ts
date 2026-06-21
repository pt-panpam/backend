import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { User } from '../models/User';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { ConversationReadStatus } from '../models/ConversationReadStatus';
import { Call } from '../models/Call';
import { AuthRequest, authenticate } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { getIO } from '../io';

const router = Router();

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
    conv = await Conversation.create() as any;
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
  const messages = await Message.findAll({
    where: { conversationId: conv.id },
    include: [{ model: User, as: 'sender', attributes: ['id', 'firstName', 'lastName', 'profilePicture'] }],
    order: [['created_at', 'ASC']],
  });
  const other = (conv as any).participants?.find((p: any) => p.id !== req.user!.id);
  res.json({
    id: conv.id,
    participants: (conv as any).participants?.map((p: any) => ({
      id: p.id, username: p.username, first_name: p.firstName, last_name: p.lastName, profile_picture: p.profilePicture,
    })),
    other_user: other ? { id: other.id, username: other.username, first_name: other.firstName, last_name: other.lastName, profile_picture: other.profilePicture } : null,
    messages: messages.map(m => ({
      id: m.id,
      conversation: m.conversationId,
      sender: { id: (m as any).sender?.id, first_name: (m as any).sender?.firstName, profile_picture: (m as any).sender?.profilePicture },
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
router.post('/send/', authenticate, upload.single('image'), async (req: AuthRequest, res: Response) => {
  const { receiver_id, text } = req.body;
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
    conv = await Conversation.create() as any;
    await (conv as any).setParticipants([req.user!.id, receiver_id]);
  }

  if (!conv) { res.status(500).json({ error: 'Failed to create conversation' }); return; }

  const msg = await Message.create({
    conversationId: conv.id,
    senderId: req.user!.id,
    text: text || '',
    image: req.file ? `/uploads/${req.file.filename}` : (req.body.image_url || null),
  } as any);
  await conv.update({ updated_at: new Date() });

  const full = await Message.findByPk(msg.id, {
    include: [{ model: User, as: 'sender', attributes: ['id', 'firstName', 'lastName', 'profilePicture'] }],
  });

  const msgData = {
    id: msg.id,
    conversation: msg.conversationId,
    sender: { id: (full as any)?.sender?.id, first_name: (full as any)?.sender?.firstName, profile_picture: (full as any)?.sender?.profilePicture },
    text: msg.text,
    image: msg.image,
    is_read: msg.isRead,
    created_at: msg.created_at,
  };

  // Emit real-time events via Socket.IO
  const sio = getIO()
  console.log('[chat] emitting message:new', { convId: conv.id, receiver_id, sio: !!sio })
  sio?.to(`conversation:${conv.id}`).emit('message:new', msgData)
  sio?.to(`user:${receiver_id}`).emit('message:new', msgData)
  sio?.to(`user:${receiver_id}`).emit('conversation:updated', { conversationId: conv.id })

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
