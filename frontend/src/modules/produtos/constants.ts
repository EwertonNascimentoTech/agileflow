import type { ProductCriticidade, ProductLifecycle, ProductOrigem, Sustentacao } from "@/api/produtos"

export const ORIGEM_LABEL: Record<ProductOrigem, string> = {
  interno: "Interno", cots: "COTS", customizacao: "Customização", saas: "SaaS",
}
export const LIFECYCLE_LABEL: Record<ProductLifecycle, string> = {
  concepcao: "Concepção", desenvolvimento: "Desenvolvimento", producao: "Produção", descontinuado: "Descontinuado",
}
export const CRITICIDADE_LABEL: Record<ProductCriticidade, string> = {
  baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica",
}
export const CRITICIDADE_COLOR: Record<ProductCriticidade, string> = {
  baixa: "#16A34A", media: "#CA8A04", alta: "#EA580C", critica: "#DC2626",
}
export const SUSTENTACAO_LABEL: Record<Sustentacao, string> = {
  interna: "Interna", externa: "Externa", hibrida: "Híbrida",
}

export const ORIGEM_OPTS: ProductOrigem[] = ["interno", "cots", "customizacao", "saas"]
export const LIFECYCLE_OPTS: ProductLifecycle[] = ["concepcao", "desenvolvimento", "producao", "descontinuado"]
export const CRITICIDADE_OPTS: ProductCriticidade[] = ["baixa", "media", "alta", "critica"]
export const SUSTENTACAO_OPTS: Sustentacao[] = ["interna", "externa", "hibrida"]
