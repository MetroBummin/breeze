#!/usr/bin/env python3
"""Check shipped icon encodings, references, density layers and original contours.

Uses only the Python standard library. Decodes the rendered RGBA adaptive layers
so transparent padding and the safe circle are checked from actual pixels.
"""
from pathlib import Path
import hashlib, json, math, re, struct, zlib
ROOT=Path(__file__).resolve().parents[1]

def png(name,decode=False):
 data=(ROOT/name).read_bytes();assert data[:8]==b'\x89PNG\r\n\x1a\n',name
 pos=8;chunks=[]
 while pos<len(data):
  n=struct.unpack('>I',data[pos:pos+4])[0];kind=data[pos+4:pos+8];part=data[pos+8:pos+8+n];pos+=n+12
  if kind==b'IHDR':w,h,depth,color,_,_,interlace=struct.unpack('>IIBBBBB',part)
  if kind==b'IDAT':chunks.append(part)
 assert depth==8 and color in (2,6) and interlace==0,(name,depth,color,interlace)
 if not decode:return w,h,color,None
 channels=3 if color==2 else 4;stride=w*channels;raw=zlib.decompress(b''.join(chunks));rows=[];previous=bytearray(stride)
 for y in range(h):
  start=y*(stride+1);kind=raw[start];row=bytearray(raw[start+1:start+1+stride])
  for x in range(stride):
   a=row[x-channels] if x>=channels else 0;b=previous[x];c=previous[x-channels] if x>=channels else 0
   if kind==1:row[x]=(row[x]+a)&255
   elif kind==2:row[x]=(row[x]+b)&255
   elif kind==3:row[x]=(row[x]+((a+b)//2))&255
   elif kind==4:
    p=a+b-c;pa,pb,pc=abs(p-a),abs(p-b),abs(p-c);row[x]=(row[x]+(a if pa<=pb and pa<=pc else b if pb<=pc else c))&255
   else:assert kind==0,(name,kind)
  rows.append(row);previous=row
 return w,h,color,rows

primary='assets/brand/app-icon.svg';selected='assets/brand/icons/icon-b-flow-dark.svg'
assert (ROOT/primary).read_bytes()==(ROOT/selected).read_bytes()
assert 'rx=' not in (ROOT/primary).read_text(),'Do not pre-mask native icon corners'
for name,size in [('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',1024),('assets/favicon/icon-512.png',512),('assets/favicon/icon-192.png',192),('assets/favicon/apple-touch-icon.png',180),('assets/favicon/favicon.png',64),('android/app/src/main/res/mipmap-nodpi/ic_launcher.png',512)]:
 w,h,color,rows=png(name,True);assert (w,h,color)==(size,size,2),(name,w,h,color)
 assert all(tuple(rows[y][x*3:x*3+3])==(44,44,46) for x,y in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]),name
assert (ROOT/'assets/favicon/icon-512.png').read_bytes()==(ROOT/'android/app/src/main/res/mipmap-nodpi/ic_launcher.png').read_bytes()
catalog=json.loads((ROOT/'ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json').read_text())
assert catalog['images']==[{'filename':'AppIcon-512@2x.png','idiom':'universal','platform':'ios','size':'1024x1024'}]
for density,size in [('mdpi',108),('hdpi',162),('xhdpi',216),('xxhdpi',324),('xxxhdpi',432)]:
 for layer in ['foreground','monochrome']:
  name=f'android/app/src/main/res/drawable-{density}/breeze_icon_{layer}.png';w,h,color,rows=png(name,True);assert (w,h,color)==(size,size,6),name
  pixels=[((x+.5)*108/size,(y+.5)*108/size) for y,row in enumerate(rows) for x in range(w) if row[x*4+3]]
  assert pixels and all(21<=x<=87 and 21<=y<=87 for x,y in pixels),name
  assert max(math.hypot(x-54,y-54) for x,y in pixels)<=33,(name,'66dp safe circle')
  assert rows[0][3]==0 and rows[-1][-1]==0,name
for api in [26,33]:
 xml=(ROOT/f'android/app/src/main/res/mipmap-anydpi-v{api}/ic_launcher.xml').read_text()
 assert '@color/breeze_icon_background' in xml and '@drawable/breeze_icon_foreground' in xml
 assert ('<monochrome' in xml)==(api==33)
assert '<color name="breeze_icon_background">#2C2C2E</color>' in (ROOT/'android/app/src/main/res/values/colors.xml').read_text()
for size in [192,512]:assert png(f'assets/favicon/icon-maskable-{size}.png')[:3]==(size,size,2)
# Foreground geometry remains inside the web 40% circle, including anti-alias margin.
assert 'scale(.96)' in (ROOT/'assets/brand/icons/web-b-maskable.svg').read_text()
w,h,color,rows=png('assets/brand/icons/web-b-maskable-foreground.png',True)
assert (w,h,color)==(512,512,6)
assert max(math.hypot(x+.5-256,y+.5-256) for y,row in enumerate(rows) for x in range(w) if row[x*4+3])<=512*.4
original=re.search(r'<path d="([^"]+)"',(ROOT/'assets/brand/wordmark-mask.svg').read_text()).group(1)
for color in ['flow','neutral']:
 for theme in ['light','dark']:
  svg=(ROOT/f'assets/brand/wordmarks/breeze-{color}-{theme}.svg').read_text()
  assert all(path==original for path in re.findall(r'<path d="([^"]+)"',svg)),(color,theme,'Original z/r/e contour')
  assert png(f'assets/brand/wordmarks/breeze-{color}-{theme}-2x.png')[:3]==(1682,516,6)
for mark in ['b','br']:
 for color in ['flow','neutral']:
  for theme in ['light','dark']:assert png(f'assets/brand/icons/icon-{mark}-{color}-{theme}-1024.png')[:3]==(1024,1024,2)
for name in ['index.html','landing/index.html','support/index.html']:
 assert 'favicon.png' in (ROOT/name).read_text();assert 'favicon.ico' not in (ROOT/name).read_text()
# Browser favicon updates must change their URL, rather than reuse a stale cache key.
for entry in ['index.html','landing/index.html','support/index.html']:
 text=(ROOT/entry).read_text()
 for asset in ['favicon.png','apple-touch-icon.png']:
  digest=hashlib.sha256((ROOT/'assets/favicon'/asset).read_bytes()).hexdigest()[:8]
  assert f'assets/favicon/{asset}?v={digest}' in text,(entry,asset,'content-addressed URL')
print('Icon assets passed: opaque square iOS/Web/legacy Android; 10 padded adaptive/themed density layers inside 66dp safe circle; four original-z wordmarks; eight reusable variants.')
