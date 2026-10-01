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

await test('post-green Owner, Memo and Telegram direct-reply contracts stay wired',()=>{
 const policy=fs.readFileSync(path.join(root,'api/support/017_authorization_policy.php'),'utf8');
 const api=fs.readFileSync(path.join(root,'api.php'),'utf8');
 const auth=fs.readFileSync(path.join(root,'api/routes/050_auth_staff.php'),'utf8');
 const support=fs.readFileSync(path.join(root,'api/support/055_public_support_chat.php'),'utf8');
 const tg=fs.readFileSync(path.join(root,'api/routes/080_telegram_webhook.php'),'utf8');
 const memo=fs.readFileSync(path.join(root,'api/routes/118_internal_memos.php'),'utf8');
 const migration=fs.readFileSync(path.join(root,'migrations/V137_OPTIONAL_ENTERPRISE_COMPLETION.sql'),'utf8');
 const installer=fs.readFileSync(path.join(root,'optional_modules_install.php'),'utf8');
 const nav=fs.readFileSync(path.join(root,'assets/navigation-registry.js'),'utf8');
 const app=fs.readFileSync(path.join(root,'assets/app-core.js'),'utf8');
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.ok(policy.includes("strtolower(trim((string)($user['role'] ?? ''))) === 'owner'"));
 assert.ok(api.includes('tamasyaEnforceOwnerReadOnly($loggedInStaff, (string)$action)'),'global Owner write guard must run before route handlers');
 assert.ok(auth.includes("'admin','manager','receptionist','finance','owner'"),'Staff API must accept owner role');
 assert.ok(support.includes("'callback_data'=>'support_reply:'.$publicCode"),'website support notification must provide direct Reply button');
 assert.ok(tg.includes("telegram_state='waiting_for_support_reply'")&&tg.includes("$currentState === 'waiting_for_support_reply'"),'Telegram reply state must be server-side and consumed from normal text');
 assert.ok(tg.includes("$expiresAt=(int)($ctx['expiresAt']??0)")&&tg.includes('time()>$expiresAt'),'Telegram reply state must expire fail-closed');
 assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS growth_internal_memos'),'Memo must use official versioned Enterprise migration');
 assert.ok(installer.includes("'growth_internal_memos'"),'optional installer must own Memo schema');
 assert.ok(memo.includes("status='archived'")&&memo.includes("status='active'"),'Memo uses archive/restore, not hard delete');
 assert.ok(memo.includes("writeRequiredEnterpriseAudit"),'Memo mutations must be audited');
 assert.ok(nav.includes("id: 'memo'")&&nav.includes("['admin','finance','owner']"),'Memo module must be visible to Admin/Finance/Owner');
 assert.ok(app.includes('owner:db'),'Owner must receive every desktop tab in the UI permission map');
 assert.ok(app.includes('view_audit_log:n||s||i||o')&&app.includes('view_guest_identity:n||s||l||u||o'),'Owner gets only explicit view capabilities needed for full read-only inspection');
 assert.ok(app.includes('c!=="website"||e==="owner"||s.manage_public_website===!0'),'Owner can view Website tab without receiving website mutation capability');
 const staff=fs.readFileSync(path.join(root,'assets/chunks/staff.js'),'utf8');
 assert.ok(staff.includes('value:"owner",children:"Owner (Lihat Semua · Tidak Bisa Mengubah)"'),'Staff UI must expose the Owner read-only role');
 const growthRoute=fs.readFileSync(path.join(root,'api/routes/110_growth_suite.php'),'utf8');
 const enterpriseRoute=fs.readFileSync(path.join(root,'api/routes/112_enterprise_completion.php'),'utf8');
 const posRoute=fs.readFileSync(path.join(root,'api/routes/065_pos_minibar.php'),'utf8');
 assert.ok(growthRoute.includes("['admin','manager','finance','owner']")&&growthRoute.includes("['admin','owner']"),'Owner must receive full Growth read projections');
 assert.ok(enterpriseRoute.includes("$enterpriseRoles=['admin','manager','finance','owner']")&&enterpriseRoute.includes("['admin','manager','owner']"),'Owner must receive full Enterprise read projections');
 assert.ok(posRoute.includes("['admin','manager','finance','owner']"),'Owner must see POS cost data while mutation flags stay role-restricted');
 assert.ok(sw.includes('./internal-memo.html')&&sw.includes('./assets/internal-memo.js')&&sw.includes('./assets/internal-memo.css'),'Memo surface participates in offline/static cache contract');
});

await test('root CSP does not require unsafe-inline scripts',()=>{
 const ht=fs.readFileSync(path.join(root,'.htaccess'),'utf8');
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(ht,/script-src 'self';/);
 assert.doesNotMatch(index,/<script(?![^>]*\bsrc=)[^>]*>/i);
});
console.log(`${passed} passed; ${failed} failed`);process.exitCode=failed?1:0;
