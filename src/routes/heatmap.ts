import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { HeatmapService } from '../services/location/HeatmapService';

const router = Router();

router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  const cells = await HeatmapService.getHeatmap();
  res.json({ results: cells });
});

export default router;
