import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Datas da API vêm como UTC naive (`2026-08-04T02:12:22.099090`, sem Z).
 * Sem sufixo de fuso, o browser trata como horário local e no Brasil fica ~3h adiantado.
 */
export function parseApiDate(value: string | Date): Date {
  if (value instanceof Date) return value
  const s = value.trim()
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(`${s}Z`)
  }
  return new Date(s)
}

/** Formata timestamp da API no fuso local do usuário (pt-BR). */
export function formatApiDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—"
  const d = parseApiDate(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("pt-BR")
}

/** String vazia → `null` em PATCH (undefined é omitido no JSON e não limpa o campo no backend). */
export function nullableStr(value: string | null | undefined): string | null {
  const v = (value ?? "").trim()
  return v || null
}

/** Em criação usa `undefined`; em edição usa `null` para limpar campos opcionais. */
export function optStrForSave(value: string | null | undefined, editing: boolean): string | null | undefined {
  const v = (value ?? "").trim()
  return editing ? (v || null) : (v || undefined)
}
