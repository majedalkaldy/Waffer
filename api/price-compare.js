import { getMarketConfig } from '../lib/market-config.js';
import { hasUsablePartNumber, hasUsableVehicleIdentity } from '../lib/identity.js';

export default async function handler(req, res) {
  res.setHeader('Allow', 'POST');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const {
      partName,
      partNumber,
      workshopPrice,
      quantity = 1,
      vehicle = {},
      market = 'SA',
      locale = 'ar-SA',
      currency = 'SAR'
    } = req.body || {};

    const safePartName = String(partName || '').trim().slice(0, 240);
    const safePartNumber = String(partNumber || '').trim().slice(0, 120);
    if (!safePartName && !safePartNumber) {
      return res.status(400).json({ error: 'يلزم اسم القطعة أو رقم القطعة.', code: 'PART_IDENTITY_REQUIRED' });
    }
    const rawPrice = Number(workshopPrice);
    const priceValid = Number.isFinite(rawPrice) && rawPrice >= 0;
    const price = priceValid ? rawPrice : null;
    const rawQuantity = Number(quantity);
    const quantityValid = Number.isFinite(rawQuantity) && rawQuantity > 0;
    const qty = quantityValid ? rawQuantity : 1;
    const marketConfig = getMarketConfig({ market, locale, currency });
    if (!marketConfig.supported) return res.status(400).json({ error: 'Unsupported market', code: 'UNSUPPORTED_MARKET', requestedMarket: marketConfig.requestedMarket });
    const normalizedMarket = marketConfig.market;
    const normalizedLocale = marketConfig.locale;
    const normalizedCurrency = marketConfig.currency;
    const hasPartIdentity = hasUsablePartNumber(safePartNumber);
    const hasVehicleIdentity = hasUsableVehicleIdentity(vehicle);

    return res.status(200).json({
      context: {
        market: normalizedMarket,
        locale: normalizedLocale,
        currency: normalizedCurrency
      },
      part: {
        name: safePartName || 'غير محدد',
        number: safePartNumber || null,
        quantity: qty
      },
      vehicle: {
        vehicleId: vehicle.vehicleId || null,
        make: vehicle.make || null,
        model: vehicle.model || null,
        year: vehicle.year || null,
        vin: vehicle.vin || null
      },
      workshop: {
        unitPrice: price,
        totalPrice: price !== null && Number.isFinite(price * qty) ? price * qty : null
      },
      inputValidation: {
        workshopPrice: priceValid ? 'VALID' : 'INVALID_OR_MISSING',
        quantity: quantityValid ? 'VALID' : 'DEFAULTED_TO_1'
      },
      verification: {
        identity: hasPartIdentity ? 'PART_NUMBER_PRESENT' : 'PART_NUMBER_MISSING',
        compatibility: hasPartIdentity && hasVehicleIdentity ? 'READY_FOR_VERIFICATION' : 'INSUFFICIENT_IDENTITY'
      },
      marketPrice: {
        min: null,
        median: null,
        max: null,
        source: null,
        checkedAt: null
      },
      saving: {
        amount: null,
        status: 'NOT_CALCULATED'
      },
      confidence: {
        identity: hasPartIdentity ? 60 : 25,
        compatibility: hasPartIdentity && hasVehicleIdentity ? 50 : 20,
        price: 0
      },
      status: 'WAITING_FOR_VERIFIED_PRICE_SOURCE',
      message: 'لم يتم احتساب سعر السوق أو التوفير لعدم وجود مصدر أسعار خارجي موثوق ومربوط بهذا السوق.'
    });
  } catch (error) {
    console.error('Waffer price compare error:', error);
    return res.status(500).json({ error: 'تعذر تنفيذ مقارنة السعر حاليًا.' });
  }
}
