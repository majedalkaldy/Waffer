import { arrayAt, fetchJSON, RequestError, text, VIN_PATTERN } from './lib/client-core.js?v=20260922-stability';

const pick = (row, keys) => keys.map(key => row?.[key]).find(value => value !== undefined && value !== null && value !== '');
const byIdOrOnly = (rows, id, keys) => id != null
  ? rows.find(row => String(pick(row, keys) ?? '') === String(id))
  : rows.length === 1 ? rows[0] : undefined;

// This resolves catalog candidates, not proof of physical fitment or OEM identity.
export function readVinCandidates(data, vin) {
  const get = key => arrayAt(data, ['data.'+key+'.array', key+'.array', 'data.'+key, key]);
  const manufacturers = get('matchingManufacturers');
  const models = get('matchingModels');
  const vehicles = get('matchingVehicles');
  const unique = new Map();
  for (const vehicle of vehicles) {
    const vehicleId = String(pick(vehicle, ['vehicleId','carId','id']) ?? '');
    if (!/^\d+$/.test(vehicleId)) continue;
    const modelId = pick(vehicle, ['modelId']);
    const manufacturerId = pick(vehicle, ['manuId','manufacturerId']);
    const manufacturer = byIdOrOnly(manufacturers, manufacturerId, ['manuId','manufacturerId','id']);
    const model = byIdOrOnly(models, modelId, ['modelId','id']);
    const year = String(pick(vehicle, ['year','constructionYear','yearOfConstruction']) ?? data?.data?.year ?? '');
    unique.set(vehicleId, {
      vin, vehicleId,
      modelId: String(modelId ?? pick(model, ['modelId','id']) ?? ''),
      manufacturerId: String(manufacturerId ?? pick(manufacturer, ['manuId','manufacturerId','id']) ?? ''),
      manufacturerName: text(pick(manufacturer, ['manuName','manufacturerName','name']) ?? pick(vehicle, ['manufacturerName','manuName'])),
      modelName: text(pick(model, ['modelName','name']) ?? pick(vehicle, ['modelName'])),
      vehicleDescription: text(pick(vehicle, ['vehicleTypeDescription','typeName','description'])),
      year: /^\d{4}$/.test(year) ? year : ''
    });
  }
  return [...unique.values()];
}

export function createVinResolver({ request = fetchJSON, onUpdate = () => {} } = {}) {
  let sequence = 0, currentVin = '', cached = null, pending = null, controller = null;
  const clear = () => {
    sequence++;
    controller?.abort();
    controller = null;
    currentVin = '';
    cached = null;
    pending = null;
  };
  const resolve = value => {
    const vin = text(value).trim().toUpperCase();
    if (!VIN_PATTERN.test(vin)) { clear(); return Promise.reject(new RequestError('VIN_INVALID')); }
    if (vin === currentVin && cached) return Promise.resolve(cached);
    if (vin === currentVin && pending) return pending;
    clear();
    currentVin = vin;
    controller = new AbortController();
    const ownController = controller, ownSequence = sequence;
    pending = (async () => {
      const result = await request('/api/vin?vin='+encodeURIComponent(vin), { signal: ownController.signal, timeoutMs: 12000 });
      if (ownSequence !== sequence || ownController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const candidates = readVinCandidates(result, vin);
      cached = { vin, candidates, selected: candidates.length === 1 ? candidates[0] : null };
      onUpdate(cached);
      return cached;
    })().finally(() => { if (ownSequence === sequence) pending = null; });
    return pending;
  };
  return { clear, resolve };
}
