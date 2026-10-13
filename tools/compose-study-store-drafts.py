"""Editorial store drafts: real source captures are image layers, never redrawn UI."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import argparse, hashlib, json

parser=argparse.ArgumentParser()
parser.add_argument('sources',type=Path)
parser.add_argument('output',type=Path)
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
font_path='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
specs={
 'iphone-69':{'size':(1320,2868),'center':660,'lines':[(274,372),(416,514)],'frame':(144,633,1177,2800),'innerWidth':976,'radius':108},
 'ipad-13':{'size':(2064,2752),'center':1032,'lines':[(223,314),(355,446)],'frame':(193,471,1876,2681),'innerWidth':1579,'radius':92},
}
rows=[]
for source in sorted(args.sources.glob('*.png')):
 device=next((d for d in specs if source.name.startswith(d+'-')),None)
 if not device:continue
 spec=specs[device];canvas=Image.new('RGB',spec['size'],'white');draw=ImageDraw.Draw(canvas);glyphs=[]
 for text,color,(top,bottom) in zip(['모아 둔 단어를','한 장씩 익혀요'],['#1B3036','#668A8A'],spec['lines']):
  fonts=[ImageFont.truetype(font_path,n,index=1) for n in range(90,150)]
  font=min(fonts,key=lambda f:abs((f.getbbox(text)[3]-f.getbbox(text)[1])-(bottom-top+1)))
  left,up,right,down=font.getbbox(text);x=round(spec['center']-(right-left)/2-left);y=top-up
  draw.text((x,y),text,font=font,fill=color);glyphs.append({'text':text,'font':'Noto Sans CJK KR Bold (editorial approximation)','fontSize':font.size,'inkBounds':[x+left,y+up,x+right,y+down]})
 outer=spec['frame'];draw.rounded_rectangle(outer,radius=spec['radius'],fill='#121314')
 capture=Image.open(source).convert('RGB');w=spec['innerWidth'];h=round(capture.height*w/capture.width)
 layer=capture.resize((w,h),Image.Resampling.LANCZOS)
 x=round(spec['center']-w/2);y=round((outer[1]+outer[3]-h)/2)
 assert x>=outer[0] and y>=outer[1] and x+w<=outer[2] and y+h<=outer[3]
 mask=Image.new('L',(w,h));ImageDraw.Draw(mask).rounded_rectangle((0,0,w-1,h-1),radius=max(20,spec['radius']-28),fill=255)
 canvas.paste(layer,(x,y),mask);target=args.output/('store-'+source.name);canvas.save(target)
 assert canvas.mode=='RGB' and canvas.size==spec['size']
 rows.append({'file':target.name,'pixels':list(canvas.size),'mode':'RGB, no alpha','source':source.name,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'screenPlacement':[x,y,w,h],'uniformScale':w/capture.width,'aspectRatioError':abs((w/h)/(capture.width/capture.height)-1),'frame':list(outer),'headline':glyphs,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
manifest={'status':'Editorial draft for pixel review; not uploaded or final-approved','uiSourceCommit':json.loads((args.sources/'manifest.json').read_text())['sourceCommit'],'uiLayers':'Actual source-browser captures uniformly scaled, rounded device-screen mask only; no UI redraw, invented status bar, logo or credentials. No native build was made.','templateBasis':'User-provided measured approved PNG layout, not an editable original. Font and plain black frame are approximations.','appleSpecification':'https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/','files':rows}
(args.output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(f'{len(rows)} RGB editorial drafts; uniform screenshot layers; original captures preserved')
