import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

// One migration runner at a time, including when two server instances start together.
export async function migrate(pool: Pool) {
  const sql = await readFile(
    new URL("./migrations/001-voyages.sql", import.meta.url),
    "utf8",
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(733714, 1)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS voyage_migrations (version integer PRIMARY KEY)",
    );
    const applied = await client.query<{ version: number }>(
      "SELECT version FROM voyage_migrations ORDER BY version DESC LIMIT 1",
    );
    const version = applied.rows[0]?.version ?? 0;
    if (version > 1)
      throw new Error("Voyage database requires a newer server.");
    if (version === 0) {
      await client.query(sql);
      await client.query("INSERT INTO voyage_migrations (version) VALUES (1)");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
