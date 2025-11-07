import { verifyCsrfToken } from './csrf-token-generator.js';
import { isAuthenticated } from './utils.js';

/**
 * Middleware to verify CSRF tokens on state-changing requests
 *
 * Automatically checks POST, PUT, PATCH, DELETE requests for valid CSRF tokens.
 * Returns 403 if CSRF token is missing or invalid.
 */
export async function requireCsrf(req: Request, handler: (req: Request) => Promise<Response>): Promise<Response> {
  // Only check state-changing methods
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return await handler(req);
  }

  // Verify user is authenticated
  const user = await isAuthenticated(req);
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
  }

  // Verify CSRF token
  const csrfValid = await verifyCsrfToken(req);
  if (!csrfValid) {
    console.error('CSRF validation failed:', {
      method: req.method,
      url: req.url,
      user: user.username || 'unknown'
    });

    return new Response(
      JSON.stringify({
        error: 'Invalid CSRF token. Please refresh the page and try again.',
        code: 'CSRF_INVALID'
      }),
      { status: 403, headers: { 'content-type': 'application/json' } }
    );
  }

  // CSRF valid, continue to handler
  return await handler(req);
}

/**
 * Wrapper to apply CSRF protection to endpoint
 *
 * Usage:
 *   import { withCsrf } from '../auth/csrf-middleware.js';
 *
 *   async function handler(req: Request) {
 *     // ... your logic ...
 *   }
 *
 *   export default withCsrf(handler);
 */
export function withCsrf(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    return await requireCsrf(req, handler);
  };
}
