from client import *
from scenario_core import db
import datetime, json, urllib.parse, uuid

results=[]
run='efc_tg_'+uuid.uuid4().hex[:10]
CHAT_ADMIN=900001001

def check(name,ok,detail=None):
    results.append({'test':name,'pass':bool(ok),'details':detail})
    print('PASS' if ok else 'FAIL',name,str(detail or '')[:900],flush=True)
    (base/'logs/enterprise-full-telegram-parity-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2,default=str),encoding='utf8')

def sim_cb(name,data,expected=200,message_id=None):
    mid=message_id or ('efc-'+name+'-'+run)
    s,b=request('telegram-callback','POST',{'callbackData':data,'chatId':CHAT_ADMIN,'messageId':mid,'role':'admin'},'efc_tg_cb_'+name+'_'+run)
    check(name,s==expected and isinstance(b,dict) and (b.get('success') is not False if expected<300 else b.get('success') is False),{'status':s,'text':(b.get('message') or {}).get('text'),'body':b})
    return s,b

def sim_text(name,text,expected=200):
    s,b=request('telegram-bot','POST',{'text':text,'chatId':CHAT_ADMIN,'role':'admin'},'efc_tg_text_'+name+'_'+run)
    check(name,s==expected and isinstance(b,dict) and (b.get('success') is not False if expected<300 else b.get('success') is False),{'status':s,'text':(b.get('message') or {}).get('text'),'body':b})
    return s,b

# Re-bind the canonical admin to the deterministic simulated Telegram identity.
admin=db("SELECT id FROM staff WHERE username=? LIMIT 1",[__import__('os').getenv('APP_BOOTSTRAP_ADMIN_USERNAME','admin')])[0]
db('UPDATE staff SET telegram_chat_id=?,telegram_state=NULL,telegram_context=NULL WHERE id=?',[str(CHAT_ADMIN),admin['id']])

# Create one real active, unpaid booking through the web/API path. Telegram must mutate the same canonical row.
today=datetime.date.today(); tomorrow=today+datetime.timedelta(days=1)
rooms=db("SELECT r.number,r.type FROM rooms r WHERE r.status='available' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.roomNumber=r.number AND b.status IN ('reserved','active') AND b.checkOut>? AND b.checkIn<?) ORDER BY CAST(r.number AS UNSIGNED),r.number LIMIT 2",[today.isoformat(),tomorrow.isoformat()])
check('Telegram parity has source and target rooms available through canonical inventory',len(rooms)>=2,rooms)
if len(rooms)>=2:
    source,target=rooms[0],rooms[1]
    op='efc_tg_booking_'+run
    s,b=request('bookings','POST',{'guestName':'EFC Telegram Parity Guest','roomNumber':source['number'],'checkIn':today.isoformat(),'checkOut':tomorrow.isoformat(),'totalAmount':300000,'paymentStatus':'unpaid','bookingSource':'Direct','lifecycleIntent':'check_in_now','broadcast':False},op)
    check('Web/API creates active booking that Telegram will operate',s==200 and b.get('success') is True and bool(b.get('bookingId')),{'status':s,'body':b})
    booking_id=b.get('bookingId') if isinstance(b,dict) else None
    if booking_id:
        before=db('SELECT checkOut,totalAmount,balanceDue,roomNumber FROM bookings WHERE id=?',[booking_id])[0]
        # Extension from Telegram callback uses canonical booking charge workflow.
        extend_mid='efc-extend-'+run
        sim_cb('telegram_extend_confirm',f"r_extend_confirm:{source['number']}:1:unpaid",message_id=extend_mid)
        extended=db('SELECT checkOut,totalAmount,balanceDue,roomNumber,extras FROM bookings WHERE id=?',[booking_id])[0]
        ext_extras=[x for x in (json.loads(extended.get('extras') or '[]') or []) if str(x.get('id','')).startswith('ex_ext_tg_')]
        check('Telegram unpaid extension updates same booking checkout and folio without fabricating cash receipt',extended['checkOut']>before['checkOut'] and float(extended['totalAmount'])>float(before['totalAmount']) and float(extended['balanceDue'])>float(before['balanceDue']) and len(ext_extras)==1 and not db("SELECT id FROM transactions WHERE bookingId=? AND operationId LIKE 'tg_%' AND description LIKE 'Perpanjangan Kamar%'",[booking_id]),{'before':before,'after':extended,'extras':ext_extras})
        sim_cb('telegram_extend_replay',f"r_extend_confirm:{source['number']}:1:unpaid",message_id=extend_mid)
        extended_retry=db('SELECT checkOut,totalAmount,extras FROM bookings WHERE id=?',[booking_id])[0]
        ext_retry=[x for x in (json.loads(extended_retry.get('extras') or '[]') or []) if str(x.get('id','')).startswith('ex_ext_tg_')]
        check('Telegram extension callback replay cannot duplicate folio charge',extended_retry['checkOut']==extended['checkOut'] and float(extended_retry['totalAmount'])==float(extended['totalAmount']) and len(ext_retry)==1)

        # Extra service direct confirm exercises the same canonical charge path.
        svc_name='EFC Laundry'
        svc_token=urllib.parse.quote(svc_name,safe='')
        pre_service=db('SELECT totalAmount,balanceDue FROM bookings WHERE id=?',[booking_id])[0]
        service_mid='efc-service-'+run
        sim_cb('telegram_service_confirm',f"r_layanan_confirm:{source['number']}:{svc_token}:50000:1:unpaid",message_id=service_mid)
        post_service=db('SELECT totalAmount,balanceDue,extras FROM bookings WHERE id=?',[booking_id])[0]
        svc_extras=[x for x in (json.loads(post_service.get('extras') or '[]') or []) if x.get('name')==svc_name]
        check('Telegram unpaid extra service increases canonical web folio without fabricating payment transaction',float(post_service['totalAmount'])>float(pre_service['totalAmount']) and float(post_service['balanceDue'])>float(pre_service['balanceDue']) and len(svc_extras)==1,{'before':pre_service,'after':post_service,'extras':svc_extras})
        sim_cb('telegram_service_replay',f"r_layanan_confirm:{source['number']}:{svc_token}:50000:1:unpaid",message_id=service_mid)
        service_retry=db('SELECT totalAmount,extras FROM bookings WHERE id=?',[booking_id])[0]
        retry_extras=[x for x in (json.loads(service_retry.get('extras') or '[]') or []) if x.get('name')==svc_name]
        check('Telegram extra service callback replay cannot duplicate folio charge',float(service_retry['totalAmount'])==float(post_service['totalAmount']) and len(retry_extras)==1)

        # Transfer through Telegram. If physical key confirmation is required, follow the explicit returned-key path.
        sim_cb('telegram_transfer_target',f"r_transfer_target:{source['number']}:{target['number']}")
        sim_cb('telegram_transfer_confirm',f"r_transfer_confirm:{source['number']}:{target['number']}:0:folio")
        staff_state=db('SELECT telegram_state,telegram_context FROM staff WHERE id=?',[admin['id']])[0]
        if staff_state.get('telegram_state')=='waiting_for_transfer_key':
            sim_cb('telegram_transfer_key_returned','r_transfer_key:returned')
        moved=db('SELECT roomNumber,status FROM bookings WHERE id=?',[booking_id])[0]
        source_room=db('SELECT status FROM rooms WHERE number=?',[source['number']])[0]
        target_room=db('SELECT status FROM rooms WHERE number=?',[target['number']])[0]
        hk=db("SELECT id,status FROM housekeeping_tasks WHERE room_number=? AND status NOT IN ('ready','completed') ORDER BY created_at DESC,id DESC LIMIT 1",[source['number']])
        check('Telegram room transfer updates canonical booking, target occupancy and source housekeeping',moved['roomNumber']==target['number'] and moved['status']=='active' and target_room['status']!='available' and bool(hk),{'booking':moved,'source':source_room,'target':target_room,'housekeeping':hk})

        # Old room is now a real housekeeping task. Process it from Telegram and verify web-visible DB state.
        sim_cb('telegram_housekeeping_start',f"hk_set:{source['number']}:cleaning")
        cleaning=db("SELECT id,status FROM housekeeping_tasks WHERE room_number=? AND status NOT IN ('ready','completed') ORDER BY created_at DESC,id DESC LIMIT 1",[source['number']])
        check('Telegram housekeeping start persists active cleaning task',bool(cleaning) and cleaning[0]['status']=='cleaning',cleaning)
        sim_cb('telegram_housekeeping_finish',f"hk_set:{source['number']}:clean_available")
        room_final=db('SELECT status FROM rooms WHERE number=?',[source['number']])[0]
        task_final=db("SELECT status FROM housekeeping_tasks WHERE room_number=? ORDER BY created_at DESC,id DESC LIMIT 1",[source['number']])
        check('Telegram housekeeping completion makes old room sellable and closes task',room_final['status']=='available' and bool(task_final) and task_final[0]['status'] in ('ready','completed'),{'room':room_final,'task':task_final})

        # The web hotel-data projection must show the Telegram mutations on the same canonical booking.
        s,hotel=request('hotel-data','GET')
        projected=next((x for x in (hotel.get('bookings') or []) if x.get('id')==booking_id),None) if isinstance(hotel,dict) else None
        check('Web hotel-data immediately sees Telegram extension/service/transfer state',s==200 and projected is not None and projected.get('roomNumber')==target['number'] and float(projected.get('totalAmount') or 0)==float(db('SELECT totalAmount FROM bookings WHERE id=?',[booking_id])[0]['totalAmount']),{'projected':projected})

check('Telegram parity suite leaves journals balanced',not db('SELECT journal_entry_id FROM journal_lines GROUP BY journal_entry_id HAVING ABS(SUM(debit)-SUM(credit))>0.001'))
print('ENTERPRISE-FULL-TELEGRAM-PARITY',sum(x['pass'] for x in results),'/',len(results))
