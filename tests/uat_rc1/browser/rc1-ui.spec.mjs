import {test, expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE=(process.env.TAMASYA_UAT_BASE_URL||'http://127.0.0.1:38184').replace(/\/$/,'');
const LOGDIR=path.resolve('tests/uat_rc1/logs');
fs.mkdirSync(LOGDIR,{recursive:true});
const username=process.env.APP_BOOTSTRAP_ADMIN_USERNAME||'admin';
const password=process.env.APP_BOOTSTRAP_ADMIN_PASSWORD||'Tamasya-UAT-RC1-Only!';

function writeEvidence(name,info,data){
  fs.writeFileSync(path.join(LOGDIR,`browser-${name}-${info.project.name}.json`),JSON.stringify(data,null,2));
}

async function installAuth(page,request){
  const r=await request.post(`${BASE}/api.php?action=login`,{
    headers:{Origin:BASE,'X-Device-ID':'uat-browser-rc1','Content-Type':'application/json'},
    data:{username,password,offlineSessionScopeId:'offline_browser_rc1'}
  });
  expect(r.status()).toBe(200);
  const s=await r.json();
  expect(s.success).toBe(true);expect(s.token).toBeTruthy();
  await page.addInitScript(({token,base,role,permissions,staffId})=>{
    sessionStorage.setItem('hotel_logged_in','true');
    sessionStorage.setItem('hotel_session_token',token);
    sessionStorage.setItem('hotel_staff_role',role||'admin');
    sessionStorage.setItem('hotel_role',role||'admin');
    sessionStorage.setItem('hotel_staff_id',staffId||'');
    sessionStorage.setItem('hotel_permissions',JSON.stringify(permissions||{}));
    sessionStorage.setItem('tamasya_active_api_url',base+'/api.php');
    localStorage.setItem('hotel_device_id','uat-browser-rc1');
  },{token:s.token,base:BASE,role:s.role,permissions:s.permissions,staffId:s.staffId});
  return s;
}

async function blockExternal(page){
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(['127.0.0.1','localhost'].includes(u.hostname))return route.continue();
    return route.abort();
  });
}

async function waitLoaded(page){
  const loading=page.locator('#loading');
  if(await loading.count())await loading.waitFor({state:'hidden',timeout:15000}).catch(()=>{});
}

test.beforeEach(async({page,request})=>{
  await blockExternal(page);
  await installAuth(page,request);
});

test('PMS interactive login, session persistence and module dock',async({browser},info)=>{
  const context=await browser.newContext({viewport:info.project.name==='mobile'?{width:390,height:844}:{width:1440,height:1000},isMobile:info.project.name==='mobile',hasTouch:info.project.name==='mobile',serviceWorkers:'block'});
  const page=await context.newPage();
  await blockExternal(page);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${BASE}/index.html`);
  const user=page.getByPlaceholder('Contoh: admin, reps, finance, manager');
  const pass=page.getByPlaceholder('Masukkan password Anda...');
  const submit=page.getByRole('button',{name:'Masuk ke Konsol'});
  await expect(user).toBeVisible();await expect(pass).toBeVisible();await expect(submit).toBeVisible();
  await user.fill(username);await pass.fill(password);
  const login=page.waitForResponse(r=>r.url().includes('action=login')||r.url().endsWith('/api/login'));
  await submit.click();const response=await login;expect(response.status()).toBe(200);
  await expect.poll(()=>page.evaluate(()=>Boolean(sessionStorage.getItem('hotel_session_token')))).toBe(true);
  await page.reload();await expect.poll(()=>page.evaluate(()=>Boolean(sessionStorage.getItem('hotel_session_token')))).toBe(true);
  await expect(page.locator('#tamasya-pos-menu')).toHaveAttribute('href','./pos.html');
  await expect(page.locator('#tamasya-growth-menu')).toHaveAttribute('href','./growth-suite.html');
  await expect(page.locator('#tamasya-enterprise-menu')).toHaveAttribute('href','./enterprise-suite.html');
  expect(errors).toEqual([]);
  writeEvidence('login-module-dock',info,{pass:true,modules:['pos','growth','enterprise']});
  await context.close();
});

test('Main PMS navigation: every admin route opens and exposes controls without browser crash',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/index.html');
  await expect(page.locator('#tab-dashboard')).toBeVisible();
  const visited=[];
  for(const id of ['tab-dashboard','tab-finance','tab-report','tab-website']){
    const el=page.locator('#'+id);
    if(await el.count() && await el.isVisible()){
      await el.click();await page.waitForTimeout(120);
      visited.push({route:id.replace('tab-',''),controls:await page.locator('main button:visible, main input:visible, main select:visible, main textarea:visible').count()});
    }
  }
  for(const domain of ['frontoffice','operations','hr','system']){
    const opener=page.locator(`#domain-${domain}`);
    if(!(await opener.count()) || !(await opener.isVisible()))continue;
    await opener.click();
    const routes=await page.locator(`[role="menu"] [data-route]`).evaluateAll(xs=>xs.map(x=>x.getAttribute('data-route')).filter(Boolean));
    for(const route of routes){
      if((await opener.getAttribute('aria-expanded'))!=='true')await opener.click();
      const item=page.locator(`[role="menu"] [data-route="${route}"]`);
      if(await item.count() && await item.isVisible()){
        await item.click();await page.waitForTimeout(120);
        visited.push({route,controls:await page.locator('main button:visible, main input:visible, main select:visible, main textarea:visible').count()});
      }
    }
  }
  const unique=new Set(visited.map(x=>x.route));
  for(const required of ['dashboard','rooms','reservations','finance','report','operations','inventory','telegram','staff','attendance','leaves','savings','config','db_config','local_connect'])expect(unique.has(required)).toBe(true);
  expect(errors).toEqual([]);
  writeEvidence('main-pms-navigation',info,{pass:true,visited});
});

// Every static control in the standalone enterprise pages is exercised at least at wiring level.
// This is intentionally separate from business assertions: a click alone never certifies money/accounting correctness.
const staticPages=[
  ['property-setup.html',20],['pos.html',45],['growth-suite.html',80],['enterprise-suite.html',85],['multi-property-foundation.html',8]
];
for(const [file,minControls] of staticPages){
  test(`${file}: complete static control wiring sweep`,async({page},info)=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss().catch(()=>{}));
    await page.goto('/'+file);await waitLoaded(page);
    await page.evaluate(()=>{window.print=()=>{window.__uatPrintCount=(window.__uatPrintCount||0)+1;};});
    const controls=await page.locator('button,input:not([type="hidden"]),select,textarea,a[href]').evaluateAll(xs=>xs.map((x,i)=>({
      i,tag:x.tagName.toLowerCase(),id:x.id||null,type:x.getAttribute('type')||null,text:(x.innerText||x.getAttribute('aria-label')||x.getAttribute('placeholder')||'').trim().slice(0,120),
      dataTab:x.getAttribute('data-tab'),dataView:x.getAttribute('data-view'),href:x.getAttribute('href')
    })));
    expect(controls.length).toBeGreaterThanOrEqual(minControls);
    // Trigger every button handler. Invalid/empty forms are allowed to reject; browser crashes are not.
    const buttonCount=await page.locator('button').count();
    for(let i=0;i<buttonCount;i++){
      const b=page.locator('button').nth(i);
      if(!(await b.count()))continue;
      await b.evaluate(el=>{try{el.click()}catch(e){window.__uatClickErrors=(window.__uatClickErrors||[]).concat(String(e))}}).catch(()=>{});
      await page.waitForTimeout(15);
    }
    // Exercise value/control event bindings without inventing business data.
    await page.locator('input:not([type="hidden"]),select,textarea').evaluateAll(xs=>xs.forEach(el=>{
      try{
        el.dispatchEvent(new Event('focus',{bubbles:true}));
        if(el.type==='checkbox'){el.checked=!el.checked;el.dispatchEvent(new Event('change',{bubbles:true}));el.checked=!el.checked;el.dispatchEvent(new Event('change',{bubbles:true}));}
        else if(el.tagName==='SELECT'&&el.options.length){el.selectedIndex=Math.min(1,el.options.length-1);el.dispatchEvent(new Event('change',{bubbles:true}));}
        el.dispatchEvent(new Event('blur',{bubbles:true}));
      }catch(e){window.__uatControlErrors=(window.__uatControlErrors||[]).concat(String(e))}
    }));
    const localErrors=await page.evaluate(()=>({click:window.__uatClickErrors||[],controls:window.__uatControlErrors||[]}));
    expect(localErrors.click).toEqual([]);expect(localErrors.controls).toEqual([]);expect(errors).toEqual([]);
    writeEvidence('static-'+file.replaceAll('/','-'),info,{pass:true,file,controls:controls.length,buttons:buttonCount,inventory:controls});
  });
}

test('Property setup: save, refresh, finalize and persisted reload',async({page},info)=>{
  await page.goto('/property-setup.html');
  const name=page.locator('#propertyName');await expect(name).toHaveValue(/.+/);
  const original=await name.inputValue();const candidate=`SIMULATION HOTEL ${info.project.name}`;
  await name.fill(candidate);
  const save=page.waitForResponse(r=>r.url().includes('action=property-setup')&&r.url().includes('command=save'));
  await page.locator('#save').click();expect((await save).status()).toBe(200);
  await page.reload();await expect(name).toHaveValue(candidate);
  const refresh=page.waitForResponse(r=>r.url().includes('action=property-setup')&&r.url().includes('command=status'));
  await page.locator('#refresh').click();expect((await refresh).status()).toBe(200);
  await name.fill(original);
  const restore=page.waitForResponse(r=>r.url().includes('action=property-setup')&&r.url().includes('command=save'));
  await page.locator('#save').click();expect((await restore).status()).toBe(200);
  await expect(page.locator('#finalize')).toBeEnabled();
  const finalized=page.waitForResponse(r=>r.url().includes('action=property-setup')&&r.url().includes('command=finalize'));
  await page.locator('#finalize').click();expect((await finalized).status()).toBe(200);
  writeEvidence('property-setup-behavior',info,{pass:true});
});

test('POS UI: tabs, product, cart, sale, receipt, void, stock and category lifecycle',async({page},info)=>{
  await page.goto('/pos.html');await page.evaluate(()=>{window.print=()=>{window.__uatPrintCount=(window.__uatPrintCount||0)+1;};});await expect(page.locator('#product-grid [data-product]').first()).toBeVisible();
  for(const view of ['cashier','products','stock','sales','deliveries']){await page.locator(`[data-view="${view}"]`).click();await expect(page.locator(`#view-${view}`)).toBeVisible();}
  await page.locator('[data-view="products"]').click();await page.locator('#add-product-btn').click();await expect(page.locator('#product-dialog')).toBeVisible();await page.locator('#cancel-product-dialog').click();
  await page.locator('#add-product-btn').click();
  const sku=`UI-${info.project.name}-${Date.now()}`;await page.locator('#product-sku').fill(sku);await page.locator('#product-name').fill('UAT '+sku);await page.locator('#product-cost').fill('1000');await page.locator('#product-price').fill('2000');await page.locator('#product-initial-stock').fill('5');
  const saved=page.waitForResponse(r=>r.url().includes('action=pos-product-save')&&r.request().method()==='POST');await page.locator('#save-product').click();expect((await saved).status()).toBe(200);
  await page.locator('[data-view="cashier"]').click();await page.locator('#product-search').fill(sku);const product=page.locator('#product-grid [data-product]').filter({hasText:sku});await expect(product).toHaveCount(1);await product.click();await expect(page.locator('#checkout-btn')).toBeEnabled();
  const sold=page.waitForResponse(r=>r.url().includes('action=pos-sale-create')&&r.request().method()==='POST');await page.locator('#checkout-btn').click();const sr=await sold;expect(sr.status()).toBe(200);const sale=(await sr.json()).sale;expect(sale?.receiptNumber).toBeTruthy();
  await expect(page.locator('#receipt-dialog')).toBeVisible();await page.locator('#print-receipt').click();await page.locator('#close-receipt').click();
  await page.locator('[data-view="sales"]').click();const listed=page.waitForResponse(r=>r.url().includes('action=pos-sales'));await page.locator('#load-sales').click();expect((await listed).status()).toBe(200);
  const row=page.locator('#sales-table tr').filter({hasText:sale.receiptNumber});await expect(row).toBeVisible();page.once('dialog',d=>d.accept('UAT void'));
  const voided=page.waitForResponse(r=>r.url().includes('action=pos-sale-void'));await row.getByRole('button',{name:'Void'}).click();expect((await voided).status()).toBe(200);
  await page.locator('[data-view="stock"]').click();const option=page.locator('#stock-product option').filter({hasText:sku});const pid=await option.getAttribute('value');await page.locator('#stock-product').selectOption(pid);await page.locator('#stock-delta').fill('2');await page.locator('#stock-reason').fill('UAT browser stock');const adjusted=page.waitForResponse(r=>r.url().includes('action=pos-stock-adjust'));await page.locator('#stock-form button[type="submit"]').click();expect((await adjusted).status()).toBe(200);
  await page.locator('[data-view="products"]').click();await page.locator('#manage-categories-btn').click();const category=`UI Category ${Date.now()}`;await page.locator('#category-name').fill(category);const cs=page.waitForResponse(r=>r.url().includes('action=pos-category-save'));await page.locator('#save-category').click();expect((await cs).status()).toBe(200);await expect(page.locator('#categories-table')).toContainText(category);await page.locator('#cancel-category-dialog').click();
  writeEvidence('pos-lifecycle',info,{pass:true,sku,receipt:sale.receiptNumber});
});

test('Growth Suite UI: all tabs plus active controls and every business form submits',async({page},info)=>{
  await page.goto('/growth-suite.html');await waitLoaded(page);await expect(page.locator('#tabs')).toBeVisible();
  for(const tab of ['overview','kpi','rate','group','folio','procurement','integrations']){await page.locator(`[data-tab="${tab}"]`).click();await expect(page.locator(`#tab-${tab}`)).toBeVisible();}
  const refresh=page.waitForResponse(r=>r.url().includes('action=growth-suite')&&r.url().includes('command=bootstrap'));await page.locator('#refresh-bootstrap').click();expect((await refresh).status()).toBe(200);
  await page.locator('[data-tab="kpi"]').click();const kpi=page.waitForResponse(r=>r.url().includes('command=kpis'));await page.locator('#load-kpi').click();expect((await kpi).status()).toBe(200);
  await page.locator('[data-tab="rate"]').click();const code=`UIR${Date.now()}`;await page.locator('#rate-code').fill(code);await page.locator('#rate-name').fill('UI Rate');await page.locator('#rate-room-type').selectOption({label:'SIM Deluxe'}).catch(async()=>page.locator('#rate-room-type').selectOption({index:1}));await page.locator('#rate-base').fill('200000');await page.locator('#rate-min').fill('150000');await page.locator('#rate-max').fill('300000');const rate=page.waitForResponse(r=>r.url().includes('command=rate-plan-save'));await page.locator('#rate-plan-form button[type="submit"]').click();expect((await rate).status()).toBe(200);await waitLoaded(page);
  await expect(page.locator('#suggest-plan option')).not.toHaveCount(1);await page.locator('#suggest-plan').selectOption({index:1});const suggestion=page.waitForResponse(r=>r.url().includes('command=rate-suggestion'));await page.locator('#run-suggestion').click();expect((await suggestion).status()).toBe(200);
  await page.locator('#rule-plan').selectOption({index:1});await page.locator('#rule-name').fill('UI Rule');await page.locator('#rule-value').fill('5');const rule=page.waitForResponse(r=>r.url().includes('command=rate-rule-save'));await page.locator('#rate-rule-form button[type="submit"]').click();expect((await rule).status()).toBe(200);
  await page.locator('#override-plan').selectOption({index:1});await page.locator('#override-rate').fill('210000');const over=page.waitForResponse(r=>r.url().includes('command=rate-override-save'));await page.locator('#rate-override-form button[type="submit"]').click();expect((await over).status()).toBe(200);
  await page.locator('[data-tab="group"]').click();await page.locator('#company-code').fill(`UIC${Date.now()}`);await page.locator('#company-name').fill('UI Corporate');const company=page.waitForResponse(r=>r.url().includes('command=company-save'));await page.locator('#company-form button[type="submit"]').click();expect((await company).status()).toBe(200);await waitLoaded(page);
  await page.locator('#group-name').fill('UI Group');await page.locator('#group-room-block').fill('1');const group=page.waitForResponse(r=>r.url().includes('command=group-save'));await page.locator('#group-form button[type="submit"]').click();expect((await group).status()).toBe(200);
  await page.locator('#booking-search').fill('SIM');const bs=page.waitForResponse(r=>r.url().includes('command=booking-search'));await page.locator('#do-booking-search').click();expect((await bs).status()).toBe(200);
  await page.locator('[data-tab="folio"]').click();await page.locator('#folio-search').fill('SIM');const fsr=page.waitForResponse(r=>r.url().includes('command=booking-search'));await page.locator('#folio-search-btn').click();expect((await fsr).status()).toBe(200);await page.evaluate(()=>{window.print=()=>{window.__printed=true}});await page.locator('#print-folio').click();
  await page.locator('[data-tab="procurement"]').click();await page.locator('#vendor-code').fill(`UIV${Date.now()}`);await page.locator('#vendor-name').fill('UI Vendor');const vendor=page.waitForResponse(r=>r.url().includes('command=vendor-save'));await page.locator('#vendor-form button[type="submit"]').click();expect((await vendor).status()).toBe(200);await waitLoaded(page);await page.locator('#po-vendor').selectOption({index:1});await page.locator('#po-item').fill('UI supplies');await page.locator('#po-qty').fill('1');await page.locator('#po-price').fill('1000');const po=page.waitForResponse(r=>r.url().includes('command=po-save'));await page.locator('#po-form button[type="submit"]').click();expect((await po).status()).toBe(200);
  await page.locator('[data-tab="integrations"]').click();await page.locator('#channel-code').fill('uat-ui');await page.locator('#channel-external-room').fill('DELUXE');await page.locator('#channel-internal-room').selectOption({index:1});await page.locator('#channel-external-rate').fill('BAR');const mapping=page.waitForResponse(r=>r.url().includes('command=channel-mapping-save'));await page.locator('#channel-form button[type="submit"]').click();expect((await mapping).status()).toBe(200);
  const bookingId=await page.evaluate(async()=>{const r=await fetch('./api.php?action=hotel-data',{headers:{Authorization:'Bearer '+sessionStorage.getItem('hotel_session_token'),'X-Device-ID':'uat-browser-rc1','X-Tamasya-Offline-Session-Scope':'offline_browser_rc1'}});const d=await r.json();return (d.bookings||[]).find(x=>Number(x.balanceDue)>0)?.id||''});
  expect(bookingId).toBeTruthy();await page.locator('#payment-booking').fill(bookingId);await page.locator('#payment-provider').fill('uat-ui');await page.locator('#payment-amount').fill('1');const pi=page.waitForResponse(r=>r.url().includes('command=payment-intent-create'));await page.locator('#payment-intent-form button[type="submit"]').click();expect((await pi).status()).toBe(200);
  writeEvidence('growth-suite-forms',info,{pass:true});
});

test('Enterprise Suite UI: all tabs, refresh, finance views and representative forms',async({page},info)=>{
  await page.goto('/enterprise-suite.html');await waitLoaded(page);await expect(page.locator('#tabs')).toBeVisible();
  for(const tab of ['overview','folio','ap','crm','health','adapters']){await page.locator(`[data-tab="${tab}"]`).click();await expect(page.locator(`#tab-${tab}`)).toBeVisible();}
  const refresh=page.waitForResponse(r=>r.url().includes('action=enterprise-suite')&&r.url().includes('command=bootstrap'));await page.locator('#refresh').click();expect((await refresh).status()).toBe(200);
  const forecast=page.waitForResponse(r=>r.url().includes('command=revenue-forecast'));await page.locator('#forecast-refresh').click();expect((await forecast).status()).toBe(200);
  const accounting=page.waitForResponse(r=>r.url().includes('command=accounting-summary'));await page.locator('#accounting-refresh').click();expect((await accounting).status()).toBe(200);
  await page.locator('[data-tab="ap"]').click();await page.locator('#pr-dept').fill('UI');await page.locator('#pr-item').fill('UI PR Item');await page.locator('#pr-qty').fill('1');await page.locator('#pr-price').fill('1000');await page.locator('#pr-reason').fill('UI UAT');const pr=page.waitForResponse(r=>r.url().includes('command=pr-save'));await page.locator('#pr-form button[type="submit"]').click();expect((await pr).status()).toBe(200);
  await page.locator('[data-tab="crm"]').click();await page.locator('#guest-q').fill('SIM');const gs=page.waitForResponse(r=>r.url().includes('command=guest-search'));await page.locator('#guest-search').click();expect((await gs).status()).toBe(200);
  const guest=await page.evaluate(async()=>{const token=sessionStorage.getItem('hotel_session_token');const r=await fetch('./api.php?action=enterprise-suite&command=guest-search&q=SIM',{headers:{Authorization:'Bearer '+token,'X-Device-ID':'uat-browser-rc1','X-Tamasya-Offline-Session-Scope':'offline_browser_rc1'}});const d=await r.json();return d.data?.[0]?.id||''});
  if(guest){await page.locator('#consent-guest').fill(guest);await page.locator('#consent-evidence').fill('UI UAT');const c=page.waitForResponse(r=>r.url().includes('command=consent-save'));await page.locator('#consent-form button[type="submit"]').click();expect((await c).status()).toBe(200);await page.locator('#points-guest').fill(guest);await page.locator('#points-value').fill('5');await page.locator('#points-reason').fill('UI UAT');const p=page.waitForResponse(r=>r.url().includes('command=loyalty-adjust'));await page.locator('#points-form button[type="submit"]').click();expect((await p).status()).toBe(200);}
  await page.locator('#segment-code').fill(`UIS${Date.now()}`);await page.locator('#segment-name').fill('UI Segment');const seg=page.waitForResponse(r=>r.url().includes('command=crm-segment-save'));await page.locator('#segment-form button[type="submit"]').click();expect((await seg).status()).toBe(200);await waitLoaded(page);
  await page.locator('#campaign-name').fill('UI Campaign');await page.locator('#campaign-subject').fill('UI');await page.locator('#campaign-message').fill('UI {{guest_name}}');const camp=page.waitForResponse(r=>r.url().includes('command=crm-campaign-save'));await page.locator('#campaign-form button[type="submit"]').click();expect((await camp).status()).toBe(200);
  await page.locator('[data-tab="health"]').click();const health=page.waitForResponse(r=>r.url().includes('command=health'));await page.locator('#health-refresh').click();expect((await health).status()).toBe(200);await page.locator('#health-code').fill(`UI_${Date.now()}`);await page.locator('#health-metric').fill('unbalanced_journal_entries');await page.locator('#health-threshold').fill('0');const hr=page.waitForResponse(r=>r.url().includes('command=health-rule-save'));await page.locator('#health-rule-form button[type="submit"]').click();expect((await hr).status()).toBe(200);
  await page.locator('[data-tab="adapters"]').click();await page.locator('#adapter-provider').fill(`ui-${Date.now()}`);await page.locator('#adapter-mode').selectOption('sandbox');await page.locator('#adapter-verifier').fill('hmac_sha256');await page.locator('#adapter-active').check();await page.locator('#adapter-config').fill('{"uat":true}');const ad=page.waitForResponse(r=>r.url().includes('command=provider-adapter-save'));await page.locator('#adapter-form button[type="submit"]').click();expect((await ad).status()).toBe(200);
  writeEvidence('enterprise-suite-forms',info,{pass:true});
});

test('Multi-property buttons: preview, snapshot, queue, manifest, contracts, outbox and disabled bridge',async({page},info)=>{
  await page.goto('/multi-property-foundation.html');await expect(page.locator('#status-cards .card')).toHaveCount(5);
  for(const [id,command] of [['refresh','overview'],['preview','summary-preview'],['manifest','manifest'],['contracts','capabilities'],['outbox','outbox']]){const r=page.waitForResponse(x=>x.url().includes('action=multi-property')&&x.url().includes(`command=${command}`));await page.locator('#'+id).click();expect((await r).status()).toBe(200);}
  const [snap,download]=await Promise.all([page.waitForResponse(r=>r.url().includes('command=snapshot-v2')),page.waitForEvent('download'),page.locator('#snapshot-v2').click()]);expect(snap.status()).toBe(200);expect(await download.path()).toBeTruthy();
  const queued=page.waitForResponse(r=>r.url().includes('command=queue-snapshot'));await page.locator('#queue-snapshot').click();expect([200,202]).toContain((await queued).status());
  const push=page.waitForResponse(r=>r.url().includes('command=push-summary'));await page.locator('#push-hq').click();expect((await push).status()).toBeGreaterThanOrEqual(400);
  writeEvidence('multi-property-controls',info,{pass:true});
});
