import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit runs outside Next, so it does not get .env.local for free.
config({ path: '.env.local' })

// DDL prefers a real session over PgBouncer. Falls back to the pooled URL.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL

if (!url) throw new Error('DATABASE_URL is not set — see .env.example')

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
