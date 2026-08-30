import http from 'http';
import { env } from './config/env';
import { sequelize, initDatabase } from './config/database';
import { initModels } from './models';
import { RedisService } from './services/location/RedisService';
import { CrossingService } from './services/location/CrossingService';
import { runProximityMigrations } from './services/location/pgDb';
import { startOutboxWorker } from './services/location/OutboxWorker';
import { startNotificationQueue } from './services/location/NotificationQueue';
import { CrossEvent } from './models/CrossEvent';
import { Op } from 'sequelize';
import { StorageService } from './services/StorageService';
import { Post } from './models/Post';
import { PostPhoto } from './models/PostPhoto';
import { PostLike } from './models/PostLike';
import { Comment } from './models/Comment';
import { Notification } from './models/Notification';
import { Note } from './models/Note';
import { NoteVote } from './models/NoteVote';
import { pool } from './services/location/pgDb';
import { EncounterService } from './services/location/EncounterService';
import { ProximityService } from './services/location/ProximityService';

async function startWorker() {
  try {
    initModels(sequelize);
    await initDatabase();

    const redis = RedisService.getInstance();
    await redis.connect();

    CrossingService.getInstance().setIO(null as any);

    await runProximityMigrations();
    startOutboxWorker();
    startNotificationQueue();

    console.log('🔧 Worker: cron jobs started');

    // 1. Cleanup old cross events every hour (retention: 3 days)
    setInterval(() => {
      CrossEvent.destroy({
        where: { crossedAt: { [Op.lt]: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } },
      }).catch(() => {});
    }, 3600000);

    // [REMOVED: The 9 AM / 9 PM static recap worker. Unlocks are now dynamically handled at pair unlock_at via BullMQ].

    // 2. Expired posts & chat media cleanup from R2 — every 10 minutes
    setInterval(async () => {
      try {
        const expiredPosts = await Post.findAll({
          where: { expiresAt: { [Op.lt]: new Date() } },
        });
        for (const post of expiredPosts) {
          const photos = await PostPhoto.findAll({ where: { postId: post.id } });
          for (const photo of photos) {
            if (StorageService.isR2Url(photo.image)) {
              await StorageService.deleteFile(photo.image);
            }
          }
          await Notification.destroy({ where: { postId: post.id } });
          await PostLike.destroy({ where: { postId: post.id } });
          await Comment.destroy({ where: { postId: post.id } });
          await PostPhoto.destroy({ where: { postId: post.id } });
          await post.destroy();
        }

        if (expiredPosts.length > 0) {
          console.log(`🧹 Cleaned up ${expiredPosts.length} expired posts from R2 & DB`);
        }
      } catch (err) {
        console.error('🧹 Cleanup worker error:', err);
      }
    }, 600000);

    // 3. Expired notes cleanup — every 10 minutes
    setInterval(async () => {
      try {
        const expiredNotes = await Note.findAll({
          where: { expiresAt: { [Op.lt]: new Date() } },
        });
        for (const note of expiredNotes) {
          await NoteVote.destroy({ where: { noteId: note.id } });
          await note.destroy();
        }

        if (expiredNotes.length > 0) {
          console.log(`🧹 Cleaned up ${expiredNotes.length} expired notes from DB`);
        }
      } catch (err) {
        console.error('🧹 Note cleanup worker error:', err);
      }
    }, 600000);

    // 4. Delete stale presences (users who stopped sending updates) — every 2 minutes.
    //    Only current/live users keep a presence row; anyone not heard from recently is removed
    //    so they never appear as "in the hexagon". Rows referenced by encounters are kept.
    setInterval(async () => {
      try {
        const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
        const res = await pool.query(
          `DELETE FROM presences p
           WHERE p.left_at IS NULL AND p.last_seen_at < $1
             AND NOT EXISTS (
               SELECT 1 FROM encounters e
               WHERE e.presence_a = p.id OR e.presence_b = p.id
             )`,
          [staleBefore],
        );
        if (res.rowCount && res.rowCount > 0) {
          console.log(`🧹 Deleted ${res.rowCount} stale presences`);
        }
      } catch (err) {
        console.error('🧹 Presence cleanup worker error:', err);
      }
    }, 120000);

    // 5. Background same-hex monitor — every 30 seconds.
    //    Reads the live Redis hex membership (one current hex per user), and for every hex
    //    with 2+ occupants triggers cross detection + notification via EncounterService
    //    (delay minutes -> notification queue -> CrossEvent).
    setInterval(async () => {
      try {
        const hexes = await ProximityService.getInstance().getHexesWithOccupants();
        let crosses = 0;
        for (const hex of hexes) {
          if (hex.occupantIds.length >= 2) {
            const found = await EncounterService.getInstance().checkHexCrossings(hex.hexId, hex.occupantIds);
            crosses += found.length;
          }
        }
        if (crosses > 0) {
          console.log(`🔔 Same-hex monitor confirmed ${crosses} crossing(s)`);
        }
      } catch (err) {
        console.error('🔔 Same-hex monitor error:', err);
      }
    }, 30000);
  } catch (err) {
    console.error('Failed to start worker:', err);
    process.exit(1);
  }
}

startWorker();