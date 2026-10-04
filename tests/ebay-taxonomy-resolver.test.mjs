import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EBAY_MOTORS_US_CATEGORY_TREE_ID,
  buildCompatibilityFilter,
  resolveEbayCanonicalVehicle
} from '../lib/price-providers/ebay-taxonomy-resolver.js';

test('eBay Motors US uses taxonomy tree 100 and escapes filter commas', () => {
  assert.equal(EBAY_MOTORS_US_CATEGORY_TREE_ID, '100');
  assert.equal(
    buildCompatibilityFilter([
      ['Year','2022'],
      ['BodyStyle','AWD B9 8W5,C8WD']
    ]),
    'Year:2022,BodyStyle:AWD B9 8W5\\,C8WD'
  );
});

test('taxonomy resolver returns a canonical vehicle only from deterministic matches', async () => {
  const calls=[];
  const responses={
    Make:{compatibilityPropertyValues:[{value:'Ford'},{value:'Chevrolet'}]},
    Model:{compatibilityPropertyValues:[{value:'F-150'},{value:'F-250'}]},
    Trim:{compatibilityPropertyValues:[{value:'XLT Crew Cab Pickup 4-Door'}]},
    Engine:{compatibilityPropertyValues:[
      {value:'3.5L 3496CC V6 GAS DOHC Turbocharged'},
      {value:'5.0L 5038CC V8 GAS DOHC Naturally Aspirated'}
    ]}
  };

  const result=await resolveEbayCanonicalVehicle({
    categoryId:'33559',
    vehicle:{
      year:'2024',
      make:'FORD',
      model:'F-150',
      nhtsa:{
        trim:'XLT Crew Cab Pickup 4-Door',
        engineModel:'3.5L 3496CC V6 GAS DOHC Turbocharged',
        displacementL:3.5,
        engineCylinders:6
      }
    },
    getProperties:async categoryId=>{
      calls.push(['properties',categoryId]);
      return {compatibilityProperties:[
        {name:'Year'},{name:'Make'},{name:'Model'},{name:'Trim'},{name:'Engine'}
      ]};
    },
    getValues:async(categoryId,property,filters)=>{
      calls.push([property,categoryId,filters]);
      return responses[property];
    }
  });

  assert.equal(result.canonical,true);
  assert.equal(result.source,'EBAY_TAXONOMY');
  assert.equal(result.categoryTreeId,'100');
  assert.equal(result.categoryId,'33559');
  assert.equal(result.year,'2024');
  assert.equal(result.make,'Ford');
  assert.equal(result.model,'F-150');
  assert.equal(result.trim,'XLT Crew Cab Pickup 4-Door');
  assert.equal(result.engine,'3.5L 3496CC V6 GAS DOHC Turbocharged');
  assert.equal(result.matchBasis.trim,'EXACT_TEXT');
  assert.equal(result.matchBasis.engine,'EXACT_TEXT');
  assert.deepEqual(calls[3][2],[
    ['Year','2024'],['Make','Ford'],['Model','F-150']
  ]);
});

test('taxonomy resolver rejects ambiguous trim instead of guessing', async () => {
  const responses={
    Make:{compatibilityPropertyValues:[{value:'Ford'}]},
    Model:{compatibilityPropertyValues:[{value:'F-150'}]},
    Trim:{compatibilityPropertyValues:[
      {value:'XLT Crew Cab Pickup 4-Door'},
      {value:'XLT Extended Cab Pickup 4-Door'}
    ]}
  };

  const result=await resolveEbayCanonicalVehicle({
    categoryId:'33559',
    vehicle:{year:'2024',make:'Ford',model:'F-150',trim:'XLT'},
    getProperties:async()=>({compatibilityProperties:[
      {name:'Year'},{name:'Make'},{name:'Model'},{name:'Trim'},{name:'Engine'}
    ]}),
    getValues:async(_categoryId,property)=>responses[property] || {compatibilityPropertyValues:[]}
  });

  assert.equal(result.canonical,false);
  assert.equal(result.reason,'TRIM_AMBIGUOUS_OR_UNRESOLVED');
});

test('taxonomy resolver rejects ambiguous engines with same displacement and cylinders', async () => {
  const responses={
    Make:{compatibilityPropertyValues:[{value:'Ford'}]},
    Model:{compatibilityPropertyValues:[{value:'F-150'}]},
    Trim:{compatibilityPropertyValues:[{value:'XLT Crew Cab Pickup 4-Door'}]},
    Engine:{compatibilityPropertyValues:[
      {value:'3.5L 3496CC V6 GAS DOHC Turbocharged'},
      {value:'3.5L 3496CC V6 FULL HYBRID EV-GAS (FHEV) DOHC Turbocharged'}
    ]}
  };

  const result=await resolveEbayCanonicalVehicle({
    categoryId:'33559',
    vehicle:{
      year:'2024',make:'Ford',model:'F-150',trim:'XLT Crew Cab Pickup 4-Door',
      displacementL:3.5,engineCylinders:6
    },
    getProperties:async()=>({compatibilityProperties:[
      {name:'Year'},{name:'Make'},{name:'Model'},{name:'Trim'},{name:'Engine'}
    ]}),
    getValues:async(_categoryId,property)=>responses[property]
  });

  assert.equal(result.canonical,false);
  assert.equal(result.reason,'ENGINE_AMBIGUOUS_OR_UNRESOLVED');
});

for(const [requested,returned] of [['S','SE Sedan 4-Door'],['XLT','XLT Sport']])test('trim '+requested+' cannot be inferred as '+returned,async()=>{
 const values={Make:'Ford',Model:'F-150',Trim:returned,Engine:'3.5L 3496CC V6 GAS DOHC Turbocharged'};
 const result=await resolveEbayCanonicalVehicle({categoryId:'33559',vehicle:{year:'2024',make:'Ford',model:'F-150',trim:requested,engine:values.Engine},getProperties:async()=>({compatibilityProperties:['Year','Make','Model','Trim','Engine'].map(name=>({name}))}),getValues:async(_id,key)=>({compatibilityPropertyValues:[{value:values[key]}]})});
 assert.equal(result.canonical,false);
});
