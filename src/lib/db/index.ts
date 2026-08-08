import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/lib/env'
import * as schema from '@/lib/db/schema'

// Reuse the client across hot reloads in dev; serverless invocations reuse it
// per instance.
const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres> }

const client =
  globalForDb.__sql ??
  postgres(env.DATABASE_URL, {
    max: 1, // one socket per serverless instance; Neon's pooler fans out
    prepare: false, // mandatory against a PgBouncer-style pooler
    idle_timeout: 20,
  })

if (process.env.NODE_ENV !== 'production') globalForDb.__sql = client

export const db = drizzle(client, { schema })
export type Db = typeof db
