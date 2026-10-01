from client import *
from scenario_core import db
import json, os, urllib.request, urllib.error, uuid

results=[]
run='postgreen_'+uuid.uuid4().hex[:10]

def check(name,ok,detail=None):
    results.append({'test':name,'pass':bool(ok),'details':detail})
    print('PASS' if ok else 'FAIL',name,str(detail or '')[:900],flush=True)
    (base/'logs/post-green-feature-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')

def raw_login(username,password,scope):
    payload=json.dumps({'username':username,'password':password,'offlineSessionScopeId':scope}).encode('utf8')
    req=urllib.request.Request(BASE_URL+'/api.php?action=login',data=payload,headers={'Origin':ORIGIN,'X-Device-ID':DEVICE_ID,'Content-Type':'application/json'},method='POST')
    try: resp=urllib.request.urlopen(req,timeout=90)
    except urllib.error.HTTPError as e: resp=e
    body=json.loads(resp.read().decode('utf8','replace') or '{}')
    return int(resp.status),body

def as_session(session, fn):
    p=base/'session.json'
    old=p.read_text(encoding='utf8') if p.exists() else None
    p.write_text(json.dumps(session,ensure_ascii=False,indent=2),encoding='utf8')
    try: return fn()
    finally:
        if old is None: p.unlink(missing_ok=True)
        else: p.write_text(old,encoding='utf8')

# ----- Internal Memo: persistence, audit, archive/restore, RBAC -----
status,memo=request('internal-memos','POST',{
    'command':'create','title':'UAT Internal Memo '+run,'body':'Catatan audit internal untuk Finance dan Admin. '+run,
    'category':'finance','priority':'high'
},run+'_memo_create')
check('Admin can create an internal memo',status==200 and memo.get('success') is True and bool((memo.get('data') or {}).get('id')),memo)
memo_id=(memo.get('data') or {}).get('id')
if memo_id:
    rows=db('SELECT id,title,status,category,priority,created_by FROM growth_internal_memos WHERE id=?',[memo_id])
    check('Memo persists in official Enterprise table',len(rows)==1 and rows[0]['status']=='active' and rows[0]['category']=='finance' and rows[0]['priority']=='high',rows)
    audits=db("SELECT entity_type,entity_id,action FROM audit_logs WHERE entity_type='growth_internal_memo' AND entity_id=? ORDER BY created_at DESC",[memo_id])
    check('Memo create writes required enterprise audit',len(audits)>=1,audits)
    status,upd=request('internal-memos','PUT',{'command':'update','id':memo_id,'title':'UAT Memo Updated '+run,'priority':'urgent'},run+'_memo_update')
    check('Admin can update memo without replacing row',status==200 and upd.get('success') is True and (upd.get('data') or {}).get('id')==memo_id,upd)
    status,arc=request('internal-memos','PUT',{'command':'archive','id':memo_id},run+'_memo_archive')
    check('Memo archive is non-destructive',status==200 and arc.get('success') is True and db('SELECT status FROM growth_internal_memos WHERE id=?',[memo_id])[0]['status']=='archived',arc)
    check('Archived memo row still exists',int(db('SELECT COUNT(*) n FROM growth_internal_memos WHERE id=?',[memo_id])[0]['n'])==1)
    status,rest=request('internal-memos','PUT',{'command':'restore','id':memo_id},run+'_memo_restore')
    check('Archived memo can be restored',status==200 and rest.get('success') is True and db('SELECT status FROM growth_internal_memos WHERE id=?',[memo_id])[0]['status']=='active',rest)
    check('Memo lifecycle writes audit on every mutation',int(db("SELECT COUNT(*) n FROM audit_logs WHERE entity_type='growth_internal_memo' AND entity_id=?",[memo_id])[0]['n'])>=4,db("SELECT action,created_at FROM audit_logs WHERE entity_type='growth_internal_memo' AND entity_id=? ORDER BY created_at",[memo_id]))
    status,listing=request('action=internal-memos&status=all&q='+run,'GET')
    check('Memo search/status filter returns exact memo',status==200 and any(x.get('id')==memo_id for x in (listing.get('data') or [])),listing)

# Finance role uses a real account cloned from the bootstrap hash to avoid weakening password/auth logic.
admin=db("SELECT id,password FROM staff WHERE username=? LIMIT 1",[os.getenv('APP_BOOTSTRAP_ADMIN_USERNAME','admin')])[0]
finance_user='uat_fin_'+run[-6:]
finance_id='uat_finance_'+run[-8:]
db('DELETE FROM staff WHERE id=? OR username=?',[finance_id,finance_user])
db("INSERT INTO staff(id,name,username,password,role,status,salary,password_changed_at,require_password_change) VALUES (?,?,?,?,?,'active',0,CURRENT_TIMESTAMP,0)",[finance_id,'UAT Finance Memo',finance_user,admin['password'],'finance'])
# We intentionally login using the same bootstrap password whose hash was cloned.
finance_password=os.getenv('APP_BOOTSTRAP_ADMIN_PASSWORD','Tamasya-UAT-RC1-Only!')
fs,fb=raw_login(finance_user,finance_password,'offline_finance_uat_'+run)
check('Finance fixture authenticates through canonical login',fs==200 and fb.get('role')=='finance' and bool(fb.get('token')),fb)
if fs==200:
    def finance_ops():
        s1,b1=request('internal-memos','POST',{'command':'create','title':'Finance Memo '+run,'body':'Finance may create internal memo','category':'finance','priority':'normal'},run+'_finance_memo')
        fid=(b1.get('data') or {}).get('id') if isinstance(b1,dict) else None
        s2,b2=request('internal-memos','GET')
        s3,b3=request('internal-memos','PUT',{'command':'update','id':fid,'body':'Finance updated memo through canonical API','priority':'high'},run+'_finance_memo_update') if fid else (0,{})
        return s1,b1,s2,b2,s3,b3
    s1,b1,s2,b2,s3,b3=as_session(fb,finance_ops)
    check('Finance can create memo',s1==200 and b1.get('success') is True,b1)
    check('Finance can read memo board',s2==200 and b2.get('success') is True,b2)
    check('Finance can update memo',s3==200 and b3.get('success') is True and (b3.get('data') or {}).get('priority')=='high',b3)

# ----- Owner: all-read, global server-side no-write -----
owner_username='uat_owner_'+run[-6:]
owner_password='Owner-UAT-RC1-Only!42x'
status,created=request('staff','POST',{'name':'UAT Owner Read Only','username':owner_username,'password':owner_password,'role':'owner','salary':0},run+'_owner_create')
check('Admin can create official Owner role through Staff API',status==200 and created.get('success') is not False,created)
owner_rows=db('SELECT id,role,status FROM staff WHERE username=?',[owner_username])
check('Owner role persists exactly as owner',len(owner_rows)==1 and owner_rows[0]['role']=='owner' and owner_rows[0]['status']=='active',owner_rows)
oscope='offline_owner_uat_'+run
os,ob=raw_login(owner_username,owner_password,oscope)
check('Owner authenticates through canonical login',os==200 and ob.get('role')=='owner' and bool(ob.get('token')),ob)

if os==200:
    def owner_suite():
        reads=[]
        for label,action in [
            ('hotel_data','hotel-data'),('staff','staff'),('support','public-support-inbox'),
            ('memo','internal-memos'),('growth','action=growth-suite&command=bootstrap'),
            ('enterprise','action=enterprise-suite&command=bootstrap'),('enterprise_adapters','action=enterprise-suite&command=provider-adapters'),('multi_property','action=multi-property&command=overview'),
            ('pos_products','pos-products')
        ]:
            s,b=request(action,'GET'); reads.append((label,s,b))
        # Snapshot canonical state before direct API bypass attempts.
        snap={
            'transactions':int(db('SELECT COUNT(*) n FROM transactions')[0]['n']),
            'bookings':int(db('SELECT COUNT(*) n FROM bookings')[0]['n']),
            'staff':int(db('SELECT COUNT(*) n FROM staff')[0]['n']),
            'memos':int(db('SELECT COUNT(*) n FROM growth_internal_memos')[0]['n']),
            'journals':int(db('SELECT COUNT(*) n FROM journal_entries')[0]['n'])
        }
        mutations=[]
        probes=[
            ('booking','bookings',{'guestName':'OWNER MUST FAIL','roomNumber':'101','checkIn':'2099-01-01','checkOut':'2099-01-02','totalAmount':1}),
            ('transaction','transactions',{'type':'income','amount':1,'description':'OWNER MUST FAIL'}),
            ('shift','operations-center',{'command':'shift-open','openingCash':0,'shiftTime':'siang'}),
            ('pos','pos-product-save',{'sku':'OWNERFAIL','name':'OWNER MUST FAIL','price':1}),
            ('growth','growth-suite',{'command':'rate-plan-save','code':'OWNERFAIL','name':'OWNER MUST FAIL','baseRate':1}),
            ('enterprise','enterprise-suite',{'command':'pr-save','department':'OWNER','reason':'OWNER MUST FAIL','items':[]}),
            ('staff','staff',{'name':'OWNER FAIL','username':'owner_fail_x','password':'Owner-Fail-Only!123','role':'receptionist'}),
            ('memo','internal-memos',{'command':'create','title':'OWNER FAIL','body':'OWNER MUST NOT CREATE'})
        ]
        for label,action,payload in probes:
            s,b=request(action,'POST',payload,run+'_owner_'+label)
            mutations.append((label,s,b))
        after={
            'transactions':int(db('SELECT COUNT(*) n FROM transactions')[0]['n']),
            'bookings':int(db('SELECT COUNT(*) n FROM bookings')[0]['n']),
            'staff':int(db('SELECT COUNT(*) n FROM staff')[0]['n']),
            'memos':int(db('SELECT COUNT(*) n FROM growth_internal_memos')[0]['n']),
            'journals':int(db('SELECT COUNT(*) n FROM journal_entries')[0]['n'])
        }
        return reads,mutations,snap,after
    reads,mutations,before,after=as_session(ob,owner_suite)
    for label,s,b in reads:
        check('Owner can read '+label,s==200 and b.get('success') is not False,{'status':s,'body':b})
    read_map={label:b for label,s,b in reads if s==200 and isinstance(b,dict)}
    growth_data=(read_map.get('growth') or {}).get('data') or {}
    enterprise_data=(read_map.get('enterprise') or {}).get('data') or {}
    pos_data=read_map.get('pos_products') or {}
    check('Owner Growth bootstrap includes procurement/channel/payment read projections',all(k in growth_data for k in ['vendors','purchaseOrders','channelMappings','paymentIntents']),growth_data.keys())
    check('Owner Enterprise bootstrap includes AP/CRM/health read projections',all(k in enterprise_data for k in ['purchaseRequests','supplierInvoices','loyalty','segments','campaigns','health']),enterprise_data.keys())
    check('Owner POS product projection includes cost data read-only',bool((pos_data.get('products') or [])) and all('costPrice' in x or 'cost' in x or 'cost_price' in x for x in (pos_data.get('products') or [])[:3]),(pos_data.get('products') or [])[:1])
    for label,s,b in mutations:
        check('Owner direct API mutation denied: '+label,s==403 and b.get('code')=='OWNER_READ_ONLY',{'status':s,'body':b})
    check('Owner denied mutations leave canonical row counts unchanged',before==after,{'before':before,'after':after})
    check('Owner denied mutations leave journals balanced',not db('SELECT journal_entry_id FROM journal_lines GROUP BY journal_entry_id HAVING ABS(SUM(debit)-SUM(credit))>0.001'))

print('POST-GREEN-FEATURE-UAT',sum(x['pass'] for x in results),'/',len(results))
