/**
 * FX Rates Routes
 * Manually-maintained exchange rates (to USD), used to compare freight quotes
 * across currencies. Deliberately admin-set rather than a live feed, so a rate
 * used in a cost comparison is always one someone explicitly entered.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { param, body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.ts';
import pool from '../db/connection.js';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

/**
 * GET /api/fx-rates
 * List all maintained exchange rates
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query('SELECT * FROM fx_rates ORDER BY currency');
    res.json({ data: result.rows });
  })
);

/**
 * PUT /api/fx-rates/:currency
 * Set/update the rate for one currency (units of that currency per 1 USD)
 */
router.put(
  '/:currency',
  authenticateToken,
  [
    param('currency').trim().toUpperCase().isLength({ min: 3, max: 10 }),
    body('rate_to_usd').isFloat({ gt: 0 }).withMessage('Rate must be greater than 0'),
  ],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const currency = (req.params.currency as string).toUpperCase();
    const { rate_to_usd } = req.body;
    const userId = req.user!.id;
    const username = req.user!.username;

    const result = await pool.query(
      `INSERT INTO fx_rates (currency, rate_to_usd, updated_by, updated_by_username, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (currency) DO UPDATE SET
         rate_to_usd = EXCLUDED.rate_to_usd,
         updated_by = EXCLUDED.updated_by,
         updated_by_username = EXCLUDED.updated_by_username,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [currency, rate_to_usd, userId, username]
    );

    res.json({ data: result.rows[0] });
  })
);

export default router;
