import {
  auth,
  createMCPClient,
  type MCPClient,
  type OAuthAuthorizationServerInformation,
  type OAuthClientInformation,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthTokens,
} from '@ai-sdk/mcp';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const serverUrl = 'https://mcp.notion.com/mcp';
const credentialsFile = new URL('./.notion-mcp-oauth.json', import.meta.url);

type StoredCredentials = {
  tokens?: OAuthTokens;
  clientInformation?: OAuthClientInformation;
  authorizationServerInformation?: OAuthAuthorizationServerInformation;
  codeVerifier?: string;
  state?: string;
  redirectUrl?: string;
};

export function isNotionConnected(): boolean {
  return Boolean(readCredentials().tokens?.access_token);
}

export function disconnectNotion(): void {
  writeCredentials({});
}

export async function beginNotionAuthorization(redirectUrl: string): Promise<string> {
  const credentials = readCredentials();
  if (credentials.redirectUrl && credentials.redirectUrl !== redirectUrl) {
    writeCredentials({});
  }
  updateCredentials({ redirectUrl });
  const provider = new NotionOAuthProvider(redirectUrl);
  let client: MCPClient | undefined;

  try {
    client = await createMCPClient({
      transport: { type: 'http', url: serverUrl, authProvider: provider },
    });
  } catch {
    const authorizationUrl = provider.authorizationUrl;
    if (authorizationUrl) return authorizationUrl;
    throw new Error('Notion did not provide an OAuth authorization URL.');
  } finally {
    await client?.close();
  }

  throw new Error('Notion is already connected.');
}

export async function completeNotionAuthorization(
  redirectUrl: string,
  authorizationCode: string,
  callbackState: string | undefined,
): Promise<void> {
  const provider = new NotionOAuthProvider(redirectUrl);
  await auth(provider, {
    serverUrl,
    authorizationCode,
    callbackState,
  });
  const credentials = readCredentials();
  delete credentials.codeVerifier;
  delete credentials.state;
  writeCredentials(credentials);
}

export async function createNotionMCPClient(): Promise<MCPClient | undefined> {
  if (!isNotionConnected()) return undefined;
  const redirectUrl = readCredentials().redirectUrl ?? 'http://127.0.0.1:3003/api/mcp/callback';
  return createMCPClient({
    transport: {
      type: 'http',
      url: serverUrl,
      authProvider: new NotionOAuthProvider(redirectUrl),
    },
    name: 'OC Power Pedals agent demo',
  });
}

class NotionOAuthProvider implements OAuthClientProvider {
  authorizationUrl?: string;

  constructor(readonly redirectUrl: string) {}

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'OC Power Pedals agent demo',
    };
  }

  tokens() {
    return readCredentials().tokens;
  }

  saveTokens(tokens: OAuthTokens) {
    updateCredentials({ tokens });
  }

  clientInformation() {
    return readCredentials().clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformation) {
    updateCredentials({ clientInformation });
  }

  authorizationServerInformation() {
    return readCredentials().authorizationServerInformation;
  }

  saveAuthorizationServerInformation(authorizationServerInformation: OAuthAuthorizationServerInformation) {
    updateCredentials({ authorizationServerInformation });
  }

  saveCodeVerifier(codeVerifier: string) {
    updateCredentials({ codeVerifier });
  }

  codeVerifier() {
    const codeVerifier = readCredentials().codeVerifier;
    if (!codeVerifier) throw new Error('Missing Notion OAuth code verifier. Start the connection again.');
    return codeVerifier;
  }

  saveState(state: string) {
    updateCredentials({ state });
  }

  state() {
    return randomBytes(32).toString('hex');
  }

  storedState() {
    return readCredentials().state;
  }

  redirectToAuthorization(authorizationUrl: URL) {
    this.authorizationUrl = authorizationUrl.toString();
  }

  validateAuthorizationServerURL(_serverUrl: string | URL, authorizationServerUrl: string | URL) {
    if (new URL(authorizationServerUrl).origin !== 'https://mcp.notion.com') {
      throw new Error('Notion MCP returned an unexpected OAuth authorization server.');
    }
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier') {
    const credentials = readCredentials();
    if (scope === 'all' || scope === 'client') delete credentials.clientInformation;
    if (scope === 'all' || scope === 'tokens') delete credentials.tokens;
    if (scope === 'all' || scope === 'verifier') delete credentials.codeVerifier;
    writeCredentials(credentials);
  }
}

function readCredentials(): StoredCredentials {
  if (!existsSync(credentialsFile)) return {};
  return JSON.parse(readFileSync(credentialsFile, 'utf8')) as StoredCredentials;
}

function updateCredentials(update: Partial<StoredCredentials>) {
  writeCredentials({ ...readCredentials(), ...update });
}

function writeCredentials(credentials: StoredCredentials) {
  writeFileSync(credentialsFile, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
}
