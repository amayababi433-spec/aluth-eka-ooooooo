const crypto = require('crypto');

// Strong 256-bit AES encryption for collage photos
// Keeps images 100% private and unviewable on GitHub
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.ADMIN_SECRET || 'dmc_collage_vault_secure_key_787898').digest();
const IV_LENGTH = 16;

/**
 * Encrypt an image buffer into an obfuscated binary buffer
 * @param {Buffer} buffer - Raw JPEG/PNG image buffer
 * @returns {Buffer} - Encrypted binary buffer (with IV prepended)
 */
function encryptCollageBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    // Prepend IV so decryption can extract it
    return Buffer.concat([iv, encrypted]);
}

/**
 * Decrypt an obfuscated binary buffer into raw image buffer
 * @param {Buffer} encryptedBuffer - Encrypted binary buffer
 * @returns {Buffer|null} - Decrypted JPEG/PNG image buffer
 */
function decryptCollageBuffer(encryptedBuffer) {
    if (!Buffer.isBuffer(encryptedBuffer)) encryptedBuffer = Buffer.from(encryptedBuffer);
    if (encryptedBuffer.length < IV_LENGTH + 1) return null;

    // Check if it's already an unencrypted JPEG/PNG (magic bytes check)
    // JPEG magic bytes: FF D8 FF
    // PNG magic bytes: 89 50 4E 47
    if ((encryptedBuffer[0] === 0xFF && encryptedBuffer[1] === 0xD8 && encryptedBuffer[2] === 0xFF) ||
        (encryptedBuffer[0] === 0x89 && encryptedBuffer[1] === 0x50 && encryptedBuffer[2] === 0x4E && encryptedBuffer[3] === 0x47)) {
        return encryptedBuffer; // Already unencrypted image, pass through safely
    }

    try {
        const iv = encryptedBuffer.subarray(0, IV_LENGTH);
        const ciphertext = encryptedBuffer.subarray(IV_LENGTH);
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (e) {
        console.error('[Collage Decrypt Error]:', e.message);
        return null;
    }
}

module.exports = {
    encryptCollageBuffer,
    decryptCollageBuffer
};
