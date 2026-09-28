#!/usr/bin/env python3
"""Check every shipped sense against the pinned source, not only a generated manifest."""
import sys, json, gzip, hashlib, importlib.util
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=importlib.util.spec_from_file_location('builder',root/'tools/build-lightning-lexicon.py')
builder=importlib.util.module_from_spec(p);p.loader.exec_module(builder)
source=Path(sys.argv[1])
asset=root/'assets/dictionaries/en-ko-10k'
manifest=json.loads((asset/'manifest.json').read_text())
assert hashlib.sha256(source.read_bytes()).hexdigest()==manifest['source']['englishJsonlSha256']
rows=source.read_text().splitlines()
evidence=gzip.decompress((asset/'provenance.jsonl.gz').read_bytes())
assert hashlib.sha256(evidence).hexdigest()==manifest['provenanceSha256']
checks=0
for line in evidence.splitlines():
    item=json.loads(line);row=json.loads(rows[item['line']-1])
    assert row['lang_code']=='en' and row['word']==item['sourceWord']
    assert row['word'].replace('’',"'")==item['lemma']
    assert item['raw'] in row['senses'][item['senseIndex']]['glosses']
    assert builder.short_gloss(item['raw'])==item['ko']
    assert builder.entry_pos(row)==(item['pos'],item['posSource'])
    checks+=1
assert checks==manifest['senses']
assert builder.short_gloss('연극, 극장의 막.')=='연극, 극장의 막'
assert builder.short_gloss('(서류나 책에) 기록, 기입, 등록.')=='기록'
assert builder.short_gloss('record의 과거분사.') is None
print(f'Source provenance PASS: {checks} shipped senses checked against pinned English source rows')
