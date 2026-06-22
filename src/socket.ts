import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env';
import { User } from './models/User';
import { Conversation } from './models/Conversation';
import { Message } from './models/Message';
import { Post } from './models/Post';
import { ConversationReadStatus } from './models/ConversationReadStatus';
import { Friend } from './models/Friend';
import { createAndDeliverNotification } from './services/NotificationService';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  username?: string;
}

export function setupSocket(server: HTTPServer): Server {
  const io = new Server(server, {
    cors: {
      origin: env.CORS_ORIGINS,
      credentials: true,
    },
  });

  // Track online users: userId -> Set<socketId>
  const onlineUsers = new Map<number, Set<string>>();

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const decoded = jwt.verify(token as string, env.JWT_SECRET) as { userId: number };
      const user = await User.findByPk(decoded.userId);
      if (!user || !user.isActive) {
        return next(new Error('Invalid user'));
      }
      socket.userId = user.id;
      socket.username = user.username;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;

    // Track online status
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    // Join personal room for direct messages
    socket.join(`user:${userId}`);

    // Broadcast online status
    io.emit('user:online', { userId });

    // Join conversation rooms
    socket.on('conversation:join', (conversationId: number) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('conversation:leave', (conversationId: number) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Send message
    socket.on('message:send', async (data: { conversationId?: number; receiverId?: number; text?: string; image?: string; reply_to?: number; post_id?: number }, callback) => {
      try {
        let convId = data.conversationId;

        if (!convId && data.receiverId) {
          // Find or create conversation
          const allConvs = await Conversation.findAll({
            include: [{
              model: User,
              as: 'participants',
              through: { attributes: [] },
            }],
          });
          const existing = allConvs.find(c =>
            (c as any).participants?.length === 2 &&
            (c as any).participants?.some((p: any) => p.id === userId) &&
            (c as any).participants?.some((p: any) => p.id === data.receiverId)
          );
          if (existing) {
            convId = existing.id;
          } else {
            const friends = !!(await Friend.findOne({ where: { userId, friendId: data.receiverId } }));
            const conv = await Conversation.create({ isRequest: !friends } as any) as any;
            await (conv as any).setParticipants([userId, data.receiverId]);
            convId = conv.id;
          }
        }

        if (!convId) {
          callback?.({ error: 'No conversation specified' });
          return;
        }

        const msg = await Message.create({
          conversationId: convId,
          senderId: userId,
          text: data.text || '',
          image: data.image || null,
          replyToId: data.reply_to || null,
          postId: data.post_id || null,
        } as any);

        await Conversation.update({ updated_at: new Date() }, { where: { id: convId } });

        const full = await Message.findByPk(msg.id, {
          include: [
            { model: User, as: 'sender', attributes: ['id', 'firstName', 'lastName', 'profilePicture'] },
            { model: Message, as: 'replyTo', attributes: ['id', 'text', 'image', 'senderId'] },
            { model: Post, as: 'post', attributes: ['id', 'caption'] },
          ],
        });

        const messageData = {
          id: msg.id,
          conversation: convId,
          sender: {
            id: (full as any)?.sender?.id,
            first_name: (full as any)?.sender?.firstName,
            profile_picture: (full as any)?.sender?.profilePicture,
          },
          text: msg.text,
          image: msg.image,
          reply_to: (full as any)?.replyTo ? { id: (full as any).replyTo.id, text: (full as any).replyTo.text, image: (full as any).replyTo.image } : null,
          post: (full as any)?.post ? { id: (full as any).post.id, caption: (full as any).post.caption } : null,
          is_read: msg.isRead,
          created_at: msg.created_at,
        };

        // Emit to conversation room
        io.to(`conversation:${convId}`).emit('message:new', messageData);

        // Also emit to receiver's personal room
        if (data.receiverId) {
          io.to(`user:${data.receiverId}`).emit('message:new', messageData);
          io.to(`user:${data.receiverId}`).emit('conversation:updated', { conversationId: convId });

          // Create notification
          const sender = await User.findByPk(userId, { attributes: ['id', 'firstName', 'lastName'] });
          if (sender) {
            const body = data.text
              ? (data.text.length > 100 ? data.text.slice(0, 100) + '...' : data.text)
              : (data.image ? 'Sent a photo' : 'Sent a message');
            await createAndDeliverNotification({
              userId: data.receiverId,
              type: 'new_message',
              title: `${sender.firstName} ${sender.lastName}`,
              body,
              actorId: userId,
            });
          }
        }

        callback?.({ success: true, message: messageData });
      } catch (err: any) {
        callback?.({ error: err.message });
      }
    });

    // Mark messages as read
    socket.on('message:read', async (data: { conversationId: number }) => {
      try {
        const lastMsg = await Message.findOne({
          where: { conversationId: data.conversationId },
          order: [['created_at', 'DESC']],
        });
        if (lastMsg) {
          await ConversationReadStatus.upsert({
            conversationId: data.conversationId,
            userId,
            lastReadMessageId: lastMsg.id,
          } as any);
        }
        io.to(`conversation:${data.conversationId}`).emit('message:read-receipt', {
          conversationId: data.conversationId,
          userId,
        });
      } catch (err: any) {
        console.error('Error marking read:', err.message);
      }
    });

    // Typing indicators
    socket.on('typing:start', (data: { conversationId: number }) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
        conversationId: data.conversationId,
        userId,
        username: socket.username,
      });
    });

    socket.on('typing:stop', (data: { conversationId: number }) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
        conversationId: data.conversationId,
        userId,
      });
    });

    // Call signaling
    socket.on('call:offer', (data: { calleeId: number; offer: any }) => {
      io.to(`user:${data.calleeId}`).emit('call:offer', {
        callerId: userId,
        callerUsername: socket.username,
        offer: data.offer,
      });
    });

    socket.on('call:answer', (data: { callerId: number; answer: any }) => {
      io.to(`user:${data.callerId}`).emit('call:answer', {
        calleeId: userId,
        answer: data.answer,
      });
    });

    socket.on('call:ice-candidate', (data: { userId: number; candidate: any }) => {
      io.to(`user:${data.userId}`).emit('call:ice-candidate', {
        from: userId,
        candidate: data.candidate,
      });
    });

    socket.on('call:end', (data: { userId: number }) => {
      io.to(`user:${data.userId}`).emit('call:end', { userId });
    });

    // Cross detection — subscribe to real-time crossing events
    socket.on('cross:subscribe', () => {
      socket.join(`cross:${userId}`);
    });

    socket.on('cross:unsubscribe', () => {
      socket.leave(`cross:${userId}`);
    });

    // Start location sharing (periodic location push from client)
    socket.on('location:start', () => {
      socket.join(`location:${userId}`);
      io.emit('location:sharing-started', { userId });
    });

    socket.on('location:stop', () => {
      socket.leave(`location:${userId}`);
      io.emit('location:sharing-stopped', { userId });
    });

    // Client sends location update via WS (alternative to REST)
    socket.on('location:update', async (data: { latitude: number; longitude: number }) => {
      try {
        const { H3Service } = await import('./services/location/H3Service');
        const { CrossingService } = await import('./services/location/CrossingService');
        const hexId = H3Service.latLngToHex(data.latitude, data.longitude);
        const crossing = CrossingService.getInstance();
        const result = await crossing.updateLocation(userId, data.latitude, data.longitude);
        // Echo back to sender
        socket.emit('location:updated', {
          hex_id: result.hexId,
          crossing_detected: result.crossingDetected,
          crossed_with: result.crossedWith,
        });
      } catch (err: any) {
        console.error('location:update error:', err.message);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit('user:offline', { userId });
        }
      }
    });
  });

  return io;
}
