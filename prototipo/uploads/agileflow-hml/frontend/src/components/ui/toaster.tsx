/**
 * Toast system — wrapper sobre @radix-ui/react-toast.
 * Use: import { toast } from "@/lib/toast"
 */
import * as ToastPrimitive from "@radix-ui/react-toast"
import { cn } from "@/lib/utils"

export function Toaster() {
  return (
    <ToastPrimitive.Provider swipeDirection="right">
      <ToastPrimitive.Viewport
        className={cn(
          "fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]"
        )}
      />
    </ToastPrimitive.Provider>
  )
}
