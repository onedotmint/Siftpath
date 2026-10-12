/** The core has no knowledge of vendor names or host integrations. */
export type Mode = 'fast' | 'quality';
export type EvidenceRanking = 'legacy' | 'bm25';
export type Capability = 'search' | 'fetch' | 'semanticSearch' | 'freshness' | 'domainFilter' |
  'dateFilter' | 'highlights' | 'objectiveExtract' | 'news' | 'pdf' | 'hardPages';
export type Capabilities = Partial<Record<Capability, boolean>>;
export interface Warning { code: string; provider?: string; message?: string; sourceId?: string }
export interface Origin { provider: string; url?: string; rank?: number; sourceId?: string; fragments?: string[] }
export interface Source {
  id: string; url: string; title: string; provider: string;
  retrievedAt: string; publishedAt?: string;
}
export interface Candidate extends Source {
  excerpts: string[]; origins: Origin[]; score?: number; warnings?: Warning[]; truncated?: boolean;
}
export interface Page {
  url: string; title: string; text: string; excerpts?: string[];
  retrievedAt: string; publishedAt?: string; provider: string;
  sourceId?: string; section?: string; fragment?: string; warnings?: Warning[];
}
export interface Evidence {
  id: string; sourceId: string; text: string; url: string; title: string;
  retrievedAt: string; publishedAt?: string; provider: string;
  relevance?: number; section?: string; fragment?: string; providerSourceId?: string;
  sourceRank?: number; warnings?: Warning[]; truncated?: boolean;
}
export interface Usage {
  outputTokens: number; tokenEstimation: 'heuristic' | 'custom';
  durationMs: number; providerCalls: number; httpRequests: number;
  cacheHits: number; reportedCostUSD?: number;
}
export interface SearchPack { query: string; results: Candidate[]; warnings: Warning[]; usage: Usage }
export interface EvidencePack {
  query: string; evidence: Evidence[]; sources: Source[];
  coverage: 'low' | 'partial' | 'good'; coverageBasis: 'heuristic' | 'decision';
  searchAgainRecommended: boolean; warnings: Warning[]; usage: Usage;
}
export interface SearchInput {
  query: string; maxResults?: number; recency?: string; domains?: string[]; mode?: Mode;
}
export interface FetchInput {
  url?: string; urls?: string[]; resultIds?: string[]; query?: string; maxTokens?: number;
}
export interface GatherInput { query: string; mode?: Mode; maxTokens?: number }
/** Caller-supplied HTML, never a URL fetched by Siftpath. */
export interface HtmlInput { url: string; html: string; query?: string; maxTokens?: number; extractor?: 'basic' | 'readability' }
export interface SearchRequest {
  query: string; maxResults: number; mode: Mode; domains?: string[]; since?: string;
}
export interface FetchRequest { urls: string[]; query?: string }
export interface TraceEvent {
  stage: string; provider?: string; status?: 'ok' | 'error' | 'retry' | 'cached';
  durationMs?: number; count?: number; code?: string; attempt?: number; costUSD?: number;
}
export interface CallOptions {
  signal?: AbortSignal; timeoutMs?: number;
  onProgress?: (event: TraceEvent) => void;
  onTrace?: (event: TraceEvent) => void;
}
export interface ProviderContext {
  signal: AbortSignal;
  recordHttp: (event: TraceEvent) => void;
}
export interface ProviderBase {
  id: string; capabilities: Capabilities; priority?: number;
  /** Optional externally measured quality score; never a vendor marketing score. */
  qualityScore?: number; latencyMs?: number;
}
export interface ProviderResult<T> { items: T[]; warnings?: Warning[]; costUSD?: number }
export interface SearchProvider extends ProviderBase {
  search(request: SearchRequest, context: ProviderContext): Promise<ProviderResult<Candidate>>;
}
export interface FetchProvider extends ProviderBase {
  fetch(request: FetchRequest, context: ProviderContext): Promise<ProviderResult<Page>>;
}
export interface RerankProvider extends ProviderBase {
  rerank(query: string, evidence: Evidence[], context: ProviderContext): Promise<{
    scores: { index: number; score: number }[]; costUSD?: number;
  }>;
}
export interface Decision { sufficient: boolean; confidence: number; searchAgain: boolean }
export interface DecisionProvider extends ProviderBase {
  decide(query: string, evidence: Evidence[], context: ProviderContext): Promise<Decision>;
}
export interface Providers {
  search: SearchProvider[]; fetch: FetchProvider[];
  rerank?: RerankProvider; decision?: DecisionProvider;
}
export interface EngineOptions {
  providers: Providers; timeoutMs?: number; providerTimeoutMs?: number;
  cacheMaxEntries?: number; searchTtlMs?: number; fetchTtlMs?: number;
  countTokens?: (text: string) => number;
  /** Opt-in lexical experiment; existing ranking stays the default. */
  evidenceRanking?: EvidenceRanking;
}
