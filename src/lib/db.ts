import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;
    const isDev = process.env.NODE_ENV !== 'production';

    console.log("[DB] Creating pool");
    console.log("[DB] DATABASE_URL present:", !!dbUrl);
    console.log("[DB] NODE_ENV:", process.env.NODE_ENV);

    if (!dbUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    // Log masked URL for debugging
    const masked = dbUrl.substring(0, 20) + '***' + dbUrl.substring(dbUrl.length - 20);
    console.log("[DB] DATABASE_URL (masked):", masked);
    console.log("[DB] URL length:", dbUrl.length);
    console.log("[DB] URL contains @:", dbUrl.includes('@'));

    try {
      pool = new Pool({
        connectionString: dbUrl,
        max: 10,
        idleTimeoutMillis: 30000,
      });

      // Test the connection immediately to catch errors early
      pool.on('error', (err) => {
        console.error("[DB] Pool error event:", err.message);
      });

      console.log("[DB] Pool instance created successfully");
    } catch (err) {
      console.error("[DB] Error creating pool:", err instanceof Error ? err.message : String(err));
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
