(function () {
  'use strict';

  // =========================================================
  // Waffer Parts Matching Engine
  // =========================================================

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // =========================================================
  // 1. تعريف أنواع القطع
  // =========================================================

  const aliases = [
    {
      words: [
        'قرص فرامل',
        'اقراص فرامل',
        'أقراص فرامل',
        'هوب فرامل',
        'هوبات',
        'brake disc'
      ],
      product: 'brake disc',
      type: 'brake_disc'
    },

    {
      words: [
        'فحمة فرامل',
        'فحمات فرامل',
        'تيل فرامل',
        'brake pad'
      ],
      product: 'brake pad',
      type: 'brake_pad'
    },

    {
      words: [
        'فلتر هواء',
        'air filter'
      ],
      product: 'air filter',
      type: 'air_filter'
    },

    {
      words: [
        'فلتر مكيف',
        'فلتر تكييف',
        'ac filter',
        'cabin filter',
        'cabin air filter'
      ],
      product: 'cabin air filter',
      type: 'cabin_filter'
    },

    {
      words: [
        'فلتر زيت',
        'oil filter'
      ],
      product: 'oil filter',
      type: 'oil_filter'
    },

    {
      words: [
        'فلتر وقود',
        'فلتر بنزين',
        'fuel filter'
      ],
      product: 'fuel filter',
      type: 'fuel_filter'
    },

    {
      words: [
        'بواجي',
        'شمعة احتراق',
        'شمعات احتراق',
        'spark plug'
      ],
      product: 'spark plug',
      type: 'spark_plug'
    },

    {
      words: [
        'مساعد',
        'مساعدات',
        'shock absorber'
      ],
      product: 'shock absorber',
      type: 'shock_absorber'
    },

    {
      words: [
        'سير مكينة',
        'سير محرك',
        'سير دينمو',
        'v belt'
      ],
      product: 'v belt',
      type: 'belt'
    },

    {
      words: [
        'طرمبة ماء',
        'مضخة ماء',
        'water pump'
      ],
      product: 'water pump',
      type: 'water_pump'
    },

    {
      words: [
        'رديتر',
        'راديتر',
        'radiator'
      ],
      product: 'radiator',
      type: 'radiator'
    },

    {
      words: [
        'دينمو',
        'مولد',
        'alternator'
      ],
      product: 'alternator',
      type: 'alternator'
    },

    {
      words: [
        'سلف',
        'بادئ حركة',
        'starter'
      ],
      product: 'starter',
      type: 'starter'
    },

    {
      words: [
        'كلتش',
        'ديسك كلتش',
        'clutch disc'
      ],
      product: 'clutch disc',
      type: 'clutch_disc'
    },

    {
      words: [
        'سائل فرامل',
        'زيت فرامل',
        'brake fluid'
      ],
      product: 'brake fluid',
      type: 'brake_fluid'
    },

    {
      words: [
        'زيت محرك',
        'زيت مكينة',
        'engine oil',
        '5w 30',
        '5w30'
      ],
      product: 'engine oil',
      type: 'engine_oil'
    }
  ];

  // =========================================================
  // 2. تحديد نوع القطعة
  // =========================================================

  function classify(name) {
    const n = norm(name);

    for (const alias of aliases) {
      const found = alias.words.some(function (word) {
        return n.includes(norm(word));
      });

      if (found) {
        return alias;
      }
    }

    return {
      product: name || '',
      type: 'unknown'
    };
  }

  // =========================================================
  // 3. تحديد موضع القطعة المطلوب
  // =========================================================

  function detectRequestedAxle(name) {
    const n = norm(name);

    const frontWords = [
      'امامي',
      'أمامي',
      'امامية',
      'أمامية',
      'front',
      'front axle'
    ];

    const rearWords = [
      'خلفي',
      'خلفية',
      'rear',
      'rear axle'
    ];

    if (
      frontWords.some(function (word) {
        return n.includes(norm(word));
      })
    ) {
      return 'front';
    }

    if (
      rearWords.some(function (word) {
        return n.includes(norm(word));
      })
    ) {
      return 'rear';
    }

    return null;
  }

  // =========================================================
  // 4. مقارنة النصوص
  // =========================================================

  function scoreText(a, b) {
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

    let common = 0;

    aa
