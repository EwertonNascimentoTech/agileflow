import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Mail, KeyRound, UserCheck } from "lucide-react"
import { authApi } from "@/api/auth"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { checkPassword } from "@/lib/passwordSchema"
import { PasswordChecklist } from "@/components/PasswordChecklist"

type Step = "check" | "password"

function getErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const detail = e.response?.data?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) return detail.map((d) => (d as { msg: string }).msg).join(", ")
  return "Ocorreu um erro. Tente novamente."
}

export default function FirstAccessPage() {
  const navigate = useNavigate()
  const { establishSession } = useAuth()
  const [step, setStep] = useState<Step>("check")
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [token, setToken] = useState("")
  const [password, setPasswordValue] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function checkEmail(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const data = await authApi.checkFirstAccess(email)
      setFullName(data.full_name)
      setToken(data.setup_token)
      setStep("password")
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("As senhas não conferem.")
      return
    }
    if (!checkPassword(password).ok) {
      setError("Senha não atende à política de segurança.")
      return
    }
    setLoading(true)
    setError("")
    try {
      const data = await authApi.completeFirstAccess(token, password)
      establishSession(data)
      const destination = data.user.role === "super_admin" ? "/admin/dashboard" : "/dashboard"
      navigate(destination, { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xl">
            A
          </div>
          <h1 className="text-xl font-bold">AgileFlow</h1>
        </div>

        <div className="bg-background rounded-xl border p-6 space-y-4">
          <div>
            <h2 className="font-semibold">
              {step === "check" ? "Primeiro acesso" : "Defina sua senha"}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {step === "check"
                ? "Informe o e-mail cadastrado pelo administrador para ativar sua conta."
                : `Olá, ${fullName}. Crie uma senha para acessar a plataforma.`}
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}

          {step === "check" ? (
            <form onSubmit={checkEmail} className="space-y-3">
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    autoFocus
                    className="pl-9"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verificando…" : "Continuar"}
              </Button>
            </form>
          ) : (
            <form onSubmit={submitPassword} className="space-y-3">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm flex items-center gap-2">
                <UserCheck size={14} className="text-primary shrink-0" />
                <span className="truncate">{email}</span>
              </div>
              <div className="space-y-1.5">
                <Label>Nova senha</Label>
                <div className="relative">
                  <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPasswordValue(e.target.value)}
                    placeholder="Senha forte"
                    required
                    autoFocus
                    className="pl-9"
                  />
                </div>
                <PasswordChecklist password={password} />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar senha</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repita a senha"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Ativando…" : "Ativar conta e entrar"}
              </Button>
            </form>
          )}

          <button
            onClick={() => (step === "password" ? setStep("check") : navigate("/login"))}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full justify-center"
          >
            <ArrowLeft size={12} />
            {step === "password" ? "Voltar" : "Voltar para o login"}
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} AgileFlow. Todos os direitos reservados.
        </p>
      </div>
    </div>
  )
}
