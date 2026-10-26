import json
import unittest
from pathlib import Path

import numpy as np
from fastapi import HTTPException
from PIL import Image

from app import decode_image, walkable_percentage
from evaluation import evaluate, read_jsonl


class WalkablePercentageTests(unittest.TestCase):
    def test_intersects_obstacles_with_sidewalk_and_unions_overlaps(self):
        sidewalk = np.array([[1, 1, 1], [0, 1, 1]], dtype=bool)
        obstacles = [
            np.array([[1, 0, 0], [1, 1, 0]], dtype=bool),
            np.array([[0, 1, 0], [0, 1, 1]], dtype=bool),
        ]
        self.assertEqual(walkable_percentage(sidewalk, obstacles), 20.0)

    def test_missing_or_zero_area_masks_are_unavailable(self):
        self.assertIsNone(walkable_percentage(None, []))
        self.assertIsNone(walkable_percentage(np.zeros((2, 2)), []))

    def test_mask_shape_mismatch_is_rejected(self):
        with self.assertRaises(ValueError):
            walkable_percentage(np.ones((2, 2)), [np.ones((2, 3))])

    def test_invalid_percentages_are_rejected(self):
        with self.assertRaises(ValueError):
            evaluate([{
                "prediction": {"unobstructed_percentage": 101},
                "ground_truth": {"unobstructed_percentage": 50},
            }])


class ImageValidationTests(unittest.TestCase):
    def test_valid_png_is_decoded_from_bytes_not_declared_mime(self):
        output = __import__("io").BytesIO()
        Image.new("RGB", (8, 6), "gray").save(output, format="PNG")
        decoded, summary = decode_image(output.getvalue(), "../../street.png")
        self.assertEqual(decoded.size, (8, 6))
        self.assertEqual(summary.content_type, "image/png")
        self.assertEqual(summary.filename, "street.png")

    def test_single_pixel_image_can_be_processed(self):
        output = __import__("io").BytesIO()
        Image.new("RGB", (1, 1), "gray").save(output, format="PNG")
        decoded, _ = decode_image(output.getvalue(), "pixel.png")
        from app import make_edge_preview

        self.assertTrue(make_edge_preview(decoded).startswith(b"\x89PNG"))

    def test_invalid_image_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            decode_image(b"not an image", "street.png")
        self.assertEqual(error.exception.status_code, 400)


class EvaluationTests(unittest.TestCase):
    def test_metrics_are_omitted_without_ground_truth_pairs(self):
        self.assertEqual(evaluate([{"prediction": {}, "ground_truth": {}}]), {"samples": 1})

    def test_metrics_only_include_supported_annotations(self):
        report = evaluate(
            [
                {
                    "prediction": {
                        "obstacles": ["motorcycle", "rubbish"],
                        "walkable_mask": [[1, 0], [1, 1]],
                        "unobstructed_percentage": 75,
                        "processing_ms": 12,
                    },
                    "ground_truth": {
                        "obstacles": ["motorcycle", "stall"],
                        "walkable_mask": [[1, 1], [1, 0]],
                        "unobstructed_percentage": 80,
                    },
                },
                {"prediction": {}, "ground_truth": {}},
            ]
        )
        self.assertEqual(report["obstacle_detection"]["precision"], 0.5)
        self.assertEqual(report["obstacle_detection"]["recall"], 0.5)
        self.assertEqual(report["obstacle_detection"]["f1"], 0.5)
        self.assertEqual(report["mask_iou"]["value"], 0.5)
        self.assertEqual(report["unobstructed_percentage_mae"]["percentage_points"], 5)
        self.assertEqual(report["processing_time_ms"]["mean"], 12)
        self.assertNotIn("unreported_metric", report)

    def test_synthetic_fixture_is_readable(self):
        fixture = Path(__file__).parent / "fixtures" / "synthetic_eval.jsonl"
        examples = read_jsonl(fixture)
        self.assertEqual(len(examples), 1)
        self.assertTrue(examples[0]["synthetic_fixture"])
        self.assertIn("obstacle_detection", evaluate(examples))


if __name__ == "__main__":
    unittest.main()
