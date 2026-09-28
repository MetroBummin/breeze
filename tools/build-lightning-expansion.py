#!/usr/bin/env python3
"""Build additive, separately licensed preview packs. Never overwrite the 10K pack.

Input is a checksum-pinned source-audit directory plus the pinned English records
from Korean Wiktionary. No AI, token-wise splitting of English prose, or POS guessing.
The entire input files, not just the generated output, are checked before use.
"""
from __future__ import annotations
import argparse, collections, csv, gzip, hashlib, importlib.util, io, json, re
from pathlib import Path
from urllib.parse import quote

ROOT=Path(__file__).resolve().parents[1]
WORD=re.compile(r"[a-z]+(?:['-][a-z]+)*\Z")
KOREAN=re.compile(r'[가-힣][가-힣 ]*\Z')
POS={'noun':'noun','verb':'verb','adj':'adjective','adv':'adverb','prep':'preposition',
     'conj':'conjunction','pron':'pronoun','det':'determiner','article':'article',
     'num':'numeral','intj':'interjection'}
BAD_TAGS={'form-of','alt-of','no-gloss','archaic','obsolete','rare','misspelling','nonstandard',
          'offensive','derogatory','pejorative','slang'}
# Reject source mistakes noticed in review. These are NOT replacement translations.
REJECT_KO={'전원의 행진','현자인 체하','보다 낫다에게 이기다','나비 매츱의 리본','뒹구'}
BASE_SHA='ba05be3d8643de29bf85c47899118441b7da48df8db0a27b964f72b8dff51c33'
KENGDIC_COMMIT='793de2369c9a98b944154eb4695d26854d2de59b'
KENGDIC_URL=f'https://github.com/garfieldnate/kengdic/blob/{KENGDIC_COMMIT}/kengdic.tsv'


def sha(data):return hashlib.sha256(data).hexdigest()
def packed(data):return (json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n').encode()
def lines(path):
    with gzip.open(path,'rt',encoding='utf-8') as f:
        for line in f:
            if line.strip():yield json.loads(line)
def write_gz(path,data):path.write_bytes(gzip.compress(data,compresslevel=9,mtime=0))
def valid_word(word):return isinstance(word,str) and len(word)<=40 and WORD.fullmatch(word)
def compact_ko(text):
    if not isinstance(text,str):return None
    text=re.sub(r'\s+',' ',text).strip()
    if not 1<=len(text)<=40 or not KOREAN.fullmatch(text) or text.count(' ')>5:return None
    if text in REJECT_KO or re.search(r'의 (?:복수|과거|분사|약자|비교급|최상급)',text):return None
    return text

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--audit',type=Path,required=True)
    ap.add_argument('--ko-source',type=Path,required=True)
    ap.add_argument('--root',type=Path,default=ROOT)
    ap.add_argument('--target',type=int,default=40000)
    ap.add_argument('--output',type=Path)
    args=ap.parse_args();root=args.root
    if not 10000<=args.target<=50000:ap.error('target must be 10000..50000')
    out=args.output or root/'assets/dictionaries/en-ko-expansion'
    lock=json.loads((root/'modules/lexicon-expansion/source-lock.json').read_text())
    for name,digest in lock['auditFiles'].items():
        if sha((args.audit/name).read_bytes())!=digest:raise ValueError('Source checksum mismatch: '+name)
    if sha(args.ko_source.read_bytes())!=lock['koEnglishJsonlSha256']:raise ValueError('Korean source mismatch')
    basepath=root/'assets/dictionaries/en-ko-10k/dictionary.json'
    basebytes=basepath.read_bytes()
    if sha(basebytes)!=BASE_SHA:raise ValueError('10K baseline changed; review before expanding')
    base=json.loads(basebytes);reserved=set(base['entries'])
    aliases=set(base.get('forms',{}))
    spec=importlib.util.spec_from_file_location('lexicon_builder',root/'tools/build-lightning-lexicon.py')
    old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
    reject=collections.Counter()
    ko_groups=collections.defaultdict(lambda:collections.defaultdict(list))
    for line,row in old.read_rows(args.ko_source):
        word=row.get('word','').replace('’',"'")
        if not valid_word(word) or word in reserved or word in aliases:continue
        pos,pos_source=old.entry_pos(row)
        if pos=='excluded':continue
        for si,s in enumerate(row.get('senses',[])):
            if s.get('form_of') or s.get('alt_of') or old.SKIP_TAGS.intersection(s.get('tags',[])):continue
            raw=next((g for g in reversed(s.get('glosses',[])) if isinstance(g,str) and g.strip()),'')
            ko=old.short_gloss(raw)
            if not ko:continue
            group=ko_groups[word][pos]
            if ko in [x['ko'] for x in group]:continue
            group.append({'lemma':word,'pos':pos,'ko':ko,'raw':raw,'line':line,'senseIndex':si,
                          'posSource':pos_source,'sourceWord':row['word'],
                          'url':'https://ko.wiktionary.org/wiki/'+quote(row['word'],safe='')+'#영어'})
    reserved.update(ko_groups)
    en_groups=collections.defaultdict(lambda:collections.defaultdict(list))
    for row in lines(args.audit/'enwiktionary-ko-translations.jsonl.gz'):
        word=row.get('word');pos=POS.get(row.get('pos'))
        if not valid_word(word) or not pos or word in reserved or word in aliases:continue
        if not any(not s.get('form_of') and not s.get('alt_of') and not BAD_TAGS.intersection(s.get('tags',[]))
                   for s in row.get('senses',[])):continue
        for ti,t in enumerate(row.get('translations',[])):
            ko=compact_ko(t.get('word'))
            if not ko or t.get('code')!='ko' or BAD_TAGS.intersection(t.get('tags',[])):continue
            group=en_groups[word][pos]
            if ko in [x['ko'] for x in group]:continue
            group.append({'lemma':word,'pos':pos,'ko':ko,'raw':t['word'],'line':row['sourceLine'],
                'translationIndex':ti,'translationSense':t.get('sense',''),'posSource':'English-entry',
                'url':'https://en.wiktionary.org/wiki/'+quote(word,safe='')+'#English'})
    reserved.update(en_groups)
    # The whitelist proves an independently listed English lexical headword; it does
    # NOT prove the POS of a Kengdic Korean gloss. Kengdic therefore remains unknown.
    whitelist={}
    for row in lines(args.audit/'enwiktionary-lexemes.jsonl.gz'):
        word=row.get('word')
        if valid_word(word) and row.get('pos') in POS:
            whitelist.setdefault(word,{'word':word,'pos':row['pos'],'line':row['line']})
    keng_groups=collections.defaultdict(lambda:collections.defaultdict(list))
    raw=gzip.decompress((args.audit/'kengdic.tsv.gz').read_bytes())
    if sha(raw)!=lock['kengdicTsvSha256']:raise ValueError('Kengdic uncompressed checksum mismatch')
    for line,row in enumerate(csv.DictReader(io.StringIO(raw.decode('utf-8')),delimiter='\t'),2):
        word=row['gloss'].strip()
        if not valid_word(word):reject['not-entire-single-English-headword']+=1;continue
        if word in reserved:reject['already-covered-by-Wiktionary']+=1;continue
        if word in aliases:reject['baseline-alias-not-counted-as-new']+=1;continue
        if word not in whitelist:reject['not-in-independent-English-lemma-whitelist']+=1;continue
        ko=compact_ko(row['surface'])
        if not ko:reject['noncompact-or-rejected-Korean']+=1;continue
        group=keng_groups[word]['unknown']
        if ko in [x['ko'] for x in group]:reject['duplicate-translation']+=1;continue
        group.append({'lemma':word,'pos':'unknown','ko':ko,'raw':row['surface'],'rawEnglish':row['gloss'],
                      'line':line,'sourceId':row['id'],'originalSource':row['source'],
                      'posSource':'not-provided','url':KENGDIC_URL+'#L'+str(line),
                      'englishLemmaLine':whitelist[word]['line']})
    available=len(reserved)+len(keng_groups)
    if available<args.target:
        raise ValueError(f'Only {available} eligible headwords; refusing to pad to {args.target}')
    # Prefer compact ordinary-looking spellings, not a claim of frequency or quality.
    # Source choice and limits are independent of the requested target.
    need=args.target-len(reserved)
    if need<0:raise ValueError('Target smaller than available Wiktionary packs')
    rank=lambda w:('-' in w or "'" in w,len(w)>18,hashlib.sha256(w.encode()).hexdigest())
    selected=set(sorted(keng_groups,key=rank)[:need])
    keng_groups={w:keng_groups[w] for w in sorted(selected)}
    out.mkdir(parents=True,exist_ok=True)
    reports=[]
    configs=[('ko-additional',ko_groups,'CC-BY-SA-4.0','https://ko.wiktionary.org/wiki/','영어',False),
             ('en-translations',en_groups,'CC-BY-SA-4.0','https://en.wiktionary.org/wiki/','English',False),
             ('kengdic-fallback',keng_groups,'MPL-2.0',KENGDIC_URL,'',True)]
    for pid,groups,license,prefix,anchor,experimental in configs:
        entries={};evidence=[]
        for word,bypos in sorted(groups.items()):
            senses={}
            for pos,candidates in bypos.items():
                preferred=old.PREFERRED.get(word,{}).get(pos) if pid=='ko-additional' else None
                if preferred:candidates=sorted(candidates,key=lambda c:not(c['ko']==preferred or c['ko'].startswith(preferred+', ')))
                chosen=candidates[:3];senses[pos]=[c['ko'] for c in chosen]
                evidence.extend(chosen)
            first=next((p for p in senses if p!='unknown'),next(iter(senses)))
            entries[word]={'default':senses[first][0],'pos':senses}
        data={'version':1,'license':license,'entries':entries,'forms':{}}
        body=packed(data);path=out/pid;path.mkdir(exist_ok=True)
        (path/'dictionary.json').write_bytes(body);write_gz(path/'dictionary.json.gz',body)
        proof=b''.join(packed(x) for x in evidence);write_gz(path/'provenance.jsonl.gz',proof)
        reports.append({'id':pid,'file':pid+'/dictionary.json','headwords':len(entries),'senses':len(evidence),
          'knownPosHeadwords':sum(any(p!='unknown' for p in e['pos']) for e in entries.values()),
          'unknownOnlyHeadwords':sum(list(e['pos'])==['unknown'] for e in entries.values()),
          'license':license,'experimental':experimental,'sourceUrlPrefix':prefix,'sourceAnchor':anchor,
          'dictionaryBytes':len(body),'gzipBytes':(path/'dictionary.json.gz').stat().st_size,
          'sha256':sha(body),'provenanceSha256':sha(proof)})
    lemma_evidence=b''.join(packed(whitelist[w]) for w in sorted(keng_groups))
    write_gz(out/'en-lemma-evidence.jsonl.gz',lemma_evidence)
    report={'schema':1,'targetHeadwords':args.target,'actualHeadwords':len(base['entries'])+sum(x['headwords'] for x in reports),
      'addedHeadwords':sum(x['headwords'] for x in reports),'eligibleBeforeTarget':available,
      'totalSenses':sum(len(v) for e in base['entries'].values() for v in e['pos'].values())+sum(x['senses'] for x in reports),
      'baseline':{'file':'../en-ko-10k/dictionary.json','headwords':len(base['entries']),'sha256':BASE_SHA},
      'packs':reports,'lemmaEvidence':{'file':'en-lemma-evidence.jsonl.gz','rows':len(keng_groups),'license':'CC-BY-SA-4.0','sha256':sha(lemma_evidence)},'rejectedKengdicRows':dict(reject),
      'notes':['Original 10K bytes and meanings preserved. Aliases do not increase the count.',
               'Not general-English top-40K. No coverage or human-reviewed accuracy claim.',
               'Kengdic is an experimental fallback with unknown POS; never infer POS from English spelling.',
               'Separate source licenses. Do not combine data files and label the mixture CC-BY-SA.',
               'No generated meanings. No runtime/Reader integration or production deployment.']}
    (out/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    # No quoted literary examples or user data are retained in shipped provenance.
    if basepath.read_bytes()!=basebytes:raise AssertionError('Baseline mutated')
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
