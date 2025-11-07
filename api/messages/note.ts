/**
 * api/messages/note.ts - Save a private note
 * Edge Runtime
 */

export const config = { runtime: 'edge' };

import { getDB } from '../db/client.js';
import { isAuthenticated } from '../auth/utils.js';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
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

  try {
    const { phoneNumber, body } = await req.json();

    console.log('[Note API] Received:', { phoneNumber, body, userId: user.id });

    if (!phoneNumber || !body) {
      console.error('[Note API] Missing required fields:', { phoneNumber, body });
      return new Response(
        JSON.stringify({ error: 'Phone number and body are required' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    const sql = getDB();

    // Insert note into database (direction='note', message_type='note')
    await sql`
      INSERT INTO messages (user_id, phone_number, direction, message_type, body, created_at)
      VALUES (${user.id}, ${phoneNumber}, 'note', 'note', ${body}, NOW())
    `;

    console.log('[Note API] Note saved successfully');

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Note API] Error saving note:', error);
    console.error('[Note API] Error details:', error instanceof Error ? error.message : String(error));
    return new Response(
      JSON.stringify({ error: 'Failed to save note', details: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
