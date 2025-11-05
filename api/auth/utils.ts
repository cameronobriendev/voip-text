/**
 * utils.ts - BirdText Authentication Utilities
 * Adapted from BrassHelm Security Templates for simplified user model
 */

import { SignJWT, jwtVerify } from 'jose';
import { getDB } from '../db/client.js';

const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  throw new Error(
    'SESSION_SECRET environment variable is required.\n' +
    'Generate with: openssl rand -base64 32\n' +
    'Add to Vercel environment variables.'
  );
}

if (SESSION_SECRET.length < 32) {
  throw new Error(
    'SESSION_SECRET must be at least 32 characters.\n' +
    'Current length: ' + SESSION_SECRET.length + '\n' +
    'Generate a stronger secret with: openssl rand -base64 32'
  );
}

const SECRET = new TextEncoder().encode(SESSION_SECRET);

/**
 * JWT PAYLOAD for BirdText
 * Simplified - no roles or permissions
 */
export interface JWTPayload {
  id: string;
  username: string;
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * USER INTERFACE
 * Matches database schema
 */
export interface User {
  id: string;
  username: string;
  email: string;
  password_hash?: string;
  created_at?: string;
}

/**
 * CREATE SESSION (JWT TOKEN)
 */
export async function createSession(user: User): Promise<string> {
  const token = await new SignJWT({
    id: user.id,
    username: user.username,
    email: user.email
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET);

  return token;
}

/**
 * VERIFY JWT TOKEN
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as JWTPayload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

/**
 * EXTRACT SESSION COOKIE FROM REQUEST
 */
export function extractSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c => c.startsWith('session='));
  if (!sessionCookie) return null;

  return sessionCookie.split('=')[1];
}

/**
 * CHECK AUTHENTICATION STATUS
 * Simplified - no force logout mechanism
 */
export async function isAuthenticated(request: Request): Promise<User | null> {
  const token = extractSessionCookie(request);
  if (!token) {
    return null;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return null;
  }

  try {
    const sql = getDB();

    const users: User[] = await sql`
      SELECT id, username, email, created_at
      FROM users
      WHERE id = ${payload.id}
    `;

    if (users.length === 0) {
      return null;
    }

    return users[0];

  } catch (error) {
    console.error('Database error during authentication check:', error);
    return null;
  }
}

/**
 * HASH PASSWORD (PBKDF2)
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const saltHex = Array.from(salt)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `${saltHex}:${hashHex}`;
}

/**
 * VERIFY PASSWORD
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const encoder = new TextEncoder();

  const [saltHex, hashHex] = storedHash.split(':');

  const salt = new Uint8Array(
    saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const derivedHashHex = Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return hashHex === derivedHashHex;
}
