import { createOpenAI } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';
import { readFileSync } from 'node:fs';

type Passage = { id: string; title: string; content: string; relatedIds?: string[] };
const passages: Passage[] = JSON.parse(readFileSync(new URL('./corpus.json', import.meta.url), 'utf8'));
let index: Promise<number[][]> | undefined;

/** One short source per chunk; a larger corpus should use persistent storage. */
export async function searchKnowledge(query: string, apiKey: string) {
  const model = createOpenAI({ apiKey }).embedding('text-embedding-3-small');
  index ??= embedMany({ model, values: passages.map(p => `${p.id}\n${p.title}\n${p.content}`) })
    .then(result => result.embeddings)
    .catch(error => { index = undefined; throw error; });
  const vectors = await index;
  const { embedding } = await embed({ model, value: query });
  const norm = (v: number[]) => Math.sqrt(v.reduce((sum, n) => sum + n * n, 0));
  const results = passages.map((passage, i) => ({
    ...passage,
    score: vectors[i].reduce((sum, n, j) => sum + n * embedding[j], 0) / (norm(vectors[i]) * norm(embedding)),
  })).sort((a, b) => b.score - a.score).slice(0, 4);
  // Keep explicitly referenced operating/safety evidence with the retrieved guide.
  const relatedIds = new Set(results.flatMap(p => p.relatedIds ?? []));
  const referenced = passages.filter(p => relatedIds.has(p.id) && !results.some(r => r.id === p.id));
  return { method: 'semantic cosine similarity; top 4 plus linked source passages; no relevance cutoff', corpusSize: passages.length, results, referenced };
}
