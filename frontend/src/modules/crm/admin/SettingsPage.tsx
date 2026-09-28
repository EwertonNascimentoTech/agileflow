import { Link } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Field, Pill, SectionCard } from "@/components/ds"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/UserAvatar"
import { User } from "lucide-react"

export default function SettingsPage() {
  const { user } = useAuth()

  return (
    <div className="max-w-3xl space-y-5">
      <SectionCard
        title="Meu perfil"
        subtitle="Dados da sua conta. Foto, desempenho, competências e ausências ficam no perfil completo."
        icon={User}
        right={
          <Button asChild variant="outline" className="h-9">
            <Link to="/app/perfil">Abrir meu perfil</Link>
          </Button>
        }
      >
        <div className="mb-4 flex items-center gap-3">
          <UserAvatar name={user?.full_name} url={user?.avatar_url} size={48} />
          <p className="font-medium">{user?.full_name}</p>
        </div>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field label="Nome">{user?.full_name}</Field>
          <Field label="E-mail">{user?.email}</Field>
          <Field label="Perfil">
            <Pill tone={user?.role === "company_admin" ? "violet" : "slate"}>
              {user?.role === "company_admin" ? "Admin" : "Usuário"}
            </Pill>
          </Field>
          <Field label="Status">
            <Pill tone="emerald" dot>Ativo</Pill>
          </Field>
        </dl>
      </SectionCard>
    </div>
  )
}
