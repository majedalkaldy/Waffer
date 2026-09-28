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

تم تطبيق `docs/MAIN_BRANCH_PROTECTION.md` والتحقق عبر GitHub API بتاريخ 2026-09-27.

الحد الأدنى:
- Require pull request before merging.
- Require status checks before merging.
- Require `regression-suite`.
- لا تعتمد على نجاح Vercel build وحده كبديل عن CI.

الحالة المؤكدة بتاريخ 2026-09-27:
- `main protected=true`.
- ruleset `Waffer main protection` فعال ويستهدف `main` فقط.
- `regression-suite` فحص إلزامي مع Require branches to be up to date.
- force push والحذف محظوران، ولا يوجد bypass أو review بشري إلزامي.
- التفاصيل المنظمة محفوظة في `docs/RELEASE_CONTROL_REVIEWS.json`.

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

الحالة الحالية بعد مراجعة 2026-09-28:
- In-code guard لـ `/api/analyze`: 4/min و20/hour لكل IP داخل runtime.
- Production WAF monitor: 30 requests / 600 seconds / IP.
- WAF action = Log.
- Review status = **PASS**.
- قرار المراجعة = **KEEP_LOG_MONITORING**؛ لم يتم تفعيل الحظر في Production.

أدلة المراجعة:
- أحدث Production `dpl_5BHNSNfdjZDzYqDTZvDFyjVWwva9` = READY.
- على أحدث deployment خلال 3 أيام: 7 طلبات فقط، كلها 200 (4 health + 3 readiness).
- آخر 24 ساعة: 0 طلبات `/api/analyze` و0 استجابات 429.
- لا توجد تحذيرات runtime جديدة على أحدث deployment؛ آخر DEP0169 معروف كان على deployment قديم بتاريخ 2026-09-25.

القرار:
- إبقاء WAF في وضع Log الآن أكثر أمانًا من فرض threshold غير مدعوم بحركة حقيقية كافية.
- الحارس داخل التطبيق يبقى enforcement فعليًا ضد الإساءة لكل runtime.
- إعادة مراجعة التحويل إلى 429 بعد وجود حجم استخدام عام ذي دلالة، مع فحص NAT/false positives أولًا.

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
