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
        'قرص فرامل',
        'اقراص فرامل',
        'أقراص فرامل',
        'هوب فرامل',
        'هوبات',
        'brake disc',
        'disc front'
      ],
      product: 'brake disc'
    },
    {
      words: [
        'فحمة فرامل',
        'فحمات فرامل',
        'تيل فرامل',
        'brake pad',
        'pad front',
        'pad rear'
      ],
      product: 'brake pad'
    },
    {
      words: [
        'فلتر هواء',
        'air filter'
      ],
      product: 'air filter'
    },
    {
      words: [
        'فلتر مكيف',
        'فلتر تكييف',
        'ac filter',
        'cabin filter'
      ],
      product: 'cabin air filter'
    },
    {
      words: [
        'فلتر زيت',
        'oil filter'
      ],
      product: 'oil filter'
    },
    {
      words: [
        'فلتر وقود',
        'فلتر بنزين',
        'fuel filter'
      ],
      product: 'fuel filter'
    },
    {
      words: [
        'بواجي',
        'شمعة احتراق',
        'شمعات احتراق',
        'spark plug'
      ],
      product: 'spark plug'
    },
    {
      words: [
        'مساعد',
        'مساعدات',
        'shock absorber'
      ],
      product: 'shock absorber'
    },
    {
      words: [
        'سير مكينة',
        'سير محرك',
        'سير دينمو',
        'v belt'
      ],
      product: 'v belt'
    },
    {
      words: [
        'طرمبة ماء',
        'مضخة ماء',
        'water pump'
      ],
      product: 'water pump'
    },
    {
      words: [
        'رديتر',
        'راديتر',
        'radiator'
      ],
      product: 'radiator'
    },
    {
      words: [
        'دينمو',
        'مولد',
        'alternator'
      ],
      product: 'alternator'
    },
    {
      words: [
        'سلف',
        'بادئ حركة',
        'starter'
      ],
      product: 'starter'
    },
    {
      words: [
        'كلتش',
        'ديسك كلتش',
        'clutch disc'
      ],
      product: 'clutch disc'
    },
    {
      words: [
        'سائل فرامل',
        'زيت فرامل',
        'brake fluid'
      ],
      product: 'brake fluid'
    }
  ];

  function translatedName(name) {
    const n = norm(name);

    for (const alias of aliases) {
      const found = alias.words.some(function (word) {
        return n.includes(norm(word));
      });

      if (found) {
        return alias.product;
      }
    }

    return name || '';
  }

  function score(a, b) {
    a = norm(a);
    b = norm(b);

    if (!a || !b) {
      return 0;
    }

    if (a === b) {
      return 100;
    }

    if (b.includes(a) || a.includes(b)) {
      return 92;
    }

    const aa = a.split(' ').filter(Boolean);
    const bb = b.split(' ').filter(Boolean);

    if (!aa.length || !bb.length) {
      return 0;
    }

    let common = 0;

    aa.forEach(function (word) {
      if (bb.includes(word)) {
        common++;
      }
    });

    return Math.round(
      (common / Math.max(aa.length, bb.length)) * 100
    );
  }

  async function loadProducts(vehicleId) {
    const response = await fetch(
      '/api/products?vehicleId=' +
      encodeURIComponent(vehicleId)
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
        encodeURIComponent(productId)
      );

      const data = await response.json();

      if (!response.ok) {
        return [];
      }

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

  function bestProduct(itemName, products) {
    const wanted = translatedName(itemName);

    let best = null;
    let bestScore = 0;

    products.forEach(function (product) {
      const currentScore = score(
        wanted,
        product.productName
      );

      if (currentScore > bestScore) {
        bestScore = currentScore;
        best = product;
      }
    });

    // لا نقبل المطابقات الضعيفة
    if (!best || bestScore < 55) {
      return null;
    }

    return {
      productId: best.productId,
      productName: best.productName,
      matchScore: bestScore
    };
  }

  async function matchWafferParts(analysisArg) {
    const analysis =
      analysisArg ||
      window.analysis;

    const vehicleId =
      window.wafferVehicleId;

    const items =
      Array.isArray(analysis?.items)
        ? analysis.items
        : [];

    if (!analysis) {
      console.warn(
        'Waffer: analysis is not available'
      );

      window.dispatchEvent(
        new CustomEvent(
          'wafferPartsMatched',
          { detail: [] }
        )
      );

      return [];
    }

    if (!vehicleId) {
      console.warn(
        'Waffer: vehicleId is not available'
      );

      window.dispatchEvent(
        new CustomEvent(
          'wafferPartsMatched',
          { detail: [] }
        )
      );

      return [];
    }

    if (!items.length) {
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

      for (let i = 0; i < items.length; i++) {
        const item = items[i] || {};

        const itemName =
          item.name ||
          item.description ||
          item.item ||
          '';

        const product =
          bestProduct(
            itemName,
            products
          );

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

        const articles =
          await loadArticles(
            vehicleId,
            product.productId
          );

        matches.push({
          workshopItem: itemName,

          productId:
            product.productId,

          productName:
            product.productName,

          matchScore:
            product.matchScore,

          countArticles:
            articles.length,

          articles:
            articles.slice(0, 20)
        });
      }

      window.wafferPartMatches =
        matches;

      window.dispatchEvent(
        new CustomEvent(
          'wafferPartsMatched',
          {
            detail: matches
          }
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
          {
            detail: []
          }
        )
      );

      return [];
    }
  }

  window.matchWafferParts =
    matchWafferParts;

})();
