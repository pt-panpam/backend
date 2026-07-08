import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { SafeZoneService } from '../services/location/SafeZoneService';

const router = Router();

// Get all safe zones for current user
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const service = SafeZoneService.getInstance();
  const zones = await service.getUserSafeZones(req.user!.id);
  res.json({ results: zones });
});

// Create a safe zone
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { latitude, longitude, radius_km, label } = req.body;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    res.status(400).json({ error: 'latitude and longitude (numbers) required' });
    return;
  }
  const service = SafeZoneService.getInstance();
  const zone = await service.createSafeZone(
    req.user!.id,
    latitude,
    longitude,
    radius_km ?? 5,
    label ?? '',
  );
  res.status(201).json(zone);
});

// Update a safe zone
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const { latitude, longitude, radius_km, label, is_active } = req.body;
  const service = SafeZoneService.getInstance();
  const updates: any = {};
  if (latitude !== undefined) updates.latitude = latitude;
  if (longitude !== undefined) updates.longitude = longitude;
  if (radius_km !== undefined) updates.radiusKm = radius_km;
  if (label !== undefined) updates.label = label;
  if (is_active !== undefined) updates.isActive = is_active;
  const zone = await service.updateSafeZone(id, req.user!.id, updates);
  if (!zone) {
    res.status(404).json({ error: 'Safe zone not found' });
    return;
  }
  res.json(zone);
});

// Delete a safe zone
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const service = SafeZoneService.getInstance();
  const deleted = await service.deleteSafeZone(id, req.user!.id);
  if (!deleted) {
    res.status(404).json({ error: 'Safe zone not found' });
    return;
  }
  res.json({ detail: 'Safe zone deleted' });
});

// Check if current location is in any safe zone
router.post('/check/', authenticate, async (req: AuthRequest, res: Response) => {
  const { latitude, longitude } = req.body;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    res.status(400).json({ error: 'latitude and longitude (numbers) required' });
    return;
  }
  const service = SafeZoneService.getInstance();
  const inZone = await service.isInSafeZone(req.user!.id, latitude, longitude);
  res.json({ in_safe_zone: inZone });
});

export default router;
