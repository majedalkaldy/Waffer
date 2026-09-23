const PART_NUMBER_PLACEHOLDER = /(?:غير\s+(?:ظاهر|متوفر|معروف|محدد)|not\s+(?:visible|available|shown|provided)|unknown|unavailable|^n\/?a$|^none$|^null$|^[-—]$)/i;

export function hasUsablePartNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  return !PART_NUMBER_PLACEHOLDER.test(text);
}

export function hasUsableVin(value) {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(String(value ?? '').trim().toUpperCase());
}

export function hasUsableVehicleId(value) {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) && Number(text) > 0;
}

export function hasUsableVehicleIdentity(vehicle = {}) {
  return hasUsableVehicleId(vehicle?.vehicleId) || hasUsableVin(vehicle?.vin);
}
