"""Owned, deterministic synthetic scans; no downloaded/user documents.

Requires Pillow and DejaVu Sans to regenerate. PNG bytes and their independent
glyph bounds are committed so CI does not need either font or Pillow. Ink is
hand-authored vector strokes, NOT a representative human handwriting dataset.
"""
import json, math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "fixtures/pdf-ocr-stress"
OUT.mkdir(parents=True, exist_ok=True)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
W, H = 1200, 1600
cases = []

def text_page(size=48, color=0, bg=255, rows=None):
    image = Image.new("RGB", (W, H), (bg, bg, bg))
    draw, font, truth = ImageDraw.Draw(image), ImageFont.truetype(FONT, size), []
    for text, x, y in rows or [("Bright world", 90, 160), ("Quiet river", 90, 400)]:
        for word in text.split():
            box = draw.textbbox((x, y), word, font=font)
            draw.text((x, y), word, font=font, fill=(color, color, color))
            truth.append({"word": word, "box": list(box)})
            x += draw.textlength(word + " ", font=font)
    return image, truth

def save(name, pair, kind="printed", strict=False, note=""):
    image, truth = pair
    image.save(OUT / (name + ".png"), optimize=True)
    width, height = image.size
    expected = []
    for row in truth:
        x0, y0, x1, y1 = row["box"]
        expected.append({"word": row["word"], "x": x0/width, "y": y0/height,
                         "w": (x1-x0)/width, "h": (y1-y0)/height})
    cases.append({"id": name, "kind": kind, "width": width, "height": height,
                  "strict": strict, "note": note, "expected": expected})

base = text_page()
save("print-48", base, strict=True)
save("large-180", text_page(180, rows=[("Bright", 80, 160), ("world", 80, 600)]), strict=True)
save("huge-360", text_page(360, rows=[("READ", 70, 400)]))
for size in [8, 12, 16, 24]:
    save("small-" + str(size), text_page(size), note="Font size in raster pixels; glyph ink is smaller.")
for radius in [1.5, 4, 8]:
    save("blur-" + str(radius), (base[0].filter(ImageFilter.GaussianBlur(radius)), base[1]))
save("low-contrast", text_page(48, color=210, bg=235))
for degrees in [7, -13, 90, 180, 270]:
    im, truth = base
    angle = math.radians(degrees)
    rotated = im.rotate(degrees, resample=Image.Resampling.BICUBIC, expand=True, fillcolor="white")
    nw, nh = rotated.size
    transformed = []
    for row in truth:
        x0, y0, x1, y1 = row["box"]
        points = []
        for x, y in [(x0,y0),(x1,y0),(x0,y1),(x1,y1)]:
            dx, dy = x-W/2, y-H/2
            points.append((math.cos(angle)*dx + math.sin(angle)*dy + nw/2,
                           -math.sin(angle)*dx + math.cos(angle)*dy + nh/2))
        transformed.append({"word":row["word"],"box":[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]})
    save("rotation-" + str(degrees), (rotated, transformed), note="Pixel rotation; distinct from PDF intrinsic /Rotate and CSS zoom.")
save("two-columns", text_page(42, rows=[(t,x,y) for x, lines in [(60,["Bright river","Quiet garden","Gentle light"]),(680,["Hidden valley","Silver window","Open water"])] for y,t in zip([150,330,510],lines)]), strict=True)
save("repeated", text_page(48, rows=[("river river",80,y) for y in [150,400,650,900]]), strict=True)
save("dense", text_page(24, rows=[("Bright quiet river open window",45,y) for y in range(60,1500,60)]))

# Deliberately irregular, independently specified pen paths; no handwriting font.
strokes = {
 "R":[[(0,1),(.02,0),(.7,.03),(.92,.24),(.67,.48),(.05,.49)],[(.5,.49),(.95,1)]],
 "E":[[(.9,.03),(.06,0),(0,1),(.9,.97)],[(.04,.48),(.73,.52)]],
 "A":[[(0,1),(.43,0),(.95,1)],[(.22,.6),(.74,.58)]],
 "D":[[(0,1),(.04,0),(.52,.02),(.95,.3),(.94,.73),(.55,1),(0,1)]],
 "B":[[(0,1),(.03,0),(.61,.03),(.9,.21),(.6,.48),(.03,.49)],[(.6,.48),(.94,.7),(.87,.94),(.02,1)]],
 "O":[[(.5,0),(.12,.1),(0,.55),(.19,.98),(.7,1),(.94,.6),(.84,.16),(.5,0)]],
 "K":[[(.02,0),(0,1)],[(.9,.02),(.02,.5),(.94,1)]]}
def ink(image, word, x, y, scale=90):
    draw=ImageDraw.Draw(image)
    for i,ch in enumerate(word):
        for path in strokes[ch]:
            draw.line([(x+i*scale*.9+px*scale*.65,y+py*scale+(i%2)*4) for px,py in path],fill=(20,30,80),width=5,joint="curve")
    return {"word":word,"box":[x-3,y-3,x+(len(word)-1)*scale*.9+scale*.65+3,y+scale+7]}
hand = Image.new("RGB",(W,H),"white")
handtruth=[ink(hand,"READ",100,220),ink(hand,"BOOK",100,480)]
save("synthetic-ink-only",(hand,handtruth),kind="synthetic-ink",note="Hand-authored vector strokes, not real-user handwriting acceptance.")
mixed, truth=text_page()
truth.append(ink(mixed,"BOOK",100,800))
save("mixed-print-ink",(mixed,truth),kind="mixed-synthetic-ink")
overlap, truth=text_page()
draw=ImageDraw.Draw(overlap)
draw.line([(60,195),(400,190),(100,208),(550,200)],fill=(20,30,80),width=6)
save("flattened-ink-overlap",(overlap,truth),kind="flattened-ink",note="Ink burned into the source scan; live Breeze annotations are tested separately and excluded from OCR raster.")
blank=Image.new("RGB",(W,H),"white")
save("blank",(blank,[]),strict=True)
draw=ImageDraw.Draw(blank);rng=random.Random(192)
for i in range(15):
    draw.line([(rng.randint(80,1100),rng.randint(120,1400)) for _ in range(5)],fill=(40,40,40),width=3)
save("scribbles-no-words",(blank,[]),kind="synthetic-ink")
save("clipped-edges",text_page(80,rows=[("Bright",-150,200),("world",1060,500)]),note="Intentionally incomplete words; full source words are not recoverable from pixels.")
(OUT / "manifest.json").write_text(json.dumps({"schema":1,"provenance":"Owned deterministic printed and synthetic-ink images; no user or third-party documents","cases":cases},indent=2)+"\n")
print(json.dumps({"cases":len(cases),"bytes":sum(p.stat().st_size for p in OUT.glob('*.png'))}))
