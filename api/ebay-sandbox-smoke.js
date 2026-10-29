const EBAY_SANDBOX_API='https://api.sandbox.ebay.com';
const EBAY_SCOPE='https://api.ebay.com/oauth/api_scope';
const MARKETPLACE='EBAY_US';

function bool(value){
  return String(value||'').trim().toLowerCase()==='true';
}

async function json(response){
  let payload=null;
  try{payload=await response.json();}catch{}
  return {status:response.status,ok:response.ok,payload};
}

async function applicationToken(){
  const id=String(process.env.EBAY_SANDBOX_CLIENT_ID||'').trim();
  const secret=String(process.env.EBAY_SANDBOX_CLIENT_SECRET||'').trim();
  if(!id||!secret) return {ok:false,code:'SANDBOX_CREDENTIALS_MISSING'};
  const basic=Buffer.from(id+':'+secret).toString('base64');
  const response=await fetch(EBAY_SANDBOX_API+'/identity/v1/oauth2/token',{
    method:'POST',
    headers:{
      Authorization:'Basic '+basic,
      'Content-Type':'application/x-www-form-urlencoded'
    },
    body:new URLSearchParams({
      grant_type:'client_credentials',
      scope:EBAY_SCOPE
    }).toString()
  });
  const result=await json(response);
  const token=String(result.payload?.access_token||'').trim();
  return {
    ok:result.ok&&Boolean(token),
    status:result.status,
    token:result.ok?token:'',
    expiresIn:Number(result.payload?.expires_in)||null,
    error:result.ok?null:(result.payload?.error_description||result.payload?.error||null)
  };
}

async function ebayGet(path,token){
  const response=await fetch(EBAY_SANDBOX_API+path,{
    headers:{
      Authorization:'Bearer '+token,
      'X-EBAY-C-MARKETPLACE-ID':MARKETPLACE,
      Accept:'application/json'
    }
  });
  return json(response);
}

async function ebayPost(path,token,body){
  const response=await fetch(EBAY_SANDBOX_API+path,{
    method:'POST',
    headers:{
      Authorization:'Bearer '+token,
      'X-EBAY-C-MARKETPLACE-ID':MARKETPLACE,
      'Content-Type':'application/json',
      Accept:'application/json'
    },
    body:JSON.stringify(body)
  });
  return json(response);
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'Method not allowed'});
  if(process.env.VERCEL_ENV!=='preview') {
    return res.status(404).json({ok:false,error:'Preview-only smoke endpoint'});
  }
  if(!bool(process.env.EBAY_SANDBOX_SHADOW_ENABLED)) {
    return res.status(503).json({ok:false,error:'Sandbox shadow mode disabled'});
  }

  const report={
    environment:'preview',
    sandbox:true,
    oauth:null,
    taxonomy:null,
    browse:null,
    item:null,
    compatibility:null,
    timestamp:new Date().toISOString()
  };

  try{
    const auth=await applicationToken();
    report.oauth={
      ok:auth.ok,
      status:auth.status||null,
      expiresIn:auth.expiresIn,
      error:auth.error||null
    };
    if(!auth.ok) return res.status(502).json({ok:false,...report});

    const taxonomy=await ebayGet(
      '/commerce/taxonomy/v1/category_tree/100/get_compatibility_properties?category_id=33559',
      auth.token
    );
    report.taxonomy={
      ok:taxonomy.ok,
      status:taxonomy.status,
      propertyNames:Array.isArray(taxonomy.payload?.compatibilityProperties)
        ? taxonomy.payload.compatibilityProperties.map(x=>x?.name).filter(Boolean)
        : [],
      error:taxonomy.ok?null:(taxonomy.payload?.errors?.[0]?.message||taxonomy.payload?.message||null)
    };

    const compatibilityFilter=[
      'Year:2012',
      'Make:Honda',
      'Model:Civic',
      'Trim:EX Sedan 4-Door',
      'Engine:1.8L 1799CC l4 GAS SOHC Naturally Aspirated'
    ].join(';');
    const query=new URLSearchParams({
      q:'brakes',
      category_ids:'33559',
      compatibility_filter:compatibilityFilter,
      limit:'10'
    });
    const browse=await ebayGet('/buy/browse/v1/item_summary/search?'+query.toString(),auth.token);
    const summaries=Array.isArray(browse.payload?.itemSummaries)?browse.payload.itemSummaries:[];
    report.browse={
      ok:browse.ok,
      status:browse.status,
      itemCount:summaries.length,
      total:Number(browse.payload?.total)||0,
      firstItemId:summaries[0]?.itemId||null,
      firstCompatibilityMatch:summaries[0]?.compatibilityMatch||null,
      error:browse.ok?null:(browse.payload?.errors?.[0]?.message||browse.payload?.message||null)
    };

    const itemId=String(summaries[0]?.itemId||'').trim();
    if(itemId){
      let item=await ebayGet('/buy/browse/v1/item/'+encodeURIComponent(itemId),auth.token);
      let resolvedItemId=item.payload?.itemId||itemId;
      let itemLookupMode='REST_ITEM_ID';

      if(!item.ok && item.status===404){
        const legacyItemId=String(itemId).split('|')[1]||'';
        if(legacyItemId){
          const legacyQuery=new URLSearchParams({legacy_item_id:legacyItemId});
          const legacy=await ebayGet(
            '/buy/browse/v1/item/get_item_by_legacy_id?'+legacyQuery.toString(),
            auth.token
          );
          if(legacy.ok){
            item=legacy;
            resolvedItemId=legacy.payload?.itemId||resolvedItemId;
            itemLookupMode='LEGACY_ITEM_ID_FALLBACK';
          }else{
            report.legacyItemFallback={
              ok:false,
              status:legacy.status,
              legacyItemId,
              error:legacy.payload?.errors?.[0]?.message||legacy.payload?.message||null
            };
          }
        }
      }

      report.item={
        ok:item.ok,
        status:item.status,
        lookupMode:itemLookupMode,
        itemId:item.payload?.itemId||resolvedItemId,
        title:item.payload?.title||null,
        categoryId:item.payload?.categoryId||null,
        error:item.ok?null:(item.payload?.errors?.[0]?.message||item.payload?.message||null)
      };

      const compat=await ebayPost(
        '/buy/browse/v1/item/'+encodeURIComponent(resolvedItemId)+'/check_compatibility',
        auth.token,
        {compatibilityProperties:[
          {name:'Year',value:'2012'},
          {name:'Make',value:'Honda'},
          {name:'Model',value:'Civic'},
          {name:'Trim',value:'EX Sedan 4-Door'},
          {name:'Engine',value:'1.8L 1799CC l4 GAS SOHC Naturally Aspirated'}
        ]}
      );
      report.compatibility={
        ok:compat.ok,
        status:compat.status,
        compatibilityStatus:compat.payload?.compatibilityStatus||null,
        error:compat.ok?null:(compat.payload?.errors?.[0]?.message||compat.payload?.message||null)
      };
    }

    const mandatoryOk=
      report.oauth?.ok===true &&
      report.browse?.ok===true;
    const extendedOk=
      mandatoryOk &&
      report.taxonomy?.ok===true &&
      (!report.browse?.itemCount || report.compatibility?.ok===true);

    return res.status(mandatoryOk?200:502).json({
      ok:mandatoryOk,
      extendedOk,
      ...report
    });
  }catch(error){
    return res.status(500).json({
      ok:false,
      ...report,
      unexpectedError:String(error?.message||error)
    });
  }
}
