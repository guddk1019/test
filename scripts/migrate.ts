import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
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

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      file_name TEXT PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function hasLegacyBaseline(pool: Pool): Promise<boolean> {
  const result = await pool.query<{ regclass: string | null }>(
    `
      SELECT to_regclass('public.users') AS regclass
      UNION ALL SELECT to_regclass('public.work_items')
      UNION ALL SELECT to_regclass('public.submissions')
      UNION ALL SELECT to_regclass('public.file_artifacts')
      UNION ALL SELECT to_regclass('public.audit_logs')
    `,
  );
  return result.rows.every((row) => Boolean(row.regclass));
}

async function runMigrations(): Promise<void> {
  const databaseUrl = required("DATABASE_URL");
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await ensureMigrationsTable(pool);

    const sqlDir = path.resolve(process.cwd(), "sql");
    const files = (await readdir(sqlDir))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    const appliedResult = await pool.query<{ file_name: string; checksum: string }>(
      "SELECT file_name, checksum FROM schema_migrations",
    );
    const applied = new Map(
      appliedResult.rows.map((row) => [row.file_name, row.checksum]),
    );

    if (applied.size === 0 && files.includes("001_init.sql") && (await hasLegacyBaseline(pool))) {
      const fullPath = path.join(sqlDir, "001_init.sql");
      const sql = await readFile(fullPath, "utf-8");
      const checksum = sha256(sql);
      await pool.query(
        "INSERT INTO schema_migrations (file_name, checksum) VALUES ($1, $2)",
        ["001_init.sql", checksum],
      );
      applied.set("001_init.sql", checksum);
      console.log("Baseline detected. Marked migration as applied: 001_init.sql");
    }

    for (const file of files) {
      const fullPath = path.join(sqlDir, file);
      const sql = await readFile(fullPath, "utf-8");
      const checksum = sha256(sql);
      const existingChecksum = applied.get(file);

      if (existingChecksum) {
        if (existingChecksum !== checksum) {
          throw new Error(
            `Checksum mismatch for ${file}. Existing database migration history differs from file content.`,
          );
        }
        console.log(`Skipped already applied migration: ${file}`);
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (file_name, checksum) VALUES ($1, $2)",
          [file, checksum],
        );
        await client.query("COMMIT");
        console.log(`Applied migration: ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error(error);
  process.exit(1);
});
