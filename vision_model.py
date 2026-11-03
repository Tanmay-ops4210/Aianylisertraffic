"""Lightweight YOLOv8-nano ONNX vision model for sidewalk obstacle detection."""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

MODEL_PATH = Path(__file__).parent / "yolov8n.onnx"

COCO_CLASSES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
    "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
    "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
    "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote",
    "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book",
    "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
]

_session = None


def get_session():
    """Lazily load the ONNX session once, tuned for low-CPU environments."""
    global _session
    if _session is None and MODEL_PATH.exists():
        try:
            import onnxruntime as ort
            opts = ort.SessionOptions()
            # Render free tier: 0.1 vCPU — keep to 1 thread, no spinning
            opts.intra_op_num_threads = 1
            opts.inter_op_num_threads = 1
            opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
            opts.add_session_config_entry("session.intra_op.allow_spinning", "0")
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            _session = ort.InferenceSession(
                str(MODEL_PATH), sess_options=opts, providers=["CPUExecutionProvider"]
            )
        except Exception:
            _session = None
    return _session


def is_model_available() -> bool:
    """Check if the model file and runtime are available."""
    return MODEL_PATH.exists() and get_session() is not None


def nms(boxes: np.ndarray, scores: np.ndarray, iou_thresh: float = 0.45) -> list[int]:
    """Pure NumPy Non-Maximum Suppression."""
    if len(boxes) == 0:
        return []
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
        inds = np.where(iou <= iou_thresh)[0]
        order = order[inds + 1]
    return keep


def letterbox(image: Image.Image, target_size: int = 640) -> tuple[np.ndarray, float, int, int]:
    """Resize image with aspect-ratio preserving padding."""
    w, h = image.size
    scale = min(target_size / w, target_size / h)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    resized = image.resize((nw, nh), Image.Resampling.BILINEAR)

    canvas = Image.new("RGB", (target_size, target_size), (114, 114, 114))
    pad_x = (target_size - nw) // 2
    pad_y = (target_size - nh) // 2
    canvas.paste(resized, (pad_x, pad_y))

    arr = np.asarray(canvas, dtype=np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))
    return np.expand_dims(arr, 0), scale, pad_x, pad_y


def draw_annotations(image: Image.Image, detections: list[dict[str, Any]]) -> bytes:
    """Draw bounding boxes and class labels onto the image preview."""
    preview = image.copy()
    preview.thumbnail((1200, 1200))
    scale_w = preview.width / image.width
    scale_h = preview.height / image.height

    draw = ImageDraw.Draw(preview)
    color_map = {
        "motorcycle": "#ef4444",
        "bicycle": "#f97316",
        "car": "#dc2626",
        "truck": "#dc2626",
        "bus": "#dc2626",
        "person": "#3b82f6",
        "bench": "#eab308",
        "chair": "#eab308",
        "dog": "#8b5cf6",
        "fire hydrant": "#ec4899",
    }

    for det in detections:
        box = det.get("box", [])
        if len(box) != 4:
            continue
        x1 = int(box[0] * scale_w)
        y1 = int(box[1] * scale_h)
        x2 = int(box[2] * scale_w)
        y2 = int(box[3] * scale_h)

        label = det.get("label", "obstacle")
        conf = det.get("confidence", 0.0)
        color = color_map.get(label, "#10b981")

        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        tag = f"{label} {int(conf * 100)}%"
        draw.rectangle([x1, max(0, y1 - 18), x1 + len(tag) * 8 + 6, max(18, y1)], fill=color)
        draw.text((x1 + 3, max(0, y1 - 16)), tag, fill="#ffffff")

    buf = io.BytesIO()
    preview.save(buf, format="JPEG", quality=80)
    return buf.getvalue()


def run_detection(
    image: Image.Image,
    conf_threshold: float = 0.30,
) -> tuple[list[dict[str, Any]], bytes, float, float]:
    """Run YOLOv8 inference, return detections, annotated preview, walkable %, and score."""
    session = get_session()
    if session is None:
        raise RuntimeError("YOLOv8 model is not loaded.")

    tensor, scale, pad_x, pad_y = letterbox(image, 640)
    input_name = session.get_inputs()[0].name
    output = session.run(None, {input_name: tensor})[0]

    # output is (1, 84, 8400) -> transpose to (8400, 84)
    preds = np.transpose(output[0], (1, 0))
    boxes_raw = preds[:, :4]
    scores_raw = preds[:, 4:]

    class_ids = np.argmax(scores_raw, axis=1)
    confidences = np.max(scores_raw, axis=1)

    mask = confidences >= conf_threshold
    boxes_raw = boxes_raw[mask]
    class_ids = class_ids[mask]
    confidences = confidences[mask]

    detections: list[dict[str, Any]] = []
    if len(boxes_raw) > 0:
        cx, cy, w, h = boxes_raw[:, 0], boxes_raw[:, 1], boxes_raw[:, 2], boxes_raw[:, 3]
        x1 = np.clip((cx - w / 2 - pad_x) / scale, 0, image.width)
        y1 = np.clip((cy - h / 2 - pad_y) / scale, 0, image.height)
        x2 = np.clip((cx + w / 2 - pad_x) / scale, 0, image.width)
        y2 = np.clip((cy + h / 2 - pad_y) / scale, 0, image.height)
        boxes_scaled = np.stack([x1, y1, x2, y2], axis=1)

        keep_indices = nms(boxes_scaled, confidences)

        total_blocked_area = 0.0
        img_area = float(image.width * image.height)

        for idx in keep_indices:
            cls_id = int(class_ids[idx])
            label = COCO_CLASSES[cls_id] if cls_id < len(COCO_CLASSES) else f"class_{cls_id}"
            conf = float(confidences[idx])
            b = [round(float(v), 1) for v in boxes_scaled[idx]]
            box_area = max(0.0, (b[2] - b[0]) * (b[3] - b[1]))
            total_blocked_area += box_area

            detections.append({
                "label": label,
                "confidence": round(conf, 2),
                "box": b,
            })

        # Calculate walkable percentage (ground area coverage approximation)
        blocked_ratio = min(0.85, total_blocked_area / (img_area + 1e-6))
        walkable_percentage = round(max(15.0, (1.0 - blocked_ratio) * 100.0), 1)
        # Score factors in obstacles count & blocked ratio
        obstacle_penalty = min(50.0, len(detections) * 8.0)
        accessibility_score = round(max(10.0, walkable_percentage - obstacle_penalty * 0.4), 1)
    else:
        walkable_percentage = 95.0
        accessibility_score = 92.0

    preview_bytes = draw_annotations(image, detections)
    return detections, preview_bytes, walkable_percentage, accessibility_score


def process_video(
    video_bytes: bytes,
    filename: str,
    max_frames: int = 15,
) -> tuple[list[dict[str, Any]], bytes, float, float, int, int]:
    """Sample video frames, run YOLOv8 detection, generate animated GIF preview and aggregated stats."""
    import os
    import tempfile
    import cv2

    ext = Path(filename).suffix.lower() or ".mp4"
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            raise ValueError("Could not decode the uploaded video.")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480

        # Sample frames evenly across the video
        interval = max(1, int(fps * 0.5))
        frame_indices = list(range(0, total_frames, interval))
        if len(frame_indices) > max_frames:
            step = len(frame_indices) / max_frames
            frame_indices = [frame_indices[int(i * step)] for i in range(max_frames)]

        sampled_annotated: list[Image.Image] = []
        all_detections: list[dict[str, Any]] = []
        walkable_scores: list[float] = []
        access_scores: list[float] = []

        curr_frame_idx = 0
        target_set = set(frame_indices)
        max_target = max(frame_indices) if frame_indices else 0

        while cap.isOpened() and curr_frame_idx <= max_target:
            ret, frame = cap.read()
            if not ret:
                break
            if curr_frame_idx in target_set:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_frame = Image.fromarray(rgb)
                time_sec = round(curr_frame_idx / fps, 1)

                dets, _, w_pct, a_score = run_detection(pil_frame)
                walkable_scores.append(w_pct)
                access_scores.append(a_score)

                for d in dets:
                    d_copy = dict(d)
                    d_copy["timestamp_sec"] = time_sec
                    all_detections.append(d_copy)

                annotated_bytes = draw_annotations(pil_frame, dets)
                annotated_img = Image.open(io.BytesIO(annotated_bytes)).convert("RGB")
                annotated_img.thumbnail((540, 540))
                sampled_annotated.append(annotated_img)

            curr_frame_idx += 1

        cap.release()

        avg_walkable = round(float(np.mean(walkable_scores)), 1) if walkable_scores else 95.0
        avg_access = round(float(np.mean(access_scores)), 1) if access_scores else 90.0

        if sampled_annotated:
            gif_buf = io.BytesIO()
            sampled_annotated[0].save(
                gif_buf,
                format="GIF",
                save_all=True,
                append_images=sampled_annotated[1:],
                duration=400,
                loop=0,
                optimize=True,
            )
            preview_bytes = gif_buf.getvalue()
        else:
            preview_bytes = b""

        return all_detections, preview_bytes, avg_walkable, avg_access, width, height

    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

