import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;
    console.log("[DB] Creating pool, DATABASE_URL present:", !!dbUrl);
    if (!dbUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    try {
      pool = new Pool({
        connectionString: dbUrl,
        max: 10,
        idleTimeoutMillis: 30000,
      });
      console.log("[DB] Pool created successfully");
    } catch (err) {
      console.error("[DB] Error creating pool:", err);
      throw err;
    }
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = getPool();
  const result = await client.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
