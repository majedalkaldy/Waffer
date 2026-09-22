export const UI_STRINGS = {
  'ar-SA': {
    appName: 'وفّر',
    tagline: 'افحص عرض صيانة سيارتك قبل أن تدفع',
    heroTitle: 'هل عرض الورشة واضح ومعقول؟',
    heroLead: 'ارفع صورة أو PDF لعرض الصيانة. سيقرأ «وفّر» البنود والأسعار ويحدد المعلومات الناقصة ونقاط التحقق قبل الموافقة.',
    analyze: 'حلّل عرضي مجانًا ✨',
    analyzing: 'جارٍ التحليل...',
    upload: 'ارفع صورة العرض أو ملف PDF',
    make: 'الشركة',
    model: 'الموديل',
    year: 'سنة الصنع',
    vin: 'رقم الهيكل VIN',
    marketLabel: 'السوق التجريبي الحالي: السعودية • العربية • SAR',
    resultTitle: 'نتيجة التحليل',
    advancedTitle: 'التحليل المتقدم',
    workshopMessageTitle: 'رسالة للورشة',
    install: 'إضافة وفّر إلى الشاشة الرئيسية',
    resultTitle: 'نتيجة التحليل',
    advancedTitle: 'التحليل المتقدم',
    workshopMessageTitle: 'رسالة للورشة',
    details: 'عرض تفاصيل البنود',
    workshopButton: 'أنشئ رسالة للورشة',
    back: 'رجوع',
    newAnalysis: 'تحليل عرض آخر',
    copyMessage: 'نسخ الرسالة',
    resultBack: 'العودة للنتيجة',
    shareSummary: 'مشاركة ملخص النتيجة'
  },
  'en-SA': {
    appName: 'Waffer',
    tagline: 'Check your vehicle repair estimate before you pay',
    heroTitle: 'Is your workshop estimate clear and reasonable?',
    heroLead: 'Upload an image or PDF of the repair estimate. Waffer reads the line items and prices, then highlights missing information and verification points before approval.',
    analyze: 'Analyze my estimate',
    analyzing: 'Analyzing...',
    upload: 'Upload an estimate image or PDF',
    make: 'Make',
    model: 'Model',
    year: 'Model year',
    vin: 'VIN',
    marketLabel: 'Current pilot market: Saudi Arabia • English • SAR',
    resultTitle: 'Analysis result',
    advancedTitle: 'Advanced analysis',
    workshopMessageTitle: 'Message to workshop',
    install: 'Add Waffer to home screen',
    resultTitle: 'Analysis result',
    advancedTitle: 'Advanced analysis',
    workshopMessageTitle: 'Message to workshop',
    details: 'View line-item details',
    workshopButton: 'Create a workshop message',
    back: 'Back',
    newAnalysis: 'Analyze another estimate',
    copyMessage: 'Copy message',
    resultBack: 'Back to result',
    shareSummary: 'Share result summary'
  }
};

export function t(locale, key) {
  const dict = UI_STRINGS[locale] || UI_STRINGS['ar-SA'];
  return dict[key] || UI_STRINGS['ar-SA'][key] || key;
}
