import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from './schema';

const url = process.env.DATABASE_URL ?? 'postgres://splitup:splitup@localhost:5544/splitup';
export const sql = postgres(url, { max: 10, onnotice: () => {} });
export const db = drizzle(sql, { schema });
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const runMigrations = (folder: string) => migrate(db, { migrationsFolder: folder });
