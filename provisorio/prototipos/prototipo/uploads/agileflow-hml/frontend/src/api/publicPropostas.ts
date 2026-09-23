import axios from "axios"

// Cliente sem auth — apenas pra rotas públicas
const publicApi = axios.create({
  baseURL: "/api/v1/public",
})

export interface PublicProposalView {
  number: string
  version: number
  title: string
  description: string | null
  status: string
  client_name: string | null
  client_document: string | null
  total_value: number
  discount: number
  payment_terms: string | null
  delivery_terms: string | null
  notes: string | null
  valid_until: string | null
  sent_at: string | null
  accepted_at: string | null
  rejected_at: string | null
  items: Array<{
    description: string
    quantity: number
    unit: string | null
    unit_price: number
    total: number
  }>
  created_at: string
  tenant_name: string
}

export interface PublicAcceptance {
  accepter_name: string
  accepter_email?: string
  accepter_document?: string
  notes?: string
}

export const publicProposalsApi = {
  view: (token: string) =>
    publicApi.get<PublicProposalView>(`/propostas/${token}`).then(r => r.data),
  accept: (token: string, data: PublicAcceptance) =>
    publicApi.post<{ ok: boolean; message: string }>(`/propostas/${token}/accept`, data).then(r => r.data),
  reject: (token: string, data: PublicAcceptance) =>
    publicApi.post<{ ok: boolean; message: string }>(`/propostas/${token}/reject`, data).then(r => r.data),
}
