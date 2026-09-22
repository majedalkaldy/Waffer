import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { getMarketConfig } from '../lib/market-config.js';
import { normalizeAnalysisResult } from '../lib/analysis-normalizer.js';

export default async function handler(req, res) {
  res.setHeader('Allow', 'POST');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY غير مضاف في Vercel.' });

  try {
    const { fileData, fileName, mimeType, vehicle = {} } = req.body || {};
    const safeFileName = String(fileName || 'upload')
      .replace(/[\r\n\\/]/g, '_')
      .slice(0, 120);
    if (!fileData || !mimeType) return res.status(400).json({ error: 'لم يتم استلام الملف.' });

    const allowedMimeTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    ]);
    if (!allowedMimeTypes.has(String(mimeType).toLowerCase())) {
      return res.status(415).json({ error: 'نوع الملف غير مدعوم.' });
    }

    const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    if (!base64 || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
      return res.status(400).json({ error: 'بيانات الملف غير صالحة.' });
    }
    const fileBytes = Buffer.byteLength(base64, 'base64');
    if (!fileBytes) return res.status(400).json({ error: 'الملف فارغ.' });
    if (fileBytes > RUNTIME_CONFIG.maxUploadBytes) return res.status(413).json({ error: 'حجم الملف أكبر من 4MB. صغّر الملف ثم حاول مجددًا.' });

    const marketConfig = getMarketConfig(vehicle);
    const market = marketConfig.market;
    const locale = marketConfig.locale;
    const currency = marketConfig.currency;
    if (!marketConfig.supported) {
      return res.status(400).json({
        error: 'السوق المطلوب غير مدعوم حاليًا.',
        code: 'UNSUPPORTED_MARKET',
        requestedMarket: marketConfig.requestedMarket
      });
    }

    const safeVehicle = {
      make: String(vehicle.make || 'غير محدد').replace(/[\r\n]/g, ' ').slice(0, 120),
      model: String(vehicle.model || 'غير محدد').replace(/[\r\n]/g, ' ').slice(0, 120),
      year: String(vehicle.year || 'غير محدد').replace(/[^0-9]/g, '').slice(0, 4) || 'غير محدد',
      vin: String(vehicle.vin || 'غير متوفر').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17) || 'غير متوفر'
    };

    const prompt = `أنت محرك تحليل مستقل لعروض صيانة السيارات باسم «وفّر». السوق الحالي ${market}، اللغة/المنطقة ${locale}، العملة ${currency}. السيارة: الشركة ${safeVehicle.make}، الموديل ${safeVehicle.model}، السنة ${safeVehicle.year}، VIN ${safeVehicle.vin}.

حلّل المستند وفق التسلسل: Identity → Compatibility → Price → Conflict → Confidence.
أعد JSON فقط دون markdown بهذه البنية:
{"total":"الإجمالي المطبوع حرفيًا أو غير مذكور","calculatedTotal":"مجموع الأسعار الظاهرة حسابيًا إن أمكن أو غير محسوب","tax":"الضريبة المطبوعة حرفيًا أو غير مذكورة","laborTotal":"إجمالي أجور العمل إن ظهر منفصلًا أو غير مذكور","warranty":"الضمان المطبوع أو غير مذكور","status":"خلاصة قصيرة ومحايدة","transparency":0,"identityConfidence":0,"compatibilityConfidence":0,"priceConfidence":0,"overallConfidence":0,"missing":["..."],"conflicts":["..."],"nextActions":["..."],"items":[{"name":"","partNumber":"غير ظاهر","manufacturer":"غير ظاهر","quantity":"غير ظاهرة","price":"","itemType":"part|labor|service|fee","identityConfidence":0,"compatibility":"غير قابل للتحقق|متوافق مبدئيًا|يحتاج تحقق","priceAssessment":"غير قابل للمقارنة|يحتاج مصدر سعر|قابل للمقارنة بعد التحقق","conflict":"لا يظهر|يحتاج تحقق|وصف مختصر","judgment":""}],"workshopMessage":"رسالة عربية مهذبة ومختصرة للورشة تطلب فقط البيانات الناقصة المهمة"}

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
- استخدم العربية الواضحة والمختصرة.`

    let attachment;
    if (mimeType === 'application/pdf') {
      const bytes = Buffer.from(base64, 'base64');
      const form = new FormData();
      form.append('purpose', 'user_data');
      form.append('file', new Blob([bytes], { type: 'application/pdf' }), safeFileName || 'quote.pdf');
      const uploadController = new AbortController();
      const uploadTimeout = setTimeout(() => uploadController.abort(), RUNTIME_CONFIG.pdfUploadTimeoutMs);
      let up;
      try {
        up = await fetch('https://api.openai.com/v1/files', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: form,
          signal: uploadController.signal
        });
      } finally {
        clearTimeout(uploadTimeout);
      }
      const uj = await up.json();
      if (!up.ok) throw new Error(uj?.error?.message || 'تعذر رفع PDF إلى خدمة التحليل');
      attachment = { type: 'input_file', file_id: uj.id };

      // Best-effort cleanup is performed after analysis so uploaded PDFs are not retained unnecessarily.
      res.locals = res.locals || {};
      res.locals.openaiFileId = uj.id;
    } else if (mimeType.startsWith('image/')) {
      attachment = { type: 'input_image', image_url: `data:${mimeType};base64,${base64}` };
    } else return res.status(415).json({ error: 'نوع الملف غير مدعوم.' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RUNTIME_CONFIG.analysisTimeoutMs);
    let rr;
    try {
      rr = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-5.6-luna', input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, attachment] }], max_output_tokens: 2500 }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    let data;
    try {
      data = await rr.json();
    } catch {
      return res.status(502).json({ error: 'استجابة خدمة التحليل غير صالحة.', code: 'ANALYSIS_UPSTREAM_INVALID' });
    }
    if (!rr.ok) {
      const status = rr.status === 429 ? 429 : rr.status >= 500 ? 502 : 500;
      const code = rr.status === 429 ? 'ANALYSIS_RATE_LIMITED' : 'ANALYSIS_UPSTREAM_ERROR';
      return res.status(status).json({ error: data?.error?.message || 'فشل التحليل', code });
    }
    const text = data.output_text || (data.output || []).flatMap(o => o.content || []).find(c => c.type === 'output_text')?.text || '';
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/,'').trim();
    const result = JSON.parse(cleaned);
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('Invalid analysis result');
    }

    const requestId = globalThis.crypto?.randomUUID?.() || ('waffer-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));
    const completedAt = new Date().toISOString();

    const normalized = normalizeAnalysisResult({
      result,
      safeVehicle,
      market,
      locale,
      currency,
      engineVersion: RUNTIME_CONFIG.engineVersion,
      requestId,
      completedAt
    });

    if (res.locals?.openaiFileId) {
      fetch('https://api.openai.com/v1/files/' + encodeURIComponent(res.locals.openaiFileId), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      }).catch(error => console.error('PDF cleanup error:', error));
    }

    return res.status(200).json(normalized);
  } catch (e) {
    if (res.locals?.openaiFileId) {
      fetch('https://api.openai.com/v1/files/' + encodeURIComponent(res.locals.openaiFileId), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      }).catch(error => console.error('PDF cleanup error:', error));
    }
    console.error('Waffer analyze error:', e);
    if (e?.name === 'AbortError') {
      return res.status(504).json({ error: 'استغرق التحليل وقتًا أطول من المتوقع. حاول مرة أخرى.', code: 'ANALYSIS_TIMEOUT' });
    }
    return res.status(500).json({ error: 'تعذر إكمال التحليل الآن. تحقق من إعداد الخدمة أو حاول مرة أخرى لاحقًا.', code: 'ANALYSIS_FAILED' });
  }
}
