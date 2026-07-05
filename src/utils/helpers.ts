import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { env } from '../config/env';
import { User } from '../models/User';
import { CrossEvent } from '../models/CrossEvent';
import { Friend } from '../models/Friend';
import { FriendRequest } from '../models/FriendRequest';

export function generateTokens(user: User): { access: string; refresh: string } {
  const payload = { userId: user.id, email: user.email };
  const access = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any });
  const refresh = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN as any });
  return { access, refresh };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function serializeUser(user: User, currentUserId?: number) {
  const [total_crosses, friend_count, is_friend, friend_request_status] = await Promise.all([
    CrossEvent.count({ where: { [Op.or]: [{ user1Id: user.id }, { user2Id: user.id }], published: true } }),
    Friend.count({ where: { [Op.or]: [{ userId: user.id }, { friendId: user.id }] } }),
    currentUserId ? Friend.findOne({ where: { [Op.or]: [{ userId: currentUserId, friendId: user.id }, { userId: user.id, friendId: currentUserId }] } }).then(Boolean) : Promise.resolve(false),
    currentUserId ? FriendRequest.findOne({ where: { [Op.or]: [{ fromUserId: currentUserId, toUserId: user.id }, { fromUserId: user.id, toUserId: currentUserId }], status: 'pending' } }).then((fr) => fr ? (fr.fromUserId === currentUserId ? 'sent' : 'received') : null) : Promise.resolve(null),
  ]);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    first_name: user.firstName,
    last_name: user.lastName,
    profile_picture: user.profilePicture,
    date_of_birth: user.dateOfBirth,
    age: user.age,
    sex: user.sex,
    bio: user.bio,
    school: user.school || null,
    work: user.work || null,
    location: user.location,
    latitude: user.latitude,
    longitude: user.longitude,
    hobbies: user.hobbies,
    looking_for: user.lookingFor,
    onboarding_complete: user.onboardingComplete,
    is_private: user.isPrivate,
    show_online_status: user.showOnlineStatus,
    read_receipts: user.readReceipts,
    last_seen: user.lastSeen,
    created_at: user.created_at,
    total_crosses,
    friend_count,
    is_friend,
    friend_request_status,
    phone_number: user.phoneNumber,
    who_can_message: user.whoCanMessage,
    who_can_see_posts: user.whoCanSeePosts,
    story_visibility: user.storyVisibility,
    friend_request_mode: user.friendRequestMode,
    theme: user.theme,
    language: user.language,
    data_saver: user.dataSaver,
    school_work_visibility: user.schoolWorkVisibility,
    dob_visibility: user.dobVisibility,
    sex_visibility: user.sexVisibility,
    looking_for_visibility: user.lookingForVisibility,
    hobbies_visibility: user.hobbiesVisibility,
    phone_visibility: user.phoneVisibility,
  };
}

export function serializePost(post: any, currentUserId?: number) {
  return {
    id: post.id,
    user: post.user ? {
      id: post.user.id,
      username: post.user.username,
      first_name: post.user.firstName,
      last_name: post.user.lastName,
      profile_picture: post.user.profilePicture,
    } : { id: post.userId },
    caption: post.caption,
    location: post.location,
    latitude: post.latitude,
    longitude: post.longitude,
    photos: (post.photos || []).map((p: any) => ({
      id: p.id,
      image: p.image,
      order: p.order,
      type: p.type || 'photo',
    })),
    like_count: post.likeCount || 0,
    has_liked: post.hasLiked || false,
    is_expired: post.expiresAt ? new Date(post.expiresAt).getTime() <= Date.now() : false,
    is_saved: post.isSaved || false,
    is_active: post.isActive,
    created_at: post.created_at,
    expires_at: post.expiresAt,
  };
}
