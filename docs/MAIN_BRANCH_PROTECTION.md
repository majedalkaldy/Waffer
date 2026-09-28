# Waffer Main Branch Protection

الحالة الحالية المؤكدة عبر GitHub API بتاريخ 2026-09-27:

- الفرع: `main`
- `protected = true`
- Ruleset ID: `24069197`
- Ruleset: `Waffer main protection`
- Enforcement: `active`
- Require a pull request before merging: فعال.
- Require status checks to pass: فعال.
- Required status check: `regression-suite`.
- Require branches to be up to date: فعال.
- Conversation resolution: فعال.
- Block force pushes: فعال.
- Block deletions: فعال.
- Bypass actors: 0.
- Required human approvals: 0 حاليًا.
- Signed commits: غير مفروضة حاليًا.

## الإعداد المطبق في GitHub

تم تطبيق الإعداد التالي من Repository Settings:

1. **Settings → Rules → Rulesets**.
2. Branch ruleset باسم:
   `Waffer main protection`
3. Target branches يشمل:
   `main`
4. القواعد المفعلة:
   - Require a pull request before merging.
   - Require status checks to pass.
   - Require branches to be up to date before merging.
   - Block force pushes.
   - Block deletions.
5. Required status check:
   `regression-suite`
6. مفعّل أيضًا:
   - Require conversation resolution before merging.
7. لا يوجد bypass عام؛ يبقى ذلك ممنوعًا إلا لحاجة تشغيلية موثقة.

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
