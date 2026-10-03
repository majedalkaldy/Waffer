# Waffer Launch Readiness — updated 2026-10-03

هذه الوثيقة تلخص **الموانع المتبقية للإطلاق العام**. وهي منفصلة عن نجاح البناء والاختبارات الآلية.

## اتجاه الإطلاق الحالي

الولايات المتحدة هي السوق الأول (`US` / `en-US` / `USD`) منذ PR #79. تغييرات VIN/NHTSA وeBay canonical fitment وTaxonomy وshadow/Sandbox وملف طلب eBay في PRs #80–85 مدمجة في `main`. السجلات المؤرخة أدناه تصف اختباراتها السابقة؛ لا تعني إثبات توافق كل المركبات الأمريكية أو جاهزية الأسعار الحية.

الحاجز المتبقي للتسعير: تأكيد تصريح eBay Buy API Production، إعداد أسرار الخدمة بأمان، ثم تجربة Production مصرح بها من 20–50 حالة ومراجعتها. رسالة تحقق حساب المطور أو نجاح البناء لا يثبتان تصريح Production.

## ما تم التحقق منه آليًا

- GitHub CI يشغّل الفحص الثابت + الاختبارات السلوكية + بوابة الإطلاق.
- Vercel deployment status للنسخة الحالية ينجح عبر حالة commit في GitHub.
- التغطية الآلية لسيناريوهات الاختبار موجودة في `docs/FIELD_TEST_AUTOMATION.json`.
- الاختبار التكاملي يغطي: تحليل مستند mocked، تطبيع النتيجة، مطابقة الكتالوج، Front/Rear، تخطي labor/service، وحدود عقد التسعير.
- بوابة الإطلاق تمنع `public-beta` و`production` حتى تكون السيناريوهات العشرة الميدانية `PASS`.
- واجهات AutoParts المكلفة محمية داخل التطبيق بحارس مشترك واسع يمنع الاستنزاف المباشر ويعمل بعد validation وقبل الاتصال بالمزود.
- فحص Production حي موثق في `docs/LIVE_SMOKE_RESULTS.json`: self-test وhealth وreadiness تعمل بنجاح، والكتالوج reachable. تم حل تحذير Node `DEP0169` في Production عبر إيقاف الاعتماد على مسار `req.query` القديم واستخدام WHATWG `URL`؛ فحص النشر `6cc9a5db` عبر سبعة مسارات API لم يسجل أي ظهور جديد للتحذير، مع اختبار رجعي يمنع العودة إلى المسار القديم.
- CSP في الإنتاج صار يفرض `script-src 'self'` و`style-src 'self'` بدون inline JavaScript/CSS.
- وضع `?debug=1` يحتوي لوحة للاختبار الميداني تجمع مسودة PASS/FAIL/PENDING وأدلة Analysis ID/commit/catalog محليًا دون تغيير البوابة الرسمية.
- مسودات الأدلة يمكن فحصها آليًا عبر `npm run validate:field-test-draft -- <draft.json>` قبل اعتماد أي PASS رسمي.
- `launch-gate` يتحقق أيضًا من أدلة `docs/FIELD_TEST_RESULTS.json` الرسمية؛ 10/10 PASS بلا دليل صالح لا تُعد جاهزية للترقية.
- مسار اعتماد الأدلة أصبح: draft → Validator → Candidate آمن غير قابل للكتابة فوق الملف الرسمي → مراجعة/PR.
- `/api/readiness` يعطي ملخصًا machine-readable غير مكلف لحالة الأدلة والبوابة والتكوين؛ لا يتصل بـOpenAI أو AutoParts ولا يعرض scenarios/evidence/notes.
- `/api/readiness` يفصل الآن بين `runtimePromotionReady` و`publicBetaReady`، ويقرأ نتيجة المراجعات اليدوية المسجلة في `docs/RELEASE_CONTROL_REVIEWS.json`. حماية `main` ومراجعتا WAF وDeployment Protection مكتملة؛ يبقى مزود السعر الموثوق هو مانع الترقية الحالي.
- لوحة `?debug=1` تتضمن Browser Preflight غير مدفوع يفحص Canvas/تحسين الصور وService Worker وCSP وreadiness قبل بدء السيناريوهات، ويُصدّر كبيانات تشخيصية منفصلة لا تُحتسب PASS.
- لوحة الاختبار تستطيع توليد Fixtures محلية قياسية للسيناريوهات 1–10 لتقليل الاعتماد على ملفات شخصية؛ اختبارات VIN/Front-Rear التي تتطلب المزود تبقى بحاجة إلى VIN حقيقي مدعوم.

## الموانع الحالية

| المجال | الحالة | ما نعرفه الآن | المطلوب قبل الإطلاق العام |
|---|---|---|---|
| الاختبار الميداني الحقيقي | **PASS — 10/10** | نُفذت السيناريوهات العشرة في Chrome على Production باستخدام Fixtures معلّمة وخدمات OpenAI/AutoParts الحية، واجتازت الأدلة Validator | الدليل الرسمي في `docs/FIELD_TEST_RESULTS.json`؛ التفصيل والحدود في `docs/FIELD_TEST_SESSION_2026-09-25.md` |
| ضغط صورة كبيرة >3MB | **PASS — LIVE BROWSER** | ضغط المتصفح JPEG من 3,407,872 إلى 71,790 بايت ثم نجح التحليل | الاختبار استخدم JPEG اصطناعيًا مبطنًا؛ تجربة كاميرا هاتف فعلية لم تُجرَ |
| VIN حي مع المزود | **PASS — LIVE PROVIDER** | التحقق الحي أعاد TOYOTA CAMRY 2.5 وVehicle ID 9445؛ اكتملت المطابقة والتحقق من الموضع الأمامي | الدليل العام يحتفظ ببصمة SHA-256 بدل VIN الكامل؛ الأصل محفوظ للمراجعة الخاصة |
| مصدر أسعار موثوق | **EBAY INTEGRATION READY / PRODUCTION EVIDENCE PENDING** | عقد `lib/price-provider.js` جاهز، وبحث `docs/PRICE_PROVIDER_CANDIDATES.md` وثّق مسارات تكامل محتملة؛ مسار eBay US مهيأ للـSandbox وshadow، ولم تسجل هنا أدلة تصريح Production أو تجربة أسعار حية؛ التسعير المعتمد ما زال معطلًا ويعيد marketPrice=null وsaving=NOT_CALCULATED | تأكيد تصريح eBay US Production وإعداد الخدمة ثم تجربة مصرح بها من 20–50 حالة قبل تفعيل الأسعار |
| حماية تكلفة `/api/analyze` | **IMPLEMENTED IN CODE / WAF MONITORING ACTIVE — REVIEW PASS** | الحارس الداخلي يفرض 4/دقيقة و20/ساعة لكل IP داخل كل runtime. مراجعة 2026-09-28 وجدت حركة منخفضة جدًا: 7 طلبات/3 أيام على أحدث deployment، 0 `/api/analyze` و0 429 خلال آخر 24 ساعة | إبقاء WAF على Log حاليًا؛ إعادة مراجعة enforcement بعد وجود حركة عامة كافية لتقييم false positives/NAT |
| وصول Vercel الحي | **ACTIVE** | Team `waffer` والمشروع والـdeployments والسجلات مرئية، وWAF monitor تم نشره يدويًا على Production | الاستمرار في مراقبة السجلات وWAF قبل تحويله من Log إلى enforcement |
| الوصول العام قبل Public Beta | **PUBLIC ACCESS VERIFIED — REVIEW PASS** | GitHub Actions runner خارجي أعاد HTTP 200 للصفحة الرئيسية و`/api/readiness` على Production `cbb85e08` بدون SSO redirect أو protection headers | إعادة probe فقط إذا تغير Deployment Protection أو الدومين قبل الترقية |
| حماية `main` | **VERIFIED — ACTIVE** | تحقق GitHub API بتاريخ 2026-09-27: `protected=true`؛ ruleset رقم `24069197` فعال على `main` ويفرض PR و`regression-suite` مع strict status checks، ويمنع force push والحذف بلا bypass | إبقاء القاعدة فعالة؛ سجل المراجعة المنظم في `docs/RELEASE_CONTROL_REVIEWS.json` |

## ما لا يُعد دليل إطلاق

نجاح Preview أو Production build، ونجاح CI، والمحاكاة الآلية **لا تحول** السيناريوهات الميدانية إلى PASS. الدليل الميداني يسجل فقط في `docs/FIELD_TEST_RESULTS.json`.

## ترتيب العمل المقترح

1. إبقاء `launchPhase=field-test`.
2. الحفاظ على أدلة 10/10 المعتمدة وإعادة السيناريوهات المتأثرة عند تغيير مسارات التحليل/المطابقة؛ لا تعني هذه النتيجة الإطلاق العام.
3. مراجعة WAF مكتملة؛ إبقاء Log حتى تتوفر حركة عامة كافية، ثم إعادة تقييم enforcement.
4. حسم مزود الأسعار الموثوق قبل تفعيل أي حساب للسعر السوقي أو التوفير.
5. الحفاظ على حماية `main` و`regression-suite` كشرط دمج، وإعادة التحقق إذا تغير الـruleset.
6. مراجعة Deployment Protection مكتملة؛ إعادة التحقق فقط إذا تغير إعداد الوصول قبل الترقية.
7. لا يتم الانتقال إلى `public-beta` إلا بعد 10/10 PASS واجتياز بوابة CI.

## رصد المتصفح في 2026-09-25

- النطاق `waffer-rho.vercel.app` فتح في جلسة Chrome دون تسجيل دخول Vercel، وأتاح التحليل الحي. معاينة PR #71 أحالت إلى تسجيل Vercel. هذا رصد للسلوك، وليس اعتمادًا لإعدادات Deployment Protection.
- عولج حجب لوحة الاختبار داخل شاشة النتائج (PR #71)، ومرادفات بطانات الفرامل (PR #72).
- عولج تشغيل استعادة الأدلة عند تغيير اللغة فقط؛ يبدأ الآن مع تحميل الوحدات، مع تصحيح لغة اللوحة والانتقال للسيناريو التالي.
