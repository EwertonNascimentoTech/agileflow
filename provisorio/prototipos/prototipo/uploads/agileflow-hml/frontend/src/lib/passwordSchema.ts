import { z } from "zod"

/**
 * Política de senha forte do projeto.
 * Espelha `validate_password_strength` no backend (core/security.py).
 *
 * Requisitos:
 *  - mínimo 8 caracteres
 *  - ao menos 1 letra maiúscula
 *  - ao menos 1 letra minúscula
 *  - ao menos 1 número
 *  - ao menos 1 caractere especial
 */

export const PASSWORD_POLICY_DESCRIPTION =
  "Mínimo 8 caracteres, com pelo menos 1 letra maiúscula, 1 letra minúscula, 1 número e 1 caractere especial."

export const passwordSchema = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Inclua ao menos 1 letra maiúscula")
  .regex(/[a-z]/, "Inclua ao menos 1 letra minúscula")
  .regex(/\d/, "Inclua ao menos 1 número")
  .regex(/[^A-Za-z0-9]/, "Inclua ao menos 1 caractere especial")

export interface PasswordCheck {
  ok: boolean
  rules: Array<{ label: string; passed: boolean }>
}

/** Avalia uma senha contra cada regra individualmente. Útil pra UI de "checklist". */
export function checkPassword(password: string): PasswordCheck {
  const rules = [
    { label: "Mínimo 8 caracteres",           passed: password.length >= 8 },
    { label: "Ao menos 1 letra maiúscula",    passed: /[A-Z]/.test(password) },
    { label: "Ao menos 1 letra minúscula",    passed: /[a-z]/.test(password) },
    { label: "Ao menos 1 número",             passed: /\d/.test(password) },
    { label: "Ao menos 1 caractere especial", passed: /[^A-Za-z0-9]/.test(password) },
  ]
  return { ok: rules.every(r => r.passed), rules }
}
