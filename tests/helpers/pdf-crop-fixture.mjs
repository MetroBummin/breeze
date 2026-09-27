// A crop reuses a complete source page, just like an assembled exam handout.
export function pdfCropFixture({ocr=false}={}){
 const text='BT /F1 16 Tf '+(ocr?'3 Tr ':'')+' 1 0 0 1 40 740 Tm (foreignblank adults consists) Tj 1 0 0 1 40 680 Tm (Visible source belongs here.) Tj 1 0 0 1 40 560 Tm (hidden previous sentence.) Tj ET';
 const content='/Crop Do';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Crop 6 0 R >> >> /Contents 5 0 R >>',
 '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
 '<< /Type /XObject /Subtype /Form /BBox [30 650 400 710] /Matrix [1 0 0 1 50 -100] /Resources << /XObject << /Full 7 0 R >> >> /Length 8 >>\nstream\n/Full Do\nendstream',
 `<< /Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Length ${text.length} >>\nstream\n${text}\nendstream`];
 let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(pdf);
}
