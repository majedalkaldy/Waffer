import { getMarketConfig } from '../lib/market-config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

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

    if (!partName && !partNumber) {
      return res.status(400).json({ error: 'يلزم اسم القطعة أو رقم القطعة.' });
    }

    const price = Number(workshopPrice);
    const qty = Math.max(1, Number(quantity) || 1);
    const marketConfig = getMarketConfig({ market, locale, currency });
    if (!marketConfig.supported) return res.status(400).json({ error: 'Unsupported market', code: 'UNSUPPORTED_MARKET', requestedMarket: marketConfig.requestedMarket });
    const normalizedMarket = marketConfig.market;
    const normalizedLocale = marketConfig.locale;
    const normalizedCurrency = marketConfig.currency;
    const hasPartIdentity = Boolean(String(partNumber || '').trim());
    const hasVehicleIdentity = Boolean(vehicle.vehicleId || vehicle.vin);

    return res.status(200).json({
      context: {
        market: normalizedMarket,
        locale: normalizedLocale,
        currency: normalizedCurrency
      },
      part: {
        name: partName || 'غير محدد',
        number: partNumber || null,
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
        unitPrice: Number.isFinite(price) ? price : null,
        totalPrice: Number.isFinite(price) ? price * qty : null
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
