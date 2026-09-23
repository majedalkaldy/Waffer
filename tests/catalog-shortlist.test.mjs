import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadMatcher(fetchImpl) {
  const source = fs.readFileSync(new URL('../parts-match.js', import.meta.url), 'utf8');
  const events = [];
  const window = {
    WAFFER_RUNTIME: {
      catalogProductsTimeoutMs: 100,
      catalogArticlesTimeoutMs: 100,
      catalogCriteriaTimeoutMs: 100
    },
    wafferVehicleId: '123',
    wafferAnalysisRunId: 1,
    analysis: null,
    dispatchEvent(event) { events.push(event); }
  };

  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }

  vm.runInNewContext(source, {
    window,
    fetch: fetchImpl,
    CustomEvent,
    AbortController,
    setTimeout,
    clearTimeout,
    console: { log() {}, error() {} }
  });

  return { window, events };
}

test('catalog shortlist keeps same part number from different suppliers but removes exact supplier duplicates', async () => {
  const fetchImpl = async url => {
    if (String(url).startsWith('/api/products')) {
      return {
        ok: true,
        json: async () => ({
          products: [{ productId: 7, productName: 'air filter' }]
        })
      };
    }

    if (String(url).startsWith('/api/articles')) {
      return {
        ok: true,
        json: async () => ({
          articles: [
            { articleId: 1, articleNo: 'AF-100', supplierName: 'Brand A', articleProductName: 'Air Filter' },
            { articleId: 2, articleNo: 'AF-100', supplierName: 'Brand A', articleProductName: 'Air Filter duplicate' },
            { articleId: 3, articleNo: 'AF-100', supplierName: 'Brand B', articleProductName: 'Air Filter' }
          ]
        })
      };
    }

    throw new Error('Unexpected fetch: ' + url);
  };

  const { window, events } = loadMatcher(fetchImpl);
  const analysis = {
    engineContext: { market: 'SA' },
    items: [{ name: 'air filter', itemType: 'part' }]
  };
  window.analysis = analysis;

  const matches = await window.matchWafferParts(
    analysis,
    { runId: 1, signal: new AbortController().signal }
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].articles.length, 2);
  assert.deepEqual(
    Array.from(matches[0].articles, article => article.supplierName).sort(),
    ['Brand A', 'Brand B']
  );
  assert.equal(events.length, 1);
});
