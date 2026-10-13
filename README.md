# Agent demo

A development-only Vite prototype for inspecting an OC Power Pedals support agent's behavior.

## Run it

```sh
cp apps/llm-chat-demo/.env.example apps/llm-chat-demo/.env.local
# Add a real OPENAI_API_KEY to .env.local
pnpm --filter @agent-platform/llm-chat-demo dev
```

Open http://127.0.0.1:3003.

Ask the agent about OC Power Pedals policies or products. The agent can look up static support documentation for store hours, refunds, shipping, warranties, compatibility, and contact details. The trace shows model requests, tool inputs and outputs, model-provided reasoning summaries, and MCP discovery and tool calls. All trace panels start collapsed. It does not expose private chain-of-thought.

## Notion MCP

Click **Connect Notion** in the agent header to authorize this local demo against Notion's hosted MCP server at `https://mcp.notion.com/mcp`. Notion uses OAuth with PKCE and dynamic client registration; no manual client ID or secret is required. OAuth credentials and tokens stay on the Vite server in the gitignored `.notion-mcp-oauth.json` file and are never returned to the browser or included in agent traces.

After connecting, Notion's tools are discovered for each chat request and made available to the agent. MCP discovery and Notion tool execution use fuchsia trace panels so they are visually distinct from local tools and skills.

Demo skills live in `skills/`. The system prompt initially receives only each skill's name and description. Calling `loadSkill` reads that skill's `SKILL.md`; the model then calls `readSkillFile` for individual nested references only when the instructions require them. The trace shows this progressively loaded context. The duplicate-charge skill demonstrates a reusable reconciliation sequence across three static mock systems. Try “I was charged twice for OCPP-10482,” `OCPP-10731`, or `OCPP-10904` to exercise three different diagnoses. To add another skill, add its directory and register it in `vite.config.ts`.

The `/api/chat` handler is a Vite development-server plugin, so `vite build` only produces the client bundle. This is intentional for this throwaway prototype.
