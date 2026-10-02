import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=process.argv[2]||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
let passed=0; const test=(n,f)=>{f();passed++;console.log(`PASS ${n}`)};

const smoke=read('tests/uat_prd/run_saas_runtime_smoke.sh');
const helper=read('tests/uat_prd/mysql-authenticated-ready.sh');
const workflow=read('.github/workflows/tamasya-enterprise-rc1-uat.yml');
const deployReadme=read('deploy/README.md');
const mysqlDigest='mysql:8.4@sha256:6ea90827b1100f8f2ae306a539f86d2c264a26ed435a2a9f75551dd5c3aeb242';

test('PRD runtime never treats mysqladmin ping as authenticated initialization readiness',()=>{
  assert.ok(!/docker exec[^\n]*mysqladmin\s+ping/.test(smoke));
  const prdJob=workflow.slice(workflow.indexOf('prd-deployment-profile-simulation:'), workflow.indexOf('full-uat:'));
  assert.ok(!/docker exec[^\n]*mysqladmin\s+ping/.test(prdJob));
});

test('readiness helper requires an authenticated TCP SELECT against the expected database',()=>{
  assert.ok(helper.includes('--protocol=TCP'));
  assert.ok(helper.includes('-h127.0.0.1'));
  assert.ok(helper.includes("-e 'SELECT 1'"));
  assert.ok(helper.includes('MYSQL_PWD'));
  assert.ok(helper.includes('grep -qx \'1\''));
});

test('readiness helper is bounded, detects dead containers and emits diagnostic logs on timeout',()=>{
  assert.ok(helper.includes('ATTEMPTS="${5:-60}"'));
  assert.ok(helper.includes("state=\"$(docker inspect -f '{{.State.Status}}'"));
  assert.ok(helper.includes('docker logs "$CONTAINER"'));
  assert.ok(helper.includes('exit 72'));
});

test('runtime smoke rejects wrong DB credentials instead of accepting process liveness as readiness',()=>{
  assert.ok(smoke.includes('MYSQL_PWD=definitely-wrong'));
  assert.ok(smoke.includes('unexpectedly accepted the wrong application password'));
  assert.ok(workflow.includes('HQ adapter MySQL unexpectedly accepted the wrong application password'));
});

test('schema bootstrap uses the runtime application account after authenticated initialization',()=>{
  assert.ok(smoke.includes('-utamasya_ci tamasya_prd_saas < database_setup.sql'));
  assert.ok(!smoke.includes('mysql -uroot -proot-ci-only tamasya_prd_saas < database_setup.sql'));
  assert.ok(workflow.includes('-utamasya_ci tamasya_hq_prd < hq/schema.sql'));
  assert.ok(workflow.includes('-utamasya_ci tamasya_hq_prd < hq/delivery_schema.sql'));
});

test('runtime smoke proves canonical table and trigger population before API readiness is accepted',()=>{
  assert.ok(smoke.includes('TABLE_COUNT'));
  assert.ok(smoke.includes('[[ "$TABLE_COUNT" -eq 113 ]]'));
  assert.ok(smoke.includes('TRIGGER_COUNT'));
  assert.ok(smoke.includes('[[ "$TRIGGER_COUNT" -eq 5 ]]'));
});

test('PRD auxiliary MySQL image is digest pinned while still overrideable for controlled updates',()=>{
  assert.ok(smoke.includes(mysqlDigest));
  assert.ok(smoke.includes('TAMASYA_PRD_MYSQL_IMAGE'));
  assert.ok(workflow.includes(mysqlDigest));
});

test('deployment runbook documents authenticated database readiness and non-DBA runtime policy',()=>{
  assert.ok(deployReadme.includes('Database readiness contract'));
  assert.ok(deployReadme.includes('`SELECT 1`'));
  assert.ok(deployReadme.includes('tidak boleh') && deployReadme.includes('mysqladmin ping'));
  assert.ok(deployReadme.includes('credential non-DBA'));
});

console.log(`${passed} passed; 0 failed`);
