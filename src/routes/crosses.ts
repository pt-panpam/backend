import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { User } from '../models/User';
import { CrossSettings } from '../models/CrossSettings';
import { CrossEvent } from '../models/CrossEvent';
import { Friend } from '../models/Friend';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();

// Get cross settings
router.get('/settings/', authenticate, async (req: AuthRequest, res: Response) => {
  let settings = await CrossSettings.findOne({ where: { userId: req.user!.id } });
  if (!settings) {
    settings = await CrossSettings.create({ userId: req.user!.id } as any);
  }
  res.json({
    reveal_schedule_hour_1: settings.revealScheduleHour1,
    reveal_schedule_hour_2: settings.revealScheduleHour2,
    reveal_delay_minutes: settings.revealDelayMinutes,
    updated_at: settings.updated_at,
    can_change: settings.canChange(),
  });
});

// Update cross settings
router.patch('/settings/', authenticate, async (req: AuthRequest, res: Response) => {
  let settings = await CrossSettings.findOne({ where: { userId: req.user!.id } });
  if (!settings) {
    settings = await CrossSettings.create({ userId: req.user!.id } as any);
  }
  if (!settings.canChange()) {
    res.status(400).json({ error: 'Cannot change settings yet. 10-day cooldown applies.' });
    return;
  }
  if (req.body.reveal_schedule_hour_1 !== undefined) settings.revealScheduleHour1 = req.body.reveal_schedule_hour_1;
  if (req.body.reveal_schedule_hour_2 !== undefined) settings.revealScheduleHour2 = req.body.reveal_schedule_hour_2;
  if (req.body.reveal_delay_minutes !== undefined) settings.revealDelayMinutes = req.body.reveal_delay_minutes;
  await settings.save();
  res.json({
    reveal_schedule_hour_1: settings.revealScheduleHour1,
    reveal_schedule_hour_2: settings.revealScheduleHour2,
    reveal_delay_minutes: settings.revealDelayMinutes,
    updated_at: settings.updated_at,
    can_change: settings.canChange(),
  });
});

// Get cross events
router.get('/events/', authenticate, async (req: AuthRequest, res: Response) => {
  const events = await CrossEvent.findAll({
    where: {
      [Op.or]: [{ user1Id: req.user!.id }, { user2Id: req.user!.id }],
    },
    order: [['crossed_at', 'DESC']],
    limit: 50,
  });

  const results = await Promise.all(events.map(async e => {
    const otherId = e.user1Id === req.user!.id ? e.user2Id : e.user1Id;
    const other = await User.findByPk(otherId);
    const isFriend = other ? !!(await Friend.findOne({ where: { userId: req.user!.id, friendId: other.id } })) : false;

    // Jitter for non-participants
    let displayLat = e.latitude;
    let displayLng = e.longitude;
    if (!isFriend) {
      displayLat = e.latitude + (Math.random() - 0.5) * 0.02;
      displayLng = e.longitude + (Math.random() - 0.5) * 0.02;
    }

    return {
      id: e.id,
      other_user: other ? {
        id: other.id,
        username: other.username,
        first_name: other.firstName,
        last_name: other.lastName,
        profile_picture: other.profilePicture,
        age: other.age,
        location: other.location,
      } : null,
      latitude: e.latitude,
      longitude: e.longitude,
      display_latitude: displayLat,
      display_longitude: displayLng,
      crossed_at: e.crossedAt,
      published: e.published,
    };
  }));

  res.json({ results });
});

// Publish cross events for review window
router.post('/publish/', authenticate, async (req: AuthRequest, res: Response) => {
  const events = await CrossEvent.findAll({
    where: { published: false },
  });
  for (const e of events) {
    e.published = true;
    await e.save();
  }
  res.json({ detail: 'Published' });
});

// Report a cross (create)
router.post('/report/', authenticate, async (req: AuthRequest, res: Response) => {
  const { user_id, latitude, longitude } = req.body;
  if (!user_id || !latitude || !longitude) {
    res.status(400).json({ error: 'user_id, latitude, and longitude required' });
    return;
  }
  const event = await CrossEvent.create({
    user1Id: req.user!.id,
    user2Id: user_id,
    latitude,
    longitude,
    published: true,
  } as any);
  res.status(201).json({ id: event.id, detail: 'Cross reported' });
});

export default router;
