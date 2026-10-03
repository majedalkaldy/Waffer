# Waffer — US-first trusted pricing strategy (adopted 2026-10-03)

Waffer now treats the **United States as the primary launch market** while preserving Saudi Arabia as a secondary market. The trust boundary is unchanged: no scraping is promoted as a verified source, no savings are shown from an unverified offer, and every production provider must pass the sample evaluator and shadow review.

## US priority order

### 1. eBay Browse API / eBay Motors — first pricing integration candidate

Role: **live U.S. offers + part identity + compatibility evidence where supported**.

Implementation rules:
- Use official Buy/Browse APIs and OAuth application access tokens.
- Production use is gated on eBay Buy API approval/eligibility; Waffer must not assume sandbox credentials imply production rights.
- Preserve eBay Browse result ordering inside the eBay source unless an approved agreement explicitly permits a different presentation.
- Use the U.S. marketplace and parts-compatibility filters.
- Treat an offer as vehicle-verified only when the provider evidence is strong enough for the exact vehicle context; Year/Make/Model alone must not be promoted as exact fitment when Trim/Engine is required.
- Normalize item price, mandatory shipping, currency, stock/availability, seller, source URL, and checked-at time.
- Keep the adapter in shadow mode until at least 20 real cases pass the existing pilot gate.

Status: **PRIMARY US CANDIDATE — credentials/access and shadow validation required before activation.**

### 2. NHTSA vPIC — U.S. VIN enrichment

Role: **VIN decoding/enrichment**, especially Year/Make/Model/Trim/Engine fields needed for U.S. compatibility checks.

It is not a price source and must never set verified market pricing by itself.

Status: **VIN ENRICHMENT CANDIDATE.**

### 3. AutoPartsAPI / TecDoc — catalog identity and cross-reference

Role: existing **part identity / catalog / OEM cross-reference** layer. For the US-first transition, Waffer keeps the documented worldwide country-filter fallback until a provider-verified U.S.-specific filter identifier is available. It is not treated as a retail price source.

Status: **KEEP FOR CATALOG IDENTITY; DO NOT CLAIM US-SPECIFIC PRICING.**

### US comparison contract

A future “Waffer Best Deal” may only use comparable offers after:
- exact part identity is established;
- vehicle compatibility is sufficiently verified;
- item price and mandatory shipping/fees used by Waffer are known;
- the offer is currently available;
- seller/source and timestamp are traceable.

Taxes that depend on destination must be identified separately unless the destination is known and the tax is actually available from the source.

---

# Previous Saudi provider research (retained for secondary-market work)

# Waffer — Trusted Price Provider Candidates (updated 2026-09-28)

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

## 3. Speero / سبيرو — مرشح سوق سعودي متعدد التجار

### ما تثبته المصادر العامة

- سبيرو منصة سعودية لقطع الغيار وتتيح استلام أكثر من تسعيرة للقطع قبل الشراء.
- بوابة الشركاء تعلن عن شبكة تتجاوز 200 تاجر وتسمح للتاجر بتحديث بيانات المخزون التي يرغب باستقبال الطلبات عليها.
- يوجد مسار جملة منفصل `speero.sale` يعلن عن مخزون كبير وأسعار جملة وتوصيل داخل المملكة.
- هذا يجعل سبيرو مرشحًا ذا قيمة إذا توفر API/quote feed رسمي يعيد هوية القطعة والسعر وصلاحية العرض والمورد.

### المطلوب قبل أي ربط

- API/quote feed أو sandbox مصرح به.
- إثبات رقم OEM/MPN أو هوية قطعة يمكن ربطها بالكتالوج.
- صلاحية التسعيرة، VAT والشحن، التوفر، هوية المورد ورابط/معرف العرض.
- شروط إعادة عرض السعر في موقع خارجي.
- لا scraping.

### الحالة

**PARTNERSHIP/API ACCESS REQUIRED — FOLLOW-UP SENT 2026-09-28.**

Sources reviewed:
- https://speero.net/about-us
- https://speero.partners/
- https://speero.sale/ar

## 4. Salla Merchant API — مسار تجميع عروض من متاجر متعاونة

### ما تثبته الوثائق الرسمية

- تطبيقات Salla تستخدم OAuth2 بصلاحيات يوافق عليها التاجر.
- Merchant API يتيح قراءة تفاصيل المنتج بصلاحية `products.read`.
- نموذج المنتج يتضمن SKU وMPN ورابط العميل والسعر والعملة و`taxed_price`.
- API منفصل للكميات يعيد quantity وprice.
- Webhooks تتضمن أحداث تحديث سعر المنتج، ما يسمح بتقليل polling وتحديث البيانات قرب الزمن الحقيقي.
- Partner Portal يدعم تطبيقات وتجربة على demo stores قبل النشر العام.

### ملاءمة Waffer

سلة ليست “مزود سوق” بنفسها، لكنها قد تكون بنية ممتازة لجمع عروض **متاجر قطع غيار وافقت صراحةً** على ربط بياناتها بوفّر. هذا يحل جانب الترخيص على مستوى كل تاجر، لكنه يحتاج شبكة متاجر كافية قبل وصف النتائج بأنها نطاق سوق.

### المطلوب قبل أي ربط

- اعتماد تطبيق Waffer أو تجربة خاصة مع متجر/متجرين.
- تفويض `products.read` فقط في البداية.
- تحديد طريقة ربط MPN/OEM وبيانات توافق السيارة؛ Salla لا يثبت fitment تلقائيًا.
- استخدام webhooks للسعر والمخزون حيثما أمكن.
- اتفاق واضح مع المتجر على إعادة عرض السعر والربط للشراء.

### الحالة

**TECHNICALLY DOCUMENTED / MERCHANT AUTHORIZATION REQUIRED — FOLLOW-UP SENT 2026-09-28.**

Sources reviewed:
- https://docs.salla.dev/421412m0
- https://docs.salla.dev/421117m0
- https://docs.salla.dev/5394169e0
- https://docs.salla.dev/9612796e0
- https://docs.salla.dev/433805m0

## 5. eBay Browse API — مرجع دولي ثانوي فقط

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

## 6. AutoPartsAPI / TecDoc data — Catalog identity, not price source

### ما تثبته الوثائق الحالية

المزود الحالي يغطي المركبات، القطع، OEM numbers، cross-references، media وVIN. البحث داخل الوثائق العامة الحالية لم يظهر contract خاصًا بالأسعار/المخزون التجاري.

### ملاءمة Waffer

يستمر كمصدر **هوية وتوافق** ولا يُرفع إلى `verifiedMarketPricing`.

### الحالة

**KEEP AS CATALOG / NOT A VERIFIED PRICE PROVIDER.**

Sources reviewed:
- https://auto-parts-catalog.apiprofile.com/documentation
- https://auto-parts-catalog.apiprofile.com/

## حالة التواصل — 2026-09-28

تمت المراسلات التالية من بريد المشروع، بدون أي التزام مالي أو قانوني:

- **Qitea**: رسالة أولى 2026-09-25 + متابعة 2026-09-28 إلى `info@qiteapp.com`.
- **Speero**: رسالة أولى 2026-09-25 + متابعة 2026-09-28 إلى `support@speero.net`.
- **Salla Partners**: رسالة أولى 2026-09-25 + متابعة 2026-09-28 إلى `partners@salla.sa`.
- **Automotive Spares Co.**: طلب Pilot أولي 2026-09-28 إلى `info@as.com.sa`.

قبل إرسال متابعات 2026-09-28 لم يظهر رد وارد في خيوط Qitea أو Speero أو Salla.

المطلوب من جميع الجهات متقارب: Pilot على 20–50 قطعة، API/feed/sandbox مصرح به، OEM/MPN، السعر النهائي، VAT، المخزون، المصدر، وقت التحديث، والتوافق إن توفر، مع رفض صريح للـscraping.

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
6. تشغيل `npm run evaluate:price-provider-sample -- <sample.json>` على العينة الرسمية.
7. لا يبدأ shadow إلا إذا اجتازت بوابة `docs/PRICE_PROVIDER_PILOT.md`.
8. تشغيل provider في وضع shadow: نجمع النتيجة للتدقيق دون إظهار توفير للمستخدم.
9. مراجعة 20–50 حالة حقيقية.
10. عند نجاح الأدلة فقط: تسجيل provider للسوق `SA` وتفعيل `verifiedMarketPricing`.
11. إضافة مزود ثانٍ قبل وصف النتيجة بأنها نطاق سوق واسع، إذا كان ذلك مطلوبًا للمنتج.

## قرار تجاري مطلوب

الخطوة التالية ليست برمجية بحتة: يجب اختيار جهة للتواصل والحصول على إذن/وصول رسمي. لا يبدأ Waffer اشتراكًا أو scraping أو اتصالًا تجاريًا تلقائيًا.
