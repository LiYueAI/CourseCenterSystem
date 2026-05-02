import { Pool, type PoolClient, type QueryResultRow } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
});

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows;
}

export async function queryOne<T = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function queryWithClient<T extends QueryResultRow = any>(
  client: PoolClient,
  text: string,
  params?: any[]
): Promise<T[]> {
  const result = await client.query<T>(text, params);
  return result.rows;
}

export async function queryOneWithClient<T extends QueryResultRow = any>(
  client: PoolClient,
  text: string,
  params?: any[]
): Promise<T | null> {
  const rows = await queryWithClient<T>(client, text, params);
  return rows[0] || null;
}

export default pool;
