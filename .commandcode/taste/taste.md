# Taste

## Workflow
- Prefers to start with a minimal, standalone proof-of-concept (e.g. a single simple HTML page) to validate feasibility before doing a full integration into a larger codebase. Confidence: 0.65

## Architecture
- Prefers client-side / serverless solutions — features should run entirely in the browser with no backend or server-side compilation ("no servers"). Confidence: 0.6
- Treats access to generated/compiled output and source maps as first-class requirements: wants the emitted code (e.g. the compiled JS) exposed and wants source-mapped stack traces, not opaque blob URLs. Confidence: 0.5
