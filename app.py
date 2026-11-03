"""SidewalkAI FastAPI entrypoint for local development and Vercel."""

from __future__ import annotations

import asyncio
import base64
import io
import time
import warnings
from pathlib import Path
from typing import Annotated

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel

from vision_model import is_model_available, process_video, run_detection

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
MAX_PREVIEW_EDGE = 1400
SUPPORTED_FORMATS = {"JPEG", "PNG", "WEBP"}
SUPPORTED_VIDEO_EXTS = {".mp4", ".webm", ".mov", ".avi", ".mkv"}
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

app = FastAPI(
    title="SidewalkAI",
    description=(
        "Preliminary visual sidewalk diagnostics. This service does not provide "
        "accessibility certification or wheelchair-safety determinations."
    ),
    version="1.0.0",
)


class ImageSummary(BaseModel):
    filename: str
    content_type: str
    width: int
    height: int
    size_bytes: int


class HealthResponse(BaseModel):
    status: str
    model_configured: bool
    model_name: str | None


class AnalysisResponse(BaseModel):
    status: str
    image: ImageSummary
    model_configured: bool
    detections_available: bool
    detections: list[dict[str, object]]
    sidewalk_mask_available: bool
    obstacle_masks_available: bool
    walkable_percentage: float | None
    accessibility_score: float | None
    walkable_estimate_status: str
    processed_image_available: bool
    processed_preview_base64: str | None
    processing_method: str
    processing_ms: float
    limitations: list[str]


def safe_filename(filename: str | None) -> str:
    name = Path((filename or "upload").replace("\\", "/")).name
    cleaned = "".join(char for char in name if char.isprintable() and char not in "\r\n")
    return (cleaned[:120] or "upload")


def decode_image(data: bytes, filename: str | None) -> tuple[Image.Image, ImageSummary]:
    """Validate bytes by decoding them; never trust the supplied MIME type."""
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 8 MiB upload limit.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as probe:
                image_format = probe.format
                width, height = probe.size
                if image_format not in SUPPORTED_FORMATS:
                    raise HTTPException(
                        status_code=400,
                        detail="Use a valid JPEG, PNG, or WebP image.",
                    )
                if width < 1 or height < 1 or width * height > MAX_IMAGE_PIXELS:
                    raise HTTPException(
                        status_code=413,
                        detail="Image dimensions exceed the 25-megapixel limit.",
                    )
                probe.verify()

            with Image.open(io.BytesIO(data)) as source:
                image = ImageOps.exif_transpose(source).convert("RGB")
                image.load()
    except HTTPException:
        raise
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        OSError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=400,
            detail="The file could not be decoded as a supported image.",
        ) from exc

    summary = ImageSummary(
        filename=safe_filename(filename),
        content_type={
            "JPEG": "image/jpeg",
            "PNG": "image/png",
            "WEBP": "image/webp",
        }[image_format],
        width=image.width,
        height=image.height,
        size_bytes=len(data),
    )
    return image, summary


def walkable_percentage(
    sidewalk_mask: np.ndarray | None,
    obstacle_masks: list[np.ndarray] | None,
) -> float | None:
    """Calculate clear sidewalk coverage only when real masks are supplied."""
    if sidewalk_mask is None or obstacle_masks is None:
        return None
    sidewalk = np.asarray(sidewalk_mask, dtype=bool)
    if sidewalk.ndim != 2 or sidewalk.size == 0 or not sidewalk.any():
        return None

    blocked = np.zeros(sidewalk.shape, dtype=bool)
    for obstacle_mask in obstacle_masks:
        obstacle = np.asarray(obstacle_mask, dtype=bool)
        if obstacle.shape != sidewalk.shape:
            raise ValueError("Obstacle and sidewalk masks must have matching dimensions.")
        blocked |= obstacle

    clear_pixels = np.count_nonzero(sidewalk & ~blocked)
    return float(100 * clear_pixels / np.count_nonzero(sidewalk))


def make_edge_preview(image: Image.Image) -> bytes:
    """Create a genuine grayscale gradient preview, not a semantic mask."""
    preview = image.copy()
    preview.thumbnail((MAX_PREVIEW_EDGE, MAX_PREVIEW_EDGE))
    grayscale = np.asarray(preview.convert("L"), dtype=np.float32)
    padded = np.pad(grayscale, 1, mode="edge")
    horizontal = (padded[1:-1, 2:] - padded[1:-1, :-2]) / 2
    vertical = (padded[2:, 1:-1] - padded[:-2, 1:-1]) / 2
    magnitude = np.hypot(horizontal, vertical)
    edge_image = Image.fromarray(np.where(magnitude >= 32, 230, 20).astype(np.uint8))
    output = io.BytesIO()
    edge_image.save(output, format="PNG", optimize=True)
    return output.getvalue()


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    has_model = is_model_available()
    return HealthResponse(
        status="ok",
        model_configured=has_model,
        model_name="YOLOv8-nano (Sidewalk Obstacles)" if has_model else None,
    )


@app.get("/api/debug")
def debug_info():
    from vision_model import MODEL_PATH
    import sys
    return {
        "model_path": str(MODEL_PATH),
        "model_exists": MODEL_PATH.exists(),
        "model_size_bytes": MODEL_PATH.stat().st_size if MODEL_PATH.exists() else None,
        "python": sys.version,
    }


@app.post("/api/analyze", response_model=AnalysisResponse)
async def analyze(image: Annotated[UploadFile, File()]) -> AnalysisResponse:
    started = time.perf_counter()
    data = await image.read(MAX_UPLOAD_BYTES + 1)
    await image.close()
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 25 MiB upload limit.")

    ext = Path(image.filename or "").suffix.lower()
    is_video = ext in SUPPORTED_VIDEO_EXTS or (image.content_type or "").startswith("video/")

    if is_video:
        if not is_model_available():
            raise HTTPException(status_code=503, detail="Video obstacle detection requires the YOLOv8 model.")

        try:
            detections, preview, walkable_pct, access_score, width, height = await asyncio.to_thread(
                process_video, data, image.filename or "video.mp4"
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to process video: {exc}")

        summary = ImageSummary(
            filename=safe_filename(image.filename),
            content_type=image.content_type or "video/mp4",
            width=width,
            height=height,
            size_bytes=len(data),
        )
        det_count = len(detections)
        limitations = [
            f"Analyzed route video using YOLOv8-nano ({det_count} obstacle events detected).",
            "Animated preview displays detected obstacles sampled along the video route.",
            "Walkable space and accessibility scores are route-averaged estimates.",
            "This preliminary research tool is not accessibility certification or proof of wheelchair safety.",
        ]
        return AnalysisResponse(
            status="complete",
            image=summary,
            model_configured=True,
            detections_available=True,
            detections=detections,
            sidewalk_mask_available=False,
            obstacle_masks_available=det_count > 0,
            walkable_percentage=walkable_pct,
            accessibility_score=access_score,
            walkable_estimate_status="calculated",
            processed_image_available=True,
            processed_preview_base64=base64.b64encode(preview).decode("ascii"),
            processing_method="yolov8n_video_obstacle_detection",
            processing_ms=round((time.perf_counter() - started) * 1000, 2),
            limitations=limitations,
        )

    decoded, summary = decode_image(data, image.filename)

    if is_model_available():
        detections, preview, walkable_pct, access_score = await asyncio.to_thread(run_detection, decoded)
        det_count = len(detections)
        limitations = [
            f"Detected {det_count} sidewalk obstacle(s) using YOLOv8-nano."
            if det_count > 0 else "No major physical obstacles detected on the path.",
            "Walkable space and accessibility scores are preliminary estimates.",
            "This preliminary research tool is not accessibility certification or proof of wheelchair safety.",
        ]
        return AnalysisResponse(
            status="complete",
            image=summary,
            model_configured=True,
            detections_available=True,
            detections=detections,
            sidewalk_mask_available=False,
            obstacle_masks_available=det_count > 0,
            walkable_percentage=walkable_pct,
            accessibility_score=access_score,
            walkable_estimate_status="calculated",
            processed_image_available=True,
            processed_preview_base64=base64.b64encode(preview).decode("ascii"),
            processing_method="yolov8n_obstacle_detection",
            processing_ms=round((time.perf_counter() - started) * 1000, 2),
            limitations=limitations,
        )

    preview = make_edge_preview(decoded)
    return AnalysisResponse(
        status="complete",
        image=summary,
        model_configured=False,
        detections_available=False,
        detections=[],
        sidewalk_mask_available=False,
        obstacle_masks_available=False,
        walkable_percentage=None,
        accessibility_score=None,
        walkable_estimate_status="unavailable",
        processed_image_available=True,
        processed_preview_base64=base64.b64encode(preview).decode("ascii"),
        processing_method="grayscale_gradient_edge_preview",
        processing_ms=round((time.perf_counter() - started) * 1000, 2),
        limitations=[
            "No trained vision model is configured; no obstacle detections were made.",
            "No sidewalk or obstacle masks are available, so walkable percentage and score are unavailable.",
            "The processed image is a grayscale edge preview, not an object detection or sidewalk segmentation.",
            "This preliminary research tool is not accessibility certification or proof of wheelchair safety.",
        ],
    )


frontend_dist = Path(__file__).parent / "artifacts" / "sidewalk-ai" / "dist" / "public"
if frontend_dist.is_dir():
    # Vercel promotes this build to its static CDN; local Replit development
    # uses Vite and therefore does not need this mount.
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
