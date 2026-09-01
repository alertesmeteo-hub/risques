import unittest
from datetime import datetime, timezone
from types import ModuleType
import sys

# This unit test exercises pure date logic and does not perform HTTP calls.
# Keep it runnable in minimal CI environments where requests is not installed.
sys.modules.setdefault("requests", ModuleType("requests"))

from scripts.update_risques import _effective_date


class MeteorologicalDayTests(unittest.TestCase):
    def test_after_midnight_remains_on_previous_meteorological_day(self):
        # 22:30 UTC = 00:30 in Paris during daylight-saving time.
        moment = datetime(2026, 8, 31, 22, 30, tzinfo=timezone.utc)
        self.assertEqual(_effective_date(moment).isoformat(), "2026-08-31")

    def test_day_changes_at_six_local_time(self):
        # 04:00 UTC = 06:00 in Paris during daylight-saving time.
        moment = datetime(2026, 9, 1, 4, 0, tzinfo=timezone.utc)
        self.assertEqual(_effective_date(moment).isoformat(), "2026-09-01")


if __name__ == "__main__":
    unittest.main()
