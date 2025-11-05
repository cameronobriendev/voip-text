// Script to create initial user with hashed password
import { hashPassword } from '../utils/auth.js';
import { neon } from '@neondatabase/serverless';

async function createUser() {
  const username = 'obrien';
  const email = 'cameron@brasshelm.com';
  const password = '5%URZx@@pxNQpVphJ!J2!V';

  // Hash the password
  console.log('Hashing password...');
  const passwordHash = await hashPassword(password);
  console.log('Password hash:', passwordHash);

  // Connect to database
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }

  const sql = neon(process.env.DATABASE_URL);

  // Insert user
  console.log('Creating user...');
  const users = await sql`
    INSERT INTO users (username, email, password_hash)
    VALUES (${username}, ${email}, ${passwordHash})
    RETURNING id, username, email, created_at
  `;

  console.log('User created successfully:', users[0]);
}

createUser().catch(console.error);
