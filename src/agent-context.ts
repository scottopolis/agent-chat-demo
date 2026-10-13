import type { UIMessage } from 'ai';

export type AgentContextSnapshot = Readonly<{
  requestNumber: number;
  callId: string;
  provider: string;
  modelId: string;
  systemPrompt: unknown;
  toolDefinitions: unknown;
  skillDefinitions: unknown;
  loadedSkillContext: unknown;
  messages: unknown;
  settings: Readonly<Record<string, unknown>>;
  response?: Readonly<{
    finishReason: string;
    content: unknown;
    usage: unknown;
  }>;
}>;

export function isAgentContextPart(
  part: UIMessage['parts'][number],
): part is UIMessage['parts'][number] & { type: 'data-agentContext'; data: AgentContextSnapshot } {
  if (part.type !== 'data-agentContext' || typeof part.data !== 'object' || part.data === null) {
    return false;
  }
  const data = part.data as Partial<AgentContextSnapshot>;
  return typeof data.requestNumber === 'number'
    && typeof data.callId === 'string'
    && typeof data.provider === 'string'
    && typeof data.modelId === 'string';
}
