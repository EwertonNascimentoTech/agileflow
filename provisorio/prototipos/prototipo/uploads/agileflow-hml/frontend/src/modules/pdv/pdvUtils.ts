/** Helpers compartilhados pelas páginas do PDV. */

export function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0)
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function fmtQty(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0)
  return (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR")
}

export function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => (x as { msg?: string }).msg).join(", ")
  return "Erro ao processar."
}
