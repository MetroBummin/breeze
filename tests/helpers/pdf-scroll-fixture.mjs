export function fixturePdf(count=120,{tallEvery=0}={}){
  const objects=['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids=[];
  for(let n=0;n<count;n++){
    const page=objects.length+1, stream=page+1; kids.push(`${page} 0 R`);
    const landscape=n%7===6;
    const lines=Array.from({length:26},(_,i)=>`1 0 0 1 50 ${landscape?560-i*18:740-i*24} Tm (Page ${n+1} line ${i+1}. Stable reading keeps every word in place.) Tj`).join('\n');
    const content=`BT /F1 13 Tf\n${lines}\nET`;
    const size=tallEvery&&(n+1)%tallEvery===0?'612 1400':landscape?'792 612':'612 792';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objects[0]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[1]=`<< /Type /Pages /Count ${count} /Kids [${kids.join(' ')}] >>`;
  let pdf='%PDF-1.4\n', offsets=[0];
  for(let i=0;i<objects.length;i++){ offsets.push(pdf.length); pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref=pdf.length;
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  pdf+=offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('');
  pdf+=`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
