#!/usr/bin/env python3
"""Independently trace every shipped new sense to the acquired source.

With --audit and --ko-source verify the original full acquisition. Without them,
verify hashes, disjointness, baseline preservation and reconstruct from provenance.
Neither mode is a human translation accuracy evaluation.
"""
import argparse,csv,gzip,hashlib,io,json,re,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('source_normalization',ROOT/'tools/build-lightning-lexicon.py')
normalization=importlib.util.module_from_spec(spec);spec.loader.exec_module(normalization)
def sha(b):return hashlib.sha256(b).hexdigest()
def rows(p):return [json.loads(x) for x in gzip.decompress(p.read_bytes()).splitlines() if x.strip()]
def check(condition,message):
    if not condition:raise AssertionError(message)
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--audit',type=Path);p.add_argument('--ko-source',type=Path);a=p.parse_args()
    out=ROOT/'assets/dictionaries/en-ko-expansion';m=json.loads((out/'manifest.json').read_text())
    lemma_body=gzip.decompress((out/m['lemmaEvidence']['file']).read_bytes())
    check(sha(lemma_body)==m['lemmaEvidence']['sha256'],'English lemma evidence checksum mismatch')
    lemma_proof={r['word']:r for r in rows(out/m['lemmaEvidence']['file'])}
    check(len(lemma_proof)==m['lemmaEvidence']['rows'],'Duplicate English lemma evidence')
    basepath=out/m['baseline']['file'];base=json.loads(basepath.read_bytes());original=set(base['entries'])
    check(sha(basepath.read_bytes())==m['baseline']['sha256'],'Baseline changed')
    total=set(original);senses=sum(len(v) for e in base['entries'].values() for v in e['pos'].values());traced=0
    ko=en=kd=wl=None
    if a.audit:
        check(bool(a.ko_source),'Provide --ko-source together with --audit')
        ko={i:json.loads(l) for i,l in enumerate(a.ko_source.read_text().splitlines(),1)}
        en={r['sourceLine']:r for r in rows(a.audit/'enwiktionary-ko-translations.jsonl.gz')}
        kd={i:r for i,r in enumerate(csv.DictReader(io.StringIO(gzip.decompress((a.audit/'kengdic.tsv.gz').read_bytes()).decode()),delimiter='\t'),2)}
        wl={r['line']:r for r in rows(a.audit/'enwiktionary-lexemes.jsonl.gz')}
    for meta in m['packs']:
        path=out/meta['file'];body=path.read_bytes();data=json.loads(body);proof=rows(path.parent/'provenance.jsonl.gz')
        check(data['license']==meta['license'],'Incorrect per-pack license')
        check(sha(body)==meta['sha256'],'Dictionary checksum mismatch')
        check(gzip.decompress((path.parent/'dictionary.json.gz').read_bytes())==body,'Gzip differs')
        check(sha(gzip.decompress((path.parent/'provenance.jsonl.gz').read_bytes()))==meta['provenanceSha256'],'Provenance checksum mismatch')
        check(not total.intersection(data['entries']),'Duplicate headword across packs')
        check(not set(data['entries']).intersection(base['forms']),'An old alias inflated the new count')
        total.update(data['entries']);check(len(data['entries'])==meta['headwords'],'Incorrect headword count')
        emitted={(w,p,k) for w,e in data['entries'].items() for p,ks in e['pos'].items() for k in ks}
        check(len(emitted)==len(proof)==meta['senses'],'Missing/duplicate sense provenance')
        check(emitted=={(r['lemma'],r['pos'],r['ko']) for r in proof},'Provenance does not cover each shipped sense')
        reconstructed={}
        for r in proof:
            reconstructed.setdefault(r['lemma'],{}).setdefault(r['pos'],[]).append(r['ko'])
            check(1<=len(r['ko'])<=40 and re.search('[가-힣]',r['ko']),'Invalid Korean')
            if a.audit:
                if meta['id']=='ko-additional':
                    src=ko[r['line']];sense=src['senses'][r['senseIndex']]
                    check(src['word']==r['sourceWord'] and r['raw'] in sense['glosses'],'Korean-source mismatch')
                    check(not sense.get('form_of') and not sense.get('alt_of'),'Inflection used as headword')
                    check(normalization.short_gloss(r['raw'])==r['ko'],'Korean gloss is not the documented normalization')
                    check(normalization.entry_pos(src)==(r['pos'],r['posSource']),'Unsupported Korean-source POS')
                elif meta['id']=='en-translations':
                    src=en[r['line']];t=src['translations'][r['translationIndex']]
                    check(src['word']==r['lemma'] and t['code']=='ko' and t['word']==r['raw'],'English translation mismatch')
                    check(re.sub(r'\s+',' ',t['word']).strip()==r['ko'],'Translation was rewritten')
                    check(normalization.POS[src['pos']]==r['pos'],'Unsupported English-source POS')
                else:
                    src=kd[r['line']];e=lemma_proof[r['lemma']];lemma=wl[r['englishLemmaLine']]
                    check(src['id']==r['sourceId'] and src['surface']==r['raw'] and src['gloss']==r['rawEnglish'],'Kengdic row mismatch')
                    check(src['gloss'].strip()==r['lemma'],'English prose was split into headwords')
                    check(re.sub(r'\s+',' ',src['surface']).strip()==r['ko'],'Kengdic meaning was rewritten')
                    check(lemma==e and lemma['word']==r['lemma'],'Independent lemma evidence mismatch')
                    check(r['pos']=='unknown' and r['posSource']=='not-provided','Kengdic POS was invented')
                traced+=1
        for w,e in data['entries'].items():
            check(reconstructed[w]==e['pos'],'Cannot reconstruct sense ordering from provenance')
            first=next((p for p in e['pos'] if p!='unknown'),next(iter(e['pos'])))
            check(e['default']==e['pos'][first][0],'Untraceable default')
        senses+=len(proof)
    check(len(total)==m['actualHeadwords']==m['targetHeadwords']==40000,'Wrong total')
    check(len(total)-len(original)==m['addedHeadwords']==30000,'Wrong added count')
    check(senses==m['totalSenses'],'Wrong sense count')
    print(json.dumps({'headwords':len(total),'added':m['addedHeadwords'],'senses':senses,'newSenses':senses-14120,'sourceTraced':traced,
      'mode':'full-source' if a.audit else 'offline-provenance','passed':True}))
if __name__=='__main__':main()
