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
  if 'icon' in name.lower() and ('light' in name.lower() or 'neutral' in name.lower()):report('google/'+name,z.read(name))
apple=urllib.request.urlopen('https://devimages-cdn.apple.com/design/resources/download/Logo-Sign-in-with-Apple.dmg',timeout=60).read()
print('APPLE_ARCHIVE_SHA256',hashlib.sha256(apple).hexdigest())
p=work/'apple.dmg';p.write_bytes(apple);mount=work/'apple'
subprocess.run(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',str(mount),str(p)],check=True)
try:
 for file in mount.rglob('*'):
  if file.suffix.lower()=='.svg':report('apple/'+str(file.relative_to(mount)),file.read_bytes())
finally:subprocess.run(['hdiutil','detach',str(mount)],check=True)
