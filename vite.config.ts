import { createOpenAI } from '@ai-sdk/openai';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {
  ToolLoopAgent,
  convertToModelMessages,
  createUIMessageStream,
  isStepCount,
  pipeUIMessageStreamToResponse,
  type UIMessage,
} from 'ai';
import { readFileSync, readdirSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { z } from 'zod';

import {
  beginNotionAuthorization,
  completeNotionAuthorization,
  createNotionMCPClient,
  disconnectNotion,
  isNotionConnected,
} from './notion-mcp.js';
import type { AgentContextSnapshot } from './src/agent-context.js';
import type { AgentToolDefinition } from './src/agent-tools.js';
import type { MCPTraceSnapshot } from './src/mcp-trace.js';

const bodySchema = z.object({
  messages: z.array(z.custom<UIMessage>()),
});

const systemPrompt = `# Job

You answer OC Power Pedals customer questions about returns, warranties, and shipping.

Be calm, clear, and direct.

# Truth

## Specialized skills

- Skills package specialized procedures and reference knowledge that are too detailed for this system prompt. The available skill catalog is provided separately.
- When a customer request matches an available skill, call \`loadSkill\` before answering. Load only the relevant skill.
- Treat the loaded SKILL.md as the source of truth for that specialized workflow. Read referenced skill files only when they are needed for the current case, and call every data tool the workflow requires rather than recreating the procedure from memory.
- A skill provides instructions and knowledge; it does not prove that an operational action such as a refund, cancellation, or repair has occurred.

## Notion MCP

- When Notion tools are available and the customer asks about content in the connected Notion workspace, use the relevant Notion MCP tools.
- Never claim that a Notion read or write succeeded unless the tool result confirms it.

## Trusted facts

- Use the \`getDocumentation\` tool before making a claim about a policy.
- For a question involving more than one policy, look up each relevant topic.
- Treat the tool result as the source of truth. Do not guess policy details or rely on general retail practices.

## Tool purpose and failures

- Use the \`refunds\` topic for return eligibility, refund method, return shipping, and final-sale questions.
- Use the \`warranty\` topic for defects, coverage periods, exclusions, and warranty approval.
- Use the \`shipping\` topic for destinations, delivery estimates, and shipping costs.
- If the tool fails or does not cover the customer's question, say that the information is not available. Offer OC Power Pedals customer support instead of inventing an answer.

# Workflow

1. Identify whether the request concerns a refund, warranty, shipping, or more than one of them.
2. If a required fact is missing, ask one clear question at a time. For returns and warranties, relevant facts may include the purchase date, whether the product was installed, the reported defect, and possible damage or modification.
3. Call \`getDocumentation\` for each relevant policy before answering.
4. Answer directly, explain which policy applies, and give the safest available next step.
5. Stop after the question is answered or the customer has been handed off to support.

## Examples

### Ambiguous return or warranty

Customer: “I bought my pedals three weeks ago, installed them, and now they sometimes cut out while I ride. Can I send them back?”

Correct handling:

- Look up both the \`refunds\` and \`warranty\` topics because an installed product with a possible defect could involve either policy.
- Do not assume the failure is a covered defect or promise a return.
- Explain that the next step depends on the cause, then ask one question: “Were the pedals immersed in water, damaged in a crash, installed incorrectly, or modified?”
- After the customer answers, apply the documented exclusions and explain whether customer support must review the claim.

# Guardrails

- Do not promise a refund, warranty approval, policy exception, delivery date, or action you cannot perform. Explain the documented policy and direct the customer to support when approval or account access is required.
- If a requested policy is not documented, such as price matching or gift exchanges without a receipt, say so and offer customer support as the next step.

# FAQ

## Company information

- Shop hours: Monday through Friday, 9:00 AM–6:00 PM Pacific Time; Saturday, 10:00 AM–4:00 PM; Sunday closed.
- Products: VoltDrive power pedals, rechargeable battery modules, and accessories.
- Services: Product fitting, installation guidance, and warranty support.
- Current date and time in Costa Mesa: {{CURRENT_DATE_TIME}}`;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss(), notionMcpApi(), chatApi(env)],
    server: { host: '127.0.0.1', port: 3003 },
  };
});

function notionMcpApi(): Plugin {
  return {
    name: 'notion-mcp-api',
    configureServer(server) {
      server.middlewares.use('/api/mcp', async (request, response, next) => {
        const method = request.method;
        const requestUrl = new URL(request.url ?? '/', requestOrigin(request));

        try {
          if (method === 'GET' && requestUrl.pathname === '/status') {
            sendJson(response, { connected: isNotionConnected() });
            return;
          }

          if (method === 'POST' && requestUrl.pathname === '/disconnect') {
            disconnectNotion();
            sendJson(response, { connected: false });
            return;
          }

          if (method === 'GET' && requestUrl.pathname === '/connect') {
            const callbackUrl = `${requestOrigin(request)}/api/mcp/callback`;
            const authorizationUrl = await beginNotionAuthorization(callbackUrl);
            redirect(response, authorizationUrl);
            return;
          }

          if (method === 'GET' && requestUrl.pathname === '/callback') {
            const error = requestUrl.searchParams.get('error');
            if (error) throw new Error(`Notion authorization was declined: ${error}`);
            const code = requestUrl.searchParams.get('code');
            if (!code) throw new Error('Notion OAuth callback did not include a code.');
            await completeNotionAuthorization(
              `${requestOrigin(request)}/api/mcp/callback`,
              code,
              requestUrl.searchParams.get('state') ?? undefined,
            );
            redirect(response, '/?notion=connected');
            return;
          }

          next();
        } catch (error) {
          sendError(response, error);
        }
      });
    },
  };
}

function chatApi(env: Record<string, string>): Plugin {
  return {
    name: 'demo-chat-api',
    configureServer(server) {
      server.middlewares.use('/api/agent-tools', (request, response, next) => {
        if (request.method !== 'GET') {
          next();
          return;
        }
        sendJson(response, serializeAgentToolDefinitions(createAgentTools(() => {})));
      });

      server.middlewares.use('/api/system-prompt', (request, response, next) => {
        if (request.method !== 'GET') {
          next();
          return;
        }
        sendJson(response, { systemPrompt: addSkillCatalog(resolveSystemPrompt()) });
      });

      server.middlewares.use('/api/chat', async (request, response, next) => {
        if (request.method !== 'POST') {
          next();
          return;
        }
        try {
          const apiKey = env.OPENAI_API_KEY?.trim();
          if (!apiKey) throw new Error('OPENAI_API_KEY is not set. Add it to apps/llm-chat-demo/.env.local.');
          const body = bodySchema.parse(JSON.parse(await readBody(request)));
          const modelName = env.OPENAI_MODEL?.trim() || 'gpt-5-mini';
          const openai = createOpenAI({ apiKey });
          const messages = await convertToModelMessages(body.messages);

          const model = openai.responses(modelName);
          const stream = createUIMessageStream({
            originalMessages: body.messages,
            execute: async ({ writer }) => {
              const contexts = new Map<string, AgentContextSnapshot>();
              const loadedSkills = new Map<string, SkillContext>();
              const agentTools = createAgentTools((skill, path) => {
                const content = skill.files[path];
                if (content === undefined) return;
                const loaded = loadedSkills.get(skill.name);
                loadedSkills.set(skill.name, {
                  name: skill.name,
                  description: skill.description,
                  files: { ...loaded?.files, [path]: content },
                });
              });
              const mcpClient = await createNotionMCPClient();
              const mcpCallId = `notion-tools-${Date.now()}`;
              let notionTools = {};

              try {
                if (mcpClient) {
                  writeMCPTrace(writer, {
                    callId: mcpCallId,
                    server: 'Notion',
                    operation: 'tools/list',
                    state: 'running',
                  });
                  notionTools = await mcpClient.tools();
                  writeMCPTrace(writer, {
                    callId: mcpCallId,
                    server: 'Notion',
                    operation: 'tools/list',
                    state: 'complete',
                    output: Object.keys(notionTools),
                  });
                }

                const tools = { ...agentTools, ...notionTools };
                const agent = new ToolLoopAgent({
                  model,
                  instructions: addSkillCatalog(resolveSystemPrompt()),
                  tools,
                  stopWhen: isStepCount(6),
                  maxOutputTokens: 1_500,
                  providerOptions: {
                    openai: {
                      reasoningEffort: 'medium',
                      reasoningSummary: 'auto',
                    },
                  },
                  onStepStart(event) {
                    const contextId = `${event.callId}-${event.stepNumber}`;
                    const context: AgentContextSnapshot = {
                      requestNumber: event.stepNumber + 1,
                      callId: event.callId,
                      provider: event.provider,
                      modelId: event.modelId,
                      systemPrompt: event.instructions,
                      toolDefinitions: describeAgentTools(tools),
                      skillDefinitions: availableSkills.map(({ name, description }) => ({
                        name,
                        description,
                      })),
                      loadedSkillContext: [...loadedSkills.values()],
                      messages: event.messages,
                      settings: compactObject({
                        maxOutputTokens: 1_500,
                        maxSteps: 6,
                        toolChoice: event.toolChoice,
                        activeTools: event.activeTools,
                        toolOrder: event.toolOrder,
                        providerOptions: event.providerOptions,
                      }),
                    };
                    contexts.set(contextId, context);
                    writer.write({
                      type: 'data-agentContext',
                      id: contextId,
                      data: context,
                    });
                  },
                  onStepEnd(event) {
                    const contextId = `${event.callId}-${event.stepNumber}`;
                    const context = contexts.get(contextId);
                    if (!context) return;
                    const completeContext: AgentContextSnapshot = {
                      ...context,
                      response: {
                        finishReason: event.finishReason,
                        content: stripReasoningEncryptedContent(event.content),
                        usage: event.usage,
                      },
                    };
                    contexts.set(contextId, completeContext);
                    writer.write({
                      type: 'data-agentContext',
                      id: contextId,
                      data: completeContext,
                    });
                  },
                });
                const result = await agent.stream({ messages });
                writer.merge(result.toUIMessageStream({
                  sendReasoning: true,
                  onEnd: async () => mcpClient?.close(),
                }));
              } catch (error) {
                if (mcpClient) {
                  writeMCPTrace(writer, {
                    callId: mcpCallId,
                    server: 'Notion',
                    operation: 'tools/list',
                    state: 'failed',
                    output: error instanceof Error ? error.message : 'MCP request failed',
                  });
                  await mcpClient.close();
                }
                throw error;
              }
            },
          });
          await pipeUIMessageStreamToResponse({ response, stream });
        } catch (error) {
          sendError(response, error);
        }
      });
    },
  };
}

type SkillContext = Readonly<{
  name: string;
  description: string;
  files: Readonly<Record<string, string>>;
}>;

const sramSupportSkill = loadSkillDirectory(
  'sram-support',
  'Supports SRAM AXS derailleurs, shifters, and brakes. Use for setup, pairing, adjustment, maintenance, and troubleshooting questions about SRAM AXS components.',
  fileURLToPath(new URL('./skills/sram-support/', import.meta.url)),
);
const duplicateChargeSkill = loadSkillDirectory(
  'reconciling-duplicate-charges',
  'Reconciles duplicate-charge reports across payment, subscription, and shipping records. Use when a customer says they were charged twice or sees two similar card entries.',
  fileURLToPath(new URL('./skills/reconciling-duplicate-charges/', import.meta.url)),
);
const availableSkills = [sramSupportSkill, duplicateChargeSkill];

const demoOrderSchema = z.enum(['OCPP-10482', 'OCPP-10731', 'OCPP-10904'])
  .describe('The OC Power Pedals order number from the customer');

function createAgentTools(onSkillFileLoaded: (skill: SkillContext, path: string) => void) {
  const loadedSkillNames = new Set<string>();
  return {
    getDocumentation: {
      description: 'Look up official OC Power Pedals support documentation. Use this tool before answering questions about company policies, products, store hours, shipping, returns, warranties, or contact details.',
      inputSchema: z.object({
        topic: z.enum(['store_hours', 'refunds', 'shipping', 'warranty', 'compatibility', 'contact'])
          .describe('The documentation topic that best matches the customer question'),
      }),
      execute: async ({ topic }: { topic: keyof typeof supportDocumentation }) => ({
        topic,
        content: supportDocumentation[topic],
      }),
    },
    getPaymentTransactions: {
      description: 'Retrieve static payment-processor records for a demo order. Use for duplicate-charge reconciliation after loading the reconciling-duplicate-charges skill.',
      inputSchema: z.object({ orderNumber: demoOrderSchema }),
      execute: async ({ orderNumber }: { orderNumber: DemoOrderNumber }) => paymentTransactions[orderNumber],
    },
    getSubscriptionStatus: {
      description: 'Retrieve static subscription and renewal records associated with a demo order. Use to distinguish duplicate charges from legitimate recurring billing.',
      inputSchema: z.object({ orderNumber: demoOrderSchema }),
      execute: async ({ orderNumber }: { orderNumber: DemoOrderNumber }) => subscriptionStatuses[orderNumber],
    },
    getShippingHistory: {
      description: 'Retrieve static order-fulfillment and shipment records for a demo order. Use to check whether multiple payments correspond to multiple fulfilled orders.',
      inputSchema: z.object({ orderNumber: demoOrderSchema }),
      execute: async ({ orderNumber }: { orderNumber: DemoOrderNumber }) => shippingHistories[orderNumber],
    },
    manage_orders: {
      description: 'Get, create, update, or delete an order.',
      inputSchema: z.object({
        action: z.enum(['get', 'create', 'update', 'delete'])
          .describe('The order operation to perform'),
      }),
      execute: async () => 'Order management completed successfully in this demo.',
    },
    get_data: {
      description: 'get company data',
      inputSchema: z.object({
        data_type: z.string().describe('The type of company data to retrieve'),
        query: z.string().describe('The query used to find the company data'),
      }),
      execute: async () => 'Company data retrieved successfully in this demo.',
    },
    loadSkill: {
      description: `Load a specialized support skill into your context. Use this before handling a request that matches an available skill. Available skills: ${availableSkills.map(({ name, description }) => `${name}: ${description}`).join('; ')}`,
      inputSchema: z.object({
        name: z.enum(['sram-support', 'reconciling-duplicate-charges']).describe('The skill to load'),
      }),
      execute: async ({ name }: { name: SkillName }) => {
        const skill = availableSkills.find((candidate) => candidate.name === name);
        if (!skill) throw new Error(`Unknown skill: ${name}`);
        const instructions = skill.files['SKILL.md'];
        if (!instructions) throw new Error(`Skill ${name} does not contain SKILL.md`);
        loadedSkillNames.add(name);
        onSkillFileLoaded(skill, 'SKILL.md');
        return instructions;
      },
    },
    readSkillFile: {
      description: 'Read one file referenced by a loaded skill. Use this only when the loaded SKILL.md directs you to that file for the current task.',
      inputSchema: z.object({
        name: z.enum(['sram-support', 'reconciling-duplicate-charges']).describe('The loaded skill containing the file'),
        path: z.string().describe('The exact relative file path referenced by SKILL.md'),
      }),
      execute: async ({ name, path }: { name: SkillName; path: string }) => {
        if (!loadedSkillNames.has(name)) throw new Error(`Load skill ${name} before reading its files`);
        const skill = availableSkills.find((candidate) => candidate.name === name);
        const content = skill?.files[path];
        if (!skill || content === undefined || path === 'SKILL.md') {
          throw new Error(`File ${path} is not available in skill ${name}`);
        }
        onSkillFileLoaded(skill, path);
        return content;
      },
    },
  };
}

function addSkillCatalog(systemPrompt: string): string {
  const catalog = availableSkills
    .map(({ name, description }) => `- \`${name}\`: ${description}`)
    .join('\n');
  return `${systemPrompt}\n\n# Available skills\n\n${catalog}\n\nWhen a customer request matches a skill, call \`loadSkill\` to read its SKILL.md instructions. Read additional skill files only when SKILL.md references them and they are needed for the current request.`;
}

function resolveSystemPrompt(): string {
  const currentDateTime = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'short',
  }).format(new Date());
  return systemPrompt.replace('{{CURRENT_DATE_TIME}}', currentDateTime);
}

function loadSkillDirectory(name: string, description: string, directory: string): SkillContext {
  const files: Record<string, string> = {};
  for (const file of readSkillFiles(directory)) {
    const key = relative(directory, file).split(sep).join('/');
    files[key] = readFileSync(file, 'utf8');
  }
  return { name, description, files };
}

function readSkillFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory() ? readSkillFiles(path) : [path];
    })
    .sort();
}

const supportDocumentation = {
  store_hours: `OC Power Pedals' showroom is at 1420 Harbor Boulevard, Costa Mesa, California. It is open Monday through Friday from 9:00 AM to 6:00 PM Pacific Time and Saturday from 10:00 AM to 4:00 PM. The showroom is closed on Sundays and federal holidays.`,
  refunds: `Products may be returned within 30 calendar days of delivery with the original receipt. Uninstalled products in their original packaging receive a full refund to the original payment method. Installed or ridden pedals may be returned only if defective; cosmetic wear and fit issues are not defects. Customers pay return shipping unless the product is defective or OC Power Pedals shipped the wrong item. Clearance items are final sale.`,
  shipping: `Orders ship from Costa Mesa within two business days. Standard shipping to the contiguous United States takes three to five business days and is free for orders over $75; otherwise it costs $8. Expedited two-day shipping costs $24. OC Power Pedals does not currently ship outside the United States.`,
  warranty: `VoltDrive pedals have a two-year limited warranty covering manufacturing defects. Rechargeable battery modules have a one-year warranty. The warranty requires proof of purchase and does not cover crash damage, incorrect installation, water immersion, normal wear, or unauthorized modifications. Support must approve a warranty return before it is mailed.`,
  compatibility: `VoltDrive power pedals use standard 9/16-inch pedal threads and fit most adult road, gravel, commuter, and mountain bike crank arms. They are not compatible with one-piece cranks that use 1/2-inch threads. Each set supports riders up to 275 pounds and requires the OC Ride app on iOS 16 or Android 12 or newer for setup and firmware updates.`,
  contact: `Customer support is available Monday through Friday from 8:00 AM to 5:00 PM Pacific Time at support@ocpowerpedals.example or (714) 555-0142. Customers asking about an existing order should include their OCPP order number.`,
} as const;

type DemoOrderNumber = 'OCPP-10482' | 'OCPP-10731' | 'OCPP-10904';
type SkillName = 'sram-support' | 'reconciling-duplicate-charges';

const paymentTransactions: Record<DemoOrderNumber, string> = {
  'OCPP-10482': `Payment processor report for OCPP-10482:
- 2026-08-18 14:02:11 UTC — processor reference pay_7HM10482A — $649.00 USD authorization — REVERSED at 14:04:03 UTC after the checkout completion webhook timed out. Captured amount: $0.00. The card issuer may display this authorization as pending for up to 7 business days.
- 2026-08-18 14:04:08 UTC — processor reference pay_7HM10482B — $649.00 USD retry — CAPTURED and settled on 2026-08-19. Captured amount: $649.00.
Processor summary: one settled charge totaling $649.00 USD.`,
  'OCPP-10731': `Payment processor report for OCPP-10731:
- 2026-08-21 09:17:42 UTC — processor reference pay_2KQ10731A — $189.00 USD — CAPTURED and settled on 2026-08-22.
- 2026-08-21 09:18:19 UTC — processor reference pay_2KQ10731B — $189.00 USD — CAPTURED and settled on 2026-08-22. The same order number was submitted without the original idempotency key.
Processor summary: two settled charges totaling $378.00 USD. No refund is recorded.`,
  'OCPP-10904': `Payment processor report for OCPP-10904:
- 2026-08-24 18:31:05 UTC — processor reference pay_9WF10904A — merchant presentment $499.00 USD — CAPTURED once and settled once.
- Card-network reference ARN-74010904 associates that capture with cardholder billing amount C$684.27 CAD at the issuer's conversion rate. The USD and CAD representations share the same network reference and are not separate captures.
Processor summary: one settled charge totaling $499.00 USD.`,
};

const subscriptionStatuses: Record<DemoOrderNumber, string> = {
  'OCPP-10482': `Subscription report for OCPP-10482: customer cus_10482 has no active or canceled subscription. No renewal, membership, or recurring add-on was billed between 2026-08-11 and 2026-08-25.`,
  'OCPP-10731': `Subscription report for OCPP-10731: customer cus_10731 has an active free product-update membership with no payment method and no billable renewals. No subscription charge was created between 2026-08-14 and 2026-08-28.`,
  'OCPP-10904': `Subscription report for OCPP-10904: customer cus_10904 has no active subscription. No renewal, membership, or recurring add-on was billed between 2026-08-17 and 2026-08-31.`,
};

const shippingHistories: Record<DemoOrderNumber, string> = {
  'OCPP-10482': `Fulfillment report for OCPP-10482: one order and one shipment. Fulfillment ful_10482 was created 2026-08-18 14:06:22 UTC for one VoltDrive Pro pedal set and shipped 2026-08-19 16:40:10 UTC under tracking OCPP-DEMO-10482. No duplicate order or second fulfillment exists.`,
  'OCPP-10731': `Fulfillment report for OCPP-10731: one order and one shipment. Fulfillment ful_10731 was created 2026-08-21 09:20:04 UTC for one TrailSync battery module and shipped 2026-08-22 15:11:36 UTC under tracking OCPP-DEMO-10731. Both captured payments reference this same order; no second fulfillment exists.`,
  'OCPP-10904': `Fulfillment report for OCPP-10904: one order and one shipment. Fulfillment ful_10904 was created 2026-08-24 18:33:44 UTC for one VoltDrive pedal set and shipped 2026-08-25 17:02:51 UTC under tracking OCPP-DEMO-10904. No duplicate order or second fulfillment exists.`,
};

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function stripReasoningEncryptedContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripReasoningEncryptedContent);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'reasoningEncryptedContent')
      .map(([key, entry]) => [key, stripReasoningEncryptedContent(entry)]),
  );
}

function serializeAgentToolDefinitions(tools: Record<string, unknown>): AgentToolDefinition[] {
  return Object.entries(tools).map(([name, tool]) => {
    const definition = typeof tool === 'object' && tool !== null ? tool : {};
    return {
      name,
      description: 'description' in definition && typeof definition.description === 'string'
        ? definition.description
        : '',
      inputSchema: 'inputSchema' in definition && definition.inputSchema instanceof z.ZodType
        ? z.toJSONSchema(definition.inputSchema)
        : undefined,
    };
  });
}

function describeAgentTools(tools: Record<string, unknown>) {
  return Object.entries(tools).map(([name, tool]) => ({
    name,
    description: typeof tool === 'object' && tool !== null && 'description' in tool
      ? tool.description
      : undefined,
    source: name.startsWith('notion-') ? 'Notion MCP' : 'Local',
  }));
}

function writeMCPTrace(
  writer: { write(part: { type: 'data-mcpTrace'; id: string; data: MCPTraceSnapshot }): void },
  trace: MCPTraceSnapshot,
) {
  writer.write({ type: 'data-mcpTrace', id: trace.callId, data: trace });
}

function requestOrigin(request: IncomingMessage): string {
  return `http://${request.headers.host ?? '127.0.0.1:3003'}`;
}

function redirect(response: ServerResponse, location: string) {
  response.statusCode = 302;
  response.setHeader('location', location);
  response.end();
}

function sendJson(response: ServerResponse, value: unknown) {
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 1_000_000) throw new Error('Request body is too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendError(response: ServerResponse, error: unknown) {
  const message = error instanceof Error ? error.message : 'Chat request failed';
  if (response.headersSent) {
    response.end();
    return;
  }
  response.statusCode = 500;
  response.setHeader('content-type', 'text/plain; charset=utf-8');
  response.end(message);
}
