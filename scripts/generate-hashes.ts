// Script to generate password hashes for default users
import crypto from 'crypto';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// Generate hashes for default password 'textable123'
const password = 'textable123';
const hash1 = hashPassword(password);
const hash2 = hashPassword(password);

console.log('Cameron hash:', hash1);
console.log('Kacy hash:', hash2);
