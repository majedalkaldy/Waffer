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

  async function loadProducts(vehicleId) {
    const response = await fetch(
      '/api/products?vehicleId=' +
      encodeURIComponent(vehicleId) +
      catalogQuery()
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error ||
        data?.message ||
        'تعذر تحميل كتالوج القطع'
      );
    }

    return Array.isArray(data.products)
      ? data.products
      : [];
  }

  async function loadArticles(vehicleId, productId) {
    try {
      const response = await fetch(
        '/api/articles?vehicleId=' +
        encodeURIComponent(vehicleId) +
        '&productId=' +
        encodeURIComponent(productId) +
        catalogQuery()
      );

      const data = await response.json();

      if (!response.ok) return [];

      return Array.isArray(data.articles)
        ? data.articles
        : [];

    } catch (error) {
      console.error(
        'Article lookup error:',
        error
      );

      return [];
    }
  }

  async function loadArticleCriteria(articleId) {
    if (!articleId) return [];
    try {
      const response = await fetch('/api/article-criteria?articleId=' + encodeURIComponent(articleId) + catalogQuery());
      if (!response.ok) return [];
      const data = await response.json();
      if (Array.isArray(data.criteria)) return data.criteria;
      if (Array.isArray(data.criteria?.array)) return data.criteria.array;
      return [];
    } catch (error) {
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

  async function filterByAxle(articles, requestedAxle) {
    if (!requestedAxle || !Array.isArray(articles) || !articles.length) {
      return { articles: Array.isArray(articles) ? articles.slice(0,20) : [], checked: 0, verified: 0 };
    }
    // Limit and parallelize criteria checks to keep the UI responsive.
    const candidates = articles.slice(0, 10);
    const checked = await Promise.all(candidates.map(async article => {
      const articleId = article.articleId || article.id;
      if (!articleId) return { article, axle: null };
      const criteria = await Promise.race([
        loadArticleCriteria(articleId),
        new Promise(resolve => setTimeout(() => resolve([]), Math.min(runtimeValue('catalogCriteriaTimeoutMs', 8000), 4500)))
      ]);
      const axle = criteriaAxle(criteria);
      return { article, axle };
    }));
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
    for (const article of unique) {
      const supplier = norm(supplierName(article));
      if (supplier && suppliers.has(supplier)) continue;
      if (supplier) suppliers.add(supplier);
      diverse.push({ ...article, qualityLabel: qualityLabel(article) });
      if (diverse.length >= limit) return diverse;
    }

    for (const article of unique) {
      if (diverse.includes(article)) continue;
      diverse.push({ ...article, qualityLabel: qualityLabel(article) });
      if (diverse.length >= limit) break;
    }
    return diverse;
  }

  async function matchWafferParts(analysisArg) {
    const startedAt = Date.now();
    const analysis =
      analysisArg || window.analysis;

    catalogContext.market = String(
      analysis?.engineContext?.market ||
      window.analysis?.engineContext?.market ||
      'SA'
    ).toUpperCase();

    const vehicleId =
      window.wafferVehicleId;

    const items =
      Array.isArray(analysis?.items)
        ? analysis.items
        : [];

    if (!analysis || !vehicleId || !items.length) {
      window.wafferCatalogState = {
        status: !vehicleId ? 'NO_VEHICLE_ID' : !items.length ? 'NO_ITEMS' : 'NO_ANALYSIS',
        matched: 0,
        totalItems: items.length
      };
      window.wafferCatalogState = {
        status: 'FAILED',
        matched: 0,
        totalItems: items.length,
        error: String(error?.message || error)
      };

      window.dispatchEvent(
        new CustomEvent(
          'wafferPartsMatched',
          { detail: [] }
        )
      );

      return [];
    }

    try {
      const products =
        await Promise.race([
          loadProducts(vehicleId),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('انتهت مهلة تحميل كتالوج القطع')), runtimeValue('catalogProductsTimeoutMs', 12000))
          )
        ]);

      const matches = [];

      for (const item of items) {
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

        const product =
          bestProduct(itemName, products);

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

        const allArticles =
          await Promise.race([
            loadArticles(
              vehicleId,
              product.productId
            ),
            new Promise(resolve => setTimeout(() => resolve([]), runtimeValue('catalogArticlesTimeoutMs', 9000)))
          ]);

        const requestedAxle =
          (product.requestedType === 'brake_pad' || product.requestedType === 'brake_disc')
            ? detectRequestedAxle(itemName)
            : null;

        const filtered =
          await filterByAxle(allArticles, requestedAxle);

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

      window.wafferPartMatches = matches;

      const elapsedMs = Date.now() - startedAt;
      const partItems = items.filter(item => !item?.itemType || item.itemType === 'part');
      const skippedItems = matches.filter(x => x?.skipped).length;
      const axleRequested = matches.filter(x => x?.requestedAxle).length;
      const axleVerified = matches.filter(x => x?.requestedAxle && Number(x?.verifiedByAxle) > 0).length;
      window.wafferCatalogState = {
        status: 'COMPLETED',
        matched: matches.filter(x => x && x.productId).length,
        totalItems: items.length,
        partItems: partItems.length,
        skippedItems,
        axleRequested,
        axleVerified,
        elapsedMs
      };
      matches.forEach(match => { match.matchingElapsedMs = elapsedMs; });

      window.dispatchEvent(
        new CustomEvent(
          'wafferPartsMatched',
          { detail: matches }
        )
      );

      console.log(
        'Waffer parts matching completed:',
        matches
      );

      return matches;

    } catch (error) {
      console.error(
        'Waffer parts matching failed:',
        error
      );

      window.dispatchEvent(
        new CustomEvent(
          'wafferPartsMatched',
          { detail: [] }
        )
      );

      return [];
    }
  }

  window.matchWafferParts =
    matchWafferParts;

})();
