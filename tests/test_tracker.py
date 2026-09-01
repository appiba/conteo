from __future__ import annotations

import unittest

from src.tracker import SimpleCentroidTracker


def detection(x: float, y: float = 100.0):
    return ((x - 18.0, y - 70.0, x + 18.0, y), 0.8)


class SimpleCentroidTrackerTest(unittest.TestCase):
    def test_creates_one_track_per_person_in_group(self):
        tracker = SimpleCentroidTracker(max_distance=90.0, max_missing=5)
        people = tracker.update([detection(40), detection(82), detection(124), detection(166), detection(208), detection(250)])

        self.assertEqual(len(people), 6)
        self.assertEqual([person.track_id for person in people], [1, 2, 3, 4, 5, 6])

    def test_preserves_ids_for_close_people_moving_together(self):
        tracker = SimpleCentroidTracker(max_distance=90.0, max_missing=5)
        first = tracker.update([detection(60), detection(105), detection(150)])
        second = tracker.update([detection(76), detection(121), detection(166)])

        self.assertEqual([person.track_id for person in first], [1, 2, 3])
        self.assertEqual([person.track_id for person in second], [1, 2, 3])

    def test_keeps_missing_track_through_brief_occlusion(self):
        tracker = SimpleCentroidTracker(max_distance=110.0, max_missing=3)
        tracker.update([detection(60), detection(130)])
        visible_during_occlusion = tracker.update([detection(80)])
        recovered = tracker.update([detection(96), detection(146)])

        self.assertEqual([person.track_id for person in visible_during_occlusion], [1])
        self.assertEqual([person.track_id for person in recovered], [1, 2])


if __name__ == "__main__":
    unittest.main()
