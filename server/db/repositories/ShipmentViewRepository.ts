import pool from '../connection.js';

export class ShipmentViewRepository {
  /** Record (or refresh) that this user has now seen this shipment's current state. */
  static async markViewed(shipmentId: string, userId: string): Promise<void> {
    await pool.query(
      `INSERT INTO shipment_views (shipment_id, user_id, viewed_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (shipment_id, user_id)
       DO UPDATE SET viewed_at = CURRENT_TIMESTAMP`,
      [shipmentId, userId]
    );
  }

  /** All of this user's view timestamps, as { shipmentId: viewedAt }. */
  static async getMyViews(userId: string): Promise<Record<string, string>> {
    const result = await pool.query(
      `SELECT shipment_id, viewed_at FROM shipment_views WHERE user_id = $1`,
      [userId]
    );
    const views: Record<string, string> = {};
    for (const row of result.rows) {
      views[row.shipment_id] = row.viewed_at;
    }
    return views;
  }
}

export default ShipmentViewRepository;
