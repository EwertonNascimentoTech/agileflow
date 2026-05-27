import { Component, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.props.fallback) return this.props.fallback

    return (
      <div className="flex flex-col items-center justify-center p-12 text-center gap-4">
        <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle size={22} className="text-red-500" />
        </div>
        <div>
          <p className="font-semibold text-sm">Algo deu errado</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            {this.state.error?.message ?? "Erro inesperado na interface."}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => this.setState({ hasError: false, error: null })}
          className="gap-1.5"
        >
          <RefreshCw size={13} /> Tentar novamente
        </Button>
      </div>
    )
  }
}
