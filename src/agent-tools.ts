export type AgentToolDefinition = Readonly<{
  name: string;
  description: string;
  inputSchema: unknown;
}>;
