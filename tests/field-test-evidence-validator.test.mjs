import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateFieldTestDraft,
  validateOfficialFieldTestResults,
  buildOfficialFieldTestResultsFromDraft
} from '../lib/field-test-evidence-validator.js';

function baseScenario(id, status='PENDING') {
  return {
    id,
    title:'Scenario '+id,
    officialStatus:'PENDING',
    status,
    testedAt:status==='PENDING'?null:'2026-09-24T10:00:00.000Z',
    notes:status==='FAIL'?'failure details':'',
    evidence:null,
    automation:{coverage:'COVERED',evidence:[],notes:''}
  };
}

function analysisEvidence(overrides={}) {
  return {
    requestId:'req-123',
    completedAt:'2026-09-24T09:59:00.000Z',
    engineVersion:'mvp-2026-09',
    commit:'abcdef12',
    acceptance:{schemaValid:true,hasItems:true,hasVin:true,identifiedParts:1},
    itemSummary:{total:3,part:1,labor:1,service:1,fee:0,nonPart:2},
    upload:{
      mimeType:'image/jpeg',
      optimized:false,
      originalBytes:1024*1024,
      uploadBytes:1024*1024
    },
    vehicle:{
      vehicleId:9445,
      vin:'1HGCM82633A004352',
      manufacturerName:'FORD',
      modelName:'Expedition'
    },
    catalogState:{
      status:'COMPLETED',
      matched:1,
      skippedItems:2,
      axleRequested:1,
      axleVerified:1
    },
    pricingSummary:null,
    total:'500 SAR',
    calculatedTotal:'500 SAR',
    ...overrides
  };
}

function draftWith(overrides={}) {
  const scenarios=Array.from({length:10},(_,index)=>baseScenario(index+1));
  for(const [id,value] of Object.entries(overrides)){
    scenarios[Number(id)-1]={...scenarios[Number(id)-1],...value};
  }
  return {
    format:'waffer-field-test-draft-v1',
    exportedAt:'2026-09-24T11:00:00.000Z',
    warning:'Draft evidence only. Does not change docs/FIELD_TEST_RESULTS.json or launch gate.',
    summary:{officialPassed:0,draftPassed:0,draftFailed:0,draftPending:10},
    scenarios
  };
}

test('all-pending exported draft is structurally valid but not a promotion candidate',()=>{
  const result=validateFieldTestDraft(draftWith());
  assert.equal(result.valid,true);
  assert.equal(result.promotionCandidate,false);
  assert.deepEqual(result.counts,{passed:0,failed:0,pending:10,expected:10});
});

test('analysis-backed PASS requires request id, engine version and commit',()=>{
  const draft=draftWith({
    1:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence({requestId:null,engineVersion:null,commit:null})
    }
  });
  const result=validateFieldTestDraft(draft);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(x=>x.includes('Analysis ID')));
  assert.ok(result.errors.some(x=>x.includes('engineVersion')));
  assert.ok(result.errors.some(x=>x.includes('deployment commit')));
});

test('early rejection scenarios may pass without analysis id when explanatory notes exist',()=>{
  const draft=draftWith({
    4:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      notes:'Oversized PDF rejected before upload with clear size message',
      evidence:null
    },
    6:{
      status:'PASS',
      testedAt:'2026-09-24T10:05:00.000Z',
      notes:'Invalid VIN rejected before provider lookup',
      evidence:null
    }
  });
  const result=validateFieldTestDraft(draft);
  assert.equal(result.valid,true);
});

test('FAIL requires a valid timestamp and descriptive notes',()=>{
  const draft=draftWith({
    3:{status:'FAIL',testedAt:null,notes:'',evidence:analysisEvidence()}
  });
  const result=validateFieldTestDraft(draft);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(x=>x.includes('valid testedAt')));
  assert.ok(result.errors.some(x=>x.includes('FAIL requires notes')));
});


test('scenario 1 PASS requires JPEG extraction without VIN-derived identity',()=>{
  const bad=draftWith({
    1:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence()
    }
  });
  assert.equal(validateFieldTestDraft(bad).valid,false);

  const good=draftWith({
    1:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence({
        acceptance:{schemaValid:true,hasItems:true,hasVin:false,identifiedParts:1},
        vehicle:{vehicleId:null,vin:null,manufacturerName:null,modelName:null}
      })
    }
  });
  assert.equal(validateFieldTestDraft(good).valid,true);
});

test('scenario 2 PASS requires a real oversized image optimization result',()=>{
  const bad=draftWith({
    2:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence({
        upload:{mimeType:'image/jpeg',optimized:false,originalBytes:4*1024*1024,uploadBytes:4*1024*1024}
      })
    }
  });
  assert.equal(validateFieldTestDraft(bad).valid,false);

  const good=draftWith({
    2:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence({
        upload:{mimeType:'image/jpeg',optimized:true,originalBytes:4*1024*1024,uploadBytes:2*1024*1024}
      })
    }
  });
  assert.equal(validateFieldTestDraft(good).valid,true);
});

test('scenario 3 PASS requires a PDF within the configured upload limit',()=>{
  const good=draftWith({
    3:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence({
        upload:{mimeType:'application/pdf',optimized:false,originalBytes:1024*1024,uploadBytes:1024*1024}
      })
    }
  });
  assert.equal(validateFieldTestDraft(good).valid,true);

  const wrongType=draftWith({
    3:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence()
    }
  });
  assert.equal(validateFieldTestDraft(wrongType).valid,false);
});

test('scenario 7 PASS proves mixed item types and catalog skipping of non-parts',()=>{
  const good=draftWith({
    7:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence()
    }
  });
  assert.equal(validateFieldTestDraft(good).valid,true);

  const notSkipped=draftWith({
    7:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence({
        catalogState:{status:'COMPLETED',matched:1,skippedItems:0,axleRequested:0,axleVerified:0}
      })
    }
  });
  assert.equal(validateFieldTestDraft(notSkipped).valid,false);
});

test('scenario 5 PASS requires live Vehicle ID, valid VIN and completed catalog state',()=>{
  const draft=draftWith({
    5:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence({
        vehicle:{vehicleId:null,vin:'INVALID'},
        catalogState:{status:'RUNNING'}
      })
    }
  });
  const result=validateFieldTestDraft(draft);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(x=>x.includes('numeric Vehicle ID')));
  assert.ok(result.errors.some(x=>x.includes('tested valid VIN')));
  assert.ok(result.errors.some(x=>x.includes('catalogState.status = COMPLETED')));
});

test('scenario 8 PASS requires completed catalog evidence and warns when Front/Rear notes are absent',()=>{
  const draft=draftWith({
    8:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      notes:'',
      evidence:analysisEvidence()
    }
  });
  const result=validateFieldTestDraft(draft);
  assert.equal(result.valid,true);
  assert.ok(result.warnings.some(x=>x.includes('Front/Rear')));

  const missingAxle=draftWith({
    8:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence({
        catalogState:{status:'COMPLETED',matched:1,skippedItems:2,axleRequested:1,axleVerified:0}
      })
    }
  });
  assert.equal(validateFieldTestDraft(missingAxle).valid,false);
});

test('scenario 9 PASS requires zero identified parts',()=>{
  const bad=draftWith({
    9:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence({acceptance:{schemaValid:true,identifiedParts:1}})
    }
  });
  assert.equal(validateFieldTestDraft(bad).valid,false);

  const good=draftWith({
    9:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence({acceptance:{schemaValid:true,identifiedParts:0}})
    }
  });
  assert.equal(validateFieldTestDraft(good).valid,true);
});

test('scenario 10 PASS requires a real printed versus calculated total mismatch',()=>{
  const same=draftWith({
    10:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence({total:'1,150 SAR',calculatedTotal:'1150 SAR'})
    }
  });
  assert.equal(validateFieldTestDraft(same).valid,false);

  const mismatch=draftWith({
    10:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      evidence:analysisEvidence({total:'1,150 SAR',calculatedTotal:'1000 SAR'})
    }
  });
  assert.equal(validateFieldTestDraft(mismatch).valid,true);
});

test('duplicate or missing scenario ids invalidate the draft',()=>{
  const draft=draftWith();
  draft.scenarios[9]={...draft.scenarios[8]};
  const result=validateFieldTestDraft(draft);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(x=>x.includes('Duplicate scenario id: 9')));
  assert.ok(result.errors.some(x=>x.includes('Missing scenario id: 10')));
});

test('validated draft can be converted to official result structure without changing titles',()=>{
  const draft=draftWith({
    4:{
      status:'PASS',
      testedAt:'2026-09-24T10:00:00.000Z',
      notes:'Rejected correctly'
    }
  });
  const officialTemplate={
    protocol:'docs/FIELD_TEST.md',
    scenarios:Array.from({length:10},(_,index)=>({
      id:index+1,
      title:'Official '+(index+1)
    }))
  };

  const official=buildOfficialFieldTestResultsFromDraft(draft,officialTemplate);
  assert.equal(official.updatedAt,draft.exportedAt);
  assert.equal(official.scenarios.length,10);
  assert.equal(official.scenarios[3].status,'PASS');
  assert.equal(official.scenarios[3].title,'Official 4');
  assert.equal(official.scenarios[0].status,'PENDING');
});

test('invalid draft cannot be converted into official results',()=>{
  const draft=draftWith({
    1:{status:'PASS',testedAt:'2026-09-24T10:00:00.000Z',evidence:null}
  });
  assert.throws(
    ()=>buildOfficialFieldTestResultsFromDraft(draft,{}),
    error=>error?.validation?.valid===false
  );
});


test('official results reject handwritten PASS without required runtime evidence',()=>{
  const official={
    protocol:'docs/FIELD_TEST.md',
    updatedAt:'2026-09-24T12:00:00.000Z',
    scenarios:Array.from({length:10},(_,index)=>({
      id:index+1,
      title:'Scenario '+(index+1),
      status:'PASS',
      testedAt:null,
      evidence:null,
      notes:''
    }))
  };
  const result=validateOfficialFieldTestResults(official);
  assert.equal(result.valid,false);
  assert.equal(result.promotionCandidate,false);
  assert.ok(result.errors.some(x=>x.includes('valid testedAt')));
  assert.ok(result.errors.some(x=>x.includes('captured runtime evidence')));
});

test('official all-pending results are valid but never promotion-ready',()=>{
  const official={
    protocol:'docs/FIELD_TEST.md',
    updatedAt:null,
    scenarios:Array.from({length:10},(_,index)=>baseScenario(index+1,'PENDING'))
  };
  const result=validateOfficialFieldTestResults(official);
  assert.equal(result.valid,true);
  assert.equal(result.promotionCandidate,false);
  assert.deepEqual(result.counts,{passed:0,failed:0,pending:10,expected:10});
});
