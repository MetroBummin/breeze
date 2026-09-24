// Runs the same generator as the Edge Function, without calling Supabase.
// One article by default; --all runs the fixed 18-article local RSS corpus.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateArticlePreview, ARTICLE_PREVIEW_MODEL } from '../supabase/functions/article-preview/generate.mjs';

const secretPath = resolve('supabase/.env.article-preview.local');
const secret = readFileSync(secretPath, 'utf8').match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1]?.trim();
if (!secret) throw new Error('OpenRouter key file is missing or empty');
const articles = JSON.parse(readFileSync('/tmp/breeze-article-preview-e2e-corpus-20260925.json', 'utf8'));
const selected = process.argv.includes('--remaining') ? articles.slice(1) :
  process.argv.includes('--all') ? articles : articles.slice(0, 1);
const results = [];
for (const article of selected) {
  try {
    const result = await generateArticlePreview(article.title, article.excerpt, secret);
    results.push({ source: article.source, title: article.title, url: article.url,
      excerpt: article.excerpt, ...result });
    console.log(JSON.stringify({ index: results.length, source: article.source, status: 'generated',
      model: result.model, latencyMs: result.latencyMs,
      promptTokens: result.usage?.prompt_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null }));
  } catch (error) {
    results.push({ source: article.source, title: article.title, url: article.url,
      excerpt: article.excerpt, error: error instanceof Error ? error.message : 'unknown' });
    console.log(JSON.stringify({ index: results.length, source: article.source, status: 'failed',
      error: results.at(-1).error }));
    if (selected.length === 1) break;
  }
}
const output = process.argv.includes('--remaining') ?
  '/tmp/breeze-article-preview-ai-remaining-20260925.json' :
  '/tmp/breeze-article-preview-ai-results-20260925.json';
writeFileSync(output, JSON.stringify({ requestedModel: ARTICLE_PREVIEW_MODEL, results }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ resultFile: output, generated: results.filter(item => item.meta).length,
  failed: results.filter(item => item.error).length }));
