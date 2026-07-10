import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
