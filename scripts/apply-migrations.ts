#!/usr/bin/env node
// @local/backlog-kit migration runner (intake #975).
//
// Applies every `migrations/NNNN_*.sql` file in numeric order against
// the database at DATABASE_URL. Each migration runs in its own
// transaction. Idempotent because every CREATE in `0000_init.sql`
// uses IF NOT EXISTS.
//
// Usage (from any consumer project):
//   DATABASE_URL=postgres://... npx tsx vendor/feedback-triage/scripts/apply-migrations.ts
//
// No migration-state table — we rely on CREATE IF NOT EXISTS semantics
// for safety. For projects that want strict migration state tracking,
// see the consumer's own apply-NNNN.ts pattern (specforge uses one
// per migration in scripts/apply-*.ts).

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL env var required.");
    process.exit(1);
  }

  // Resolve migrations relative to this script's location so the
  // runner works from any cwd.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(__dirname, "..", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // lexicographic == numeric order for NNNN_ prefix

  if (files.length === 0) {
    console.log("no migrations found in", migrationsDir);
    return;
  }

  console.log(`# applying ${files.length} migration(s) from ${migrationsDir}`);
  const sql = postgres(url);

  for (const file of files) {
    const path = join(migrationsDir, file);
    const text = readFileSync(path, "utf8");
    console.log(`→ ${file} (${text.length} bytes)`);
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
    });
    console.log(`  ✓ ${file}`);
  }

  await sql.end();
  console.log(`\n# all migrations applied`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
