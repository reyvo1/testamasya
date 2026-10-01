#!/usr/bin/env python3
from pathlib import Path
import argparse, socket

ap=argparse.ArgumentParser()
ap.add_argument('--host',default='127.0.0.1')
ap.add_argument('--port',type=int,default=38192)
ap.add_argument('--output',required=True)
args=ap.parse_args()
out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)

def send(conn,line): conn.sendall((line+'\r\n').encode('ascii'))

delivered=False
with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as srv:
    srv.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
    srv.bind((args.host,args.port));srv.listen(5)
    while not delivered:
        conn,addr=srv.accept()
        with conn:
            f=conn.makefile('rb')
            send(conn,'220 tamasya-efc-smtp.local ESMTP ready')
            data_mode=False;data=[];this_delivered=False
            while True:
                raw=f.readline()
                if not raw: break
                line=raw.decode('utf-8','replace').rstrip('\r\n')
                if data_mode:
                    if line=='.':
                        out.write_bytes(('\r\n'.join(data)+'\r\n').encode('utf-8','replace'))
                        send(conn,'250 2.0.0 queued as EFC-UAT')
                        data_mode=False;data=[];this_delivered=True;delivered=True
                    else:
                        if line.startswith('..'): line=line[1:]
                        data.append(line)
                    continue
                upper=line.upper()
                if upper.startswith('EHLO') or upper.startswith('HELO'):
                    send(conn,'250-tamasya-efc-smtp.local')
                    send(conn,'250 8BITMIME')
                elif upper.startswith('MAIL FROM:'): send(conn,'250 2.1.0 sender ok')
                elif upper.startswith('RCPT TO:'): send(conn,'250 2.1.5 recipient ok')
                elif upper=='DATA': send(conn,'354 End data with <CR><LF>.<CR><LF>');data_mode=True
                elif upper=='RSET': send(conn,'250 2.0.0 reset')
                elif upper=='NOOP': send(conn,'250 2.0.0 ok')
                elif upper=='QUIT': send(conn,'221 2.0.0 bye');break
                else: send(conn,'250 2.0.0 ok')
            if this_delivered:
                break
