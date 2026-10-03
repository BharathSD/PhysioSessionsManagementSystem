// A throwaway Postgres (PGlite, in memory) with just enough of Supabase's
// `auth` schema stubbed for our migrations and row-level security to run.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = join(import.meta.dirname, "../../supabase/migrations");

export const migrationFiles = () => readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

/** A fresh database with migrations applied (all of them, or those before `upTo`). */
export async function freshDb(upTo?: string) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    grant usage on schema public to authenticated;
  `);
  for (const f of migrationFiles()) {
    if (upTo && f >= upTo) break;
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  return db;
}

export async function applyMigration(db: PGlite, file: string) {
  await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
}

/** Signs up a user (the trigger creates their clinic) and returns a query helper that acts as them, with RLS. */
export async function signUp(db: PGlite, id: string, meta: Record<string, string> = {}) {
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, `${id}@test.local`, JSON.stringify(meta)]);
  const as = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${id}';`);
    try {
      return (await db.query<T>(sql, params)).rows;
    } finally {
      await db.exec("reset role; reset request.jwt.claim.sub;");
    }
  };
  const [{ clinic_id }] = await as<{ clinic_id: string }>("select clinic_id from clinic_members");
  return { as, clinicId: clinic_id };
}

export const USER_A = "11111111-1111-1111-1111-111111111111";
export const USER_B = "22222222-2222-2222-2222-222222222222";
