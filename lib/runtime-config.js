export const RUNTIME_CONFIG = {
  engineVersion: 'mvp-2026-09',
  launchPhase: 'field-test',
  // Keep binary uploads below Vercel's request-body ceiling after Base64/JSON overhead.
  maxUploadBytes: 3 * 1024 * 1024,
  functionPayloadLimitBytes: 4.5 * 1000 * 1000,
  supportedMimeTypes: ['image/jpeg','image/png','image/webp','application/pdf'],
  analysisTimeoutMs: 45000,
  pdfUploadTimeoutMs: 15000,
  catalogMatchTimeoutMs: 30000,
  catalogProductsTimeoutMs: 12000,
  catalogArticlesTimeoutMs: 9000,
  catalogCriteriaTimeoutMs: 8000,
  vinTimeoutMs: 10000,
  manufacturersTimeoutMs: 8000,
  healthCatalogTimeoutMs: 3500
};
