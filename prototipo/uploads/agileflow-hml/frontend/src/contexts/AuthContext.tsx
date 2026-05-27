import { createContext, useContext, useState, useEffect, useCallback } from "react"
import type { ReactNode } from "react"
import { authApi } from "@/api/auth"
import type { User } from "@/types"

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
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

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login({ email, password })
    localStorage.setItem("access_token", data.access_token)
    localStorage.setItem("refresh_token", data.refresh_token)
    localStorage.setItem("user", JSON.stringify(data.user))
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    localStorage.removeItem("user")
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider")
  return ctx
}
