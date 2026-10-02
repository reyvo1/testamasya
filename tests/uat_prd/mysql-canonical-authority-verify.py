#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path

parser=argparse.ArgumentParser(description='Verify fresh schema objects using migration/DBA metadata authority.')
parser.add_argument('--tables',required=True,help='TSV file containing TABLE_NAME rows from information_schema.TABLES')
parser.add_argument('--triggers',required=True,help='TSV file containing TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION, EVENT_OBJECT_TABLE')
parser.add_argument('schemas',nargs='+')
args=parser.parse_args()

expected_tables=set()
expected_triggers={}
for raw in args.schemas:
    path=Path(raw)
    text=path.read_text(encoding='utf-8',errors='strict')
    for m in re.finditer(r'^\s*CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+`([^`]+)`',text,re.I|re.M):
        expected_tables.add(m.group(1))
    for m in re.finditer(r'^\s*CREATE\s+TRIGGER\s+`([^`]+)`\s+(BEFORE|AFTER)\s+(INSERT|UPDATE|DELETE)\s+ON\s+`([^`]+)`',text,re.I|re.M):
        expected_triggers[m.group(1)]={
            'timing':m.group(2).upper(),
            'event':m.group(3).upper(),
            'table':m.group(4),
        }

actual_tables={line.rstrip('\n\r') for line in Path(args.tables).read_text(encoding='utf-8').splitlines() if line.strip()}
actual_triggers={}
for line in Path(args.triggers).read_text(encoding='utf-8').splitlines():
    if not line.strip():
        continue
    parts=line.split('\t')
    if len(parts)!=4:
        raise SystemExit(f'invalid trigger metadata row: {line!r}')
    name,timing,event,table=parts
    actual_triggers[name]={'timing':timing.upper(),'event':event.upper(),'table':table}

missing_tables=sorted(expected_tables-actual_tables)
extra_tables=sorted(actual_tables-expected_tables)
missing_triggers=sorted(set(expected_triggers)-set(actual_triggers))
extra_triggers=sorted(set(actual_triggers)-set(expected_triggers))
signature_mismatches=[]
for name in sorted(set(expected_triggers)&set(actual_triggers)):
    if expected_triggers[name]!=actual_triggers[name]:
        signature_mismatches.append({'trigger':name,'expected':expected_triggers[name],'actual':actual_triggers[name]})

result={
    'success':not(missing_tables or extra_tables or missing_triggers or extra_triggers or signature_mismatches),
    'schemaFiles':args.schemas,
    'expectedTables':len(expected_tables),
    'actualTables':len(actual_tables),
    'expectedTriggers':len(expected_triggers),
    'actualTriggers':len(actual_triggers),
    'missingTables':missing_tables,
    'extraTables':extra_tables,
    'missingTriggers':missing_triggers,
    'extraTriggers':extra_triggers,
    'triggerSignatureMismatches':signature_mismatches,
}
print(json.dumps(result,separators=(',',':'),sort_keys=True))
if not result['success']:
    raise SystemExit(1)
print(f"PASS migration-authority schema verification: tables={len(expected_tables)} triggers={len(expected_triggers)}")
