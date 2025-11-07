import { generateCsrfToken, createCsrfCookie } from './csrf-token-generator.js';
import { isAuthenticated } from './utils.js';

/**
 * GET /api/auth/csrf-token
 *
 * Returns a CSRF token for authenticated users.
 * Sets the token in an HttpOnly cookie and returns it in the response.
 *
 * Response: { token: string, expiresAt: number }
 */
export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  // Only authenticated users can get CSRF tokens
  const user = await isAuthenticated(req);
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
  }

  // Generate new token
  const { token, expiresAt } = generateCsrfToken();

  // Set cookie
  const cookie = createCsrfCookie(token);

  return new Response(
    JSON.stringify({
      token: token,
      expiresAt: expiresAt
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': cookie
      }
    }
  );
}
