(function () {
  'use strict';

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
    market: 'SA',
    langId: 4,
    countryFilterId: 63
  };

  function catalogQuery() {
    return '&market=' + encodeURIComponent(catalogContext.market) +
      '&langId=' + encodeURIComponent(catalogContext.langId) +
      '&countryFilterId=' + encodeURIComponent(catalogContext.countryFilterId);
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
      const criteria = await loadArticleCriteria(article.articleId || article.id);
      const axle = criteriaAxle(criteria);
      return { article, axle };
    }));
    const verified = checked
      .filter(x => x.axle === requestedAxle)
      .map(x => ({ ...x.article, fittingPosition: x.axle === 'front' ? 'Front Axle' : 'Rear Axle', axleVerified: true }));
    return { articles: verified.slice(0,5), checked: checked.length, verified: verified.length };
  }

  async function matchWafferParts(analysisArg) {
    const analysis =
      analysisArg || window.analysis;

    const vehicleId =
      window.wafferVehicleId;

    const items =
      Array.isArray(analysis?.items)
        ? analysis.items
        : [];

    if (!analysis || !vehicleId || !items.length) {
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
        await loadProducts(vehicleId);

      const matches = [];

      for (const item of items) {
        const itemName =
          item?.name ||
          item?.description ||
          item?.item ||
          '';

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
          await loadArticles(
            vehicleId,
            product.productId
          );

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
          articles: requestedAxle ? filtered.articles : allArticles.slice(0,20)
        });
      }

      window.wafferPartMatches = matches;

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
