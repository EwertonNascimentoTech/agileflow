/**
 * Fonte única dos itens de navegação de Configurações.
 * Consumido pelo SettingsLayout (tabs horizontais) e pela sidebar contextual do shell.
 */
import { User as UserIcon, Users, ShieldCheck } from "lucide-react"
import type { ElementType } from "react"

export type SettingsNavItem = {
  to: string
  icon: ElementType
  label: string
  adminOnly?: boolean
}

export const settingsNav: SettingsNavItem[] = [
  { to: "/app/settings",       icon: UserIcon,    label: "Perfil" },
  { to: "/app/settings/users", icon: Users,       label: "Usuários", adminOnly: true },
  { to: "/app/settings/roles", icon: ShieldCheck, label: "Funções",  adminOnly: true },
]
