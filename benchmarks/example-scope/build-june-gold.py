#!/usr/bin/env python3
"""Label the 2024 grade-1 June mock exams for the example-scope run.

Reads a text-layer PDF with poppler (pdftotext -bbox-layout), the same
words the app's PDF text path would see, and writes gold JSON to stdout.
The PDF and the JSON stay out of git. Option spans are the circled
choices themselves. Passage spans use abbreviation checks, not rule A, B,
or C.
"""

from __future__ import annotations

import html
import json
import re
import subprocess
import sys
from pathlib import Path

WORD = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>',
    re.S,
)
PAGE = re.compile(r'<page\b[^>]*>(.*?)</page>', re.S)
CIRCLED = re.compile(r'[①②③④⑤]')
OPTION_LINE = re.compile(r'^[①②③④⑤]')
QUESTION = re.compile(r'^\d{1,2}\.')
ABBREV = {
    'dr', 'mr', 'mrs', 'ms', 'miss', 'st', 'jr', 'sr', 'prof', 'rev', 'gen',
    'col', 'lt', 'sgt', 'capt', 'gov', 'sen', 'rep', 'mt', 'ft', 'etc', 'vs',
    'fig', 'vol', 'pp', 'no', 'esq', 'hon',
}
CLOSERS = set("\"'”’»)]}")


def words_of(page: str) -> list[tuple[float, float, float, float, str]]:
    out = []
    for xmin, ymin, xmax, ymax, raw in WORD.findall(page):
        text = html.unescape(re.sub(r'\s+', ' ', raw)).strip()
        if not text:
            continue
        y = float(ymin)
        if y < 90 or y > 760:
            continue
        out.append((float(xmin), y, float(xmax), float(ymax), text))
    return drop_vertical_stamps(out)


def hangul_only(text: str) -> bool:
    letters = [char for char in text if char.isalpha() or '\uac00' <= char <= '\ud7a3']
    if not letters:
        return False
    return all('\uac00' <= char <= '\ud7a3' for char in letters)


def drop_vertical_stamps(words: list[tuple[float, float, float, float, str]]) -> list[tuple[float, float, float, float, str]]:
    """A copyright stamp is Hangul stacked in one narrow x band."""
    bands: dict[int, list[float]] = {}
    for xmin, ymin, xmax, _ymax, text in words:
        if not hangul_only(text):
            continue
        bands.setdefault(int(((xmin + xmax) / 2) // 14), []).append(ymin)
    drop = {band for band, ys in bands.items() if len(ys) >= 12 and max(ys) - min(ys) > 180}
    if not drop:
        return words
    return [word for word in words if not (hangul_only(word[4]) and int(((word[0] + word[2]) / 2) // 14) in drop)]


def gutter(words: list[tuple[float, float, float, float, str]]) -> float | None:
    if len(words) < 30:
        return None
    xmax = max(word[2] for word in words)
    bins = [0] * (int(xmax) + 2)
    for xmin, _ymin, xmax_word, _ymax, _text in words:
        bins[int((xmin + xmax_word) / 2)] += 1
    lo, hi = int(xmax * 0.30), int(xmax * 0.70)
    best: tuple[int, float] | None = None
    x = lo
    while x < hi:
        if bins[x] == 0:
            start = x
            while x < hi and bins[x] == 0:
                x += 1
            if best is None or x - start > best[0]:
                best = (x - start, (start + x) / 2)
        else:
            x += 1
    if best and best[0] >= 16:
        return best[1]
    return None


def lines_of(words: list[tuple[float, float, float, float, str]]) -> list[str]:
    ordered = sorted(words, key=lambda word: (word[1], word[0]))
    rows: list[list[tuple[float, float, float, float, str]]] = []
    current: list[tuple[float, float, float, float, str]] = []
    y_cursor = None
    for word in ordered:
        if y_cursor is None or abs(word[1] - y_cursor) <= 2.4:
            current.append(word)
            y_cursor = word[1] if y_cursor is None else (y_cursor + word[1]) / 2
        else:
            rows.append(current)
            current = [word]
            y_cursor = word[1]
    if current:
        rows.append(current)
    text = []
    for row in rows:
        line = ' '.join(word[4] for word in sorted(row, key=lambda item: item[0])).strip()
        if line and not re.fullmatch(r'[-–—\d\s]+', line):
            text.append(line)
    return text


def latin_hangul(text: str) -> tuple[int, int]:
    latin = sum(1 for char in text if char.isascii() and char.isalpha())
    hangul = sum(1 for char in text if '\uac00' <= char <= '\ud7a3')
    return latin, hangul


def columns(words: list[tuple[float, float, float, float, str]]) -> list[list[str]]:
    split = gutter(words)
    if split is None:
        return [lines_of(words)]
    left = lines_of([word for word in words if (word[0] + word[2]) / 2 < split])
    right = lines_of([word for word in words if (word[0] + word[2]) / 2 >= split])
    left_text, right_text = ' '.join(left), ' '.join(right)
    left_latin, left_hangul = latin_hangul(left_text)
    right_latin, right_hangul = latin_hangul(right_text)
    # Workbook pages put the English passage beside a Korean gloss.
    if left_latin > left_hangul * 2 and right_hangul > right_latin:
        return [left]
    if right_latin > right_hangul * 2 and left_hangul > left_latin:
        return [right]
    return [side for side in (left, right) if side]


def word_before(text: str, dot: int) -> str:
    at = dot - 1
    while at >= 0 and text[at].isalpha():
        at -= 1
    return text[at + 1 : dot]


def is_abbrev(text: str, dot: int) -> bool:
    word = word_before(text, dot)
    if not word or (dot - len(word) > 0 and text[dot - len(word) - 1].isdigit()):
        return False
    return word.lower() in ABBREV


def next_word(text: str, index: int) -> tuple[int, str]:
    while index < len(text) and text[index].isspace():
        index += 1
    if index >= len(text):
        return index, ''
    end = index
    while end < len(text) and (text[end].isalnum() or text[end] in "'’"):
        end += 1
    return index, text[index:end] or text[index]


def sentences(text: str) -> list[str]:
    spans: list[tuple[int, int]] = []
    start = 0
    index = 0
    while index < len(text):
        char = text[index]
        if char in '.!?':
            if char == '.' and index + 1 < len(text) and text[index + 1].isdigit() and index > 0 and text[index - 1].isdigit():
                index += 1
                continue
            if char == '.' and is_abbrev(text, index):
                index += 1
                continue
            closer = index + 1
            while closer < len(text) and text[closer] in CLOSERS:
                closer += 1
            at, word = next_word(text, closer)
            # A lowercase word after the stop is still this sentence: ".com",
            # a speech tag, or a line that the PDF wrapped mid-sentence.
            if word and word[0].islower():
                index += 1
                continue
            spans.append((start, closer))
            start = at
            index = at
            continue
        index += 1
    tail = text[start:].strip()
    if tail:
        spans.append((start, len(text.rstrip())))
    return [text[a:b].strip() for a, b in spans if text[a:b].strip()]


def inline_options(line: str) -> list[str]:
    return [part.strip() for part in re.findall(r'[①②③④⑤][^①②③④⑤]*', line) if part.strip()]


def blocks_of(lines: list[str]) -> list[tuple[str, str]]:
    """Return ('main-options'|'main-passage', text) pieces in reading order."""
    pieces: list[tuple[str, str]] = []
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            index += 1
            continue
        markers = CIRCLED.findall(line)
        if len(markers) >= 2 and markers[0] == '①':
            for option in inline_options(line):
                pieces.append((option_category(option), option))
            index += 1
            continue
        if OPTION_LINE.match(line):
            options: list[str] = []
            while index < len(lines) and OPTION_LINE.match(lines[index].strip()):
                options.append(lines[index].strip())
                index += 1
                while index < len(lines):
                    nxt = lines[index].strip()
                    if not nxt or OPTION_LINE.match(nxt) or QUESTION.match(nxt) or re.match(r'^\d{2,3}\)', nxt):
                        break
                    if re.match(r'[a-z(“"‘\[]', nxt):
                        options[-1] += ' ' + nxt
                        index += 1
                        continue
                    break
            if len(options) >= 3 and options[0].startswith('①'):
                pieces.extend((option_category(option), option) for option in options)
            else:
                pieces.extend(('main-passage', part) for part in sentences(' '.join(options)) if keep_passage(part))
            continue
        cleaned = strip_hangul(line)
        if skip_line(line) or not cleaned:
            index += 1
            continue
        paragraph = [cleaned]
        index += 1
        while index < len(lines):
            nxt = lines[index].strip()
            if filler_line(nxt):
                index += 1
                continue
            if (
                not nxt
                or OPTION_LINE.match(nxt)
                or skip_line(nxt)
                or (CIRCLED.findall(nxt)[:1] == ['①'] and len(CIRCLED.findall(nxt)) >= 2)
            ):
                break
            paragraph.append(strip_hangul(nxt))
            index += 1
        for sentence in sentences(' '.join(part for part in paragraph if part)):
            if keep_passage(sentence):
                pieces.append(('main-passage', sentence))
    return pieces


def englishish(text: str) -> bool:
    latin, hangul = latin_hangul(text)
    return latin >= 8 and hangul <= 2 and len(text) <= 420


def option_category(text: str) -> str:
    if re.match(r'^[①②③④⑤]\s*\([A-Ea-e]\)', text):
        return 'opt-paren'
    if re.match(r'^[①②③④⑤]\s*[ⓐ-ⓩⒶ-Ⓩ]', text):
        return 'opt-letter'
    if re.match(r'^[①②③④⑤]\s+[A-Z]', text):
        return 'opt-capital'
    if re.match(r'^[①②③④⑤]\s+[a-z]', text):
        return 'opt-lower'
    return 'opt-other'


def strip_hangul(line: str) -> str:
    line = re.sub(r'[\uac00-\ud7a3]+', ' ', line)
    line = re.sub(r'[。、ㆍ]+', ' ', line)
    return re.sub(r'\s+', ' ', line).strip()


def header_line(line: str) -> bool:
    letters = re.findall(r'[A-Za-z]', line)
    if len(letters) < 4:
        return True
    if not any(letter.islower() for letter in letters) and len(letters) < 48:
        return True
    return bool(re.search(r'\bWORKBOOK\b', line) and sum(letter.islower() for letter in letters) < 3)


def keep_passage(text: str) -> bool:
    if not englishish(text) or header_line(text):
        return False
    if text.count(' / ') >= 2 or text.count('_') >= 8:
        return False
    words = re.findall(r"[A-Za-z]+", text)
    return len(words) >= 4 or bool(re.search(r'[.!?]', text))


def filler_line(line: str) -> bool:
    """A watermark stroke or a lone punctuation mark, not a new sentence."""
    return not re.search(r'[A-Za-z0-9]', strip_hangul(line))


def skip_line(line: str) -> bool:
    if filler_line(line):
        return True
    if QUESTION.match(line) or re.match(r'^\d{2,3}\)', line):
        return True
    cleaned = strip_hangul(line)
    if header_line(cleaned) and not re.search(r'[.!?]', cleaned):
        return True
    return False


def passages_from(pdf: Path, dataset: str) -> list[dict]:
    raw = subprocess.check_output(['pdftotext', '-bbox-layout', str(pdf), '-'], text=True, errors='replace')
    passages = []
    number = 0
    for page_number, page in enumerate(PAGE.findall(raw), start=1):
        for column_number, column in enumerate(columns(words_of(page)), start=1):
            pieces = blocks_of(column)
            if len(pieces) < 2:
                continue
            number += 1
            passages.append({
                'id': f'{dataset}-p{page_number}c{column_number}',
                'dataset': dataset,
                'parts': [{'text': text, 'category': category} for category, text in pieces],
            })
    return passages


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit('usage: build-june-gold.py WORKBOOK.pdf QUESTIONS.pdf')
    workbook, questions = Path(sys.argv[1]), Path(sys.argv[2])
    items = passages_from(workbook, 'june-workbook') + passages_from(questions, 'june-abcd')
    json.dump(items, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write('\n')
    counts: dict[str, int] = {}
    for item in items:
        for part in item['parts']:
            counts[part['category']] = counts.get(part['category'], 0) + 1
    print(f'passages {len(items)} ' + ' '.join(f'{key} {value}' for key, value in sorted(counts.items())), file=sys.stderr)


if __name__ == '__main__':
    main()
