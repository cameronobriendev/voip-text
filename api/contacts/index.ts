/**
 * contacts/index.ts - BirdText Contacts Endpoint
 * Edge Runtime
 */

export const config = { runtime: 'edge' };

import { getDB } from '../db/client.js';
import { isAuthenticated } from '../auth/utils.js';
import { withCsrf } from '../auth/csrf-middleware.js';
import { formatPhoneE164, generateAvatarColor } from '../../utils/phone';
import type { Contact } from '../../types';

async function handler(req: Request): Promise<Response> {
  // Verify authentication
  const user = await isAuthenticated(req);
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
  }

  const sql = getDB();

  try {
    if (req.method === 'GET') {
      // List all contacts (shared between users)
      const contacts : Contact[] = await sql`
        SELECT * FROM contacts ORDER BY name ASC
      `;

      return new Response(
        JSON.stringify({
          success: true,
          contacts,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );

    } else if (req.method === 'POST') {
      // Create new contact
      const body = await req.json();
      const { name, phone_number, notes } = body;

      if (!name || !phone_number) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Name and phone number are required',
          }),
          { status: 400, headers: { 'content-type': 'application/json' } }
        );
      }

      // Format phone number to E.164
      const formattedPhone = formatPhoneE164(phone_number);

      // Check if contact with this phone number already exists
      const existing : Contact[] = await sql`
        SELECT * FROM contacts WHERE phone_number = ${formattedPhone}
      `;

      if (existing.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Contact with this phone number already exists',
          }),
          { status: 409, headers: { 'content-type': 'application/json' } }
        );
      }

      // Generate random avatar color
      const avatarColor = generateAvatarColor();

      // Create contact
      const newContacts : Contact[] = await sql`
        INSERT INTO contacts (name, phone_number, avatar_color, notes)
        VALUES (${name}, ${formattedPhone}, ${avatarColor}, ${notes || null})
        RETURNING *
      `;

      return new Response(
        JSON.stringify({
          success: true,
          contact: newContacts[0],
        }),
        { status: 201, headers: { 'content-type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'content-type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Contacts API error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}

export default withCsrf(handler);
