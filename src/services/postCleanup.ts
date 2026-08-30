import { Op } from 'sequelize';
import { Post } from '../models/Post';
import { PostPhoto } from '../models/PostPhoto';
import { PostLike } from '../models/PostLike';
import { Comment } from '../models/Comment';
import { Notification } from '../models/Notification';
import { StorageService } from './StorageService';

export const POST_TTL_MS = 24 * 60 * 60 * 1000;

export async function deleteExpiredPosts(): Promise<number> {
  const cutoff = new Date(Date.now() - POST_TTL_MS);
  const expired = await Post.findAll({
    where: { expiresAt: { [Op.lte]: cutoff } },
    attributes: ['id'],
    include: [{ model: PostPhoto, as: 'photos' }],
  });

  for (const post of expired) {
    for (const photo of (post as any).photos || []) {
      if (StorageService.isR2Url(photo.image)) {
        try {
          await StorageService.deleteFile(photo.image);
        } catch (err: any) {
          console.error('Failed to delete post media from R2:', err?.message || err);
        }
      }
    }
    await Notification.destroy({ where: { postId: post.id } });
    await PostLike.destroy({ where: { postId: post.id } });
    await Comment.destroy({ where: { postId: post.id } });
    await PostPhoto.destroy({ where: { postId: post.id } });
    await post.destroy();
  }

  if (expired.length > 0) {
    console.log(`Deleted ${expired.length} expired post(s) (older than 24h)`);
  }
  return expired.length;
}
