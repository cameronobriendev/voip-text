/**
 * contacts/[id]/archive.ts - Archive/Unarchive Contact Conversation
 * Edge Runtime
 */

export const config = { runtime: 'edge' };

import { getDB } from '../../db/client.js';
import { isAuthenticated } from '../../auth/utils.js';
import { withCsrf } from '../../auth/csrf-middleware.js';
import type { Contact } from '../../../types';

async function handler(req: Request): Promise<Response> {
  // Only allow PUT method
  if (req.method !== 'PUT') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'content-type': 'application/json' } }
    );
  }

  // Verify authentication
  const user = await isAuthenticated(req);
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
  }

  // Get contact ID from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 2]; // /api/contacts/[id]/archive

  if (!id) {
    return new Response(
      JSON.stringify({ error: 'Contact ID is required' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  const sql = getDB();

  try {
    // Parse request body
    const body = await req.json();
    const { is_archived } = body;

    // Validate is_archived parameter
    if (typeof is_archived !== 'boolean') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'is_archived must be a boolean'
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    // Check if contact exists
    const existing : Contact[] = await sql`
      SELECT * FROM contacts WHERE id = ${id}
    `;

    if (existing.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Contact not found',
        }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }

    // Update archive status
    const updated : Contact[] = await sql`
      UPDATE contacts
      SET is_archived = ${is_archived}
      WHERE id = ${id}
      RETURNING *
    `;

    return new Response(
      JSON.stringify({
        success: true,
        contact: updated[0],
        message: is_archived ? 'Conversation archived' : 'Conversation unarchived'
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  } catch (error) {
    console.error('Archive endpoint error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error'
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}

export default withCsrf(handler);
