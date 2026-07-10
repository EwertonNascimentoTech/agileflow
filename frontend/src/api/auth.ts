import api from "./client"
import type { LoginRequest, TokenResponse, User } from "@/types"

export const authApi = {
  login: (data: LoginRequest) =>
    api.post<TokenResponse>("/auth/login", data).then((r) => r.data),

  me: () =>
    api.get<User>("/auth/me").then((r) => r.data),

  forgotPassword: (email: string) =>
    api.post<{ reset_token: string; message: string }>("/auth/forgot-password", { email }).then((r) => r.data),

  resetPassword: (token: string, new_password: string) =>
    api.post<{ message: string }>("/auth/reset-password", { token, new_password }).then((r) => r.data),

  checkFirstAccess: (email: string) =>
    api.post<{
      setup_token: string
      full_name: string
      email: string
      message: string
    }>("/auth/first-access/check", { email }).then((r) => r.data),

  completeFirstAccess: (token: string, password: string) =>
    api.post<TokenResponse>("/auth/first-access/complete", { token, password }).then((r) => r.data),
}
