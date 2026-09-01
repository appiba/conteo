from __future__ import annotations

import unittest

from src.geometry import (
    default_line_positions,
    direction_positions_valid,
    line_from_position,
    movement_crossed_line,
    normalized_line_position,
)


class GeometryTest(unittest.TestCase):
    def test_default_vertical_left_to_right_places_a_before_b(self):
        a, b = default_line_positions("vertical", "LEFT_TO_RIGHT")
        self.assertLess(a, b)
        self.assertTrue(direction_positions_valid(a, b, "vertical", "LEFT_TO_RIGHT"))

    def test_default_vertical_right_to_left_places_a_after_b(self):
        a, b = default_line_positions("vertical", "RIGHT_TO_LEFT")
        self.assertGreater(a, b)
        self.assertTrue(direction_positions_valid(a, b, "vertical", "RIGHT_TO_LEFT"))

    def test_default_horizontal_bottom_to_top_places_a_below_b(self):
        a, b = default_line_positions("horizontal", "BOTTOM_TO_TOP")
        self.assertGreater(a, b)
        self.assertTrue(direction_positions_valid(a, b, "horizontal", "BOTTOM_TO_TOP"))

    def test_horizontal_crossing_uses_y_axis(self):
        line = ((0.0, 100.0), (300.0, 100.0))
        self.assertTrue(movement_crossed_line((150.0, 50.0), (150.0, 150.0), line, "horizontal"))
        self.assertFalse(movement_crossed_line((150.0, 50.0), (250.0, 50.0), line, "horizontal"))

    def test_normalized_line_position_scales_with_resolution(self):
        line = line_from_position(1280, 720, "vertical", 0.38)
        self.assertAlmostEqual(normalized_line_position(line, "vertical", 1280, 720), 0.38, places=2)


if __name__ == "__main__":
    unittest.main()
