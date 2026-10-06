import { normalizeMatchedListing } from './matched-listing.js';

export function renderPricingListings(container, entries = [], { locale = 'en-US', now = Date.now() } = {}) {
  if (!container) return;
  container.replaceChildren();
  const ar = String(locale).startsWith('ar');
  const text = (en, arabic) => ar ? arabic : en;
  const doc = container.ownerDocument;
  const append = (parent, tag, value) => { const el = doc.createElement(tag); el.textContent = value; parent.append(el); return el; };
  for (const entry of entries) {
    const data = entry?.data || entry;
    const sandbox = data?.pricingProvider?.environment === 'sandbox' || data?.status === 'SANDBOX_TEST_DATA_ONLY';
    const raw = sandbox ? data?.sandboxPreview : data?.matchedListing;
    const listing = normalizeMatchedListing(raw, {requestedPartNumber: data?.part?.number, environment: sandbox ? 'sandbox' : 'production'});
    const checked = Date.parse(raw?.checkedAt);
    const fresh = Number.isFinite(checked) && checked <= now + 30_000 && now - checked <= 300_000;
    const card = doc.createElement('article');
    card.className = 'pricing-listing';
    container.append(card);
    append(card, 'h4', text('Part ', 'القطعة ') + String(data?.part?.number || entry?.index + 1 || ''));
    if (!listing || !fresh) {
      append(card, 'p', text('No fresh matched listing is available. Confirm the manufacturer, exact part number, trim and engine before retrying.', 'لا يتوفر إعلان مطابق حديث. تحقق من الشركة ورقم القطعة والفئة والمحرك قبل إعادة المحاولة.'));
      continue;
    }
    append(card, 'strong', sandbox ? text('SANDBOX TEST DATA ONLY', 'بيانات Sandbox للاختبار فقط') : text('Matched eBay listing • checkout total unverified', 'إعلان eBay مطابق • إجمالي الشراء غير موثّق'));
    append(card, 'p', listing.title || listing.partNumber);
    append(card, 'p', text('Price per listing unit: ', 'السعر لكل وحدة إعلان: ') + listing.itemPrice.toFixed(2) + ' USD');
    append(card, 'p', listing.shippingEstimate === null
      ? text('Shipping: unknown', 'الشحن: غير معروف')
      : text('Shipping estimate: ', 'تقدير الشحن: ') + listing.shippingEstimate.toFixed(2) + ' USD' + text(' (destination not confirmed)', ' (الوجهة غير مؤكدة)'));
    append(card, 'p', text('Tax and checkout total: unknown. No confirmed savings.', 'الضريبة وإجمالي الشراء غير معروفين. لا يوجد توفير مؤكد.'));
    append(card, 'p', text('Requested listing units: ', 'وحدات الإعلان المطلوبة: ') + listing.requestedQuantity + ' • ' + (listing.quantityAvailability === 'CONFIRMED' ? text('stock reported for these listing units', 'المخزون المبلغ يدعم وحدات الإعلان هذه') : text('quantity availability unconfirmed', 'توفر الكمية غير مؤكد')));
    append(card, 'p', text('Pack size and units are unverified. Confirm the seller package before buying.', 'حجم العبوة وعدد القطع داخلها غير موثّقين. تحقق من عبوة البائع قبل الشراء.'));
    append(card, 'p', text('Seller: ', 'البائع: ') + listing.seller + ' • ' + text('Condition: ', 'الحالة: ') + listing.condition);
    append(card, 'p', text('Checked: ', 'آخر فحص: ') + new Date(checked).toISOString());
    if (!sandbox) {
      const link = append(card, 'a', text('View listing on eBay and confirm final cost', 'عرض الإعلان على eBay وتأكيد التكلفة النهائية'));
      link.href = listing.sourceUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const tracked = ['campid', 'customid', 'mkcid', 'mkevt', 'toolid'].some(key => new URL(listing.sourceUrl).searchParams.has(key));
      if (tracked) {
        link.rel += ' sponsored';
        append(card, 'p', text('This is a tracked link. A purchase may result in affiliate compensation.', 'هذا رابط تتبّع. قد ينتج عن الشراء تعويض تسويق بالعمولة.'));
      }
    }
  }
}
