import { getMarketConfig } from '../lib/market-config.js';
import { hasUsablePartNumber, hasUsableVehicleIdentity } from '../lib/identity.js';
import {
  lookupVerifiedPricing,
  calculateVerifiedOfferSaving
} from '../lib/price-provider.js';

export default async function handler(req, res) {
  res.setHeader('Allow', 'POST');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const requestedLocale = String(req.body?.locale || 'ar-SA');
  const requestedEnglish = requestedLocale.toLowerCase().startsWith('en');
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
      return res.status(400).json({
        error: requestedEnglish ? 'A part name or part number is required.' : 'يلزم اسم القطعة أو رقم القطعة.',
        code: 'PART_IDENTITY_REQUIRED'
      });
    }
    const rawPrice = Number(workshopPrice);
    const priceValid = Number.isFinite(rawPrice) && rawPrice >= 0;
    const price = priceValid ? rawPrice : null;
    const rawQuantity = Number(quantity);
    const quantityValid = Number.isFinite(rawQuantity) && rawQuantity > 0;
    const qty = quantityValid ? rawQuantity : 1;
    const marketConfig = getMarketConfig({ market, locale, currency });
    if (!marketConfig.supported) {
      return res.status(400).json({
        error: requestedEnglish ? 'The requested market is not supported yet.' : 'السوق المطلوب غير مدعوم حاليًا.',
        code: 'UNSUPPORTED_MARKET',
        requestedMarket: marketConfig.requestedMarket
      });
    }
    const normalizedMarket = marketConfig.market;
    const normalizedLocale = marketConfig.locale;
    const normalizedCurrency = marketConfig.currency;
    const isEnglish = normalizedLocale.toLowerCase().startsWith('en');
    const hasPartIdentity = hasUsablePartNumber(safePartNumber);
    const hasVehicleIdentity = hasUsableVehicleIdentity(vehicle);

    const pricing = await lookupVerifiedPricing({
      marketConfig,
      part: {
        name: safePartName,
        number: safePartNumber
      },
      vehicle,
      quantity: qty
    });
    const saving = calculateVerifiedOfferSaving({
      workshopUnitPrice: price,
      quantity: qty,
      bestOffer: pricing.bestOffer
    });

    const responseStatus = {
      NOT_CONFIGURED: 'WAITING_FOR_VERIFIED_PRICE_SOURCE',
      INSUFFICIENT_IDENTITY: 'INSUFFICIENT_IDENTITY_FOR_PRICE_LOOKUP',
      PROVIDER_INVALID: 'PRICE_SOURCE_MISCONFIGURED',
      PROVIDER_ERROR: 'PRICE_SOURCE_UNAVAILABLE',
      NO_VERIFIED_PRICE: 'NO_VERIFIED_PRICE_AVAILABLE',
      VERIFIED: 'VERIFIED_PRICE_DATA_AVAILABLE'
    }[pricing.status] || 'WAITING_FOR_VERIFIED_PRICE_SOURCE';

    const responseMessage = (() => {
      if (pricing.status === 'VERIFIED') {
        return isEnglish
          ? 'Verified price data is available from the connected source. Savings are calculated only when a verified in-stock offer is available.'
          : 'تتوفر بيانات سعر موثقة من المصدر المتصل. لا يُحسب التوفير إلا عند توفر عرض شراء موثق ومتاح.';
      }
      if (pricing.status === 'PROVIDER_ERROR') {
        return isEnglish
          ? 'The trusted price source is temporarily unavailable. No market price or savings were guessed.'
          : 'مصدر الأسعار الموثوق غير متاح مؤقتًا. لم يتم تخمين سعر سوق أو توفير.';
      }
      if (pricing.status === 'NO_VERIFIED_PRICE') {
        return isEnglish
          ? 'The connected price source returned no verified price data for this part.'
          : 'لم يُرجع مصدر الأسعار المتصل بيانات سعر موثقة لهذه القطعة.';
      }
      if (pricing.status === 'INSUFFICIENT_IDENTITY') {
        return isEnglish
          ? 'More part and vehicle identity is required before a trusted price lookup can run.'
          : 'يلزم استكمال هوية القطعة والسيارة قبل إجراء بحث سعر موثوق.';
      }
      return isEnglish
        ? 'Market price and savings were not calculated because no trusted external price source is connected for this market.'
        : 'لم يتم احتساب سعر السوق أو التوفير لعدم وجود مصدر أسعار خارجي موثوق ومربوط بهذا السوق.';
    })();

    return res.status(200).json({
      context: {
        market: normalizedMarket,
        locale: normalizedLocale,
        currency: normalizedCurrency
      },
      part: {
        name: safePartName || (isEnglish ? 'not specified' : 'غير محدد'),
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
        compatibility: hasPartIdentity && hasVehicleIdentity ? 'READY_FOR_VERIFICATION' : 'INSUFFICIENT_IDENTITY',
        priceSource: pricing.status
      },
      pricingProvider: {
        status: pricing.status,
        id: pricing.providerId,
        sourceLabel: pricing.sourceLabel,
        checkedAt: pricing.checkedAt
      },
      marketPrice: {
        min: pricing.marketRange?.min ?? null,
        median: pricing.marketRange?.median ?? null,
        max: pricing.marketRange?.max ?? null,
        sampleSize: pricing.marketRange?.sampleSize ?? null,
        source: pricing.marketRange ? pricing.sourceLabel : null,
        checkedAt: pricing.marketRange ? pricing.checkedAt : null
      },
      bestOffer: pricing.bestOffer
        ? {
            ...pricing.bestOffer,
            source: pricing.sourceLabel,
            checkedAt: pricing.checkedAt,
            totalPrice: saving.offerTotal
          }
        : null,
      saving: {
        amount: saving.amount,
        status: saving.status
      },
      confidence: {
        identity: hasPartIdentity ? 60 : 25,
        compatibility: hasPartIdentity && hasVehicleIdentity ? 50 : 20,
        price: pricing.bestOffer ? 95 : pricing.marketRange ? 75 : 0
      },
      status: responseStatus,
      message: responseMessage
    });
  } catch (error) {
    console.error('Waffer price compare error:', error);
    return res.status(500).json({
      error: requestedEnglish ? 'Price comparison is currently unavailable.' : 'تعذر تنفيذ مقارنة السعر حاليًا.'
    });
  }
}
