import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeFieldTestDashboard,
  fieldTestScenarioRequirements,
  createFieldTestEvidence,
  updateFieldTestDraft,
  buildFieldTestExport
} from '../lib/field-test-client.js';

const official={
  scenarios:Array.from({length:10},(_,index)=>({
    id:index+1,
    title:'Scenario '+(index+1),
    status:index===0?'PASS':'PENDING',
    testedAt:index===0?'2026-09-24T00:00:00.000Z':null,
    evidence:index===0?{requestId:'official-1'}:null,
    notes:''
  }))
};

const automation={
  scenarios:Array.from({length:10},(_,index)=>({
    id:index+1,
    coverage:index===1?'PARTIAL':'COVERED',
    evidence:['test-'+(index+1)],
    notes:'coverage '+(index+1)
  }))
};

test('dashboard merges official, automation and local draft without changing official gate',()=>{
  const draft={
    scenarios:[
      {id:2,status:'PASS',testedAt:'2026-09-24T01:00:00.000Z',notes:'phone ok',evidence:{requestId:'draft-2'}},
      {id:3,status:'FAIL',testedAt:'2026-09-24T02:00:00.000Z',notes:'pdf issue'}
    ]
  };

  const dashboard=normalizeFieldTestDashboard({official,automation,draft});
  assert.equal(dashboard.officialPassed,1);
  assert.equal(dashboard.draftPassed,2);
  assert.equal(dashboard.draftFailed,1);
  assert.equal(dashboard.draftPending,7);
  assert.equal(dashboard.scenarios[1].draftStatus,'PASS');
  assert.equal(dashboard.scenarios[1].officialStatus,'PENDING');
  assert.equal(dashboard.scenarios[1].coverage,'PARTIAL');
  assert.equal(dashboard.scenarios[1].evidence.requestId,'draft-2');
});

test('evidence snapshot captures traceability from current runtime',()=>{
  const entry=createFieldTestEvidence({
    scenarioId:5,
    status:'PASS',
    notes:'VIN matched',
    now:()=> '2026-09-24T03:00:00.000Z',
    analysis:{
      requestId:'analysis-5',
      completedAt:'2026-09-24T02:59:00.000Z',
      engineVersion:'mvp-2026-09',
      acceptance:{schemaValid:true},
      items:[
        {name:'Brake pad',itemType:'part'},
        {name:'Labor',itemType:'labor'},
        {name:'Alignment',itemType:'service'}
      ],
      total:'500 SAR',
      calculatedTotal:'500 SAR'
    },
    vehicle:{
      vehicleId:9445,
      vin:'1HGCM82633A004352',
      manufacturerName:'FORD',
      modelName:'Expedition'
    },
    catalogState:{status:'COMPLETED',matched:1},
    pricingSummary:{verifiedSaving:0},
    upload:{mimeType:'image/jpeg',bytes:1234},
    commit:'abcdef12'
  });

  assert.equal(entry.id,5);
  assert.equal(entry.status,'PASS');
  assert.equal(entry.testedAt,'2026-09-24T03:00:00.000Z');
  assert.equal(entry.evidence.requestId,'analysis-5');
  assert.equal(entry.evidence.commit,'abcdef12');
  assert.equal(entry.evidence.vehicle.vehicleId,9445);
  assert.equal(entry.evidence.catalogState.status,'COMPLETED');
  assert.deepEqual(entry.evidence.itemSummary,{
    total:3,
    part:1,
    labor:1,
    service:1,
    fee:0,
    nonPart:2
  });
});

test('pending entry intentionally has no testedAt and may exist without analysis evidence',()=>{
  const entry=createFieldTestEvidence({
    scenarioId:4,
    status:'PENDING',
    notes:'not run yet'
  });
  assert.equal(entry.status,'PENDING');
  assert.equal(entry.testedAt,null);
  assert.equal(entry.evidence,null);
});

test('draft update replaces only the selected scenario and preserves others',()=>{
  let draft=updateFieldTestDraft({},{
    scenarioId:1,
    status:'PASS',
    notes:'first',
    now:()=> '2026-09-24T04:00:00.000Z'
  });
  draft=updateFieldTestDraft(draft,{
    scenarioId:2,
    status:'FAIL',
    notes:'second',
    now:()=> '2026-09-24T05:00:00.000Z'
  });
  draft=updateFieldTestDraft(draft,{
    scenarioId:1,
    status:'FAIL',
    notes:'first revised',
    now:()=> '2026-09-24T06:00:00.000Z'
  });

  assert.equal(draft.scenarios.length,2);
  assert.equal(draft.scenarios.find(item=>item.id===1).status,'FAIL');
  assert.equal(draft.scenarios.find(item=>item.id===1).notes,'first revised');
  assert.equal(draft.scenarios.find(item=>item.id===2).status,'FAIL');
});

test('export is explicitly draft-only and includes official and automation context',()=>{
  const draft={
    scenarios:[{id:2,status:'PASS',testedAt:'2026-09-24T01:00:00.000Z',notes:'ok'}]
  };
  const preflight={
    format:'waffer-browser-preflight-v1',
    ranAt:'2026-09-24T06:59:00.000Z',
    status:'PASS',
    checks:[{id:'canvas-jpeg',ok:true,severity:'critical',details:'ok'}]
  };
  const exported=buildFieldTestExport({
    official,
    automation,
    draft,
    preflight,
    exportedAt:'2026-09-24T07:00:00.000Z'
  });

  assert.equal(exported.format,'waffer-field-test-draft-v1');
  assert.match(exported.warning,/does not change docs\/FIELD_TEST_RESULTS\.json/i);
  assert.equal(exported.summary.officialPassed,1);
  assert.equal(exported.summary.draftPassed,2);
  assert.equal(exported.scenarios.length,10);
  assert.equal(exported.scenarios[1].automation.coverage,'PARTIAL');
  assert.deepEqual(exported.preflight,preflight);
});


test('every field-test scenario exposes bilingual PASS evidence requirements',()=>{
  for(let id=1;id<=10;id+=1){
    const ar=fieldTestScenarioRequirements(id,'ar-SA');
    const en=fieldTestScenarioRequirements(id,'en-SA');
    assert.ok(ar.length>=3,'ar scenario '+id);
    assert.ok(en.length>=3,'en scenario '+id);
    assert.equal(ar.some(item=>/[\u0600-\u06FF]/.test(item)),true,'ar scenario '+id);
    assert.equal(en.some(item=>/[\u0600-\u06FF]/.test(item)),false,'en scenario '+id);
  }
  assert.deepEqual(fieldTestScenarioRequirements(99,'ar-SA'),[]);
});

test('scenario requirement text mirrors the critical Evidence v2 gates',()=>{
  assert.ok(fieldTestScenarioRequirements(2,'en-SA').some(item=>item.includes('optimized=true')));
  assert.ok(fieldTestScenarioRequirements(5,'en-SA').some(item=>item.includes('Vehicle ID')));
  assert.ok(fieldTestScenarioRequirements(7,'en-SA').some(item=>item.includes('skippedItems')));
  assert.ok(fieldTestScenarioRequirements(8,'en-SA').some(item=>item.includes('axleVerified > 0')));
  assert.ok(fieldTestScenarioRequirements(9,'en-SA').some(item=>item.includes('identifiedParts = 0')));
  assert.ok(fieldTestScenarioRequirements(10,'en-SA').some(item=>item.includes('calculatedTotal')));
});
