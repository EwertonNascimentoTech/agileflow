"""Calendário de trabalho corporativo — aritmética de HORAS úteis (puro, testável).

Este módulo é a fonte da verdade de tempo do motor de cronograma (estilo MS Project): soma e
mede horas dentro do expediente, respeitando almoço, dias úteis e feriados. Não depende de
SQLAlchemy nas funções de cálculo — só `load_calendar` toca o banco. Vive no módulo Pessoa
(teamops) porque calendário/feriados são domínio de RH; o módulo Projetos importa daqui.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # evita importar models (e a cadeia de DB) em uso puro/testes
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.modules.teamops.models import Person


def _to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


@dataclass
class WorkingCalendar:
    """Calendário imutável de cálculo. Horários em `time` local (sem timezone — o planejamento é
    feito no fuso do tenant, tratado como "relógio de parede")."""

    day_start: time = time(8, 0)
    day_end: time = time(17, 0)
    lunch_start: time | None = time(12, 0)
    lunch_end: time | None = time(13, 0)
    # Dias úteis no padrão Python: 0=segunda … 6=domingo.
    work_days: frozenset[int] = field(default_factory=lambda: frozenset({0, 1, 2, 3, 4}))
    # Feriados fixos (date) e recorrentes (mês, dia).
    holidays: frozenset[date] = field(default_factory=frozenset)
    recurring_holidays: frozenset[tuple[int, int]] = field(default_factory=frozenset)

    # ── janelas de trabalho do dia (lista de (início, fim) em minutos desde a meia-noite) ──
    def _segments(self) -> list[tuple[int, int]]:
        ds, de = _to_minutes(self.day_start), _to_minutes(self.day_end)
        if self.lunch_start and self.lunch_end:
            ls, le = _to_minutes(self.lunch_start), _to_minutes(self.lunch_end)
            # Almoço dentro do expediente parte o dia em duas janelas.
            if ds < ls < le < de:
                return [(ds, ls), (le, de)]
        return [(ds, de)]

    def minutes_per_day(self) -> int:
        return sum(b - a for a, b in self._segments())

    def hours_per_day(self) -> float:
        return self.minutes_per_day() / 60.0

    def is_working_day(self, d: date) -> bool:
        if d.weekday() not in self.work_days:
            return False
        if d in self.holidays:
            return False
        if (d.month, d.day) in self.recurring_holidays:
            return False
        return True

    # ── posição dentro do dia ──────────────────────────────────────────────
    def next_start(self, dt: datetime) -> datetime:
        """Alinha `dt` para o próximo instante de trabalho: dentro de uma janela retorna o próprio
        `dt`; entre janelas (almoço) pula para o início da próxima; após o expediente ou em dia
        não-útil, pula para o início do expediente do próximo dia útil."""
        cur = dt
        for _ in range(3660):
            d = cur.date()
            if not self.is_working_day(d):
                cur = datetime.combine(d + timedelta(days=1), self.day_start)
                continue
            minute = cur.hour * 60 + cur.minute
            placed = None
            for a, b in self._segments():
                if minute < a:
                    placed = a
                    break
                if a <= minute < b:
                    placed = minute
                    break
            if placed is not None:
                return datetime.combine(d, time(placed // 60, placed % 60))
            # Depois da última janela do dia → próximo dia útil.
            cur = datetime.combine(d + timedelta(days=1), self.day_start)
        return cur

    def add_working_hours(self, start: datetime, hours: float) -> datetime:
        """Soma `hours` horas úteis a `start`, respeitando expediente/almoço/dias úteis/feriados.

        - `hours == 0` → marco: devolve o próprio instante alinhado (`next_start`).
        - `hours < 0` → lead: anda para trás dentro das janelas de trabalho.
        - O fim é "inclusivo de trabalho": consumir exatamente o restante de uma janela termina no
          fim dela (ex.: 8h a partir de seg 08:00 = seg 17:00), sem rolar para o próximo dia.
        """
        total = int(round(abs(hours) * 60))  # minutos a consumir
        if hours >= 0:
            return self._add_forward(self.next_start(start), total)
        return self._sub_backward(start, total)

    def _add_forward(self, start: datetime, minutes: int) -> datetime:
        cur = self.next_start(start)
        remaining = minutes
        if remaining == 0:
            return cur
        for _ in range(100000):
            d = cur.date()
            m = cur.hour * 60 + cur.minute
            # janela atual a partir de `m`
            seg = next(((a, b) for a, b in self._segments() if a <= m < b), None)
            if seg is None:
                cur = self.next_start(cur)
                continue
            _, end = seg
            avail = end - m
            if remaining <= avail:
                m2 = m + remaining
                return datetime.combine(d, time(m2 // 60, m2 % 60))
            remaining -= avail
            # vai para o início da próxima janela/dia
            cur = self.next_start(datetime.combine(d, time(end // 60, end % 60)))
        return cur

    def _sub_backward(self, start: datetime, minutes: int) -> datetime:
        cur = start
        remaining = minutes
        for _ in range(100000):
            d = cur.date()
            if not self.is_working_day(d):
                cur = datetime.combine(d - timedelta(days=1), self.day_end)
                continue
            m = cur.hour * 60 + cur.minute
            # Consome o trabalho ANTES de `m` no dia, varrendo as janelas de trás para frente.
            for a, b in reversed(self._segments()):
                end = min(b, m)
                if end <= a:
                    continue  # esta janela está toda em/depois de `m`
                avail = end - a
                if remaining <= avail:
                    m2 = end - remaining
                    return datetime.combine(d, time(m2 // 60, m2 % 60))
                remaining -= avail
            # Esgotou o dia → continua no fim do expediente do dia útil anterior.
            cur = datetime.combine(d - timedelta(days=1), self.day_end)
        return cur

    def working_hours_between(self, a: datetime, b: datetime) -> float:
        """Horas úteis no intervalo [a, b]. Usada para preservar a duração quando só há datas."""
        if b < a:
            a, b = b, a
        cur = self.next_start(a)
        minutes = 0
        for _ in range(100000):
            if cur >= b:
                break
            d = cur.date()
            m = cur.hour * 60 + cur.minute
            seg = next(((s, e) for s, e in self._segments() if s <= m < e), None)
            if seg is None:
                cur = self.next_start(cur)
                continue
            _, end = seg
            seg_end_dt = datetime.combine(d, time(end // 60, end % 60))
            stop = min(seg_end_dt, b)
            minutes += int((stop - cur).total_seconds() // 60)
            cur = self.next_start(seg_end_dt)
        return minutes / 60.0


def project_hours_per_day(person: "Person | None", calendar: WorkingCalendar) -> float:
    """Horas diárias efetivas para projetos: daily_hours × project_allocation_pct / 100.
    Sem pessoa (tarefa sem responsável), usa 100% do expediente corporativo."""
    if person is None:
        return calendar.hours_per_day()
    base = float(person.daily_hours) if person.daily_hours else calendar.hours_per_day()
    pct = float(person.project_allocation_pct) if person.project_allocation_pct is not None else 100.0
    return max(0.01, base * pct / 100.0)


async def load_calendar(db: "AsyncSession") -> WorkingCalendar:
    """Lê o calendário singleton + feriados do schema do tenant e devolve um WorkingCalendar.
    Se não houver configuração, usa o padrão (08–12 / 13–17, seg–sex, sem feriados)."""
    from sqlalchemy import select  # imports tardios mantêm o módulo leve para uso puro
    from app.modules.teamops.models import Holiday, WorkCalendar

    cal_row = (await db.execute(select(WorkCalendar).limit(1))).scalar_one_or_none()
    hol_rows = (await db.execute(select(Holiday))).scalars().all()

    fixed: set[date] = set()
    recurring: set[tuple[int, int]] = set()
    for h in hol_rows:
        if h.is_recurring:
            recurring.add((h.day.month, h.day.day))
        else:
            fixed.add(h.day)

    if cal_row is None:
        return WorkingCalendar(holidays=frozenset(fixed), recurring_holidays=frozenset(recurring))

    work_days = cal_row.work_days if cal_row.work_days else [0, 1, 2, 3, 4]
    return WorkingCalendar(
        day_start=cal_row.day_start,
        day_end=cal_row.day_end,
        lunch_start=cal_row.lunch_start,
        lunch_end=cal_row.lunch_end,
        work_days=frozenset(int(x) for x in work_days),
        holidays=frozenset(fixed),
        recurring_holidays=frozenset(recurring),
    )
