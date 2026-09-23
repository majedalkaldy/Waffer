# Vercel Firewall Plan — /api/analyze

هذه الخطة هي طبقة الحماية الموزعة أمام Serverless Function. الحارس داخل التطبيق موجود كدفاع ثانٍ، لكنه **ليس بديلًا عن WAF** لأن ذاكرة Serverless محلية لكل runtime instance.

## الهدف

حماية `POST /api/analyze` من الاستخدام المفرط الذي قد يستهلك OpenAI أو يرفع تكلفة التشغيل، مع تقليل احتمال حظر المستخدم الطبيعي.

## المرحلة 1 — مراقبة فقط

ابدأ بقاعدة Rate Limit واسعة في **Production**:

- Path = `/api/analyze`
- Method = `POST`
- Window = 600 seconds
- Requests = 30
- Key = IP
- Action when threshold is reached = **log**

CLI:

```bash
vercel firewall rules add "Waffer analyze abuse monitor" \
  --condition '{"type":"path","op":"eq","value":"/api/analyze"}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --condition '{"type":"environment","op":"eq","value":"production"}' \
  --action rate_limit \
  --rate-limit-window 600 \
  --rate-limit-requests 30 \
  --rate-limit-keys ip \
  --rate-limit-action log \
  --yes
```

ثم راجع draft:

```bash
vercel firewall diff --json
```

بعد مراجعة الـdiff، يجب نشر الـdraft من حساب Vercel المرتبط:

```bash
vercel firewall publish --yes
```

> ملاحظة تشغيلية: النشر النهائي للـWAF لا يتم تلقائيًا من هذا المستودع. راجع حركة المرور أولًا حسب إرشادات Vercel قبل التحويل إلى الحظر.

## المرحلة 2 — مراجعة الحركة

راقب 24 ساعة أو ما يكفي من استخدام الاختبار الميداني.

الهدف هو التأكد أن 30 طلبًا / 10 دقائق لا يطابق مستخدمين طبيعيين أو اختبارات مشروعة.

راجع:
- عدد مرات تجاوز الحد
- عناوين IP المتكررة
- هل الزيارات مرتبطة فعليًا بـ `POST /api/analyze`
- هل هناك مستخدمون شرعيون خلف NAT واحد

## المرحلة 3 — Preview enforcement

بعد التأكد من أن threshold آمن:
- أنشئ/عدّل قاعدة Preview منفصلة
- action = rate_limit (429)
- اختبر أن التحليل الطبيعي يعمل
- اختبر أن تجاوز الحد يعطي 429

## المرحلة 4 — Production enforcement

إذا كانت بيانات المراقبة سليمة، غيّر قاعدة Production من log إلى rate_limit.

حد البداية المقترح:
- 30 طلبًا / 10 دقائق / IP

هذا الحد أوسع من الحارس الداخلي، والغرض منه منع تجاوز الحارس المحلي عبر عدة runtime instances.

## الحارس داخل التطبيق

النسخة الحالية داخل `lib/analysis-abuse-guard.js` تطبق:
- 4 طلبات تحليل مدفوعة / دقيقة / IP
- 20 طلب تحليل مدفوع / ساعة / IP
- تخزين hash فقط لعنوان IP في الذاكرة، وليس IP خامًا
- عدم احتساب الملفات المرفوضة أو الطلبات غير الصالحة ضمن الحصة
- حظر browser cross-site requests
- 429 + `Retry-After` عند تجاوز الحد

## حدود الحارس داخل التطبيق

- الذاكرة محلية لكل Serverless runtime.
- يمكن لمهاجم موزع أو توسع أفقي أن يتجاوز الحصة الإجمالية عبر أكثر من instance.
- لهذا تبقى WAF هي الطبقة الموزعة المطلوبة قبل الإطلاق العام.

## الحالة الحالية

موصل Vercel المستخدم في جلسة التطوير لا يعرض أي Team/Project حاليًا، لذلك لم يتم Stage قاعدة WAF بعد. بمجرد إعادة تفويض Vercel على مشروع `waffer` يمكن تنفيذ المرحلة 1 مباشرة.
