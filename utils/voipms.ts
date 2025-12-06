// voip.ms API client for sending SMS
interface VoipMsCredentials {
  email: string;
  apiPassword: string;
  did: string;
}

interface VoipMsResponse {
  status: 'success' | 'failure' | 'no_credits';
  sms?: string; // Message ID
  error?: string;
}

/**
 * Send SMS via voip.ms API
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

  const params = new URLSearchParams({
    api_username: credentials.email,
    api_password: credentials.apiPassword,
    method: 'sendSMS',
    did: credentials.did,
    dst: formattedPhone,
    message: message,
  });

  try {
    const response = await fetch('https://voip.ms/api/v1/rest.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`voip.ms API request failed: ${response.status} ${response.statusText}`);
    }

    const data: VoipMsResponse = await response.json();

    if (data.status !== 'success') {
      throw new Error(`voip.ms API error: ${data.error || data.status}`);
    }

    if (!data.sms) {
      throw new Error('voip.ms API did not return message ID');
    }

    return data.sms; // Return message ID for tracking
  } catch (error) {
    console.error('sendSMS error:', error);
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
