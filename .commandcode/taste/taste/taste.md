# Taste
- Prefers to start with a minimal, standalone proof-of-concept (e.g. a single simple HTML page) to validate feasibility before doing a full integration into a larger codebase. Confidence: 0.65
- Expects third-party dependencies that are pinned/vendored to be revisited when upstream releases land, and wants an explicit assessment of what each upgrade changes for the project's work — not just a version bump. Confidence: 0.5
- Wants new npm packages to follow the established `@live-codes/*-wasm` family conventions — naming and structure mirroring existing siblings (e.g. `@live-codes/clang-wasm`, `@live-codes/swift-wasm`) rather than inventing a new shape. Confidence: 0.75
- Prefers build artifacts to be committed to the repository, including large vendored SDK/asset trees, rather than gitignored. Confidence: 0.6
- Prefers client-side / serverless solutions — features should run entirely in the browser with no backend or server-side compilation ("no servers"). Confidence: 0.6
- Treats access to generated/compiled output and source maps as first-class requirements: wants the emitted code (e.g. the compiled JS) exposed and wants source-mapped stack traces, not opaque blob URLs. Confidence: 0.5
