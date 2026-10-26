"""Metrics for comparing SidewalkAI predictions with supplied annotations."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np


def _percentage(value: Any) -> float:
    number = float(value)
    if not np.isfinite(number) or not 0 <= number <= 100:
        raise ValueError("Unobstructed-space percentages must be between 0 and 100.")
    return number


def evaluate(samples: list[dict[str, Any]]) -> dict[str, Any]:
    """Return only metrics supported by at least one valid supplied pair."""
    result: dict[str, Any] = {"samples": len(samples)}
    tp = fp = fn = 0
    obstacle_pairs = 0
    intersection = union = 0
    mask_pairs = 0
    percentage_errors: list[float] = []
    processing_times: list[float] = []

    for sample in samples:
        prediction = sample.get("prediction", {})
        truth = sample.get("ground_truth", {})

        if isinstance(prediction.get("obstacles"), list) and isinstance(
            truth.get("obstacles"), list
        ):
            if not all(isinstance(label, str) for label in prediction["obstacles"] + truth["obstacles"]):
                raise ValueError("Obstacle labels must be strings.")
            predicted = set(prediction["obstacles"])
            expected = set(truth["obstacles"])
            tp += len(predicted & expected)
            fp += len(predicted - expected)
            fn += len(expected - predicted)
            obstacle_pairs += 1

        predicted_mask = prediction.get("walkable_mask")
        expected_mask = truth.get("walkable_mask")
        if predicted_mask is not None and expected_mask is not None:
            predicted_array = np.asarray(predicted_mask, dtype=bool)
            expected_array = np.asarray(expected_mask, dtype=bool)
            if predicted_array.ndim != 2 or predicted_array.shape != expected_array.shape:
                raise ValueError("Paired walkable masks must be 2D and have matching shapes.")
            intersection += int(np.count_nonzero(predicted_array & expected_array))
            union += int(np.count_nonzero(predicted_array | expected_array))
            mask_pairs += 1

        predicted_percentage = prediction.get("unobstructed_percentage")
        expected_percentage = truth.get("unobstructed_percentage")
        if predicted_percentage is not None and expected_percentage is not None:
            percentage_errors.append(
                abs(_percentage(predicted_percentage) - _percentage(expected_percentage))
            )

        processing_ms = prediction.get("processing_ms")
        if processing_ms is not None:
            processing_time = float(processing_ms)
            if not np.isfinite(processing_time) or processing_time < 0:
                raise ValueError("Processing time must be a finite, non-negative number.")
            processing_times.append(processing_time)

    if obstacle_pairs:
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        result["obstacle_detection"] = {
            "samples": obstacle_pairs,
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "precision": precision,
            "recall": recall,
            "f1": 2 * precision * recall / (precision + recall)
            if precision + recall
            else 0.0,
        }
    if mask_pairs:
        result["mask_iou"] = {
            "samples": mask_pairs,
            "value": intersection / union if union else None,
        }
    if percentage_errors:
        result["unobstructed_percentage_mae"] = {
            "samples": len(percentage_errors),
            "percentage_points": sum(percentage_errors) / len(percentage_errors),
        }
    if processing_times:
        result["processing_time_ms"] = {
            "samples": len(processing_times),
            "mean": sum(processing_times) / len(processing_times),
        }
    return result


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    samples = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"Line {line_number} must contain a JSON object.")
        samples.append(value)
    return samples


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("annotations", type=Path, help="JSONL prediction/ground-truth pairs")
    args = parser.parse_args()
    print(json.dumps(evaluate(read_jsonl(args.annotations)), indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
