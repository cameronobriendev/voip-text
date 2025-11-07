/**
 * CSRF Token Manager
 * - Fetches and caches CSRF token
 * - Automatically refreshes expired tokens
 * - Wraps fetch() calls with CSRF header
 */

class CsrfTokenManager {
  constructor() {
    this.token = null;
    this.expiresAt = null;
    this.failedAttempts = 0;
    this.lastAttemptTime = 0;
  }

  async getToken() {
    // Return cached token if still valid (with 1-minute buffer)
    if (this.token && this.expiresAt && Date.now() < this.expiresAt - 60000) {
      return this.token;
    }

    // Exponential backoff: wait longer after failures
    const now = Date.now();
    const backoffMs = Math.min(1000 * Math.pow(2, this.failedAttempts), 30000); // Max 30 seconds
    const timeSinceLastAttempt = now - this.lastAttemptTime;

    if (this.failedAttempts > 0 && timeSinceLastAttempt < backoffMs) {
      const waitTime = backoffMs - timeSinceLastAttempt;
      console.warn(`CSRF: Rate limited, waiting ${Math.round(waitTime / 1000)}s before retry`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastAttemptTime = Date.now();

    // Fetch new token
    try {
      const response = await fetch('/api/auth/csrf-token', {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        this.failedAttempts++;
        throw new Error(`Failed to fetch CSRF token (status: ${response.status})`);
      }

      const data = await response.json();
      this.token = data.token;
      this.expiresAt = data.expiresAt;
      this.failedAttempts = 0; // Reset on success

      return this.token;
    } catch (error) {
      this.failedAttempts++;
      console.error(`CSRF token fetch failed (attempt ${this.failedAttempts}):`, error);
      throw error;
    }
  }

  async refreshToken() {
    this.token = null;
    this.expiresAt = null;
    return await this.getToken();
  }
}

// Global instance
const csrfManager = new CsrfTokenManager();

/**
 * Wrapper for fetch() that automatically includes CSRF token
 *
 * Usage: Replace fetch() with fetchWithCsrf()
 *
 * Example:
 *   const response = await fetchWithCsrf('/api/messages/send', {
 *     method: 'POST',
 *     body: JSON.stringify(data)
 *   });
 */
export async function fetchWithCsrf(url, options = {}) {
  const token = await csrfManager.getToken();

  const headers = new Headers(options.headers || {});
  headers.set('X-CSRF-Token', token);

  const response = await fetch(url, {
    ...options,
    headers: headers,
    credentials: 'include'
  });

  // If CSRF token expired/invalid, refresh and retry once
  if (response.status === 403) {
    const errorData = await response.clone().json().catch(() => null);
    if (errorData?.error?.includes('CSRF') || errorData?.code === 'CSRF_INVALID') {
      console.log('CSRF token invalid, refreshing...');
      await csrfManager.refreshToken();

      const newToken = await csrfManager.getToken();
      headers.set('X-CSRF-Token', newToken);

      return await fetch(url, {
        ...options,
        headers: headers,
        credentials: 'include'
      });
    }
  }

  return response;
}

// Pre-fetch token on page load (with delay to avoid rate limiting)
if (typeof window !== 'undefined') {
  // Wait 500ms before fetching to avoid thundering herd on page load
  setTimeout(() => {
    csrfManager.getToken().catch(error => {
      console.warn('CSRF pre-fetch failed (will retry on first use):', error.message);
    });
  }, 500);
}

export default csrfManager;
