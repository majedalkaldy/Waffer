import { t } from '/lib/i18n.js';
import { RUNTIME_CONFIG } from '/lib/runtime-config.js';
import { compareDisplayedTotals } from '/lib/total-check.js';
import {
  fitWithinMaxDimension,
  shouldOptimizeImage,
  JPEG_QUALITY_LADDER
} from '/lib/image-optimization.js';
import { hasUsablePartNumber } from '/lib/identity.js';
import {
  selectPriceableItems,
  buildPriceComparePayload,
  summarizeVerifiedPricing
} from '/lib/pricing-client.js';
import {
  normalizeFieldTestDashboard,
  createFieldTestEvidence,
  updateFieldTestDraft,
  buildFieldTestExport,
  fieldTestScenarioRequirements
} from '/lib/field-test-client.js';
window.WAFFER_RUNTIME=RUNTIME_CONFIG;
window.wafferCompareDisplayedTotals=compareDisplayedTotals;
window.wafferHasUsablePartNumber=hasUsablePartNumber;
window.wafferSelectPriceableItems=selectPriceableItems;
window.wafferBuildPriceComparePayload=buildPriceComparePayload;
window.wafferSummarizeVerifiedPricing=summarizeVerifiedPricing;
window.wafferNormalizeFieldTestDashboard=normalizeFieldTestDashboard;
window.wafferCreateFieldTestEvidence=createFieldTestEvidence;
window.wafferUpdateFieldTestDraft=updateFieldTestDraft;
window.wafferBuildFieldTestExport=buildFieldTestExport;
window.wafferFieldTestScenarioRequirements=fieldTestScenarioRequirements;
window.wafferFitImageWithinMaxDimension=fitWithinMaxDimension;
window.wafferShouldOptimizeImage=shouldOptimizeImage;
window.WAFFER_IMAGE_QUALITY_LADDER=[...JPEG_QUALITY_LADDER];

const localeSelect=document.getElementById('localeSelect');
function applyLocale(locale){
 const isAr=locale.startsWith('ar');
 document.documentElement.lang=isAr?'ar':'en';
 document.documentElement.dir=isAr?'rtl':'ltr';
 document.getElementById('marketLabel').textContent=t(locale,'marketLabel');
 document.querySelector('.tag').textContent=t(locale,'tagline');
 document.getElementById('heroTitle').textContent=t(locale,'heroTitle');
 document.getElementById('heroLead').textContent=t(locale,'heroLead');
 if(!document.getElementById('file').files[0])document.getElementById('fileText').textContent=t(locale,'upload');
 document.getElementById('makeLabel').textContent=t(locale,'make');
 const makeSelect=document.getElementById('make');
 const retryMakes=document.getElementById('retryMakes');
 if(retryMakes)retryMakes.textContent=isAr?'إعادة تحميل الشركات':'Reload makes';
 if(makeSelect?.options?.[0]?.value===''){
   const failed=retryMakes && !retryMakes.classList.contains('hidden') && makeSelect.options.length===1;
   makeSelect.options[0].textContent=makeSelect.disabled
     ? (isAr?'جارٍ تحميل الشركات...':'Loading makes...')
     : failed
       ? (isAr?'تعذر تحميل الشركات':'Could not load makes')
       : (isAr?'اختر الشركة':'Choose make');
 }
 document.getElementById('modelLabel').textContent=t(locale,'model');
 document.getElementById('yearLabel').textContent=t(locale,'year');
 document.getElementById('vinLabel').textContent=t(locale,'vin');
 document.getElementById('analyzeBtn').textContent=t(locale,'analyze');
 document.getElementById('installBtn').textContent=t(locale,'install');
 document.getElementById('resultTitle').textContent=t(locale,'resultTitle');
 document.getElementById('advancedTitle').textContent=t(locale,'advancedTitle');
 document.getElementById('workshopMessageTitle').textContent=t(locale,'workshopMessageTitle');
 document.getElementById('detailsBtn').textContent=t(locale,'details');
 document.getElementById('workshopBtn').textContent=t(locale,'workshopButton');
 document.getElementById('backBtn').textContent=t(locale,'back');
 document.getElementById('newAnalysisBtn').textContent=t(locale,'newAnalysis');
 document.getElementById('copyMessageBtn').textContent=t(locale,'copyMessage');
 document.getElementById('resultBackBtn').textContent=t(locale,'resultBack');
 document.getElementById('shareSummaryBtn').textContent=t(locale,'shareSummary');
 document.getElementById('totalShownLabel').textContent=t(locale,'totalShown');
 document.getElementById('transparencyLabel').textContent=t(locale,'transparency');
 document.getElementById('identityLabel').textContent=t(locale,'identity');
 document.getElementById('compatibilityLabel').textContent=t(locale,'compatibility');
 document.getElementById('priceConfidenceLabel').textContent=t(locale,'priceConfidence');
 document.getElementById('overallLabel').textContent=t(locale,'overall');
 document.getElementById('findingsLabel').textContent=t(locale,'findings');
 document.getElementById('catalogMatchLabel').textContent='🔎 '+t(locale,'catalogMatch');
 document.getElementById('beforePayLabel').textContent=t(locale,'beforePay');
 document.getElementById('confirmedSavingLabel').textContent=t(locale,'confirmedSaving');
 document.getElementById('privacyText').textContent=t(locale,'privacy');
 document.getElementById('loadingTitle').textContent=t(locale,'loadingTitle');
 document.getElementById('loadingStep1').textContent=t(locale,'loadingStep1');
 document.getElementById('loadingStep2').textContent=t(locale,'loadingStep2');
 document.getElementById('loadingStep3').textContent=t(locale,'loadingStep3');
 document.getElementById('loadingStep4').textContent=t(locale,'loadingStep4');
 document.getElementById('loadingStep5').textContent=t(locale,'loadingStep5');
 document.getElementById('resultPill').textContent=t(locale,'resultPill');
 document.getElementById('transparencyHelp').textContent=t(locale,'transparencyHelp');
 document.getElementById('identityHelp').textContent=t(locale,'identityHelp');
 document.getElementById('compatibilityHelp').textContent=t(locale,'compatibilityHelp');
 document.getElementById('priceHelp').textContent=t(locale,'priceHelp');
 document.getElementById('overallHelp').textContent=t(locale,'overallHelp');
 document.getElementById('rConfidenceNote').textContent=t(locale,'confidenceNote');
 document.getElementById('trustNotice').textContent=t(locale,'trustNotice');
 document.getElementById('advancedPill').textContent=t(locale,'advancedPill');
 document.getElementById('itemsCaption').textContent=t(locale,'tableCaption');
 document.getElementById('colItem').textContent=t(locale,'colItem');
 document.getElementById('colType').textContent=t(locale,'colType');
 document.getElementById('colPartNumber').textContent=t(locale,'colPartNumber');
 document.getElementById('colPrice').textContent=t(locale,'colPrice');
 document.getElementById('colIdentity').textContent=t(locale,'colIdentity');
 document.getElementById('colCompatibility').textContent=t(locale,'colCompatibility');
 document.getElementById('colPriceAssessment').textContent=t(locale,'colPriceAssessment');
 document.getElementById('colConflict').textContent=t(locale,'colConflict');
 document.getElementById('detailsDisclaimer').textContent=t(locale,'detailsDisclaimer');
 document.getElementById('messagePill').textContent=t(locale,'messagePill');
 document.getElementById('detailsTitle').textContent=t(locale,'detailsTitle');
 const waiting=document.getElementById('catalogWaitingText'); if(waiting)waiting.textContent=t(locale,'catalogWaiting');
 document.getElementById('savingNote').textContent=t(locale,'savingNote');
 if(!window.wafferPartMatches)document.getElementById('priceReadiness').textContent=t(locale,'priceWaiting');
 document.getElementById('workshopFollowupBtn').textContent=t(locale,'workshopFollowup');
 if(typeof window.wafferRenderPricingSummary==='function')window.wafferRenderPricingSummary();
 if(typeof window.wafferRenderFieldTestDashboard==='function')window.wafferRenderFieldTestDashboard();
 const debugExport=document.getElementById('debugExportBtn');
 if(debugExport)debugExport.textContent=locale.startsWith('en')?'Export test report':'تصدير تقرير الاختبار';
 window.wafferLocale=locale;
 updateFormHint();
}
const savedLocale=localStorage.getItem('waffer-locale');
if(savedLocale && Array.from(localeSelect.options).some(o=>o.value===savedLocale))localeSelect.value=savedLocale;
localeSelect.addEventListener('change',()=>{
 localStorage.setItem('waffer-locale',localeSelect.value);
 applyLocale(localeSelect.value);
window.dispatchEvent(new CustomEvent('wafferClientModulesReady'));
});
applyLocale(localeSelect.value);
