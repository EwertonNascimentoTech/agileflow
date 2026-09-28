export function errMsg(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

export function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}

/** Data local em AAAA-MM-DD (sem passar por UTC, que muda o dia à noite). */
export function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return d.toLocaleDateString("pt-BR")
}

export function fmtNum(v: number | null | undefined, casas = 1): string {
  return v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas })
}

export function fmtPct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v)}%`
}

export function mesCurto(m: string): string {
  const [y, mo] = m.split("-")
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
  return `${nomes[Number(mo) - 1] ?? mo}/${y.slice(2)}`
}
