// Synthetic content only. No user PDF, student data or copyrighted exam source.
export function originalChoiceFixture({rotation=0,missingLabel=false}={}) {
  const lines=[
    [40,730,'Choose the best statement'],
    [40,700,'A) reduce oxygen consumption'],
    [40,665,(missingLabel?'':'B) ')+'increase oxygen consumption'],
    [55,645,'without changing oxygen pressure'],
    [40,610,'C) preserve oxygen pressure'],
    [330,730,'Another question'],
    [330,700,'A) reduce oxygen consumption'],
    [330,665,'B) decrease oxygen consumption'],
    [345,645,'without changing oxygen pressure'],
    [330,610,'C) preserve oxygen pressure'],
  ];
  const stream='BT /F1 12 Tf\n'+lines.map(([x,y,t])=>`1 0 0 1 ${x} ${y} Tm (${t.replace(/[()\\]/g,c=>'\\'+c)}) Tj`).join('\n')+'\nET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [4 0 R] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Rotate ${rotation} /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=pdf.length;
  pdf+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+
    `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
export const originalChoiceGold=[
  'B) increase oxygen consumption\nwithout changing oxygen pressure',
  'B) decrease oxygen consumption\nwithout changing oxygen pressure',
];
