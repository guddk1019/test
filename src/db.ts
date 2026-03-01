import { Pool, PoolClient, QueryResult, QueryResultRow, types } from "pg";
import { config } from "./config";

// PostgreSQL BIGINT (int8, oid=20) is returned as string by default.
// IDs in this project are safe integer range, so convert to number globally.
types.setTypeParser(20, (value) => Number(value));

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, values);
}

export async function withTransaction<T>(
  handler: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
