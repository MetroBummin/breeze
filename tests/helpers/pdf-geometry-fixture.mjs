// Self-contained PDF operators: spacing, TJ, rotated page and dense highlights.
export function pdfGeometryFixture(linesOverride){
 const objects=['','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 const kids=[];
 for(let pageIndex=0;pageIndex<3;pageIndex++){
  const page=objects.length+1,stream=page+1;kids.push(`${page} 0 R`);
  const lines=linesOverride?[...linesOverride]:['ill minimum world maximum, extraordinary!',"Don't forget a well-known word.",'A reader learns to take','care of every word.'];
  if(!linesOverride)for(let i=0;i<27;i++)lines.push(`Line ${i+1}: minimum world maximum highlights stay aligned.`);
  const content=`BT /F1 12 Tf 0.23 Tc 1.7 Tw\n`+lines.map((s,i)=>`1 0 0 1 42 ${745-i*21} Tm (${s}) Tj`).join('\n')+
   '\n1 0 0 1 42 75 Tm [(kern) -150 (ing) -500 (gap)] TJ\nET';
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ${pageIndex===1?'/Rotate 90':''} /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`);
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
 }
 objects[0]='<< /Type /Catalog /Pages 2 0 R >>';objects[1]=`<< /Type /Pages /Count 3 /Kids [${kids.join(' ')}] >>`;
 let pdf='%PDF-1.4\n',offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+
 offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+
 `trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(pdf);
}
