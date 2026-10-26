# SidewalkAI

SidewalkAI is a research dashboard for safely inspecting sidewalk images and reporting which computer-vision outputs are unavailable.

## Run & Operate

- Frontend workflow: `pnpm --filter @workspace/sidewalk-ai run dev`
- API workflow runs FastAPI from the repository root on port 8061.
- Frontend typecheck: `pnpm --filter @workspace/sidewalk-ai run typecheck`
- Frontend production build: `PATH="$PWD/.pythonlibs/bin:$PATH" .pythonlibs/bin/python build.py`
- Python tests: `PYTHONPATH=. .pythonlibs/bin/python -m pytest -q`
- Evaluation: `.pythonlibs/bin/python evaluation.py <annotations.jsonl>`
- No secrets or database are required.

## Stack

- React, TypeScript, Vite, Tailwind CSS
- FastAPI, Pydantic, Pillow, NumPy
- Vercel FastAPI runtime with the Vite build promoted as static frontend assets

## Where things live

- `artifacts/sidewalk-ai/` — dashboard and its Replit web/API workflows
- `app.py` — FastAPI app, upload validation, image diagnostics, and OpenAPI docs
- `evaluation.py` — metrics for supplied prediction/annotation pairs
- `tests/test_core.py` — calculation, validation, and evaluation tests
- `README.md` — local usage, evaluation format, dataset preparation, and Vercel setup
- `lib/api-spec/openapi.yaml` — API contract used to generate the TypeScript client

## Product limits

- No trained model is configured. Obstacle detections, segmentation masks, walkable-space percentage, and the accessibility indicator remain unavailable.
- The processed preview is a grayscale gradient-edge image, not an object-detection or sidewalk-segmentation result.
- Images are processed in memory, not saved.
- Synthetic evaluation data is a test fixture only, never a research result.
- Outputs are not accessibility certification or proof of wheelchair safety.

## Deployment

Vercel's documented FastAPI frontend integration serves the built Vite assets. `pyproject.toml` configures the Python entrypoint, build command, and static-file exclusion; the root `app.py` is the FastAPI entrypoint. No `vercel.json` overrides are required by this setup.
