import type { ProcessItem } from "@/api/produtos"

export function collectSubprocessos(node: ProcessItem): ProcessItem[] {
  if (node.nivel === "subprocesso") return [node]
  return (node.children ?? []).flatMap(collectSubprocessos)
}

export function documentationStats(node: ProcessItem): { pct: number; total: number; documented: number } {
  const subs = collectSubprocessos(node)
  if (subs.length === 0) return { pct: 0, total: 0, documented: 0 }
  const documented = subs.filter((s) => s.documentado).length
  return {
    pct: Math.round((documented / subs.length) * 100),
    total: subs.length,
    documented,
  }
}

export function vigenciaFromSubprocessos(node: ProcessItem): { inicio: string | null; fim: string | null } {
  const subs = collectSubprocessos(node)
  const starts = subs.map((s) => s.vigencia_inicio).filter(Boolean) as string[]
  const ends = subs.map((s) => s.vigencia_fim).filter(Boolean) as string[]
  return {
    inicio: starts.length ? [...starts].sort()[0] : null,
    fim: ends.length ? [...ends].sort().reverse()[0] : null,
  }
}

export function formatVigenciaRange(inicio: string | null | undefined, fim: string | null | undefined): string | null {
  if (!inicio && !fim) return null
  const fmt = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR")
  if (inicio && fim) return `${fmt(inicio)} → ${fmt(fim)}`
  if (inicio) return `desde ${fmt(inicio)}`
  return `até ${fmt(fim!)}`
}
