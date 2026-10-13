# Alien Holiday Warehouse — intro to context and RAG

A development-only chat demo adapted from the attached agent trace viewer. The original app is preserved in the initial Git commit. Ask a question, expand **Search Knowledge**, then expand **Agent context · model request 2** to see the retrieved passages enter the next model request. Model-provided reasoning summaries are not private chain-of-thought.

## Run

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Set OPENAI_API_KEY in .env.local, or supply it through the environment.
pnpm dev
```

`pnpm typecheck` checks TypeScript; `pnpm build` builds the frontend only. The chat API runs in the Vite development server, not `vite preview`. This is not a production deployment: keep access restricted to a trusted demo audience. OpenAI calls incur usage charges. Keys stay server-side and must never use a `VITE_` prefix.

## What it demonstrates

1. Each short source in `corpus.json` is one chunk, with its ID, title, and provenance retained.
2. On the first search, OpenAI `text-embedding-3-small` embeds all seven passages; vectors are cached in server memory until restart.
3. Each search embeds the query and ranks passages by cosine similarity, returning the top four plus any explicitly linked source passages. The venue guide's `relatedIds` preserve its dependency on the operating guide and safety notice; these are authored metadata, not model guesses. There is no relevance cutoff, hybrid search, reranker, persistent vector database, or automatic Notion synchronization.
4. The `gpt-5.4-mini` agent reads the tool results, may search again, and answers with source IDs. Change `OPENAI_MODEL` to use another compatible OpenAI reasoning model.
5. The trace shows the question, search arguments, source text, model context, and response. RAG supplies evidence; it does not guarantee correct answers or train the model.

The source is the [Alien Holiday Warehouse Notion page](https://www.notion.so/3f0bebc723c381cb9d11d8c517ae1013), snapshotted October 13, 2026. That page has nine seed passages, not its planned 500 documents. This demo includes only seven current public passages; the retired 31-day return policy and private Nebula Noodle addendum are deliberately not indexed. This is scope-safe corpus selection, not an implementation of tenant authentication. Original skill files remain as archive examples and are not exposed to the agent.

## Useful demo questions and independent expected facts

- “My three floating waist hoops stop after three quarters of an hour. What powers them at 0.7 g?” → Suspensium-9 gel, 47 minutes; not Cosmic Hula’s foam or 83 minutes.
- “Can I wear SS-3 at Mosslight, and how long will it run?” → 1.35 g, DG-2 collar required, 29 minutes, check recall lot DG2-Q17.
- “Is DG2-Q71 recalled?” → No; DG2-Q17 is the affected lot.
- “Can my Venus mist pod refill my Neptune cape?” → No; incompatible refill systems.
- “Can an unopened costume be returned 23 days after delivery?” → Outside the public 19-day window.
- “How does SS-3 work at 1.20 versus 1.21 g?” → 47 minutes without collar versus 29 minutes with DG-2.
- “Can you repair my spaceship’s warp engine?” → No source-backed repair information; abstain rather than invent a service.

For a real large corpus, add persistent indexing, source synchronization, permission filters before retrieval, tested chunking, keyword/hybrid retrieval for exact codes, and separate retrieval/answer evaluations. Keep the intro focused on the visible retrieve → context → answer loop.
