(function () {
  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  // مرادفات تساعد على مطابقة أسماء الورشة العربية
  // مع أسماء منتجات TecDoc الإنجليزية.
  const aliases = [
    { words: ['قرص فرامل', 'اقراص فرامل', 'هوب فرامل', 'هوبات'], product: 'brake disc' },
    { words: ['فحمة فرامل', 'فحمات فرامل', 'تيل فرامل'], product: 'brake pad' },
    { words: ['فلتر هواء'], product: 'air filter' },
    { words: ['فلتر مكيف', 'فلتر تكييف'], product: 'cabin air filter' },
    { words: ['فلتر زيت'], product: 'oil filter' },
    { words: ['فلتر وقود', 'فلتر بنزين'], product: 'fuel filter' },
    { words: ['بواجي', 'شمعة احتراق', 'شمعات احتراق'], product: 'spark plug' },
    { words: ['مساعد', 'مساعدات'], product: 'shock absorber' },
    { words: ['سير مكينة', 'سير محرك', 'سير دينمو'], product: 'v belt' },
    { words: ['طرمبة ماء', 'مضخة ماء'], product: 'water pump' },
    { words: ['رديتر', 'راديتر'], product: 'radiator' },
    { words: ['دينمو', 'مولد'], product: 'alternator' },
    { words: ['سلف', 'بادئ حركة'], product: 'starter' },
    { words: ['كلتش', 'ديسك كلتش'], product: 'clutch disc' },
    { words: ['سائل فرامل', 'زيت فرامل'], product: 'brake fluid' }
  ];

  function translatedName(name) {
    const n = norm(name);

    for (const a of aliases) {
      if (a.words.some(w => n.includes(norm(w)))) {
        return a.product;
      }
    }

    return name || '';
  }

  function score(a, b) {
    a = norm(a);
    b = norm(b);

    if (!a || !b) return 0;
    if (a === b) return 100;
    if (a.includes(b) || b.includes(a)) return 85;

    const A = new Set(a.split(' ').filter(Boolean));
    const B = new Set(b.split(' ').filter(Boolean));

    let common = 0;
    A.forEach(x => {
      if (B.has(x)) common++;
    });

    return Math.round(
      (common / Math.max(A.size, B.size, 1)) * 100
    );
  }

  async function loadProducts(vehicleId) {
    const r = await fetch(
      '/api/products?vehicleId=' +
      encodeURIComponent(vehicleId)
    );

    if (!r.ok) {
      throw new Error('Products API ' + r.status);
    }

    const d = await r.json();

    return Array.isArray(d.products)
      ? d.products
      : Array.isArray(d)
        ? d
        : [];
  }

  function bestProduct(itemName, products) {
    const original = itemName || '';
    const translated = translatedName(original);

    let best = null;
    let bestScore = 0;

    for (const p of products) {
      const productName = p.productName || '';

      const directScore = score(original, productName);
      const translatedScore = score(translated, productName);
      const s = Math.max(directScore, translatedScore);

      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }

    return best && bestScore >= 35
      ? {
          ...best,
          matchScore: bestScore,
          searchedAs: translated
        }
      : null;
  }

  async function loadArticles(vehicleId, productId) {
    const r = await fetch(
      '/api/articles?vehicleId=' +
      encodeURIComponent(vehicleId) +
      '&productId=' +
      encodeURIComponent(productId)
    );

    if (!r.ok) {
      throw new Error('Articles API ' + r.status);
    }

    const d = await r.json();

    return {
      countArticles: Number(d.countArticles || 0),
      articles: Array.isArray(d.articles) ? d.articles : []
    };
  }

  async function matchOneItem(item, products, vehicleId) {
    const match = bestProduct(item?.name || '', products);

    if (!match) {
      return {
        workshopItem: item?.name || '',
        match: null,
        productId: null,
        productName: null,
        matchScore: 0,
        countArticles: 0,
        articles: []
      };
    }

    let articleData = {
      countArticles: 0,
      articles: []
    };

    try {
      articleData = await loadArticles(
        vehicleId,
        match.productId
      );
    } catch (e) {
      console.error(
        'Articles lookup failed:',
        item?.name,
        e
      );
    }

    return {
      workshopItem: item?.name || '',
      match,
      productId: match.productId,
      productName: match.productName,
      matchScore: match.matchScore,
      searchedAs: match.searchedAs,
      countArticles: articleData.countArticles,

      // نحتفظ بأول 20 نتيجة فقط في المتصفح.
      articles: articleData.articles.slice(0, 20).map(a => ({
        articleId: a.articleId,
        articleNo: a.articleNo,
        supplierName: a.supplierName,
        supplierId: a.supplierId,
        productName: a.articleProductName,
        image: a.s3image || null
      }))
    };
  }

  async function matchWafferParts() {
    if (!window.analysis) {
      console.warn('Waffer: analysis is not available');
      return [];
    }

    if (!window.wafferVehicleId) {
      console.warn('Waffer: vehicleId is not available');
      return [];
    }

    const vehicleId = window.wafferVehicleId;

    const products = await loadProducts(vehicleId);

    const items = Array.isArray(window.analysis.items)
      ? window.analysis.items
      : [];

    const matches = [];

    // بالتتابع حتى لا نرسل مئات الطلبات في وقت واحد.
    for (const item of items) {
      try {
        const result = await matchOneItem(
          item,
          products,
          vehicleId
        );

        matches.push(result);
      } catch (e) {
        console.error(
          'Part matching failed:',
          item?.name,
          e
        );

        matches.push({
          workshopItem: item?.name || '',
          match: null,
          productId: null,
          productName: null,
          matchScore: 0,
          countArticles: 0,
          articles: []
        });
      }
    }

    window.wafferPartMatches = matches;

    console.log(
      'Waffer parts matching completed:',
      matches
    );

    // إشارة سنستخدمها لاحقًا لتحديث واجهة النتائج.
    window.dispatchEvent(
      new CustomEvent('wafferPartsMatched', {
        detail: matches
      })
    );

    return matches;
  }

  window.matchWafferParts = matchWafferParts;
})();
