// Synthetic JPEG page only: no hidden text, no external/user document.
export function scanPdf(jpeg,{rotation=0}={}){
 const image=Buffer.from(jpeg,'base64');
 const stream='q 600 0 0 800 0 0 cm /Scan Do Q';
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Rotate ${rotation} /Resources << /XObject << /Scan 5 0 R >> >> /Contents 4 0 R >>`,
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 600 /Height 800 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`),image,Buffer.from('\nendstream')])
 ];
 const chunks=[Buffer.from('%PDF-1.4\n')],offsets=[0];let length=chunks[0].length;
 objects.forEach((obj,i)=>{offsets.push(length);const chunk=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),Buffer.from(obj),Buffer.from('\nendobj\n')]);chunks.push(chunk);length+=chunk.length;});
 chunks.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`));
 return Buffer.concat(chunks);
}
