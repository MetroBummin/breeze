#!/usr/bin/env python3
"""Extract the verified deterministic Lesson 1 workbook stages from the source PDF.

The PDF is the source of prompts.  The answer-key transcription below is kept
next to the extractor so a later PDF revision can be diffed and re-verified.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from pypdf import PdfReader


STAGE_ANSWERS = {
    2: """실종된 / 등산객|중요한 역할을 한 / 으로 밝혀졌습니다|자세한 내용 / 연결해|입구|구조되|숙련된 / 등산에 나섰습니다|망가뜨렸 / 길을 잘못 들|지나갈 / 경우를 대비하여|등산할|기온|신호|설상가상으로|곳|문자 메시지|길을 잃|주변 환경|지역|에 대해 보고받 / 구조|수색|협곡 / 가장자리 / 걸쳐 있|재 / 덮여 있|화질 / 위치|환경|단서|게시하 / 풍경 / 알아차릴|공유된 / 라는 이름의|추적하 / 위성 / 조사하|촬영되 / 알아내는 것|바로|에게 / 을 떠올리게 했습니다|거의 정확한 / 추론하|익숙했 / 특징 / 확인했|추측했습니다|골짜기들|을 / 와 비교했습니다|있을 법한|지목된|이례적인 / 로 / 다치지 않은|영상 통화|경로|다시""",
    3: """missing / hiker|turns out / played a key role|go over / details|entrance|rescued|experienced / went on a hike|destroyed / take a wrong turn|in case / passed by|hike|temperature|signal|To make matters worse|spot|text message|lost|surroundings|local|informed of / rescue|searching|hanging / edge / canyon|covered / ash|quality / location|conditions|clues|posted / recognized / scenery|shared / named|examining / satellite / track|determining / filmed|immediately|reminded / of|infer / approximate|familiar / checked / features|guessed|valleys|compared / with|probable|indicated|Thanks to / unusual / unharmed|video call|route|back""",
}

STAGE_META = {
    2: {"title": "2단계 · 우리말 빈칸", "instruction": "영문을 보고 우리말 해석의 빈칸을 완성하세요.", "pages": range(3, 7)},
    3: {"title": "3단계 · 영문 빈칸", "instruction": "우리말 해석을 보고 영문의 빈칸을 완성하세요.", "pages": range(7, 11)},
}


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def strip_page_artifacts(value: str) -> str:
    value = re.sub(r"\d\ube48\uce78\uc5f0\uc2b5.*?\uad50\uacfc\uc11c \ubcf8\ubb38", " ", value)
    value = re.sub(r"-\s*\d+\s*-", " ", value)
    return normalize(value)


def page_text(reader: PdfReader, pages: range) -> str:
    return "\n".join(reader.pages[index].extract_text() or "" for index in pages)


def extract_stage(reader: PdfReader, stage: int) -> list[dict]:
    text = page_text(reader, STAGE_META[stage]["pages"])
    cursor = text.find("1.")
    if cursor < 0:
        raise ValueError(f"stage {stage}: item 1 not found")
    answer_rows = [row.split(" / ") for row in STAGE_ANSWERS[stage].split("|")]
    items: list[dict] = []
    for number in range(1, 42):
        start = text.find(f"{number}.", cursor)
        marker = text.find(f"{number})", start + len(str(number)) + 1)
        if start < 0 or marker < 0:
            raise ValueError(f"stage {stage}: item {number} boundary not found")
        next_start = text.find(f"{number + 1}.", marker + len(str(number)) + 1) if number < 41 else len(text)
        if next_start < 0:
            raise ValueError(f"stage {stage}: item {number + 1} boundary not found")
        source = strip_page_artifacts(text[start + len(str(number)) + 1 : marker])
        prompt = strip_page_artifacts(text[marker + len(str(number)) + 1 : next_start])
        answers = [normalize(answer) for answer in answer_rows[number - 1]]
        if stage == 3:
            # The PDF draws one line per English word.  READY grades the answer
            # key's phrase as one meaningful slot (for example, "turns out"),
            # so collapse its consecutive word-lines into one input position.
            scan_from = 0
            for answer in answers:
                word_count = len(re.findall(r"[A-Za-z]+(?:['’][A-Za-z]+)?", answer))
                pattern = re.compile(rf"(?:_{{5,}}\s*){{{max(1, word_count)}}}")
                match = pattern.search(prompt, scan_from)
                if not match:
                    raise ValueError(f"stage {stage} item {number}: phrase slot for {answer!r} not found")
                placeholder = "⟦BLANK⟧"
                prompt = prompt[: match.start()] + placeholder + prompt[match.end() :]
                scan_from = match.start() + len(placeholder)
            prompt = prompt.replace("⟦BLANK⟧", " ______________ ")
            prompt = normalize(prompt)
        blank_count = len(re.findall(r"_{5,}", prompt))
        if blank_count != len(answers):
            raise ValueError(f"stage {stage} item {number}: {blank_count} blanks != {len(answers)} answers")
        items.append({
            "key": f"ne-mb-l1-s{stage}-{number:02d}",
            "stage": stage,
            "number": number,
            "source": source,
            "prompt": prompt,
            "answers": answers,
        })
        cursor = next_start
    return items


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    reader = PdfReader(args.pdf)
    stages = []
    for stage, meta in STAGE_META.items():
        stages.append({
            "stage": stage,
            "title": meta["title"],
            "instruction": meta["instruction"],
            "items": extract_stage(reader, stage),
        })
    payload = {"workbookKey": "ne-minbyeongcheon-lesson-1", "title": "공통영어2 NE능률(민병천) 1과 워크북", "stages": stages}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("export const NE_MINBYEONGCHEON_L1_WORKBOOK = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    print(f"wrote {sum(len(stage['items']) for stage in stages)} items to {args.output}")


if __name__ == "__main__":
    main()
