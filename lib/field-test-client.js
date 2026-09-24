export const FIELD_TEST_SCENARIO_IDS = Object.freeze([1,2,3,4,5,6,7,8,9,10]);
export const FIELD_TEST_STATUSES = Object.freeze(['PENDING','PASS','FAIL']);

function safeStatus(value) {
  const status = String(value || '').toUpperCase();
  return FIELD_TEST_STATUSES.includes(status) ? status : 'PENDING';
}

function mapById(items) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const id = Number(item?.id ?? item?.scenarioId);
    if (Number.isInteger(id) && FIELD_TEST_SCENARIO_IDS.includes(id)) map.set(id, item);
  }
  return map;
}

export function normalizeFieldTestDashboard({
  official = {},
  automation = {},
  draft = {}
} = {}) {
  const officialMap = mapById(official?.scenarios);
  const automationMap = mapById(automation?.scenarios);
  const draftMap = mapById(draft?.scenarios);

  const scenarios = FIELD_TEST_SCENARIO_IDS.map(id => {
    const base = officialMap.get(id) || {};
    const auto = automationMap.get(id) || {};
    const local = draftMap.get(id) || {};

    return {
      id,
      title: String(base.title || local.title || ('Scenario ' + id)),
      officialStatus: safeStatus(base.status),
      draftStatus: safeStatus(local.status || base.status),
      testedAt: local.testedAt || base.testedAt || null,
      notes: String(local.notes ?? base.notes ?? ''),
      evidence: local.evidence ?? base.evidence ?? null,
      coverage: String(auto.coverage || 'UNKNOWN'),
      automationEvidence: Array.isArray(auto.evidence) ? [...auto.evidence] : [],
      automationNotes: String(auto.notes || '')
    };
  });

  return {
    scenarios,
    officialPassed: scenarios.filter(item => item.officialStatus === 'PASS').length,
    draftPassed: scenarios.filter(item => item.draftStatus === 'PASS').length,
    draftFailed: scenarios.filter(item => item.draftStatus === 'FAIL').length,
    draftPending: scenarios.filter(item => item.draftStatus === 'PENDING').length
  };
}

export function createFieldTestEvidence({
  scenarioId,
  status,
  notes = '',
  analysis = null,
  vehicle = null,
  catalogState = null,
  pricingSummary = null,
  upload = null,
  commit = null,
  engineVersion = null,
  now = () => new Date().toISOString()
} = {}) {
  const id = Number(scenarioId);
  if (!Number.isInteger(id) || !FIELD_TEST_SCENARIO_IDS.includes(id)) {
    throw new TypeError('scenarioId must be an integer from 1 to 10');
  }

  const normalizedStatus = safeStatus(status);
  const evidence = analysis
    ? {
        requestId: analysis?.requestId || null,
        completedAt: analysis?.completedAt || null,
        engineVersion: engineVersion || analysis?.engineVersion || null,
        commit: commit || analysis?.deployment?.commit || null,
        acceptance: analysis?.acceptance || null,
        upload: upload || null,
        vehicle: {
          vehicleId: vehicle?.vehicleId || null,
          vin: vehicle?.vin || null,
          manufacturerName: vehicle?.manufacturerName || null,
          modelName: vehicle?.modelName || null,
          vehicleDescription: vehicle?.vehicleDescription || null
        },
        catalogState: catalogState || null,
        pricingSummary: pricingSummary || null,
        total: analysis?.total || null,
        calculatedTotal: analysis?.calculatedTotal || null
      }
    : null;

  return {
    id,
    status: normalizedStatus,
    testedAt: normalizedStatus === 'PENDING' ? null : now(),
    notes: String(notes || '').slice(0, 2000),
    evidence
  };
}

export function updateFieldTestDraft(draft = {}, entry) {
  const normalized = createFieldTestEvidence(entry);
  const existing = mapById(draft?.scenarios);
  existing.set(normalized.id, normalized);

  return {
    version: 1,
    updatedAt: normalized.testedAt || new Date().toISOString(),
    scenarios: FIELD_TEST_SCENARIO_IDS
      .filter(id => existing.has(id))
      .map(id => existing.get(id))
  };
}

export function buildFieldTestExport({
  official = {},
  automation = {},
  draft = {},
  exportedAt = new Date().toISOString()
} = {}) {
  const dashboard = normalizeFieldTestDashboard({ official, automation, draft });
  return {
    format: 'waffer-field-test-draft-v1',
    exportedAt,
    warning: 'Draft evidence only. Does not change docs/FIELD_TEST_RESULTS.json or launch gate.',
    summary: {
      officialPassed: dashboard.officialPassed,
      draftPassed: dashboard.draftPassed,
      draftFailed: dashboard.draftFailed,
      draftPending: dashboard.draftPending
    },
    scenarios: dashboard.scenarios.map(item => ({
      id: item.id,
      title: item.title,
      officialStatus: item.officialStatus,
      status: item.draftStatus,
      testedAt: item.testedAt,
      notes: item.notes,
      evidence: item.evidence,
      automation: {
        coverage: item.coverage,
        evidence: item.automationEvidence,
        notes: item.automationNotes
      }
    }))
  };
}
