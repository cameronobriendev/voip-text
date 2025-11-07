-- Migration 006: Add Brute Force Protection
-- Created: 2025-01-07
-- Purpose: Add login_attempts table for brute force attack prevention

-- Create login_attempts table
CREATE TABLE IF NOT EXISTS login_attempts (
  identifier VARCHAR(255) NOT NULL,
  identifier_type VARCHAR(10) NOT NULL CHECK (identifier_type IN ('ip', 'username')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  PRIMARY KEY (identifier, identifier_type)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_login_attempts_locked ON login_attempts(locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_login_attempts_window ON login_attempts(window_start);

-- Add comment
COMMENT ON TABLE login_attempts IS 'Tracks failed login attempts for brute force protection';
