import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=process.argv[2]||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
let passed=0;
function test(name,fn){fn();passed++;console.log(`PASS ${name}`);}

const compose=read('deploy/compose.yaml');
const saas=read('deploy/compose.saas.yaml');
const hq=read('deploy/compose.hq.yaml');
const nginx=read('deploy/nginx.conf');
const nginxSaas=read('deploy/nginx-saas.conf');
const nginxHq=read('deploy/nginx-hq.conf');
const dockerfile=read('deploy/Dockerfile');
const ignore=read('.dockerignore');

const workerCommand='command: [php, service_worker.php, daemon]';

test('VPS worker is opt-in and reuses canonical PHP worker authority',()=>{
  assert.ok(compose.includes('profiles: [workers]'));
  assert.ok(compose.includes(workerCommand));
  assert.ok(compose.includes('read_only: true'));
  assert.ok(compose.includes('no-new-privileges:true'));
  assert.ok(compose.includes('cap_drop: [ALL]'));
});

test('SaaS profile adds horizontal API replica without write retry at proxy',()=>{
  assert.ok(saas.includes('api2:'));
  assert.ok(saas.includes('depends_on: [api, api2]'));
  assert.ok(nginxSaas.includes('server api:9000; server api2:9000;'));
  assert.ok(nginxSaas.includes('fastcgi_next_upstream off;'));
});

test('HQ remains isolated with optional delivery worker and read-only realtime service',()=>{
  assert.ok(hq.includes('TAMASYA_HQ_CONFIG_FILE: /run/secrets/hq/config.json'));
  assert.ok(hq.includes('profiles: [delivery]'));
  assert.ok(hq.includes('command: [php, hq/delivery_worker.php, daemon]'));
  assert.ok(hq.includes('image: node:22-alpine'));
  assert.ok(hq.includes('user: node'));
  assert.ok(nginxHq.includes('root /var/www/tamasya/hq;'));
  assert.ok(nginxHq.includes('location ~ ^/(api|control_api)\\.php$'));
  assert.ok(nginxHq.includes('location ~ \\.php(?:/|$) { deny all; }'));
});

test('PMS proxy exposes only canonical PHP entries and never replays uncertain writes',()=>{
  assert.ok(nginx.includes('location ~ ^/(?:api|runtime_config|maintenance_cron)\\.php$'));
  assert.ok(nginx.includes('fastcgi_next_upstream off;'));
  assert.ok(nginx.includes('location ~ \\.php(?:/|$) { deny all; }'));
  assert.ok(nginx.includes('location /uploads/ { deny all; }'));
});

test('production image is non-root and excludes mutable/secrets/test payloads from build context',()=>{
  assert.ok(dockerfile.includes('USER www-data'));
  assert.ok(dockerfile.includes('php-fpm","-F'));
  for(const marker of ['.env','uploads','backups','node_modules','tests','db_credentials.php','private']) {
    assert.ok(ignore.includes(marker),`.dockerignore missing ${marker}`);
  }
});

console.log(`${passed} passed; 0 failed`);
