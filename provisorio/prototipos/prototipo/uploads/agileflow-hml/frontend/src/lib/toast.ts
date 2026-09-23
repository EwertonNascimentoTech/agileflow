/**
 * Lightweight toast imperativo usando eventos customizados.
 * Evita instalar sonner — usa o Radix Toast já instalado via evento.
 */

export type ToastType = "success" | "error" | "info" | "warning"

export interface ToastEvent {
  id: string
  message: string
  type: ToastType
  duration?: number
}

const TOAST_EVENT = "kore:toast"

export const toast = {
  success: (message: string, duration = 4000) => _emit("success", message, duration),
  error: (message: string, duration = 6000) => _emit("error", message, duration),
  info: (message: string, duration = 4000) => _emit("info", message, duration),
  warning: (message: string, duration = 5000) => _emit("warning", message, duration),
}

function _emit(type: ToastType, message: string, duration: number) {
  const event = new CustomEvent<ToastEvent>(TOAST_EVENT, {
    detail: { id: crypto.randomUUID(), message, type, duration },
  })
  window.dispatchEvent(event)
}

export { TOAST_EVENT }
