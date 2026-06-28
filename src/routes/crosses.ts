import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { User } from '../models/User';
import { CrossSettings } from '../models/CrossSettings';
import { CrossEvent } from '../models/CrossEvent';
import { Friend } from '../models/Friend';
import { AuthRequest, authenticate } from '../middleware/auth';
import { CrossingService } from '../services/location/CrossingService';

const router = Router();

// Get cross settings
router.get('/settings/', authenticate, async (req: AuthRequest, res: Response) => {
  let settings = await CrossSettings.findOne({ where: { userId: req.user!.id } });
  if (!settings) {
    settings = await CrossSettings.create({ userId: req.user!.id } as any);
  }
  const service = CrossingService.getInstance();
  res.json({
    reveal_schedule_hour_1: settings.revealScheduleHour1,
    reveal_schedule_hour_2: settings.revealScheduleHour2,
    updated_at: settings.updated_at,
    can_change: settings.canChange(),
    next_reveal_at: service.getNextRevealLabel({ hour1: settings.revealScheduleHour1, hour2: settings.revealScheduleHour2 }),
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
  await settings.save();
  const service = CrossingService.getInstance();
  res.json({
    reveal_schedule_hour_1: settings.revealScheduleHour1,
    reveal_schedule_hour_2: settings.revealScheduleHour2,
    updated_at: settings.updated_at,
    can_change: settings.canChange(),
    next_reveal_at: service.getNextRevealLabel({ hour1: settings.revealScheduleHour1, hour2: settings.revealScheduleHour2 }),
  });
});

// Get cross events (optional ?date=YYYY-MM-DD for specific day, else last 24h)
router.get('/events/', authenticate, async (req: AuthRequest, res: Response) => {
  const service = CrossingService.getInstance();
  const { date } = req.query;
  if (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const events = await service.getEventsByDate(req.user!.id, date);
    res.json({ results: events });
    return;
  }
  const events = await service.getRecentCrosses(req.user!.id, 50, 24);
  res.json({ results: events });
});

// Get recap history (grouped by day, last 15 days)
router.get('/recap-history/', authenticate, async (req: AuthRequest, res: Response) => {
  const service = CrossingService.getInstance();
  const recap = await service.getRecapHistory(req.user!.id);
  res.json({ results: recap });
});

// Get route timeline (private, last 24h)
router.get('/timeline/', authenticate, async (req: AuthRequest, res: Response) => {
  const service = CrossingService.getInstance();
  const timeline = await service.getRouteTimeline(req.user!.id);
  res.json({ results: timeline });
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
