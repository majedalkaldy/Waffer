import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { getMarketConfig } from '../lib/market-config.js';
import { normalizeAnalysisResult } from '../lib/analysis-normalizer.js';
import { validateBase64Upload } from '../lib/upload-validation.js';
import { buildAnalysisPrompt } from '../lib/analysis-prompt.js';
import { checkAnalysisRequestLimit, checkAnalysisRequestProvenance } from '../lib/analysis-abuse-guard.js';

import { cleanupOpenAIFile } from '../lib/openai-file-cleanup.js';
import { ANALYSIS_OUTPUT_SCHEMA, ANALYSIS_TRUST_BOUNDARY, validateAnalysisOutput } from '../lib/analysis-output.js';

// Delay the response until bounded cleanup finishes, including failed analyses.
export default async function handler(req, res) {
  let fileId = null;
  let uploadAttempted = false;
  let status = 500;
  let body = {error: 'Analysis unavailable', code: 'ANALYSIS_FAILED'};
  const staged = {
    setHeader: (name, value) => res.setHeader(name, value),
    status(code) { status = code; return this; },
    json(value) { body = value; }
  };
  try {
    await analyzeRequest(req, staged, id => { uploadAttempted = true; fileId = id; });
  } finally {
    if (uploadAttempted) {
      const cleanup = fileId
        ? await cleanupOpenAIFile(fileId, process.env.OPENAI_API_KEY, {timeoutMs: RUNTIME_CONFIG.pdfCleanupTimeoutMs})
        : {status: 'UNCONFIRMED', attempts: 0};
      body = {...body, uploadPrivacy: {provider: 'OpenAI', responseStorage: false, pdfCleanup: cleanup.status}};
      res.setHeader('X-Waffer-Pdf-Cleanup', cleanup.status);
      if (cleanup.status === 'UNCONFIRMED') console.error('PDF cleanup unconfirmed; provider expiry was requested.');
    }
  }
  return res.status(status).json(body);
}

async function analyzeRequest(req, res, registerFile) {
  res.setHeader('Allow', 'POST');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const requestedLocale = String(req.body?.vehicle?.locale || 'ar-SA');
  const requestedEnglish = requestedLocale.toLowerCase().startsWith('en');

  const provenance = checkAnalysisRequestProvenance(req);
  if (!provenance.allowed) {
    return res.status(403).json({
      error: requestedEnglish
        ? 'This analysis request was blocked because it did not originate from the Waffer site.'
        : 'تم حظر طلب التحليل لأنه لم يصدر من موقع وفّر.',
      code: provenance.code
    });
  }

  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY غير مضاف في Vercel.' });

  let openaiFileId = null;
  try {
    const { fileData, mimeType, vehicle = {} } = req.body || {};
    if (typeof fileData !== 'string' || !fileData || !mimeType) return res.status(400).json({ error: 'لم يتم استلام الملف.' });

    const normalizedMimeType = String(mimeType).toLowerCase();
    const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const uploadValidation = validateBase64Upload({
      base64,
      claimedMimeType: normalizedMimeType,
      maxBytes: RUNTIME_CONFIG.maxUploadBytes
    });

    if (!uploadValidation.ok) {
      const messages = {
        UNSUPPORTED_FILE_TYPE: 'نوع الملف غير مدعوم.',
        INVALID_BASE64: 'بيانات الملف غير صالحة.',
        EMPTY_FILE: 'الملف فارغ.',
        FILE_TOO_LARGE: 'حجم الملف أكبر من الحد المسموح.',
        UNKNOWN_FILE_SIGNATURE: 'تعذر التحقق من نوع الملف.',
        MIME_SIGNATURE_MISMATCH: 'نوع الملف لا يطابق محتواه.'
      };
      return res.status(uploadValidation.status).json({
        error: messages[uploadValidation.code] || 'تعذر التحقق من الملف.',
        code: uploadValidation.code
      });
    }

    const fileBytes = uploadValidation.bytes;
    const uploadBuffer = uploadValidation.buffer;

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

    // Count only requests that passed basic validation and are about to consume paid upstream compute.
    const requestLimit = checkAnalysisRequestLimit(req, RUNTIME_CONFIG);
    if (requestLimit.burstMax != null) {
      res.setHeader('X-RateLimit-Burst-Limit', String(requestLimit.burstMax));
      res.setHeader('X-RateLimit-Burst-Remaining', String(requestLimit.burstRemaining));
      res.setHeader('X-RateLimit-Hourly-Limit', String(requestLimit.hourlyMax));
      res.setHeader('X-RateLimit-Hourly-Remaining', String(requestLimit.hourlyRemaining));
    }
    if (!requestLimit.allowed) {
      res.setHeader('Retry-After', String(requestLimit.retryAfterSeconds));
      return res.status(429).json({
        error: requestedEnglish
          ? 'Too many analysis requests. Try again after the cooldown.'
          : 'تم إرسال طلبات تحليل كثيرة. حاول مجددًا بعد انتهاء فترة الانتظار.',
        code: 'ANALYSIS_CLIENT_RATE_LIMITED',
        retryAfterSeconds: requestLimit.retryAfterSeconds
      });
    }

    const safeVehicle = {
      make: String(vehicle.make || 'غير محدد').replace(/[\r\n]/g, ' ').slice(0, 120),
      model: String(vehicle.model || 'غير محدد').replace(/[\r\n]/g, ' ').slice(0, 120),
      year: String(vehicle.year || 'غير محدد').replace(/[^0-9]/g, '').slice(0, 4) || 'غير محدد',
      vin: String(vehicle.vin || 'غير متوفر').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17) || 'غير متوفر'
    };

    const prompt = buildAnalysisPrompt({
      market,
      locale,
      currency,
      includeVehicleContext: false
    });

    let attachment;
    if (normalizedMimeType === 'application/pdf') {
      const form = new FormData();
      form.append('expires_after[anchor]', 'created_at');
      form.append('expires_after[seconds]', '3600');
      form.append('purpose', 'user_data');
      form.append('file', new Blob([uploadBuffer], { type: 'application/pdf' }), 'repair-estimate.pdf');
      const uploadController = new AbortController();
      const uploadTimeout = setTimeout(() => uploadController.abort(), RUNTIME_CONFIG.pdfUploadTimeoutMs);
      let up;
      let uj;
      try {
        registerFile(null);
        up = await fetch('https://api.openai.com/v1/files', {
          redirect: 'error',
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: form,
          signal: uploadController.signal
        });
        try {
          uj = await up.json();
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          return res.status(502).json({
            error: 'استجابة رفع PDF من مزود التحليل غير صالحة.',
            code: 'ANALYSIS_UPSTREAM_INVALID'
          });
        }
      } finally {
        clearTimeout(uploadTimeout);
      }
      if (!up.ok) {
        const status = up.status === 429 ? 429 : up.status >= 500 ? 502 : 500;
        const code = up.status === 429 ? 'ANALYSIS_RATE_LIMITED' : 'ANALYSIS_UPSTREAM_ERROR';
        return res.status(status).json({
          error: 'تعذر رفع PDF إلى خدمة التحليل',
          code
        });
      }
      if (typeof uj?.id !== 'string' || !/^file[-_][A-Za-z0-9_-]{1,200}$/.test(uj.id)) {
        return res.status(502).json({
          error: 'لم يُرجع مزود التحليل معرف ملف PDF صالحًا.',
          code: 'ANALYSIS_UPSTREAM_INVALID'
        });
      }
      openaiFileId = uj.id;
      registerFile(openaiFileId);
      attachment = { type: 'input_file', file_id: openaiFileId };
    } else if (normalizedMimeType.startsWith('image/')) {
      attachment = { type: 'input_image', image_url: `data:${normalizedMimeType};base64,${base64}` };
    } else return res.status(415).json({ error: 'نوع الملف غير مدعوم.' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RUNTIME_CONFIG.analysisTimeoutMs);
    let rr;
    let data;
    try {
      rr = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5.6-luna', store: false,
          instructions: ANALYSIS_TRUST_BOUNDARY + '\n' + prompt,
          input: [{role: 'user', content: [{type: 'input_text', text: 'Untrusted vehicle context: ' + JSON.stringify(safeVehicle)}, attachment]}],
          text: {format: {type: 'json_schema', name: 'repair_estimate', strict: true, schema: ANALYSIS_OUTPUT_SCHEMA}},
          max_output_tokens: 2500
        }),
        signal: controller.signal
      });
      try {
        data = await rr.json();
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        return res.status(502).json({
          error: 'استجابة خدمة التحليل غير صالحة.',
          code: 'ANALYSIS_UPSTREAM_INVALID'
        });
      }
    } finally {
      clearTimeout(timeout);
    }
    if (!rr.ok) {
      const status = rr.status === 429 ? 429 : rr.status >= 500 ? 502 : 500;
      const code = rr.status === 429 ? 'ANALYSIS_RATE_LIMITED' : 'ANALYSIS_UPSTREAM_ERROR';
      return res.status(status).json({ error: 'فشل التحليل', code });
    }
    if (data.status === 'incomplete' || (data.output || []).some(o => (o.content || []).some(c => c.type === 'refusal'))) {
      return res.status(502).json({error: 'تعذر إكمال تحليل المستند.', code: 'ANALYSIS_UPSTREAM_INVALID'});
    }
    const text = data.output_text || (data.output || []).flatMap(o => o.content || []).find(c => c.type === 'output_text')?.text || '';
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/,'').trim();
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({
        error: 'تعذر قراءة JSON الناتج من خدمة التحليل.',
        code: 'ANALYSIS_UPSTREAM_INVALID'
      });
    }
    if (!validateAnalysisOutput(result)) {
      return res.status(502).json({
        error: 'أعادت خدمة التحليل بنية نتيجة غير صالحة.',
        code: 'ANALYSIS_UPSTREAM_INVALID'
      });
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
      completedAt,
      deployment: {
        environment: process.env.VERCEL_ENV || null,
        commit: process.env.VERCEL_GIT_COMMIT_SHA
          ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8)
          : null
      }
    });

    return res.status(200).json(normalized);
  } catch (e) {
    console.error('Waffer analyze request failed');
    if (e?.name === 'AbortError') {
      return res.status(504).json({ error: 'استغرق التحليل وقتًا أطول من المتوقع. حاول مرة أخرى.', code: 'ANALYSIS_TIMEOUT' });
    }
    return res.status(500).json({ error: 'تعذر إكمال التحليل الآن. تحقق من إعداد الخدمة أو حاول مرة أخرى لاحقًا.', code: 'ANALYSIS_FAILED' });
  }
}
