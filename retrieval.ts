import { createOpenAI } from '@ai-sdk/openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { embed, embedMany } from 'ai';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { productSchema } from './src/products.js';

const passageSchema = z.object({
  id: z.string(), title: z.string(), content: z.string(), relatedIds: z.array(z.string()).optional(),
  // Pinecone metadata is flat; the catalog payload is stored as a JSON string.
  product: z.preprocess(value => typeof value === 'string' ? JSON.parse(value) : value, productSchema.optional()),
});
const corpus = readFileSync(new URL('./corpus.json', import.meta.url), 'utf8');
// A changed snapshot gets a new namespace, so removed sources cannot leak into searches.
const namespace = `public-${createHash('sha256').update(corpus).digest('hex').slice(0, 16)}`;
const reranker = 'bge-reranker-v2-m3';
const includeFields = ['title', 'content', 'text', 'relatedIds', 'product'];

/** Indexing is explicit; chat only reads documents from Pinecone, with no local fallback. */
export function createKnowledgeBase(env: Record<string, string>) {
  if (!env.OPENAI_API_KEY?.trim() || !env.PINECONE_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY and PINECONE_API_KEY must be set on the server.');
  }
  const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY.trim() });
  const indexName = env.PINECONE_INDEX_NAME?.trim() || 'alien-holiday-rag';
  const index = pc.index({ name: indexName, namespace });
  const model = createOpenAI({ apiKey: env.OPENAI_API_KEY.trim() }).embedding('text-embedding-3-small');

  return {
    async indexCorpus() {
      const existing = await pc.indexes.list();
      if (!existing.indexes?.some(item => item.name === indexName)) {
        await pc.indexes.create({
          name: indexName,
          deployment: { deploymentType: 'managed', cloud: 'aws', region: 'us-east-1' },
          schema: { fields: {
            text: { type: 'string', fullTextSearch: {} },
            embedding: { type: 'dense_vector', dimension: 1536, metric: 'cosine' },
          } },
          waitUntilReady: true, timeout: 120_000,
        });
      }
      const passages = z.array(passageSchema).parse(JSON.parse(corpus));
      const texts = passages.map(p => `${p.id}\n${p.title}\n${p.content}`);
      const { embeddings } = await embedMany({ model, values: texts });
      await index.documents.upsert({ documents: passages.map((p, i) => ({
        _id: p.id, title: p.title, content: p.content, relatedIds: p.relatedIds ?? [],
        text: texts[i], embedding: embeddings[i],
        ...(p.product ? { product: JSON.stringify(p.product) } : {}),
      })) });
      // Wait for both search paths, not merely a successful write acknowledgement.
      for (let attempt = 0; attempt < 30; attempt++) {
        const [dense, keyword] = await Promise.all([
          index.documents.search({ scoreBy: [{ type: 'dense_vector', fields: ['embedding'], values: embeddings[0] }], topK: passages.length, includeFields: ['content'] }),
          index.documents.search({ scoreBy: [{ type: 'text', fields: ['text'], query: 'public' }], topK: passages.length, includeFields: ['content'] }),
        ]);
        if ([dense, keyword].every(response => passages.every(p => response.matches.some(m => m._id === p.id && m.content === p.content)))) {
          return { indexName, namespace, indexed: passages.length, ready: true };
        }
        await setTimeout(2000);
      }
      throw new Error('Documents were written, but both search paths did not become ready within 60 seconds.');
    },

    async search(query: string) {
      const { embedding } = await embed({ model, value: query });
      const [dense, keyword] = await Promise.all([
        index.documents.search({ scoreBy: [{ type: 'dense_vector', fields: ['embedding'], values: embedding }], topK: 10, includeFields }),
        index.documents.search({ scoreBy: [{ type: 'text', fields: ['text'], query }], topK: 10, includeFields }),
      ]);
      const candidates = new Map<string, { passage: z.infer<typeof passageSchema>; text: string; rrfScore: number }>();
      for (const lane of [dense, keyword]) {
        lane.matches.forEach((match, i) => {
          const candidate = candidates.get(match._id) ?? {
            passage: passageSchema.parse({ ...match, id: match._id }),
            text: z.string().parse(match.text), rrfScore: 0,
          };
          // Ranks are comparable across lanes; raw cosine and BM25 scores are not.
          candidate.rrfScore += 1 / (60 + i + 1);
          candidates.set(match._id, candidate);
        });
      }
      const fused = [...candidates.values()].sort((a, b) => b.rrfScore - a.rrfScore).slice(0, 12);
      if (!fused.length) throw new Error('No indexed documents found. Run pnpm index-corpus before chatting.');
      const reranked = await pc.inference.rerank({
        model: reranker, query, documents: fused.map(c => ({ id: c.passage.id, text: c.text })),
        topN: Math.min(4, fused.length), returnDocuments: false, parameters: { truncate: 'NONE' },
      });
      const results = reranked.data.map(item => ({ ...fused[item.index].passage, rerankerScore: item.score }));
      // Explicitly authored links preserve safety evidence; these are not ranked hits.
      const relatedIds = [...new Set(results.flatMap(p => p.relatedIds ?? []))].filter(id => !results.some(p => p.id === id));
      const linked = relatedIds.length ? await index.documents.fetch({ ids: relatedIds }) : undefined;
      const referenced = relatedIds.map(id => {
        const document = linked?.documents[id];
        if (!document) throw new Error(`Linked source ${id} is missing from the indexed snapshot.`);
        return passageSchema.parse({ ...document, id: document._id });
      });
      const rankTrace = (matches: typeof dense.matches) => matches.map((m, i) => ({ id: m._id, rank: i + 1, score: m._score }));
      return {
        method: 'Pinecone dense cosine + BM25 → reciprocal rank fusion → cross-encoder reranking; top 4 plus linked sources; no relevance cutoff',
        retrieval: {
          database: 'Pinecone', index: indexName, namespace,
          semantic: rankTrace(dense.matches), keyword: rankTrace(keyword.matches),
          fusion: { method: 'RRF', rankConstant: 60, candidates: fused.map((c, i) => ({ id: c.passage.id, rank: i + 1, score: c.rrfScore })) },
          reranker: { model: reranker, results: results.map((p, i) => ({ id: p.id, rank: i + 1, score: p.rerankerScore })) },
        },
        results, referenced,
      };
    },
  };
}
