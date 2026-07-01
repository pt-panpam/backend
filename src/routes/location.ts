import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { CrossingService } from '../services/location/CrossingService';
import { H3Service } from '../services/location/H3Service';
import { RouteService } from '../services/location/RouteService';

const router = Router();

// Get recent crossing events (last 24h)
router.get('/crosses/', authenticate, async (req: AuthRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const crossingService = CrossingService.getInstance();
  const events = await crossingService.getRecentCrosses(req.user!.id, limit);
  res.json({ results: events });
});

// Get user's route history (optional ?days=N, default 3)
router.get('/route/', authenticate, async (req: AuthRequest, res: Response) => {
  const routeService = RouteService.getInstance();
  if (!routeService.isAvailable()) {
    res.json({ results: [], message: 'Route storage unavailable.' });
    return;
  }
  const days = Math.min(parseInt(req.query.days as string) || 3, 3);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const points = await routeService.getUserRoute(req.user!.id, since);
  res.json({
    results: points.map(p => ({
      latitude: p.latitude,
      longitude: p.longitude,
      hex_id: p.hexId,
      recorded_at: p.recordedAt,
    })),
  });
});

// Get hex boundary (for map overlay)
router.get('/hex/:hexId/boundary/', async (req: AuthRequest, res: Response) => {
  try {
    const boundary = H3Service.hexToBoundary(req.params.hexId as string);
    const center = H3Service.hexToCenter(req.params.hexId as string);
    res.json({ hex_id: req.params.hexId, boundary, center });
  } catch (err: any) {
    res.status(400).json({ error: `Invalid hex ID: ${err.message}` });
  }
});

// Get hex boundaries for multiple hex IDs (batch for map overlay)
router.post('/hex-boundaries/', authenticate, async (req: AuthRequest, res: Response) => {
  const { hex_ids } = req.body;
  if (!Array.isArray(hex_ids) || hex_ids.length === 0) {
    res.status(400).json({ error: 'hex_ids array is required' });
    return;
  }
  const results = hex_ids.map((hexId: string) => {
    try {
      const boundary = H3Service.hexToBoundary(hexId);
      const center = H3Service.hexToCenter(hexId);
      return { hex_id: hexId, boundary, center };
    } catch {
      return { hex_id: hexId, boundary: [], center: null };
    }
  });
  res.json({ results });
});

// Convert GPS to hex
router.get('/to-hex/', async (req: AuthRequest, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: 'lat and lng query params required' });
    return;
  }
  const hexId = H3Service.latLngToHex(lat, lng);
  const neighbors = H3Service.getNeighborHexes(hexId, 1);
  const boundary = H3Service.hexToBoundary(hexId);
  res.json({ hex_id: hexId, neighbors, boundary, lat, lng });
});

// Dashboard stats
router.get('/stats/', authenticate, async (req: AuthRequest, res: Response) => {
  const crossingService = CrossingService.getInstance();
  const stats = await crossingService.getDashboardStats(req.user!.id);
  res.json(stats);
});

// Update user location (triggers cross detection)
router.post('/update/', authenticate, async (req: AuthRequest, res: Response) => {
  const { latitude, longitude } = req.body;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    res.status(400).json({ error: 'latitude and longitude (numbers) required' });
    return;
  }
  try {
    const crossingService = CrossingService.getInstance();
    const result = await crossingService.updateLocation(req.user!.id, latitude, longitude);
    res.json(result);
  } catch (err: any) {
    console.error('Location update error:', err);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// Batch update user locations (receives array of points, all inserted at once)
router.post('/update/batch/', authenticate, async (req: AuthRequest, res: Response) => {
  const { points } = req.body;
  if (!Array.isArray(points) || points.length === 0) {
    res.status(400).json({ error: 'points array required with at least one entry' });
    return;
  }
  // Validate each point
  for (const p of points) {
    if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number' || typeof p.recorded_at !== 'string') {
      res.status(400).json({ error: 'Each point must have latitude (number), longitude (number), and recorded_at (string)' });
      return;
    }
  }
  try {
    const crossingService = CrossingService.getInstance();
    const result = await crossingService.updateLocationBatch(req.user!.id, points);
    res.json(result);
  } catch (err: any) {
    console.error('Batch location update error:', err);
    res.status(500).json({ error: 'Failed to batch update location' });
  }
});

export default router;
