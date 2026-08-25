const abbreviation = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e)\.$/i;

export function splitSentences(input) {
  const text = String(input || '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!text) return [];
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (!/[.!?]/.test(text[i])) continue;
    while (i + 1 < text.length && /[.!?]/.test(text[i + 1])) i += 1;
    while (i + 1 < text.length && /["'’”\]\)]/.test(text[i + 1])) i += 1;
    const candidate = text.slice(start, i + 1).trim();
    if (abbreviation.test(candidate)) continue;
    const next = text[i + 1] || '';
    if (next && !/\s/.test(next)) continue;
    if (candidate) out.push(candidate.replace(/\s*\n\s*/g, ' '));
    start = i + 1;
  }
  const tail = text.slice(start).trim().replace(/\s*\n\s*/g, ' ');
  if (tail) out.push(tail);
  return out;
}

export function expectedChunkRange(difficulty, sentenceCount) {
  if (difficulty === 1) return [Math.min(3, sentenceCount), Math.min(3, sentenceCount)];
  if (difficulty === 2) return [Math.min(4, sentenceCount), Math.min(5, sentenceCount)];
  if (difficulty === 3) return [Math.min(Math.ceil(sentenceCount / 2), sentenceCount), sentenceCount];
  if (difficulty === 4) return [sentenceCount, sentenceCount];
  throw new Error('difficulty must be 1–4');
}

export function exactChunkText(sentences) {
  return sentences.map(sentence => sentence.text.trim()).join(' ');
}

export function validateGeneratedOrder(raw, sentences, difficulty) {
  if (!raw || !Array.isArray(raw.chunks) || !Array.isArray(raw.correctOrder)) {
    throw new Error('AI result is missing chunks or correctOrder');
  }
  if (Number(raw.difficulty) !== Number(difficulty)) throw new Error('AI changed difficulty');
  const [minChunks, maxChunks] = expectedChunkRange(Number(difficulty), sentences.length);
  if (raw.chunks.length < minChunks || raw.chunks.length > maxChunks) {
    throw new Error(`Level ${difficulty} needs ${minChunks}${minChunks === maxChunks ? '' : `–${maxChunks}`} chunks`);
  }
  const sentenceById = new Map(sentences.map(sentence => [String(sentence.id), sentence]));
  const seenSentenceIds = [];
  const seenChunkIds = new Set();
  let previousIndex = -1;
  const chunks = raw.chunks.map((chunk, index) => {
    const id = String(chunk?.id || `chunk_${index + 1}`).trim();
    if (!id || seenChunkIds.has(id)) throw new Error('Chunk IDs must be unique');
    seenChunkIds.add(id);
    const sentenceIds = Array.isArray(chunk?.sentenceIds) ? chunk.sentenceIds.map(String) : [];
    if (!sentenceIds.length) throw new Error('Every chunk needs a source sentence');
    const source = sentenceIds.map(sentenceId => {
      const sentence = sentenceById.get(sentenceId);
      if (!sentence) throw new Error(`Unknown sentence ID: ${sentenceId}`);
      if (sentence.sentence_index <= previousIndex) throw new Error('Source sentences are missing, duplicated, or reordered');
      previousIndex = sentence.sentence_index;
      seenSentenceIds.push(sentenceId);
      return sentence;
    });
    const text = exactChunkText(source);
    if (String(chunk.text || '').replace(/\s+/g, ' ').trim() !== text.replace(/\s+/g, ' ').trim()) {
      throw new Error(`Chunk ${id} rewrote the source text`);
    }
    return { id, sentenceIds, text };
  });
  const allIds = sentences.map(sentence => String(sentence.id));
  if (JSON.stringify(seenSentenceIds) !== JSON.stringify(allIds)) throw new Error('Every source sentence must appear exactly once');
  const correctOrder = raw.correctOrder.map(String);
  if (correctOrder.length !== chunks.length || new Set(correctOrder).size !== chunks.length ||
      correctOrder.some(id => !seenChunkIds.has(id))) throw new Error('correctOrder must contain every chunk exactly once');
  if (JSON.stringify(correctOrder) !== JSON.stringify(chunks.map(chunk => chunk.id))) {
    throw new Error('correctOrder does not follow the source sentence order');
  }
  return { difficulty: Number(difficulty), chunks, correctOrder };
}

export function validateTeacherOrder(raw) {
  if (!raw || !Array.isArray(raw.chunks) || raw.chunks.length < 2) throw new Error('At least two chunks are required');
  const ids = raw.chunks.map(chunk => String(chunk.id || '').trim());
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('Chunk IDs must be unique');
  const chunks = raw.chunks.map(chunk => ({
    id: String(chunk.id),
    sentenceIds: Array.isArray(chunk.sentenceIds) ? chunk.sentenceIds.map(String) : [],
    text: String(chunk.text || '').trim(),
  }));
  if (chunks.some(chunk => !chunk.text)) throw new Error('Chunk text cannot be empty');
  const correctOrder = Array.isArray(raw.correctOrder) ? raw.correctOrder.map(String) : [];
  if (correctOrder.length !== ids.length || new Set(correctOrder).size !== ids.length || correctOrder.some(id => !ids.includes(id))) {
    throw new Error('correctOrder must contain every chunk exactly once');
  }
  return { difficulty: Number(raw.difficulty), chunks, correctOrder };
}

export function shuffled(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  if (copy.length > 1 && copy.every((item, index) => item.id === items[index].id)) {
    [copy[0], copy[1]] = [copy[1], copy[0]];
  }
  return copy;
}

export function isCorrectOrder(responseOrder, correctOrder) {
  return Array.isArray(responseOrder) && responseOrder.length === correctOrder.length &&
    responseOrder.every((id, index) => String(id) === String(correctOrder[index]));
}
