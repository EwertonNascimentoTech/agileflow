import axios from "axios"

import type { IndicadorDetalhe, PlanosEpaResponse } from "@/api/rtd"

const publicApi = axios.create({
  baseURL: "/api/v1/public",
})

export interface PublicRtdView {
  tenant_name: string
  meta: {
    titulo: string
    competencia: string
    status: string
    data_realizacao: string | null
    periodo_inicio: string
    periodo_fim: string
    snapshot_at: string | null
    generated_at: string
  }
  indicadores_detalhe: IndicadorDetalhe[] | null
  planos_estrategicos: PlanosEpaResponse
  planos_taticos: PlanosEpaResponse
}

export const publicRtdApi = {
  view: (token: string) =>
    publicApi.get<PublicRtdView>(`/rtd/${token}`, { timeout: 120_000 }).then((r) => r.data),
}
