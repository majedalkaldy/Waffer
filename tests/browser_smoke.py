"""Browser integration checks with mocked providers; no billable or external API calls.
Requires Python + playwright + a Chromium executable (CHROMIUM_PATH may override).
Run from the repository root: python tests/browser_smoke.py
"""
import asyncio
import base64
import contextlib
import copy
import functools
import http.server
import json
import os
import re
import sys
from pathlib import Path
import threading
import time
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
VIN_A, VIN_B = 'AAAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBBB'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=')
FILE = {'name': 'fixture.png', 'mimeType': 'image/png', 'buffer': PNG}
BASE = {'total': '115 SAR', 'calculatedTotal':'100', 'tax':'15', 'laborTotal':'غير مذكور', 'warranty':'غير مذكور', 'status':'مراجعة تجريبية',
 'transparency':60,'identityConfidence':30,'compatibilityConfidence':0,'priceConfidence':0,'overallConfidence':25,
 'missing':['رقم قطعة مطلوب'], 'conflicts':[], 'nextActions':['تحقق من رقم القطعة'],
 'items':[{'name':'فحمات أمامية', 'partNumber':'غير ظاهر', 'price':'100', 'manufacturer':'غير ظاهر', 'itemType':'part'}],
 'workshopMessage':'يرجى توضيح رقم القطعة.', 'requestId':'fixture-result', 'engineVersion':'mvp-2026-09', 'completedAt':'2026-09-22T00:00:00Z'}

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

async def run():
    server = http.server.ThreadingHTTPServer(('127.0.0.1',0), functools.partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    records = []
    memory_mode = '--memory' in sys.argv
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--disable-dev-shm-usage'])
        async def scenario(name, operation, config=None, viewport=None):
            config=config or {}; calls=[]; errors=[]
            context=await browser.new_context(viewport=viewport or {'width':390,'height':844},service_workers='block')
            context.set_default_timeout(4500)
            if config.get('blocked_storage'):
                await context.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Disabled','SecurityError');}})")
            page=await context.new_page(); page.on('pageerror',lambda e:errors.append(str(e)))
            async def route_request(route):
                request=route.request; url=urlparse(request.url)
                if not request.url.startswith(origin):
                    await route.abort(); return
                if not url.path.startswith('/api/'):
                    await route.continue_(); return
                calls.append({'path':url.path,'query':parse_qs(url.query),'body':request.post_data_json if request.method=='POST' else None})
                if url.path=='/api/health': data={'status':'ready','configured':{'analysis':True,'catalog':True}}
                elif url.path=='/api/vehicles':
                    await asyncio.sleep(config.get('makes_delay',0))
                    data={'manufacturers':[{'manufacturerId':1,'manufacturerName':'Ford'},{'manufacturerId':2,'manufacturerName':'Toyota'}]}
                elif url.path=='/api/vin':
                    vin=parse_qs(url.query).get('vin',[''])[0]
                    await asyncio.sleep(config.get('vin_a_delay',0) if vin==VIN_A else config.get('vin_b_delay',0))
                    name='Toyota' if vin==VIN_A else 'Ford'; model='Camry' if vin==VIN_A else 'Expedition'
                    vehicles=[{'vehicleId':42 if vin==VIN_A else 43,'manufacturerId':2 if vin==VIN_A else 1,'modelId':10,'year':2020,'modelName':model,'vehicleTypeDescription':'Test variant'}]
                    if config.get('multiple'): vehicles.append({**vehicles[0],'vehicleId':99,'vehicleTypeDescription':'Second variant'})
                    data={'data':{'matchingManufacturers':{'array':[{'manufacturerId':2 if vin==VIN_A else 1,'manufacturerName':name}]},'matchingModels':{'array':[{'modelId':10,'modelName':model}]},'matchingVehicles':{'array':vehicles}}}
                elif url.path=='/api/analyze':
                    count=sum(c['path']=='/api/analyze' for c in calls)
                    await asyncio.sleep(config.get('first_analysis_delay',0) if count==1 else 0)
                    data=copy.deepcopy(config.get('analysis',BASE)); data['requestId']=f'fixture-{count}'
                    data['engineContext']=request.post_data_json['vehicle']
                elif url.path=='/api/products':
                    await asyncio.sleep(config.get('products_delay',0))
                    data={'products':[{'productId':5,'productName':'Brake pad set'}]}
                elif url.path=='/api/articles':
                    data={'articles':[{'articleId':1,'articleNo':'F-1','supplierName':'A'},{'articleId':2,'articleNo':'R-1','supplierName':'B'}]}
                else:
                    aid=parse_qs(url.query).get('articleId',[''])[0]
                    data={'criteria':[{'criteriaName':'Fitting Position','criteriaValue':'Front Axle' if aid=='1' else 'Rear Axle'}]}
                status=503 if config.get('catalog_error') and url.path=='/api/articles' else 200
                with contextlib.suppress(Exception):
                    await route.fulfill(status=status,content_type='application/json',body=json.dumps(data,ensure_ascii=False))
            if memory_mode:
                # A separate DOM-only test: own source + fixtures in about:blank.
                # No navigation to the blocked server and no browser-policy changes.
                await page.route('**/*',lambda r:r.abort())
                await page.expose_function('_record',lambda data:calls.append(data))
            else:
                await page.route('**/*',route_request)
            start=time.monotonic()
            try:
                if memory_mode:
                    html=(ROOT/'index.html').read_text()
                    html=re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S)
                    html=re.sub(r'<link\b[^>]*>', '', html)
                    html=html.replace('</head>', '<style>'+(ROOT/'ui/app.css').read_text()+'</style></head>')
                    await page.set_content(html)
                    # The preference-storage failure is an intentional test condition.
                    if config.get('blocked_storage'):
                        await page.evaluate("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Disabled','SecurityError');}})")
                    await page.evaluate(MOCK_FETCH, {'config':config,'base':BASE,'vinA':VIN_A})
                    chunks=[]
                    for path in ['lib/client-http.js','lib/client-core.js','lib/client-matcher.js','ui/app.js']:
                        source=(ROOT/path).read_text()
                        source=re.sub(r'^import .*?;\s*$', '', source, flags=re.M)
                        source=re.sub(r'^export ', '', source, flags=re.M)
                        chunks.append(source)
                    await page.add_script_tag(content='\n'.join(chunks))
                else:
                    await page.goto(origin)
                await page.wait_for_function("typeof window.start === 'function'")
                await operation(page,calls)
                assert not errors, 'Page errors: '+repr(errors)
                records.append({'name':name,'status':'PASS','elapsedMs':round((time.monotonic()-start)*1000)})
            except Exception as e:
                records.append({'name':name,'status':'FAIL','error':str(e),'pageErrors':errors})
            finally:
                await context.close()
        async def select(page): await page.locator('#file').set_input_files(FILE)
        async def analyzed(page):
            await page.locator('#analyzeBtn').click()
            await page.locator('#result').wait_for(state='visible')
        async def upload(page,calls):
            choosers=[]; page.on('filechooser',lambda c:choosers.append(c))
            async with page.expect_file_chooser() as fc:
                await page.locator('#uploadLabel').click()
            await (await fc.value).set_files(FILE)
            assert len(choosers)==1
            assert 'fixture.png' in await page.locator('#fileText').inner_text()
            await page.locator('#file').dispatch_event('cancel')
            assert await page.locator('#file').evaluate('(e)=>e.files.length')==1
        await scenario('native file picker opens once; cancel preserves selected file',upload)
        async def basic(page,calls):
            await select(page); await analyzed(page)
            assert '115' in await page.locator('#rTotal').inner_text()
            assert not any(c['path'] in ['/api/vin','/api/products'] for c in calls)
            await page.locator('#detailsBtn').click(); assert await page.locator('#itemsBody tr').count()==1
            await page.locator('#backBtn').click(); await page.locator('#workshopBtn').click()
            assert await page.locator('#message').inner_text()==BASE['workshopMessage']
        await scenario('no-VIN analysis, details and workshop message',basic)
        async def vin(page,calls):
            await select(page); await page.locator('#vin').fill(VIN_A); await analyzed(page)
            await page.wait_for_function("document.querySelector('#catalogMatches').textContent.includes('F-1')")
            text=await page.locator('#catalogMatches').inner_text()
            assert 'R-1' not in text
            body=next(c['body'] for c in calls if c['path']=='/api/analyze')
            assert body['vehicle']['make']=='Toyota' and body['vehicle']['year']=='2020'
            assert sum(c['path']=='/api/vin' for c in calls)==1
        await scenario('VIN updates vehicle before payload; front excludes rear; request deduplication',vin)
        async def late_make(page,calls):
            await page.locator('#vin').fill(VIN_A); await page.locator('#vinButton').click()
            await page.wait_for_function("document.querySelector('#make').value==='Toyota'")
            await page.wait_for_timeout(450)
            assert await page.locator('#make').input_value()=='Toyota'
        await scenario('late manufacturer suggestions do not overwrite VIN identity',late_make,{'makes_delay':0.3})
        async def vin_race(page,calls):
            await page.locator('#vin').fill(VIN_A); await page.locator('#vinButton').click()
            await page.wait_for_timeout(35)
            await page.locator('#vin').fill(VIN_B); await page.locator('#vinButton').click()
            await page.wait_for_function("document.querySelector('#make').value==='Ford'")
            await page.wait_for_timeout(350)
            assert await page.locator('#make').input_value()=='Ford'
            assert await page.locator('#model').input_value()=='Expedition'
        await scenario('late response from old VIN cannot overwrite new vehicle',vin_race,{'vin_a_delay':0.25,'vin_b_delay':0.01})
        async def invalidation(page,calls):
            await page.locator('#vin').fill(VIN_A); await page.locator('#vinButton').click()
            await page.wait_for_function("document.querySelector('#make').value==='Toyota'")
            await page.locator('#vin').fill('')
            assert await page.locator('#make').input_value()==''
            assert await page.locator('#model').input_value()==''
            await select(page); await analyzed(page)
            assert not any(c['path']=='/api/products' for c in calls)
        await scenario('clearing VIN clears old identity before no-VIN analysis',invalidation)
        async def multiple(page,calls):
            await page.locator('#vin').fill(VIN_A); await page.locator('#vinButton').click()
            await page.locator('#candidateBox').wait_for(state='visible')
            assert await page.locator('#make').input_value()==''
            await page.locator('#vehicleCandidate').select_option('99')
            await select(page); await analyzed(page)
            await page.wait_for_function("document.querySelector('#catalogMatches').textContent.includes('F-1')")
            assert next(c['query']['vehicleId'][0] for c in calls if c['path']=='/api/products')=='99'
        await scenario('ambiguous VIN requires explicit variant selection',multiple,{'multiple':True})
        async def deselect_variant(page,calls):
            await page.locator('#vin').fill(VIN_A); await page.locator('#vinButton').click()
            await page.locator('#candidateBox').wait_for(state='visible')
            await page.locator('#vehicleCandidate').select_option('99')
            assert await page.locator('#make').input_value()=='Toyota'
            await page.locator('#vehicleCandidate').select_option('')
            assert await page.locator('#make').input_value()==''
            await select(page); await analyzed(page)
            assert not any(c['path']=='/api/products' for c in calls)
        await scenario('deselecting VIN variant removes its catalog identity',deselect_variant,{'multiple':True})
        async def multiple_none(page,calls):
            await page.locator('#vin').fill(VIN_A); await page.locator('#vinButton').click(); await page.locator('#candidateBox').wait_for(state='visible')
            await select(page); await analyzed(page)
            assert not any(c['path']=='/api/products' for c in calls)
        await scenario('unselected ambiguous VIN never launches catalog',multiple_none,{'multiple':True})
        async def locale(page,calls):
            await select(page); await page.locator('#localeSelect').select_option('en-SA')
            assert await page.locator('html').get_attribute('dir')=='ltr'
            assert 'fixture.png' in await page.locator('#fileText').inner_text()
            await analyzed(page); await page.locator('#localeSelect').select_option('ar-SA'); await page.locator('#localeSelect').select_option('en-SA')
            assert await page.locator('#detailsBtn').inner_text()=='Line-item details'
            assert sum(c['path']=='/api/analyze' for c in calls)==1
            assert next(c['body']['vehicle']['locale'] for c in calls if c['path']=='/api/analyze')=='en-SA'
        await scenario('language switch preserves file and works after dynamic results',locale)
        async def storage(page,calls):
            await page.locator('#localeSelect').select_option('en-SA'); await select(page); await analyzed(page)
            assert await page.locator('#result').is_visible()
        await scenario('blocked localStorage cannot break startup or analysis',storage,{'blocked_storage':True})
        async def reset(page,calls):
            await select(page); await analyzed(page); await page.locator('#newAnalysisBtn').click()
            assert await page.locator('#home').is_visible()
            assert await page.locator('#file').evaluate('(e)=>e.files.length')==0
            assert await page.locator('#catalogMatches').inner_text()==''
            await select(page); await analyzed(page)
            assert sum(c['path']=='/api/analyze' for c in calls)==2
        await scenario('reset and second analysis without parse/runtime errors',reset)
        async def cancel(page,calls):
            await select(page); await page.locator('#analyzeBtn').click(); await page.wait_for_timeout(50)
            await page.locator('#cancelBtn').click(); await select(page); await analyzed(page); await page.wait_for_timeout(400)
            d=json.loads(await page.locator('#diagnostics').text_content())
            assert d['requestId']=='fixture-2'
        await scenario('canceled old analysis cannot overwrite the next result',cancel,{'first_analysis_delay':0.3})
        async def reset_catalog(page,calls):
            await select(page); await page.locator('#vin').fill(VIN_A); await analyzed(page)
            await page.locator('#newAnalysisBtn').click(); await select(page); await analyzed(page); await page.wait_for_timeout(400)
            assert await page.locator('#catalogMatches').inner_text()==''
            assert json.loads(await page.locator('#diagnostics').text_content())['catalog']['status']=='NOT_APPLICABLE'
        await scenario('late catalog results cannot cross analysis reset',reset_catalog,{'products_delay':0.3})
        async def invalid_response(page,calls):
            await select(page); await page.locator('#analyzeBtn').click(); await page.locator('#homeError').wait_for(state='visible')
            assert not await page.locator('#result').is_visible()
            assert not await page.locator('#analyzeBtn').is_disabled()
        malformed=copy.deepcopy(BASE);malformed['items']=[None]
        await scenario('malformed analysis response fails safely',invalid_response,{'analysis':malformed})
        async def zero(page,calls):
            await select(page); await analyzed(page); assert await page.locator('#rTransparency').inner_text()=='0/100'
        zeros=copy.deepcopy(BASE)
        for key in ['transparency','identityConfidence','compatibilityConfidence','priceConfidence','overallConfidence']: zeros[key]=0
        await scenario('valid zero confidence result is not a test failure',zero,{'analysis':zeros})
        async def failures(page,calls):
            await select(page); await page.locator('#vin').fill(VIN_A); await analyzed(page)
            await page.wait_for_function("document.querySelector('#diagnostics').textContent.includes('PARTIAL')")
            assert '115' in await page.locator('#rTotal').inner_text()
            assert 'F-1' not in await page.locator('#catalogMatches').inner_text()
        await scenario('catalog failure preserves document result without false candidates',failures,{'catalog_error':True})
        async def reject(page,calls):
            await page.locator('#file').set_input_files({'name':'large.png','mimeType':'image/png','buffer':b'x'*(3*1024*1024+1)})
            assert await page.locator('#homeError').is_visible()
            assert await page.locator('#file').evaluate('(e)=>e.files.length')==0
            assert not any(c['path']=='/api/analyze' for c in calls)
        await scenario('oversized upload rejected before API request',reject)
        async def pdf(page,calls):
            await page.locator('#file').set_input_files({'name':'fixture.pdf','mimeType':'','buffer':b'%PDF-1.4\n% Mock upload fixture; not an OCR test.'})
            await analyzed(page)
            assert next(c['body']['mimeType'] for c in calls if c['path']=='/api/analyze')=='application/pdf'
        await scenario('PDF request construction when browser omits MIME',pdf)
        async def injection(page,calls):
            await select(page); await analyzed(page)
            assert not await page.evaluate('Boolean(window.injected)')
            assert await page.locator('#rAlerts img').count()==0
        injected=copy.deepcopy(BASE);injected['missing']=['<img src=x onerror="window.injected=true">']
        await scenario('extracted HTML is displayed as text, never executed',injection,{'analysis':injected})
        async def share(page,calls):
            await page.evaluate('navigator.share=async(data)=>{window.shared=data;}')
            await select(page); await page.locator('#vin').fill(VIN_A); await analyzed(page); await page.locator('#shareSummaryBtn').click()
            text=await page.evaluate('window.shared.text'); assert VIN_A not in text and 'fixture.png' not in text
        await scenario('shared summary excludes raw VIN and uploaded file',share)
        async def desktop(page,calls):
            await select(page); await analyzed(page)
            assert await page.locator('#result').is_visible()
            output=ROOT.parent/'results';output.mkdir(exist_ok=True)
            await page.screenshot(path=str(output/'desktop-result.png'),full_page=True)
        await scenario('desktop layout and complete flow',desktop,viewport={'width':1280,'height':900})
        async def mobile(page,calls):
            await page.locator('#localeSelect').select_option('en-SA'); await select(page); await analyzed(page)
            assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
            output=ROOT.parent/'results';output.mkdir(exist_ok=True)
            await page.screenshot(path=str(output/'mobile-result.png'),full_page=True)
        await scenario('narrow English layout has no page overflow',mobile,viewport={'width':340,'height':760})
        await browser.close()
    server.shutdown()
    result={'providerMode':'MOCKED / NO EXTERNAL CALLS', 'browser':'Chromium', 'mode':'IN_MEMORY_DOM' if memory_mode else 'LOCAL_HTTP', 'passed':sum(x['status']=='PASS' for x in records),'failed':sum(x['status']=='FAIL' for x in records),'tests':records}
    output=ROOT.parent/'results'; output.mkdir(exist_ok=True); (output/'browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return result['failed']


# Fixtures run inside the page, replacing fetch entirely; there is no network transport.
MOCK_FETCH = r"""({config,base,vinA}) => {
  window.__calls=[];
  window.fetch=async(input,options={})=>{
    const url=new URL(String(input),'https://fixture.invalid');
    if(!url.pathname.startsWith('/api/'))throw Error('Unexpected non-mock request');
    const body=options.body?JSON.parse(options.body):null;
    const query={};for(const [k,v] of url.searchParams)query[k]=[v];
    const call={path:url.pathname,query,body};window.__calls.push(call);await window._record(call);
    const count=window.__calls.filter(c=>c.path==='/api/analyze').length;
    let data,delay=0,status=200;
    if(url.pathname==='/api/health')data={status:'ready',configured:{analysis:true,catalog:true}};
    else if(url.pathname==='/api/vehicles'){
      delay=config.makes_delay||0;data={manufacturers:[{manufacturerId:1,manufacturerName:'Ford'},{manufacturerId:2,manufacturerName:'Toyota'}]};
    }else if(url.pathname==='/api/vin'){
      const vin=url.searchParams.get('vin'),a=vin===vinA,name=a?'Toyota':'Ford',model=a?'Camry':'Expedition';
      delay=a?(config.vin_a_delay||0):(config.vin_b_delay||0);
      const vehicles=[{vehicleId:a?42:43,manufacturerId:a?2:1,modelId:10,year:2020,modelName:model,vehicleTypeDescription:'Test variant'}];
      if(config.multiple)vehicles.push({...vehicles[0],vehicleId:99,vehicleTypeDescription:'Second variant'});
      data={data:{matchingManufacturers:{array:[{manufacturerId:a?2:1,manufacturerName:name}]},matchingModels:{array:[{modelId:10,modelName:model}]},matchingVehicles:{array:vehicles}}};
    }else if(url.pathname==='/api/analyze'){
      delay=count===1?(config.first_analysis_delay||0):0;
      data=JSON.parse(JSON.stringify(config.analysis||base));data.requestId='fixture-'+count;data.engineContext=body.vehicle;
    }else if(url.pathname==='/api/products'){
      delay=config.products_delay||0;data={products:[{productId:5,productName:'Brake pad set'}]};
    }else if(url.pathname==='/api/articles'){
      status=config.catalog_error?503:200;
      data={articles:[{articleId:1,articleNo:'F-1',supplierName:'A'},{articleId:2,articleNo:'R-1',supplierName:'B'}]};
    }else data={criteria:[{criteriaName:'Fitting Position',criteriaValue:url.searchParams.get('articleId')==='1'?'Front Axle':'Rear Axle'}]};
    // Deliberately ignore cancellation here: last-run guards must still reject late results.
    if(delay)await new Promise(resolve=>setTimeout(resolve,delay*1000));
    return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  };
}"""

if __name__=='__main__':
    raise SystemExit(asyncio.run(run()))
