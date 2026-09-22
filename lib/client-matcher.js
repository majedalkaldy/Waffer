import { requestJSON } from './client-http.js';
import { arrayAt, articleKey, criteriaAxle, idOf, lineType, matchProduct, requestedAxle, shortlist, validVIN } from './client-core.js';

/** Pure orchestration: callers own state, and canceled jobs never publish global events. */
export async function matchCatalog({ items = [], vehicle, context = {}, signal, fetchImpl,
  totalTimeoutMs = 30000, requestTimeoutMs = 9000, criteriaLimit = 12 } = {}) {
  const started = Date.now();
  const results = (Array.isArray(items) ? items : []).map((item, index) => ({
    index, workshopItem: String(item?.name || item?.description || ''),
    status: lineType(item) === 'part' ? 'PENDING' : 'SKIPPED',
    productId: null, productName: null, requestedAxle: requestedAxle(item?.name),
    articles: [], inspected: 0, available: 0, axleVerified: 0
  }));
  const report = status => ({ status, results, elapsedMs: Date.now() - started,
    partItems: results.filter(x => x.status !== 'SKIPPED').length,
    productTypesMatched: results.filter(x => x.productId !== null).length,
    itemsWithCandidates: results.filter(x => x.articles.length > 0).length });
  if (!vehicle || !idOf(vehicle.vehicleId) || !validVIN(vehicle.vin)) {
    results.forEach(row => { if (row.status === 'PENDING') row.status = 'NOT_APPLICABLE'; });
    return report('NOT_APPLICABLE');
  }
  if (!results.some(x => x.status === 'PENDING')) return report('NO_PART_ITEMS');
  if (context.market && context.market !== 'SA') return report('UNSUPPORTED_MARKET');
  const controller = new AbortController();
  let timedOut = false, failed = false;
  const relay = () => controller.abort();
  if (signal?.aborted) relay(); else signal?.addEventListener('abort', relay, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, totalTimeoutMs);
  const requests = new Map();
  const query = { market: context.market || 'SA' }; // Provider IDs remain server-configured.
  const get = (path, params) => {
    const url = path + '?' + new URLSearchParams({ ...query, ...params });
    if (!requests.has(url)) requests.set(url, requestJSON(url, {
      fetchImpl, signal: controller.signal, timeoutMs: requestTimeoutMs
    }));
    return requests.get(url);
  };
  try {
    const products = arrayAt(await get('/api/products', { vehicleId: vehicle.vehicleId }), 'products');
    for (let i = 0; i < results.length; i += 1) {
      const row = results[i];
      if (controller.signal.aborted) break;
      if (row.status === 'SKIPPED') continue;
      const product = matchProduct(items[i], products);
      if (!product) { row.status = 'NO_PRODUCT_MATCH'; continue; }
      row.productId = idOf(product.productId); row.productName = String(product.productName || '');
      if (row.requestedAxle === 'ambiguous') { row.status = 'POSITION_AMBIGUOUS'; continue; }
      try {
        const articles = arrayAt(await get('/api/articles', {
          vehicleId: vehicle.vehicleId, productId: row.productId
        }), 'articles');
        row.available = articles.length;
        if (!row.requestedAxle) {
          row.articles = shortlist(articles); row.status = row.articles.length ? 'CANDIDATES' : 'NO_ARTICLES';
          continue;
        }
        // A bounded sample is NOT the entire catalog, and missing evidence is not success.
        const unique = new Map();
        for (const article of articles) { const key = articleKey(article); if (key && !unique.has(key)) unique.set(key, article); }
        const sample = [...unique.values()].slice(0, Math.min(12, Math.max(0, criteriaLimit)));
        const checked = new Array(sample.length); let next = 0, criteriaFailed = false;
        async function worker() {
          while (next < sample.length && !controller.signal.aborted) {
            const n = next++, a = sample[n], articleId = idOf(a.articleId || a.id);
            let position = criteriaAxle(a.criteria);
            try {
              if (!position && articleId) {
                position = criteriaAxle(arrayAt(await get('/api/article-criteria', { articleId }), 'criteria'));
              }
              checked[n] = { article: a, position }; row.inspected += 1;
            } catch (error) {
              if (!controller.signal.aborted) { criteriaFailed = true; failed = true; row.errorCode = error.code || 'CRITERIA_ERROR'; }
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(3, sample.length) }, worker));
        const verified = checked.filter(x => x && x.position === row.requestedAxle)
          .map(x => ({ ...x.article, axleVerified: true, fittingPosition: x.position }));
        row.axleVerified = verified.length;
        row.articles = shortlist(verified);
        row.status = criteriaFailed ? 'PARTIAL' : verified.length ? 'AXLE_CANDIDATES' : 'NO_POSITION_EVIDENCE';
      } catch (error) {
        if (!controller.signal.aborted) { failed = true; row.status = 'ERROR'; row.errorCode = error.code || 'CATALOG_ERROR'; }
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) { failed = true; results.forEach(x => { if (x.status === 'PENDING') { x.status = 'ERROR'; x.errorCode = error.code || 'CATALOG_ERROR'; } }); }
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', relay);
  }
  const status = signal?.aborted ? 'CANCELED' : timedOut ? 'TIMED_OUT' : failed ? 'PARTIAL' : 'COMPLETED';
  for (const row of results) if (row.status === 'PENDING') row.status = status;
  return report(status);
}
