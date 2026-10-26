# SidewalkAI

SidewalkAI is a research interface for inspecting sidewalk images. The current
baseline validates images and creates a grayscale gradient-edge preview. It
does **not** detect obstacles or segment sidewalks: no trained vision model is
configured. Therefore, walkable percentage and the preliminary 0–100
accessibility indicator are explicitly unavailable. This is not accessibility
certification or evidence that a route is wheelchair-safe.

## Local development

- Frontend: `pnpm --filter @workspace/sidewalk-ai run dev`
- API: `.pythonlibs/bin/uvicorn app:app --host 0.0.0.0 --port 8061`
- Tests: `.pythonlibs/bin/python -m pytest -q`
- Evaluation: `.pythonlibs/bin/python evaluation.py path/to/annotations.jsonl`
- API docs: `/docs`, `/redoc`, and `/openapi.json`

The FastAPI API exposes `GET /api/health` and `POST /api/analyze`. Uploads are
limited to 8 MiB and valid JPEG, PNG, or WebP images up to 25 megapixels.
Uploaded images are processed in memory and are not persisted.

## Research evaluation

Run `python evaluation.py path/to/annotations.jsonl`. Each JSONL record may
include any supported prediction/ground-truth pairs:

- `prediction.obstacles` and `ground_truth.obstacles`: lists of obstacle labels
  for micro-averaged precision, recall, and F1.
- `prediction.walkable_mask` and `ground_truth.walkable_mask`: same-sized 2D
  arrays for mask IoU.
- `prediction.unobstructed_percentage` and
  `ground_truth.unobstructed_percentage`: numeric percentages for MAE in
  percentage points.
- `prediction.processing_ms`: processing time.

Metrics with no supported annotation pairs are omitted. The fixture at
`tests/fixtures/synthetic_eval.jsonl` is **synthetic test data only**; its
results are not research findings.

## Dataset preparation and leakage prevention

1. Confirm each public dataset's license, terms, label definitions, image
   provenance, and permitted research use before download. Public street-scene
   datasets such as Mapillary Vistas may provide useful sidewalk labels, but
   their classes and annotation quality must be checked for the study question.
2. Build a manifest containing an image path, source dataset, location/route
   group, capture session or sequence, and annotation paths. Prepare binary
   sidewalk masks and instance/pixel masks for obstruction categories using
   documented label definitions.
3. For a locally collected Indian footpath dataset, record consent and
   collection permissions, avoid unnecessary precise location data, and
   redact identifiable faces and vehicle plates where appropriate. Include
   varied cities, neighborhoods, street types, time-of-day, and conditions.
   Annotate sidewalk regions and obstruction types with a written protocol and
   adjudicate ambiguous cases.
4. Assign train/validation/test splits by **route, location, or capture
   session before sampling frames or making crops**. Keep adjacent frames,
   crops, repeat visits, and images from the same route group within one split.
   Record split manifests and do not tune thresholds on the held-out test set.
5. Report evaluation only for examples with the matching ground truth. Keep
   synthetic fixtures separate from all study datasets and published results.

## Vercel

The root `app.py` exports the FastAPI instance as `app`; Vercel's FastAPI
runtime serves the API and FastAPI OpenAPI docs. A Vercel build script builds
the Vite frontend, which FastAPI's supported frontend integration promotes as
static assets. Set the Vercel project root to the repository root and deploy
from the connected Git repository or Vercel CLI version 48.1.8 or newer.

No API credentials, database, GPU, model download, or persistent local storage
are required. There is no trained inference provider configured in this
baseline.
