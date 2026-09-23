import { Check, X } from "lucide-react"
import { checkPassword } from "@/lib/passwordSchema"

interface Props {
  password: string
  className?: string
}

export function PasswordChecklist({ password, className }: Props) {
  const { rules } = checkPassword(password)
  return (
    <ul className={`space-y-1 text-[11px] ${className ?? ""}`}>
      {rules.map((r) => (
        <li
          key={r.label}
          className={`flex items-center gap-1.5 ${
            r.passed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          }`}
        >
          {r.passed ? <Check size={12} /> : <X size={12} />}
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  )
}
