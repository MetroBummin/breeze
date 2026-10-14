#!/usr/bin/env python3
"""Label novel paragraphs for the example-scope experiment.

This is the ground truth for ordinary prose. It is not rule A, B, or C.
Sentence ends are marked by hand-written linguistic checks: abbreviations
and initials do not end a sentence, a lowercase speech tag ("said", "cried")
stays with the quotation, and any other . ! ? does.
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / 'data' / 'prose-gold.json'
GUTENBERG_URL = 'https://www.gutenberg.org/cache/epub/1342/pg1342.txt'

ABBREV = {
    'dr', 'mr', 'mrs', 'ms', 'miss', 'st', 'jr', 'sr', 'prof', 'rev', 'gen',
    'col', 'lt', 'sgt', 'capt', 'gov', 'sen', 'rep', 'mt', 'ft', 'etc', 'vs',
    'fig', 'vol', 'pp', 'no', 'esq', 'hon',
}
SPEECH = {
    'said', 'cried', 'asked', 'replied', 'returned', 'answered', 'continued',
    'added', 'observed', 'remarked', 'whispered', 'muttered', 'called', 'began',
    'exclaimed', 'interrupted', 'repeated', 'inquired', 'resumed', 'pursued',
    'faltered', 'sobbed', 'laughed', 'smiled', 'sighed', 'shouted', 'murmured',
    'rejoined', 'retorted', 'pleaded', 'protested', 'gasped', 'stammered',
    'thundered', 'roared', 'wrote', 'thought', 'wondered', 'answered',
}
CLOSERS = set("\"'”’»)]}")
ABBREV_MARK = re.compile(
    r'\b(?:Dr|Mr|Mrs|Ms|Prof|St|Jr|Sr|Gen|Capt|Rev|etc|vs|Fig|No|Vol)\.|(?:[A-Za-z]\.){2,}'
)


def strip_gutenberg(raw: str) -> str:
    start = raw.find('*** START OF THE PROJECT GUTENBERG EBOOK')
    end = raw.find('*** END OF THE PROJECT GUTENBERG EBOOK')
    if start < 0 or end < 0:
        raise SystemExit('Gutenberg header markers were not found')
    body = raw[start:end]
    return body[body.find('\n') + 1 :]


def paragraphs(text: str) -> list[str]:
    blocks: list[str] = []
    buf: list[str] = []
    for line in text.splitlines():
        if line.strip():
            buf.append(line.strip())
        elif buf:
            blocks.append(' '.join(buf))
            buf = []
    if buf:
        blocks.append(' '.join(buf))
    return blocks


def word_before(text: str, dot: int) -> str:
    at = dot - 1
    while at >= 0 and text[at].isalpha():
        at -= 1
    return text[at + 1 : dot]


def is_initialism(text: str, dot: int) -> bool:
    start = dot
    while start > 0 and (text[start - 1].isalpha() or text[start - 1] == '.'):
        start -= 1
    end = dot + 1
    while end < len(text) and (text[end].isalpha() or text[end] == '.'):
        end += 1
    return re.fullmatch(r'(?:[A-Za-z]{1,3}\.){2,}[A-Za-z]{0,3}\.?', text[start:end]) is not None


def is_abbrev(text: str, dot: int) -> bool:
    if is_initialism(text, dot):
        return True
    word = word_before(text, dot)
    if not word:
        return False
    if dot - len(word) > 0 and text[dot - len(word) - 1].isdigit():
        return False
    return word.lower() in ABBREV


def next_word(text: str, index: int) -> tuple[int, str]:
    while index < len(text) and text[index].isspace():
        index += 1
    if index >= len(text):
        return index, ''
    if text[index] in '“"‘':
        return index, text[index]
    end = index
    while end < len(text) and (text[end].isalnum() or text[end] in "'’"):
        end += 1
    return index, text[index:end]


def ends_sentence(text: str, after: int) -> bool:
    index, word = next_word(text, after)
    if not word:
        return True
    if word in '“"‘':
        return True
    if word[0].islower() and word.lower() in SPEECH:
        return False
    if word[0].isupper() or word[0].isdigit() or word[0].islower():
        return True
    return True


def split_paragraph(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    start = 0
    index = 0
    while index < len(text):
        char = text[index]
        if char in '.!?':
            if char == '.' and index + 1 < len(text) and text[index + 1] == '.':
                end = index
                while end < len(text) and text[end] == '.':
                    end += 1
                closer = end
                while closer < len(text) and text[closer] in CLOSERS:
                    closer += 1
                if ends_sentence(text, closer):
                    spans.append((start, closer))
                    start, _ = next_word(text, closer)
                    # next_word skips space but a quote is the word; keep its index
                    while start > closer and False:
                        pass
                    # restart at the first non-space, which next_word already found
                    # when the next token is a quote, index is the quote
                    index = start
                    if index < len(text) and not text[index].isspace():
                        # start is already the content start
                        pass
                    continue
                index = end
                continue
            if char == '.' and index > 0 and text[index - 1].isdigit() and index + 1 < len(text) and text[index + 1].isdigit():
                index += 1
                continue
            if char == '.' and is_abbrev(text, index):
                index += 1
                continue
            closer = index + 1
            while closer < len(text) and text[closer] in CLOSERS:
                closer += 1
            if ends_sentence(text, closer):
                spans.append((start, closer))
                start, _ = next_word(text, closer)
                index = start
                continue
        index += 1
    if start < len(text) and text[start:].strip():
        spans.append((start, len(text.rstrip())))
    return [(a, b) for a, b in spans if text[a:b].strip()]


def category(sentence: str) -> str:
    if ABBREV_MARK.search(sentence):
        return 'abbrev'
    if re.search(r'[“”"]', sentence):
        return 'dialogue'
    return 'prose'


def usable(paragraph: str) -> bool:
    if '[' in paragraph and ('Illustration' in paragraph or 'Copyright' in paragraph):
        return False
    if re.match(r'^(CHAPTER|Chapter)\b', paragraph):
        return False
    if paragraph.startswith('[') or 'CHISWICK PRESS' in paragraph:
        return False
    letters = sum(ch.isalpha() for ch in paragraph)
    return letters >= 12


def take(paragraphs_in: list[str], limit: int, dataset: str, prefix: str) -> tuple[list[dict], list[str]]:
    passages = []
    suspicious = []
    count = 0
    for paragraph in paragraphs_in:
        if not usable(paragraph):
            continue
        spans = []
        for start, end in split_paragraph(paragraph):
            sentence = paragraph[start:end].strip()
            # trim offsets to the stripped sentence
            while start < end and paragraph[start].isspace():
                start += 1
            while end > start and paragraph[end - 1].isspace():
                end -= 1
            if end <= start:
                continue
            sentence = paragraph[start:end]
            kind = category(sentence)
            spans.append({'start': start, 'end': end, 'category': kind})
            count += 1
            if len(sentence) < 8 or sentence[0].islower() or sentence in {'Mr.', 'Mrs.', 'Dr.'}:
                suspicious.append(f'{prefix}: {sentence}')
        if spans:
            passages.append({
                'id': f'{prefix}-{len(passages)+1:03d}',
                'dataset': dataset,
                'text': paragraph,
                'spans': spans,
            })
        if count >= limit:
            break
    return passages, suspicious


def wrap_copies(passages: list[dict], limit: int) -> list[dict]:
    copies = []
    for passage in passages:
        if len(copies) >= limit:
            break
        for span in passage['spans']:
            sentence = passage['text'][span['start']:span['end']]
            if '\n' in sentence or len(sentence) < 80 or sentence.count(' ') < 8:
                continue
            cut = sentence.find(' ', len(sentence) // 2)
            if cut < 12 or cut > len(sentence) - 12:
                continue
            broken = sentence[:cut] + '\n' + sentence[cut + 1:]
            copies.append({
                'id': f"wrap-{len(copies)+1:03d}",
                'dataset': 'long-text',
                'text': broken,
                'spans': [{'start': 0, 'end': len(broken), 'category': 'pdf-linebreak'}],
            })
            if len(copies) >= limit:
                break
    return copies


def main() -> None:
    cached = Path('/tmp/pg1342.txt')
    if cached.exists():
        raw = cached.read_text(encoding='utf-8')
    else:
        raw = urllib.request.urlopen(GUTENBERG_URL, timeout=60).read().decode('utf-8')
    austen = paragraphs(strip_gutenberg(raw))
    start = next(i for i, p in enumerate(austen) if p.startswith('It is a truth universally'))
    gutenberg, suspicious = take(austen[start:], 110, 'gutenberg', 'austen')

    speckled = paragraphs((ROOT / 'assets/longreads/speckled-band.txt').read_text(encoding='utf-8'))
    hound = paragraphs((ROOT / 'assets/longreads/hound-of-the-baskervilles.txt').read_text(encoding='utf-8'))
    hound_start = next(i for i, p in enumerate(hound) if p.startswith('Mr. Sherlock Holmes, who was usually'))
    long_a, extra_a = take(speckled, 40, 'long-text', 'speckled')
    long_b, extra_b = take(hound[hound_start:], 40, 'long-text', 'hound')
    wraps = wrap_copies(long_a + long_b, 18)
    passages = gutenberg + long_a + long_b + wraps
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'passages': passages}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    sentences = sum(len(p['spans']) for p in passages)
    print(json.dumps({
        'passages': len(passages),
        'sentences': sentences,
        'gutenberg': sum(len(p['spans']) for p in gutenberg),
        'longText': sum(len(p['spans']) for p in long_a + long_b),
        'wraps': len(wraps),
        'suspicious': len(suspicious),
    }, indent=2))
    print('\n'.join(suspicious[:80]))


if __name__ == '__main__':
    main()
