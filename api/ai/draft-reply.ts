/**
 * ai/draft-reply.ts - AI-powered reply drafting using Claude API
 * Edge Runtime
 */

export const config = { runtime: 'edge' };

import { getDB } from '../db/client.js';
import { isAuthenticated } from '../auth/utils.js';
import { getAnthropicModel, trackModelUsage } from '../../utils/anthropic-model';
import type { AiDraftRequest, AiDraftResponse, AiDraftReply, Message, Contact } from '../../types';

// Rate limiting: Track requests per user
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string, limit: number = 20): boolean {
  const now = Date.now();
  const userData = rateLimitMap.get(userId);

  if (!userData || now > userData.resetAt) {
    // Reset or create new counter
    rateLimitMap.set(userId, {
      count: 1,
      resetAt: now + (60 * 60 * 1000) // 1 hour
    });
    return true;
  }

  if (userData.count >= limit) {
    return false; // Rate limit exceeded
  }

  userData.count++;
  return true;
}

function getRateLimitRemaining(userId: string): { remaining: number; resetAt: number } {
  const userData = rateLimitMap.get(userId);
  if (!userData) {
    return { remaining: 20, resetAt: Date.now() + (60 * 60 * 1000) };
  }
  return {
    remaining: Math.max(0, 20 - userData.count),
    resetAt: userData.resetAt
  };
}

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
      } as AiDraftResponse),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
  }

  // Check rate limit
  const limit = parseInt(process.env.AI_DRAFT_RATE_LIMIT || '20', 10);
  if (!checkRateLimit(user.id, limit)) {
    const { remaining, resetAt } = getRateLimitRemaining(user.id);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Rate limit exceeded. ${remaining} requests remaining. Resets at ${new Date(resetAt).toISOString()}`,
      } as AiDraftResponse),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(resetAt)
        }
      }
    );
  }

  try {
    const body = await req.json();
    const { messageId, contactId, relationship, tone, additionalContext } = body as AiDraftRequest;

    // Validate required fields
    if (!messageId || !contactId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'messageId and contactId are required',
        } as AiDraftResponse),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    const sql = getDB();

    // Get contact
    const contacts: Contact[] = await sql`
      SELECT * FROM contacts WHERE id = ${contactId}
    `;

    if (contacts.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Contact not found',
        } as AiDraftResponse),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }

    const contact = contacts[0];

    // Get the specific message being replied to
    const targetMessages: Message[] = await sql`
      SELECT * FROM messages WHERE id = ${messageId}
    `;

    if (targetMessages.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Message not found',
        } as AiDraftResponse),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }

    const targetMessage = targetMessages[0];

    // Get conversation history (last 20 messages)
    const conversationHistory: Message[] = await sql`
      SELECT * FROM messages
      WHERE contact_id = ${contactId}
        AND message_type = 'sms'
      ORDER BY created_at DESC
      LIMIT 20
    `;

    // Reverse to chronological order
    conversationHistory.reverse();

    // Format conversation for Claude
    const formattedHistory = conversationHistory.map(msg => {
      const sender = msg.direction === 'inbound' ? contact.name : 'Me';
      return `${sender}: ${msg.content}`;
    }).join('\n');

    // Build Claude API prompt
    const systemPrompt = `You are helping write a text message reply. Keep it natural, conversational, and true to the tone requested. Generate exactly 3 reply options in JSON format.`;

    const userPrompt = `I'm replying to ${contact.name}.

${relationship ? `Relationship context: ${relationship}` : ''}
${tone ? `Desired tone: ${tone}` : ''}
${additionalContext ? `Additional context: ${additionalContext}` : ''}

Here's our recent conversation:
${formattedHistory}

Their latest message: "${targetMessage.content}"

Generate 3 reply options with these exact labels:
1. "Brief" - 1-2 sentences, quick and casual
2. "Medium" - 2-3 sentences, balanced
3. "Detailed" - 3-4 sentences, thoughtful and complete

Important:
- Keep it conversational and natural
- Match the tone I specified (or keep it casual if not specified)
- Don't be overly formal unless requested
- Use contractions and casual language where appropriate
- Don't add extra punctuation or emoji unless it fits naturally

Return a JSON array with 3 objects, each containing:
- id: "brief" | "medium" | "detailed"
- label: The display label
- text: The reply text

Example format:
[
  {"id": "brief", "label": "Brief", "text": "Hey! Sounds good, let's do it!"},
  {"id": "medium", "label": "Medium", "text": "Hey! That sounds perfect. I'm definitely in - just let me know when!"},
  {"id": "detailed", "label": "Detailed", "text": "Hey! That sounds absolutely perfect. I'm definitely in and really looking forward to it. Just let me know what time works best for you and I'll make sure I'm there!"}
]`;

    // Get current model from centralized service
    const modelId = await getAnthropicModel('sonnet', 'voip-text');
    const startTime = Date.now();

    // Call Claude API
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'AI service not configured',
        } as AiDraftResponse),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API error:', claudeResponse.status, errorText);

      // Track failed usage
      await trackModelUsage({
        projectName: 'voip-text',
        endpoint: '/api/ai/draft-reply',
        modelId,
        inputTokens: 0,
        outputTokens: 0,
        responseTimeMs: Date.now() - startTime,
        success: false,
        error: `Claude API ${claudeResponse.status}: ${errorText.substring(0, 100)}`
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: `Claude API error: ${claudeResponse.status} - ${errorText.substring(0, 200)}`,
        } as AiDraftResponse),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }

    const claudeData = await claudeResponse.json();

    // Extract text from Claude response
    const responseText = claudeData.content?.[0]?.text || '';

    // Parse JSON from response
    let replies: AiDraftReply[];
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/) ||
                        responseText.match(/(\[[\s\S]*?\])/);
      const jsonStr = jsonMatch ? jsonMatch[1] : responseText;
      replies = JSON.parse(jsonStr);

      // Validate structure
      if (!Array.isArray(replies) || replies.length !== 3) {
        throw new Error('Invalid reply format');
      }
    } catch (parseError) {
      console.error('Failed to parse Claude response:', parseError, 'Response:', responseText);

      // Track failed usage
      await trackModelUsage({
        projectName: 'voip-text',
        endpoint: '/api/ai/draft-reply',
        modelId,
        inputTokens: claudeData.usage?.input_tokens || 0,
        outputTokens: claudeData.usage?.output_tokens || 0,
        responseTimeMs: Date.now() - startTime,
        success: false,
        error: `Parse error: ${parseError instanceof Error ? parseError.message : 'Unknown'}`
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to parse AI response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        } as AiDraftResponse),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }

    // Track successful usage
    await trackModelUsage({
      projectName: 'voip-text',
      endpoint: '/api/ai/draft-reply',
      modelId,
      inputTokens: claudeData.usage.input_tokens,
      outputTokens: claudeData.usage.output_tokens,
      responseTimeMs: Date.now() - startTime,
      success: true
    });

    // Log usage for cost monitoring
    console.log('[AI Draft] Generated replies for user:', user.username, 'contact:', contact.name, 'tokens:', claudeData.usage);

    return new Response(
      JSON.stringify({
        success: true,
        replies,
        cached: false,
      } as AiDraftResponse),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  } catch (error) {
    console.error('AI draft error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate drafts',
      } as AiDraftResponse),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
