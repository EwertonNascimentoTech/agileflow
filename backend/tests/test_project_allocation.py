"""Alocação percentual de horas para projetos (por pessoa)."""

from app.modules.teamops.calendar import WorkingCalendar, project_hours_per_day


class _FakePerson:
    def __init__(self, daily_hours: float = 8.0, project_allocation_pct: float = 100.0):
        self.daily_hours = daily_hours
        self.project_allocation_pct = project_allocation_pct


def test_project_hours_per_day_with_person():
    cal = WorkingCalendar()
    p = _FakePerson(daily_hours=8.0, project_allocation_pct=62.5)
    assert project_hours_per_day(p, cal) == 5.0


def test_project_hours_per_day_without_person():
    cal = WorkingCalendar()
    assert project_hours_per_day(None, cal) == cal.hours_per_day()


def test_duration_days_example_10h_at_5h_per_day():
    import math
    estimated = 10.0
    hpd = 5.0
    assert max(1, math.ceil(estimated / hpd)) == 2
