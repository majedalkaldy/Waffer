export const FIELD_TEST_FIXTURE_IDS = Object.freeze([1,2,3,4,5,6,7,8,9,10]);

const DEFINITIONS = Object.freeze({
  1: {
    kind: 'image',
    fileName: 'waffer-s1-clear-jpeg.jpg',
    mimeType: 'image/jpeg',
    oversized: false,
    vinMode: 'clear',
    needsLiveVin: false,
    lines: [
      'WAFFER FIELD TEST 1',
      'Clear JPEG estimate - no VIN',
      'Engine Air Filter AF-123 | Qty 1 | SAR 180',
      'Labor | SAR 80',
      'TOTAL SAR 260'
    ]
  },
  2: {
    kind: 'image',
    fileName: 'waffer-s2-large-phone-image.jpg',
    mimeType: 'image/jpeg',
    oversized: true,
    vinMode: 'preserve',
    needsLiveVin: false,
    lines: [
      'WAFFER FIELD TEST 2',
      'Oversized image compression path',
      'Brake Pads BRK-123 | Qty 1 | SAR 250',
      'Labor | SAR 120',
      'TOTAL SAR 370'
    ]
  },
  3: {
    kind: 'pdf',
    fileName: 'waffer-s3-small.pdf',
    mimeType: 'application/pdf',
    oversized: false,
    vinMode: 'preserve',
    needsLiveVin: false,
    lines: [
      'WAFFER FIELD TEST 3',
      'Small PDF estimate',
      'Brake Pads BRK-123 Qty 1 SAR 250',
      'Labor SAR 100',
      'TOTAL SAR 350'
    ]
  },
  4: {
    kind: 'pdf',
    fileName: 'waffer-s4-oversized.pdf',
    mimeType: 'application/pdf',
    oversized: true,
    vinMode: 'preserve',
    needsLiveVin: false,
    lines: [
      'WAFFER FIELD TEST 4',
      'Oversized PDF rejection path',
      'This file should be rejected before paid analysis.'
    ]
  },
  5: {
    kind: 'image',
    fileName: 'waffer-s5-valid-vin-catalog.jpg',
    mimeType: 'image/jpeg',
    oversized: false,
    vinMode: 'preserve',
    needsLiveVin: true,
    lines: [
      'WAFFER FIELD TEST 5',
      'Valid VIN plus part estimate',
      'Oil Filter | Qty 1 | SAR 95',
      'Engine Oil | Qty 1 | SAR 220',
      'Labor | SAR 90',
      'TOTAL SAR 405'
    ]
  },
  6: {
    kind: 'image',
    fileName: 'waffer-s6-invalid-vin.jpg',
    mimeType: 'image/jpeg',
    oversized: false,
    vinMode: 'invalid',
    needsLiveVin: false,
    lines: [
      'WAFFER FIELD TEST 6',
      'Invalid VIN rejection path',
      'Brake Pads | Qty 1 | SAR 250',
      'TOTAL SAR 250'
    ]
  },
  7: {
    kind: 'image',
    fileName: 'waffer-s7-parts-labor-service.jpg',
    mimeType: 'image/jpeg',
    oversized: false,
    vinMode: 'preserve',
    needsLiveVin: true,
    lines: [
      'WAFFER FIELD TEST 7',
      'Parts plus labor and service',
      'Brake Pads | Qty 1 | SAR 250',
      'Labor - Replace Brake Pads | SAR 120',
      'Wheel Alignment Service | SAR 150',
      'TOTAL SAR 520'
    ]
  },
  8: {
    kind: 'image',
    fileName: 'waffer-s8-front-brakes.jpg',
    mimeType: 'image/jpeg',
    oversized: false,
    vinMode: 'preserve',
    needsLiveVin: true,
    lines: [
      'WAFFER FIELD TEST 8',
      'Front axle brake position',
      'Front Brake Disc | Qty 2 | SAR 700',
      'Front Brake Pads | Qty 1 | SAR 300',
      'Labor | SAR 180',
      'TOTAL SAR 1180'
    ]
  },
  9: {
    kind: 'image',
    fileName: 'waffer-s9-no-part-numbers.jpg',
    mimeType: 'image/jpeg',
    oversized: false,
    vinMode: 'preserve',
    needsLiveVin: false,
    lines: [
      'WAFFER FIELD TEST 9',
      'Estimate without part numbers',
      'Brake Pads | Qty 1 | SAR 250',
      'Air Filter | Qty 1 | SAR 180',
      'Labor | SAR 120',
      'TOTAL SAR 550'
    ]
  },
  10: {
    kind: 'image',
    fileName: 'waffer-s10-total-mismatch.jpg',
    mimeType: 'image/jpeg',
    oversized: false,
    vinMode: 'preserve',
    needsLiveVin: false,
    lines: [
      'WAFFER FIELD TEST 10',
      'Printed total intentionally mismatches line sum',
      'Brake Pads BRK-123 | SAR 100',
      'Labor | SAR 50',
      'PRINTED TOTAL SAR 300'
    ]
  }
});

export function fieldTestFixtureDefinition(scenarioId) {
  const id = Number(scenarioId);
  const definition = DEFINITIONS[id];
  if (!definition) return null;
  return {
    id,
    kind: definition.kind,
    fileName: definition.fileName,
    mimeType: definition.mimeType,
    oversized: definition.oversized,
    vinMode: definition.vinMode,
    needsLiveVin: definition.needsLiveVin,
    lines: [...definition.lines]
  };
}

function pdfEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
}

function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

export function buildFieldTestPdfBytes(lines = []) {
  const safeLines = (Array.isArray(lines) ? lines : [])
    .slice(0, 18)
    .map(line => pdfEscape(line));

  const commands = safeLines.map((line, index) => {
    const y = 742 - (index * 30);
    return 'BT /F1 14 Tf 48 ' + y + ' Td (' + line + ') Tj ET';
  }).join('\n');

  const stream = commands || 'BT /F1 14 Tf 48 742 Td (Waffer field test) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(byteLength(pdf));
    pdf += (index + 1) + ' 0 obj\n' + objects[index] + '\nendobj\n';
  }

  const xrefOffset = byteLength(pdf);
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n';
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += String(offsets[index]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\n';
  pdf += 'startxref\n' + xrefOffset + '\n%%EOF\n';

  return new TextEncoder().encode(pdf);
}

export function padFieldTestBytes(bytes, minimumBytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const target = Math.max(source.length, Math.ceil(Number(minimumBytes) || 0));
  if (target === source.length) return source.slice();
  const output = new Uint8Array(target);
  output.set(source, 0);
  return output;
}
