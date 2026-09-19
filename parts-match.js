(function () {

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  // تحويل أسماء البنود العربية الشائعة إلى أسماء منتجات الكتالوج
  const aliases = [
    {
      words: ['قرص فرامل', 'اقراص فرامل', 'أقراص فرامل', 'هوب فرامل', 'هوبات'],
      product: 'brake disc'
    },
    {
      words: ['فحمة فرامل', 'فحمات فرامل', 'تيل فرامل'],
      product: 'brake pad'
    },
    {
      words: ['فلتر هواء'],
      product: 'air filter'
    },
    {
      words: ['فلتر مكيف', 'فلتر تكييف'],
      product: 'cabin air filter'
    },
    {
      words: ['فلتر زيت'],
      product: 'oil filter'
    },
    {
      words: ['فلتر وقود', 'فلتر بنزين'],
      product: 'fuel filter'
    },
    {
      words: ['بواجي', 'شمعة احتراق', 'شمعات احتراق'],
      product: 'spark plug'
    },
    {
      words: ['مساعد', 'مساعدات'],
      product: 'shock absorber'
    },
    {
      words: ['سير مكينة', 'سير محرك', 'سير دينمو'],
      product: 'v belt'
    },
    {
      words: ['طرمبة ماء', 'مضخة ماء'],
      product: 'water pump'
    },
    {
      words: ['رديتر', 'راديتر'],
      product: 'radiator'
    },
    {
      words: ['دينمو', 'مولد'],
      product: 'alternator'
    },
    {
      words: ['سلف', 'بادئ حركة'],
      product: 'starter'
    },
    {
      words: ['كلتش', 'ديسك كلتش'],
      product: 'clutch disc'
    },
    {
      words: ['سائل فرامل', 'زيت فرامل'],
      product: 'brake fluid'
    }
  ];


  function translatedName(name) {

    const n = norm(name);

    for (const a of aliases) {

      if (
        a.words.some(function (word) {
          return n.includes(norm(word));
        })
      ) {
        return a.product;
      }

    }

    return name || '';
  }


  function score(a, b) {

    a = norm(a);
    b
