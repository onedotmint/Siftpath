import type { Warning } from './types.js';
export class EngineError extends Error {
  constructor(public readonly code: string, message: string, public readonly warnings: Warning[] = []) {
    super(message); this.name = 'EngineError';
  }
}
export class ProviderError extends EngineError {
  constructor(code: string, message: string, public readonly retryable = false,
    public readonly retryAfterMs?: number) { super(code, message); this.name = 'ProviderError'; }
}
export function errorCode(error: unknown): string {
  if (error instanceof EngineError) return error.code;
  if (error instanceof Error && error.name === 'AbortError') return 'ABORTED';
  return 'PROVIDER_ERROR';
}
export function input(condition: unknown, message: string): asserts condition {
  if (!condition) throw new EngineError('INVALID_INPUT', message);
}
export function cancelled(): EngineError { return new EngineError('ABORTED', 'Operation cancelled.'); }
export function toWarning(error: unknown, provider?: string): Warning {
  // Never surface raw HTTP bodies, credential-bearing URLs, or external error messages.
  return { code: errorCode(error), ...(provider ? { provider } : {}) };
}
