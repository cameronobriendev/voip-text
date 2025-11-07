/**
 * CSRF Token Strategy:
 * - Double-submit cookie pattern
 * - Token expires after 1 hour
 * - New token on each request (rotation)
 * - Cryptographically secure random bytes (Web Crypto API)
 */

export function generateCsrfToken() {
  // Generate 32-byte random token using Web Crypto API (Edge Runtime compatible)
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  // Convert to base64url format
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return {
    token: token,
    expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
  };
}

export function createCsrfCookie(token: string): string {
  const maxAge = 60 * 60; // 1 hour in seconds

  // Empty Domain = subdomain-specific (sms.birdmail.ca or Vercel URL)
  return `csrf_token=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${
    process.env.VERCEL_ENV === 'production' ? '; Secure' : ''
  }`;
}

export async function verifyCsrfToken(req: Request): Promise<boolean> {
  // Allow bypass if CSRF enforcement is disabled
  if (process.env.ENFORCE_CSRF === 'false') {
    return true;
  }

  // Get token from header
  const headerToken = req.headers.get('x-csrf-token');

  // Get token from cookie
  const cookies = req.headers.get('cookie') || '';
  const cookieToken = cookies
    .split(';')
    .find(c => c.trim().startsWith('csrf_token='))
    ?.split('=')[1];

  if (!headerToken || !cookieToken) {
    console.log('CSRF: Missing token in header or cookie');
    return false;
  }

  // Compare tokens (constant-time comparison to prevent timing attacks)
  if (headerToken.length !== cookieToken.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < headerToken.length; i++) {
    diff |= headerToken.charCodeAt(i) ^ cookieToken.charCodeAt(i);
  }

  if (diff !== 0) {
    console.log('CSRF: Token mismatch');
    return false;
  }

  return true;
}
