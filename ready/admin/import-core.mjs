export function parsePassageRows(input) {
  const rows = [];
  const errors = [];
  for (const [lineIndex, rawLine] of String(input || '').replace(/\r\n?/g, '\n').split('\n').entries()) {
    const cells = rawLine.split('\t');
    if (cells.every(cell => !cell.trim())) continue;
    if (cells.length !== 2) {
      errors.push(`${lineIndex + 1}번 행은 영어와 한국어 두 열이어야 합니다.`);
      continue;
    }
    const text = cells[0].trim(), translation = cells[1].trim();
    if (!text) errors.push(`${lineIndex + 1}번 행의 영어 문장이 비어 있습니다.`);
    if (!translation) errors.push(`${lineIndex + 1}번 행의 한국어 해석이 비어 있습니다.`);
    rows.push({ text, translation, sourceLine: lineIndex + 1 });
  }
  if (!rows.length && !errors.length) errors.push('붙여넣은 문장이 없습니다.');
  return { rows, errors };
}

export function validatePassageRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return ['저장할 문장이 없습니다.'];
  if (rows.length > 80) return ['한 지문은 80행 이하로 입력해 주세요.'];
  const errors = [];
  rows.forEach((row, index) => {
    const number = index + 1;
    if (!String(row?.text || '').trim()) errors.push(`${number}번 행의 영어 문장이 비어 있습니다.`);
    else if (String(row.text).trim().length > 5000) errors.push(`${number}번 행의 영어 문장이 너무 깁니다.`);
    if (!String(row?.translation || '').trim()) errors.push(`${number}번 행의 한국어 해석이 비어 있습니다.`);
    else if (String(row.translation).trim().length > 5000) errors.push(`${number}번 행의 한국어 해석이 너무 깁니다.`);
  });
  return errors;
}
