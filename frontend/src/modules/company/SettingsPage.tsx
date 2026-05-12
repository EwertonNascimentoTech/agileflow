import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { User, Building2 } from "lucide-react"

export default function SettingsPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Informações da sua conta.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User size={16} /> Meu perfil
          </CardTitle>
          <CardDescription>Dados da sua conta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Nome</p>
              <p className="font-medium">{user?.full_name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">E-mail</p>
              <p className="font-medium">{user?.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Perfil</p>
              <Badge variant="secondary" className="text-xs">
                {user?.role === "company_admin" ? "Admin" : "Usuário"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Status</p>
              <Badge variant="success" className="text-xs">Ativo</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 size={16} /> Empresa
          </CardTitle>
          <CardDescription>Informações do seu tenant.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>ID do tenant: <span className="font-mono text-xs">{user?.tenant_id ?? "—"}</span></p>
        </CardContent>
      </Card>
    </div>
  )
}
