import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react"
import type { ReactNode } from "react"
import { authApi } from "@/api/auth"
import type { User, TokenResponse } from "@/types"

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  establishSession: (data: TokenResponse) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadStoredUser(): User | null {
  try {
    const raw = localStorage.getItem("user")
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadStoredUser)
  const [isLoading, setIsLoading] = useState(!!localStorage.getItem("access_token"))

  // Valida o token salvo ao carregar a aplicação
  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (!token) {
      setIsLoading(false)
      return
    }
    authApi
      .me()
      .then((u) => {
        setUser(u)
        localStorage.setItem("user", JSON.stringify(u))
      })
      .catch((error) => {
        // 401 = token inválido → limpa sessão
        // Erro de rede (sem backend) → mantém usuário armazenado
        if (error?.response?.status === 401) {
          localStorage.removeItem("access_token")
          localStorage.removeItem("refresh_token")
          localStorage.removeItem("user")
          setUser(null)
        } else {
          setUser(loadStoredUser())
        }
      })
      .finally(() => setIsLoading(false))
  }, [])

  const establishSession = useCallback((data: TokenResponse) => {
    localStorage.setItem("access_token", data.access_token)
    localStorage.setItem("refresh_token", data.refresh_token)
    localStorage.setItem("user", JSON.stringify(data.user))
    setUser(data.user)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login({ email, password })
    establishSession(data)
  }, [establishSession])

  const logout = useCallback(() => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    localStorage.removeItem("user")
    setUser(null)
  }, [])

  // Memoiza o value para não recriar o objeto a cada render do provider, o que
  // forçaria re-render de toda a árvore que consome o contexto.
  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, isAuthenticated: !!user, login, establishSession, logout }),
    [user, isLoading, login, establishSession, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>

}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider")
  return ctx
}
