/**
 * Anthropic Models Manager Integration
 * Fetches current model IDs from centralized service
 * https://models.brasshelm.com
 */

/**
 * Fetches the current best Anthropic model for specified type
 *
 * @param type - Model type: 'sonnet', 'haiku', 'opus'
 * @param projectName - Your project name (for A/B testing)
 * @returns Model ID string (e.g., 'claude-sonnet-4-5')
 */
export async function getAnthropicModel(
  type: 'sonnet' | 'haiku' | 'opus' = 'sonnet',
  projectName: string = 'voip-text'
): Promise<string> {
  try {
    const url = `https://models.brasshelm.com/api/model/${type}?project=${projectName}`;

    const response = await fetch(url, {
      headers: {
        'x-api-key': process.env.MODELS_API_KEY || ''
      }
    });

    if (!response.ok) {
      throw new Error(`Models API error: ${response.status}`);
    }

    const data = await response.json();
    return data.model_id;

  } catch (error) {
    console.error('[Anthropic Model] Failed to fetch from central service:', error);

    // Emergency fallback (use stable aliases)
    const fallbacks = {
      sonnet: 'claude-sonnet-4-5',
      haiku: 'claude-haiku-4-5',
      opus: 'claude-opus-4-1'
    };

    return fallbacks[type];
  }
}

/**
 * Tracks model usage for analytics and cost tracking
 *
 * Fire-and-forget - doesn't block on tracking failures
 */
export async function trackModelUsage(data: {
  projectName: string;
  endpoint: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  responseTimeMs: number;
  success: boolean;
  error?: string;
}): Promise<void> {
  try {
    await fetch('https://models.brasshelm.com/api/usage/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.MODELS_API_KEY || ''
      },
      body: JSON.stringify(data)
    });
  } catch (error) {
    // Silently fail - don't block on tracking errors
    console.error('[Anthropic Model] Failed to track usage:', error);
  }
}
