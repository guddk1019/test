import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function runMigrations(): Promise<void> {
  const databaseUrl = required("DATABASE_URL");
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    const sqlDir = path.resolve(process.cwd(), "sql");
    const files = (await readdir(sqlDir))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const fullPath = path.join(sqlDir, file);
      const sql = await readFile(fullPath, "utf-8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("COMMIT");
        console.log(`Applied migration: ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error(error);
  process.exit(1);
});
