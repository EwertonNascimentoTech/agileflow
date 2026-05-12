import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Mail, KeyRound } from "lucide-react"
import { authApi } from "@/api/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/lib/toast"

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [step, setStep] = useState<"request" | "reset">("request")
  const [token, setToken] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function requestReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const data = await authApi.forgotPassword(email)
      // Em produção, o token seria enviado por e-mail.
      // Em dev, retornamos o token diretamente.
      setToken(data.reset_token)
      setStep("reset")
      toast.info("Token de recuperação gerado. Em produção será enviado por e-mail.")
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e?.response?.data?.detail ?? "Erro ao solicitar recuperação.")
    } finally {
      setLoading(false)
    }
  }

  async function doReset(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirm) { setError("As senhas não conferem."); return }
    if (newPassword.length < 6) { setError("Senha deve ter no mínimo 6 caracteres."); return }
    setLoading(true)
    setError("")
    try {
      await authApi.resetPassword(token, newPassword)
      toast.success("Senha alterada com sucesso!")
      navigate("/login")
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e?.response?.data?.detail ?? "Token inválido ou expirado.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xl">K</div>
          <h1 className="text-xl font-bold">Kore</h1>
        </div>

        <div className="bg-background rounded-xl border p-6 space-y-4">
          <div>
            <h2 className="font-semibold">
              {step === "request" ? "Recuperar senha" : "Nova senha"}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {step === "request"
                ? "Informe seu e-mail para receber o link de recuperação."
                : "Defina sua nova senha abaixo."}
            </p>
          </div>

          {error && <Alert variant="destructive"><AlertDescription className="text-sm">{error}</AlertDescription></Alert>}

          {step === "request" ? (
            <form onSubmit={requestReset} className="space-y-3">
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    className="pl-9"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Enviando…" : "Solicitar recuperação"}
              </Button>
            </form>
          ) : (
            <form onSubmit={doReset} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nova senha</Label>
                <div className="relative">
                  <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar senha</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repita a senha"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Salvando…" : "Redefinir senha"}
              </Button>
            </form>
          )}

          <button
            onClick={() => navigate("/login")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full justify-center"
          >
            <ArrowLeft size={12} /> Voltar para o login
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} Kore. Todos os direitos reservados.
        </p>
      </div>
    </div>
  )
}
