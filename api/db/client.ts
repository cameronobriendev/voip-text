/**
 * client.ts - BirdText Database Connection
 * Adapted from BrassHelm Security Templates
 */

import { neon } from '@neondatabase/serverless';
import type { NeonQueryFunction } from '@neondatabase/serverless';

export function getDB(): NeonQueryFunction<false, false> {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error(
      'Database connection string not found. ' +
      'Add DATABASE_URL or POSTGRES_URL to Vercel environment variables.'
    );
  }

  if (process.env.NODE_ENV !== 'production' && !connectionString.includes('-pooler')) {
    console.warn(
      '⚠️  WARNING: Database URL does not contain "-pooler".\n' +
      '   Non-pooled connections may cause "too many connections" errors.\n' +
      '   Get pooled connection string from Neon dashboard.'
    );
  }

  const sql = neon(connectionString);
  return sql;
}
