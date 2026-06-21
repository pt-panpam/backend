import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { getIO } from '../io';

type NotificationType = Notification['type'];

interface CreateNotificationInput {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  actorId?: number | null;
  postId?: number | null;
}

function shouldSendPush(type: NotificationType, user: User): boolean {
  switch (type) {
    case 'post_like':
      return user.pushLikes;
    case 'post_comment':
      return user.pushComments;
    case 'friend_request':
    case 'friend_accepted':
      return user.pushFollows;
    case 'new_message':
      return user.pushMessages;
    case 'cross_event':
      return true;
    default:
      return true;
  }
}

async function serializeNotification(notification: Notification) {
  let actor = null;
  if (notification.actorId) {
    const user = await User.findByPk(notification.actorId, {
      attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
    });
    if (user) {
      actor = {
        id: user.id,
        username: user.username,
        first_name: user.firstName,
        last_name: user.lastName,
        profile_picture: user.profilePicture,
      };
    }
  }

  return {
    id: notification.id,
    user: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    actor,
    post: notification.postId,
    is_read: notification.isRead,
    created_at: notification.created_at,
  };
}

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
        channelId: 'default',
      }),
    });
    const result = (await response.json()) as { data?: { status?: string; message?: string }[] };
    if (result?.data?.[0]?.status === 'error') {
      console.warn('Expo push error:', result.data[0].message);
    }
  } catch (err: any) {
    console.warn('Failed to send push notification:', err.message);
  }
}

export async function createAndDeliverNotification(input: CreateNotificationInput): Promise<Notification | null> {
  const recipient = await User.findByPk(input.userId);
  if (!recipient || !recipient.isActive) return null;

  const notification = await Notification.create({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    actorId: input.actorId ?? null,
    postId: input.postId ?? null,
  } as any);

  const payload = await serializeNotification(notification);
  const io = getIO();

  if (io) {
    io.to(`user:${input.userId}`).emit('notification:new', payload);
  }

  if (recipient.expoPushToken && shouldSendPush(input.type, recipient)) {
    await sendExpoPush(recipient.expoPushToken, input.title, input.body, {
      notificationId: notification.id,
      type: input.type,
      postId: input.postId ?? null,
      actorId: input.actorId ?? null,
    });
  }

  return notification;
}
