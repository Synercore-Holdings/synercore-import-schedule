/**
 * Base repository class for database operations
 * Provides common CRUD operations with type safety
 */

import type { QueryResult } from 'pg';
import { query, queryOne, queryAll } from '../connection.js';

/**
 * Base filter type for queries
 */
export interface BaseFilter {
  [key: string]: any;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  offset?: number;
}

/**
 * Sort options
 */
export interface SortOptions {
  field: string;
  direction: 'ASC' | 'DESC';
}

/**
 * Query options
 */
export interface QueryOptions {
  filter?: BaseFilter;
  sort?: SortOptions;
  pagination?: PaginationOptions;
}

/**
 * Base repository with common operations
 */
export abstract class BaseRepository<T extends { id: string }> {
  protected abstract tableName: string;
  protected abstract columns: string[];

  /**
   * Find by ID
   */
  async findById(id: string): Promise<T | null> {
    const sql = `SELECT ${this.columns.join(', ')} FROM ${this.tableName} WHERE id = $1`;
    return queryOne<T>(sql, [id]);
  }

  /**
   * Find all records
   */
  async findAll(options?: QueryOptions): Promise<T[]> {
    let sql = `SELECT ${this.columns.join(', ')} FROM ${this.tableName}`;
    let params: any[] = [];

    // Apply filters
    if (options?.filter) {
      const filterKeys = Object.keys(options.filter);
      if (filterKeys.length > 0) {
        const whereClause = this.buildWhereClause(options.filter);
        sql += ` WHERE ${whereClause.clause}`;
        params = whereClause.values;
      }
    }

    // Apply sorting (validated against column whitelist). Always break ties
    // on id so results are deterministic across requests — without this,
    // rows with an identical value on the sort field (e.g. a batch import
    // where every row shares the same created_at) can come back in a
    // different order each time, which silently changes which row a
    // client-side "first one wins" dedup (LIMIT/OFFSET pagination, or the
    // Supplier Performance / Late Shipments per-order dedup) ends up using.
    if (options?.sort) {
      const sortField = options.sort.field;
      const sortDirection = options.sort.direction?.toUpperCase();
      if (!this.columns.includes(sortField)) {
        throw new Error(`Invalid sort field: ${sortField}`);
      }
      if (sortDirection !== 'ASC' && sortDirection !== 'DESC') {
        throw new Error(`Invalid sort direction: ${sortDirection}`);
      }
      sql += ` ORDER BY ${sortField} ${sortDirection}, id ASC`;
    } else if (options?.pagination) {
      sql += ` ORDER BY id ASC`;
    }

    // Apply pagination (parameterized)
    if (options?.pagination) {
      const limit = options.pagination.limit || 20;
      const offset = options.pagination.offset || ((options.pagination.page || 1) - 1) * limit;
      const limitIdx = params.length + 1;
      const offsetIdx = params.length + 2;
      sql += ` LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
      params.push(limit, offset);
    }

    return queryAll<T>(sql, params.length > 0 ? params : undefined);
  }

  /**
   * Find one record
   */
  async findOne(filter: BaseFilter): Promise<T | null> {
    const whereClause = this.buildWhereClause(filter);
    const sql = `SELECT ${this.columns.join(', ')} FROM ${this.tableName} WHERE ${whereClause.clause}`;
    return queryOne<T>(sql, whereClause.values);
  }

  /**
   * Count total records
   */
  async count(filter?: BaseFilter): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;

    if (filter && Object.keys(filter).length > 0) {
      const whereClause = this.buildWhereClause(filter);
      sql += ` WHERE ${whereClause.clause}`;
      const result = await queryOne<{ count: string }>(sql, whereClause.values);
      return result ? parseInt(result.count, 10) : 0;
    }

    const result = await queryOne<{ count: string }>(sql);
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Insert a record
   */
  async create(data: Partial<T>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const sql = `
      INSERT INTO ${this.tableName} (${keys.join(', ')})
      VALUES (${placeholders})
      RETURNING ${this.columns.join(', ')}
    `;

    const result = await queryOne<T>(sql, values);
    if (!result) {
      throw new Error('Failed to create record');
    }

    return result;
  }

  /**
   * Update a record
   */
  async update(id: string, data: Partial<T>): Promise<T> {
    const keys = Object.keys(data);
    const values = [...Object.values(data), id];

    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

    const sql = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE id = $${keys.length + 1}
      RETURNING ${this.columns.join(', ')}
    `;

    const result = await queryOne<T>(sql, values);
    if (!result) {
      throw new Error('Record not found');
    }

    return result;
  }

  /**
   * Delete a record
   */
  async delete(id: string): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Delete multiple records
   */
  async deleteMany(filter: BaseFilter): Promise<number> {
    const whereClause = this.buildWhereClause(filter);
    const sql = `DELETE FROM ${this.tableName} WHERE ${whereClause.clause}`;
    const result = await query(sql, whereClause.values);
    return result.rowCount || 0;
  }

  /**
   * Bulk insert
   */
  async createMany(records: Partial<T>[]): Promise<T[]> {
    if (records.length === 0) return [];

    const firstRecord = records[0];
    if (!firstRecord) return [];

    const keys = Object.keys(firstRecord);
    const values: any[] = [];
    const placeholders: string[] = [];

    records.forEach((record, idx) => {
      const recordValues = keys.map(key => (record as any)[key]);
      values.push(...recordValues);

      const recordPlaceholders = keys
        .map((_, i) => `$${idx * keys.length + i + 1}`)
        .join(', ');
      placeholders.push(`(${recordPlaceholders})`);
    });

    const sql = `
      INSERT INTO ${this.tableName} (${keys.join(', ')})
      VALUES ${placeholders.join(', ')}
      RETURNING ${this.columns.join(', ')}
    `;

    return queryAll<T>(sql, values);
  }

  /**
   * Check if record exists
   */
  async exists(filter: BaseFilter): Promise<boolean> {
    const count = await this.count(filter);
    return count > 0;
  }

  /**
   * Build WHERE clause from filter object
   */
  protected buildWhereClause(filter: BaseFilter): { clause: string; values: any[] } {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(filter)) {
      if (value === null) {
        conditions.push(`${key} IS NULL`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`${key} IN (${placeholders})`);
        values.push(...value);
      } else {
        conditions.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }

    return {
      clause: conditions.join(' AND '),
      values
    };
  }

  /**
   * Execute raw query
   */
  protected async raw<R extends Record<string, any> = any>(
    sql: string,
    params?: any[]
  ): Promise<QueryResult<R>> {
    return query<R>(sql, params);
  }
}

export default BaseRepository;
