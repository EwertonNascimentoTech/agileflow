import api from "./client"
import type { LoginRequest, TokenResponse, User } from "@/types"

export const authApi = {
  login: (data: LoginRequest) =>
    api.post<TokenResponse>("/auth/login", data).then((r) => r.data),

  me: () =>
    api.get<User>("/auth/me").then((r) => r.data),
  /** Foto do perfil: o front manda a imagem já recortada (quadrada, sem EXIF). */
  uploadAvatar: (file: Blob) => {
    const fd = new FormData()
    fd.append("file", file, "avatar.jpg")
    return api.post<{ avatar_url: string | null }>("/auth/me/avatar", fd).then((r) => r.data)
  },
  deleteAvatar: () => api.delete<void>("/auth/me/avatar").then((r) => r.data),

  forgotPassword: (email: string) =>
    api.post<{ reset_token: string; message: string }>("/auth/forgot-password", { email }).then((r) => r.data),

  resetPassword: (token: string, new_password: string) =>
    api.post<{ message: string }>("/auth/reset-password", { token, new_password }).then((r) => r.data),

  /** Só confirma que o e-mail pode fazer o primeiro acesso — o token vem no link enviado
   *  por quem cadastrou a pessoa. */
  checkFirstAccess: (email: string) =>
    api.post<{ eligible: boolean; message: string }>("/auth/first-access/check", { email }).then((r) => r.data),
  inspectFirstAccess: (token: string) =>
    api.get<{ full_name: string; email: string }>("/auth/first-access/inspect", { params: { token } }).then((r) => r.data),
  completeFirstAccess: (token: string, password: string) =>
    api.post<TokenResponse>("/auth/first-access/complete", { token, password }).then((r) => r.data),
}
