# Siftpath — historical delivery status

Siftpath is the current project name. The branch, upstream SHA, and verification claims below are preserved from the original handoff; they are not a fresh verification of this repository. Existing package and command identifiers remain unchanged for compatibility.

Version: **2.0.0-next.1**. Canonical local branch: `feat/web-evidence-engine`.
Upstream main inspected: `a6e310d8c51d1fb9eb454d27afbbc3f81cc2e61a`.

## Implemented

A replacement Node/TypeScript package with three SDK operations, seven hosted
provider adapters, bounded evidence/provenance/budgets, optional hosted rerank and
decision, partial success, cancellation/deadlines/retry, TTL cache, trace, private
setup/doctor/usage, native Pi adapter, stdio/authenticated HTTP MCP, host plugin
assets, one shared skill, offline contracts, live gates, and replay/invocation evals.

## Architecture and boundaries

One shared core, provider adapters, three shared tool schemas, thin CLI/Pi/MCP
boundaries. No Python runtime, local model, browser download, planner, answer model,
workflow framework, or vector database. Remote runtime/SSH/Daytona concepts from
the generic delivery addendum are not Siftpath components.

## Provider and integration state

All Exa/Parallel/Tavily/Brave/Firecrawl/Jina/Cloudflare adapters are implemented and
mock-contract tested. Real accounts/API calls remain unverified. Pi is a native
adapter verified with host-contract tests. Codex, Cursor, and Claude plugin assets
are implemented and structurally checked. DeepSeek is MCP/skill compatibility only.
Actual host installations and public ChatGPT deployment/registration are unverified.

## Verification and delivery provenance

The external `DELIVERY.md` distributed beside this source archive records the exact
final commit, clean working-tree state, commands executed, test counts, archive
extraction checks, built-package installation smoke tests, and produced artifacts.
It is external so its final-commit reference is not a circular self-reference.

The original clone and clean registry installation were blocked by outbound DNS.
Build/tests used the available exact compiler/types through untracked local
symlinks; these are excluded from deliverables. The lockfile pins portable registry
URLs but two development-only packages lack integrity hashes. A fresh network-enabled
`npm ci --ignore-scripts` remains a release gate. See PREFLIGHT.md and DEVELOPMENT.md.

## Known limits

Token counts and heuristic coverage are estimates, not semantic truth guarantees.
Synthetic replay is not a vendor ranking benchmark. Domain grouping uses a small
suffix table, not the complete PSL. The transparent injection scanner is not a
complete defense. URLs are extracted by hosted services, whose redirect/network
policies remain their responsibility. HTTP is single-tenant with static bearer
auth; TLS/OAuth/public registration are external deployment work. CLI cache and
result IDs do not persist across processes; usage is the last CLI operation only.

No upstream branch was created or pushed. This is an integrated local replacement
tree plus recoverable checkpoint history, not an upstream-history clone. Read
MIGRATION.md before adopting it into an existing checkout.
