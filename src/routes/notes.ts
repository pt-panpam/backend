import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { NoteService } from '../services/location/NoteService';

const router = Router();

router.post('/drop/', authenticate, async (req: AuthRequest, res: Response) => {
  const { text, latitude, longitude, discovery_radius_m } = req.body;
  if (typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'text (string) required' });
    return;
  }
  if (text.trim().length > 200) {
    res.status(400).json({ error: 'text must be 200 characters or less' });
    return;
  }
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    res.status(400).json({ error: 'latitude and longitude (numbers) required' });
    return;
  }
  const service = NoteService.getInstance();
  const note = await service.dropNote(
    req.user!.id,
    text.trim(),
    latitude,
    longitude,
    discovery_radius_m ?? 50,
  );
  res.status(201).json({
    id: note.id,
    text: note.text,
    latitude: note.latitude,
    longitude: note.longitude,
    published_at: note.publishedAt,
  });
});

router.get('/nearby/', authenticate, async (req: AuthRequest, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const radiusM = parseFloat((req.query.radius_m as string) || '50');
  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: 'lat and lng query params required' });
    return;
  }
  const service = NoteService.getInstance();
  const notes = await service.getNearbyNotes(lat, lng, radiusM);
  res.json({
    results: notes.map((n) => ({
      id: n.id,
      text: n.text,
      latitude: n.latitude,
      longitude: n.longitude,
      upvote_count: n.upvoteCount,
      created_at: n.created_at,
    })),
  });
});

router.get('/mine/', authenticate, async (req: AuthRequest, res: Response) => {
  const service = NoteService.getInstance();
  const notes = await service.getMyNotes(req.user!.id);
  res.json({
    results: notes.map((n) => ({
      id: n.id,
      text: n.text,
      latitude: n.latitude,
      longitude: n.longitude,
      published_at: n.publishedAt,
      upvote_count: n.upvoteCount,
      created_at: n.created_at,
    })),
  });
});

router.post('/:id/upvote/', authenticate, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const service = NoteService.getInstance();
    const { note, alreadyVoted } = await service.upvoteNote(id, req.user!.id);
    res.json({
      id: note.id,
      upvote_count: note.upvoteCount,
      already_voted: alreadyVoted,
    });
  } catch (e: any) {
    if (e.message === 'Note not found') {
      res.status(404).json({ error: 'Note not found' });
    } else if (e.message === 'Cannot upvote own note') {
      res.status(400).json({ error: 'Cannot upvote your own note' });
    } else {
      res.status(500).json({ error: 'Internal error' });
    }
  }
});

export default router;
