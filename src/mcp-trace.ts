import type { UIMessage } from 'ai';

export type MCPTraceSnapshot = Readonly<{
  callId: string;
  server: string;
  operation: 'tools/list';
  state: 'running' | 'complete' | 'failed';
  output?: unknown;
}>;

export function isMCPTracePart(
  part: UIMessage['parts'][number],
): part is UIMessage['parts'][number] & { type: 'data-mcpTrace'; data: MCPTraceSnapshot } {
  if (part.type !== 'data-mcpTrace' || typeof part.data !== 'object' || part.data === null) return false;
  const data = part.data as Partial<MCPTraceSnapshot>;
  return typeof data.callId === 'string'
    && typeof data.server === 'string'
    && data.operation === 'tools/list';
}
