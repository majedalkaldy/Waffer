import { requestJSON, RunScope } from '../lib/client-http.js';
import { arrayAt, normalVIN, validVIN, validateFile, vehicleCandidates, validateAnalysis, lineType } from '../lib/client-core.js';
import { matchCatalog } from '../lib/client-matcher.js';

const words = {
 ar: {
  language:'اللغة', pilot:'نسخة اختبار — السوق السعودي. ليست توصية بإصلاح السيارة أو ضمانًا للتوافق.',
  hero:'افحص عرض صيانة سيارتك قبل أن تدفع', lead:'ارفع العرض لمراجعة البنود والبيانات الناقصة. مطابقة الكتالوج تحتاج سيارة محددة؛ والتوفير غير محسوب دون مصدر سعر موثوق.',
  upload:'اختر صورة العرض أو ملف PDF', fileHint:'JPG / PNG / WEBP / PDF — حتى 3 MB لحماية حد حجم الطلب بعد التحويل.',
  vin:'رقم الهيكل VIN (اختياري)', verify:'تحقق من السيارة', chooseVariant:'أعاد الكتالوج أكثر من سيارة. اختر الفئة الصحيحة دون تخمين.',
  make:'الشركة', model:'الموديل', year:'سنة الصنع', analyze:'حلّل العرض', privacy:'عند طلب التحليل يُرسل الملف إلى الخادم ومزود التحليل. لا تُدرج بيانات شخصية لا يحتاجها العرض، وراجع النص قبل مشاركته.',
  loading:'جارٍ تحليل العرض', cancel:'إلغاء الانتظار', cancelNote:'إلغاء الانتظار يمنع ظهور نتيجة هذه المحاولة. قد يكون الخادم بدأ المعالجة بالفعل.',
  result:'نتيجة مراجعة العرض', printedTotal:'الإجمالي المطبوع كما استُخرج', transparency:'وضوح العرض', identity:'هوية القطع', compatibility:'التوافق', priceConfidence:'المقارنة السعرية',
  scoreNote:'هذه تقديرات النموذج وليست اختبار دقة أو تقييمًا للورشة. التعرف على نوع القطعة لا يثبت توافق رقم قطعة بعينه.',
  findings:'الملاحظات المستخرجة', catalog:'الكتالوج', catalogNote:'حتى 3 مرشحين من البيانات المفحوصة؛ لا يوجد ترتيب سعري أو ادعاء أصلي/OEM. موضع التركيب وحده لا يثبت جميع شروط التوافق.',
  details:'تفاصيل البنود', workshop:'رسالة للورشة', share:'مشاركة الملخص', new:'تحليل عرض آخر', diagnostics:'بيانات تشخيص الاختبار', diagnosticNote:'هذه بيانات هذه المحاولة فقط، وليست شهادة نجاح اختبار ميداني.',
  tableCaption:'راجع البنود مع المستند الأصلي', item:'البند', type:'النوع', partNumber:'رقم القطعة', amount:'السعر المستخرج', manufacturer:'المصنع', actions:'قبل الموافقة',
  savings:'التوفير غير محسوب: لا يوجد مصدر سعر سوق موثق مربوط بالنتيجة.', back:'رجوع', copy:'نسخ الرسالة', install:'إضافة وفّر إلى الشاشة الرئيسية', offline:'لا يوجد اتصال بالإنترنت.',
  selected:'الملف المختار', none:'غير متوفر', vinEmpty:'يمكن تحليل العرض دون VIN، لكن لن تبدأ مطابقة الكتالوج.', vinBusy:'جارٍ التحقق من VIN…', vinResolved:'سيارة محددة من الكتالوج',
  vinMultiple:'نتيجة VIN غير حاسمة: اختر الفئة الصحيحة لتفعيل المطابقة.', vinMissing:'لم يحدد الكتالوج سيارة. يمكن مراجعة العرض دون مطابقة قطع.', vinFailed:'تعذر فحص VIN. لن تُنسب القطع إلى سيارة غير محددة.', select:'اختر الفئة', manual:'بيانات السيارة المدخلة يدويًا لا تثبت توافق القطع.',
  makeFailed:'تعذر تحميل اقتراحات الشركات؛ يمكنك كتابة اسم الشركة يدويًا.', health:'تمت قراءة إعدادات الخدمة؛ نجاح التحليل يُعرف عند تنفيذ الطلب.', healthFailed:'تعذر قراءة حالة الخدمة. هذا لا يثبت نجاح التحليل أو فشله.',
  NO_FILE:'اختر صورة أو PDF أولًا.', EMPTY_FILE:'الملف فارغ.', FILE_TOO_LARGE:'الحد الحالي 3 MB قبل التحويل. صغّر الملف ثم أعد اختياره.', UNSUPPORTED_FILE:'استخدم JPG أو PNG أو WEBP أو PDF.',
  INVALID_VIN:'VIN يجب أن يتكون من 17 خانة صحيحة.', INVALID_YEAR:'تحقق من سنة الصنع.', TIMEOUT:'انتهت مهلة الطلب. لم تُعرض نتيجة قديمة؛ أعد المحاولة.', INVALID_RESPONSE:'استجابة غير مكتملة أو غير صالحة. لم تُعتبر نتيجة ناجحة.',
  ANALYSIS_RATE_LIMITED:'خدمة التحليل مشغولة أو مقيدة حاليًا. أعد المحاولة لاحقًا.', HTTP_ERROR:'تعذر إكمال الطلب. راجع إعداد الخدمة أو أعد المحاولة.',
  phaseVin:'التحقق من السيارة', phaseFile:'تجهيز الملف', phaseAI:'انتظار تحليل المستند', elapsed:'الوقت المنقضي', seconds:'ث',
  waiting:'لم تبدأ المطابقة.', matching:'جارٍ جلب مرشحي الكتالوج…', COMPLETED:'اكتمل طلب الكتالوج', PARTIAL:'اكتملت بعض الطلبات فقط؛ توجد بيانات لم تُفحص', TIMED_OUT:'انتهت مهلة الكتالوج؛ تحليل العرض متاح', CANCELED:'أُلغيت المطابقة', NOT_APPLICABLE:'لم تُحدد سيارة؛ المطابقة غير مطبقة', NO_PART_ITEMS:'لا توجد بنود قطع مؤكدة للتعامل معها', UNSUPPORTED_MARKET:'السوق غير مدعوم',
  SKIPPED:'لم يُرسل للكتالوج: ليس بند قطعة محددًا', NO_PRODUCT_MATCH:'لم يتحدد نوع مطابق', POSITION_AMBIGUOUS:'يذكر البند أمامي وخلفي معًا؛ يجب تقسيمه أو توضيحه', CANDIDATES:'مرشحون من الكتالوج — يلزم تحقق', AXLE_CANDIDATES:'مرشحون يطابقون موضع التركيب المطلوب فقط', NO_ARTICLES:'لم تُرجع الاستجابة أرقام قطع', NO_POSITION_EVIDENCE:'لا يوجد دليل موضع مناسب في العينة المفحوصة', ERROR:'تعذر تحميل بيانات هذا البند', PENDING:'لم يُفحص بعد',
  examined:'فُحصت معايير', of:'من', available:'نتائج مسترجعة', matchedTypes:'أنواع بنود محددة', withCandidates:'بنود لها مرشحون', noAlerts:'لم تُستخرج ملاحظات رئيسية؛ راجع المستند للتحقق.',
  extractedSum:'المجموع الذي استخرجه النموذج (غير مدقق حسابيًا)', tax:'الضريبة المستخرجة', labor:'أجور العمل المستخرجة', warranty:'الضمان المستخرج', contextCurrency:'عملة سياق الطلب',
  part:'قطعة', service:'خدمة', fee:'رسوم', unknown:'غير محدد', front:'أمامي', rear:'خلفي', copied:'تم النسخ.', copyFailed:'تعذر النسخ. حدد النص وانسخه يدويًا.',
  sourceLanguage:'تغيير لغة الواجهة لا يعيد تحليل النص؛ يبقى النص المستخرج بلغة نتيجة التحليل.', fallbackMessage:'السلام عليكم، أرجو توضيح أرقام القطع ومصانعها وأجور العمل والضريبة والضمان غير المبين في العرض قبل الموافقة.'
 },
 en: {
  language:'Language', pilot:'Saudi pilot — not a repair recommendation or a fitment guarantee.',
  hero:'Check your repair estimate before you pay', lead:'Upload an estimate to review its items and missing information. Catalog matching needs a specific vehicle; savings require a verified price source.',
  upload:'Choose an estimate image or PDF', fileHint:'JPG / PNG / WEBP / PDF — up to 3 MB before encoding to stay within the request limit.',
  vin:'VIN (optional)', verify:'Check vehicle', chooseVariant:'The catalog returned multiple vehicles. Select the correct variant; none is chosen automatically.', make:'Make', model:'Model', year:'Model year', analyze:'Analyze estimate',
  privacy:'When analysis is requested, the file is sent through the server to the analysis provider. Omit unnecessary personal details and review the text before sharing.',
  loading:'Analyzing estimate', cancel:'Cancel waiting', cancelNote:'Canceling prevents this attempt from updating the screen. Server processing may already have started.',
  result:'Estimate review', printedTotal:'Printed total as extracted', transparency:'Estimate clarity', identity:'Part identity', compatibility:'Compatibility', priceConfidence:'Price comparison',
  scoreNote:'These are model estimates, not accuracy tests or workshop ratings. Identifying a part category does not verify a specific part number.',
  findings:'Extracted findings', catalog:'Catalog', catalogNote:'Up to 3 candidates from the inspected data; no price ranking or original/OEM claim. Fitting position alone does not verify all fitment requirements.',
  details:'Line-item details', workshop:'Workshop message', share:'Share summary', new:'Analyze another estimate', diagnostics:'Test diagnostics', diagnosticNote:'These describe this attempt only, not a passed field test.',
  tableCaption:'Check each item against the original document', item:'Item', type:'Type', partNumber:'Part number', amount:'Extracted price', manufacturer:'Manufacturer', actions:'Before approval',
  savings:'Savings are not calculated: no verified market price source is linked to this result.', back:'Back', copy:'Copy message', install:'Add Waffer to home screen', offline:'No internet connection.',
  selected:'Selected file', none:'Not available', vinEmpty:'Analysis can run without VIN. Catalog matching will not start.', vinBusy:'Checking VIN…', vinResolved:'Vehicle identified in catalog',
  vinMultiple:'VIN is ambiguous. Choose the correct variant to enable matching.', vinMissing:'The catalog did not identify a vehicle. Document analysis can continue without parts matching.', vinFailed:'VIN lookup failed. Parts will not be assigned to an unidentified vehicle.', select:'Select variant', manual:'Manually entered vehicle details do not verify part fitment.',
  makeFailed:'Make suggestions are unavailable. Enter a make manually.', health:'Service configuration received; analysis availability is checked when a request runs.', healthFailed:'Service status could not be read. This does not establish whether analysis works.',
  NO_FILE:'Choose an image or PDF first.', EMPTY_FILE:'The file is empty.', FILE_TOO_LARGE:'The current limit is 3 MB before encoding. Reduce the file size and select it again.', UNSUPPORTED_FILE:'Use JPG, PNG, WEBP, or PDF.',
  INVALID_VIN:'VIN must contain 17 valid characters.', INVALID_YEAR:'Check the model year.', TIMEOUT:'The request timed out. No stale result was applied. Try again.', INVALID_RESPONSE:'The response is incomplete or invalid; it was not accepted as successful.', ANALYSIS_RATE_LIMITED:'Analysis is busy or rate limited. Try again later.', HTTP_ERROR:'The request failed. Check service configuration or try again.',
  phaseVin:'Checking vehicle', phaseFile:'Preparing file', phaseAI:'Waiting for document analysis', elapsed:'Elapsed', seconds:'s',
  waiting:'Matching has not started.', matching:'Loading catalog candidates…', COMPLETED:'Catalog requests completed', PARTIAL:'Only some requests completed; data remains unchecked', TIMED_OUT:'Catalog timed out; document analysis remains available', CANCELED:'Matching canceled', NOT_APPLICABLE:'No vehicle identified; matching not applicable', NO_PART_ITEMS:'No confirmed part lines to match', UNSUPPORTED_MARKET:'Unsupported market',
  SKIPPED:'Not sent to catalog: not a confirmed part line', NO_PRODUCT_MATCH:'No matching category identified', POSITION_AMBIGUOUS:'Both front and rear are requested; split or clarify this line', CANDIDATES:'Catalog candidates — verification required', AXLE_CANDIDATES:'Candidates match the requested fitting position only', NO_ARTICLES:'No part numbers were returned', NO_POSITION_EVIDENCE:'No matching position evidence in the inspected sample', ERROR:'This item could not be loaded', PENDING:'Not inspected yet',
  examined:'Specifications inspected', of:'of', available:'returned records', matchedTypes:'item categories identified', withCandidates:'items with candidates', noAlerts:'No major findings were extracted. Verify against the original.',
  extractedSum:'Model-extracted sum (not arithmetically audited)', tax:'Extracted tax', labor:'Extracted labor', warranty:'Extracted warranty', contextCurrency:'Request-context currency',
  part:'Part', service:'Service', fee:'Fee', unknown:'Unknown', front:'Front', rear:'Rear', copied:'Copied.', copyFailed:'Copy failed. Select and copy the text manually.',
  sourceLanguage:'Changing the interface language does not re-analyze source text; it remains in the analysis result language.', fallbackMessage:'Please clarify any missing part numbers, manufacturers, labor charges, tax, and warranty before approval.'
 }
};
const $ = id => document.getElementById(id);
const state = { locale:'ar-SA', analysis:null, analysisVehicle:null, vehicle:null, candidates:[], vinStatus:'vinEmpty', vinQuery:'', busy:false, phase:null, catalog:null, error:null, health:null };
const analysisScope = new RunScope(), vinScope = new RunScope();
let vinTask = null, vinTaskValue = '', autoFields = {}, previewURL = '', ticker = null, startedAt = 0;
const tr = key => words[state.locale.startsWith('en') ? 'en' : 'ar'][key] || words.en[key] || key;
const text = (id, value) => { $(id).textContent = String(value ?? ''); };
const node = (tag, value, cls) => { const el = document.createElement(tag); if (value !== undefined) el.textContent = String(value ?? ''); if (cls) el.className = cls; return el; };
function errorKey(error) { return error?.code === 'ANALYSIS_TIMEOUT' ? 'TIMEOUT' : (words.en[error?.code] ? error.code : 'HTTP_ERROR'); }
function showError(key) { state.error = key; text('homeError', tr(key)); $('homeError').hidden = !key; }
function showView(id) {
  for (const name of ['home','loading','result','advanced','msg']) $(name).hidden = name !== id;
  $('loading').setAttribute('aria-busy', String(id === 'loading'));
  const heading = $(id).querySelector('h1'); heading?.setAttribute('tabindex','-1'); heading?.focus({ preventScroll:true });
  window.scrollTo(0,0);
}
function setBusy(busy) {
  state.busy = busy;
  for (const id of ['analyzeBtn','file','vin','vinButton','make','model','year','vehicleCandidate','localeSelect']) $(id).disabled = busy;
}
function stopTicker() { clearInterval(ticker); ticker = null; }
function setPhase(key) { state.phase = key; text('loadingStage',tr(key)); }
function refreshFile() {
  const file = $('file').files[0];
  text('fileText', file ? tr('selected') + ': ' + file.name + ' — ' + (file.size/1024/1024).toFixed(2) + ' MB' : '');
}
function clearVehicle({ clearAuto = false } = {}) {
  vinScope.cancel(); vinTask = null; vinTaskValue = ''; state.vehicle = null; state.candidates = []; state.vinQuery = '';
  if (clearAuto) for (const [id,value] of Object.entries(autoFields)) if ($(id).value === value) $(id).value = '';
  autoFields = {}; state.vinStatus = normalVIN($('vin').value) ? 'manual' : 'vinEmpty'; renderVehicle();
}
function renderVehicle() {
  const v = state.vehicle;
  text('vehicleInfo', v ? tr('vinResolved') + ': ' + [v.manufacturerName,v.modelName,v.year,v.description].filter(Boolean).join(' — ') : tr(state.vinStatus));
  $('candidateBox').hidden = state.candidates.length < 2;
  const select = $('vehicleCandidate'); select.replaceChildren(new Option(tr('select'),''));
  for (const c of state.candidates) select.add(new Option([c.manufacturerName,c.modelName,c.year,c.description,c.vehicleId].filter(Boolean).join(' — '), c.vehicleId));
  if (v) select.value = v.vehicleId;
}
function applyVehicle(candidate, vin) {
  state.vehicle = { ...candidate, vin };
  for (const [field,key] of [['make','manufacturerName'],['model','modelName'],['year','year']]) {
    if (candidate[key]) { $(field).value = candidate[key]; autoFields[field] = $(field).value; }
  }
  state.vinStatus = 'vinResolved'; renderVehicle();
}
function lookupVIN() {
  const vin = normalVIN($('vin').value); $('vin').value = vin;
  if (!vin) { clearVehicle(); return Promise.resolve(null); }
  if (!validVIN(vin)) { clearVehicle(); state.vinStatus = 'INVALID_VIN'; renderVehicle(); return Promise.resolve(null); }
  if (state.vehicle?.vin === vin) return Promise.resolve(state.vehicle);
  if (vinTask && vinTaskValue === vin) return vinTask;
  const token = vinScope.begin(); state.vehicle = null; state.candidates = []; state.vinStatus = 'vinBusy'; state.vinQuery = vin; renderVehicle();
  vinTaskValue = vin;
  vinTask = (async () => {
    try {
      const data = await requestJSON('/api/vin?vin=' + encodeURIComponent(vin), { signal:token.signal, timeoutMs:12000 });
      if (!token.current() || normalVIN($('vin').value) !== vin) return null;
      state.candidates = vehicleCandidates(data);
      if (state.candidates.length === 1) applyVehicle(state.candidates[0], vin);
      else { state.vinStatus = state.candidates.length ? 'vinMultiple' : 'vinMissing'; renderVehicle(); }
      return state.vehicle;
    } catch (error) {
      if (token.current()) { state.vinStatus = 'vinFailed'; renderVehicle(); }
      return null;
    } finally { if (token.current()) { vinTask = null; vinTaskValue = ''; } }
  })();
  return vinTask;
}
function readFile(file, signal) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    const abort = () => { reader.abort(); reject(new DOMException('Aborted','AbortError')); };
    if (signal.aborted) { abort(); return; }
    const cleanup = () => signal.removeEventListener('abort',abort);
    reader.onload = () => { cleanup(); resolve(reader.result); };
    reader.onerror = () => { cleanup(); reject(Object.assign(new Error('Read error'), { code:'INVALID_RESPONSE' })); };
    reader.onabort = () => { cleanup(); reject(new DOMException('Aborted','AbortError')); };
    signal.addEventListener('abort',abort,{ once:true }); reader.readAsDataURL(file);
  });
}
function snapshotVehicle() {
  return { make:$('make').value.trim(), model:$('model').value.trim(), year:$('year').value.trim(), vin:normalVIN($('vin').value), market:'SA', locale:state.locale, currency:'SAR' };
}
async function start() {
  if (state.busy) return;
  showError(null);
  const file = $('file').files[0], validation = validateFile(file), vin = normalVIN($('vin').value);
  if (!navigator.onLine) { showError('offline'); return; }
  if (validation.code) { showError(validation.code); return; }
  if (vin && !validVIN(vin)) { showError('INVALID_VIN'); return; }
  const year = $('year').value.trim();
  if (year && (!/^\d{4}$/.test(year) || Number(year)<1900 || Number(year)>new Date().getFullYear()+1)) { showError('INVALID_YEAR'); return; }
  const token = analysisScope.begin(); state.analysis = null; state.catalog = null; state.analysisVehicle = null;
  setBusy(true); showView('loading'); setPhase('phaseVin'); startedAt = Date.now(); stopTicker();
  text('elapsedTime',tr('elapsed') + ': 0 ' + tr('seconds'));
  ticker = setInterval(() => text('elapsedTime',tr('elapsed') + ': ' + Math.floor((Date.now()-startedAt)/1000) + ' ' + tr('seconds')), 1000);
  try {
    if (vin) await lookupVIN();
    else clearVehicle();
    if (!token.current()) return;
    const vehicle = snapshotVehicle(); // Snapshot AFTER VIN, not a stale year captured beforehand.
    const catalogVehicle = state.vehicle?.vin === vehicle.vin ? { ...state.vehicle } : null;
    setPhase('phaseFile'); const fileData = await readFile(file, token.signal);
    const body = JSON.stringify({ fileData, fileName:file.name, mimeType:validation.mimeType, vehicle });
    if (new TextEncoder().encode(body).length > 4400000) throw Object.assign(new Error('Payload too large'), { code:'FILE_TOO_LARGE' });
    setPhase('phaseAI');
    const result = await requestJSON('/api/analyze', { method:'POST', headers:{ 'Content-Type':'application/json' }, body, signal:token.signal, timeoutMs:75000 });
    if (!token.current()) return;
    if (validateAnalysis(result).length) throw Object.assign(new Error('Invalid analysis contract'), { code:'INVALID_RESPONSE' });
    state.analysis = result; state.analysisVehicle = { details:vehicle, catalog:catalogVehicle };
    state.catalog = { status:catalogVehicle ? 'matching' : 'NOT_APPLICABLE', results:[] };
    stopTicker(); setBusy(false); renderResult(); showView('result');
    const catalog = await matchCatalog({ items:result.items, vehicle:catalogVehicle, context:vehicle, signal:token.signal });
    if (token.current()) { state.catalog = catalog; renderCatalog(); renderDiagnostics(); }
  } catch (error) {
    if (token.current()) { showView('home'); showError(errorKey(error)); }
  } finally { if (token.current()) { stopTicker(); setBusy(false); } }
}
function resetAnalysis() {
  analysisScope.cancel(); stopTicker(); setBusy(false); state.analysis = null; state.analysisVehicle = null; state.catalog = null; showError(null);
  clearVehicle(); for (const id of ['file','vin','make','model','year']) $(id).value = '';
  state.vinStatus = 'vinEmpty'; renderVehicle(); refreshFile();
  if (previewURL) URL.revokeObjectURL(previewURL); previewURL = ''; $('preview').hidden = true; $('preview').removeAttribute('src');
  for (const id of ['catalogMatches','itemsBody','rAlerts','nextActions','message','diagnostics','copyStatus','shareStatus','resultVehicle']) $(id).replaceChildren();
  text('catalogSummary',tr('waiting')); showView('home');
}
function displayed(value) { return value === undefined || value === null || value === '' ? tr('none') : String(value); }
function renderResult() {
  const a = state.analysis; if (!a) return;
  text('rTotal',a.total); text('rStatus',a.status);
  text('rCalculatedTotal',tr('extractedSum') + ': ' + displayed(a.calculatedTotal));
  text('rTaxLabor',tr('tax') + ': ' + displayed(a.tax) + ' | ' + tr('labor') + ': ' + displayed(a.laborTotal));
  text('rWarranty',tr('warranty') + ': ' + displayed(a.warranty));
  for (const [id,key] of [['rTransparency','transparency'],['rIdentity','identityConfidence'],['rCompatibility','compatibilityConfidence'],['rPrice','priceConfidence']]) text(id,displayed(a[key]) + '/100');
  const v = state.analysisVehicle?.catalog;
  text('resultVehicle', v ? tr('vinResolved') + ': ' + [v.manufacturerName,v.modelName,v.year,v.description].filter(Boolean).join(' — ') : tr('manual'));
  const findings = [...a.missing,...a.conflicts]; $('rAlerts').replaceChildren(...(findings.length ? findings : [tr('noAlerts')]).map(x => node('p',x,'item-note')));
  $('itemsBody').replaceChildren(...a.items.map(item => {
    const row = document.createElement('tr');
    for (const value of [item.name,tr(lineType(item)),displayed(item.partNumber),displayed(item.price),displayed(item.manufacturer)]) row.append(node('td',value));
    return row;
  }));
  $('nextActions').replaceChildren(...a.nextActions.map(x => node('p',x,'item-note')));
  text('message',typeof a.workshopMessage === 'string' && a.workshopMessage.trim() ? a.workshopMessage : tr('fallbackMessage'));
  renderCatalog(); renderDiagnostics();
}
function renderCatalog() {
  const report = state.catalog;
  text('catalogSummary',tr(report?.status || 'waiting'));
  const rows = ['NOT_APPLICABLE','NO_PART_ITEMS','UNSUPPORTED_MARKET'].includes(report?.status) ? [] : report?.results || [];
  $('catalogMatches').replaceChildren(...rows.map(row => {
    const box = node('article',undefined,'candidate'); box.append(node('h3',row.workshopItem),node('p',tr(row.status)));
    if (row.productName) box.append(node('p',row.productName,'note'));
    if (row.requestedAxle && row.requestedAxle !== 'ambiguous') box.append(node('p',tr(row.requestedAxle) + ' — ' + tr('examined') + ': ' + row.inspected + ' / ' + row.available,'note'));
    for (const a of row.articles || []) box.append(node('p',tr('partNumber') + ': ' + displayed(a.articleNo || a.articleNumber) + ' | ' + tr('manufacturer') + ': ' + displayed(a.supplierName || a.brandName || a.manufacturerName)));
    return box;
  }));
}
function renderDiagnostics() {
  const a = state.analysis; if (!a) return;
  const c = state.catalog;
  text('diagnostics',JSON.stringify({ requestId:a.requestId || null, engineVersion:a.engineVersion || null, completedAt:a.completedAt || null,
    receivedContractErrors:validateAnalysis(a), context:a.engineContext || state.analysisVehicle?.details && {market:'SA',locale:state.analysisVehicle.details.locale,currency:'SAR'},
    vehicleIdentified:Boolean(state.analysisVehicle?.catalog), catalog:{ status:c?.status, elapsedMs:c?.elapsedMs, partItems:c?.partItems, productTypesMatched:c?.productTypesMatched, itemsWithCandidates:c?.itemsWithCandidates },
    priceSourceLinked:false, note:tr('sourceLanguage') },null,2));
}
function applyLocale(locale) {
  state.locale = locale === 'en-SA' ? 'en-SA' : 'ar-SA'; $('localeSelect').value = state.locale;
  document.documentElement.lang = state.locale.startsWith('en') ? 'en' : 'ar'; document.documentElement.dir = state.locale.startsWith('en') ? 'ltr' : 'rtl';
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = tr(el.dataset.i18n);
  try { localStorage.setItem('waffer-locale',state.locale); } catch { /* Storage denial must not disable the application. */ }
  refreshFile(); renderVehicle(); if (state.analysis) renderResult(); if (state.error) showError(state.error);
  if (state.phase) text('loadingStage',tr(state.phase));
  text('systemStatus',tr(state.health === 'ok' ? 'health' : state.health === 'failed' ? 'healthFailed' : 'pilot'));
}
async function copyText(value,statusId) {
  try { await navigator.clipboard.writeText(value); text(statusId,tr('copied')); }
  catch { text(statusId,tr('copyFailed')); }
}
async function shareSummary() {
  const a = state.analysis; if (!a) return;
  const d = state.analysisVehicle?.details || {};
  const summary = [tr('result'),[d.make,d.model,d.year].filter(Boolean).join(' — '),tr('printedTotal')+': '+a.total,tr('savings'),a.requestId || ''].filter(Boolean).join('\n');
  try { if (navigator.share) await navigator.share({ title:'Waffer', text:summary }); else await copyText(summary,'shareStatus'); }
  catch (e) { if (e.name !== 'AbortError') await copyText(summary,'shareStatus'); }
}
$('file').addEventListener('change',() => {
  analysisScope.cancel(); state.analysis = null; state.catalog = null;
  if (previewURL) URL.revokeObjectURL(previewURL); previewURL = ''; $('preview').hidden = true; $('preview').removeAttribute('src');
  const file = $('file').files[0]; const validation = validateFile(file); showError(file ? validation.code : null);
  if (file && validation.code) $('file').value = '';
  else if (file && validation.mimeType.startsWith('image/')) { previewURL = URL.createObjectURL(file); $('preview').src = previewURL; $('preview').hidden = false; }
  refreshFile();
});
$('vin').addEventListener('input',() => clearVehicle({ clearAuto:true }));
$('vin').addEventListener('blur',() => { if (validVIN($('vin').value)) void lookupVIN(); });
$('vinButton').addEventListener('click',() => { void lookupVIN(); });
$('vehicleCandidate').addEventListener('change',() => {
  const candidate = state.candidates.find(c => c.vehicleId === $('vehicleCandidate').value);
  if (candidate && state.vinQuery === normalVIN($('vin').value)) applyVehicle(candidate,state.vinQuery);
  else {
    state.vehicle = null;
    for (const [id,value] of Object.entries(autoFields)) if ($(id).value === value) $(id).value = '';
    autoFields = {}; state.vinStatus = state.candidates.length > 1 ? 'vinMultiple' : 'vinMissing'; renderVehicle();
  }
});
for (const id of ['make','model','year']) $(id).addEventListener('input',() => clearVehicle());
$('analyzeBtn').addEventListener('click',() => { void start(); });
$('cancelBtn').addEventListener('click',resetAnalysis); $('newAnalysisBtn').addEventListener('click',resetAnalysis);
$('detailsBtn').addEventListener('click',() => showView('advanced')); $('workshopBtn').addEventListener('click',() => showView('msg'));
$('backBtn').addEventListener('click',() => showView('result')); $('resultBackBtn').addEventListener('click',() => showView('result'));
$('shareSummaryBtn').addEventListener('click',() => { void shareSummary(); });
$('copyMessageBtn').addEventListener('click',() => { void copyText($('message').textContent,'copyStatus'); });
$('localeSelect').addEventListener('change',() => applyLocale($('localeSelect').value));
function networkStatus() { $('offlineStatus').hidden = navigator.onLine; }
window.addEventListener('online',networkStatus); window.addEventListener('offline',networkStatus); networkStatus();
let initialLocale = 'ar-SA'; try { initialLocale = localStorage.getItem('waffer-locale') || initialLocale; } catch {}
applyLocale(initialLocale);
requestJSON('/api/vehicles').then(data => {
  const makes = arrayAt(data,'manufacturers');
  $('manufacturers').replaceChildren(...makes.filter(x => typeof x?.manufacturerName === 'string').map(m => new Option(m.manufacturerName,m.manufacturerName)));
  // Do not replace make/model fields: a VIN may have resolved while this list was loading.
}).catch(() => text('makeStatus',tr('makeFailed')));
requestJSON('/api/health',{ timeoutMs:6000 }).then(() => { state.health='ok'; text('systemStatus',tr('health')); }).catch(() => { state.health='failed'; text('systemStatus',tr('healthFailed')); });
let installEvent = null;
window.addEventListener('beforeinstallprompt',event => { event.preventDefault(); installEvent=event; $('installBtn').hidden=false; });
$('installBtn').addEventListener('click',async () => { if (!installEvent) return; try { await installEvent.prompt(); await installEvent.userChoice; } catch {} finally { installEvent=null; $('installBtn').hidden=true; } });
window.addEventListener('appinstalled',() => { installEvent=null; $('installBtn').hidden=true; });
if ('serviceWorker' in navigator) {
  const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (document.readyState === 'complete') void register(); else window.addEventListener('load',register,{once:true});
}
// Compatibility for existing links/debugging; state still belongs to this module.
window.start=start; window.resetAnalysis=resetAnalysis;
