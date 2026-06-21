import { Router, Response } from 'express';
import { User } from '../models/User';
import { AuthRequest, authenticate } from '../middleware/auth';
import { CrossingService } from '../services/location/CrossingService';
import { H3Service } from '../services/location/H3Service';
import { RouteService } from '../services/location/RouteService';

const router = Router();

// Update user location
router.post('/update/', authenticate, async (req: AuthRequest, res: Response) => {
  const { latitude, longitude } = req.body;

  if (latitude === undefined || longitude === undefined) {
    res.status(400).json({ error: 'latitude and longitude are required' });
    return;
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: 'Invalid coordinates' });
    return;
  }

  const hexId = H3Service.latLngToHex(lat, lng);
  const neighbors = H3Service.getNeighborHexes(hexId, 1);

  const crossingService = CrossingService.getInstance();
  const result = await crossingService.updateLocation(req.user!.id, lat, lng);

  res.json({
    detail: 'Location updated',
    hex_id: result.hexId,
    neighbor_hexes: neighbors,
    crossing_detected: result.crossingDetected,
    crossed_with: result.crossedWith,
  });
});

// Get recent crossing events
router.get('/crosses/', authenticate, async (req: AuthRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const crossingService = CrossingService.getInstance();
  const events = await crossingService.getRecentCrosses(req.user!.id, limit);
  res.json({ results: events });
});

// Get user's route history (last 24h)
router.get('/route/', authenticate, async (req: AuthRequest, res: Response) => {
  const routeService = RouteService.getInstance();
  if (!routeService.isAvailable()) {
    res.json({ results: [], message: 'Route storage unavailable. Configure PostgreSQL/TimescaleDB.' });
    return;
  }
  const crossingService = CrossingService.getInstance();
  const route = await crossingService.getUserRoute(req.user!.id);
  res.json({ results: route });
});

// Get other user's route (if friends)
router.get('/route/:userId/', authenticate, async (req: AuthRequest, res: Response) => {
  const otherId = parseInt(req.params.userId as string);
  if (isNaN(otherId)) { res.status(400).json({ error: 'Invalid user ID' }); return; }

  const { Friend } = require('../models/Friend');
  const { Op } = require('sequelize');
  const isFriend = await Friend.findOne({
    where: {
      [Op.or]: [
        { userId: req.user!.id, friendId: otherId },
        { userId: otherId, friendId: req.user!.id },
      ],
    },
  });
  if (!isFriend) {
    res.status(403).json({ error: 'You can only view routes of friends' });
    return;
  }

  const routeService = RouteService.getInstance();
  if (!routeService.isAvailable()) {
    res.json({ results: [] });
    return;
  }
  const points = await routeService.getUserRoute(otherId);
  res.json({ results: points });
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

// Check if at same location as another user
router.get('/check/:userId/', authenticate, async (req: AuthRequest, res: Response) => {
  const otherId = parseInt(req.params.userId as string);
  if (isNaN(otherId)) { res.status(400).json({ error: 'Invalid user ID' }); return; }

  const { RedisService } = require('../services/location/RedisService');
  const redis = RedisService.getInstance();

  if (!redis.isAvailable()) {
    res.json({ error: 'Redis unavailable — cannot check in real time' });
    return;
  }

  const myHex = await redis.getUserHex(req.user!.id);
  const otherHex = await redis.getUserHex(otherId);

  res.json({
    same_hex: myHex === otherHex && myHex !== null,
    my_hex: myHex,
    other_hex: otherHex,
    other_online: otherHex !== null,
  });
});

// Toggle live location sharing
router.post('/live/toggle/', authenticate, async (req: AuthRequest, res: Response) => {
  const { enabled } = req.body;
  const user = await User.findByPk(req.user!.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  user.isLive = enabled === true;
  await user.save();
  res.json({ detail: `Live location ${enabled ? 'enabled' : 'disabled'}`, is_live: user.isLive });
});

// Get live status
router.get('/live/status/', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await User.findByPk(req.user!.id);
  res.json({ is_live: user?.isLive || false });
});

export default router;
