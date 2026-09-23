function parseDisplayedAmount(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/[\d,.]+/);
  if (!match) return null;
  const number = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

export function compareDisplayedTotals(printedTotal, calculatedTotal, tolerance = 0.01) {
  const printed = parseDisplayedAmount(printedTotal);
  const calculated = parseDisplayedAmount(calculatedTotal);

  if (printed === null || calculated === null) {
    return {
      comparable: false,
      matches: false,
      printed,
      calculated,
      difference: null
    };
  }

  const difference = Math.abs(printed - calculated);
  return {
    comparable: true,
    matches: difference < tolerance,
    printed,
    calculated,
    difference
  };
}
