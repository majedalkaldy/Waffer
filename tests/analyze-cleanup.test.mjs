import test from 'node:test';
import assert from 'node:assert/strict';

import analyzeHandler from '../api/analyze.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';

const originalFetch = globalThis.fetch;
const originalOpenAIKey = process.env.OPENAI_API_KEY;
const originalTimeouts = {
  analysisTimeoutMs: RUNTIME_CONFIG.analysisTimeoutMs,
  pdfUploadTimeoutMs: RUNTIME_CONFIG.pdfUploadTimeoutMs,
  pdfCleanupTimeoutMs: RUNTIME_CONFIG.pdfCleanupTimeoutMs
};

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return value; }
  };
}

function abortError() {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

function hangingBody(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
  });
}

const pdfData = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.7\n').toString('base64');
const request = {
  method: 'POST',
  body: {
    fileData: pdfData,
    fileName: 'quote.pdf',
    mimeType: 'application/pdf',
    vehicle: { market: 'SA', locale: 'ar-SA' }
  }
};

test.before(() => {
  process.env.OPENAI_API_KEY = 'test-key';
  RUNTIME_CONFIG.analysisTimeoutMs = 25;
  RUNTIME_CONFIG.pdfUploadTimeoutMs = 25;
  RUNTIME_CONFIG.pdfCleanupTimeoutMs = 25;
});

test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAIKey;
  Object.assign(RUNTIME_CONFIG, originalTimeouts);
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('analysis body timeout returns 504 and deletes uploaded PDF', async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });

    if (String(url).endsWith('/v1/files') && options.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ id: 'file_timeout' }) };
    }
    if (String(url).endsWith('/v1/responses')) {
      return { ok: true, status: 200, json: () => hangingBody(options.signal) };
    }
    if (String(url).includes('/v1/files/file_timeout') && options.method === 'DELETE') {
      return { ok: true, status: 200 };
    }
    throw new Error('Unexpected fetch: ' + url);
  };

  const res = responseRecorder();
  await analyzeHandler(request, res);

  assert.equal(res.statusCode, 504);
  assert.equal(res.body?.code, 'ANALYSIS_TIMEOUT');
  assert.ok(calls.some(call => call.method === 'DELETE' && call.url.includes('file_timeout')));
});

test('malformed model JSON returns 502 and still deletes uploaded PDF', async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });

    if (String(url).endsWith('/v1/files') && options.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ id: 'file_bad_json' }) };
    }
    if (String(url).endsWith('/v1/responses')) {
      return { ok: true, status: 200, json: async () => ({ output_text: 'not-json' }) };
    }
    if (String(url).includes('/v1/files/file_bad_json') && options.method === 'DELETE') {
      return { ok: true, status: 200 };
    }
    throw new Error('Unexpected fetch: ' + url);
  };

  const res = responseRecorder();
  await analyzeHandler(request, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body?.code, 'ANALYSIS_UPSTREAM_INVALID');
  assert.ok(calls.some(call => call.method === 'DELETE' && call.url.includes('file_bad_json')));
});
