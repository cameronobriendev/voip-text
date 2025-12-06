// voip.ms API client for sending SMS/MMS
interface VoipMsCredentials {
  email: string;
  apiPassword: string;
  did: string;
}

interface VoipMsResponse {
  status: 'success' | 'failure' | 'no_credits' | 'sms_toolong';
  sms?: string; // Message ID (for SMS)
  mms?: string; // Message ID (for MMS)
  error?: string;
  message?: string;
}

/**
 * Send SMS/MMS via voip.ms API
 * Automatically uses MMS for messages >160 characters
 * @returns Message ID from voip.ms
 */
export async function sendSMS(
  to: string,
  message: string
): Promise<string> {
  const credentials: VoipMsCredentials = {
    email: process.env.VOIPMS_EMAIL || '',
    apiPassword: process.env.VOIPMS_API_PASSWORD || '',
    did: process.env.VOIPMS_DID || '',
  };

  if (!credentials.email || !credentials.apiPassword || !credentials.did) {
    throw new Error('VoIP.ms credentials not configured in environment variables');
  }

  // Format phone number for voip.ms (10 digits, no formatting)
  const formattedPhone = formatPhoneForVoipMs(to);

  // Choose method based on message length
  // SMS: max 160 chars, $0.0075/msg
  // MMS: max 2048 chars, $0.02/msg (cheaper for 3+ SMS segments)
  const method = message.length <= 160 ? 'sendSMS' : 'sendMMS';
  const maxChars = method === 'sendSMS' ? 160 : 2048;

  // Validate message length
  if (message.length > maxChars) {
    throw new Error(`Message too long: ${message.length} characters (max ${maxChars} for ${method})`);
  }

  console.log(`[voipms] Sending via ${method} (${message.length} chars, max ${maxChars})`);

  const params = new URLSearchParams({
    api_username: credentials.email,
    api_password: credentials.apiPassword,
    method: method,
    did: credentials.did,
    dst: formattedPhone,
    message: message,
  });

  try {
    // voip.ms REST API requires GET requests with query string parameters
    const url = `https://voip.ms/api/v1/rest.php?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
    });

    // ALWAYS read response body first - voip.ms returns error details in JSON even with 500 status
    const responseText = await response.text();
    console.log('[voipms] API Response Status:', response.status);
    console.log('[voipms] API Response Body:', responseText);

    // Parse JSON response
    let data: VoipMsResponse;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[voipms] Failed to parse response as JSON:', responseText);
      throw new Error(`voip.ms API returned non-JSON response (${response.status}): ${responseText.slice(0, 200)}`);
    }

    // Check voip.ms status field (they use their own status, not HTTP status)
    if (data.status !== 'success') {
      const errorMsg = data.error || data.message || data.status || 'Unknown error';
      console.error('[voipms] API returned error status:', data);
      throw new Error(`voip.ms API error: ${errorMsg}`);
    }

    // Handle both SMS and MMS responses
    const messageId = data.sms || data.mms;
    if (!messageId) {
      console.error('[voipms] No message ID in response:', data);
      throw new Error('voip.ms API did not return message ID');
    }

    console.log(`[voipms] ${method} sent successfully, message ID:`, messageId);
    return messageId; // Return message ID for tracking
  } catch (error) {
    console.error('[voipms] sendSMS error:', error);
    throw error;
  }
}

/**
 * Format phone number to E.164 format (for display and storage)
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // If it's a 10-digit number, assume North America and add +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // If it's 11 digits starting with 1, add +
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Otherwise return with + prefix if not already there
  return digits.startsWith('+') ? digits : `+${digits}`;
}

/**
 * Display phone number in friendly format: (555) 123-4567
 */
export function displayPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  // North American format (10 or 11 digits)
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  // Just return original for international numbers
  return phone;
}

/**
 * Format phone number for voip.ms API (10 digits, no formatting)
 * voip.ms expects NANPA format: just 10 digits like 2125551234
 */
export function formatPhoneForVoipMs(phone: string): string {
  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // If 11 digits starting with 1, remove the 1 (North America country code)
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }

  // If 10 digits, return as-is
  if (digits.length === 10) {
    return digits;
  }

  // If other length, return stripped digits (voip.ms will validate)
  return digits;
}
