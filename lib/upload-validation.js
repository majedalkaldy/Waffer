export const SUPPORTED_UPLOAD_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]);

function startsWithBytes(buffer, bytes) {
  if (!Buffer.isBuffer(buffer) || buffer.length < bytes.length) return false;
  return bytes.every((value, index) => buffer[index] === value);
}

export function detectUploadMime(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;

  if (startsWithBytes(buffer, [0x25,0x50,0x44,0x46,0x2d])) {
    return 'application/pdf';
  }

  if (startsWithBytes(buffer, [0xff,0xd8,0xff])) {
    return 'image/jpeg';
  }

  if (startsWithBytes(buffer, [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export function validateBase64Upload({ base64, claimedMimeType, maxBytes }) {
  const mimeType = String(claimedMimeType || '').toLowerCase();

  if (!SUPPORTED_UPLOAD_MIME_TYPES.includes(mimeType)) {
    return { ok: false, status: 415, code: 'UNSUPPORTED_FILE_TYPE' };
  }

  if (!base64 || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    return { ok: false, status: 400, code: 'INVALID_BASE64' };
  }

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) {
    return { ok: false, status: 400, code: 'EMPTY_FILE' };
  }

  if (Number(maxBytes) > 0 && buffer.length > Number(maxBytes)) {
    return { ok: false, status: 413, code: 'FILE_TOO_LARGE', bytes: buffer.length };
  }

  const detectedMimeType = detectUploadMime(buffer);
  if (!detectedMimeType) {
    return { ok: false, status: 415, code: 'UNKNOWN_FILE_SIGNATURE' };
  }

  if (detectedMimeType !== mimeType) {
    return {
      ok: false,
      status: 415,
      code: 'MIME_SIGNATURE_MISMATCH',
      detectedMimeType
    };
  }

  return {
    ok: true,
    buffer,
    bytes: buffer.length,
    mimeType: detectedMimeType
  };
}
