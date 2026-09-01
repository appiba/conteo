from __future__ import annotations

import unittest

from src.counter import EntryCounter
from src.tracker import TrackedPerson


LINE_A_LEFT = ((100.0, 0.0), (100.0, 300.0))
LINE_B_RIGHT = ((200.0, 0.0), (200.0, 300.0))
LINE_A_RIGHT = ((200.0, 0.0), (200.0, 300.0))
LINE_B_LEFT = ((100.0, 0.0), (100.0, 300.0))
LINE_A_TOP = ((0.0, 100.0), (300.0, 100.0))
LINE_B_BOTTOM = ((0.0, 200.0), (300.0, 200.0))
LINE_A_BOTTOM = ((0.0, 200.0), (300.0, 200.0))
LINE_B_TOP = ((0.0, 100.0), (300.0, 100.0))


def person_at_point(x: float, y: float = 160.0, track_id: int = 1) -> TrackedPerson:
    return TrackedPerson(track_id=track_id, box=(x - 25.0, y - 90.0, x + 25.0, y), confidence=0.9)


class EntryCounterTest(unittest.TestCase):
    def run_path(
        self,
        points,
        line_a=LINE_A_LEFT,
        line_b=LINE_B_RIGHT,
        track_id: int = 1,
        entry_direction: str = "LEFT_TO_RIGHT",
        line_orientation: str = "vertical",
    ) -> int:
        counter = EntryCounter(initial_count=0, entry_direction=entry_direction, line_orientation=line_orientation)
        total_increment = 0
        for frame_index, point in enumerate(points):
            if isinstance(point, tuple):
                x, y = point
            else:
                x, y = point, 160.0
            update = counter.update(
                [person_at_point(x, y, track_id)],
                line_a,
                line_b,
                frame_index,
                entry_direction=entry_direction,
                line_orientation=line_orientation,
            )
            total_increment += update.increment
        return total_increment

    def test_vertical_counts_left_to_right_a_then_b_once(self):
        self.assertEqual(self.run_path([50, 120, 160, 220]), 1)

    def test_vertical_does_not_count_right_to_left_b_then_a_exit(self):
        self.assertEqual(self.run_path([250, 180, 140, 80]), 0)

    def test_does_not_count_when_person_backs_out_after_a(self):
        self.assertEqual(self.run_path([50, 120, 80, 50]), 0)

    def test_counts_late_entry_when_close_person_starts_between_lines(self):
        self.assertEqual(self.run_path([150, 220]), 1)

    def test_counts_crossing_near_frame_edge(self):
        self.assertEqual(self.run_path([(50, 330), (120, 330), (220, 330)]), 1)

    def test_near_edge_exit_still_does_not_count(self):
        self.assertEqual(self.run_path([(250, 330), (180, 330), (80, 330)]), 0)

    def test_does_not_double_count_same_track_after_counted(self):
        self.assertEqual(self.run_path([50, 120, 160, 220, 180, 220, 210]), 1)

    def test_counts_multiple_tracks(self):
        counter = EntryCounter(initial_count=0)
        total_increment = 0
        paths = {
            1: [50, 120, 160, 220],
            2: [55, 130, 170, 230],
            3: [250, 180, 130, 80],
        }
        for frame_index in range(4):
            people = [person_at_point(path[frame_index], track_id=track_id) for track_id, path in paths.items()]
            total_increment += counter.update(people, LINE_A_LEFT, LINE_B_RIGHT, frame_index).increment
        self.assertEqual(total_increment, 2)

    def test_counts_one_entry_while_another_exits(self):
        counter = EntryCounter(initial_count=0)
        total_increment = 0
        paths = {
            1: [50, 120, 160, 220],
            2: [250, 180, 140, 80],
        }
        for frame_index in range(4):
            people = [person_at_point(path[frame_index], track_id=track_id) for track_id, path in paths.items()]
            total_increment += counter.update(people, LINE_A_LEFT, LINE_B_RIGHT, frame_index).increment
        self.assertEqual(total_increment, 1)

    def test_vertical_counts_right_to_left_when_a_is_on_the_right(self):
        self.assertEqual(
            self.run_path(
                [250, 180, 140, 80],
                line_a=LINE_A_RIGHT,
                line_b=LINE_B_LEFT,
                entry_direction="RIGHT_TO_LEFT",
            ),
            1,
        )

    def test_horizontal_counts_top_to_bottom(self):
        points = [(150, 50), (150, 120), (150, 160), (150, 220)]
        self.assertEqual(
            self.run_path(
                points,
                line_a=LINE_A_TOP,
                line_b=LINE_B_BOTTOM,
                entry_direction="TOP_TO_BOTTOM",
                line_orientation="horizontal",
            ),
            1,
        )

    def test_horizontal_counts_bottom_to_top_when_a_is_below(self):
        points = [(150, 250), (150, 180), (150, 140), (150, 80)]
        self.assertEqual(
            self.run_path(
                points,
                line_a=LINE_A_BOTTOM,
                line_b=LINE_B_TOP,
                entry_direction="BOTTOM_TO_TOP",
                line_orientation="horizontal",
            ),
            1,
        )

    def test_horizontal_does_not_count_b_then_a(self):
        points = [(150, 250), (150, 180), (150, 140), (150, 80)]
        self.assertEqual(
            self.run_path(
                points,
                line_a=LINE_A_TOP,
                line_b=LINE_B_BOTTOM,
                entry_direction="TOP_TO_BOTTOM",
                line_orientation="horizontal",
            ),
            0,
        )


if __name__ == "__main__":
    unittest.main()
