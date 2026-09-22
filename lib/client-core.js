// Browser-neutral helpers. No credentials, storage, or user data are retained here.
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export class RequestError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.name = 'RequestError';
    this.code = code;
    this.status = status;
  }
}

// The deadline covers both headers AND response body. Aborting cancels the request,
// rather than merely leaving an unfinished request behind after Promise.race().
export async function fetchJSON(url, options = {}) {
  const { timeoutMs = 15000, signal, fetchImpl = globalThis.fetch, ...init } = options;
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    let data;
    try { data = await response.json(); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      throw new RequestError(response.status === 413 ? 'FILE_TOO_LARGE' : 'INVALID_RESPONSE', response.status);
    }
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!response.ok) {
      const code = typeof data?.code === 'string' && /^[A-Z_]{1,64}$/.test(data.code)
        ? data.code : response.status === 413 ? 'FILE_TOO_LARGE'
        : response.status === 429 ? 'RATE_LIMITED' : response.status === 504 ? 'TIMEOUT' : 'REQUEST_FAILED';
      throw new RequestError(code, response.status);
    }
    return data;
  } catch (error) {
    if (timedOut) throw new RequestError('TIMEOUT', 504);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export function fileType(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type) return type;
  const extension = String(file?.name || '').split('.').pop().toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' })[extension] || '';
}

export function validateFile(file) {
  if (!file) return 'FILE_REQUIRED';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'FILE_EMPTY';
  if (file.size > MAX_UPLOAD_BYTES) return 'FILE_TOO_LARGE';
  if (!SUPPORTED_TYPES.includes(fileType(file))) return 'FILE_TYPE';
  return null;
}

export function validateYear(value, currentYear = new Date().getFullYear()) {
  const year = String(value ?? '').trim();
  return !year || (/^\d{4}$/.test(year) && Number(year) >= 1886 && Number(year) <= currentYear + 1);
}

export function text(value) {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? String(value) : '';
}
export function list(value) { return Array.isArray(value) ? value : []; }
export function score(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value) : null;
}
export function assertAnalysis(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.items)
      || data.acceptance?.schemaValid === false
      || data.items.some(item => !item || typeof item !== 'object' || Array.isArray(item) || !text(item.name).trim())) {
    throw new RequestError('INVALID_ANALYSIS');
  }
  return data;
}

export function readAsDataURL(file, signal) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => { reader.abort(); reject(new DOMException('Aborted', 'AbortError')); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new RequestError('FILE_READ'));
    reader.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    reader.onloadend = () => signal?.removeEventListener('abort', abort);
    reader.readAsDataURL(file);
  });
}

export function arrayAt(data, paths) {
  if (Array.isArray(data)) return data;
  for (const path of paths) {
    const value = path.split('.').reduce((value, key) => value?.[key], data);
    if (Array.isArray(value)) return value;
  }
  return [];
}

export async function mapLimit(values, concurrency, fn) {
  let cursor = 0;
  const output = new Array(values.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await fn(values[index], index);
    }
  }));
  return output;
}
