#!/usr/bin/env python3
"""One-time, reviewable selector for the frozen 500-headword PoC list."""
import json
import pathlib
import re
import sys

from wordfreq import top_n_list

POLYSEMOUS = """
run set get take charge make go come put turn hold keep break draw pass fall
stand play work call move point case light head hand line bank book field face
open close clear cover cut drive drop catch pick raise carry bring leave meet
show change check mark watch
""".split()

LEARNER_READING = """
analyze approach assume benefit concept conduct contrast context derive
distribute establish estimate evident factor feature function indicate
interpret involve issue method occur perceive principle proceed require respond
significant structure theory vary acknowledge ambiguous consequence constitute
demonstrate distinguish emerge imply infer maintain notion perspective relevant
reveal subtle sustain transform virtue encounter
""".split()

STOP = set("""
a an the and or but nor so yet if then than as because while although though
when whenever where wherever whether before after until unless since for of at
by from in into on onto over under above below between among through during
without within with about against toward towards upon via per to up down out off
again further once here there why how all any both each either few more most
other some such no not only own same too very can could may might must shall
should will would do does did done doing have has had having be am is are was
were been being i me my mine myself we us our ours ourselves you your yours
yourself yourselves he him his himself she her hers herself it its itself they
them their theirs themselves who whom whose which what this that these those
one two three four five six seven eight nine ten also just even ever never now
yes yeah okay ok oh well really actually perhaps maybe almost already still
much many little less least lot lots another every everyone everything someone
something anyone anything nobody nothing anywhere somewhere today tomorrow
yesterday monday tuesday wednesday thursday friday saturday sunday january
february march april june july august september october november december mr mrs
ms dr st vs etc n't 's 're 've 'll 'd 'm
""".split())
STOP.update({"fuck", "fucking", "shit", "john", "non", "whatever"})

IRREGULAR_INFLECTIONS = {
    "said", "made", "found", "thought", "left", "men", "given", "known",
    "taken", "saw", "heard", "held", "won", "gone", "sent", "paid",
    "felt", "tried", "getting", "running",
}

def is_inflected_duplicate(word, entries):
    if word in IRREGULAR_INFLECTIONS:
        return True
    if word.endswith("ies") and word[:-3] + "y" in entries:
        return True
    if word.endswith("es") and (word[:-2] in entries or word[:-1] in entries):
        return True
    if word.endswith("s") and word[:-1] in entries:
        return True
    if word.endswith("ing") and (word[:-3] in entries or word[:-3] + "e" in entries):
        return True
    if word.endswith("ed") and (word[:-2] in entries or word[:-1] in entries):
        return True
    return False

def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: select-headwords.py <extracted OEWN JSON directory>")
    json_dir = pathlib.Path(sys.argv[1])
    entries = {}
    for file in sorted(json_dir.glob("entries-*.json")):
        entries.update(json.loads(file.read_text()))

    special = set(POLYSEMOUS) | set(LEARNER_READING)
    missing = sorted(word for word in special if word not in entries)
    if missing:
        raise SystemExit(f"special headwords absent from OEWN: {missing}")
    if len(POLYSEMOUS) != 50 or len(set(POLYSEMOUS)) != 50:
        raise SystemExit(f"polysemous list must be 50 unique words, got {len(set(POLYSEMOUS))}")
    if len(LEARNER_READING) != 50 or len(set(LEARNER_READING)) != 50:
        raise SystemExit(f"learner list must be 50 unique words, got {len(set(LEARNER_READING))}")
    if set(POLYSEMOUS) & set(LEARNER_READING):
        raise SystemExit("special categories overlap")

    general = []
    for word in top_n_list("en", 20000):
        if len(general) == 400:
            break
        if word in special or word in STOP or not re.fullmatch(r"[a-z]+", word) or len(word) < 3:
            continue
        if is_inflected_duplicate(word, entries):
            continue
        value = entries.get(word)
        if not value or not any(pos in value for pos in ("n", "v", "a", "s", "r")):
            continue
        general.append(word)
    if len(general) != 400:
        raise SystemExit(f"could only select {len(general)} general words")

    output = {
        "selection_version": 1,
        "criteria": {
            "general": "First 400 eligible content-word lemmas in wordfreq 3.1.1 English frequency order after documented function-word exclusions.",
            "polysemous": "50 manually selected high-value sense-disambiguation headwords.",
            "learner_reading": "50 manually selected academic/literary reading headwords for English learners.",
        },
        "categories": {
            "general": general,
            "polysemous": POLYSEMOUS,
            "learner_reading": LEARNER_READING,
        },
    }
    target = pathlib.Path("data/lexicon/headwords.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {target}: {len(general)} + {len(POLYSEMOUS)} + {len(LEARNER_READING)}")

if __name__ == "__main__":
    main()
