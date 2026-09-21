import pool from '../connection.js';
import { logError } from '../../utils/logger.js';

export interface VesselHistoryEntry {
  id?: number;
  shipment_id: string;
  old_vessel_name: string | null;
  new_vessel_name: string | null;
  changed_by: string | null;
  changed_by_username: string | null;
  changed_at?: string;
}

export class VesselHistoryRepository {
  static async logChange(
    shipmentId: string,
    oldVesselName: string | null,
    newVesselName: string | null,
    userId: string | null,
    username: string | null
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO vessel_history (shipment_id, old_vessel_name, new_vessel_name, changed_by, changed_by_username)
         VALUES ($1, $2, $3, $4, $5)`,
        [shipmentId, oldVesselName, newVesselName, userId, username]
      );
    } catch (error) {
      logError('Failed to write vessel history', error);
    }
  }

  static async getByShipment(shipmentId: string): Promise<VesselHistoryEntry[]> {
    const result = await pool.query(
      `SELECT * FROM vessel_history WHERE shipment_id = $1 ORDER BY changed_at DESC`,
      [shipmentId]
    );
    return result.rows;
  }
}

export default VesselHistoryRepository;
