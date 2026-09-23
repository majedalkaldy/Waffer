import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import analyzeHandler from '../api/analyze.js';
import priceCompareHandler from '../api/price-compare.js';

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

function loadMatcher(fetchImpl, analysis) {
  const source = fs.readFileSync(new URL('../parts-match.js', import.meta.url), 'utf8');
  const events = [];
  const window = {
    WAFFER_RUNTIME: {
      catalogProductsTimeoutMs: 200,
      catalogArticlesTimeoutMs: 200,
      catalogCriteriaTimeoutMs: 200
    },
    wafferVehicleId: '9445',
    wafferAnalysisRunId: 1,
    analysis,
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

test('deterministic quote -> analysis -> catalog -> price contract', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;

  const aiResult = {
    total: '1150 SAR',
    calculatedTotal: '1150 SAR',
    tax: '150 SAR',
    laborTotal: '200 SAR',
    warranty: 'غير مذكور',
    status: 'يحتاج تحقق من هوية القطعة قبل اعتماد السعر',
    transparency: 88,
    identityConfidence: 82,
    compatibilityConfidence: 74,
    priceConfidence: 20,
    overallConfidence: 67,
    missing: [],
    conflicts: [],
    nextActions: ['تحقق من رقم القطعة قبل الدفع'],
    items: [
      {
        name: 'فحمات فرامل أمامية',
        partNumber: 'BRK-123',
        manufacturer: 'Brand F',
        quantity: '1',
        price: '800',
        itemType: 'part',
        identityConfidence: 90,
        compatibility: 'يحتاج تحقق',
        priceAssessment: 'يحتاج مصدر سعر',
        conflict: 'لا يظهر',
        judgment: ''
      },
      {
        name: 'أجرة تركيب',
        partNumber: 'غير ظاهر',
        manufacturer: 'غير ظاهر',
        quantity: '1',
        price: '200',
        itemType: 'labor',
        identityConfidence: 0,
        compatibility: 'غير قابل للتحقق',
        priceAssessment: 'غير قابل للمقارنة',
        conflict: 'لا يظهر',
        judgment: ''
      },
      {
        name: 'ضبط زوايا',
        partNumber: 'غير ظاهر',
        manufacturer: 'غير ظاهر',
        quantity: '1',
        price: '150',
        itemType: 'service',
        identityConfidence: 0,
        compatibility: 'غير قابل للتحقق',
        priceAssessment: 'غير قابل للمقارنة',
        conflict: 'لا يظهر',
        judgment: ''
      }
    ],
    workshopMessage: 'أرجو تأكيد رقم قطعة فحمات الفرامل الأمامية قبل اعتماد العرض.'
  };

  try {
    process.env.OPENAI_API_KEY = 'test-key';
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).endsWith('/v1/responses')) {
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          status: 200,
          json: async () => ({ output_text: JSON.stringify(aiResult) })
        };
      }
      throw new Error('Unexpected analyze fetch: ' + url);
    };

    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const analyzeRes = responseRecorder();

    await analyzeHandler({
      method: 'POST',
      body: {
        fileData: 'data:image/jpeg;base64,' + jpegBytes.toString('base64'),
        fileName: 'estimate.jpg',
        mimeType: 'image/jpeg',
        vehicle: {
          make: 'FORD',
          model: 'Expedition',
          year: '2013',
          vin: '1HGCM82633A004352',
          market: 'SA',
          locale: 'ar-SA',
          currency: 'USD'
        }
      }
    }, analyzeRes);

    assert.equal(analyzeRes.statusCode, 200);
    const analysis = analyzeRes.body;
    assert.equal(analysis.engineContext.market, 'SA');
    assert.equal(analysis.engineContext.currency, 'SAR');
    assert.equal(analysis.acceptance.schemaValid, true);
    assert.equal(analysis.acceptance.hasVin, true);
    assert.equal(analysis.acceptance.hasPrintedTotal, true);
    assert.equal(analysis.acceptance.itemCount, 3);
    assert.equal(analysis.acceptance.identifiedParts, 1);
    assert.deepEqual(
      Array.from(analysis.items, item => item.itemType),
      ['part', 'labor', 'service']
    );

    const catalogFetch = async url => {
      const value = String(url);

      if (value.startsWith('/api/products')) {
        return {
          ok: true,
          json: async () => ({
            products: [
              { productId: 55, productName: 'brake pad set' },
              { productId: 99, productName: 'brake disc' }
            ]
          })
        };
      }

      if (value.startsWith('/api/articles')) {
        return {
          ok: true,
          json: async () => ({
            articles: [
              {
                articleId: 1001,
                articleNo: 'PAD-F',
                supplierName: 'Brand F',
                articleProductName: 'Brake Pad Set'
              },
              {
                articleId: 1002,
                articleNo: 'PAD-R',
                supplierName: 'Brand R',
                articleProductName: 'Brake Pad Set'
              }
            ]
          })
        };
      }

      if (value.includes('/api/article-criteria?articleId=1001')) {
        return {
          ok: true,
          json: async () => ({
            criteria: [
              { criteriaName: 'Fitting Position', criteriaValue: 'Front Axle' }
            ]
          })
        };
      }

      if (value.includes('/api/article-criteria?articleId=1002')) {
        return {
          ok: true,
          json: async () => ({
            criteria: [
              { criteriaName: 'Fitting Position', criteriaValue: 'Rear Axle' }
            ]
          })
        };
      }

      throw new Error('Unexpected catalog fetch: ' + value);
    };

    const { window, events } = loadMatcher(catalogFetch, analysis);
    const matches = await window.matchWafferParts(
      analysis,
      { runId: 1, signal: new AbortController().signal }
    );

    assert.equal(matches.length, 3);
    assert.equal(matches[0].productId, 55);
    assert.equal(matches[0].requestedAxle, 'front');
    assert.equal(matches[0].criteriaChecked, 2);
    assert.equal(matches[0].verifiedByAxle, 1);
    assert.equal(matches[0].countArticles, 1);
    assert.equal(matches[0].articles.length, 1);
    assert.equal(matches[0].articles[0].articleNo, 'PAD-F');
    assert.equal(matches[0].articles[0].fittingPosition, 'Front Axle');
    assert.equal(matches[0].articles[0].qualityLabel, 'بديل كتالوج — يحتاج تحقق');
    assert.equal(matches[1].skipped, true);
    assert.equal(matches[1].skipReason, 'NOT_A_PART');
    assert.equal(matches[2].skipped, true);
    assert.equal(window.wafferCatalogState.status, 'COMPLETED');
    assert.equal(window.wafferCatalogState.matched, 1);
    assert.equal(window.wafferCatalogState.partItems, 1);
    assert.equal(window.wafferCatalogState.skippedItems, 2);
    assert.equal(events.length, 1);

    const priceRes = responseRecorder();
    await priceCompareHandler({
      method: 'POST',
      body: {
        partName: analysis.items[0].name,
        partNumber: analysis.items[0].partNumber,
        workshopPrice: analysis.items[0].price,
        quantity: analysis.items[0].quantity,
        market: 'SA',
        locale: 'ar-SA',
        currency: 'USD',
        vehicle: {
          vehicleId: 9445,
          vin: '1HGCM82633A004352',
          make: 'FORD',
          model: 'Expedition',
          year: '2013'
        }
      }
    }, priceRes);

    assert.equal(priceRes.statusCode, 200);
    assert.equal(priceRes.body.context.market, 'SA');
    assert.equal(priceRes.body.context.currency, 'SAR');
    assert.equal(priceRes.body.verification.identity, 'PART_NUMBER_PRESENT');
    assert.equal(priceRes.body.verification.compatibility, 'READY_FOR_VERIFICATION');
    assert.equal(priceRes.body.workshop.unitPrice, 800);
    assert.equal(priceRes.body.workshop.totalPrice, 800);
    assert.equal(priceRes.body.marketPrice.source, null);
    assert.equal(priceRes.body.marketPrice.median, null);
    assert.equal(priceRes.body.saving.amount, null);
    assert.equal(priceRes.body.saving.status, 'NOT_CALCULATED');
    assert.equal(priceRes.body.status, 'WAITING_FOR_VERIFIED_PRICE_SOURCE');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
