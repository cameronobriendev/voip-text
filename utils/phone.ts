// Phone number utilities

/**
 * Format phone number to E.164 format (+15551234567)
 */
export function formatPhoneE164(phone: string): string {
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

  // North American format (10 digits)
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // North American format with country code (11 digits)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  // Just return original for international numbers
  return phone;
}

/**
 * Generate random avatar color for new contacts
 */
export function generateAvatarColor(): string {
  const colors = [
    '#4A90E2', // Blue
    '#E24A90', // Pink
    '#90E24A', // Green
    '#E2904A', // Orange
    '#904AE2', // Purple
    '#4AE290', // Teal
    '#E2E24A', // Yellow
    '#E24A4A', // Red
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Get initials from contact name for avatar
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
