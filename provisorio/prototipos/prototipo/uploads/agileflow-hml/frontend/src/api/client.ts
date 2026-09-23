import axios from "axios"

const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
})

// Injeta o token em toda requisição
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let _refreshing = false
let _refreshQueue: Array<(token: string) => void> = []

// Refresh token automático ao receber 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      const refreshToken = localStorage.getItem("refresh_token")
      if (!refreshToken) {
        _logout()
        return Promise.reject(error)
      }

      if (_refreshing) {
        return new Promise((resolve) => {
          _refreshQueue.push((token) => {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          })
        })
      }

      original._retry = true
      _refreshing = true

      try {
        const { data } = await axios.post("/api/v1/auth/refresh", {
          refresh_token: refreshToken,
        })
        const newToken = data.access_token
        localStorage.setItem("access_token", newToken)
        localStorage.setItem("refresh_token", data.refresh_token)
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`
        _refreshQueue.forEach((cb) => cb(newToken))
        _refreshQueue = []
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch {
        _logout()
        return Promise.reject(error)
      } finally {
        _refreshing = false
      }
    }

    return Promise.reject(error)
  }
)

function _logout() {
  localStorage.removeItem("access_token")
  localStorage.removeItem("refresh_token")
  localStorage.removeItem("user")
  window.location.href = "/login"
}

export default api
