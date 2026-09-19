(function(){
  function norm(s){
    return String(s||'')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu,' ')
      .trim();
  }

  function score(a,b){
    a=norm(a); b=norm(b);
    if(!a||!b) return 0;
    if(a===b) return 100;
    if(a.includes(b)||b.includes(a)) return 80;

    const A=new Set(a.split(' '));
    const B=new Set(b.split(' '));
    let n=0;
    A.forEach(x=>{if(B.has(x)) n++;});
    return n/Math.max(A.size,B.size)*70;
  }

  async function loadProducts(vehicleId){
    const r=await fetch('/api/products?vehicleId='+encodeURIComponent(vehicleId));
    if(!r.ok) throw new Error('Products API '+r.status);
    const d=await r.json();
    return Array.isArray(d.products)?d.products:[];
  }

  function bestProduct(name,products){
    let best=null,bestScore=0;

    for(const p of products){
      const s=score(name,p.productName);
      if(s>bestScore){
        best=p;
        bestScore=s;
      }
    }

    return bestScore>=35
      ? {...best,matchScore:Math.round(bestScore)}
      : null;
  }

  async function matchWafferParts(){
    if(!window.analysis || !window.wafferVehicleId) return [];

    const products=await loadProducts(window.wafferVehicleId);
    const items=Array.isArray(window.analysis.items)
      ? window.analysis.items
      : [];

    const matches=items.map(item=>({
      workshopItem:item.name||'',
      match:bestProduct(item.name,products)
    }));

    window.wafferPartMatches=matches;
    return matches;
  }

  window.matchWafferParts=matchWafferParts;
})();
