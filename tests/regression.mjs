import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=process.argv[2]||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log(`PASS ${name}`);}catch(e){failed++;console.log(`FAIL ${name}: ${e.message}`);}}
function worker(scope){
 const events={},puts=[],deletes=[];
 const cache={match:async()=>undefined,put:async(...args)=>puts.push(args),addAll:async()=>{}};
 const context=vm.createContext({URL,Response,Set,encodeURIComponent,
 self:{registration:{scope},location:{origin:'https://hotel.test'},addEventListener:(name,fn)=>events[name]=fn,clients:{claim:async()=>{}},skipWaiting:()=>{}},
 caches:{open:async()=>cache,keys:async()=>['tamasya-cache-'+encodeURIComponent('/other/')+'-r4.3-20260914'],delete:async name=>deletes.push(name),match:cache.match},
 fetch:async()=>({ok:true,type:'basic',headers:new Headers(),clone:()=>({})})});
 vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),context);
 return {context,events,puts,deletes};
}
for(const resource of ['admin.php','webpublic/index.html','uploads/identity/photo.jpg','missing.html'])await test(`SW bypasses ${resource}`,()=>{
 const w=worker('https://hotel.test/app/');let intercepted=false;
 w.events.fetch({request:{url:'https://hotel.test/app/'+resource,method:'GET',headers:new Headers(),mode:'navigate'},respondWith:()=>intercepted=true});
 assert.equal(intercepted,false);
});
await test('SW cache differs between property subfolders',()=>{const a=worker('https://hotel.test/a/'),b=worker('https://hotel.test/b/');assert.notEqual(vm.runInContext('CACHE_NAME',a.context),vm.runInContext('CACHE_NAME',b.context));});
await test('SW activation retains another property cache',async()=>{const w=worker('https://hotel.test/app/');let done;w.events.activate({waitUntil:p=>done=p});await done;assert.equal(w.deletes.length,0);});
await test('SW still handles application entry navigation',async()=>{const w=worker('https://hotel.test/app/');let done;const waits=[];w.events.fetch({request:{url:'https://hotel.test/app/',method:'GET',mode:'navigate',headers:new Headers()},respondWith:p=>done=p,waitUntil:p=>waits.push(p)});assert.ok(done);await done;await Promise.all(waits);assert.equal(w.puts.length,1);});
function guard(status,payload){
 const calls=[],storage=new Map();
 const context=vm.createContext({URL,Headers,Request,Response,URLSearchParams,FormData,Blob,File,ArrayBuffer,Uint8Array,Date,Map,Set,JSON,Math,
 location:new URL('https://hotel.test/app/'),sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 window:{fetch:async(input,init)=>{calls.push(init);return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});}}});
 vm.runInContext(fs.readFileSync(path.join(root,'assets/api-operation-guard.js'),'utf8'),context);
 return {calls,fetch:()=>context.window.fetch('https://hotel.test/app/api.php?action=bookings',{method:'POST',body:'{"value":1}'})};
}
await test('202 response remains retryable with the same operation ID',async()=>{const g=guard(202,{success:true,pending:true});await g.fetch();const second=await g.fetch();assert.equal(second.status,202);assert.equal(g.calls.length,2);assert.equal(g.calls[0].headers.get('X-Tamasya-Operation-ID'),g.calls[1].headers.get('X-Tamasya-Operation-ID'));});
await test('business failure in HTTP 200 does not arm success shield',async()=>{const g=guard(200,{success:false});await g.fetch();await g.fetch();assert.equal(g.calls.length,2);});
await test('successful duplicate is still blocked',async()=>{const g=guard(200,{success:true});await g.fetch();assert.equal((await g.fetch()).status,409);assert.equal(g.calls.length,1);});
await test('503 retry retains the operation ID',async()=>{const g=guard(503,{success:false});await g.fetch();await g.fetch();assert.equal(g.calls.length,2);assert.equal(g.calls[0].headers.get('X-Tamasya-Operation-ID'),g.calls[1].headers.get('X-Tamasya-Operation-ID'));});

await test('compiled app-shared retains operation ID for retryable responses',()=>{
 const source=fs.readFileSync(path.join(root,'assets/chunks/app-shared.js'),'utf8');
 assert.match(source,/status===202\|\|tamasyaResponse\.status===408\|\|tamasyaResponse\.status===425\|\|tamasyaResponse\.status===429\|\|tamasyaResponse\.status>=500/);
});
await test('Enterprise RC1 build ID matches API, SW cache, registration and asset URLs',()=>{
 const build='20261001-enterprise-rc1-audit1';
 const release=fs.readFileSync(path.join(root,'release_contract.php'),'utf8');
 const guard=fs.readFileSync(path.join(root,'consistency_guard_support.php'),'utf8');
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const swRegister=fs.readFileSync(path.join(root,'assets/sw-register.js'),'utf8');
 assert.ok(release.includes(build));assert.ok(guard.includes(build));assert.ok(sw.includes(`CACHE_PREFIX}${build}`));
 assert.ok(index.includes(`sw-register.js?v=${build}`));assert.ok(swRegister.includes(`sw.js?v=${build}`));
 for(const rel of ['assets/app-core.js','assets/chunks/app-shared.js','assets/chunks/app-shell.js','assets/chunks/feature-shared.js']){
  assert.ok(sw.includes(`${rel}?v=${build}`),`SW missing build version for ${rel}`);
 }
});
await test('modularization manifest matches every active router module',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'api/MODULARIZATION_MANIFEST.json'),'utf8'));
 const router=fs.readFileSync(path.join(root,'api/router.php'),'utf8');
 const routes=[...router.matchAll(/require __DIR__ \. '\/routes\/([^']+)'/g)].map(m=>m[1]);
 assert.deepEqual([...manifest.routeModules].sort(),[...routes].sort());
 for(const rel of routes) assert.ok(fs.existsSync(path.join(root,'api/routes',rel)),`missing route module ${rel}`);
});
await test('domain dropdown ignores horizontal nav rail scroll race',()=>{
 const shell=fs.readFileSync(path.join(root,'assets/chunks/app-shell.js'),'utf8');
 assert.ok(shell.includes("element.closest?.('.nav-scroll')"),'domain dropdown must ignore nav rail scroll');
 assert.ok(shell.includes("element.closest?.('.ui-core-nav-dropdown')"),'domain dropdown must ignore its own menu scroll');
 assert.ok(shell.includes("window.addEventListener('scroll', onScroll, { passive: true, capture: true })"),'guarded scroll handler missing');
 assert.ok(shell.includes("window.removeEventListener('scroll', onScroll, true)"),'guarded scroll cleanup missing');
});
await test('Growth browser UAT waits for UI commit after API response',()=>{
 const spec=fs.readFileSync(path.join(root,'tests/uat_rc1/browser/rc1-ui.spec.mjs'),'utf8');
 assert.ok(spec.includes('async function waitUiActionSettled(page,responsePromise,expectedStatus=200)'),'UI-settle helper missing');
 assert.match(spec,/command=channel-mapping-save[\s\S]{0,700}waitUiActionSettled\(page,mapping\)/,'channel mapping must wait for post-response UI commit');
 assert.match(spec,/command=payment-intent-create[\s\S]{0,700}waitUiActionSettled\(page,pi\)/,'payment intent must wait for post-response UI commit');
});
await test('Growth mobile layout contains wide data inside the viewport',()=>{
 const css=fs.readFileSync(path.join(root,'assets/growth-suite.css'),'utf8');
 const spec=fs.readFileSync(path.join(root,'tests/uat_rc1/browser/rc1-ui.spec.mjs'),'utf8');
 assert.ok(css.includes('.panel{background:#fff')&&css.includes('min-width:0}'),'Growth panels must be allowed to shrink below intrinsic table width');
 assert.ok(css.includes('.grid.two>*,.form-grid>*{min-width:0}'),'Growth grid children must not expand the page from long IDs/tables');
 assert.ok(css.includes('.table-wrap{overflow:auto;max-width:100%;'),'Growth tables must scroll inside their panel');
 assert.ok(css.includes('.grid.two,.form-grid{grid-template-columns:minmax(0,1fr)}'),'mobile Growth grid must retain a zero minimum track');
 assert.ok(spec.includes('async function expectNoPageHorizontalOverflow(page)'),'browser UAT must assert page-level horizontal containment');
 assert.match(spec,/channel-mapping-save[\s\S]{0,900}expectNoPageHorizontalOverflow\(page\)/,'channel mapping refresh must preserve mobile viewport containment');
});
await test('Growth mobile header actions wrap inside the viewport',()=>{
 const css=fs.readFileSync(path.join(root,'assets/growth-suite.css'),'utf8');
 assert.ok(css.includes('.header-actions{display:flex;align-items:center;gap:10px;min-width:0;max-width:100%}'),'Growth header actions need shrink containment');
 assert.ok(css.includes('.header-actions{width:100%;flex-wrap:wrap}'),'mobile Growth header actions must wrap instead of widening the page');
 assert.ok(css.includes('.header-actions>*{min-width:0;max-width:100%}'),'mobile header action flex children must be shrinkable');
 assert.ok(css.includes('.header-actions .btn,.header-actions .pill{white-space:normal;overflow-wrap:anywhere}'),'long mobile header action labels must wrap inside the viewport');
});
await test('root CSP does not require unsafe-inline scripts',()=>{
 const ht=fs.readFileSync(path.join(root,'.htaccess'),'utf8');
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(ht,/script-src 'self';/);
 assert.doesNotMatch(index,/<script(?![^>]*\bsrc=)[^>]*>/i);
});
console.log(`${passed} passed; ${failed} failed`);process.exitCode=failed?1:0;
