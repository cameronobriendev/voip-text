import { getDB } from '../db/client.js';

/**
 * Rate Limiting Strategy:
 * - 5 failed attempts in 15 min → Lock for 15 min
 * - 10 failed attempts in 1 hour → Lock for 1 hour
 * - 20 failed attempts in 24 hours → Lock for 24 hours + alert admin
 *
 * This prevents brute force password attacks while being reasonable for legitimate users
 */

interface CheckResult {
  allowed: boolean;
  reason?: string;
  unlockTime?: Date;
  minutesRemaining?: number;
  attempts?: number;
  lockReason?: string;
}

/**
 * Check if a login attempt is allowed for the given identifier
 */
export async function checkLoginAttempt(identifier: string, type: 'ip' | 'username' = 'ip'): Promise<CheckResult> {
  const sql = getDB();

  // Check if currently locked
  const locked = await sql`
    SELECT locked_until, attempt_count
    FROM login_attempts
    WHERE identifier = ${identifier}
    AND identifier_type = ${type}
    AND locked_until > NOW()
    ORDER BY locked_until DESC
    LIMIT 1
  `;

  if (locked.length > 0) {
    const unlockTime = new Date(locked[0].locked_until);
    const minutesRemaining = Math.ceil((unlockTime.getTime() - new Date().getTime()) / 60000);

    return {
      allowed: false,
      reason: 'account_locked',
      unlockTime: unlockTime,
      minutesRemaining: minutesRemaining,
      attempts: locked[0].attempt_count
    };
  }

  // Get attempt record
  const now = new Date();
  const attemptRecord = await sql`
    SELECT attempt_count, window_start, last_attempt
    FROM login_attempts
    WHERE identifier = ${identifier}
    AND identifier_type = ${type}
    LIMIT 1
  `;

  // If no attempts recorded yet, allow the login
  if (attemptRecord.length === 0) {
    return { allowed: true };
  }

  const record = attemptRecord[0];
  const attemptCount = parseInt(record.attempt_count) || 0;
  const windowStart = new Date(record.window_start);

  // Calculate time windows
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Determine which threshold applies
  let last15min = 0, lastHour = 0, lastDay = 0;

  if (windowStart > oneDayAgo) {
    lastDay = attemptCount;
  }
  if (windowStart > oneHourAgo) {
    lastHour = attemptCount;
  }
  if (windowStart > fifteenMinAgo) {
    last15min = attemptCount;
  }

  // Determine lock duration
  let lockUntil: Date | null = null;
  let lockReason: string | null = null;

  if (lastDay >= 20) {
    lockUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    lockReason = '20+ attempts in 24 hours';
    console.warn(`🚨 SECURITY ALERT: ${lastDay} failed login attempts from ${type}=${identifier} in 24 hours`);
  } else if (lastHour >= 10) {
    lockUntil = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
    lockReason = '10+ attempts in 1 hour';
  } else if (last15min >= 5) {
    lockUntil = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes
    lockReason = '5+ attempts in 15 minutes';
  }

  if (lockUntil) {
    // Update existing record with lock
    await sql`
      UPDATE login_attempts
      SET locked_until = ${lockUntil}
      WHERE identifier = ${identifier}
      AND identifier_type = ${type}
    `;

    console.log(`🔒 LOGIN LOCKED: ${type}=${identifier}, reason: ${lockReason}, until: ${lockUntil.toISOString()}`);

    return {
      allowed: false,
      reason: 'rate_limit_exceeded',
      lockReason: lockReason,
      unlockTime: lockUntil,
      minutesRemaining: Math.ceil((lockUntil.getTime() - now.getTime()) / 60000)
    };
  }

  return { allowed: true };
}

/**
 * Record a failed login attempt
 */
export async function recordFailedAttempt(identifier: string, type: 'ip' | 'username' = 'ip'): Promise<void> {
  const sql = getDB();

  await sql`
    INSERT INTO login_attempts (identifier, identifier_type, attempt_count, window_start, last_attempt)
    VALUES (${identifier}, ${type}, 1, NOW(), NOW())
    ON CONFLICT (identifier, identifier_type)
    DO UPDATE SET
      attempt_count = login_attempts.attempt_count + 1,
      last_attempt = NOW()
  `;

  console.log(`❌ Failed login attempt recorded: ${type}=${identifier}`);
}

/**
 * Clear login attempts for an identifier (called on successful login)
 */
export async function clearLoginAttempts(identifier: string, type: 'ip' | 'username' = 'ip'): Promise<void> {
  const sql = getDB();

  const result = await sql`
    DELETE FROM login_attempts
    WHERE identifier = ${identifier}
    AND identifier_type = ${type}
  `;

  if (result.count && result.count > 0) {
    console.log(`✅ Cleared ${result.count} login attempt(s) for ${type}=${identifier}`);
  }
}

/**
 * Cleanup old login attempts (called periodically or via cron)
 */
export async function cleanupOldAttempts(): Promise<number> {
  const sql = getDB();

  const result = await sql`
    DELETE FROM login_attempts
    WHERE window_start < NOW() - INTERVAL '24 hours'
    AND (locked_until IS NULL OR locked_until < NOW())
  `;

  if (result.count && result.count > 0) {
    console.log(`🧹 Cleaned up ${result.count} old login attempt record(s)`);
  }

  return result.count || 0;
}
