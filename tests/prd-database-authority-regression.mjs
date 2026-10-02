import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=process.argv[2]||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
let passed=0; const test=(n,f)=>{f();passed++;console.log(`PASS ${n}`)};

const helper=read('tests/uat_prd/mysql-bootstrap-runtime-boundary.sh');
const smoke=read('tests/uat_prd/run_saas_runtime_smoke.sh');
const workflow=read('.github/workflows/tamasya-enterprise-rc1-uat.yml');
const provision=read('deploy/provision_property.php');
const readme=read('deploy/README.md');

test('canonical schema is applied only with isolated migration authority in SaaS runtime simulation',()=>{
  assert.ok(helper.includes('-uroot "$DB_NAME" < "$schema"'));
  assert.ok(smoke.includes('mysql-bootstrap-runtime-boundary.sh'));
  assert.ok(!smoke.includes('-utamasya_ci tamasya_prd_saas < database_setup.sql'));
});

test('runtime identity is created only after schema import and receives an allowlisted DML profile',()=>{
  const apply=helper.indexOf('Applying schema as isolated migration authority');
  const create=helper.indexOf('CREATE USER IF NOT EXISTS');
  assert.ok(apply>=0 && create>apply);
  assert.ok(helper.includes('SELECT,INSERT,UPDATE,DELETE|SELECT,INSERT,UPDATE'));
  assert.ok(helper.includes('REVOKE ALL PRIVILEGES, GRANT OPTION'));
});

test('runtime account is forbidden from DDL, global administration and grant escalation',()=>{
  assert.ok(helper.includes('CREATE TABLE ${probe}'));
  assert.ok(helper.includes('SET GLOBAL log_bin_trust_function_creators=1'));
  for(const marker of ['ALL PRIVILEGES','CREATE','ALTER','DROP','TRIGGER','GRANT OPTION','SUPER']) assert.ok(helper.includes(marker),marker);
});

test('PMS simulation starts MySQL without auto-created broad application grants',()=>{
  const run=smoke.slice(smoke.indexOf('docker run -d --rm --name "$DB_CONTAINER"'), smoke.indexOf('TABLE_COUNT='));
  assert.ok(run.includes('MYSQL_ROOT_PASSWORD=root-ci-only'));
  assert.ok(run.includes('MYSQL_DATABASE=tamasya_prd_saas'));
  assert.ok(!run.includes('MYSQL_USER=tamasya_ci'));
  assert.ok(!run.includes('MYSQL_PASSWORD=tamasya-ci-only'));
});

test('HQ adapter simulation uses the same separated schema/runtime authority model',()=>{
  const hq=workflow.slice(workflow.indexOf('Execute HQ delivery and object-storage adapters'), workflow.indexOf('Re-run deployment and scale architecture guards'));
  assert.ok(hq.includes('mysql-bootstrap-runtime-boundary.sh'));
  assert.ok(hq.includes('SELECT,INSERT,UPDATE'));
  assert.ok(!hq.includes('-utamasya_ci tamasya_hq_prd < hq/schema.sql'));
  assert.ok(!hq.includes('MYSQL_USER=tamasya_ci'));
});

test('production property provisioning already encodes DBA schema import plus restricted runtime grants',()=>{
  assert.ok(provision.includes('GRANT SELECT,INSERT,UPDATE,DELETE'));
  assert.ok(provision.includes('Import database_setup.sql into $name using DBA; use runtime user only for the application.'));
});

test('deployment guidance forbids mounting migration credentials into runtime containers',()=>{
  assert.ok(readme.includes('migration/DBA'));
  assert.ok(readme.includes('tidak boleh di-mount'));
  assert.ok(readme.includes('runtime account'));
});

test('GitHub source gate and post-runtime guards execute the database authority regression',()=>{
  const occurrences=(workflow.match(/prd-database-authority-regression\.mjs/g)||[]).length;
  assert.ok(occurrences>=2,`expected >=2 workflow executions, got ${occurrences}`);
});

console.log(`${passed} passed; 0 failed`);
