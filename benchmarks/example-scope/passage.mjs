/** Join hand-labeled pieces. The joiner is not part of any example. */
export function fromParts(id, dataset, parts, joiner = ' '){
  let text = '';
  const spans = [];
  parts.forEach((part, index) => {
    const item = typeof part === 'string' ? { text: part, category: 'prose' } : part;
    if (index) text += joiner;
    const start = text.length;
    text += item.text;
    let from = start;
    let to = text.length;
    while (from < to && /\s/.test(text[from])) from++;
    while (to > from && /\s/.test(text[to - 1])) to--;
    spans.push({ start: from, end: to, category: item.category || 'prose' });
  });
  return { id, dataset, text, spans };
}
