---
name: Artifact service working directory
description: Root-level FastAPI apps and shared Python environments used by an artifact service.
---

Secondary service commands for an artifact run from that artifact's directory, not the workspace root. A service that uses a root-level `app.py` or the root `.pythonlibs` environment must change to the workspace root first.

**Why:** The first SidewalkAI API workflow failed because it looked for `.pythonlibs` under the artifact directory; changing to the workspace root fixed startup.

**How to apply:** For Python services defined inside `artifacts/<slug>/.replit-artifact/artifact.toml` that load root-level Python files or dependencies, prefix the run command with `cd ../.. &&`.
