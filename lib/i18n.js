export const UI_STRINGS = {
  'ar-SA': {
    appName: 'وفّر',
    tagline: 'افحص عرض صيانة سيارتك قبل أن تدفع',
    analyze: 'حلّل عرضي مجانًا ✨',
    upload: 'ارفع صورة العرض أو ملف PDF',
    marketLabel: 'السوق التجريبي الحالي: السعودية • العربية • SAR'
  },
  'en-SA': {
    appName: 'Waffer',
    tagline: 'Check your vehicle repair estimate before you pay',
    analyze: 'Analyze my estimate',
    upload: 'Upload an estimate image or PDF',
    marketLabel: 'Current pilot market: Saudi Arabia • English • SAR'
  }
};

export function t(locale, key) {
  const dict = UI_STRINGS[locale] || UI_STRINGS['ar-SA'];
  return dict[key] || UI_STRINGS['ar-SA'][key] || key;
}
