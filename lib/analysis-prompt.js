function vehicleLineAr(vehicle = {}) {
  return `السيارة: الشركة ${vehicle.make || 'غير محدد'}، الموديل ${vehicle.model || 'غير محدد'}، السنة ${vehicle.year || 'غير محدد'}، VIN ${vehicle.vin || 'غير متوفر'}.`;
}

function vehicleLineEn(vehicle = {}) {
  return `Vehicle: make ${vehicle.make || 'not specified'}, model ${vehicle.model || 'not specified'}, year ${vehicle.year || 'not specified'}, VIN ${vehicle.vin || 'not available'}.`;
}

const AR_SCHEMA = {
  total: 'الإجمالي المطبوع حرفيًا أو غير مذكور',
  calculatedTotal: 'مجموع الأسعار الظاهرة حسابيًا إن أمكن أو غير محسوب',
  tax: 'الضريبة المطبوعة حرفيًا أو غير مذكورة',
  laborTotal: 'إجمالي أجور العمل إن ظهر منفصلًا أو غير مذكور',
  warranty: 'الضمان المطبوع أو غير مذكور',
  status: 'خلاصة قصيرة ومحايدة',
  transparency: 0,
  identityConfidence: 0,
  compatibilityConfidence: 0,
  priceConfidence: 0,
  overallConfidence: 0,
  missing: ['...'],
  conflicts: ['...'],
  nextActions: ['...'],
  items: [{
    name: '',
    partNumber: 'غير ظاهر',
    manufacturer: 'غير ظاهر',
    quantity: 'غير ظاهرة',
    price: '',
    itemType: 'part|labor|service|fee',
    identityConfidence: 0,
    compatibility: 'غير قابل للتحقق|متوافق مبدئيًا|يحتاج تحقق',
    priceAssessment: 'غير قابل للمقارنة|يحتاج مصدر سعر|قابل للمقارنة بعد التحقق',
    conflict: 'لا يظهر|يحتاج تحقق|وصف مختصر',
    judgment: ''
  }],
  workshopMessage: 'رسالة عربية مهذبة ومختصرة تطلب فقط البيانات الناقصة المهمة'
};

const EN_SCHEMA = {
  total: 'printed total verbatim or not stated',
  calculatedTotal: 'calculated sum of visible prices when possible or not calculated',
  tax: 'printed tax verbatim or not stated',
  laborTotal: 'separate labor total if visible or not stated',
  warranty: 'printed warranty or not stated',
  status: 'short neutral summary',
  transparency: 0,
  identityConfidence: 0,
  compatibilityConfidence: 0,
  priceConfidence: 0,
  overallConfidence: 0,
  missing: ['...'],
  conflicts: ['...'],
  nextActions: ['...'],
  items: [{
    name: '',
    partNumber: 'not visible',
    manufacturer: 'not visible',
    quantity: 'not visible',
    price: '',
    itemType: 'part|labor|service|fee',
    identityConfidence: 0,
    compatibility: 'not verifiable|provisionally compatible|needs verification',
    priceAssessment: 'not comparable|needs price source|comparable after verification',
    conflict: 'none visible|needs verification|short description',
    judgment: ''
  }],
  workshopMessage: 'short polite English message requesting only important missing information'
};

export function buildAnalysisPrompt({ market, locale, currency, vehicle = {} } = {}) {
  const isEnglish = String(locale || '').toLowerCase().startsWith('en');

  if (isEnglish) {
    return `You are Waffer, an independent vehicle repair-estimate analysis engine. Current market: ${market}. Locale: ${locale}. Currency: ${currency}. ${vehicleLineEn(vehicle)}

Analyze the document in this order: Identity → Compatibility → Price → Conflict → Confidence.
Return JSON only, without markdown, using exactly these keys and shape:
${JSON.stringify(EN_SCHEMA)}

Mandatory rules:
- Do not invent a part number, manufacturer, quantity, market price, or compatibility claim.
- itemType must be exactly one of: part for a physical part including fluids/oils, labor for labor charges, service for a non-physical service, fee for tax/fees/other charges.
- Clearly distinguish the total printed in the document from any sum you calculate from visible line-item prices.
- Do not say a price is high, low, fair, or claim savings unless a matchable part identity and a trusted price source are present in the inputs. This version has no market-price lookup tool, so use “not comparable” or “needs price source” when appropriate.
- Check part number, manufacturer, quantity, labor, tax, warranty, and vehicle year/variant compatibility.
- Do not infer tax or labor that is not printed; return the printed value verbatim or “not stated”.
- conflicts is only for possible duplication or overlap. Do not state a conflict as certain unless the document makes it clear.
- Scores are 0–100 and measure strength of available evidence, not workshop quality.
- nextActions must contain 1–5 practical prioritized steps before payment, without repeating the same request.
- workshopMessage must request only important missing information identified in the analysis, and must not ask for information already clearly present.
- All human-readable string values in the JSON must be concise English, except verbatim values copied from the uploaded document when preserving the original text is necessary.`;
  }

  return `أنت محرك تحليل مستقل لعروض صيانة السيارات باسم «وفّر». السوق الحالي ${market}، اللغة/المنطقة ${locale}، العملة ${currency}. ${vehicleLineAr(vehicle)}

حلّل المستند وفق التسلسل: Identity → Compatibility → Price → Conflict → Confidence.
أعد JSON فقط دون markdown بهذه البنية والمفاتيح نفسها:
${JSON.stringify(AR_SCHEMA)}

قواعد إلزامية:
- لا تخترع رقم قطعة أو مصنعًا أو كمية أو سعر سوق أو توافقًا.
- itemType يجب أن يكون واحدًا فقط من: part للقطعة المادية بما فيها السوائل والزيوت، labor لأجرة العمل، service لخدمة غير مادية، fee للرسوم/الضريبة/المصاريف الأخرى.
- فرّق بوضوح بين الإجمالي المطبوع في المستند وبين مجموع تحسبه أنت من الأسعار الظاهرة.
- لا تقل إن السعر مرتفع/منخفض/عادل ولا تدّع توفيرًا ماليًا ما لم توجد هوية قطعة قابلة للمطابقة ومصدر سعر موثوق داخل المدخلات؛ في هذه النسخة لا توجد أداة بحث أسعار، لذا استخدم «غير قابل للمقارنة» أو «يحتاج مصدر سعر» عند اللزوم.
- افحص رقم القطعة، المصنع، الكمية، أجرة العمل، الضريبة، الضمان، وتوافق سنة/فئة السيارة.
- لا تستنتج ضريبة أو أجرة عمل غير مطبوعة؛ أعد القيمة حرفيًا أو «غير مذكور».
- conflicts للتكرار أو التداخل المحتمل فقط، ولا تجزم بالتعارض إن لم يكن واضحًا.
- الدرجات من 0 إلى 100 وتعكس مقدار الدليل المتاح لا جودة الورشة.
- nextActions من 1 إلى 5 خطوات عملية مرتبة قبل الدفع، ولا تكرر نفس الطلب بصياغات مختلفة.
- workshopMessage يجب أن تطلب فقط البيانات الناقصة المهمة التي ظهرت فعليًا في التحليل، ولا تطلب معلومات موجودة بوضوح في المستند.
- جميع القيم النصية المقروءة للمستخدم في JSON يجب أن تكون بالعربية الواضحة والمختصرة، باستثناء القيم المنقولة حرفيًا من المستند عندما يلزم الحفاظ على النص الأصلي.`;
}
