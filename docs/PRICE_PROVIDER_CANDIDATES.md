# Waffer — Trusted Price Provider Candidates (2026-09-24)

هذه الوثيقة هي **بحث تكامل فقط**. لا تعني اختيار مزود، ولا تمنح إذنًا باستخدام بيانات طرف ثالث، ولا تنشئ أي التزام مالي.

## متطلبات Waffer

أي مصدر إنتاجي يجب أن يستطيع، قدر الإمكان، إرجاع:

- رقم قطعة قابل للتتبع (OEM / MPN / supplier part number).
- السعر النهائي للوحدة بالريال السعودي أو عملة معلومة قابلة للتحقق.
- حالة المخزون/التوفر.
- اسم البائع أو المورد.
- رابط/معرف مصدر يمكن الرجوع إليه.
- وقت آخر تحقق.
- دليل توافق مع السيارة أو إمكانية ربط العرض بهوية قطعة متوافقة تم التحقق منها.
- سياسة واضحة لاستخدام البيانات آليًا وإعادة عرض السعر.

عقد الثقة داخل Waffer موجود في `lib/price-provider.js`، ولن يقبل Verified Offer بلا هوية/توافق/مخزون/سعر/دليل.

## 1. Qitea / قطعة — مرشح تكامل سعودي مباشر

### ما تثبته المصادر العامة

- منصة سعودية متعددة البائعين لقطع الغيار.
- تدعم البحث بالـVIN ورقم القطعة.
- تعرض أسعارًا من موردين متعددين ومقارنة مواصفات ووقت توصيل.
- شروط التاجر تلزم التجار بتحديث الأسعار والمخزون والتوفر.
- شروط الاستخدام تمنع نسخ/إعادة نشر/استغلال بيانات المنصة أو الأسعار أو الواجهات بدون موافقة مسبقة.

### ملاءمة Waffer

البيانات المعروضة علنًا قريبة جدًا من احتياجات `Verified Offer`: مورد + سعر + توفر + هوية قطعة + توافق سيارة.

### المطلوب قبل أي ربط

- موافقة مكتوبة أو عقد API/data partnership.
- توثيق API رسمي أو feed مصرح به.
- توضيح حدود الطلبات، SLA، شروط إعادة عرض الأسعار، الضرائب، المخزون، ومناطق التغطية.
- تحديد هل السعر المعاد شامل VAT ورسوم إلزامية أخرى.

### الحالة

**PARTNERSHIP/API ACCESS REQUIRED — لا scraping.**

Sources reviewed:
- https://qiteapp.com/
- https://qiteapp.com/vendor-conditions?lang=en
- https://qiteapp.com/terms-of-use?lang=en

## 2. Automotive Spares Co. — Pilot supplier feed محتمل

### ما تثبته المصادر العامة

- متجر/موزع في الرياض.
- الأسعار على المتجر تشمل 15% VAT.
- المخزون والسعر مرتبطان مباشرة بالـERP ويتم تحديث المخزون بصورة متكررة.
- المنتجات تحمل أرقام OEM.
- لديهم آلية تحقق بالـVIN قبل الشراء.
- النطاق الحالي يركز على قطع OEM لسيارات أوروبية فاخرة، لذلك لا يغطي سوق Waffer كاملًا.

### ملاءمة Waffer

قد يكون مناسبًا **كمورد أول تجريبي** لإثبات adapter حقيقي: سعر سعودي + VAT + OEM + مخزون + تحقق VIN.

### المطلوب قبل أي ربط

- موافقة المورد على feed/API أو export دوري.
- الاتفاق على schema: OEM، السعر النهائي، المخزون، وقت التحديث، رابط العرض.
- عدم الاعتماد على scraping للمتجر.
- قياس التغطية المحدودة للعلامات وعدم تقديمها كسعر سوق شامل.

### الحالة

**DIRECT SUPPLIER FEED/PARTNERSHIP REQUIRED.**

Sources reviewed:
- https://store.as.com.sa/en
- https://store.as.com.sa/en/shop

## 3. eBay Browse API — مرجع دولي ثانوي فقط

### ما تثبته المصادر الرسمية

- Browse API يدعم البحث في listings واسترجاع السعر والتفاصيل والتوافق لبعض قطع السيارات.
- يتطلب Application access token.
- قائمة Buy API marketplaces الرسمية لا تتضمن Marketplace سعوديًا.

### ملاءمة Waffer

يمكن استخدامه مستقبلًا كـ:
- مؤشر دولي/عرض دولي مستقل.
- مصدر إضافي بعد فصل الشحن والضرائب والعملات.

لا يُعامل بمفرده على أنه **سعر السوق السعودي**.

### الحالة

**OPTIONAL INTERNATIONAL SECONDARY SOURCE.**

Sources reviewed:
- https://developer.ebay.com/develop/api/buy
- https://developer.ebay.com/api-docs/buy/ref-marketplace-supported.html

## 4. AutoPartsAPI / TecDoc data — Catalog identity, not price source

### ما تثبته الوثائق الحالية

المزود الحالي يغطي المركبات، القطع، OEM numbers، cross-references، media وVIN. البحث داخل الوثائق العامة الحالية لم يظهر contract خاصًا بالأسعار/المخزون التجاري.

### ملاءمة Waffer

يستمر كمصدر **هوية وتوافق** ولا يُرفع إلى `verifiedMarketPricing`.

### الحالة

**KEEP AS CATALOG / NOT A VERIFIED PRICE PROVIDER.**

Sources reviewed:
- https://auto-parts-catalog.apiprofile.com/documentation
- https://auto-parts-catalog.apiprofile.com/

## مصادر غير مناسبة حاليًا

- أي scraping لمتاجر/منصات بدون إذن صريح.
- أسعار search-engine snippets.
- median من سوق دولي وتقديمه كتوفير سعودي مؤكد.
- feed لا يثبت المخزون أو هوية القطعة.
- API يسمح للتاجر فقط برفع منتجاته ولا يتيح قراءة عروض السوق من موردين مستقلين.

## مسار التكامل المقترح بعد قرار المستخدم

1. الحصول على وصول رسمي من مزود سعودي واحد.
2. بناء adapter مستقل تحت `lib/price-providers/<provider>.js`.
3. إضافة timeout وrate limits وcircuit/failure handling.
4. تحويل مخرجات المزود إلى contract `price-provider.js`.
5. اختبار OEM/MPN match + vehicle compatibility + currency + VAT + stock.
6. تشغيل provider في وضع shadow: نجمع النتيجة للتدقيق دون إظهار توفير للمستخدم.
7. مراجعة 20–50 حالة حقيقية.
8. عند نجاح الأدلة فقط: تسجيل provider للسوق `SA` وتفعيل `verifiedMarketPricing`.
9. إضافة مزود ثانٍ قبل وصف النتيجة بأنها نطاق سوق واسع، إذا كان ذلك مطلوبًا للمنتج.

## قرار تجاري مطلوب

الخطوة التالية ليست برمجية بحتة: يجب اختيار جهة للتواصل والحصول على إذن/وصول رسمي. لا يبدأ Waffer اشتراكًا أو scraping أو اتصالًا تجاريًا تلقائيًا.
