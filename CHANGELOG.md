# Changelog

## 2.1.0

Backward-compatible update from 2.0.1; publication requires maintainer confirmation.

- Keep the two-tool API: `web_search` and `web_read`.
- Recommend Tavily for general/research search and Exa for semantic discovery; retain Jina as the default Reader and support an explicit configured `reader`, including Firecrawl, without fallback.
- Use official authenticated Firecrawl HTTP MCP for new setups; preserve existing stdio/custom bindings, credentials, routes and legacy configurations.
- Preserve native evidence and exact mirror deduplication; retain validated Firecrawl usage/cache metadata within the existing output budget.
- Improve cancellation of shared cold connections and validate calendar timestamps.
- Clarify focus, completeness and evidence limits without adding orchestration or a fact-checking model. Keep historical diagnosis fixtures in Git, outside npm.
- Verify isolated production-only packages and real Pi 1.4.0 tool registration without model inference.

Known limits: the default 16,000-character serialized budget can clip long documents, upstream extraction may be incomplete, and successful tool calls do not guarantee accurate model answers. See [release notes](docs/RELEASE-2.1.0.md) for compatibility and details.
