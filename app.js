const ids=['home','loading','result','advanced','msg'];
let analysis=null;
let analysisTimer=null;
let analysisRunId=0;
let activeAnalysisController=null;
let activeCatalogController=null;
let activePricingController=null;
let pricingPromise=null;
let pricingPromiseRunId=0;
let pricingCompletedRunId=0;
window.wafferAnalysisRunId=0;
window.wafferVerifiedMarketPricing=false;
window.wafferPricingResults=[];
window.wafferPricingSummary=null;

function beginAnalysisRun(){
 analysisRunId+=1;
 window.wafferAnalysisRunId=analysisRunId;
 activeAnalysisController?.abort();
 activeCatalogController?.abort();
 activePricingController?.abort();
 activeAnalysisController=new AbortController();
 activeCatalogController=null;
 activePricingController=null;
 pricingPromise=null;
 pricingPromiseRunId=0;
 pricingCompletedRunId=0;
 window.wafferPricingResults=[];
 window.wafferPricingSummary=null;
 return analysisRunId;
}
function invalidateAnalysisRun(){
 analysisRunId+=1;
 window.wafferAnalysisRunId=analysisRunId;
 activeAnalysisController?.abort();
 activeCatalogController?.abort();
 activePricingController?.abort();
 activeAnalysisController=null;
 activeCatalogController=null;
 activePricingController=null;
 pricingPromise=null;
 pricingPromiseRunId=0;
 pricingCompletedRunId=0;
 window.wafferPricingResults=[];
 window.wafferPricingSummary=null;
}
function isCurrentAnalysisRun(runId){return runId===analysisRunId;}
const debugMode=new URLSearchParams(location.search).get('debug')==='1';
function ui(ar,en){return window.wafferLocale?.startsWith('en')?en:ar;}
document.body.classList.toggle('debug-mode',debugMode);
function show(id){
 ids.forEach(x=>{
   const section=document.getElementById(x);
   const active=x===id;
   section.classList.toggle('hidden',!active);
   section.setAttribute('aria-hidden',active?'false':'true');
 });
 document.getElementById('loading').setAttribute('aria-busy',id==='loading'?'true':'false');
 window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 const section=document.getElementById(id);
 const heading=section?.querySelector('h1,h2');
 if(heading){
   heading.setAttribute('tabindex','-1');
   setTimeout(()=>heading.focus({preventScroll:true}),0);
 }
}
function apiErrorMessage(payload, fallbackAr='تعذر التحليل', fallbackEn='Analysis failed'){
 const en=window.wafferLocale?.startsWith('en');
 const code=payload?.code;
 const map={
   UNSUPPORTED_FILE_TYPE:['نوع الملف غير مدعوم.','Unsupported file type.'],
   INVALID_BASE64:['بيانات الملف غير صالحة.','The file data is invalid.'],
   EMPTY_FILE:['الملف فارغ.','The selected file is empty.'],
   FILE_TOO_LARGE:['حجم الملف أكبر من الحد المسموح.','The file is larger than the allowed limit.'],
   UNKNOWN_FILE_SIGNATURE:['تعذر التحقق من نوع الملف.','The file type could not be verified.'],
   MIME_SIGNATURE_MISMATCH:['امتداد/نوع الملف لا يطابق محتواه.','The file type does not match its contents.'],
   ANALYSIS_TIMEOUT:['انتهت مهلة خدمة التحليل. حاول مرة أخرى.','The analysis service timed out. Try again.'],
   ANALYSIS_RATE_LIMITED:['خدمة التحليل مشغولة حاليًا. انتظر قليلًا ثم حاول مرة أخرى.','The analysis service is busy. Wait briefly and try again.'],
   ANALYSIS_CLIENT_RATE_LIMITED:['وصلت إلى حد التحليلات المؤقت. انتظر قليلًا ثم حاول مرة أخرى.','You reached the temporary analysis limit. Wait briefly and try again.'],
   ANALYSIS_CROSS_SITE_BLOCKED:['تم حظر طلب التحليل لأنه لم يصدر من موقع وفّر.','The analysis request was blocked because it did not originate from Waffer.'],
   ANALYSIS_ORIGIN_MISMATCH:['تم حظر طلب التحليل بسبب عدم تطابق مصدر الطلب.','The analysis request was blocked because the request origin did not match.'],
   ANALYSIS_ORIGIN_INVALID:['تم حظر طلب التحليل بسبب مصدر طلب غير صالح.','The analysis request was blocked because the request origin was invalid.'],
   ANALYSIS_UPSTREAM_INVALID:['أعاد مزود التحليل استجابة غير صالحة. حاول مرة أخرى.','The analysis provider returned an invalid response. Try again.'],
   ANALYSIS_UPSTREAM_ERROR:['تعذر الوصول إلى مزود التحليل. حاول مرة أخرى.','The analysis provider failed. Try again.'],
   UNSUPPORTED_MARKET:['السوق المطلوب غير مدعوم حاليًا.','The requested market is not supported yet.']
 };
 const pair=map[code];
 if(pair)return pair[en?1:0];
 const raw=payload?.error||payload?.message;
 if(raw && !en)return raw;
 return en?fallbackEn:(raw||fallbackAr);
}

function fileToDataURL(file){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)})}

function inferMimeType(file){
 const declared=String(file?.type||'').toLowerCase();
 if(declared)return declared;
 const name=String(file?.name||'').toLowerCase();
 if(/\.jpe?g$/.test(name))return 'image/jpeg';
 if(/\.png$/.test(name))return 'image/png';
 if(/\.webp$/.test(name))return 'image/webp';
 if(/\.pdf$/.test(name))return 'application/pdf';
 return '';
}

function uploadLimitMb(){
 return Math.round(((window.WAFFER_RUNTIME?.maxUploadBytes||4*1024*1024)/1024/1024)*10)/10;
}

function dataUrlBytes(dataUrl){
 const base64=String(dataUrl||'').split(',')[1]||'';
 return Math.floor(base64.length*3/4);
}

async function imageFileToCompressedPayload(file){
 const limit=window.WAFFER_RUNTIME?.maxUploadBytes||4*1024*1024;
 const sourceUrl=URL.createObjectURL(file);
 try{
   const image=await new Promise((resolve,reject)=>{
     const img=new Image();
     img.onload=()=>resolve(img);
     img.onerror=()=>reject(new Error(window.wafferLocale?.startsWith('en')?'Could not read the selected image.':'تعذر قراءة الصورة المختارة.'));
     img.src=sourceUrl;
   });

   const sourceWidth=image.naturalWidth||image.width;
   const sourceHeight=image.naturalHeight||image.height;
   const fitted=typeof window.wafferFitImageWithinMaxDimension==='function'
     ? window.wafferFitImageWithinMaxDimension(sourceWidth,sourceHeight)
     : {width:sourceWidth,height:sourceHeight};
   const width=fitted.width;
   const height=fitted.height;

   const canvas=document.createElement('canvas');
   canvas.width=width;
   canvas.height=height;
   const ctx=canvas.getContext('2d',{alpha:false});
   if(!ctx)throw new Error('Canvas unavailable');
   ctx.fillStyle='#fff';
   ctx.fillRect(0,0,width,height);
   ctx.drawImage(image,0,0,width,height);

   const qualities=Array.isArray(window.WAFFER_IMAGE_QUALITY_LADDER)
     ? window.WAFFER_IMAGE_QUALITY_LADDER
     : [0.88,0.78,0.68,0.58,0.48];
   let best=null;
   for(const quality of qualities){
     const dataUrl=canvas.toDataURL('image/jpeg',quality);
     best=dataUrl;
     if(dataUrlBytes(dataUrl)<=limit)break;
   }

   if(!best || dataUrlBytes(best)>limit){
     throw new Error(window.wafferLocale?.startsWith('en')?'The image is still too large after optimization. Try a smaller image.':'ما زال حجم الصورة كبيرًا بعد التحسين. جرّب صورة أصغر.');
   }

   const baseName=(file.name||'estimate').replace(/\.[^.]+$/,'').slice(0,80);
   return {
     fileData:best,
     fileName:baseName+'.jpg',
     mimeType:'image/jpeg',
     optimized:true,
     originalBytes:file.size,
     uploadBytes:dataUrlBytes(best)
   };
 }finally{
   URL.revokeObjectURL(sourceUrl);
 }
}

async function prepareUploadPayload(file){
 const limit=window.WAFFER_RUNTIME?.maxUploadBytes||4*1024*1024;
 const mimeType=inferMimeType(file);
 if(mimeType==='application/pdf'){
   if(file.size>limit){
     throw new Error(window.wafferLocale?.startsWith('en')?'The PDF is larger than '+uploadLimitMb()+' MB. Reduce its size and try again.':'حجم ملف PDF أكبر من '+uploadLimitMb()+'MB. صغّر الملف ثم حاول مجددًا.');
   }
   return {fileData:await fileToDataURL(file),fileName:file.name,mimeType:file.type,optimized:false,originalBytes:file.size,uploadBytes:file.size};
 }

 if(mimeType.startsWith('image/')){
   if(file.size<=limit){
     return {fileData:await fileToDataURL(file),fileName:file.name,mimeType,optimized:false,originalBytes:file.size,uploadBytes:file.size};
   }
   return imageFileToCompressedPayload(file);
 }

 throw new Error(window.wafferLocale?.startsWith('en')?'Unsupported file type.':'نوع الملف غير مدعوم.');
}
async function start(){
 if(!navigator.onLine){alert(window.wafferLocale?.startsWith('en')?'There is no internet connection.':'لا يوجد اتصال بالإنترنت حاليًا.');return;}
 const analyzeBtn=document.getElementById('analyzeBtn');
 if(analyzeBtn.disabled)return;
 const file=document.getElementById('file').files[0];
 const en=window.wafferLocale?.startsWith('en');
 if(!file){alert(en?'Select an image or PDF first.':'اختر صورة أو PDF أولًا');return}
 if(file.type==='application/pdf' && file.size>(window.WAFFER_RUNTIME?.maxUploadBytes||4*1024*1024)){alert(en?'The PDF limit is '+uploadLimitMb()+' MB. Reduce the file size and try again.':'حد PDF الحالي '+uploadLimitMb()+'MB. صغّر الملف ثم حاول مجددًا.');return}

 const vin=String(document.getElementById('vin').value||'').trim().toUpperCase();
 let year=String(document.getElementById('year').value||'').trim();
 if(year && (!/^\d{4}$/.test(year) || Number(year)<1980 || Number(year)>new Date().getFullYear()+1)){
   alert(window.wafferLocale?.startsWith('en')?'Check the model year.':'تحقق من سنة الصنع.');
   return;
 }
 const runId=beginAnalysisRun();
 const analysisController=activeAnalysisController;
 let analysisTimedOut=false;
 let analysisTimeout=null;
 window.wafferPartMatches=null;
 window.wafferCatalogState={status:'NOT_STARTED',runId};
 analyzeBtn.disabled=true;
 analyzeBtn.textContent=window.wafferLocale?.startsWith('en')?'Analyzing...':'جارٍ التحليل...';
 show('loading');
 const startedAt=Date.now();
 clearInterval(analysisTimer);
 analysisTimer=setInterval(()=>{
   const seconds=Math.floor((Date.now()-startedAt)/1000);
   const el=document.getElementById('elapsedTime');
   if(el)el.textContent=(window.wafferLocale?.startsWith('en')?'Elapsed: ':'الوقت المنقضي: ')+seconds+(window.wafferLocale?.startsWith('en')?' s':' ث');
 },1000);
 const loadingStage=document.getElementById('loadingStage');
 const setStage=text=>{if(loadingStage)loadingStage.innerHTML=ui('المرحلة الحالية: ','Current stage: ')+'<strong>'+esc(text)+'</strong>';};
 setStage(ui('قراءة بيانات السيارة والملف','Reading vehicle and file data'));

 try{
   if(vin){
     if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)){
       throw new Error(en?'VIN must contain 17 valid characters.':'رقم الهيكل VIN يجب أن يتكون من 17 خانة صحيحة');
     }
     if(typeof window.ensureWafferVehicle!=='function'){
       throw new Error(en?'VIN verification module did not load.':'وحدة التحقق من VIN لم يتم تحميلها');
     }
     setStage(ui('التحقق من رقم الهيكل VIN','Verifying VIN'));
     const vehicleData=await window.ensureWafferVehicle();
     if(vehicleData?.ambiguous){
       throw new Error(en?'Choose the exact vehicle variant shown under the VIN field, then analyze again.':'اختر فئة السيارة الصحيحة الظاهرة أسفل رقم VIN ثم أعد التحليل.');
     }
     if(!vehicleData || !vehicleData.vehicleId){
       throw new Error(en?'Could not determine Vehicle ID from the VIN.':'تعذر تحديد Vehicle ID من رقم الهيكل');
     }
     year=String(document.getElementById('year').value||'').trim();
     if(year && (!/^\d{4}$/.test(year) || Number(year)<1980 || Number(year)>new Date().getFullYear()+1)){
       throw new Error(en?'Check the model year returned for this VIN.':'تحقق من سنة الصنع التي أعادها رقم VIN.');
     }
   }

   setStage(en?'Preparing the estimate':'تجهيز عرض الصيانة');
   const upload=await prepareUploadPayload(file);
   window.wafferUploadMeta={
     optimized:Boolean(upload.optimized),
     originalBytes:Number(upload.originalBytes)||0,
     uploadBytes:Number(upload.uploadBytes)||0,
     mimeType:upload.mimeType||null
   };
   if(upload.optimized){
     const mb=(upload.uploadBytes/1024/1024).toFixed(2);
     setStage(en?'Image optimized to '+mb+' MB':'تم تحسين الصورة إلى '+mb+' MB');
   }
   setStage(en?'Analyzing line items and prices with AI':'تحليل البنود والأسعار بالذكاء الاصطناعي');
   analysisTimeout=setTimeout(()=>{
     analysisTimedOut=true;
     analysisController.abort();
   },window.WAFFER_RUNTIME?.clientAnalysisTimeoutMs||60000);
   const resp=await fetch('/api/analyze',{
     method:'POST',
     headers:{'Content-Type':'application/json'},
     signal:analysisController.signal,
     body:JSON.stringify({
       fileData:upload.fileData,
       fileName:upload.fileName,
       mimeType:upload.mimeType,
       vehicle:{
         makeId:document.getElementById('make').value,
         make:document.getElementById('make').selectedOptions?.[0]?.text||'',
         model:document.getElementById('model').value,
         year,
         vin,
         vehicleId:window.wafferVehicleId||null,
         market:'SA',
         locale:window.wafferLocale||'ar-SA',
         currency:'SAR'
       }
     })
   });

   if(!isCurrentAnalysisRun(runId))return;
   let d;
   try{d=await resp.json();}catch(parseError){
     if(analysisController.signal.aborted)throw parseError;
     throw new Error(ui('استجابة التحليل غير صالحة. حاول مرة أخرى.','The analysis response is invalid. Try again.'));
   }
   if(!isCurrentAnalysisRun(runId))return;
   if(!resp.ok){
     throw new Error(apiErrorMessage(d));
   }
   if(!d || typeof d!=='object' || !Array.isArray(d.items)){
     throw new Error(en?'The analysis service returned an incomplete result.':'لم تُرجع خدمة التحليل نتيجة مكتملة.');
   }

   clearTimeout(analysisTimeout);
   if(activeAnalysisController===analysisController)activeAnalysisController=null;
   if(!isCurrentAnalysisRun(runId))return;
   analysis=d;
   window.analysis=d;
   setStage(ui('إعداد النتيجة','Preparing the result'));
   render();
   show('result');
   void refreshVerifiedPricing(runId);

   const catalogSummary=document.getElementById('catalogSummary');
   if(window.wafferVehicleId && typeof window.matchWafferParts==='function'){
     if(catalogSummary)catalogSummary.textContent=ui('🔎 جارٍ مطابقة البنود مع كتالوج السيارة...','🔎 Matching line items against the vehicle catalog...');
     const catalogController=new AbortController();
     activeCatalogController=catalogController;
     let catalogTimedOut=false;
     const catalogTimeout=setTimeout(()=>{
       catalogTimedOut=true;
       catalogController.abort();
     },window.WAFFER_RUNTIME?.catalogMatchTimeoutMs||30000);
     window.wafferCatalogState={status:'RUNNING',runId};
     try{
       const matches=await window.matchWafferParts(
         analysis,
         {signal:catalogController.signal,runId}
       );
       if(!isCurrentAnalysisRun(runId))return;
       if(catalogSummary && catalogTimedOut){
         catalogSummary.textContent=ui('⚠️ استغرقت مطابقة الكتالوج وقتًا أطول من المتوقع. نتيجة تحليل العرض متاحة.','⚠️ Catalog matching took longer than expected. The estimate analysis is still available.');
       }else if(catalogSummary && Array.isArray(matches) && !matches.length){
         catalogSummary.textContent=ui('⚠️ اكتمل فحص الكتالوج ولم تظهر مطابقة مناسبة.','⚠️ Catalog checking finished with no suitable match.');
       }
     }catch(matchError){
       if(!isCurrentAnalysisRun(runId))return;
       console.error('Parts matching error:',matchError);
       if(catalogSummary){
         const securityBlocked=[
           'CATALOG_CROSS_SITE_BLOCKED',
           'CATALOG_ORIGIN_MISMATCH',
           'CATALOG_ORIGIN_INVALID'
         ].includes(matchError?.code);
         catalogSummary.textContent=matchError?.code==='CATALOG_CLIENT_RATE_LIMITED'
           ? ui('⚠️ وصل فحص الكتالوج إلى حد الاستخدام المؤقت. نتيجة تحليل العرض متاحة، وحاول المطابقة لاحقًا.','⚠️ Catalog matching reached the temporary usage limit. The estimate analysis is still available; retry matching later.')
           : securityBlocked
             ? ui('⚠️ تم حظر طلب مطابقة الكتالوج بسبب سياسة أمان الطلب. نتيجة تحليل العرض ما زالت متاحة.','⚠️ Catalog matching was blocked by the request security policy. The estimate analysis is still available.')
             : catalogTimedOut||matchError?.name==='AbortError'||matchError?.code==='CATALOG_TIMEOUT'
               ? ui('⚠️ استغرقت مطابقة الكتالوج وقتًا أطول من المتوقع. نتيجة تحليل العرض متاحة.','⚠️ Catalog matching took longer than expected. The estimate analysis is still available.')
               : ui('⚠️ تعذر إكمال مطابقة الكتالوج. نتيجة تحليل العرض متاحة.','⚠️ Catalog matching could not be completed. The estimate analysis is still available.');
       }
     }finally{
       clearTimeout(catalogTimeout);
       if(activeCatalogController===catalogController)activeCatalogController=null;
     }
   }else if(catalogSummary && isCurrentAnalysisRun(runId)){
     catalogSummary.textContent=vin
       ? ui('⚠️ تعذر تحديد السيارة للكتالوج.','⚠️ The vehicle could not be identified for catalog matching.')
       : ui('ℹ️ أدخل VIN لتفعيل مطابقة القطع مع السيارة.','ℹ️ Enter a VIN to enable vehicle-specific parts matching.');
   }
 }catch(e){
   if(!isCurrentAnalysisRun(runId))return;
   show('home');
   const message=analysisTimedOut||e?.name==='AbortError'
     ? (window.wafferLocale?.startsWith('en')?'Analysis timed out. Try again.':'انتهت مهلة التحليل. حاول مرة أخرى.')
     : ((window.wafferLocale?.startsWith('en')?'Analysis failed: ':'تعذر التحليل: ')+(e.message||e));
   alert(message);
 }finally{
   clearTimeout(analysisTimeout);
   if(activeAnalysisController===analysisController)activeAnalysisController=null;
   if(isCurrentAnalysisRun(runId)){
     clearInterval(analysisTimer);
     analysisTimer=null;
     analyzeBtn.disabled=false;
     analyzeBtn.textContent=window.wafferLocale?.startsWith('en')?'Analyze my estimate':'حلّل عرضي مجانًا ✨';
   }
 }
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function render(){
 const engineMeta=document.getElementById('rEngineMeta');
 if(engineMeta){
   const when=analysis.completedAt?new Date(analysis.completedAt):null;
   const time=when&&!Number.isNaN(when.getTime())?when.toLocaleString(window.wafferLocale||'ar-SA'):'';
   engineMeta.textContent=(analysis.engineVersion||time)
     ? ((window.wafferLocale?.startsWith('en')?'Engine: ':'المحرك: ')+(analysis.engineVersion||'—')+(time?' • '+time:''))
     : '';
 }
 const requestId=document.getElementById('rRequestId');
 if(requestId){
   requestId.textContent=analysis.requestId?((window.wafferLocale?.startsWith('en')?'Analysis ID: ':'معرف التحليل: ')+analysis.requestId):'';
 }
 const testMeta=document.getElementById('rTestMeta');
 if(testMeta){
   const itemCount=Array.isArray(analysis.items)?analysis.items.length:0;
   const ctx=analysis.engineContext||{};
   testMeta.textContent=(window.wafferLocale?.startsWith('en')?'Test context: ':'سياق الاختبار: ')+(ctx.market||'SA')+' • '+(ctx.locale||window.wafferLocale||'ar-SA')+' • '+(ctx.currency||'SAR')+' • '+itemCount+(window.wafferLocale?.startsWith('en')?' line items':' بنود');
 }
 const warningsSummary=document.getElementById('rWarningsSummary');
 if(warningsSummary){
   const missing=Array.isArray(analysis.missing)?analysis.missing.length:0;
   const conflicts=Array.isArray(analysis.conflicts)?analysis.conflicts.length:0;
   const total=missing+conflicts;
   warningsSummary.textContent=total
     ? ui('⚠️ نقاط تحتاج انتباهًا قبل الموافقة: '+total+' ('+missing+' بيانات ناقصة، '+conflicts+' نقاط تحقق).','⚠️ Items need attention before approval: '+total+' ('+missing+' missing data, '+conflicts+' verification points).')
     : ui('✓ لم يستخرج النظام نقاط نقص أو تعارض رئيسية من المستند.','✓ No major missing-data or conflict findings were extracted.');
 }
 const manualTestPrompt=document.getElementById('rManualTestPrompt');
 if(manualTestPrompt){
   const a=analysis.acceptance||{};
   const ready=Boolean(a.hasItems&&a.hasPrintedTotal&&a.hasConfidence&&analysis.engineVersion===(window.WAFFER_RUNTIME?.engineVersion||'mvp-2026-09'));
   const en=window.wafferLocale?.startsWith('en');
   manualTestPrompt.textContent=ready
     ? (en?'Next field test: verify the extracted line items against the uploaded estimate, then check VIN/catalog evidence if a VIN was supplied.':'خطوة الاختبار التالية: قارن البنود المستخرجة يدويًا مع عرض الصيانة المرفوع، ثم تحقق من أدلة VIN/الكتالوج إذا تم إدخال VIN.')
     : (en?'Manual scenario testing should wait until the failed core checks above are resolved.':'أجّل اختبار السيناريو اليدوي حتى تُحل الفحوص الأساسية غير المجتازة أعلاه.');
 }
 const overallGate=document.getElementById('rOverallGate');
 if(overallGate){
   const a=analysis.acceptance||{};
   const coreOk=Boolean(a.schemaValid!==false&&a.hasItems&&a.hasPrintedTotal&&a.hasConfidence);
   const versionOk=analysis.engineVersion==='mvp-2026-09';
   const contextOk=Boolean(analysis?.engineContext?.market&&analysis?.engineContext?.currency&&analysis?.engineContext?.locale);
   const checks=[coreOk,versionOk,contextOk];
   const passed=checks.filter(Boolean).length;
   const en=window.wafferLocale?.startsWith('en');
   overallGate.textContent=(en?'Core field-test gate: ':'بوابة الاختبار الأساسية: ')+passed+'/'+checks.length+
     (passed===checks.length?(en?' ✓ ready for manual scenario testing':' ✓ جاهز لاختبار السيناريو اليدوي'):(en?' — review failed checks':' — راجع الفحوص غير المجتازة'));
 }
 const versionIntegrity=document.getElementById('rVersionIntegrity');
 if(versionIntegrity){
   const expected=window.WAFFER_RUNTIME?.engineVersion||'mvp-2026-09';
   const actual=analysis.engineVersion||'';
   const ok=actual===expected;
   const en=window.wafferLocale?.startsWith('en');
   versionIntegrity.textContent=(en?'Engine version: ':'نسخة المحرك: ')+(ok?'✓ ':'⚠ ')+(actual||'—')+(ok?'':(en?' — expected '+expected:' — المتوقع '+expected));
 }
 if(analysis.acceptance?.schemaValid===false){
   const fields=(analysis.acceptance.missingShapeFields||[]).join(', ');
   const invalid=(analysis.acceptance.invalidItemIndexes||[]);
   const en=window.wafferLocale?.startsWith('en');
   const box=document.getElementById('rDataIntegrity');
   if(box){
     const parts=[];
     if(fields)parts.push((en?'missing fields: ':'حقول ناقصة: ')+fields);
     if(invalid.length)parts.push((en?'invalid line items: ':'بنود غير صالحة: ')+invalid.map(i=>i+1).join(', '));
     box.textContent=(en?'Result contract is incomplete — ':'عقد نتيجة التحليل غير مكتمل — ')+parts.join(' • ');
   }
 }
 const dataIntegrity=document.getElementById('rDataIntegrity');
 if(dataIntegrity){
   const a=analysis.acceptance||{};
   const itemCount=Array.isArray(analysis.items)?analysis.items.length:0;
   const consistentCount=a.itemCount==null||Number(a.itemCount)===itemCount;
   const contextOk=Boolean(analysis?.engineContext?.market&&analysis?.engineContext?.currency&&analysis?.engineContext?.locale);
   const traceOk=Boolean(analysis.requestId&&analysis.engineVersion&&analysis.completedAt);
   const checks=[consistentCount,contextOk,traceOk];
   const passed=checks.filter(Boolean).length;
   const en=window.wafferLocale?.startsWith('en');
   dataIntegrity.textContent=(en?'Result integrity: ':'سلامة بيانات النتيجة: ')+passed+'/'+checks.length+
     ' • '+(consistentCount?'✓':'✗')+' '+(en?'item count':'عدد البنود')+
     ' • '+(contextOk?'✓':'✗')+' '+(en?'context':'السياق')+
     ' • '+(traceOk?'✓':'✗')+' '+(en?'traceability':'التتبع');
 }
 const releaseReadiness=document.getElementById('rReleaseReadiness');
 if(releaseReadiness){
   const items=Array.isArray(analysis.items)?analysis.items:[];
   const acceptance=analysis.acceptance||{};
   const hasItems=acceptance.hasItems??(items.length>0);
   const hasTotal=acceptance.hasPrintedTotal??Boolean(String(analysis.total||'').trim());
   const confidence=Number(analysis.overallConfidence)||0;
   const hasConfidence=acceptance.hasConfidence??(confidence>0);
   const critical=[hasItems,hasTotal,hasConfidence];
   const passed=critical.filter(Boolean).length;
   const en=window.wafferLocale?.startsWith('en');
   releaseReadiness.textContent=(en?'Core analysis readiness: ':'جاهزية التحليل الأساسي: ')+passed+'/'+critical.length+
     ' • '+(hasItems?'✓':'✗')+' '+(en?'items':'البنود')+
     ' • '+(hasTotal?'✓':'✗')+' '+(en?'total':'الإجمالي')+
     ' • '+(hasConfidence?'✓':'✗')+' '+(en?'confidence':'الثقة');
 }
 const mvpGate=document.getElementById('rMvpGate');
 if(mvpGate){
   const items=Array.isArray(analysis.items)?analysis.items:[];
   const hasItems=items.length>0;
   const overall=Number(analysis.overallConfidence)||0;
   const docNamed=items.filter(i=>String(i.name||'').trim()).length;
   const extractionOk=hasItems && docNamed/items.length>=0.7;
   const en=window.wafferLocale?.startsWith('en');
   const checks=[
     [hasItems,en?'line items extracted':'تم استخراج بنود'],
     [extractionOk,en?'document extraction usable':'استخراج المستند قابل للاستخدام'],
     [overall>0,en?'confidence calculated':'تم حساب الثقة']
   ];
   const passed=checks.filter(x=>x[0]).length;
   mvpGate.textContent=(en?'MVP analysis checks: ':'فحوصات تحليل MVP: ')+passed+'/'+checks.length+' • '+checks.map(x=>(x[0]?'✓ ':'✗ ')+x[1]).join(' • ');
 }
 const verificationSummary=document.getElementById('rVerificationSummary');
 if(verificationSummary){
   const hasVin=Boolean(window.wafferVehicle?.vehicleId);
   const items=Array.isArray(analysis.items)?analysis.items:[];
   const partItems=items.filter(i=>(i.itemType||'part')==='part');
   const withPartNo=partItems.filter(i=>typeof window.wafferHasUsablePartNumber==='function'&&window.wafferHasUsablePartNumber(i.partNumber)).length;
   const en=window.wafferLocale?.startsWith('en');
   verificationSummary.textContent=en
     ? 'Verification snapshot: '+(hasVin?'vehicle identified by VIN':'vehicle not verified by VIN')+' • '+withPartNo+'/'+partItems.length+' part lines include a visible part number.'
     : 'ملخص التحقق: '+(hasVin?'تم تحديد السيارة عبر VIN':'لم يتم توثيق السيارة عبر VIN')+' • '+withPartNo+' من '+partItems.length+' بنود قطع يظهر لها رقم قطعة.';
 }
 const docQuality=document.getElementById('rDocQuality');
 if(docQuality){
   const items=Array.isArray(analysis.items)?analysis.items:[];
   const named=items.filter(i=>String(i.name||'').trim()).length;
   const priced=items.filter(i=>String(i.price||'').trim()).length;
   const ratio=items.length?Math.round(((named+priced)/(items.length*2))*100):0;
   const quality=ratio>=80?ui('جيدة','good'):ratio>=50?ui('متوسطة','moderate'):ui('محدودة','limited');
   docQuality.textContent=ui('📄 جودة الاستخراج من المستند: ','📄 Document extraction quality: ')+quality+' ('+ratio+'%)'+ui(' — تعتمد على وضوح الصورة/الملف والبيانات المطبوعة.',' — depends on document clarity and printed data.');
 }
 const evidence=document.getElementById('rVehicleEvidence');
 const evidenceLevel=document.getElementById('rEvidenceLevel');
 if(evidenceLevel){
   const hasVin=Boolean(window.wafferVehicle?.vehicleId);
   const items=Array.isArray(analysis.items)?analysis.items:[];
   const withPartNumbers=items.filter(i=>typeof window.wafferHasUsablePartNumber==='function'&&window.wafferHasUsablePartNumber(i.partNumber)).length;
   let label=ui('محدودة','limited');
   if(hasVin && withPartNumbers>0)label=ui('متوسطة','moderate');
   if(hasVin && items.length>0 && withPartNumbers===items.length)label=ui('مرتفعة مبدئيًا','provisionally high');
   evidenceLevel.textContent=ui('🧾 مستوى الأدلة المتاحة: ','🧾 Available evidence level: ')+label+' — '+(hasVin?ui('هوية السيارة موثقة. ','Vehicle identity verified. '):ui('هوية السيارة غير موثقة عبر VIN. ','Vehicle identity is not verified by VIN. '))+(withPartNumbers?ui('أرقام قطع ظاهرة: '+withPartNumbers+' من '+items.length+'.','Visible part numbers: '+withPartNumbers+' of '+items.length+'.'):ui('لا تظهر أرقام قطع قابلة للتحقق في العرض.','No verifiable part numbers are visible in the estimate.'));
 }
 if(evidence){
   const v=window.wafferVehicle;
   evidence.textContent=v?.vehicleId
     ? ui('🚗 تم التحقق من هوية السيارة عبر VIN: ','🚗 Vehicle identity verified by VIN: ')+[v.manufacturerName,v.modelName,v.vehicleDescription].filter(Boolean).join(' — ')
     : ui('🚗 لم يتم التحقق من هوية السيارة عبر VIN؛ نتائج التوافق ستكون محدودة.','🚗 Vehicle identity was not verified by VIN; compatibility results will be limited.');
 }
 document.getElementById('rTotal').textContent=analysis.total||ui('غير واضح','unclear');
 const currencyContext=document.getElementById('currencyContext');
 if(currencyContext){
   currencyContext.textContent=(window.wafferLocale?.startsWith('en')?'Currency: ':'العملة: ')+(analysis?.engineContext?.currency||'SAR');
 }
 const calc=document.getElementById('rCalculatedTotal');
 if(calc){
   const calculated=analysis.calculatedTotal;
   calc.textContent=calculated && calculated!=='غير محسوب'
     ? ui('مجموع البنود المحسوب من القيم الظاهرة: ','Calculated sum of visible line items: ')+calculated
     : '';
 }
 const taxLabor=document.getElementById('rTaxLabor');
 if(taxLabor){
   const tax=analysis.tax||ui('غير مذكورة','not stated');
   const labor=analysis.laborTotal||ui('غير مذكور','not stated');
   taxLabor.textContent=ui('الضريبة: ','Tax: ')+tax+' | '+ui('أجور العمل: ','Labor: ')+labor;
 }
 const warranty=document.getElementById('rWarranty');
 if(warranty){
   warranty.textContent=ui('الضمان: ','Warranty: ')+(analysis.warranty||ui('غير مذكور','not stated'));
 }
 const totalCheck=document.getElementById('rTotalCheck');
 if(totalCheck){
   const comparison=typeof window.wafferCompareDisplayedTotals==='function'
     ? window.wafferCompareDisplayedTotals(analysis.total,analysis.calculatedTotal)
     : {comparable:false,matches:false,difference:null};
   if(comparison.comparable){
     totalCheck.textContent=comparison.matches
       ? ui('🧮 الإجمالي المطبوع يطابق مجموع البنود الظاهرة.','🧮 The printed total matches the sum of visible line items.')
       : ui('🧮 يوجد فرق حسابي قدره '+comparison.difference.toFixed(2)+' بين الإجمالي المطبوع ومجموع البنود الظاهرة؛ يحتاج مراجعة.','🧮 There is a '+comparison.difference.toFixed(2)+' difference between the printed total and the visible line-item sum; review is needed.');
   }else{
     totalCheck.textContent=ui('🧮 تعذر التحقق حسابيًا من الإجمالي بسبب نقص أو غموض القيم الظاهرة.','🧮 The total could not be verified mathematically because visible values are missing or unclear.');
   }
 }
 document.getElementById('rStatus').textContent='⚠️ '+(analysis.status||ui('يحتاج مراجعة','needs review')); document.getElementById('rTransparency').textContent=(analysis.transparency??'—')+'/100'; document.getElementById('rIdentity').textContent=(analysis.identityConfidence??'—')+'/100'; document.getElementById('rCompatibility').textContent=(analysis.compatibilityConfidence??'—')+'/100'; document.getElementById('rPrice').textContent=(analysis.priceConfidence??'—')+'/100'; document.getElementById('rOverall').textContent=(analysis.overallConfidence??'—')+'/100';
 const breakdown=document.getElementById('confidenceBreakdown');
 if(breakdown){
   breakdown.textContent=ui('الشفافية ','Transparency ')+(analysis.transparency??0)+'/100 • '+ui('هوية القطع ','Part identity ')+(analysis.identityConfidence??0)+'/100 • '+ui('التوافق ','Compatibility ')+(analysis.compatibilityConfidence??0)+'/100 • '+ui('قابلية مقارنة السعر ','Price comparability ')+(analysis.priceConfidence??0)+'/100';
 }
 const alerts=[...(analysis.missing||[]).map(x=>'📋 '+x),...(analysis.conflicts||[]).map(x=>'⚙️ '+x)];
 const noAlerts=window.wafferLocale?.startsWith('en')?'No major issues were extracted.':'لم تظهر ملاحظات رئيسية.';
 document.getElementById('rAlerts').innerHTML=(alerts.length?alerts:[noAlerts]).map(x=>'<div class="alert">'+esc(x)+'</div>').join('');
 const allItems=Array.isArray(analysis.items)?analysis.items:[];
 const typeSummary=document.getElementById('itemTypeSummary');
 if(typeSummary){
   const parts=allItems.filter(i=>(i.itemType||'part')==='part').length;
   const labor=allItems.filter(i=>i.itemType==='labor').length;
   const service=allItems.filter(i=>i.itemType==='service').length;
   const fee=allItems.filter(i=>i.itemType==='fee').length;
   typeSummary.textContent=ui('التصنيف: قطع '+parts+' • عمل '+labor+' • خدمات '+service+' • رسوم '+fee,'Classification: parts '+parts+' • labor '+labor+' • services '+service+' • fees '+fee);
 }
 document.getElementById('itemsBody').innerHTML=allItems.map(i=>{
 const typeLabels=window.wafferLocale?.startsWith('en')
   ? {part:'Part',labor:'Labor',service:'Service',fee:'Fee'}
   : {part:'قطعة',labor:'أجرة عمل',service:'خدمة',fee:'رسوم'};
 const label=typeLabels[i.itemType]||ui('قطعة','Part');
 return `<tr><td>${esc(i.name)}</td><td>${esc(label)}</td><td>${esc(i.partNumber||ui('غير ظاهر','not visible'))}</td><td>${esc(i.price)}</td><td>${esc(i.identityConfidence)}%</td><td>${esc(i.compatibility)}</td><td>${esc(i.priceAssessment)}</td><td>${esc(i.conflict)}</td></tr>`;
}).join('')||'<tr><td colspan="8">'+esc(ui('لم تُستخرج بنود واضحة.','No clear line items were extracted.'))+'</td></tr>'; document.getElementById('nextActions').innerHTML=(analysis.nextActions||[]).map((x,n)=>'<div class="alert">'+(n+1)+'. '+esc(x)+'</div>').join('')||'<div class="note">'+esc(ui('لا توجد خطوات إضافية مستخرجة.','No additional actions were extracted.'))+'</div>'; 
 const priceBox=document.querySelector('#advanced .price');
 if(priceBox){
   priceBox.textContent=ui('التوفير المؤكد: غير محسوب','Confirmed savings: not calculated');
 }
 const decision=document.getElementById('decisionSummary');
 if(decision){
   const missingCount=Array.isArray(analysis.missing)?analysis.missing.length:0;
   const conflictCount=Array.isArray(analysis.conflicts)?analysis.conflicts.length:0;
   const verifiedVehicle=Boolean(window.wafferVehicle?.vehicleId);
   decision.textContent=ui('ملخص قبل الموافقة: ','Before approval: ')+(verifiedVehicle?ui('هوية السيارة موثقة. ','Vehicle identity verified. '):ui('تحقق من هوية السيارة. ','Verify the vehicle identity. '))+(missingCount?ui('بيانات ناقصة: '+missingCount+'. ','Missing data: '+missingCount+'. '):'')+(conflictCount?ui('نقاط تحتاج تحقق: '+conflictCount+'. ','Verification points: '+conflictCount+'. '):'')+ui('لا تعتمد أي توفير مالي قبل ظهور مصدر سعر موثوق.','Do not rely on any savings figure until a trusted price source is available.');
 }
 const generatedMessage=analysis.workshopMessage||ui('السلام عليكم، أرجو تزويدي بتفاصيل القطع وأرقامها والشركة المصنعة والكمية وأجرة العمل والضريبة والضمان قبل اعتماد العرض. وشكرًا.','Hello, please provide the important missing part details, part numbers, manufacturer, quantity, labor, tax, and warranty before I approve the estimate. Thank you.');
 const vehicleLabel=formatVehicleForMessage();
 document.getElementById('message').textContent=(vehicleLabel?ui('السيارة: ','Vehicle: ')+vehicleLabel+'\n\n':'')+generatedMessage;
}
function advanced(){show('advanced')}
function messageWorkshop(){show('msg')}
function formatVehicleForMessage(){
 const v=window.wafferVehicle;
 if(v?.vehicleId){
   return [v.manufacturerName,v.modelName,v.vehicleDescription].filter(Boolean).join(' — ');
 }
 return [document.getElementById('make')?.selectedOptions?.[0]?.text,document.getElementById('model')?.value,document.getElementById('year')?.value].filter(Boolean).join(' — ');
}
function currentPricingVehicle(){
 const v=window.wafferVehicle||{};
 return {
   vehicleId:v.vehicleId||window.wafferVehicleId||null,
   make:v.manufacturerName||document.getElementById('make')?.selectedOptions?.[0]?.text||null,
   model:v.modelName||document.getElementById('model')?.value||null,
   year:v.year||document.getElementById('year')?.value||null,
   vin:v.vin||document.getElementById('vin')?.value||null
 };
}

function renderPricingSummary(){
 const label=document.getElementById('confirmedSavingLabel');
 const note=document.getElementById('savingNote');
 const readiness=document.getElementById('priceReadiness');
 if(!label||!note||!readiness)return;

 const summary=window.wafferPricingSummary;
 if(!window.wafferVerifiedMarketPricing){
   label.textContent=ui('التوفير المؤكد: غير محسوب','Confirmed savings: not calculated');
   note.textContent=ui('لا يحسب «وفّر» التوفير قبل مطابقة هوية القطعة بمصدر سعر موثوق.','Waffer does not calculate savings until part identity is matched to a trusted price source.');
   readiness.textContent=ui('💰 مقارنة الأسعار: بانتظار مصدر سعر موثوق ومفعّل.','💰 Price comparison is waiting for an enabled trusted price source.');
   return;
 }

 if(!summary){
   label.textContent=ui('التوفير المؤكد: غير محسوب','Confirmed savings: not calculated');
   note.textContent=ui('مصدر السعر الموثوق متصل؛ سيتم فحص البنود المؤهلة فقط.','A trusted price source is connected; only eligible items will be checked.');
   readiness.textContent=ui('💰 بانتظار بنود تحمل رقم قطعة صالح وهوية سيارة قابلة للتحقق.','💰 Waiting for items with a usable part number and verifiable vehicle identity.');
   return;
 }

 const money=Number(summary.verifiedSaving||0).toFixed(2)+' '+summary.currency;
 if(summary.verifiedOfferCount>0){
   label.textContent=ui('التوفير المؤكد من عروض موثقة: ','Confirmed savings from verified offers: ')+money;
   note.textContent=ui('يُحسب هذا الرقم فقط من عروض شراء موثقة ومتاحة ومطابقة للقطعة والسيارة.','This amount is calculated only from verified, in-stock offers matched to the part and vehicle.');
 }else{
   label.textContent=ui('التوفير المؤكد: غير محسوب','Confirmed savings: not calculated');
   note.textContent=ui('قد تتوفر بيانات نطاق سوق، لكن لا يُحسب التوفير دون عرض شراء موثّق.','Market-range data may be available, but savings require a verified purchase offer.');
 }
 readiness.textContent=ui(
   '💰 فُحصت '+summary.checkedItems+' بنود؛ عروض موثقة: '+summary.verifiedOfferCount+'، نطاقات سوق: '+summary.marketRangeCount+'.',
   '💰 Checked '+summary.checkedItems+' items; verified offers: '+summary.verifiedOfferCount+', market ranges: '+summary.marketRangeCount+'.'
 );
}
window.wafferRenderPricingSummary=renderPricingSummary;

async function refreshVerifiedPricing(runId=analysisRunId){
 if(!isCurrentAnalysisRun(runId)||!analysis)return;
 if(!window.wafferVerifiedMarketPricing){
   renderPricingSummary();
   return;
 }
 if(pricingCompletedRunId===runId)return;
 if(pricingPromise && pricingPromiseRunId===runId)return pricingPromise;
 if(typeof window.wafferSelectPriceableItems!=='function' ||
    typeof window.wafferBuildPriceComparePayload!=='function' ||
    typeof window.wafferSummarizeVerifiedPricing!=='function'){
   return;
 }

 const vehicle=currentPricingVehicle();
 const selected=window.wafferSelectPriceableItems(analysis,vehicle,{maxItems:10});
 if(!selected.length){
   window.wafferPricingResults=[];
   window.wafferPricingSummary=window.wafferSummarizeVerifiedPricing([],analysis?.engineContext?.currency||'SAR');
   pricingCompletedRunId=runId;
   renderPricingSummary();
   return;
 }

 activePricingController?.abort();
 const controller=new AbortController();
 activePricingController=controller;
 pricingPromiseRunId=runId;
 const readiness=document.getElementById('priceReadiness');
 if(readiness)readiness.textContent=ui('💰 جارٍ التحقق من الأسعار الموثقة للبنود المؤهلة...','💰 Checking trusted pricing for eligible items...');

 pricingPromise=(async()=>{
   const entries=[];
   const context=analysis?.engineContext||{};
   for(let offset=0;offset<selected.length;offset+=2){
     if(!isCurrentAnalysisRun(runId)||controller.signal.aborted)return;
     const batch=selected.slice(offset,offset+2);
     const batchResults=await Promise.all(batch.map(async({item,index})=>{
       const payload=window.wafferBuildPriceComparePayload({
         item,
         vehicle,
         market:context.market||'SA',
         locale:context.locale||window.wafferLocale||'ar-SA',
         currency:context.currency||'SAR'
       });
       if(!payload)return null;
       try{
         const response=await fetch('/api/price-compare',{
           method:'POST',
           headers:{'Content-Type':'application/json'},
           body:JSON.stringify(payload),
           signal:controller.signal
         });
         let data=null;
         try{data=await response.json();}catch(e){}
         return {index,ok:response.ok,data};
       }catch(error){
         if(controller.signal.aborted)throw error;
         return {index,ok:false,data:null};
       }
     }));
     entries.push(...batchResults.filter(Boolean));
   }

   if(!isCurrentAnalysisRun(runId)||controller.signal.aborted)return;
   window.wafferPricingResults=entries;
   window.wafferPricingSummary=window.wafferSummarizeVerifiedPricing(
     entries,
     analysis?.engineContext?.currency||'SAR'
   );
   pricingCompletedRunId=runId;
   renderPricingSummary();
 })().catch(error=>{
   if(!controller.signal.aborted){
     console.error('Verified pricing error:',error);
     const readiness=document.getElementById('priceReadiness');
     if(readiness)readiness.textContent=ui('⚠️ تعذر إكمال التحقق من الأسعار حاليًا.','⚠️ Trusted pricing could not be completed right now.');
   }
 }).finally(()=>{
   if(activePricingController===controller)activePricingController=null;
   if(pricingPromiseRunId===runId){
     pricingPromise=null;
     pricingPromiseRunId=0;
   }
 });
 return pricingPromise;
}

function resetAnalysis(){
 invalidateAnalysisRun();
 clearInterval(analysisTimer);
 analysisTimer=null;
 analysis=null;
 window.analysis=null;
 window.wafferPartMatches=null;
 window.wafferCatalogState=null;
 window.wafferUploadMeta=null;
 window.wafferVehicle=null;
 window.wafferVehicleId='';
 window.wafferModelId='';
 window.wafferManufacturerId='';
 window.wafferPricingResults=[];
 window.wafferPricingSummary=null;
 pricingCompletedRunId=0;
 pricingPromise=null;
 pricingPromiseRunId=0;
 activePricingController?.abort();
 activePricingController=null;
 renderPricingSummary();

 const analyzeBtn=document.getElementById('analyzeBtn');
 if(analyzeBtn){
   analyzeBtn.disabled=false;
   analyzeBtn.textContent=window.wafferLocale?.startsWith('en')?'Analyze my estimate':'حلّل عرضي مجانًا ✨';
 }

 const file=document.getElementById('file');
 if(file)file.value='';

 const fileText=document.getElementById('fileText');
 if(fileText)fileText.textContent=window.wafferLocale?.startsWith('en')
   ? 'Upload an estimate image or PDF'
   : 'ارفع صورة العرض أو ملف PDF';

 const elapsed=document.getElementById('elapsedTime');
 if(elapsed)elapsed.textContent=window.wafferLocale?.startsWith('en')?'Elapsed: 0 s':'الوقت المنقضي: 0 ث';

 const vehicleInfo=document.getElementById('vehicleInfo');
 if(vehicleInfo){vehicleInfo.textContent='';vehicleInfo.classList.add('hidden');}

 const vehicleCandidates=document.getElementById('vehicleCandidates');
 if(vehicleCandidates)vehicleCandidates.classList.add('hidden');
 const candidateSelect=document.getElementById('candidateSelect');
 if(candidateSelect)candidateSelect.replaceChildren(new Option(window.wafferLocale?.startsWith('en')?'Choose the matching vehicle variant':'اختر فئة السيارة المطابقة',''));

 const catalogSummary=document.getElementById('catalogSummary');
 if(catalogSummary)catalogSummary.textContent=ui('🔎 حالة مطابقة الكتالوج: بانتظار التحليل.','🔎 Catalog matching status: waiting for analysis.');

 const coverage=document.getElementById('rCatalogCoverage');
 if(coverage)coverage.textContent=ui('🔎 تغطية التحقق من الكتالوج: بانتظار المطابقة.','🔎 Catalog verification coverage: waiting for matching.');

 const catalogGate=document.getElementById('rCatalogGate');
 if(catalogGate)catalogGate.textContent=ui('🔎 فحص الكتالوج: بانتظار المطابقة.','🔎 Catalog check: waiting for matching.');

 const axleGate=document.getElementById('rAxleGate');
 if(axleGate)axleGate.textContent='';

 const fieldGate=document.getElementById('rFieldTestSummary');
 if(fieldGate)fieldGate.textContent='';

 const priceReadiness=document.getElementById('priceReadiness');
 if(priceReadiness)priceReadiness.textContent=window.wafferLocale?.startsWith('en')
   ? '💰 Price comparison is waiting for a verifiable part identity and a trusted price source.'
   : '💰 مقارنة الأسعار: بانتظار هوية قطعة قابلة للتحقق ومصدر سعر موثوق.';

 const catalogMatches=document.getElementById('catalogMatches');
 if(catalogMatches)catalogMatches.innerHTML='<h3>🔎 '+esc(ui('مطابقة كتالوج القطع','Parts catalog matching'))+'</h3><div class="note">'+esc(ui('سيتم عرض نتائج الكتالوج هنا بعد اكتمال المطابقة.','Catalog results will appear here after matching completes.'))+'</div>';

 updateFormHint();
 show('home');
}
async function copyMsg(){try{await navigator.clipboard.writeText(document.getElementById('message').innerText);alert(ui('تم نسخ الرسالة','Message copied'))}catch(e){alert(ui('حدد النص وانسخه يدويًا','Select the text and copy it manually'))}}
function exportDebugReport(){
 if(!analysis)return;
 const vehicle=window.wafferVehicle||{};
 const report={
   exportedAt:new Date().toISOString(),
   requestId:analysis.requestId||null,
   engineVersion:analysis.engineVersion||null,
   completedAt:analysis.completedAt||null,
   engineContext:analysis.engineContext||null,
   acceptance:analysis.acceptance||null,
   catalogState:window.wafferCatalogState||null,
   pricingCapability:window.wafferVerifiedMarketPricing===true,
   pricingResults:window.wafferPricingResults||[],
   pricingSummary:window.wafferPricingSummary||null,
   upload:window.wafferUploadMeta||null,
   vehicle:{
     vehicleId:vehicle.vehicleId||window.wafferVehicleId||null,
     manufacturerName:vehicle.manufacturerName||null,
     modelName:vehicle.modelName||null,
     vehicleDescription:vehicle.vehicleDescription||null
   },
   analysisSummary:{
     total:analysis.total||null,
     calculatedTotal:analysis.calculatedTotal||null,
     transparency:analysis.transparency??null,
     identityConfidence:analysis.identityConfidence??null,
     compatibilityConfidence:analysis.compatibilityConfidence??null,
     priceConfidence:analysis.priceConfidence??null,
     overallConfidence:analysis.overallConfidence??null,
     itemCount:Array.isArray(analysis.items)?analysis.items.length:0,
     missingCount:Array.isArray(analysis.missing)?analysis.missing.length:0,
     conflictCount:Array.isArray(analysis.conflicts)?analysis.conflicts.length:0
   }
 };
 const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');
 a.href=url;
 a.download='waffer-test-'+(analysis.requestId||Date.now())+'.json';
 document.body.appendChild(a);
 a.click();
 a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),0);
}
async function shareSummary(){
 if(!analysis)return;
 const vehicle=formatVehicleForMessage()||ui('غير محددة','not specified');
 const text=[
   ui('وفّر — ملخص فحص عرض الصيانة','Waffer — repair estimate summary'),
   ui('السيارة: ','Vehicle: ')+vehicle,
   ui('الإجمالي الظاهر: ','Displayed total: ')+(analysis.total||ui('غير واضح','unclear')),
   ui('درجة الثقة: ','Confidence: ')+(analysis.overallConfidence??0)+'/100',
   ui('بيانات ناقصة: ','Missing data: ')+(Array.isArray(analysis.missing)?analysis.missing.length:0),
   ui('نقاط تحقق: ','Verification points: ')+(Array.isArray(analysis.conflicts)?analysis.conflicts.length:0),
   ui('التوفير المؤكد: غير محسوب دون مصدر سعر موثوق','Confirmed savings: not calculated without a trusted price source'),
   analysis.requestId?(ui('معرف التحليل: ','Analysis ID: ')+analysis.requestId):''
 ].filter(Boolean).join('\n');
 try{
   if(navigator.share)await navigator.share({title:ui('وفّر — نتيجة الفحص','Waffer — analysis result'),text});
   else{await navigator.clipboard.writeText(text);alert(ui('تم نسخ ملخص النتيجة','Result summary copied'));}
 }catch(e){
   if(e?.name!=='AbortError')console.error('Share error:',e);
 }
}
const fileInput=document.getElementById('file');
const uploadBox=document.getElementById('uploadBox');

function openFilePicker(){
  try{
    if(typeof fileInput.showPicker==='function'){
      fileInput.showPicker();
    }else{
      fileInput.click();
    }
  }catch(e){
    fileInput.click();
  }
}

uploadBox.addEventListener('click',openFilePicker);
uploadBox.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){
    e.preventDefault();
    openFilePicker();
  }
});
fileInput.addEventListener('change',e=>{
 const f=e.target.files&&e.target.files[0];
 const text=document.getElementById('fileText');
 if(!f){text.textContent=window.wafferLocale?.startsWith('en')?'Upload an estimate image or PDF':'ارفع صورة العرض أو ملف PDF';updateFormHint();return;}
 const supported=['image/jpeg','image/png','image/webp','application/pdf'];
 const mimeType=inferMimeType(f);
 if(!mimeType || !supported.includes(mimeType)){
   fileInput.value='';
   text.textContent=window.wafferLocale?.startsWith('en')?'Upload an estimate image or PDF':'ارفع صورة العرض أو ملف PDF';
   updateFormHint();
   alert(window.wafferLocale?.startsWith('en')?'Unsupported file type. Use JPG, PNG, WEBP, or PDF.':'نوع الملف غير مدعوم. استخدم JPG أو PNG أو WEBP أو PDF.');
   return;
 }
 if(mimeType==='application/pdf' && f.size>(window.WAFFER_RUNTIME?.maxUploadBytes||4*1024*1024)){
   fileInput.value='';
   text.textContent=window.wafferLocale?.startsWith('en')?'Upload an estimate image or PDF':'ارفع صورة العرض أو ملف PDF';
   updateFormHint();
   alert(window.wafferLocale?.startsWith('en')?'The PDF is larger than '+uploadLimitMb()+' MB. Reduce its size and try again.':'حجم ملف PDF أكبر من '+uploadLimitMb()+'MB. صغّر الملف ثم حاول مجددًا.');
   return;
 }
 const sizeText=(f.size/1024/1024).toFixed(2)+' MB';
 const willOptimize=mimeType.startsWith('image/')&&(
   typeof window.wafferShouldOptimizeImage==='function'
     ? window.wafferShouldOptimizeImage(f.size,window.WAFFER_RUNTIME?.maxUploadBytes||4*1024*1024)
     : f.size>(window.WAFFER_RUNTIME?.maxUploadBytes||4*1024*1024)
 );
 text.textContent=window.wafferLocale?.startsWith('en')
   ? 'Selected: '+f.name+' — '+sizeText+(willOptimize?' • will optimize automatically':'')
   : 'تم اختيار: '+f.name+' — '+sizeText+(willOptimize?' • سيتم تحسين الصورة تلقائيًا':'');
 updateFormHint();
});
function updateFormHint(){
 const hint=document.getElementById('formHint');
 if(!hint)return;
 const file=document.getElementById('file')?.files?.[0];
 const vin=String(document.getElementById('vin')?.value||'').trim();
 const en=window.wafferLocale?.startsWith('en');
 if(!file){
   hint.textContent=en?'Select an estimate file to begin.':'اختر ملف عرض الصيانة للبدء.';
 }else if(vin && vin.length!==17){
   hint.textContent=en?'VIN is optional, but if entered it must contain 17 characters.':'رقم VIN اختياري، وإذا أُدخل فيجب أن يتكون من 17 خانة.';
 }else{
   hint.textContent=en?'Ready to analyze.':'جاهز للتحليل.';
 }
}
document.getElementById('vin').addEventListener('input',updateFormHint);
document.getElementById('year').addEventListener('input',updateFormHint);

function updateNetworkStatus(){
 const box=document.getElementById('offlineStatus');
 if(!box)return;
 box.classList.toggle('hidden',navigator.onLine);
}
window.addEventListener('online',()=>{updateNetworkStatus();checkSystemHealth();});
window.addEventListener('offline',updateNetworkStatus);
updateNetworkStatus();

let healthCheckRun=0;
let healthCheckController=null;
function setSystemStatusTone(element,tone){
  if(!element)return;
  element.classList.remove('system-status-ok','system-status-warn');
  element.classList.add(tone==='ok'?'system-status-ok':'system-status-warn');
}
async function checkSystemHealth(){
 const el=document.getElementById('systemStatus');
 const run=++healthCheckRun;
 healthCheckController?.abort();
 const controller=new AbortController();
 healthCheckController=controller;
 const timer=setTimeout(()=>controller.abort(),6000);
 try{
   let r,d;
   try{
     r=await fetch('/api/health',{cache:'no-store',signal:controller.signal});
     d=await r.json();
   }finally{
     clearTimeout(timer);
   }
   if(run!==healthCheckRun)return;
   window.wafferVerifiedMarketPricing=d?.capabilities?.verifiedMarketPricing===true;
   if(window.wafferVerifiedMarketPricing && analysis){
     void refreshVerifiedPricing(analysisRunId);
   }else if(typeof window.wafferRenderPricingSummary==='function'){
     window.wafferRenderPricingSummary();
   }
   const en=window.wafferLocale?.startsWith('en');
   if(d.status==='ready'){
     const ms=Number(d?.latency?.catalogMs);
     const latencyText=Number.isFinite(ms)
       ? (en?' • catalog ':' • الكتالوج ')+ms+'ms'
       : '';
     const analysisBasis=d?.verification?.analysis==='configuration_only'
       ? (en?' • analysis configured':' • التحليل مهيأ')
       : '';
     const version=d?.version?' • '+d.version:'';
     const commit=d?.deployment?.commit?' • '+d.deployment.commit:'';
     el.textContent=(en?'● Core services ready':'● الخدمات الأساسية جاهزة')+analysisBasis+latencyText+version+commit;
     setSystemStatusTone(el,'ok');
   }else if(d.status==='degraded'){
     el.textContent=en
       ? '⚠ Analysis is configured, but catalog service is currently limited'
       : '⚠ التحليل مهيأ، لكن خدمة الكتالوج محدودة حاليًا';
     setSystemStatusTone(el,'warn');
   }else{
     el.textContent=en
       ? '⚠ Some required services are not ready'
       : '⚠ بعض الخدمات المطلوبة غير جاهزة';
     setSystemStatusTone(el,'warn');
   }
 }catch(e){
   if(run!==healthCheckRun)return;
   window.wafferVerifiedMarketPricing=false;
   if(typeof window.wafferRenderPricingSummary==='function')window.wafferRenderPricingSummary();
   const en=window.wafferLocale?.startsWith('en');
   el.textContent=en
     ? '⚠ Could not verify service status'
     : '⚠ تعذر التحقق من حالة الخدمة';
   setSystemStatusTone(el,'warn');
 }finally{
   clearTimeout(timer);
   if(healthCheckController===controller)healthCheckController=null;
 }
}
checkSystemHealth();

let deferredInstallPrompt=null;
const installBtn=document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();
 deferredInstallPrompt=event;
 if(installBtn)installBtn.classList.remove('hidden');
});
if(installBtn){
 installBtn.addEventListener('click',async()=>{
   if(!deferredInstallPrompt)return;
   deferredInstallPrompt.prompt();
   try{await deferredInstallPrompt.userChoice;}catch(e){}
   deferredInstallPrompt=null;
   installBtn.classList.add('hidden');
 });
}
window.addEventListener('appinstalled',()=>{
 deferredInstallPrompt=null;
 if(installBtn)installBtn.classList.add('hidden');
});

if('serviceWorker' in navigator){
 window.addEventListener('load',()=>{
   navigator.serviceWorker.register('/sw.js').catch(e=>console.error('Service worker registration failed:',e));
 });
}

let manufacturersRun=0;
let manufacturersController=null;
function makeLoaderText(key){
 const en=window.wafferLocale?.startsWith('en');
 const values={
   loading:en?'Loading makes...':'جارٍ تحميل الشركات...',
   choose:en?'Choose make':'اختر الشركة',
   failed:en?'Could not load makes':'تعذر تحميل الشركات',
   retry:en?'Reload makes':'إعادة تحميل الشركات'
 };
 return values[key]||key;
}
async function loadManufacturers(){
 const m=document.getElementById('make');
 const retry=document.getElementById('retryMakes');
 const run=++manufacturersRun;
 manufacturersController?.abort();
 const controller=new AbortController();
 manufacturersController=controller;
 const timer=setTimeout(
   ()=>controller.abort(),
   window.WAFFER_RUNTIME?.clientManufacturersTimeoutMs||12000
 );
 const initialValue=m.value;
 const initialLabel=m.selectedOptions?.[0]?.textContent||'';
 retry.classList.add('hidden');
 retry.textContent=makeLoaderText('retry');
 if(!initialValue){
   m.replaceChildren(new Option(makeLoaderText('loading'),''));
   m.disabled=true;
 }
 try{
   let r,d;
   try{
     r=await fetch('/api/vehicles',{signal:controller.signal});
     d=await r.json();
   }finally{
     clearTimeout(timer);
   }
   if(run!==manufacturersRun)return;
   if(!r.ok)throw new Error(d?.error||('API '+r.status));
   const manufacturers=Array.isArray(d?.manufacturers)?d.manufacturers:[];
   if(!manufacturers.length)throw new Error('No manufacturers returned');

   const currentValue=m.value||initialValue;
   const currentLabel=m.selectedOptions?.[0]?.textContent||initialLabel;
   m.replaceChildren(new Option(makeLoaderText('choose'),''));
   manufacturers.forEach(x=>{
     if(x?.manufacturerId!=null && x?.manufacturerName){
       m.add(new Option(String(x.manufacturerName),String(x.manufacturerId)));
     }
   });
   if(currentValue){
     if(!Array.from(m.options).some(o=>o.value===String(currentValue)) && currentLabel){
       m.add(new Option(currentLabel,String(currentValue)));
     }
     m.value=String(currentValue);
   }
   m.disabled=false;
 }catch(e){
   if(run!==manufacturersRun)return;
   if(e?.name!=='AbortError')console.error('Manufacturers load error:',e);
   const currentValue=m.value||initialValue;
   const currentLabel=m.selectedOptions?.[0]?.textContent||initialLabel;
   m.disabled=false;
   if(currentValue){
     if(!Array.from(m.options).some(o=>o.value===String(currentValue))){
       m.add(new Option(currentLabel||String(currentValue),String(currentValue)));
     }
     m.value=String(currentValue);
   }else{
     m.replaceChildren(new Option(makeLoaderText('failed'),''));
   }
   retry.textContent=makeLoaderText('retry');
   retry.classList.remove('hidden');
 }finally{
   clearTimeout(timer);
   if(manufacturersController===controller)manufacturersController=null;
 }
}
document.getElementById('retryMakes').addEventListener('click',()=>{void loadManufacturers();});
void loadManufacturers();
window.addEventListener('wafferPartsMatched', function(event){
 if(event.detail?.wafferRunId!=null && event.detail.wafferRunId!==window.wafferAnalysisRunId)return;
 if(!analysis)return;
 const matches=Array.isArray(event.detail)?event.detail:[];
 const items=Array.isArray(analysis?.items)?analysis.items:[];

 items.forEach((item,index)=>{
   const m=matches[index];
   if(m && m.productId){
     item.catalogMatch={
       productId:m.productId,
       productName:m.productName,
       matchScore:m.matchScore,
       requestedAxle:m.requestedAxle||null,
       countArticles:m.countArticles,
       totalCatalogArticles:m.totalCatalogArticles??m.countArticles,
       verifiedByAxle:m.verifiedByAxle??0,
       articles:Array.isArray(m.articles)?m.articles:[]
     };
   }
 });

 const box=document.getElementById('catalogMatches');
 const summary=document.getElementById('catalogSummary');
 if(!box)return;

 const matched=matches.filter(m=>m && m.productId);
 const elapsed=matches.find(m=>Number.isFinite(m?.matchingElapsedMs))?.matchingElapsedMs;
 const coverage=document.getElementById('rCatalogCoverage');
 if(coverage){
   const totalItems=Array.isArray(analysis?.items)?analysis.items.filter(i=>(i.itemType||'part')==='part').length:0;
   const matchedCount=matched.filter(m=>m?.productId).length;
   coverage.textContent=totalItems
     ? ui(
         '🔎 تغطية التحقق من الكتالوج: '+matchedCount+' من '+totalItems+' بنود قطع ('+Math.round((matchedCount/totalItems)*100)+'%).',
         '🔎 Catalog verification coverage: '+matchedCount+' of '+totalItems+' part lines ('+Math.round((matchedCount/totalItems)*100)+'%).'
       )
     : ui('🔎 لا توجد بنود قطع واضحة تحتاج مطابقة كتالوج.','🔎 No clear part line items require catalog matching.');
 }

 const priceReadiness=document.getElementById('priceReadiness');
 if(priceReadiness){
   const withArticles=matched.filter(m=>Array.isArray(m.articles)&&m.articles.length);
   priceReadiness.textContent=withArticles.length
     ? ui(
         '💰 تم التحقق من هوية بدائل لبعض البنود. يلزم الآن ربط مصدر أسعار موثوق لحساب نطاق السوق والتوفير.',
         '💰 Alternative identities were verified for some items. A trusted price source is still required for market range and savings.'
       )
     : ui(
         '💰 لم تكتمل هوية قطعة قابلة للتسعير بعد؛ لن يعرض وفّر توفيرًا تقديريًا.',
         '💰 No price-ready part identity is complete yet; Waffer will not show estimated savings.'
       );
 }

 if(summary){
   summary.textContent=matched.length
     ? ui(
         '✅ تمت مطابقة '+matched.length+' من بنود العرض مع كتالوج السيارة.',
         '✅ Matched '+matched.length+' estimate line items against the vehicle catalog.'
       )+(elapsed?' ('+(elapsed/1000).toFixed(1)+' '+ui('ث','s')+')':'')
     : ui('⚠️ اكتمل فحص الكتالوج ولم تظهر مطابقة مناسبة.','⚠️ Catalog checking finished with no suitable match.');
 }

 if(!matched.length){
   box.innerHTML='<h3>🔎 '+esc(ui('مطابقة كتالوج القطع','Parts catalog matching'))+'</h3>'+
     '<div class="note">'+esc(ui('تم فحص الكتالوج، لكن لم يتم العثور على مطابقة مناسبة للبنود المستخرجة.','The catalog was checked, but no suitable match was found for the extracted items.'))+'</div>';
   return;
 }

 box.innerHTML='<h3>🔎 '+esc(ui('مطابقة كتالوج القطع','Parts catalog matching'))+'</h3>'+
   '<p class="note">'+esc(ui(
     'تمت مقارنة بنود عرض الورشة بكتالوج السيارة، ويعرض وفّر حتى 3 بدائل مميزة فقط لكل بند بدل إظهار مئات النتائج.',
     'Estimate items were compared with the vehicle catalog. Waffer shows up to 3 distinct alternatives per item instead of hundreds of results.'
   ))+'</p>'+
   matched.map(m=>{
     const articles=Array.isArray(m.articles)?m.articles.slice(0,3):[];
     const articleHtml=articles.length?articles.map(a=>{
       const image=a.image||a.s3image||'';
       const rawQuality=String(a.qualityLabel||'');
       const displayQuality=rawQuality==='بديل كتالوج — يحتاج تحقق'
         ? ui('بديل كتالوج — يحتاج تحقق','Catalog alternative — verify before approval')
         : (rawQuality||ui('غير مصنف','unclassified'));
       return '<div class="catalog-alt-card">'+
         '<div>'+esc(ui('رقم القطعة: ','Part number: '))+'<strong>'+esc(a.articleNo||ui('غير متوفر','not available'))+'</strong></div>'+
         '<div>'+esc(ui('المصنع: ','Supplier: '))+'<strong>'+esc(a.supplierName||ui('غير متوفر','not available'))+'</strong></div>'+
         '<div>'+esc(ui('الوصف: ','Description: '))+esc(a.articleProductName||'')+'</div>'+
         '<div>'+esc(ui('التصنيف: ','Classification: '))+esc(displayQuality)+'</div>'+
         (image?'<img src="'+esc(image)+'" alt="" loading="lazy" class="catalog-alt-image">':'')+
         '</div>';
     }).join(''):'<div class="note">'+esc(ui('تم تحديد نوع القطعة، لكن لم تُحمّل أرقام بديلة.','The part type was identified, but no alternative part numbers were loaded.'))+'</div>';

     return '<div class="catalog-match-card">'+
       '<b>'+esc(m.workshopItem||ui('قطعة','Part'))+'</b>'+
       '<div class="catalog-match-title">'+esc(ui('مطابقة الكتالوج: ','Catalog match: '))+'<strong>'+esc(m.productName||'-')+'</strong></div>'+
       '<div>Product ID: '+esc(m.productId)+'</div>'+
       '<div>'+esc(ui('درجة المطابقة: ','Match score: '))+esc(m.matchScore??0)+'%</div>'+
       (m.requestedAxle?'<div>'+esc(ui('الموضع المطلوب: ','Requested position: '))+'<strong>'+esc(m.requestedAxle==='front'?ui('أمامي','front'):ui('خلفي','rear'))+'</strong></div>':'')+
       (m.requestedAxle?'<div>'+esc(ui('نتائج تم التحقق من موضعها: ','Position-verified results: '))+esc(m.verifiedByAxle??0)+'</div>':'')+
       '<div>'+esc(ui('عدد النتائج المتوافقة في الكتالوج: ','Compatible catalog results: '))+esc(m.countArticles??0)+'</div>'+
       '<div class="note">'+esc(ui('البدائل أدناه مختصرة للمراجعة، ولا تعني ترتيبًا سعريًا قبل ربط مصدر أسعار موثوق.','The alternatives below are a review shortlist, not a price ranking; a trusted price source is still required.'))+'</div>'+
       articleHtml+
       '</div>';
   }).join('');
});
function bindUiActions(){
  const actions = {
    analyzeBtn: () => start(),
    debugExportBtn: () => exportDebugReport(),
    detailsBtn: () => advanced(),
    workshopBtn: () => messageWorkshop(),
    shareSummaryBtn: () => shareSummary(),
    workshopFollowupBtn: () => messageWorkshop(),
    backBtn: () => show('result'),
    newAnalysisBtn: () => resetAnalysis(),
    copyMessageBtn: () => copyMsg(),
    resultBackBtn: () => show('result')
  };
  for (const [id, handler] of Object.entries(actions)) {
    document.getElementById(id)?.addEventListener('click', handler);
  }
}
bindUiActions();
