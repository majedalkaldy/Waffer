# Waffer Launch Readiness — 2026-09-23

هذه الوثيقة تلخص **الموانع المتبقية للإطلاق العام**. وهي منفصلة عن نجاح البناء والاختبارات الآلية.

## ما تم التحقق منه آليًا

- GitHub CI يشغّل الفحص الثابت + الاختبارات السلوكية + بوابة الإطلاق.
- Vercel deployment status للنسخة الحالية ينجح عبر حالة commit في GitHub.
- التغطية الآلية لسيناريوهات الاختبار موجودة في `docs/FIELD_TEST_AUTOMATION.json`.
- الاختبار التكاملي يغطي: تحليل مستند mocked، تطبيع النتيجة، مطابقة الكتالوج، Front/Rear، تخطي labor/service، وحدود عقد التسعير.
- بوابة الإطلاق تمنع `public-beta` و`production` حتى تكون السيناريوهات العشرة الميدانية `PASS`.

## الموانع الحالية

| المجال | الحالة | ما نعرفه الآن | المطلوب قبل الإطلاق العام |
|---|---|---|---|
| الاختبار الميداني الحقيقي | **BLOCKED** | `docs/FIELD_TEST_RESULTS.json` ما زال 0/10 PASS، وكل السيناريوهات PENDING | تنفيذ السيناريوهات العشرة على النسخة المنشورة وتسجيل الدليل |
| ضغط صورة كبيرة >3MB | **MANUAL REQUIRED** | المسار يعتمد على Canvas في المتصفح؛ لا يغطيه Node CI حاليًا | تجربة فعلية على هاتف/متصفح |
| VIN حي مع المزود | **LIVE EVIDENCE REQUIRED** | downstream matching مغطى آليًا، لكن VIN حقيقي مدعوم لم يُسجل كدليل ميداني | اختبار VIN فعلي ومراجعة الفئة/Vehicle ID |
| مصدر أسعار موثوق | **MISSING** | `price-compare` يتعمد إرجاع marketPrice=null وsaving=NOT_CALCULATED | اختيار وربط مزود أسعار قبل عرض نطاق سوق/توفير |
| حماية تكلفة `/api/analyze` | **IMPLEMENTED IN CODE / WAF PENDING** | الحارس الداخلي يحد الطلبات المدفوعة إلى 4/دقيقة و20/ساعة لكل IP داخل كل runtime، يخزن hash فقط، يحظر browser cross-site، ويعيد 429 + Retry-After قبل OpenAI | وصول Vercel عاد؛ المتبقي إنشاء قاعدة WAF من لوحة Vercel أو CLI/API لأن موصل الجلسة لا يعرّض كتابة القواعد |
| وصول Vercel الحي | **READ ACCESS RESTORED / WAF WRITE TOOL UNAVAILABLE** | Team `waffer` والمشروع والـdeployments والسجلات أصبحت مرئية، وتم التحقق أن deployment الأمني `d475d53` هو Production/READY؛ موصل الجلسة لا يعرّض عملية كتابة WAF | إنشاء قاعدة WAF من لوحة Vercel أو Vercel CLI/API ثم متابعة المراقبة من الموصل |
| حماية `main` | **UNVERIFIED** | GitHub Rulesets = []؛ legacy branch-protection endpoint غير متاح لتكامل GitHub الحالي (403) | التحقق من إعدادات حماية الفرع يدويًا أو بصلاحية Admin؛ ويفضل فرض CI قبل الدمج |

## ما لا يُعد دليل إطلاق

نجاح Preview أو Production build، ونجاح CI، والمحاكاة الآلية **لا تحول** السيناريوهات الميدانية إلى PASS. الدليل الميداني يسجل فقط في `docs/FIELD_TEST_RESULTS.json`.

## ترتيب العمل المقترح

1. إبقاء `launchPhase=field-test`.
2. تنفيذ السيناريوهات الميدانية التي لا تحتاج قرارًا تجاريًا، وتسجيل النتائج الفعلية.
3. إنشاء قاعدة WAF الموزعة وفق `docs/VERCEL_FIREWALL_PLAN.md` من لوحة Vercel أو CLI/API؛ الحارس الداخلي منفذ بالفعل ووصول القراءة إلى Vercel متاح.
4. حسم مزود الأسعار الموثوق قبل تفعيل أي حساب للسعر السوقي أو التوفير.
5. التحقق من حماية `main` وفرض CI كشرط دمج.
6. لا يتم الانتقال إلى `public-beta` إلا بعد 10/10 PASS واجتياز بوابة CI.
