#!/usr/bin/env python3
"""Extract the verified MCQ portion of the 18~28 Exam4You workbook.

The output is private copyrighted course content. Write it outside the repo,
review it against rendered PDF pages, then pass it to ready-import-questions.
"""

import argparse
import json
import re
from pathlib import Path

from pypdf import PdfReader

PAGE_GROUPS = {
    1: [(2, [18]), (3, [19]), (4, [20]), (5, [21]), (6, [22]), (7, [23]), (8, [24]), (9, [25]), (10, [26]), (11, [27, 28])],
    2: [(26, [18]), (27, [19]), (28, [20]), (29, [21]), (30, [22]), (31, [23]), (32, [24]), (33, [26])],
    3: [(48, [18, 19]), (49, [20, 21]), (50, [22, 23]), (51, [24, 26]), (59, [18, 19]), (60, [20, 21]), (61, [22, 23]), (62, [24, 26]), (70, [18, 19, 20]), (71, [21, 22, 23]), (72, [24, 26])],
}

QUESTION_NUMBERS = {
    1: {18: range(1, 6), 19: range(6, 11), 20: range(11, 15), 21: range(15, 19), 22: range(19, 23), 23: range(23, 27), 24: range(27, 31), 25: range(31, 33), 26: range(33, 37), 27: range(37, 39), 28: range(39, 41)},
    2: {18: range(97, 102), 19: range(102, 107), 20: range(107, 112), 21: range(112, 118), 22: range(118, 123), 23: range(123, 128), 24: range(128, 133), 26: range(133, 138)},
    3: {18: [211, 233, 255], 19: [212, 234, 256], 20: [213, 235, 257], 21: [214, 236, 258], 22: [215, 237, 259], 23: [216, 238, 260], 24: [217, 239, 261], 26: [218, 240, 262]},
}

MARKERS = "①②③④⑤⑥⑦⑧"
MARKER_INDEX = {marker: index for index, marker in enumerate(MARKERS)}

# pypdf preserves the table rows but sometimes drops the whitespace between
# adjacent cells. These rows were checked against the rendered source pages.
TABLE_CHOICES = {
    1: ["be held invited to showcase", "hold inviting showcase", "be held invited showcase", "hold invited to showcase", "be held inviting to showcase"],
    31: ["where that was", "which that was", "where those was", "which those were", "where that were"],
    39: ["melt learn bowls", "melting learn bowl", "melt to learn bowl", "melt learn bowl", "melting to learn bowls"],
    99: ["evaluate conservation showcase", "present destruction showcase", "present conservation showcase", "evaluate destruction review", "present conservation review"],
    101: ["absence exhibit", "enrollment appreciate", "participation display", "criticism revise", "competition submit"],
    111: ["incompetent neglects", "skilled prioritizes", "competent overlooks", "unqualified considers", "capable highlights"],
    117: ["rehearse perfect", "avoid incomplete", "simulate imperfect", "predict limited", "practice authentic"],
    125: ["substantial disappear productive", "negligible remain wasteful", "substantial disappear wasteful", "negligible remain productive", "substantial remain productive"],
    127: ["remove decline", "preserve benefit", "eliminate improvement", "multiply edge", "erase setback"],
    129: ["back further distant", "back further nearby", "back nearer distant", "forward further nearby", "forward nearer distant"],
    132: ["obstacle past", "illusion composition", "opportunity history", "challenge evolution", "chance future"],
    134: ["vague criticism preserved", "vague recognition lost", "vivid criticism preserved", "vivid recognition preserved", "vivid recognition lost"],
    137: ["disregard ignoring", "fame distorting", "criticism depicting", "wealth financing", "recognition portraying"],
}


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def clean_page_noise(value: str) -> str:
    value = re.sub(r"Section[❶❷❸④❹].*?학력평가", "", value)
    value = re.sub(r"-\s*\d+\s*-", "", value)
    return compact(value)


def split_passage_segments(text: str):
    matches = list(re.finditer(r"┃6월\s+(\d+)번┃", text))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        yield int(match.group(1)), text[match.end():end]


def find_question_block(segment: str, question_no: int, question_numbers) -> str:
    start_match = re.search(rf"(?<!\d){question_no}\.", segment)
    if not start_match:
        raise ValueError(f"Question {question_no}: start not found")
    later = []
    for other in question_numbers:
        if other == question_no:
            continue
        match = re.search(rf"(?<!\d){other}\.", segment[start_match.end():])
        if match:
            later.append(start_match.end() + match.start())
    end = min(later) if later else len(segment)
    return segment[start_match.end():end]


def split_choices(value: str):
    positions = [(match.start(), match.group()) for match in re.finditer(f"[{MARKERS}]", value)]
    if len(positions) < 5:
        raise ValueError("fewer than five choices")
    positions = positions[:5]
    choices = []
    for index, (start, _) in enumerate(positions):
        end = positions[index + 1][0] if index + 1 < len(positions) else len(value)
        choices.append(compact(value[start + 1:end]))
    return compact(value[:positions[0][0]]), choices


def family_for(prompt: str) -> str:
    if "주어진 문장" in prompt or "흐름상 관계없는" in prompt or "이어질 순서" in prompt:
        return "structural"
    if "요약" in prompt:
        return "summary"
    if any(word in prompt for word in ("괄호", "밑줄", "빈칸", "의미하는", "어법", "어휘")):
        return "annotated"
    return "standard"


def skill_for(prompt: str) -> str:
    for word, skill in (("어법", "grammar"), ("어휘", "vocabulary"), ("빈칸", "blank"), ("주어진 문장", "insertion"), ("관계없는", "irrelevant"), ("이어질 순서", "order"), ("요약", "summary"), ("주제", "topic"), ("제목", "title"), ("목적", "purpose"), ("심경", "emotion"), ("내용과 일치", "content"), ("의미하는", "implication")):
        if word in prompt:
            return skill
    return "comprehension"


def extract_answers(reader: PdfReader):
    text = "\n".join(reader.pages[index - 1].extract_text() or "" for index in range(111, 150))
    answers = {}
    for section in QUESTION_NUMBERS.values():
        for numbers in section.values():
            for question_no in numbers:
                match = re.search(rf"(?<!\d){question_no}\)\s*([{MARKERS}](?:\s*,?\s*[{MARKERS}])*)", text)
                if not match:
                    raise ValueError(f"Question {question_no}: answer not found")
                answers[question_no] = [MARKER_INDEX[marker] for marker in match.group(1) if marker in MARKER_INDEX]
    return answers


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("passage_map", type=Path, help='JSON object such as {"18":"uuid", ...}')
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    passage_map = {int(number): value for number, value in json.loads(args.passage_map.read_text()).items()}
    reader = PdfReader(str(args.pdf))
    answers = extract_answers(reader)
    questions = []

    for section, page_groups in PAGE_GROUPS.items():
        for page_no, expected_passages in page_groups:
            page_text = reader.pages[page_no - 1].extract_text() or ""
            segments = dict(split_passage_segments(page_text))
            for passage_no in expected_passages:
                segment = segments[passage_no]
                numbers = [number for number in QUESTION_NUMBERS[section][passage_no] if re.search(rf"(?<!\d){number}\.", segment)]
                if not numbers:
                    raise ValueError(f"Page {page_no}, Passage {passage_no}: no expected questions found")
                common_passage = ""
                if section in (1, 2):
                    after_intro = segment.split("답하시오.", 1)[-1]
                    first = re.search(rf"(?<!\d){numbers[0]}\.", after_intro)
                    common_passage = clean_page_noise(after_intro[:first.start()] if first else "")

                for position, question_no in enumerate(numbers):
                    block = find_question_block(segment, question_no, numbers)
                    answer_marker = re.search(rf"(?<!\d){question_no}\)", block)
                    if not answer_marker:
                        raise ValueError(f"Question {question_no}: choice boundary not found")
                    prompt = compact(block[:answer_marker.start()])
                    before_choices, choices = split_choices(block[answer_marker.end():])
                    choices = TABLE_CHOICES.get(question_no, choices)
                    question_passage = common_passage if section in (1, 2) else clean_page_noise(before_choices)
                    family = family_for(prompt)
                    payload = {
                        "family": family,
                        "skill": skill_for(prompt),
                        "prompt": prompt,
                        "choices": choices,
                        "answer": answers[question_no],
                        "multi_select": len(answers[question_no]) > 1,
                        "position": section * 1000 + question_no,
                        "source": {"provider": "exam4you", "exam": "2026-06 부산 고2 예상문제", "passage_no": passage_no, "source_question_no": question_no, "section": str(section)},
                    }
                    if section != 3 or family != "standard":
                        payload["variant_text"] = question_passage
                    status = "draft" if question_no == 32 else "available"
                    questions.append({"passage_id": passage_map[passage_no], "type": "multiple_choice", "status": status, "payload": payload})

    questions.sort(key=lambda item: (item["payload"]["source"]["passage_no"], item["payload"]["position"], item["payload"]["source"]["source_question_no"]))
    args.output.write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"questions": len(questions), "available": sum(item["status"] == "available" for item in questions), "draft": sum(item["status"] == "draft" for item in questions)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
