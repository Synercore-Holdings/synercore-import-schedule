import { Router, Request, Response } from 'express';
import { ShipmentViewRepository } from '../db/repositories/ShipmentViewRepository.ts';

const router = Router();

/**
 * GET /api/shipment-views/mine
 * The current user's last-viewed timestamp for every shipment they've opened.
 */
router.get('/mine', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const views = await ShipmentViewRepository.getMyViews(user.id);
    res.json({ data: views });
  } catch (error) {
    console.error('Error fetching shipment views:', error);
    res.status(500).json({ error: 'Failed to fetch shipment views' });
  }
});

/**
 * POST /api/shipment-views/:shipmentId
 * Mark a shipment as viewed (just now) by the current user.
 */
router.post('/:shipmentId', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    await ShipmentViewRepository.markViewed(req.params.shipmentId!, user.id);
    res.status(204).end();
  } catch (error) {
    console.error('Error marking shipment as viewed:', error);
    res.status(500).json({ error: 'Failed to mark shipment as viewed' });
  }
});

export default router;
