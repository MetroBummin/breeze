/* Source-backed, display-only EN→KO lookup. No AI, vocabulary writes or prefetch.
 * Load once before a tap; call lookup with the selected token's occurrence index.
 * POS rules are deliberately partial. Deterministic does NOT mean always correct.
 */
(function (root) {
  'use strict';
  const WORD = /^[a-z]+(?:['-][a-z]+)*$/;
  const POS = new Set(['noun','verb','adjective','adverb','preposition','conjunction',
    'pronoun','determiner','article','numeral','interjection','unknown']);
  const normalize = value => String(value || '').replace(/’/g, "'").toLowerCase();
  function tokenize(sentence) {
    return [...String(sentence || '').matchAll(/[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?/g)]
      .map(match => ({text:match[0],start:match.index,end:match.index+match[0].length}));
  }
  function create(data, options = {}) {
    if (!data || data.version !== 1 || !data.entries || Array.isArray(data.entries))
      throw new TypeError('Unsupported local dictionary');
    const entries = new Map();
    for (const [lemma, entry] of Object.entries(data.entries)) {
      if (!WORD.test(lemma) || !entry || typeof entry.default !== 'string' || !entry.default.trim()
        || entry.default.length > 40 || !entry.pos || Array.isArray(entry.pos))
        throw new TypeError('Invalid local dictionary entry');
      const senses = Object.create(null);
      for (const [pos, meanings] of Object.entries(entry.pos)) {
        if (!POS.has(pos) || !Array.isArray(meanings) || !meanings.length || meanings.length > 3
          || meanings.some(ko => typeof ko !== 'string' || !ko.trim() || ko.length > 40))
          throw new TypeError('Invalid local dictionary senses');
        senses[pos] = Object.freeze([...meanings]);
      }
      if (!Object.values(senses).some(values => values.includes(entry.default)))
        throw new TypeError('Default must be a source sense');
      entries.set(lemma, Object.freeze({default:entry.default,pos:Object.freeze(senses)}));
    }
    const forms = new Map();
    for (const [form, lemmas] of Object.entries(data.forms || {})) {
      if (!WORD.test(form) || !Array.isArray(lemmas) || lemmas.some(lemma => !entries.has(lemma)))
        throw new TypeError('Invalid local dictionary form');
      forms.set(form, [...new Set(lemmas)]);
    }
    const candidatesFor = options.lemmaCandidates || (word => root.BreezeLexical
      ? root.BreezeLexical.lemmaCands(word) : [normalize(word)]);
    const counters = {lookups:0,localHits:0,localMisses:0,posMatched:0,posFallbacks:0,
      lemmaAmbiguities:0,properNameSkips:0};
    const determiner = /^(?:a|an|the|this|that|these|those|my|your|his|her|our|their|its|each|every)$/;
    const subject = /^(?:i|you|he|she|it|we|they)$/;
    const modal = /^(?:can|could|may|might|must|shall|should|will|would|do|does|did)$/;
    const be = /^(?:am|is|are|was|were|be|been)$/;
    const intensifier = /^(?:very|quite|rather|too|so)$/;
    function infer(tokens, index, candidates) {
      const available = new Set(candidates.flatMap(lemma => Object.keys(entries.get(lemma).pos)));
      available.delete('unknown');
      const prev = normalize(tokens[index-1]?.text), next = normalize(tokens[index+1]?.text);
      if (available.has('verb') && (modal.test(prev) || subject.test(prev)))
        return {pos:'verb',rule:'subject-or-auxiliary'};
      if (determiner.test(prev) && available.has('noun')) {
        // "the light box": adjective vs noun modifier is unresolved, not guessed.
        if (!available.has('adjective') || !next || be.test(next)
          || /^(?:of|in|on|with|from|for|which|that)$/.test(next))
          return {pos:'noun',rule:'determiner-context'};
      }
      if (available.has('adjective') && intensifier.test(prev))
        return {pos:'adjective',rule:'intensifier'};
      if (available.has('verb') && be.test(prev) && /ing$/i.test(tokens[index].text)
        && (determiner.test(next) || !available.has('adjective')))
        return {pos:'verb',rule:'progressive-context'};
      if (available.has('verb') && prev === 'to'
        && /^(?:want|wants|wanted|need|needs|needed|try|tries|tried|hope|plan|decided|able)$/
          .test(normalize(tokens[index-2]?.text)))
        return {pos:'verb',rule:'explicit-infinitive-context'};
      if (index === 0 && available.has('verb') && determiner.test(next))
        return {pos:'verb',rule:'imperative-candidate'};
      if (available.size === 1) return {pos:[...available][0],rule:'dictionary-only-pos'};
      return {pos:null,rule:'ambiguous'};
    }
    function lookup(input) {
      counters.lookups++;
      const miss = () => {counters.localMisses++;return null;};
      if (!input || typeof input.sentence !== 'string' || input.sentence.length > 2400) return miss();
      const tokens = tokenize(input.sentence), clicked = String(input.clicked || input.word || '');
      let index = input.clickedIndex;
      if (!Number.isInteger(index)) {
        const matches = tokens.flatMap((token,i) => normalize(token.text) === normalize(clicked) ? [i] : []);
        if (matches.length !== 1) return miss();
        index = matches[0];
      }
      if (index < 0 || index >= tokens.length || normalize(tokens[index].text) !== normalize(clicked)) return miss();
      const surface = tokens[index].text, word = normalize(surface);
      if (!WORD.test(word)) return miss();
      // Avoid silently explaining a brand/person as its lowercased common noun.
      if (/^[A-Z]{2,}$/.test(surface) || (index > 0 && /^[A-Z]/.test(surface))) {
        counters.properNameSkips++;return miss();
      }
      let guessed = [];
      try {guessed = candidatesFor(surface) || [];} catch (_) {}
      const supplied = Array.isArray(input.cands) ? input.cands : [];
      const candidates = [...new Set([word,...(forms.get(word) || []),...supplied,...guessed]
        .filter(value => typeof value === 'string').map(normalize))]
        .filter(value => entries.has(value)).slice(0,16);
      if (!candidates.length) return miss();
      const prediction = infer(tokens,index,candidates);
      const matching = prediction.pos ? candidates.filter(lemma => entries.get(lemma).pos[prediction.pos]) : [];
      const ambiguousLemma = matching.length > 1;
      const matched = matching.length === 1;
      const lemma = matched ? matching[0] : (entries.has(word) ? word : candidates[0]);
      const entry = entries.get(lemma), pos = matched ? prediction.pos : null;
      if (ambiguousLemma) counters.lemmaAmbiguities++;
      counters.localHits++;
      if (matched) counters.posMatched++; else counters.posFallbacks++;
      return Object.freeze({lemma,ko:matched ? entry.pos[pos][0] : entry.default,pos,
        predictedPos:prediction.pos,rule:ambiguousLemma ? 'ambiguous-lemma' : prediction.rule,
        source:'local-dictionary',provisional:true,
        sourceUrl:'https://ko.wiktionary.org/wiki/'+encodeURIComponent(lemma)+'#영어',
        license:'CC-BY-SA-4.0'});
    }
    return Object.freeze({lookup,stats:() => ({...counters,headwords:entries.size}),
      resetStats:() => {for (const key of Object.keys(counters)) counters[key]=0;}});
  }
  // Network/disk/parsing belongs here, never to lookup's synchronous critical path.
  async function load(url, options = {}) {
    const response = await fetch(url, {signal:options.signal});
    if (!response.ok) throw new Error('Local dictionary unavailable: '+response.status);
    const bytes = await response.arrayBuffer();
    if (options.expectedSha256) {
      const digest = await crypto.subtle.digest('SHA-256',bytes);
      const actual = Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
      if (actual !== options.expectedSha256) throw new Error('Local dictionary checksum mismatch');
    }
    return create(JSON.parse(new TextDecoder().decode(bytes)),options);
  }
  const api = Object.freeze({create,load,tokenize});
  root.BreezeLocalLexicon = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
