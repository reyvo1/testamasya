from client import *
from scenario_core import db
import datetime, json, re

results=[]
CHAT_ADMIN=900001001
CHAT_LIMITED=900001002

def check(name,ok,detail=None):
    results.append({'test':name,'pass':bool(ok),'details':detail})
    print('PASS' if ok else 'FAIL',name,str(detail or '')[:800],flush=True)
    (base/'logs/telegram-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')

def sim_text(name,text,chat=CHAT_ADMIN,expected=200):
    status,body=request('telegram-bot','POST',{'text':text,'chatId':chat,'role':'admin'},'sim_tg_'+name)
    check(name,status==expected and (body.get('success') is not False if status<300 else body.get('success') is False),{'status':status,'text':body.get('message',{}).get('text'),'identity':body.get('simulationIdentity')})
    return status,body

def sim_cb(name,data,chat=CHAT_ADMIN,message='uat-msg',expected=200):
    status,body=request('telegram-callback','POST',{'callbackData':data,'chatId':chat,'messageId':message,'role':'admin'},'sim_tg_'+name)
    check(name,status==expected and (body.get('success') is not False if status<300 else body.get('success') is False),{'status':status,'text':body.get('message',{}).get('text'),'identity':body.get('simulationIdentity')})
    return status,body

# Bind the bootstrap admin to a synthetic Telegram user. No external Telegram call is made.
admin=db("SELECT id,password,role FROM staff WHERE username=? LIMIT 1",[os.getenv('APP_BOOTSTRAP_ADMIN_USERNAME','admin')])[0]
db('UPDATE staff SET telegram_chat_id=?,telegram_state=NULL,telegram_context=NULL WHERE id=?',[str(CHAT_ADMIN),admin['id']])

# Unknown identity may not become admin by forging a browser role field.
status,unknown=request('telegram-bot','POST',{'text':'/menu','chatId':999001999,'role':'admin'},'sim_tg_unknown')
check('Telegram forged role cannot bind an unknown identity',status==200 and unknown.get('success') is True and unknown.get('simulationIdentity',{}).get('bound') is False,unknown.get('simulationIdentity'))

for cmd in ['/start','/menu','/status_kamar','/laporan','/help']:
    _,body=sim_text('command_'+cmd.strip('/').replace('/','_'),cmd)
    check(cmd+' resolves bound admin server-side',body.get('simulationIdentity',{}).get('bound') is True and body.get('simulationIdentity',{}).get('role')=='admin' and bool(body.get('message',{}).get('text')),body.get('simulationIdentity'))

for callback in ['main_menu','account_menu','account_profile','guest_ops_menu','field_ops_menu','cash_shift_menu','housekeeping_menu','booking_checkout_menu','patrol_reports_menu','consistency_guard']:
    _,body=sim_cb('menu_'+callback,callback,message='uat-menu-'+callback)
    check(callback+' renders a non-empty callback response',bool(body.get('message',{}).get('text')),body.get('message',{}).get('text'))

# Role/capability boundary: create a synthetic cleaning-service identity with the same fixture hash.
limited_id='uat_tg_cleaning'
db("DELETE FROM staff WHERE id=? OR username=?",[limited_id,limited_id])
db("INSERT INTO staff(id,name,username,password,role,status,telegram_chat_id) SELECT ?,?,?,?,?,?,? FROM staff WHERE id=?",[limited_id,'UAT Telegram Cleaning',limited_id,admin['password'],'cleaning_service','active',str(CHAT_LIMITED),admin['id']])
before_tx=int(db('SELECT COUNT(*) n FROM transactions')[0]['n'])
_,denied=sim_cb('limited_finance_denied','pemasukan_menu',chat=CHAT_LIMITED,message='uat-limited-finance')
check('Telegram limited role cannot enter finance callback',('AKSES DITOLAK' in (denied.get('message',{}).get('text') or '')) or denied.get('status')=='callback_denied',denied)
check('Denied Telegram finance callback cannot mutate money',int(db('SELECT COUNT(*) n FROM transactions')[0]['n'])==before_tx)

# Dedicated Telegram checkout on a fresh active booking, validating the same path used from phones.
today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date()
status,created=request('bookings','POST',{
    'guestName':'SIM Telegram Checkout Guest','roomNumber':'110','checkIn':str(today),
    'checkOut':str(today+datetime.timedelta(days=1)),'totalAmount':220000,
    'paymentStatus':'unpaid','bookingSource':'Direct','lifecycleIntent':'check_in_now','broadcast':False
},'sim_tg_checkout_booking')
check('Telegram checkout fixture booking created active',status==200 and created.get('success') is True and bool(created.get('bookingId')),created)
booking_id=created.get('bookingId')
if booking_id:
    row=db('SELECT status,totalAmount,amountPaid,balanceDue FROM bookings WHERE id=?',[booking_id])[0]
    check('Telegram checkout fixture starts unpaid',row['status']=='active' and float(row['balanceDue'])==220000,row)
    _,start=sim_cb('checkout_start','r_checkout:110',message='uat-checkout-start')
    text=start.get('message',{}).get('text','')
    check('Telegram checkout asks for settlement from server ledger','Pilih metode pelunasan' in text and '220.000' in text,text)
    before=int(db('SELECT COUNT(*) n FROM transactions WHERE bookingId=?',[booking_id])[0]['n'])
    _,paid=sim_cb('checkout_cash','r_checkout_pay:110:cash:-',message='uat-checkout-pay')
    text=paid.get('message',{}).get('text','')
    check('Telegram cash checkout reports successful balanced close','CHECK-OUT BERHASIL' in text or 'PELUNASAN DAN CHECK-OUT BERHASIL' in text,text)
    row=db('SELECT status,amountPaid,balanceDue FROM bookings WHERE id=?',[booking_id])[0]
    check('Telegram checkout persists completed booking with zero balance',row['status']=='completed' and float(row['balanceDue'])==0 and float(row['amountPaid'])==220000,row)
    check('Telegram checkout creates exactly one settlement transaction',int(db('SELECT COUNT(*) n FROM transactions WHERE bookingId=?',[booking_id])[0]['n'])==before+1)
    check('Telegram checkout sends room into housekeeping, not sellable',db("SELECT status FROM rooms WHERE number='110'")[0]['status']!='available' and bool(db("SELECT id FROM housekeeping_tasks WHERE room_number='110' AND status NOT IN ('ready','completed')")))
    tx_count=int(db('SELECT COUNT(*) n FROM transactions WHERE bookingId=?',[booking_id])[0]['n'])
    # Same synthetic button update must never duplicate payment even when user taps again.
    _,again=sim_cb('checkout_cash_replay','r_checkout_pay:110:cash:-',message='uat-checkout-pay')
    check('Telegram checkout replay cannot duplicate money',int(db('SELECT COUNT(*) n FROM transactions WHERE bookingId=?',[booking_id])[0]['n'])==tx_count,again.get('message',{}).get('text'))

# Close-shift flow gets its own disposable SIANG shift. The direct Night Audit UAT above
# already proves the night-shift gate; Telegram must independently prove mobile close-shift.
status,opened=request('operations-center','POST',{
    'command':'shift-open','openingCash':100000,'shiftTime':'siang',
    'notes':'Dedicated Telegram close-shift UAT'
},'sim_tg_open_shift')
check('Telegram close-shift fixture opens a dedicated server shift',status==200 and opened.get('success') is True,opened)
open_rows=db("SELECT id,shift_time,status FROM shift_sessions WHERE status='open' ORDER BY opened_at DESC,id DESC LIMIT 1")
check('Telegram close-shift has one open dedicated shift',len(open_rows)==1 and open_rows[0]['shift_time']=='siang',open_rows)
if open_rows:
    shift=open_rows[0]
    sim_cb('close_shift_menu','tutup_shift_menu',message='uat-close-menu')
    sim_cb('close_shift_select','tutup_shift_select:'+shift['id'],message='uat-close-select')
    _,reconcile=sim_cb('close_shift_reconcile','tutup_shift_time:'+shift['shift_time'],message='uat-close-reconcile')
    reply=reconcile.get('message',{}).get('text','')
    match=re.search(r'Tunai seharusnya:\s*\*Rp\s*([0-9.]+)',reply)
    check('Telegram close-shift exposes computed expected cash',bool(match),reply)
    if match:
        expected_cash=int(re.sub(r'\D','',match.group(1)) or '0')
        _,cash=sim_text('close_shift_actual_cash',str(expected_cash))
        check('Telegram close-shift accepts matching physical cash','REKONSILIASI KAS SEMENTARA' in (cash.get('message',{}).get('text') or ''),cash.get('message',{}).get('text'))
        _,done=sim_cb('close_shift_done','tutup_shift_done:no_notes',message='uat-close-done')
        check('Telegram close-shift confirms persisted closure','LAPORAN SHIFT TERSIMPAN' in (done.get('message',{}).get('text') or ''),done.get('message',{}).get('text'))
        check('Telegram close-shift persists CLOSED server session',db('SELECT status FROM shift_sessions WHERE id=?',[shift['id']])[0]['status']=='closed')
        closed_count=int(db("SELECT COUNT(*) n FROM shift_sessions WHERE id=? AND status='closed'",[shift['id']])[0]['n'])
        sim_cb('close_shift_replay','tutup_shift_done:no_notes',message='uat-close-done')
        check('Telegram close-shift replay cannot create a second session',int(db("SELECT COUNT(*) n FROM shift_sessions WHERE id=? AND status='closed'",[shift['id']])[0]['n'])==closed_count)

check('Telegram UAT leaves journals balanced',not db('SELECT journal_entry_id FROM journal_lines GROUP BY journal_entry_id HAVING ABS(SUM(debit)-SUM(credit))>0.001'))
print('TELEGRAM-UAT',sum(x['pass'] for x in results),'/',len(results))
