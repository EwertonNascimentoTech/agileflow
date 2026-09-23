import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ssoHandleCallback } from "@/lib/sso"

/** Retorno do IDigital: troca o login do IdP pela sessão AgileFlow e segue para a área do usuário. */
export default function SsoCallbackPage() {
  const { establishSession } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false) // o code/state só pode ser trocado uma vez

  useEffect(() => {
    if (started.current) return
    started.current = true
    ssoHandleCallback()
      .then((data) => {
        establishSession(data)
        const u = data.user
        navigate(u.role === "super_admin" ? "/admin/dashboard" : u.is_client ? "/portal" : "/dashboard", { replace: true })
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Não foi possível entrar com o IDigital."))
  }, [establishSession, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">A</span>
          <span className="text-xl font-bold tracking-tight">AgileFlow</span>
        </div>
        {error ? (
          <div className="space-y-4 text-left">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button asChild className="w-full justify-center">
              <Link to="/login" replace>
                Voltar ao login
              </Link>
            </Button>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Concluindo o login com o IDigital…
          </p>
        )}
      </div>
    </div>
  )
}
