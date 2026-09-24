export const FIELD_TEST_SCENARIO_IDS = Object.freeze([1,2,3,4,5,6,7,8,9,10]);
export const FIELD_TEST_STATUSES = Object.freeze(['PENDING','PASS','FAIL']);

const FIELD_TEST_REQUIREMENTS = Object.freeze({
  1: {
    ar: ['ارفع صورة JPEG واضحة.','لا تستخدم VIN أو Vehicle ID مشتقًا من VIN.','يجب أن يستخرج التحليل بندًا واحدًا على الأقل.','يُحفظ Analysis ID وengineVersion وdeployment commit.'],
    en: ['Upload a clear JPEG image.','Do not use a VIN or VIN-derived Vehicle ID.','The analysis must extract at least one line item.','Capture Analysis ID, engineVersion, and deployment commit.']
  },
  2: {
    ar: ['استخدم صورة أصلية أكبر من حد الرفع الحالي.','يجب أن يظهر optimized=true.','يجب أن يصبح uploadBytes أصغر من originalBytes وداخل الحد المسموح.','يُحفظ Analysis ID وبيانات الرفع.'],
    en: ['Use an original image larger than the current upload limit.','Evidence must show optimized=true.','uploadBytes must be smaller than originalBytes and within the upload limit.','Capture Analysis ID and upload metadata.']
  },
  3: {
    ar: ['استخدم ملف PDF داخل حد الرفع.','يجب أن يكون mimeType = application/pdf.','يجب ألا يظهر image optimization للـPDF.','يُحفظ Analysis ID وأحجام الملف.'],
    en: ['Use a PDF within the upload limit.','Evidence must show mimeType = application/pdf.','PDF evidence must not report image optimization.','Capture Analysis ID and file sizes.']
  },
  4: {
    ar: ['استخدم PDF أكبر من حد الرفع.','يجب أن يُرفض قبل التحليل/الرفع المدفوع.','سجّل رسالة الرفض أو ملاحظة واضحة كدليل.'],
    en: ['Use a PDF larger than the upload limit.','It must be rejected before paid analysis/upload work.','Record the rejection message or clear explanatory notes.']
  },
  5: {
    ar: ['استخدم VIN صالحًا يدعمه المزود.','يجب ظهور Vehicle ID رقمي وVIN صالح في الدليل.','يجب أن تكون حالة الكتالوج COMPLETED.','يُحفظ Analysis ID وdeployment commit.'],
    en: ['Use a valid VIN supported by the provider.','Evidence must include a numeric Vehicle ID and valid VIN.','Catalog state must be COMPLETED.','Capture Analysis ID and deployment commit.']
  },
  6: {
    ar: ['استخدم VIN غير صالح.','يجب أن يُرفض قبل استدعاء مزود VIN.','سجّل رسالة الرفض أو ملاحظة واضحة.'],
    en: ['Use an invalid VIN.','It must be rejected before the VIN provider lookup.','Record the rejection message or clear notes.']
  },
  7: {
    ar: ['استخدم عرضًا يحتوي قطعة واحدة على الأقل وبند labor/service/fee واحدًا على الأقل.','يجب أن تكون حالة الكتالوج COMPLETED.','يجب أن يثبت skippedItems أن البنود غير القطعية لم تُطابق كقطع.'],
    en: ['Use an estimate containing at least one part and at least one labor/service/fee line.','Catalog state must be COMPLETED.','skippedItems must prove non-part lines were not matched as parts.']
  },
  8: {
    ar: ['استخدم بند فرامل أمامي/خلفي يتطلب Fitting Position.','يجب أن تكون حالة الكتالوج COMPLETED.','يجب أن يكون axleRequested > 0 وaxleVerified > 0.','أضف ملاحظة تصف نتيجة Front/Rear التي راجعتها.'],
    en: ['Use a front/rear brake item requiring Fitting Position.','Catalog state must be COMPLETED.','Evidence must show axleRequested > 0 and axleVerified > 0.','Add notes describing the reviewed Front/Rear result.']
  },
  9: {
    ar: ['استخدم عرضًا بلا أرقام قطع قابلة للتحقق.','يجب أن يثبت الدليل acceptance.identifiedParts = 0.','تحقق أن الثقة تنخفض ولا يُختلق رقم قطعة أو سعر سوق.'],
    en: ['Use an estimate with no verifiable part numbers.','Evidence must show acceptance.identifiedParts = 0.','Verify confidence is reduced and no part number or market price is invented.']
  },
  10: {
    ar: ['استخدم عرضًا فيه الإجمالي المطبوع لا يساوي مجموع البنود الظاهرة.','يجب أن يحتوي الدليل total وcalculatedTotal رقميين مختلفين فعليًا.','تحقق أن الواجهة تعرض فرق الحساب للمراجعة.'],
    en: ['Use an estimate where the printed total differs from the visible line-item sum.','Evidence must contain genuinely different numeric total and calculatedTotal values.','Verify the UI surfaces the calculation difference for review.']
  }
});

export function fieldTestScenarioRequirements(scenarioId, locale = 'ar-SA') {
  const id = Number(scenarioId);
  if (!FIELD_TEST_SCENARIO_IDS.includes(id)) return [];
  const language = String(locale || '').toLowerCase().startsWith('en') ? 'en' : 'ar';
  return [...(FIELD_TEST_REQUIREMENTS[id]?.[language] || [])];
}

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
  const items = Array.isArray(analysis?.items) ? analysis.items : [];
  const itemSummary = items.reduce((summary,item) => {
    const type = ['part','labor','service','fee'].includes(String(item?.itemType || '').toLowerCase())
      ? String(item.itemType).toLowerCase()
      : 'part';
    summary.total += 1;
    summary[type] += 1;
    return summary;
  }, { total:0, part:0, labor:0, service:0, fee:0 });
  itemSummary.nonPart = itemSummary.labor + itemSummary.service + itemSummary.fee;

  const evidence = analysis
    ? {
        requestId: analysis?.requestId || null,
        completedAt: analysis?.completedAt || null,
        engineVersion: engineVersion || analysis?.engineVersion || null,
        commit: commit || analysis?.deployment?.commit || null,
        acceptance: analysis?.acceptance || null,
        itemSummary,
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
  preflight = null,
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
    preflight: preflight && typeof preflight === 'object' ? preflight : null,
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
