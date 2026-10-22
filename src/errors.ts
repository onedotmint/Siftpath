export interface Diagnostic { provider: string; code: string; needs?: string[] }
export class SiftpathError extends Error {
  constructor(public readonly code: string, message: string, public readonly diagnostics: Diagnostic[] = []) {
    super(message); this.name = 'SiftpathError';
  }
}
/** One actionable sentence per stable code, so a first-time user never sees only an internal code. */
const hints: Record<string, string> = {
  MISSING_CREDENTIALS: 'Run /siftpath (Pi) or `siftpath setup` and add this Key, or export it as an environment variable.',
  DISABLED: 'Enable it with /siftpath or `siftpath setup` if it should be used.',
  AUTH_FAILED: 'The provider rejected the credential: replace the Key with /siftpath or `siftpath setup`.',
  RATE_LIMITED: 'Quota or rate limit reached: wait, or configure another provider as a fallback.',
  PROVIDER_TIMEOUT: 'The official server did not answer in time. Its first run may still be downloading via npx: retry once, then check connectivity or raise timeoutMs.',
  CONNECTION_FAILED: 'Check network access, the configured MCP command/URL and any proxy settings.',
  TOOL_NOT_FOUND: 'The official tool name changed upstream: run `siftpath test <provider>` and update the binding or Siftpath.',
  INVALID_UPSTREAM_ARGUMENTS: 'The official server rejected the mapped arguments; its schema changed. Update the binding or Siftpath.',
  NO_PROVIDER_SUCCEEDED: 'Nothing could serve this request: run /siftpath or `siftpath status` to see what is READY.',
  INVALID_CONFIG: 'Fix the configuration file JSON/schema manually before re-running /siftpath or `siftpath setup`; keep private backups secure.',
  CONFIG_READ_FAILED: 'Check the configuration file JSON syntax and permissions; the setup menu cannot repair unreadable JSON.',
  INVALID_INPUT: 'Check the command or tool arguments (run `siftpath --help` for CLI usage).',
  CLOSED: 'The Siftpath process was closed; start a new connection.',
};
export function hintFor(code: string): string | undefined { return hints[code]; }
export function safeError(error: unknown) {
  if (!(error instanceof SiftpathError)) return { code: 'INTERNAL_ERROR', message: 'Operation failed. Run siftpath doctor; external errors are not exposed.', diagnostics: [] };
  return { code: error.code, message: error.message, ...(hints[error.code] ? { hint: hints[error.code] } : {}), diagnostics: error.diagnostics };
}
