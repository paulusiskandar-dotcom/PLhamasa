const crypto = require('crypto');

const ALGORITHM  = 'aes-256-gcm';
const IV_LENGTH  = 16;
const TAG_LENGTH = 16;

function _key() {
    const k = process.env.ENCRYPTION_KEY;
    if (!k) throw new Error('ENCRYPTION_KEY not set in environment');
    return Buffer.from(k, 'hex');
}

function encrypt(plainText) {
    if (!plainText) return null;
    const iv       = crypto.randomBytes(IV_LENGTH);
    const cipher   = crypto.createCipheriv(ALGORITHM, _key(), iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag  = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('hex');
}

function decrypt(encryptedHex) {
    if (!encryptedHex) return null;
    try {
        const buf       = Buffer.from(encryptedHex, 'hex');
        const iv        = buf.subarray(0, IV_LENGTH);
        const authTag   = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
        const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
        const decipher  = crypto.createDecipheriv(ALGORITHM, _key(), iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (err) {
        console.error('[crypto] decrypt failed:', err.message);
        return null;
    }
}

// Detect if a string looks like an AES-256-GCM ciphertext (iv+tag+data hex, ≥66 hex chars)
function isEncrypted(str) {
    return typeof str === 'string' && /^[0-9a-f]+$/i.test(str) && str.length >= 66;
}

module.exports = { encrypt, decrypt, isEncrypted };
