# Waffer Main Branch Protection

الحالة الحالية المؤكدة عبر GitHub API:

- الفرع: `main`
- `protected = false`
- Required status checks: off
- CI موجود ويعمل: workflow `Waffer CI`
- Job الإلزامي المطلوب: `regression-suite`

## الإعداد المطلوب في GitHub

من Repository Settings:

1. افتح **Settings → Rules → Rulesets**.
2. أنشئ **New branch ruleset** باسم:
   `Waffer main protection`
3. اجعل Target branches يشمل:
   `main`
4. فعّل القواعد التالية:
   - Require a pull request before merging.
   - Require status checks to pass.
   - Require branches to be up to date before merging.
   - Block force pushes.
   - Block deletions.
5. أضف Required status check:
   `regression-suite`
6. يفضّل تفعيل:
   - Require conversation resolution before merging.
7. لا تضف bypass عام للمستخدمين أو التطبيقات إلا عند وجود حاجة تشغيلية موثقة.

## ما لا نفعله

- لا نجعل Vercel وحده بديلًا عن CI.
- لا نسمح بالدمج إذا فشل `regression-suite`.
- لا نطلب review بشري إلزامي حاليًا إذا كان ذلك سيعيق التطوير الفردي؛ يمكن إضافته لاحقًا عند دخول مساهمين آخرين.
- لا نفعّل signed commits كشرط حاليًا ما لم نجهز مسار التوقيع لكل بيئة التطوير.

## معيار التحقق بعد التفعيل

بعد حفظ الـRuleset:

- قراءة branch `main` يجب أن تظهر حماية مفعلة.
- محاولة دمج PR بفشل CI يجب أن تُمنع.
- PR ناجح يجب أن يظهر `regression-suite` كفحص مطلوب.
- force push وbranch deletion يجب أن يكونا محظورين.

هذا إعداد مستودع وليس تغييرًا في منطق التطبيق، ويمكن تعديله لاحقًا دون إعادة نشر الموقع.
