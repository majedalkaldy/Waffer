"""Offline DOM regression tests with real Chromium, synthetic files, mocked fetch.
No URLs are navigated and no real AI, VIN, catalog, or payment requests are made.
This does not test deployment routing, native ES module loading, or PWA install.
Requires: playwright plus Chromium. Run: python tests/browser_test.py
"""
from pathlib import Path
import base64, copy, json, os, re, time, traceback
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('WAFFER_TEST_RESULTS',str(ROOT.parent/'results')))
OUT.mkdir(parents=True,exist_ok=True)
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6oAAAAABJRU5ErkJggg==')
PDF=b'%PDF-1.4\n% synthetic fixture\n%%EOF\n'
VIN_A,VIN_B='1HGCM82633A004352','1HGCM82633A004353'
SAMPLE={
 'total':'402.50 SAR','calculatedTotal':'350 SAR before tax','tax':'52.50 SAR','laborTotal':'50 SAR','warranty':'Not stated',
 'status':'Synthetic test response','transparency':70,'identityConfidence':40,'compatibilityConfidence':30,'priceConfidence':0,'overallConfidence':40,
 'missing':['Confirm manufacturer'],'conflicts':[],'nextActions':['Confirm the requested position'],
 'items':[{'name':'فحمات فرامل أمامية','partNumber':'غير ظاهر','price':'300 SAR','itemType':'part','identityConfidence':30,'compatibility':'Needs verification','priceAssessment':'No price source','conflict':''},
 {'name':'Labor','price':'50 SAR','itemType':'labor','identityConfidence':0}],
 'workshopMessage':'Please confirm the part manufacturer.','engineVersion':'mvp-2026-09','requestId':'synthetic-test-001','completedAt':'2026-09-22T06:00:00.000Z',
 'engineContext':{'market':'SA','currency':'SAR','locale':'ar-SA'},'acceptance':{'schemaValid':True,'hasItems':True,'itemCount':2}}

def source_bundle():
    # Flatten this app's small, acyclic module graph for an in-memory browser.
    # Original files are also syntax checked and imported independently by Node tests.
    names=['lib/client-core.js','lib/market-config.js','lib/i18n.js','vin-ui.js','parts-match.js','app.js']
    contents=[]
    for name in names:
        source=(ROOT/name).read_text()
        source=re.sub(r'^import .*?;\s*$', '', source, flags=re.M)
        source=re.sub(r'^export (?=(?:const|function|async function|class)\b)', '', source, flags=re.M)
        contents.append(source)
    return "(()=>{'use strict';\n"+'\n'.join(contents)+'\n})();'

FETCH_STUB=r'''([sample, options]) => {
 const clone=x=>JSON.parse(JSON.stringify(x));
 window.__mock={sample,options,calls:[],posts:[],held:[]};
 function vehicle(id=123,make='Toyota',model='Camry',multiple=false){
   const rows=[{vehicleId:id,manufacturerId:5,modelId:9,year:2020,vehicleTypeDescription:'2.5 petrol'}];
   if(multiple)rows.push({vehicleId:456,manufacturerId:5,modelId:9,year:2021,vehicleTypeDescription:'Hybrid'});
   return {data:{matchingManufacturers:{array:[{manuId:5,manuName:make}]},matchingModels:{array:[{modelId:9,modelName:model}]},matchingVehicles:{array:rows}}};
 }
 window.fetch=async(url,init={})=>{
  const m=window.__mock,o=m.options,u=String(url);m.calls.push(u);
  const answer=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  const hold=()=>new Promise((resolve,reject)=>{
   if(init.signal?.aborted){reject(new DOMException('aborted','AbortError'));return;}
   const cancel=()=>reject(new DOMException('aborted','AbortError'));
   init.signal?.addEventListener('abort',cancel,{once:true});
   m.held.push(data=>{init.signal?.removeEventListener('abort',cancel);resolve(answer(data||sample));});
  });
  if(u.startsWith('/api/health'))return answer({status:'ready',ok:true});
  if(u.startsWith('/api/vehicles'))return answer({manufacturers:[{manufacturerId:5,manufacturerName:'Toyota'},{manufacturerId:6,manufacturerName:'Ford'}]});
  if(u.startsWith('/api/vin')){
   if(o.hold_vin_a&&u.includes('1HGCM82633A004352'))return hold();
   if(o.vin_failed)return answer({code:'VIN_UPSTREAM_ERROR'},502);
   return answer(vehicle(u.includes('1HGCM82633A004353')?222:123,u.includes('1HGCM82633A004353')?'Ford':'Toyota',u.includes('1HGCM82633A004353')?'Focus':'Camry',o.ambiguous));
  }
  if(u.startsWith('/api/analyze')){
   m.posts.push(JSON.parse(init.body));
   if(o.hold_analysis)return hold();
   if(o.invalid_response)return new Response('<html>invalid</html>',{status:200});
   if(o.rate_limit)return answer({code:'ANALYSIS_RATE_LIMITED'},429);
   const data=clone(sample);data.engineContext.locale=m.posts.at(-1).vehicle.locale;
   if(o.xss)data.items[0].name='<img src=x onerror="window.injected=true">';
   if(o.invalid_schema)data.acceptance.schemaValid=false;
   return answer(data);
  }
  if(u.startsWith('/api/products'))return o.catalog_failed?answer({code:'CATALOG_UPSTREAM_ERROR'},502):answer({products:[{productId:1,productName:'Brake Pad Set'}]});
  if(u.startsWith('/api/articles'))return o.hold_catalog?hold():answer({articles:[{articleId:11,articleNo:'FRONT-111',supplierName:'Brand A'},{articleId:12,articleNo:'REAR-222',supplierName:'Brand B'}]});
  if(u.startsWith('/api/article-criteria'))return answer({criteria:[{criteriaName:'Fitting Position',criteriaValue:u.includes('articleId=11')?'Front Axle':'Rear Axle'}]});
  return answer({code:'NOT_FOUND'},404);
 };
}'''
class Options(dict):
    def __init__(self,page,values): super().__init__(values);self.page=page
    def __setitem__(self,key,value): super().__setitem__(key,value);self.page.evaluate('([k,v])=>window.__mock.options[k]=v',[key,value])
class Stub:
    def __init__(self,page,**options):
        self.page=page;self.options=Options(page,options)
        page.evaluate(FETCH_STUB,[SAMPLE,options])
    @property
    def posts(self): return self.page.evaluate('window.__mock.posts')
    @property
    def calls(self): return self.page.evaluate('window.__mock.calls')
    def complete_held(self,data=None): self.page.evaluate('(data)=>{for(const done of window.__mock.held.splice(0))done(data)}',data)

results=[]
def record(name,fn):
    started=time.monotonic()
    try:fn();results.append({'name':name,'status':'passed','seconds':round(time.monotonic()-started,2)})
    except Exception as exc:
        results.append({'name':name,'status':'failed','error':str(exc),'trace':traceback.format_exc()});print('FAIL:',name,str(exc),flush=True)
    else:print('PASS:',name,flush=True)
def attach(page,kind='png',size=None):
    payload=PNG if kind=='png' else PDF
    if size is not None:payload=b'0'*size
    page.locator('#file').set_input_files({'name':'synthetic-quote.'+kind,'mimeType':'image/png' if kind=='png' else 'application/pdf','buffer':payload})
def wait_result(page):expect(page.locator('#result')).to_be_visible()
def vin_ready(page):
    page.locator('#vin').fill(VIN_A);page.locator('#checkVin').click()
    expect(page.locator('#model')).to_have_value('Camry');expect(page.locator('#year')).to_have_value('2020')
def run_case(browser,name,fn,storage_blocked=False,**options):
    def case():
        ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
        page=ctx.new_page();page.set_default_timeout(4000);errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        html=(ROOT/'index.html').read_text()
        html=re.sub(r'<script[^>]*src="/app.js"[^>]*></script>','',html)
        html=re.sub(r'<link rel="manifest"[^>]*>','',html)
        page.set_content(html)
        if storage_blocked:page.evaluate("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError')}})")
        stub=Stub(page,**options)
        try:
            page.add_script_tag(content=source_bundle())
            fn(page,stub,ctx)
            assert not errors,'Uncaught browser JavaScript errors: '+repr(errors)
        finally:ctx.close()
    record(name,case)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    run_case(browser,'Boot, Arabic UI, native file control, no JS errors',lambda page,s,c:(
        expect(page.locator('#heroTitle')).to_have_count(0),
        expect(page.locator('#make option')).to_have_count(3),
        expect(page.locator('#file')).to_be_visible(),
        page.locator('#analyzeBtn').click(),expect(page.locator('#notice')).to_contain_text('اختر')))

    def no_vin(page,s,c):
        attach(page);page.locator('#make').select_option('5');page.locator('#model').fill('Camry');page.locator('#year').fill('2020')
        page.locator('#localeSelect').select_option('en-SA')
        expect(page.locator('#fileText')).to_contain_text('synthetic-quote.png')
        page.locator('#analyzeBtn').click();wait_result(page)
        assert len(s.posts)==1 and s.posts[0]['vehicle']['make']=='Toyota'
        assert s.posts[0]['vehicle']['vehicleId'] is None
        assert s.posts[0]['vehicle']['locale']=='en-SA'
        assert not any('/api/products' in url for url in s.calls)
        expect(page.locator('#catalogSummary')).to_contain_text('not started')
        page.locator('#detailsBtn').click();expect(page.locator('#itemsBody tr')).to_have_count(2)
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'), 'Horizontal overflow'
        page.locator('#newAnalysisBtn').click()
        expect(page.locator('#home')).to_be_visible();expect(page.locator('#vin')).to_have_value('')
        expect(page.locator('#model')).to_have_value('');assert page.locator('#file').evaluate('(e)=>e.files.length')==0
    run_case(browser,'Image analysis without VIN; language; reset; bounded mobile layout',no_vin)

    def pdf(page,s,c):
        attach(page,'pdf');page.locator('#analyzeBtn').click();wait_result(page)
        assert s.posts[0]['mimeType']=='application/pdf' and s.posts[0]['fileData'].startswith('data:application/pdf;base64,')
    run_case(browser,'PDF file transport through UI (analysis response mocked)',pdf)

    def matching(page,s,c):
        page.locator('#year').fill('2013');vin_ready(page);attach(page)
        page.locator('#analyzeBtn').click();wait_result(page)
        expect(page.locator('#catalogSummary')).to_contain_text('اكتمل')
        assert s.posts[0]['vehicle']['year']=='2020'
        assert s.posts[0]['vehicle']['vehicleId']=='123'
        assert len([url for url in s.calls if '/api/vin?' in url])==1
        page.locator('#detailsBtn').click()
        expect(page.locator('#catalogMatches')).to_contain_text('FRONT-111')
        expect(page.locator('#catalogMatches')).not_to_contain_text('REAR-222')
        page.screenshot(path=str(OUT/'mobile-catalog.png'),full_page=True)
    run_case(browser,'VIN fills current year/make, one VIN call, only front candidates',matching)

    def ambiguous(page,s,c):
        page.locator('#vin').fill(VIN_A);page.locator('#checkVin').click()
        expect(page.locator('#candidateSelect')).to_be_visible();expect(page.locator('#candidateSelect')).to_have_value('')
        attach(page);page.locator('#analyzeBtn').click();wait_result(page)
        assert s.posts[0]['vehicle']['vehicleId'] is None
        assert not any('/api/products' in url for url in s.calls)
    run_case(browser,'Ambiguous VIN never auto-selects first candidate',ambiguous,ambiguous=True)

    def choose_variant(page,s,c):
        page.locator('#vin').fill(VIN_A);page.locator('#checkVin').click();expect(page.locator('#candidateSelect')).to_be_visible()
        page.locator('#candidateSelect').select_option('456');attach(page);page.locator('#analyzeBtn').click();wait_result(page)
        assert s.posts[0]['vehicle']['vehicleId']=='456' and s.posts[0]['vehicle']['year']=='2021'
    run_case(browser,'Explicit VIN variant selection is retained at analysis',choose_variant,ambiguous=True)

    def cleared_vin(page,s,c):
        vin_ready(page);page.locator('#vin').fill('');attach(page);page.locator('#analyzeBtn').click();wait_result(page)
        assert s.posts[0]['vehicle']['vehicleId'] is None
        assert not any('/api/products' in url for url in s.calls)
    run_case(browser,'Clearing VIN removes previous vehicle identity',cleared_vin)

    def catalog_failure(page,s,c):
        vin_ready(page);attach(page);page.locator('#analyzeBtn').click();wait_result(page)
        expect(page.locator('#catalogSummary')).to_contain_text('تعذر')
        expect(page.locator('#rTotal')).to_have_text('402.50 SAR')
        expect(page.locator('#analyzeBtn')).to_be_enabled()
    run_case(browser,'Catalog failure keeps successful analysis visible',catalog_failure,catalog_failed=True)

    def double_click(page,s,c):
        attach(page);page.evaluate("document.querySelector('#analyzeBtn').click();document.querySelector('#analyzeBtn').click()")
        page.wait_for_function("document.querySelector('#loading').hidden===false")
        page.wait_for_timeout(100);assert len(s.posts)==1
        s.complete_held();wait_result(page);expect(page.locator('#analyzeBtn')).to_be_enabled()
    run_case(browser,'Repeated analyze clicks create only one POST',double_click,hold_analysis=True)

    def cancellation(page,s,c):
        attach(page);page.locator('#analyzeBtn').click();expect(page.locator('#loading')).to_be_visible()
        page.wait_for_timeout(80);page.locator('#cancelBtn').click();s.complete_held()
        page.wait_for_timeout(80);expect(page.locator('#home')).to_be_visible();expect(page.locator('#result')).to_be_hidden()
        s.options['hold_analysis']=False;page.locator('#analyzeBtn').click();wait_result(page)
    run_case(browser,'Cancelled analysis cannot later replace current UI',cancellation,hold_analysis=True)

    def reset_pending_catalog(page,s,c):
        vin_ready(page);attach(page);page.locator('#analyzeBtn').click();wait_result(page)
        page.wait_for_timeout(100);page.locator('#detailsBtn').click();page.locator('#newAnalysisBtn').click()
        s.complete_held({'articles':[{'articleNo':'STALE','supplierName':'Old'}]});page.wait_for_timeout(100)
        expect(page.locator('#home')).to_be_visible();assert page.locator('#catalogMatches').inner_text()==''
    run_case(browser,'Reset cancels in-flight catalog and discards late results',reset_pending_catalog,hold_catalog=True)

    def malformed(page,s,c):
        attach(page);page.locator('#analyzeBtn').click();expect(page.locator('#notice')).to_be_visible()
        expect(page.locator('#home')).to_be_visible();expect(page.locator('#analyzeBtn')).to_be_enabled()
    run_case(browser,'Malformed JSON never becomes a successful result',malformed,invalid_response=True)
    run_case(browser,'Invalid server schema is rejected',malformed,invalid_schema=True)
    run_case(browser,'Rate limiting restores usable form',malformed,rate_limit=True)

    def xss(page,s,c):
        attach(page);page.locator('#analyzeBtn').click();wait_result(page);page.locator('#detailsBtn').click()
        expect(page.locator('#itemsBody')).to_contain_text('<img src=x')
        assert page.evaluate('window.injected===undefined')
        expect(page.locator('#itemsBody img')).to_have_count(0)
    run_case(browser,'Untrusted extracted text is rendered as text, not executable HTML',xss,xss=True)

    def storage(page,s,c):
        expect(page.locator('#analyzeBtn')).to_be_enabled();page.locator('#localeSelect').select_option('en-SA')
        attach(page);page.locator('#analyzeBtn').click();wait_result(page)
        assert s.posts[0]['vehicle']['locale']=='en-SA'
    run_case(browser,'Storage denial does not stop boot, localization, or analysis',storage,storage_blocked=True)

    def oversized(page,s,c):
        attach(page,size=3*1024*1024+1);expect(page.locator('#notice')).to_contain_text('3 MiB')
        assert page.locator('#file').evaluate('(e)=>e.files.length')==0 and not s.posts
    run_case(browser,'Oversized file rejected before API call',oversized)

    def invalid_year(page,s,c):
        attach(page);page.locator('#year').fill('9999');page.locator('#analyzeBtn').click()
        expect(page.locator('#notice')).to_contain_text('سنة الصنع');assert not s.posts
    run_case(browser,'Invalid model year rejected before API call',invalid_year)

    def after_render_locale(page,s,c):
        attach(page);page.locator('#analyzeBtn').click();wait_result(page)
        page.locator('#localeSelect').select_option('en-SA')
        expect(page.locator('#detailsBtn')).to_have_text('View line-item details')
        page.locator('#detailsBtn').click();page.locator('#followupBtn').click()
        expect(page.locator('#message')).to_have_value('Please confirm the part manufacturer.')
        page.screenshot(path=str(OUT/'english-message.png'),full_page=True)
    run_case(browser,'Locale change after rendering has no missing-element failure',after_render_locale)

    browser.close()
report={'suite':'Offline Chromium DOM regressions','provider_mode':'synthetic files and mocked fetch; no network navigation or paid API calls','limitations':['Native ES module loading, deployed HTTPS routing and PWA installation are not tested by this suite.'], 'passed':sum(r['status']=='passed' for r in results),'failed':sum(r['status']=='failed' for r in results),'tests':results}
(OUT/'browser-results.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
print(json.dumps({k:report[k] for k in ['passed','failed','provider_mode']},ensure_ascii=False),flush=True)
raise SystemExit(1 if report['failed'] else 0)
