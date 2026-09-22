(function () {
  'use strict';

  function runtimeValue(key, fallback) {
    const value = Number(window.WAFFER_RUNTIME?.[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const aliases = [
    {
      words: [
        'قرص فرامل', 'اقراص فرامل', 'أقراص فرامل',
        'هوب فرامل', 'هوبات', 'brake disc'
      ],
      product: 'brake disc',
      type: 'brake_disc'
    },
    {
      words: [
        'فحمة فرامل', 'فحمات فرامل', 'تيل فرامل',
        'brake pad'
      ],
      product: 'brake pad',
      type: 'brake_pad'
    },
    {
      words: ['فلتر هواء', 'air filter'],
      product: 'air filter',
      type: 'air_filter'
    },
    {
      words: [
        'فلتر مكيف', 'فلتر تكييف',
        'ac filter', 'cabin filter'
      ],
      product: 'cabin air filter',
      type: 'cabin_filter'
    },
    {
      words: ['فلتر زيت', 'oil filter'],
      product: 'oil filter',
      type: 'oil_filter'
    },
    {
      words: [
        'فلتر وقود', 'فلتر بنزين', 'fuel filter'
      ],
      product: 'fuel filter',
      type: 'fuel_filter'
    },
    {
      words: [
        'بواجي', 'شمعة احتراق',
        'شمعات احتراق', 'spark plug'
      ],
      product: 'spark plug',
      type: 'spark_plug'
    },
    {
      words: [
        'مساعد', 'مساعدات', 'shock absorber'
      ],
      product: 'shock absorber',
      type: 'shock_absorber'
    },
    {
      words: [
        'سير مكينة', 'سير محرك',
        'سير دينمو', 'v belt'
      ],
      product: 'v belt',
      type: 'belt'
    },
    {
      words: [
        'طرمبة ماء', 'مضخة ماء', 'water pump'
      ],
      product: 'water pump',
      type: 'water_pump'
    },
    {
      words: ['رديتر', 'راديتر', 'radiator'],
      product: 'radiator',
      type: 'radiator'
    },
    {
      words: ['دينمو', 'مولد', 'alternator'],
      product: 'alternator',
      type: 'alternator'
    },
    {
      words: ['سلف', 'بادئ حركة', 'starter'],
      product: 'starter',
      type: 'starter'
    },
    {
      words: [
        'كلتش', 'ديسك كلتش', 'clutch disc'
      ],
      product: 'clutch disc',
      type: 'clutch_disc'
    },
    {
      words: [
        'سائل فرامل', 'زيت فرامل', 'brake fluid'
      ],
      product: 'brake fluid',
      type: 'brake_fluid'
    },
    {
      words: ['ذراع تحكم', 'مقص', 'مقصات', 'control arm', 'track control arm'],
      product: 'track control arm',
      type: 'control_arm'
    },
    {
      words: ['تي رود', 'طرف دركسون', 'طرف توجيه', 'tie rod end', 'track rod end'],
      product: 'tie rod end',
      type: 'tie_rod_end'
    },
    {
      words: ['رمان بلي', 'رمان عجل', 'wheel bearing', 'wheel hub bearing'],
      product: 'wheel bearing',
      type: 'wheel_bearing'
    },
    {
      words: ['ثرموستات', 'بلف حرارة', 'thermostat'],
      product: 'thermostat',
      type: 'thermostat'
    }
  ];

  function classify(name) {
    const n = norm(name);

    for (const alias of aliases) {
      if (
        alias.words.some(function (word) {
          return n.includes(norm(word));
        })
      ) {
        return alias;
      }
    }

    return {
      product: name || '',
      type: 'unknown'
    };
  }

  function detectRequestedAxle(name) {
    const n = norm(name);
    if (['front','front axle','امامي','أمامي','امامية','أمامية'].some(w => n.includes(norm(w)))) return 'front';
    if (['rear','rear axle','خلفي','خلفية'].some(w => n.includes(norm(w)))) return 'rear';
    return null;
  }

  function scoreText(a, b) {
    a = norm(a);
    b = norm(b);

    if (!a || !b) return 0;

    if (a === b) return 100;

    if (b.includes(a) || a.includes(b)) {
      return 92;
    }

    const aa = a.split(' ').filter(Boolean);
    const bb = b.split(' ').filter(Boolean);

    let common = 0;

    aa.forEach(function (word) {
      if (bb.includes(word)) common++;
    });

    return Math.round(
      (common / Math.max(aa.length, bb.length)) * 100
    );
  }

  function penalty(type, productName) {
    const p = norm(productName);

    const accessoryWords = [
      'accessory kit',
      'repair kit',
      'fitting kit',
      'mounting kit',
      'wear indicator',
      'warning contact',
      'brake pad wear'
    ];

    const isAccessory = accessoryWords.some(function (x) {
      return p.includes(x);
    });

    // عند طلب الفحمة نفسها لا نسمح لطقم الملحقات بالفوز
    if (type === 'brake_pad' && isAccessory) {
      return 60;
    }

    // وعند طلب قرص الفرامل لا نريد ملحقاته
    if (type === 'brake_disc' && isAccessory) {
      return 60;
    }

    return 0;
  }

  function bonus(type, productName) {
    const p = norm(productName);

    if (
      type === 'brake_disc' &&
      (p === 'brake disc' ||
       p.includes('brake disc'))
    ) {
      return 20;
    }

    if (
      type === 'brake_pad' &&
      (
        p === 'brake pad' ||
        p === 'brake pad set' ||
        p.includes('brake pad set')
      )
    ) {
      return 25;
    }

    if (
      type === 'air_filter' &&
      p === 'air filter'
    ) {
      return 20;
    }

    if (
      type === 'oil_filter' &&
      p === 'oil filter'
    ) {
      return 20;
    }

    return 0;
  }

  function bestProduct(itemName, products) {
    const wanted = classify(itemName);

    let best = null;
    let bestScore = -1;

    products.forEach(function (product) {
      let s = scoreText(
        wanted.product,
        product.productName
      );

      s += bonus(
        wanted.type,
        product.productName
      );

      s -= penalty(
        wanted.type,
        product.productName
      );

      s = Math.max(0, Math.min(100, s));

      if (s > bestScore) {
        bestScore = s;
        best = product;
      }
    });

    if (!best || bestScore < 55) {
      return null;
    }

    return {
      productId: best.productId,
      productName: best.productName,
      matchScore: bestScore,
      requestedType: wanted.type
    };
  }

  const catalogContext = {
    market: 'SA'
  };

  function catalogQuery() {
    return '&market=' + encodeURIComponent(catalogContext.market);
  }

  function abortError(message = 'Operation cancelled') {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
  }

  function throwIfAborted(signal) {
    if (signal?.aborted) throw abortError();
  }

  async function fetchCatalogJson(url, { signal, timeoutMs }) {
    throwIfAborted(signal);
    const controller = new AbortController();
    let timedOut = false;
    const abortFromParent = () => controller.abort();

    if (signal) signal.addEventListener('abort', abortFromParent, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data?.error || data?.message || 'Catalog request failed');
        error.code = 'CATALOG_UPSTREAM_ERROR';
        throw error;
      }
      return data;
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (controller.signal.aborted && timedOut) {
        const timeoutError = new Error('Catalog request timed out');
        timeoutError.code = 'CATALOG_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', abortFromParent);
    }
  }

  async function loadProducts(vehicleId, signal) {
    const data = await fetchCatalogJson(
      '/api/products?vehicleId=' +
      encodeURIComponent(vehicleId) +
      catalogQuery(),
      { signal, timeoutMs: runtimeValue('catalogProductsTimeoutMs', 12000) }
    );

    return Array.isArray(data.products) ? data.products : [];
  }

  async function loadArticles(vehicleId, productId, signal) {
    try {
      const data = await fetchCatalogJson(
        '/api/articles?vehicleId=' +
        encodeURIComponent(vehicleId) +
        '&productId=' +
        encodeURIComponent(productId) +
        catalogQuery(),
        { signal, timeoutMs: runtimeValue('catalogArticlesTimeoutMs', 9000) }
      );
      return Array.isArray(data.articles) ? data.articles : [];
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      console.error('Article lookup error:', error);
      return [];
    }
  }

  async function loadArticleCriteria(articleId, signal) {
    if (!articleId) return [];
    try {
      const data = await fetchCatalogJson(
        '/api/article-criteria?articleId=' + encodeURIComponent(articleId) + catalogQuery(),
        { signal, timeoutMs: Math.min(runtimeValue('catalogCriteriaTimeoutMs', 8000), 4500) }
      );
      if (Array.isArray(data.criteria)) return data.criteria;
      if (Array.isArray(data.criteria?.array)) return data.criteria.array;
      return [];
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      console.error('Article criteria error:', articleId, error);
      return [];
    }
  }

  function criteriaAxle(criteria) {
    for (const row of Array.isArray(criteria) ? criteria : []) {
      const name = norm(row?.criteriaName || row?.name || '');
      const value = norm(row?.criteriaValue || row?.value || '');
      if (!name.includes('fitting position')) continue;
      if (value.includes('front axle') || value === 'front') return 'front';
      if (value.includes('rear axle') || value === 'rear') return 'rear';
    }
    return null;
  }

  async function filterByAxle(articles, requestedAxle, signal) {
    throwIfAborted(signal);
    if (!requestedAxle || !Array.isArray(articles) || !articles.length) {
      return { articles: Array.isArray(articles) ? articles.slice(0,20) : [], checked: 0, verified: 0 };
    }
    // Limit and parallelize criteria checks to keep the UI responsive.
    const candidates = articles.slice(0, 10);
    const checked = await Promise.all(candidates.map(async article => {
      throwIfAborted(signal);
      const articleId = article.articleId || article.id;
      if (!articleId) return { article, axle: null };
      const criteria = await loadArticleCriteria(articleId, signal);
      throwIfAborted(signal);
      const axle = criteriaAxle(criteria);
      return { article, axle };
    }));
    throwIfAborted(signal);
    const verified = checked
      .filter(x => x.axle === requestedAxle)
      .map(x => ({ ...x.article, fittingPosition: x.axle === 'front' ? 'Front Axle' : 'Rear Axle', axleVerified: true }));
    return { articles: verified.slice(0,5), checked: checked.length, verified: verified.length };
  }

  function qualityLabel(article) {
    const supplier = norm(supplierName(article));
    const product = norm(article?.articleProductName || article?.productName || '');
    if (!supplier && !product) return 'غير مصنف';
    // This is deliberately descriptive, not a claim of OEM status.
    if (product.includes('oe') || product.includes('original equipment')) return 'مرشح OE — يحتاج تحقق';
    return 'بديل كتالوج متوافق — يحتاج تحقق';
  }

  function articleKey(article) {
    return norm(article?.articleNo || article?.articleNumber || article?.id || article?.articleId || '');
  }

  function supplierName(article) {
    return String(article?.supplierName || article?.brandName || article?.manufacturerName || '').trim();
  }

  function shortlistArticles(articles, limit = 3) {
    const seen = new Set();
    const suppliers = new Set();
    const unique = [];

    for (const article of Array.isArray(articles) ? articles : []) {
      const key = articleKey(article);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(article);
    }

    // Prefer supplier diversity so the user sees useful alternatives, not duplicates.
    const diverse = [];
    const selectedKeys = new Set();
    for (const article of unique) {
      const supplier = norm(supplierName(article));
      if (supplier && suppliers.has(supplier)) continue;
      if (supplier) suppliers.add(supplier);
      selectedKeys.add(articleKey(article));
      diverse.push({ ...article, qualityLabel: qualityLabel(article) });
      if (diverse.length >= limit) return diverse;
    }

    for (const article of unique) {
      if (selectedKeys.has(articleKey(article))) continue;
      selectedKeys.add(articleKey(article));
      diverse.push({ ...article, qualityLabel: qualityLabel(article) });
      if (diverse.length >= limit) break;
    }
    return diverse;
  }

  async function matchWafferParts(analysisArg, options = {}) {
    const startedAt = Date.now();
    const analysis = analysisArg || window.analysis;
    const signal = options?.signal;
    const runId = options?.runId ?? null;

    const isCurrent = () =>
      !signal?.aborted &&
      (runId == null || window.wafferAnalysisRunId === runId);

    const ensureCurrent = () => {
      throwIfAborted(signal);
      if (runId != null && window.wafferAnalysisRunId !== runId) {
        throw abortError('Stale analysis run');
      }
    };

    const emitMatches = matches => {
      if (!isCurrent()) return;
      matches.wafferRunId = runId;
      window.dispatchEvent(
        new CustomEvent(
          'wafferPartsMatched',
          { detail: matches }
        )
      );
    };

    catalogContext.market = String(
      analysis?.engineContext?.market ||
      window.analysis?.engineContext?.market ||
      'SA'
    ).toUpperCase();

    const vehicleId = window.wafferVehicleId;
    const items = Array.isArray(analysis?.items) ? analysis.items : [];

    if (!analysis || !vehicleId || !items.length) {
      if (isCurrent()) {
        window.wafferCatalogState = {
          status: !analysis ? 'NO_ANALYSIS' : !vehicleId ? 'NO_VEHICLE_ID' : 'NO_ITEMS',
          matched: 0,
          totalItems: items.length,
          runId
        };
        emitMatches([]);
      }
      return [];
    }

    try {
      ensureCurrent();
      const products = await loadProducts(vehicleId, signal);
      ensureCurrent();

      const matches = [];

      for (const item of items) {
        ensureCurrent();

        if (item?.itemType && item.itemType !== 'part') {
          matches.push({
            workshopItem: item?.name || item?.description || item?.item || '',
            skipped: true,
            skipReason: 'NOT_A_PART',
            productId: null,
            productName: null,
            matchScore: 0,
            countArticles: 0,
            articles: []
          });
          continue;
        }

        const itemName =
          item?.name ||
          item?.description ||
          item?.item ||
          '';

        const itemType = String(item?.itemType || 'part').toLowerCase();
        if (itemType !== 'part') {
          matches.push({
            workshopItem: itemName,
            productId: null,
            productName: null,
            matchScore: 0,
            skippedReason: 'NON_PART_ITEM',
            countArticles: 0,
            articles: []
          });
          continue;
        }

        const product = bestProduct(itemName, products);

        if (!product) {
          matches.push({
            workshopItem: itemName,
            productId: null,
            productName: null,
            matchScore: 0,
            countArticles: 0,
            articles: []
          });
          continue;
        }

        const allArticles = await loadArticles(
          vehicleId,
          product.productId,
          signal
        );
        ensureCurrent();

        const requestedAxle =
          (product.requestedType === 'brake_pad' || product.requestedType === 'brake_disc')
            ? detectRequestedAxle(itemName)
            : null;

        const filtered = await filterByAxle(
          allArticles,
          requestedAxle,
          signal
        );
        ensureCurrent();

        matches.push({
          workshopItem: itemName,
          productId: product.productId,
          productName: product.productName,
          matchScore: product.matchScore,
          requestedType: product.requestedType,
          requestedAxle: requestedAxle,
          totalCatalogArticles: allArticles.length,
          criteriaChecked: filtered.checked,
          verifiedByAxle: filtered.verified,
          countArticles: requestedAxle ? filtered.verified : allArticles.length,
          articles: shortlistArticles(requestedAxle ? filtered.articles : allArticles, 3)
        });
      }

      ensureCurrent();
      const elapsedMs = Date.now() - startedAt;
      const partItems = items.filter(item => !item?.itemType || item.itemType === 'part');
      const skippedItems = matches.filter(x => x?.skipped).length;
      const axleRequested = matches.filter(x => x?.requestedAxle).length;
      const axleVerified = matches.filter(x => x?.requestedAxle && Number(x?.verifiedByAxle) > 0).length;

      window.wafferPartMatches = matches;
      window.wafferCatalogState = {
        status: 'COMPLETED',
        matched: matches.filter(x => x && x.productId).length,
        totalItems: items.length,
        partItems: partItems.length,
        skippedItems,
        axleRequested,
        axleVerified,
        elapsedMs,
        runId
      };
      matches.forEach(match => { match.matchingElapsedMs = elapsedMs; });
      emitMatches(matches);

      console.log(
        'Waffer parts matching completed:',
        matches
      );

      return matches;

    } catch (error) {
      if (error?.name === 'AbortError' || !isCurrent()) {
        return [];
      }

      console.error(
        'Waffer parts matching failed:',
        error
      );

      window.wafferCatalogState = {
        status: error?.code === 'CATALOG_TIMEOUT' ? 'TIMED_OUT' : 'FAILED',
        matched: 0,
        totalItems: items.length,
        error: String(error?.message || error),
        runId
      };
      emitMatches([]);
      return [];
    }
  }

  window.matchWafferParts =
    matchWafferParts;

})();
