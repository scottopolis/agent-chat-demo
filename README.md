# Alien Holiday Warehouse — intro to context and RAG

A development-only chat demo adapted from the attached agent trace viewer. The original app is preserved in the initial Git commit. Ask a question, expand **Search Knowledge**, then expand **Agent context · model request 2** to see the retrieved passages enter the next model request. Model-provided reasoning summaries are not private chain-of-thought.

## Run

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Set OPENAI_API_KEY and PINECONE_API_KEY in .env.local, or through the environment.
pnpm index-corpus
pnpm dev
```

`pnpm index-corpus` creates the `alien-holiday-rag` Pinecone document-schema index (managed AWS us-east-1, on-demand reads) if absent, embeds the seven public sources, upserts them, and waits until both search paths can retrieve them. Set `PINECONE_INDEX_NAME` to use another compatible index. Rerun indexing after changing `corpus.json`; each snapshot has a content-hashed namespace, so removed documents cannot appear in the new snapshot. Old namespaces remain until explicitly cleaned up in Pinecone. Chat never creates an index or silently falls back to local search.

`pnpm test` checks retrieval orchestration with fixture HTTP responses; `pnpm typecheck` checks TypeScript; `pnpm build` builds the frontend only. The chat API runs in the Vite development server, not `vite preview`. This is not a production deployment: keep access restricted to a trusted demo audience. OpenAI and Pinecone calls can incur usage charges. Keys stay server-side and must never use a `VITE_` prefix. Native BM25 requires Pinecone API 2026-07 (Node SDK v9).

## What it demonstrates

1. Each short source in `corpus.json` is one chunk, with its ID, title, and provenance retained.
2. Indexing uses OpenAI `text-embedding-3-small` (1536 dimensions). Pinecone persists the dense vectors, original source text, and a BM25 full-text index of IDs, titles, and content.
3. Each query is embedded once. Pinecone runs **dense cosine search** for meaning and **BM25 keyword search** for lexical matches in parallel, taking up to ten candidates from each. BM25 is token-based search, not a literal substring matcher.
4. **Reciprocal rank fusion (RRF)** deduplicates their union and combines ranks using `1 / (60 + rank)` per lane, keeping up to twelve candidates. It does not add incomparable raw cosine and BM25 scores.
5. Pinecone-hosted **`bge-reranker-v2-m3`** scores each query/passage pair with a cross-encoder and returns the top four. Original text, not vectors, enters the agent's context. No truncation is allowed: the tiny seed chunks fit this model's 1024-token pair limit; larger chunks need an explicit sizing strategy.
6. The venue guide's `relatedIds` preserve its dependency on the operating guide and safety notice; these are authored metadata, not model guesses. Missing linked evidence is fetched from Pinecone and shown separately from ranked results.
7. The `gpt-5.4-mini` agent reads the tool results, may search again, and answers with source IDs. Change `OPENAI_MODEL` to use another compatible OpenAI reasoning model.
8. The trace exposes semantic and keyword ranks/scores, the fused ranking, reranker scores, original passages, model context, and response. Scores are not answer confidence. There is no relevance cutoff or automatic Notion synchronization. RAG supplies evidence; it does not guarantee correct answers or train the model.

With just seven documents, dense top-ten search already includes the entire corpus. This demonstrates a real hybrid pipeline, not evidence that hybrid search improves recall on this tiny dataset. Measure that benefit with a larger corpus and labeled queries. Reranking adds a hosted model call and latency; it cannot recover evidence absent from the candidate set.

The source is the [Alien Holiday Warehouse Notion page](https://www.notion.so/3f0bebc723c381cb9d11d8c517ae1013), snapshotted October 13, 2026. That page has nine seed passages, not its planned 500 documents. This demo includes only seven current public passages; the retired 31-day return policy and private Nebula Noodle addendum are deliberately not indexed. This is scope-safe corpus selection, not an implementation of tenant authentication. Original skill files remain as archive examples and are not exposed to the agent.

## Useful demo questions and independent expected facts

- “My three floating waist hoops stop after three quarters of an hour. What powers them at 0.7 g?” → Suspensium-9 gel, 47 minutes; not Cosmic Hula’s foam or 83 minutes.
- “Can I wear SS-3 at Mosslight, and how long will it run?” → 1.35 g, DG-2 collar required, 29 minutes, check recall lot DG2-Q17.
- “Is DG2-Q71 recalled?” → No; DG2-Q17 is the affected lot.
- “Can my Venus mist pod refill my Neptune cape?” → No; incompatible refill systems.
- “Can an unopened costume be returned 23 days after delivery?” → Outside the public 19-day window.
- “How does SS-3 work at 1.20 versus 1.21 g?” → 47 minutes without collar versus 29 minutes with DG-2.
- “Can you repair my spaceship’s warp engine?” → No source-backed repair information; abstain rather than invent a service.

For a real large corpus, add source synchronization, permission filters before retrieval, tested chunking, and separate retrieval/answer evaluations. Keep the intro focused on the visible retrieve → context → answer loop.
