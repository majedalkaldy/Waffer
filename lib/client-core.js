export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const normalVIN = value => String(value ?? '').trim().toUpperCase();
export const validVIN = value => /^[A-HJ-NPR-Z0-9]{17}$/.test(normalVIN(value));
export const idOf = value => /^(?!0+$)\d{1,16}$/.test(String(value ?? '')) ? String(value) : null;
export const norm = value => String(value ?? '').normalize('NFKC').toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
const has = (text, word) => (' ' + norm(text) + ' ').includes(' ' + norm(word) + ' ');

export function validateFile(file) {
  if (!file) return { code: 'NO_FILE' };
  if (!Number.isFinite(file.size) || file.size <= 0) return { code: 'EMPTY_FILE' };
  if (file.size > MAX_UPLOAD_BYTES) return { code: 'FILE_TOO_LARGE' };
  const suffix = String(file.name ?? '').split('.').pop().toLowerCase();
  const inferred = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }[suffix];
  const mimeType = String(file.type || inferred || '').toLowerCase();
  if (!MIME_TYPES.includes(mimeType)) return { code: 'UNSUPPORTED_FILE' };
  return { code: null, mimeType };
}

export function arrayAt(data, key) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.[key]?.array)) return data[key].array;
  if (Array.isArray(data?.data?.[key])) return data.data[key];
  if (Array.isArray(data?.data?.[key]?.array)) return data.data[key].array;
  throw Object.assign(new Error('Unexpected catalog structure'), { code: 'INVALID_RESPONSE' });
}
const optionalArray = (data, key) => { try { return arrayAt(data, key); } catch { return []; } };
const pick = (obj, keys) => keys.map(k => obj?.[k]).find(v => v !== null && v !== undefined && v !== '');

export function vehicleCandidates(data) {
  if (!isRecord(data)) throw Object.assign(new Error('Invalid VIN response'), { code: 'INVALID_RESPONSE' });
  const makes = optionalArray(data, 'matchingManufacturers');
  const models = optionalArray(data, 'matchingModels');
  const raw = optionalArray(data, 'matchingVehicles');
  const seen = new Set();
  return raw.filter(isRecord).flatMap(v => {
    const vehicleId = idOf(pick(v, ['vehicleId', 'carId', 'id']));
    if (!vehicleId || seen.has(vehicleId)) return [];
    seen.add(vehicleId);
    const makeId = idOf(pick(v, ['manufacturerId', 'manuId']));
    const modelId = idOf(v.modelId);
    const matchingModel = models.find(m => idOf(pick(m, ['modelId', 'id'])) === modelId);
    const model = matchingModel || (!modelId && models.length === 1 ? models[0] : {});
    const matchingMake = makes.find(m => idOf(pick(m, ['manufacturerId', 'manuId', 'id'])) === makeId);
    const make = matchingMake || (!makeId && makes.length === 1 ? makes[0] : {});
    const year = String(pick(v, ['year', 'constructionYear', 'yearOfConstruction']) ?? data?.data?.year ?? '');
    return [{
      vehicleId,
      manufacturerId: makeId || idOf(pick(make, ['manufacturerId', 'manuId', 'id'])),
      manufacturerName: String(pick(v, ['manufacturerName', 'manuName']) ?? pick(make, ['manufacturerName', 'manuName', 'name']) ?? ''),
      modelName: String(v.modelName || pick(model, ['modelName', 'name']) || ''),
      modelId: modelId || idOf(pick(model, ['modelId', 'id'])),
      description: String(pick(v, ['vehicleTypeDescription', 'typeName', 'description']) ?? ''),
      year: /^\d{4}$/.test(year) ? year : ''
    }];
  });
}

const definitions = [
  ['brake_pad', ['فحمات', 'فحمة فرامل', 'فحمات فرامل', 'تيل فرامل', 'brake pad', 'brake pads', 'brake pad set']],
  ['brake_disc', ['هوبات', 'هوب فرامل', 'قرص فرامل', 'اقراص فرامل', 'brake disc', 'brake discs', 'brake rotor', 'brake rotors']],
  ['cabin_filter', ['فلتر مكيف', 'فلتر تكييف', 'cabin filter', 'cabin air filter', 'filter interior air']],
  ['air_filter', ['فلتر هواء', 'air filter']],
  ['oil_filter', ['فلتر زيت', 'oil filter']],
  ['fuel_filter', ['فلتر وقود', 'فلتر بنزين', 'fuel filter']],
  ['spark_plug', ['بواجي', 'شمعة احتراق', 'شمعات احتراق', 'spark plug', 'spark plugs']],
  ['shock_absorber', ['مساعد', 'مساعدات', 'shock absorber']],
  ['belt', ['سير مكينة', 'سير محرك', 'سير دينمو', 'v belt', 'v ribbed belt']],
  ['water_pump', ['طرمبة ماء', 'مضخة ماء', 'water pump']],
  ['radiator', ['رديتر', 'راديتر', 'radiator']],
  ['alternator', ['دينمو', 'مولد', 'alternator']],
  ['starter', ['سلف', 'بادئ حركة', 'starter']],
  ['clutch_disc', ['كلتش', 'ديسك كلتش', 'clutch disc']],
  ['brake_fluid', ['سائل فرامل', 'زيت فرامل', 'brake fluid']],
  ['engine_oil', ['زيت محرك', 'زيت مكينة', 'engine oil']],
  ['control_arm', ['ذراع تحكم', 'مقص', 'مقصات', 'control arm', 'track control arm']],
  ['tie_rod_end', ['تي رود', 'طرف دركسون', 'طرف توجيه', 'tie rod end', 'track rod end']],
  ['wheel_bearing', ['رمان بلي', 'رمان عجل', 'wheel bearing', 'wheel hub bearing']],
  ['thermostat', ['ثرموستات', 'بلف حرارة', 'thermostat']]
];
const accessoryTerms = ['accessory kit', 'repair kit', 'fitting kit', 'mounting kit', 'wear indicator', 'warning contact', 'brake pad wear', 'حساس تآكل', 'طقم اصلاح'];
export function classifyPart(name) {
  if (accessoryTerms.some(w => has(name, w))) return 'unknown';
  const found = definitions.find(([, words]) => words.some(w => has(name, w)));
  return found?.[0] || 'unknown';
}
export function requestedAxle(name) {
  const tokens = norm(name).split(' ');
  const front = has(name, 'front') || tokens.some(w => /^(?:و)?(?:ال)?امامي(?:ة)?$/.test(w));
  const rear = has(name, 'rear') || tokens.some(w => /^(?:و)?(?:ال)?خلفي(?:ة)?$/.test(w));
  return front && rear ? 'ambiguous' : front ? 'front' : rear ? 'rear' : null;
}
export function criteriaAxle(rows) {
  const values = (Array.isArray(rows) ? rows : []).filter(isRecord)
    .filter(r => ['fitting position', 'موضع التركيب'].some(w => has(r.criteriaName || r.name, w)))
    .map(r => r.criteriaValue || r.value || '');
  return requestedAxle(values.join(' '));
}
export function lineType(item) {
  const name = item?.name || item?.description || '';
  if (['اجرة', 'اجور', 'labor', 'labour', 'installation labor'].some(w => has(name, w))) return 'labor';
  if (['ضبط زوايا', 'wheel alignment', 'ترصيص', 'balancing'].some(w => has(name, w))) return 'service';
  if (['ضريبة', 'vat', 'tax', 'رسوم'].some(w => has(name, w))) return 'fee';
  const type = String(item?.itemType || '').toLowerCase();
  return ['part', 'labor', 'service', 'fee'].includes(type) ? type : 'unknown';
}
export function matchProduct(item, products) {
  const name = String(item?.name || item?.description || '');
  const kind = classifyPart(name);
  return (Array.isArray(products) ? products : []).filter(isRecord).find(product => {
    if (!idOf(product.productId)) return false;
    return kind === 'unknown'
      ? norm(name) !== '' && norm(name) === norm(product.productName)
      : classifyPart(product.productName) === kind;
  }) || null;
}
export function articleKey(a) {
  if (!isRecord(a)) return null;
  // Preserve punctuation: different suppliers may reuse the same part number.
  const number = String(a.articleNo || a.articleNumber || '').trim().toUpperCase();
  const supplier = String(a.supplierId || a.supplierName || a.brandName || a.manufacturerName || '').trim().toUpperCase();
  if (number && supplier) return 'part:' + JSON.stringify([supplier, number]);
  const id = idOf(a.articleId || a.id);
  return id ? 'id:' + id : null;
}
export function shortlist(articles, limit = 3) {
  const boundedLimit = Math.max(0, Math.min(3, Math.floor(Number(limit) || 0)));
  if (!boundedLimit) return [];
  const unique = new Map();
  for (const a of Array.isArray(articles) ? articles : []) {
    const key = articleKey(a);
    if (key && !unique.has(key)) unique.set(key, a);
  }
  const selected = new Set(), suppliers = new Set(), result = [];
  const add = (key, article) => { selected.add(key); result.push({ ...article, qualityStatus: 'UNVERIFIED' }); };
  for (const [key, a] of unique) {
    const supplier = norm(a.supplierName || a.brandName || a.manufacturerName || a.supplierId || '');
    if (suppliers.has(supplier)) continue;
    suppliers.add(supplier); add(key, a);
    if (result.length === boundedLimit) return result;
  }
  for (const [key, a] of unique) {
    if (!selected.has(key)) add(key, a);
    if (result.length === boundedLimit) break;
  }
  return result;
}

/** Validate the received contract, not presence after inventing defaults. Zero is valid. */
export function validateAnalysis(data) {
  const errors = [];
  if (!isRecord(data)) return ['result'];
  for (const key of ['total', 'status']) if (typeof data[key] !== 'string' || !data[key].trim()) errors.push(key);
  for (const key of ['transparency', 'identityConfidence', 'compatibilityConfidence', 'priceConfidence', 'overallConfidence']) {
    if (typeof data[key] !== 'number' || !Number.isFinite(data[key]) || data[key] < 0 || data[key] > 100) errors.push(key);
  }
  for (const key of ['missing', 'conflicts', 'nextActions']) {
    if (!Array.isArray(data[key]) || !data[key].every(x => typeof x === 'string')) errors.push(key);
  }
  if (!Array.isArray(data.items)) errors.push('items');
  else data.items.forEach((item, i) => {
    if (!isRecord(item) || typeof item.name !== 'string' || !item.name.trim()) errors.push('items.' + i);
    else if (!['part', 'labor', 'service', 'fee'].includes(item.itemType)) errors.push('items.' + i + '.itemType');
  });
  if (data.acceptance?.schemaValid === false) errors.push('server.schemaValid');
  return errors;
}
