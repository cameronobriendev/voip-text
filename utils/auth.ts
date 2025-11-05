// Authentication utilities (password hashing, JWT)
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { AuthUser } from '../types';

/**
 * Hash a password using PBKDF2 (Web Crypto API compatible)
 * Returns format: "salt:hash"
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) {
    throw new Error('Invalid password hash format');
  }
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

/**
 * Generate JWT token for authenticated user
 */
export function generateToken(user: AuthUser): string {
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is not set');
  }
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
    },
    process.env.SESSION_SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * Verify JWT token and return user data
 */
export function verifyToken(token: string): AuthUser | null {
  try {
    if (!process.env.SESSION_SECRET) {
      throw new Error('SESSION_SECRET environment variable is not set');
    }
    const decoded = jwt.verify(token, process.env.SESSION_SECRET) as AuthUser;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Extract JWT token from cookie header
 */
export function getTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  return cookies.token || null;
}
