import urllib.request, pathlib, zipfile, io, base64, hashlib, subprocess
work=pathlib.Path('/tmp/breeze-provider-artwork');work.mkdir(exist_ok=True)
def report(name,data):
 print('ASSET_JSON',__import__('json').dumps({'name':name,'sha256':hashlib.sha256(data).hexdigest(),'base64':base64.b64encode(data).decode()}))
google=urllib.request.urlopen('https://developers.google.com/static/identity/images/signin-assets.zip',timeout=60).read()
print('GOOGLE_ARCHIVE_SHA256',hashlib.sha256(google).hexdigest())
with zipfile.ZipFile(io.BytesIO(google)) as z:
 names=[n for n in z.namelist() if n.endswith('.svg') and not n.startswith('__MACOSX')]
 print('GOOGLE_SVG_NAMES',__import__('json').dumps(names))
 for name in names:
  if 'Show text=No' in name and 'Shape=Square' in name and '/Light/' in name:report('google/'+name,z.read(name))
for color in ['black','white']:
 url='https://appleid.cdn-apple.com/appleid/button?type=sign-in&color='+color+'&border=false&height=48&width=250&locale=ko_KR'
 data=urllib.request.urlopen(url,timeout=60).read()
 print('APPLE_GENERATOR',color,'bytes',len(data),'signature',repr(data[:8]))
 report('apple/signin-ko-'+color+'.png',data)
