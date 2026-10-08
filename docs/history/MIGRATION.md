# Migration to Siftpath from SmartSearch 1.x

This prerelease replaces the Python runtime plus npm wrapper with one TypeScript/Node engine. It is intentionally not a compatibility shim. The old research/deep commands, provider-specific tool schemas, Python configuration model, Python package installation, and automatic Python bootstrap are not retained.

The current project and product name is **Siftpath**. For compatibility, the npm identity remains `@onedotmint/smart-search`; commands are `smartsearch search`, `smartsearch fetch`, and `smartsearch gather`. Existing `SMARTSEARCH_*` environment variables, private configuration paths, and integration IDs remain unchanged; no manual credential migration is required for this branding update. The old executable spelling `smart-search` is an alias only; old subcommands do not become compatible automatically. Configure keys once with the new setup command; never copy unknown legacy config objects into the strict new schema.

Old main inspected: `a6e310d8c51d1fb9eb454d27afbbc3f81cc2e61a`, version 1.0.3. The canonical local implementation was **reconstructed**, because the container could not clone GitHub. This archive does not contain the rest of the original source history or every old issue/release asset. No commit was pushed to the remote repository.

To adopt it into an existing checkout, preserve your working changes and create a review branch first. Replace the runtime/package/config/docs/tests as a deliberate breaking change, keeping any unrelated upstream material you still need. Do not merge the local checkpoint bundle assuming a shared ancestor; it has an independent baseline. The bundle exists for recovery of this implementation.

Actual reuse: original MIT license; the sanitized Brave/Exa duplicate-URL fixture; all 49 historical retrieval query strings/categories. Brave and Exa reader source were inspected for auth/error/caller behavior; new adapters use the current documented batch contracts. Donor READMEs informed design but no donor implementation was copied wholesale. See REFERENCES.md and THIRD_PARTY_NOTICES.md.
