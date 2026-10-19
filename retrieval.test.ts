import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { UIMessage } from 'ai';
import { createKnowledgeBase } from './retrieval.js';
import { getCitedProducts } from './src/products.js';

const product = {
  sku: 'GV-1', name: 'Green Visitor', description: 'Decorative green alien costume.',
  imagePath: '/images/green-visitor.jpg', imageAlt: 'Green alien costume.', imageAuthor: 'Ale Escárcega',
  imageSource: 'https://commons.wikimedia.org/wiki/File:Alien_en_Tepoztl%C3%A1n.jpg',
  imageLicense: 'CC BY-SA 4.0', imageLicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
};

test('hybrid retrieval preserves keyword-only evidence, deduplicates, and follows reranked source order', async t => {
  const document = (id: string, score: number, relatedIds: string[] = []) => ({
    _id: id, _score: score, title: `Guide ${id}`, content: `Evidence from ${id}`, text: `Guide ${id}: Evidence from ${id}`, relatedIds,
    ...(id === 'C' ? { product: JSON.stringify(product) } : {}),
  });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (url.endsWith('/embeddings')) return Response.json({ data: [{ index: 0, embedding: [1, 0] }], usage: { prompt_tokens: 1, total_tokens: 1 } });
    if (url.endsWith('/indexes/hybrid-test')) return Response.json({ name: 'hybrid-test', host: 'hybrid-test.pinecone.io', status: { ready: true, state: 'Ready' } });
    if (url.endsWith('/documents/search')) return Response.json({ matches: body.score_by[0].type === 'text'
      ? [document('C', 9000), document('B', 20, ['A', 'D'])]
      : [document('A', 0.9), document('B', 0.4, ['A', 'D'])] });
    // Fused order is B, A, C; the reranker deliberately disagrees.
    if (url.endsWith('/rerank')) return Response.json({ data: [{ index: 2, score: 0.8 }, { index: 0, score: 0.6 }, { index: 1, score: 0.1 }], usage: { rerank_units: 1 } });
    if (url.endsWith('/documents/fetch')) return Response.json({ documents: { D: document('D', 0) } });
    throw new Error(`Unexpected test HTTP endpoint: ${url}`);
  });
  const kb = createKnowledgeBase({ OPENAI_API_KEY: 'test', PINECONE_API_KEY: 'test', PINECONE_INDEX_NAME: 'hybrid-test' });
  const result = await kb.search('exact-code');
  assert.deepEqual(result.results.map(p => [p.id, p.content, p.rerankerScore]), [
    ['C', 'Evidence from C', 0.8], ['B', 'Evidence from B', 0.6], ['A', 'Evidence from A', 0.1],
  ]);
  assert.deepEqual(result.referenced.map(p => [p.id, p.content]), [['D', 'Evidence from D']]);
  assert.deepEqual(result.retrieval.fusion.candidates.map(p => p.id), ['B', 'A', 'C']);
  assert.ok(Math.abs(result.retrieval.fusion.candidates[0].score - 2 / 62) < 1e-12);
  assert.deepEqual(result.retrieval.keyword.map(p => p.id), ['C', 'B']);
  assert.deepEqual(result.results[0].product, product);
});

test('a failed Pinecone search rejects instead of silently returning local corpus passages', async t => {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/embeddings')) return Response.json({ data: [{ index: 0, embedding: [1, 0] }] });
    if (url.endsWith('/indexes/failure-test')) return Response.json({ name: 'failure-test', host: 'failure-test.pinecone.io', status: { ready: true, state: 'Ready' } });
    return Response.json({ message: 'Pinecone search unavailable' }, { status: 403 });
  });
  const kb = createKnowledgeBase({ OPENAI_API_KEY: 'test', PINECONE_API_KEY: 'test', PINECONE_INDEX_NAME: 'failure-test' });
  await assert.rejects(kb.search('SS-3'), /Pinecone search unavailable/);
});

test('photo cards use only cited retrieved products, retaining attribution and deduplicating repeated searches', () => {
  const tool: UIMessage['parts'][number] = {
    type: 'tool-searchKnowledge', toolCallId: 'search-1', state: 'output-available', input: { query: 'costumes' },
    output: { results: [
      { id: 'AHW-C001', product },
      { id: 'AHW-C002', product: { ...product, sku: 'CP-2', name: 'Cosmic Party', imagePath: '/images/cosmic-party.jpg' } },
    ], referenced: [] },
  };
  const message: UIMessage = { id: 'answer', role: 'assistant', parts: [
    tool, { ...tool, toolCallId: 'search-2' },
    { type: 'text', text: 'Green Visitor [AHW-C001]. Unknown product [AHW-C999].' },
  ] };
  assert.deepEqual(getCitedProducts(message), [{ sourceId: 'AHW-C001', product }]);
  assert.deepEqual(getCitedProducts({ ...message, parts: [tool, { type: 'text', text: 'I cannot recommend a costume from these sources.' }] }), []);
  assert.deepEqual(getCitedProducts({ ...message, parts: [{ type: 'text', text: 'Green Visitor [AHW-C001].' }] }), []);
});
