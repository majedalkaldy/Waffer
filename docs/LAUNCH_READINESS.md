# Waffer Launch Readiness — 2026-09-24

هذه الوثيقة تلخص **الموانع المتبقية للإطلاق العام**. وهي منفصلة عن نجاح البناء والاختبارات الآلية.

## ما تم التحقق منه آليًا

- GitHub CI يشغّل الفحص الثابت + الاختبارات السلوكية + بوابة الإطلاق.
- Vercel deployment status للنسخة الحالية ينجح عبر حالة commit في GitHub.
- التغطية الآلية لسيناريوهات الاختبار موجودة في `docs/FIELD_TEST_AUTOMATION.json`.
- الاختبار التكاملي يغطي: تحليل مستند mocked، تطبيع النتيجة، مطابقة الكتالوج، Front/Rear، تخطي labor/service، وحدود عقد التسعير.
- بوابة الإطلاق تمنع `public-beta` و`production` حتى تكون السيناريوهات العشرة الميدانية `PASS`.
- واجهات AutoParts المكلفة محمية داخل التطبيق بحارس مشترك واسع يمنع الاستنزاف المباشر ويعمل بعد validation وقبل الاتصال بالمزود.
- فحص Production حي موثق في `docs/LIVE_SMOKE_RESULTS.json`: self-test وhealth = 200/ready، الكتالوج reachable، ولا توجد runtime errors في نافذة الفحص.
- CSP في الإنتاج صار يفرض `script-src 'self'` و`style-src 'self'` بدون inline JavaScript/CSS.
- وضع `?debug=1` يحتوي لوحة للاختبار الميداني تجمع مسودة PASS/FAIL/PENDING وأدلة Analysis ID/commit/catalog محليًا دون تغيير البوابة الرسمية.
- مسودات الأدلة يمكن فحصها آليًا عبر `npm run validate:field-test-draft -- <draft.json>` قبل اعتماد أي PASS رسمي.
- `launch-gate` يتحقق أيضًا من أدلة `docs/FIELD_TEST_RESULTS.json` الرسمية؛ 10/10 PASS بلا دليل صالح لا تُعد جاهزية للترقية.
- مسار اعتماد الأدلة أصبح: draft → Validator → Candidate آمن غير قابل للكتابة فوق الملف الرسمي → مراجعة/PR.

## الموانع الحالية

| المجال | الحالة | ما نعرفه الآن | المطلوب قبل الإطلاق العام |
|---|---|---|---|
| الاختبار الميداني الحقيقي | **BLOCKED / EVIDENCE WORKFLOW READY** | `docs/FIELD_TEST_RESULTS.json` ما زال 0/10 PASS، لكن لوحة `?debug=1` ومسار تصدير/Validator للأدلة أصبحا جاهزين | تنفيذ السيناريوهات العشرة على النسخة المنشورة، تصدير المسودة، التحقق منها، ثم مراجعة الدليل واعتماد النتائج |
| ضغط صورة كبيرة >3MB | **MANUAL REQUIRED** | المسار يعتمد على Canvas في المتصفح؛ لا يغطيه Node CI حاليًا | تجربة فعلية على هاتف/متصفح |
| VIN حي مع المزود | **LIVE EVIDENCE REQUIRED** | downstream matching مغطى آليًا، لكن VIN حقيقي مدعوم لم يُسجل كدليل ميداني | اختبار VIN فعلي ومراجعة الفئة/Vehicle ID |
| مصدر أسعار موثوق | **CONTRACT READY / PROVIDER MISSING** | عقد `lib/price-provider.js` يفرض تحقق العملة وهوية القطعة والسيارة والمخزون والدليل؛ الإنتاج ما زال يعيد marketPrice=null وsaving=NOT_CALCULATED | اختيار وربط مزود موثوق واختباره حيًا قبل عرض نطاق السوق أو التوفير |
| حماية تكلفة `/api/analyze` | **IMPLEMENTED IN CODE / WAF MONITORING ACTIVE** | الحارس الداخلي يحد الطلبات المدفوعة إلى 4/دقيقة و20/ساعة لكل IP داخل كل runtime، يخزن hash فقط، يحظر browser cross-site، ويعيد 429 + Retry-After قبل OpenAI | تم نشر قاعدة المراقبة على Production؛ المتبقي مراقبة الحركة قبل تحويلها إلى حظر فعلي |
| وصول Vercel الحي | **ACTIVE** | Team `waffer` والمشروع والـdeployments والسجلات مرئية، وWAF monitor تم نشره يدويًا على Production | الاستمرار في مراقبة السجلات وWAF قبل تحويله من Log إلى enforcement |
| حماية `main` | **ACTION REQUIRED** | القراءة المباشرة للفرع تؤكد `protected=false` وrequired status checks = off | تطبيق `docs/MAIN_BRANCH_PROTECTION.md` من إعدادات GitHub لفرض PR + regression-suite قبل الدمج |

## ما لا يُعد دليل إطلاق

نجاح Preview أو Production build، ونجاح CI، والمحاكاة الآلية **لا تحول** السيناريوهات الميدانية إلى PASS. الدليل الميداني يسجل فقط في `docs/FIELD_TEST_RESULTS.json`.

## ترتيب العمل المقترح

1. إبقاء `launchPhase=field-test`.
2. تنفيذ السيناريوهات الميدانية عبر لوحة `?debug=1`، تصدير مسودة الأدلة، وتشغيل Validator قبل تحديث النتائج الرسمية.
3. مراقبة قاعدة WAF المنشورة في وضع Log ومراجعة أي تجاوزات قبل تفعيل الحظر الفعلي.
4. حسم مزود الأسعار الموثوق قبل تفعيل أي حساب للسعر السوقي أو التوفير.
5. التحقق من حماية `main` وفرض CI كشرط دمج.
6. لا يتم الانتقال إلى `public-beta` إلا بعد 10/10 PASS واجتياز بوابة CI.
