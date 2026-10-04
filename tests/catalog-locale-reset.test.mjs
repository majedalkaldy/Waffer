import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('catalog headings keep their localization identity after reset and either match result',()=>{
 const app=read('app.js');
 const dynamicHeadings=[...app.matchAll(/(?:catalogMatches|box)\.innerHTML='<h3([^>]*)>🔎 /g)];
 assert.equal(dynamicHeadings.length,3);
 for(const [,attributes]of dynamicHeadings)assert.match(attributes,/id="catalogMatchLabel"/);
 assert.match(app,/catalogMatches\.innerHTML=.*id="catalogWaitingText"/);
 assert.match(read('app-module.js'),/if\(catalogMatchLabel\)catalogMatchLabel\.textContent/);
});
