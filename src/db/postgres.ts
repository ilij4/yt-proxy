import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool, types } from "pg";
import { env } from "../config/env";
import type { Database } from "./types";

types.setTypeParser(1184, (value) => new Date(value));
types.setTypeParser(1114, (value) => new Date(`${value}Z`));

const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool })
});

export async function connectToDatabase(): Promise<void> {
  await sql`select 1`.execute(db);
}

export async function disconnectFromDatabase(): Promise<void> {
  await db.destroy();
}
