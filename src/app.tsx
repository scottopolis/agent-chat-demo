import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, getToolName, isReasoningUIPart, isToolUIPart, type UIMessage } from 'ai';
import {
  BotIcon,
  BookOpenIcon,
  BrainCircuitIcon,
  ChevronRightIcon,
  CircleStopIcon,
  CornerDownLeftIcon,
  FileTextIcon,
  PlugIcon,
  RotateCcwIcon,
  SendIcon,
  TerminalSquareIcon,
  WrenchIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { isAgentContextPart, type AgentContextSnapshot } from './agent-context.js';
import type { AgentToolDefinition } from './agent-tools.js';
import { isMCPTracePart, type MCPTraceSnapshot } from './mcp-trace.js';

const agentDescription = 'Ask about alien costumes. Inspect the search results and see how retrieved evidence becomes the agent’s context.';

export function App() {
  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl">
        <ChatPanel />
      </div>
    </main>
  );
}

function ChatPanel() {
  const [draft, setDraft] = useState('');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
  }), []);
  const { messages, sendMessage, status, stop, error, setMessages } = useChat({ transport });
  const busy = status === 'submitted' || status === 'streaming';

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    void sendMessage({ text });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function openSystemPrompt() {
    setShowSystemPrompt(true);
    setSystemPrompt('Loading system prompt…');
    try {
      const response = await fetch('/api/system-prompt');
      if (!response.ok) throw new Error('Could not load the system prompt');
      const result = await response.json() as { systemPrompt: string };
      setSystemPrompt(result.systemPrompt);
    } catch {
      setSystemPrompt('The system prompt could not be loaded.');
    }
  }

  return (
    <>
      <section className="flex min-h-[680px] min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-7">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">Observable run</p>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Alien Holiday Warehouse</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-[11px] text-slate-500 sm:block">
            7 public sources · Pinecone · hybrid + reranker
          </span>
          <button
            type="button"
            onClick={() => void openSystemPrompt()}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <FileTextIcon className="size-3" /> <span className="hidden sm:inline">System prompt</span>
          </button>
          <button
            type="button"
            onClick={() => setMessages([])}
            disabled={busy || messages.length === 0}
            className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Clear conversation"
            title="Clear conversation"
          >
            <RotateCcwIcon className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-[600px] min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-7">
            {messages.length === 0 ? <EmptyState onPrompt={setDraft} /> : (
              <div className="mx-auto max-w-3xl space-y-6">
                {messages.map((message) => <ChatMessage key={message.id} message={message} />)}
                {status === 'submitted' ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500"><span className="thinking-dot" />Waiting for model…</div>
                ) : null}
                {error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error.message || 'The request failed. Check the server console and your OPENAI_API_KEY.'}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <footer className="border-t border-slate-200 bg-slate-50 p-4 sm:p-5">
            <form onSubmit={submit} className="mx-auto max-w-3xl">
              <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="Support question"
                  placeholder="Ask about alien costumes, venues, or returns…"
                  rows={2}
                  className="max-h-36 min-h-14 w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-6 text-slate-900 outline-none placeholder:text-slate-400"
                />
                <div className="flex items-center justify-between px-2 pb-1">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><CornerDownLeftIcon className="size-3" /> Enter to send</span>
                  {busy ? (
                    <button type="button" onClick={stop} className="grid size-9 place-items-center rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300" aria-label="Stop">
                      <CircleStopIcon className="size-4" />
                    </button>
                  ) : (
                    <button type="submit" disabled={!draft.trim()} className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Send">
                      <SendIcon className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </form>
          </footer>
        </div>

        <AgentToolsPanel />
      </div>
      </section>

      {showSystemPrompt ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowSystemPrompt(false);
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="system-prompt-title" className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center border-b border-slate-200 px-5 py-4">
              <FileTextIcon className="mr-2 size-4 text-blue-600" />
              <h2 id="system-prompt-title" className="text-sm font-semibold text-slate-900">System prompt</h2>
              <button
                type="button"
                onClick={() => setShowSystemPrompt(false)}
                className="ml-auto grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close system prompt"
              >
                <XIcon className="size-4" />
              </button>
            </header>
            <pre className="overflow-auto whitespace-pre-wrap break-words bg-slate-50 p-5 font-mono text-xs leading-5 text-slate-700">{systemPrompt}</pre>
          </section>
        </div>
      ) : null}
    </>
  );
}

function AgentToolsPanel() {
  const [tools, setTools] = useState<AgentToolDefinition[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    void fetch('/api/agent-tools')
      .then((response) => {
        if (!response.ok) throw new Error('Could not load agent tools');
        return response.json() as Promise<AgentToolDefinition[]>;
      })
      .then((definitions) => {
        setTools(definitions);
        setSelectedName(definitions[0]?.name ?? '');
      })
      .catch(() => setLoadFailed(true));
  }, []);

  const selectedTool = tools.find((tool) => tool.name === selectedName);
  const inputSchema = selectedTool?.inputSchema as {
    properties?: Record<string, { type?: string; description?: string; enum?: unknown[] }>;
    required?: string[];
  } | undefined;
  const parameters = Object.entries(inputSchema?.properties ?? {});

  return (
    <aside className="flex max-h-[680px] min-h-0 w-full shrink-0 flex-col border-t border-slate-200 bg-slate-50/70 lg:max-h-none lg:w-96 lg:border-l lg:border-t-0" aria-label="Agent tools">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <TerminalSquareIcon className="size-4 text-blue-600" /> Agent tools
          {tools.length > 0 ? <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700">{tools.length}</span> : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">Retrieval adds relevant source passages to the model’s context.</p>
      </div>

      {loadFailed ? (
        <p className="m-5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">Agent tools could not be loaded.</p>
      ) : tools.length === 0 ? (
        <p className="m-5 text-xs text-slate-400">Loading tool definitions…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row lg:flex-col">
          <nav className="shrink-0 border-b border-slate-200 p-3 sm:w-56 sm:border-b-0 sm:border-r lg:w-auto lg:border-b lg:border-r-0" aria-label="Tool definitions">
            <ul className="space-y-1">
              {tools.map((tool) => {
                const selected = tool.name === selectedName;
                return (
                  <li key={tool.name}>
                    <button
                      type="button"
                      onClick={() => setSelectedName(tool.name)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-mono text-xs transition ${selected ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
                      aria-pressed={selected}
                    >
                      <WrenchIcon className="size-3.5 shrink-0" />
                      <span className="truncate">{tool.name}</span>
                      <ChevronRightIcon className={`ml-auto size-3.5 shrink-0 ${selected ? 'text-blue-200' : 'text-slate-300'}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {selectedTool ? (
            <section className="min-h-0 flex-1 overflow-auto p-5" aria-live="polite">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Name</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{selectedTool.name}</p>

              <p className="mt-5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Description</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{selectedTool.description}</p>

              <div className="mt-5">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Parameters</h3>
                {parameters.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">This tool has no parameters.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {parameters.map(([name, parameter]) => (
                      <div key={name} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-900">{name}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-slate-500">{parameter.type ?? 'value'}</span>
                          {inputSchema?.required?.includes(name) ? <span className="text-[9px] font-semibold uppercase text-blue-600">Required</span> : null}
                        </div>
                        {parameter.description ? <p className="mt-1.5 text-[11px] leading-4 text-slate-500">{parameter.description}</p> : null}
                        {parameter.enum ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {parameter.enum.map((value) => <span key={String(value)} className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">{String(value)}</span>)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <details className="group mt-5 rounded-xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  JSON definition
                  <ChevronRightIcon className="ml-auto size-3.5 transition group-open:rotate-90" />
                </summary>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-slate-200 bg-slate-50 p-3 font-mono text-[10px] leading-5 text-slate-600">{JSON.stringify(selectedTool, null, 2)}</pre>
              </details>
            </section>
          ) : null}
        </div>
      )}
    </aside>
  );
}

function EmptyState({ onPrompt }: { onPrompt: (value: string) => void }) {
  const prompts = ['Can I wear SS-3 at Mosslight, and how long will it run?', 'Can my Venus mist pod refill my Neptune cape?', 'Can you repair my spaceship’s warp engine?'];
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600">
        <BrainCircuitIcon className="size-7" />
      </span>
      <h2 className="mt-5 text-xl font-semibold text-slate-900">Watch the agent work</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{agentDescription}</p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        {prompts.map((prompt) => (
          <button key={prompt} type="button" onClick={() => onPrompt(prompt)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: UIMessage }) {
  const user = message.role === 'user';
  return (
    <article className={user ? 'flex justify-end' : ''}>
      <div className={user ? 'max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-sm leading-6 text-white' : 'min-w-0 space-y-3'}>
        {!user ? <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500"><BotIcon className="size-4 text-blue-600" /> Assistant</div> : null}
        {message.parts.map((part, index) => {
          if (isAgentContextPart(part)) {
            return <AgentContext key={part.data.callId} context={part.data} />;
          }
          if (isMCPTracePart(part)) {
            return <MCPTrace key={part.data.callId} trace={part.data} />;
          }
          if (part.type === 'text') {
            return user
              ? <p key={index} className="whitespace-pre-wrap">{part.text}</p>
              : <div key={index} className="markdown text-[15px] leading-7 text-slate-700"><ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown></div>;
          }
          if (isReasoningUIPart(part)) {
            return <ReasoningStep key={index} text={part.text} />;
          }
          if (isToolUIPart(part)) {
            return <ToolStep key={part.toolCallId} part={part} />;
          }
          if (part.type === 'step-start' && index > 0) {
            return <div key={index} className="flex items-center gap-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400"><span className="h-px flex-1 bg-slate-200" />Next model step<span className="h-px flex-1 bg-slate-200" /></div>;
          }
          return null;
        })}
      </div>
    </article>
  );
}

function AgentContext({ context }: { context: AgentContextSnapshot }) {
  return (
    <details className="group trace-card border-slate-300 bg-slate-50">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-700">
        <BrainCircuitIcon className="size-4 text-blue-600" />
        <span>Agent context · model request {context.requestNumber}</span>
        <span className="ml-auto font-mono text-[10px] font-normal text-slate-400">{context.provider}/{context.modelId}</span>
        <ChevronRightIcon className="size-3.5 text-slate-400 transition group-open:rotate-90" />
      </summary>
      <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
        <ContextValue label="System prompt" value={context.systemPrompt ?? '(none)'} />
        <ContextValue label="Tool definitions" value={context.toolDefinitions} />
        <ContextValue label="Available skill definitions" value={context.skillDefinitions} />
        <ContextValue label="Loaded skill context" value={context.loadedSkillContext} />
        <ContextValue label="Messages sent to model" value={context.messages} />
        {context.response === undefined ? (
          <p className="flex items-center gap-2 text-xs text-slate-400"><span className="thinking-dot" />Model request in progress…</p>
        ) : (
          <ContextValue label="Raw model response" value={context.response} />
        )}
      </div>
    </details>
  );
}

function ContextValue({ label, value }: { label: string; value: unknown }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</h3>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] leading-5 text-slate-600">{formatContextValue(value)}</pre>
    </section>
  );
}

function formatContextValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? String(value);
}

function ReasoningStep({ text }: { text: string }) {
  if (!text) return null;
  return (
    <details className="trace-card border-violet-200 bg-violet-50">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-violet-700">
        <BrainCircuitIcon className="size-4" /> Reasoning summary
      </summary>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{text}</p>
    </details>
  );
}

function MCPTrace({ trace }: { trace: MCPTraceSnapshot }) {
  return (
    <details className="trace-card border-fuchsia-200 bg-fuchsia-50">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-fuchsia-700">
        <PlugIcon className="size-4" />
        <span>MCP · {trace.server} · List tools</span>
        <span className="ml-auto font-normal text-fuchsia-500">{trace.state}</span>
        <ChevronRightIcon className="size-3.5 text-fuchsia-400 transition group-open:rotate-90" />
      </summary>
      {trace.output !== undefined ? <TraceValue label="Output" value={trace.output} /> : null}
    </details>
  );
}

function ToolStep({ part }: { part: Extract<UIMessage['parts'][number], { toolCallId: string }> }) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const skillCall = name === 'loadSkill' || name === 'readSkillFile';
  const mcpCall = name.startsWith('notion-');
  const running = part.state === 'input-streaming' || part.state === 'input-available';
  const failed = part.state === 'output-error' || part.state === 'output-denied';
  const output = part.state === 'output-available' ? part.output : part.state === 'output-error' ? part.errorText : undefined;
  const input = 'input' in part ? part.input : undefined;
  const skillName = skillCall && typeof input === 'object' && input !== null && 'name' in input && typeof input.name === 'string'
    ? humanize(input.name)
    : 'Skill';
  return (
    <details className={`trace-card ${failed ? 'border-red-200 bg-red-50' : skillCall ? 'border-emerald-200 bg-emerald-50' : mcpCall ? 'border-fuchsia-200 bg-fuchsia-50' : 'border-blue-200 bg-blue-50'}`}>
      <summary className={`flex cursor-pointer list-none items-center gap-2 text-xs font-semibold ${skillCall ? 'text-emerald-700' : mcpCall ? 'text-fuchsia-700' : 'text-blue-700'}`}>
        {skillCall ? <BookOpenIcon className="size-4" /> : mcpCall ? <PlugIcon className="size-4" /> : <WrenchIcon className="size-4" />}
        <span>{skillCall ? `Skill · ${skillName}` : mcpCall ? `MCP · Notion · Execute tool · ${humanize(name.replace(/^notion-/, ''))}` : humanize(name)}</span>
        <span className="ml-auto font-normal text-slate-400">{running ? (skillCall ? 'loading' : 'running') : failed ? 'failed' : 'complete'}</span>
        <ChevronRightIcon className="size-3.5 text-slate-400 transition group-open:rotate-90" />
      </summary>
      {'input' in part && part.input !== undefined ? <TraceValue label="Input" value={part.input} /> : null}
      {output !== undefined ? <TraceValue label="Output" value={output} /> : null}
    </details>
  );
}

function TraceValue({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] leading-5 text-slate-600">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
}
