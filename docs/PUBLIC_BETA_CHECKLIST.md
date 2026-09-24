# Waffer Public Beta Manual Gates

هذه القائمة تخص **الإعدادات والقرارات التي لا يستطيع CI وحده إثباتها**. لا تغيّر `launchPhase` إلى `public-beta` قبل إغلاق جميع البنود أدناه مع استمرار نجاح `npm run ci`.

## 1. Field-test evidence

- يجب أن تكون السيناريوهات 1–10 في `docs/FIELD_TEST_RESULTS.json` = PASS.
- يجب أن يمر Evidence Validator بلا أخطاء.
- استخدم `?debug=1` لتشغيل Browser Preflight ثم Fixtures ومسودة الأدلة.
- لا تعتبر التغطية الآلية أو Fixture وحدها دليل PASS.
- السيناريوهات التي تحتاج VIN/كتالوج حي يجب أن تحتوي دليلًا من النسخة المنشورة.

## 2. Trusted pricing

- لا تُفعّل عرض سعر السوق أو التوفير قبل توصيل Price Provider موثوق.
- يجب أن يبقى `verifiedMarketPricing=false` حتى اجتياز اختبار المزود الحي.
- التوفير المؤكد يجب أن يأتي من Verified Offer مطابق، وليس من median أو نطاق سوق فقط.

## 3. GitHub main protection

طبّق `docs/MAIN_BRANCH_PROTECTION.md`.

الحد الأدنى:
- Require pull request before merging.
- Require status checks before merging.
- Require `regression-suite`.
- لا تعتمد على نجاح Vercel build وحده كبديل عن CI.

الحالة المرصودة بتاريخ 2026-09-24:
- `main protected=false`
- required status checks = off

## 4. Vercel Deployment Protection

خلال field-test يمكن إبقاء Vercel Authentication مفعلة.

قبل Public Beta:
- راجع Deployment Protection للمشروع والدومين العام.
- تأكد أن المستخدم العام لا يُحوّل إلى Vercel SSO.
- اختبر الصفحة الرئيسية و`/api/readiness` من جلسة غير مسجلة في Vercel.
- لا تفتح الوصول العام قبل اكتمال field-test وحماية التكلفة.

ملاحظة رصد 2026-09-24:
- Production deployment نفسه READY.
- طلب مباشر محمي لـ `/api/readiness` أعاد 302 إلى Vercel SSO، لذلك الوصول العام ما زال محميًا في نافذة الفحص.

## 5. WAF enforcement review

الوضع الحالي:
- In-code guard لـ `/api/analyze`: 4/min و20/hour لكل IP داخل runtime.
- Production WAF monitor: 30 requests / 600 seconds / IP.
- WAF action = Log.

قبل تحويل WAF إلى enforcement:
- راجع حجم الحركة الحقيقية.
- تأكد أن الحد لا يصطدم بمستخدمين شرعيين/NAT.
- اختبر 429 على Preview أو بيئة مناسبة قبل Production.
- لا تحوّل Log إلى حظر اعتمادًا على حركة منخفضة جدًا.

رصد آخر 24 ساعة بتاريخ 2026-09-24:
- 16 طلبًا مسجلًا على المسارات المرصودة.
- جميع status codes المرصودة = 200.
- لا توجد 429 أو 5xx في التجميع.
- الحجم الحالي غير كافٍ لاتخاذ قرار enforcement.

## 6. Final public smoke

بعد إغلاق البنود السابقة:
- الصفحة الرئيسية تفتح بدون Vercel login.
- Browser Preflight = PASS أو WARN مفسر بلا critical failures.
- `/api/readiness` يعرض configuration المطلوبة.
- تحليل صورة حقيقية واحد ينجح.
- تحليل PDF صغير واحد ينجح.
- VIN مدعوم واحد يحدد Vehicle ID ويكمل الكتالوج.
- لا يوجد 5xx في نافذة الفحص.
- لا يعرض وفّر سعر سوق أو توفيرًا غير موثق.

## Promotion rule

الترقية إلى `public-beta` قرار مقصود فقط بعد:
1. 10/10 field-test PASS بدليل صالح.
2. GitHub main protection.
3. مراجعة Deployment Protection والوصول العام.
4. مراجعة WAF.
5. مزود سعر موثوق إذا كان Public Beta سيعرض المقارنة السعرية.
6. نجاح CI وFinal public smoke.
