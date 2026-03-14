// Encrypts and decrypts GHL API keys before storing in Supabase.
// Uses AES-256-CBC — industry standard symmetric encryption.

const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
// ENCRYPT_KEY must be exactly 32 characters in your .env
const KEY = Buffer.from(process.env.ENCRYPT_KEY, 'utf8');

function encrypt(text) {
  const iv = crypto.randomBytes(16); // random initialization vector each time
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  // Store iv + encrypted together so we can decrypt later
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(stored) {
  const [ivHex, encryptedHex] = stored.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
