# Waffer — Price Provider Pilot Acceptance

هذه البوابة تختبر **عينة بيانات مصرح بها** من مزود أسعار قبل أي ربط إنتاجي أو عرض سعر للمستخدم.

لا تعني نتيجة PASS اختيار المزود تجاريًا، ولا تفعّل `verifiedMarketPricing`، ولا تسمح بـscraping.

## صيغة العينة

يستقبل الأمر ملف JSON بالشكل التالي:

```json
{
  "providerId": "provider-name",
  "market": "SA",
  "currency": "SAR",
  "cases": [
    {
      "caseId": "case-001",
      "requestedPartNumber": "04465-33471",
      "checkedAt": "2026-09-28T05:30:00.000Z",
      "marketRange": {
        "min": 180,
        "median": 210,
        "max": 240,
        "currency": "SAR",
        "sampleSize": 4
      },
      "bestOffer": {
        "partNumber": "04465-33471",
        "finalUnitPrice": 195,
        "currency": "SAR",
        "seller": "Example Supplier",
        "sourceUrl": "https://supplier.example/offer/123",
        "verifiedIdentity": true,
        "vehicleVerified": true,
        "inStock": true
      }
    }
  ]
}
```

## التشغيل

```bash
npm run evaluate:price-provider-sample -- ./provider-sample.json
```

النتيجة JSON machine-readable. يخرج الأمر exit code 2 إذا لم تكن العينة جاهزة حتى لو كان الملف صالحًا.

## بوابة Verified Offer shadow

الإعداد الافتراضي يتطلب:

- 20 حالة على الأقل.
- 80% على الأقل من الحالات تقبل `Verified Offer` كاملًا.
- 90% على الأقل من الحالات حديثة ضمن 48 ساعة.
- لا timestamps غير صالحة.
- لا timestamps مستقبلية خارج هامش 5 دقائق.
- العملة تطابق SAR للسوق السعودي.
- رقم العرض يطابق رقم القطعة المطلوبة بعد التطبيع.
- `verifiedIdentity=true`.
- `vehicleVerified=true`.
- `inStock=true`.
- `finalUnitPrice` صالح وغير سالب.
- اسم البائع موجود.
- رابط المصدر HTTPS.

النجاح يعطي:
`PASS_FOR_VERIFIED_OFFER_SHADOW`.

هذا يسمح فقط بتشغيل المزود في وضع shadow للمراجعة، ولا يسمح بإظهار التوفير للمستخدم.

## بوابة Market Range shadow

إذا لم تتوفر عروض شراء كاملة لكن توجد نطاقات سوق موثقة:

- 20 حالة على الأقل.
- 80% على الأقل من الحالات تقبل market range.
- min <= median <= max.
- العملة صحيحة.
- freshness كما أعلاه.

يمكن أن تكون النتيجة:
`PASS_FOR_MARKET_RANGE_SHADOW_ONLY`.

هذه النتيجة **لا تكفي لحساب التوفير المؤكد**.

## حالات الرفض المهمة

- `VERIFIED_OFFER_CONTRACT_REJECTED`: هوية/عملة/مخزون/توافق/رابط/سعر العرض غير مطابق للعقد.
- `MARKET_RANGE_CONTRACT_REJECTED`: النطاق أو العملة غير صالحين.
- `CHECKED_AT_STALE`: البيانات أقدم من نافذة Pilot.
- `CHECKED_AT_IN_FUTURE`: زمن المصدر غير موثوق.
- `REQUESTED_PART_NUMBER_REQUIRED`: لا يمكن إثبات تطابق الهوية.
- `NO_PRICE_DATA`: الحالة لا تحتوي عرضًا أو نطاقًا.

## بعد نجاح Pilot

1. بناء adapter خاص بالمزود.
2. تشغيله shadow فقط.
3. مقارنة 20–50 حالة حقيقية يدويًا مع المصدر.
4. مراجعة شروط إعادة عرض السعر والمخزون.
5. مراجعة VAT والشحن وأي رسوم إلزامية.
6. لا يسجل المزود في Production registry إلا بعد قرار تجاري صريح.
7. لا يتحول `verifiedMarketPricing` إلى true إلا بعد live validation.
