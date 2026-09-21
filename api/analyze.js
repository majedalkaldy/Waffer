export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY غير مضاف في Vercel.' });

  try {
    const { fileData, fileName, mimeType, vehicle = {} } = req.body || {};
    if (!fileData || !mimeType) return res.status(400).json({ error: 'لم يتم استلام الملف.' });
    const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    if (Buffer.byteLength(base64, 'base64') > 4 * 1024 * 1024) return res.status(413).json({ error: 'حجم الملف أكبر من 4MB. صغّر الملف ثم حاول مجددًا.' });

    const market = String(vehicle.market || 'SA').toUpperCase();
    const locale = String(vehicle.locale || 'ar-SA');
    const currency = String(vehicle.currency || 'SAR').toUpperCase();

    const prompt = `أنت محرك تحليل مستقل لعروض صيانة السيارات باسم «وفّر». السوق الحالي ${market}، اللغة/المنطقة ${locale}، العملة ${currency}. السيارة: الشركة ${vehicle.make || 'غير محدد'}، الموديل ${vehicle.model || 'غير محدد'}، السنة ${vehicle.year || 'غير محدد'}، VIN ${vehicle.vin || 'غير متوفر'}.

حلّل المستند وفق التسلسل: Identity → Compatibility → Price → Conflict → Confidence.
أعد JSON فقط دون markdown بهذه البنية:
{"total":"الإجمالي المطبوع حرفيًا أو غير مذكور","calculatedTotal":"مجموع الأسعار الظاهرة حسابيًا إن أمكن أو غير محسوب","status":"خلاصة قصيرة ومحايدة","transparency":0,"identityConfidence":0,"compatibilityConfidence":0,"priceConfidence":0,"overallConfidence":0,"missing":["..."],"conflicts":["..."],"nextActions":["..."],"items":[{"name":"","partNumber":"غير ظاهر","manufacturer":"غير ظاهر","quantity":"غير ظاهرة","price":"","identityConfidence":0,"compatibility":"غير قابل للتحقق|متوافق مبدئيًا|يحتاج تحقق","priceAssessment":"غير قابل للمقارنة|يحتاج مصدر سعر|قابل للمقارنة بعد التحقق","conflict":"لا يظهر|يحتاج تحقق|وصف مختصر","judgment":""}],"workshopMessage":"رسالة عربية مهذبة ومختصرة للورشة تطلب فقط البيانات الناقصة المهمة"}

قواعد إلزامية:
- لا تخترع رقم قطعة أو مصنعًا أو كمية أو سعر سوق أو توافقًا.
- فرّق بوضوح بين الإجمالي المطبوع في المستند وبين مجموع تحسبه أنت من الأسعار الظاهرة.
- لا تقل إن السعر مرتفع/منخفض/عادل ولا تدّع توفيرًا ماليًا ما لم توجد هوية قطعة قابلة للمطابقة ومصدر سعر موثوق داخل المدخلات؛ في هذه النسخة لا توجد أداة بحث أسعار، لذا استخدم «غير قابل للمقارنة» أو «يحتاج مصدر سعر» عند اللزوم.
- افحص رقم القطعة، المصنع، الكمية، أجرة العمل، الضريبة، الضمان، وتوافق سنة/فئة السيارة.
- conflicts للتكرار أو التداخل المحتمل فقط، ولا تجزم بالتعارض إن لم يكن واضحًا.
- الدرجات من 0 إلى 100 وتعكس مقدار الدليل المتاح لا جودة الورشة.
- nextActions من 1 إلى 5 خطوات عملية مرتبة قبل الدفع.
- استخدم العربية الواضحة والمختصرة.`

    let attachment;
    if (mimeType === 'application/pdf') {
      const bytes = Buffer.from(base64, 'base64');
      const form = new FormData();
      form.append('purpose', 'user_data');
      form.append('file', new Blob([bytes], { type: 'application/pdf' }), fileName || 'quote.pdf');
      const up = await fetch('https://api.openai.com/v1/files', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
      const uj = await up.json();
      if (!up.ok) throw new Error(uj?.error?.message || 'تعذر رفع PDF إلى خدمة التحليل');
      attachment = { type: 'input_file', file_id: uj.id };
    } else if (mimeType.startsWith('image/')) {
      attachment = { type: 'input_image', image_url: `data:${mimeType};base64,${base64}` };
    } else return res.status(415).json({ error: 'نوع الملف غير مدعوم.' });

    const rr = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.6-luna', input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, attachment] }], max_output_tokens: 2500 })
    });
    const data = await rr.json();
    if (!rr.ok) throw new Error(data?.error?.message || 'فشل التحليل');
    const text = data.output_text || (data.output || []).flatMap(o => o.content || []).find(c => c.type === 'output_text')?.text || '';
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/,'').trim();
    const result = JSON.parse(cleaned);
    return res.status(200).json(result);
  } catch (e) {
    console.error('Waffer analyze error:', e);
    return res.status(500).json({ error: 'تعذر إكمال التحليل الآن. تحقق من إعداد الخدمة أو حاول مرة أخرى لاحقًا.', code: 'ANALYSIS_FAILED' });
  }
}
