/**
 * messages/send.ts - Send SMS Message
 * Edge Runtime
 */

export const config = { runtime: 'edge' };

import { getDB } from '../db/client.js';
import { isAuthenticated } from '../auth/utils.js';
import { sendSMS } from '../../utils/voipms';
import type { SendMessageRequest, SendMessageResponse, Contact, Message } from '../../types';

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
      JSON.stringify({
        success: false,
        error: 'Unauthorized',
      } as SendMessageResponse),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const { contact_id, message } = body as SendMessageRequest;

    if (!contact_id || !message) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Contact ID and message are required',
        } as SendMessageResponse),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    const sql = getDB();

    // Get contact
    const contacts : Contact[] = await sql`
      SELECT * FROM contacts WHERE id = ${contact_id}
    `;

    if (contacts.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Contact not found',
        } as SendMessageResponse),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }

    const contact = contacts[0];

    // Get voip.ms DID from environment
    const voipmsDid = process.env.VOIPMS_DID;

    if (!voipmsDid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'VoIP.ms DID not configured',
        } as SendMessageResponse),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }

    // Send SMS via voip.ms
    const voipmsMessageId = await sendSMS(contact.phone_number, message);

    // Store message in database
    const messages : Message[] = await sql`
      INSERT INTO messages (
        contact_id,
        direction,
        message_type,
        content,
        phone_from,
        phone_to,
        sent_by,
        status
      ) VALUES (
        ${contact_id},
        'outbound',
        'sms',
        ${message},
        ${voipmsDid},
        ${contact.phone_number},
        ${user.username},
        'sent'
      )
      RETURNING *
    `;

    return new Response(
      JSON.stringify({
        success: true,
        message: messages[0],
      } as SendMessageResponse),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  } catch (error) {
    console.error('Send message error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send message',
        details: error instanceof Error ? error.message : String(error)
      } as SendMessageResponse),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
