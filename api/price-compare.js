export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    const {
      partName,
      partNumber,
      workshopPrice,
      quantity = 1,
      vehicle = {}
    } = req.body || {};

    if (!partName && !partNumber) {
      return res.status(400).json({
        error: 'يلزم اسم القطعة أو رقم القطعة.'
      });
    }

    const price = Number(workshopPrice);
    const qty = Number(quantity) || 1;

    const result = {
      partName: partName || 'غير محدد',
      partNumber: partNumber || 'غير متوفر',
      vehicle: {
        make: vehicle.make || 'غير محدد',
        model: vehicle.model || 'غير محدد',
        year: vehicle.year || 'غير محدد',
        vin: vehicle.vin || 'غير متوفر'
      },

      workshopPrice: Number.isFinite(price) ? price : null,
      quantity: qty,

      identityStatus: partNumber
        ? 'رقم القطعة متوفر ويحتاج تحقق'
        : 'هوية القطعة غير مكتملة',

      compatibilityStatus:
        partNumber && vehicle.vin
          ? 'جاهز للتحقق من التوافق عند ربط مصدر بيانات'
          : 'يحتاج رقم قطعة وبيانات مركبة أدق',

      marketPrice: null,
      marketPriceCurrency: 'SAR',
      priceSource: null,
      priceSourceUrl: null,
      priceCheckedAt: null,

      saving: null,
      savingStatus: 'غير محسوب',

      confidence: {
        identity: partNumber ? 60 : 25,
        compatibility: partNumber && vehicle.vin ? 50 : 20,
        price: 0,
        overall: 20
      },

      status: 'WAITING_FOR_VERIFIED_PRICE_SOURCE',

      message:
        'لم يتم احتساب سعر السوق أو التوفير لأن وفّر لا يملك بعد مصدر أسعار خارجيًا موثوقًا لهذه القطعة.',

      nextRequired:
        'ربط مزود أسعار وبيانات قطع موثوق، ثم التحقق من رقم القطعة والتوافق قبل حساب التوفير.'
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('Waffer price compare error:', error);

    return res.status(500).json({
      error: 'تعذر تنفيذ مقارنة السعر حاليًا.'
    });
  }
}
