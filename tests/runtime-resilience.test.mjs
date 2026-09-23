import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { RUNTIME_CONFIG } from '../lib/runtime-config.js';

const swSource = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function loadServiceWorker({ keys = [], addAllError = null } = {}) {
  const listeners = new Map();
  const deleted = [];
  let skipWaitingCalls = 0;
  let claimCalls = 0;

  const caches = {
    async open() {
      return {
        async addAll() {
          if (addAllError) throw addAllError;
        },
        async put() {}
      };
    },
    async keys() {
      return [...keys];
    },
    async delete(key) {
      deleted.push(key);
      return true;
    },
    async match() {
      return undefined;
    }
  };

  const self = {
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    async skipWaiting() {
      skipWaitingCalls += 1;
    },
    clients: {
      async claim() {
        claimCalls += 1;
      }
    }
  };

  vm.runInNewContext(swSource, {
    self,
    caches,
    URL,
    fetch: async () => ({ ok: true, clone() { return this; } }),
    Promise,
    console
  });

  return {
    listeners,
    deleted,
    get skipWaitingCalls() { return skipWaitingCalls; },
    get claimCalls() { return claimCalls; }
  };
}

test('client timeout covers PDF upload + analysis + explicit safety margin', () => {
  assert.ok(RUNTIME_CONFIG.clientAnalysisSafetyMarginMs >= 10_000);
  assert.ok(
    RUNTIME_CONFIG.clientAnalysisTimeoutMs >=
      RUNTIME_CONFIG.pdfUploadTimeoutMs +
      RUNTIME_CONFIG.analysisTimeoutMs +
      RUNTIME_CONFIG.clientAnalysisSafetyMarginMs
  );
});

test('service worker activation deletes only obsolete Waffer shell caches', async () => {
  const worker = loadServiceWorker({
    keys: [
      'waffer-shell-v26',
      'waffer-shell-v27',
      'other-app-cache',
      'analytics-cache'
    ]
  });

  let activation;
  worker.listeners.get('activate')({
    waitUntil(promise) { activation = promise; }
  });

  await activation;
  assert.deepEqual(worker.deleted, ['waffer-shell-v26']);
  assert.equal(worker.claimCalls, 1);
});

test('failed shell precache fails installation and never calls skipWaiting', async () => {
  const worker = loadServiceWorker({
    addAllError: new Error('shell asset unavailable')
  });

  let installation;
  worker.listeners.get('install')({
    waitUntil(promise) { installation = promise; }
  });

  await assert.rejects(installation, /shell asset unavailable/);
  assert.equal(worker.skipWaitingCalls, 0);
});

test('successful shell precache calls skipWaiting only after cache succeeds', async () => {
  const worker = loadServiceWorker();

  let installation;
  worker.listeners.get('install')({
    waitUntil(promise) { installation = promise; }
  });

  await installation;
  assert.equal(worker.skipWaitingCalls, 1);
});
