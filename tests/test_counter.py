from __future__ import annotations

import unittest

from src.counter import EntryCounter
from src.tracker import TrackedPerson


LINE_A = ((100.0, 0.0), (100.0, 300.0))
LINE_B = ((200.0, 0.0), (200.0, 300.0))


def person_at_bottom_x(x: float, track_id: int = 1) -> TrackedPerson:
    return TrackedPerson(track_id=track_id, box=(x - 25.0, 70.0, x + 25.0, 160.0), confidence=0.9)


class EntryCounterTest(unittest.TestCase):
    def run_path(self, xs, track_id: int = 1, entry_direction: str = "LEFT_TO_RIGHT") -> int:
        counter = EntryCounter(initial_count=0, entry_direction=entry_direction)
        total_increment = 0
        for frame_index, x in enumerate(xs):
            update = counter.update([person_at_bottom_x(x, track_id)], LINE_A, LINE_B, frame_index)
            total_increment += update.increment
        return total_increment

    def test_counts_left_to_right_a_then_b_once(self):
        self.assertEqual(self.run_path([50, 120, 160, 220]), 1)

    def test_does_not_count_right_to_left_b_then_a_exit(self):
        self.assertEqual(self.run_path([250, 180, 140, 80]), 0)

    def test_does_not_count_when_person_backs_out_after_a(self):
        self.assertEqual(self.run_path([50, 120, 80, 50]), 0)

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
            people = [person_at_bottom_x(path[frame_index], track_id) for track_id, path in paths.items()]
            total_increment += counter.update(people, LINE_A, LINE_B, frame_index).increment
        self.assertEqual(total_increment, 2)

    def test_counts_one_entry_while_another_exits(self):
        counter = EntryCounter(initial_count=0)
        total_increment = 0
        paths = {
            1: [50, 120, 160, 220],
            2: [250, 180, 140, 80],
        }
        for frame_index in range(4):
            people = [person_at_bottom_x(path[frame_index], track_id) for track_id, path in paths.items()]
            total_increment += counter.update(people, LINE_A, LINE_B, frame_index).increment
        self.assertEqual(total_increment, 1)

    def test_can_count_right_to_left_when_configured(self):
        self.assertEqual(self.run_path([250, 180, 140, 80], entry_direction="RIGHT_TO_LEFT"), 1)


if __name__ == "__main__":
    unittest.main()
