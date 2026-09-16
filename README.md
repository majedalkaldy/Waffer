# وفّر — Waffer
نسخة MVP جاهزة للنشر على Vercel.

## الإعداد
أضف متغير البيئة التالي في Vercel:
`OPENAI_API_KEY`

ثم أعد النشر. لا تضع المفتاح داخل index.html أو أي ملف يصل إلى المتصفح.

الواجهة تقبل JPG/PNG/PDF حتى 4MB وترسل الملف إلى Serverless Function في `/api/analyze` للتحليل.
