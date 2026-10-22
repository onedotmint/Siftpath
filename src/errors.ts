export interface Diagnostic { provider: string; code: string; needs?: string[] }
export class SiftpathError extends Error {
  constructor(public readonly code: string, message: string, public readonly diagnostics: Diagnostic[] = []) {
    super(message); this.name = 'SiftpathError';
  }
}
export function safeError(error: unknown) {
  return error instanceof SiftpathError
    ? { code: error.code, message: error.message, diagnostics: error.diagnostics }
    : { code: 'INTERNAL_ERROR', message: 'Operation failed. Run siftpath doctor; external errors are not exposed.', diagnostics: [] };
}
