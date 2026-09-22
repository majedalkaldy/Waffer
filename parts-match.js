import { arrayAt, fetchJSON, list, mapLimit, RequestError, text } from './lib/client-core.js?v=20260922-stability';

export const norm = value => text(value).normalize('NFKC').toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
const includesWords = (value, query) => (' ' + norm(value) + ' ').includes(' ' + norm(query) + ' ');
const TYPES = [
  ['brake_disc','brake disc',['قرص فرامل','اقراص فرامل','هوب فرامل','هوبات','brake disc','brake rotor']],
  ['brake_pad','brake pad',['فحمة فرامل','فحمات فرامل','فحمات','تيل فرامل','brake pad','brake pads','brake pad set']],
  ['cabin_filter','cabin air filter',['فلتر مكيف','فلتر تكييف','ac filter','cabin filter','cabin air filter']],
  ['air_filter','air filter',['فلتر هواء','air filter']],
  ['oil_filter','oil filter',['فلتر زيت','oil filter']],
  ['fuel_filter','fuel filter',['فلتر وقود','فلتر بنزين','fuel filter']],
  ['spark_plug','spark plug',['بواجي','شمعة احتراق','شمعات احتراق','spark plug']],
  ['shock_absorber','shock absorber',['مساعد','مساعدات','shock absorber']],
  ['belt','v belt',['سير مكينة','سير محرك','سير دينمو','v belt']],
  ['water_pump','water pump',['طرمبة ماء','مضخة ماء','water pump']],
  ['radiator','radiator',['رديتر','راديتر','radiator']],
  ['alternator','alternator',['دينمو','مولد','alternator']],
  ['starter','starter',['سلف','بادئ حركة','starter']],
  ['clutch_disc','clutch disc',['كلتش','ديسك كلتش','clutch disc']],
  ['brake_fluid','brake fluid',['سائل فرامل','زيت فرامل','brake fluid']],
  ['control_arm','track control arm',['ذراع تحكم','مقص','مقصات','control arm','track control arm']],
  ['tie_rod_end','tie rod end',['تي رود','طرف دركسون','طرف توجيه','tie rod end','track rod end']],
  ['wheel_bearing','wheel bearing',['رمان بلي','رمان عجل','wheel bearing','wheel hub bearing']],
  ['thermostat','thermostat',['ثرموستات','بلف حرارة','thermostat']]
];
const ACCESSORIES = ['accessory kit','repair kit','fitting kit','mounting kit','wear indicator','warning contact','brake pad wear'];

export function classify(name) {
  const candidates = TYPES.flatMap(([type, product, aliases]) => aliases
    .filter(alias => includesWords(name, alias)).map(alias => ({ type, product, length: norm(alias).length })));
  candidates.sort((a,b) => b.length - a.length);
  return candidates[0] || { type: 'unknown', product: text(name) };
}
export function requestedAxle(name) {
  const value = norm(name);
  const front = /(^|\s)(front|امامي\S*)(\s|$)/u.test(value);
  const rear = /(^|\s)(rear|خلفي\S*)(\s|$)/u.test(value);
  return front && rear ? 'both' : front ? 'front' : rear ? 'rear' : null;
}
export function bestProduct(name, products) {
  const wanted = classify(name);
  const ranked = list(products).filter(product => /^\d+$/.test(String(product?.productId ?? '')))
    .map(product => {
      const candidate = norm(product.productName);
      let similarity = candidate === norm(wanted.product) ? 100
        : wanted.type !== 'unknown' && classify(product.productName).type === wanted.type ? 92 : 0;
      if (ACCESSORIES.some(word => includesWords(candidate, word))) similarity = 0;
      return { ...product, requestedType: wanted.type, matchScore: similarity };
    }).filter(product => product.matchScore >= 90).sort((a,b) => b.matchScore - a.matchScore);
  return ranked[0] || null;
}
export function articleKey(article) {
  const number = norm(article?.articleNo || article?.articleNumber);
  const supplier = norm(article?.supplierName || article?.brandName || article?.manufacturerName || String(article?.supplierId ?? ''));
  return number && supplier ? supplier + '|' + number
    : article?.articleId != null ? 'id:' + article.articleId
    : article?.id != null ? 'id:' + article.id : number ? 'unknown:' + number : '';
}
export function shortlistArticles(articles, limit = 3) {
  const unique = new Map();
  for (const article of list(articles)) {
    const key = articleKey(article);
    if (key && !unique.has(key)) unique.set(key, article);
  }
  const chosen = [], chosenKeys = new Set(), suppliers = new Set();
  const append = (key, article) => { chosen.push(article); chosenKeys.add(key); };
  for (const [key, article] of unique) {
    const supplier = norm(article.supplierName || article.brandName || article.manufacturerName || String(article.supplierId ?? ''));
    if (!suppliers.has(supplier)) { append(key, article); suppliers.add(supplier); }
    if (chosen.length >= limit) return chosen;
  }
  for (const [key, article] of unique) {
    if (!chosenKeys.has(key)) append(key, article);
    if (chosen.length >= limit) break;
  }
  return chosen;
}
export function criteriaPositions(data) {
  const rows = arrayAt(data, ['criteria','criteria.array','array','data.criteria','data.criteria.array']);
  const positions = new Set();
  for (const row of rows) {
    const label = norm(row?.criteriaName || row?.name);
    if (!label.includes('fitting position')) continue;
    const value = norm(row?.criteriaValue || row?.value);
    if (/(^|\s)front(\s|$)/.test(value)) positions.add('front');
    if (/(^|\s)rear(\s|$)/.test(value)) positions.add('rear');
  }
  return positions;
}

// Pure per-run state: no mutable window globals and no events from an older run.
export async function matchParts(analysis, vehicleId, config, options = {}) {
  const { signal, timeoutMs = 30000, request = fetchJSON } = options;
  const items = list(analysis?.items);
  const output = items.map((item,index) => ({ index, workshopItem: text(item?.name), productId: null,
    status: item?.itemType && item.itemType !== 'part' ? 'SKIPPED' : 'PENDING', articles: [] }));
  const partCount = output.filter(item => item.status !== 'SKIPPED').length;
  const summary = (status, elapsedMs = 0) => ({ status, elapsedMs, totalItems: items.length, partItems: partCount,
    categoryMatched: output.filter(item => item.productId != null).length,
    candidateLines: output.filter(item => item.articles.length > 0).length,
    matches: output });
  if (!vehicleId) return summary('NOT_REQUESTED');
  if (!partCount) return summary('NOT_APPLICABLE');
  if (!config?.supported) throw new RequestError('UNSUPPORTED_MARKET');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const started = Date.now();
  const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
  const memo = new Map();
  const get = (path, params, timeout = 10000) => {
    const query = new URLSearchParams({ ...params, market: config.market,
      langId: String(config.catalog.langId), countryFilterId: String(config.catalog.countryFilterId) });
    const key = path + '?' + query;
    if (!memo.has(key)) memo.set(key, request(key, { signal: controller.signal, timeoutMs: timeout }));
    return memo.get(key);
  };
  try {
    const data = await get('/api/products', { vehicleId: String(vehicleId) }, 12000);
    if (!Array.isArray(data) && !Array.isArray(data?.products) && !Array.isArray(data?.products?.array)) throw new RequestError('INVALID_RESPONSE');
    const products = arrayAt(data, ['products','products.array']);
    await mapLimit(items, 2, async (item, index) => {
      const result = output[index];
      if (result.status === 'SKIPPED') return;
      if (controller.signal.aborted) { result.status = timedOut ? 'TIMEOUT' : 'CANCELLED'; return; }
      const product = bestProduct(item.name, products);
      if (!product) { result.status = 'NO_CATEGORY_MATCH'; return; }
      Object.assign(result, { productId: product.productId, productName: product.productName,
        requestedType: product.requestedType, matchScore: product.matchScore, requestedAxle: requestedAxle(item.name) });
      if (result.requestedAxle === 'both') { result.status = 'POSITION_AMBIGUOUS'; return; }
      try {
        const data = await get('/api/articles', { vehicleId: String(vehicleId), productId: String(product.productId) });
        if (!Array.isArray(data) && !Array.isArray(data?.articles) && !Array.isArray(data?.articles?.array)) throw new RequestError('INVALID_RESPONSE');
        const articles = arrayAt(data, ['articles','articles.array']);
        result.totalCatalogArticles = articles.length;
        let candidates = articles;
        result.criteriaChecked = 0;
        result.criteriaErrors = 0;
        if (result.requestedAxle) {
          const inspected = await mapLimit(articles.slice(0, 10), 3, async article => {
            if (controller.signal.aborted) return null;
            const id = article?.articleId ?? article?.id;
            if (id == null) return null;
            try {
              const criteria = await get('/api/article-criteria', { articleId: String(id) }, 6000);
              result.criteriaChecked++;
              return criteriaPositions(criteria).has(result.requestedAxle)
                ? { ...article, axleVerified: true, fittingPosition: result.requestedAxle } : null;
            } catch { result.criteriaErrors++; return null; }
          });
          candidates = inspected.filter(Boolean);
          result.verifiedByAxle = candidates.length;
          result.sampleLimited = articles.length > 10;
        }
        result.articles = shortlistArticles(candidates, 3);
        result.status = controller.signal.aborted ? (timedOut ? 'TIMEOUT' : 'CANCELLED')
          : result.articles.length ? 'CANDIDATES'
          : result.requestedAxle && articles.length ? 'POSITION_UNVERIFIED' : 'NO_ARTICLES';
      } catch (error) {
        result.status = controller.signal.aborted ? (timedOut ? 'TIMEOUT' : 'CANCELLED') : 'ERROR';
        result.errorCode = error?.code || 'REQUEST_FAILED';
      }
    });
    return summary(timedOut ? 'TIMED_OUT' : signal?.aborted ? 'CANCELLED'
      : output.some(item => item.status === 'ERROR' || item.criteriaErrors > 0) ? 'PARTIAL' : 'COMPLETED', Date.now() - started);
  } catch (error) {
    for (const result of output) if (result.status === 'PENDING') result.status = timedOut ? 'TIMEOUT' : 'ERROR';
    return { ...summary(timedOut ? 'TIMED_OUT' : signal?.aborted ? 'CANCELLED' : 'FAILED', Date.now() - started), errorCode: error?.code || 'REQUEST_FAILED' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
