import api from "./client"

export type DocsSection = {
  slug: string
  folder: string
  title: string
  description: string
  file_count: number
  available: boolean
}

export type DocsFileMeta = {
  name: string
  title: string
  format: string
  size: number
}

export type DocsDocument = {
  section: string
  name: string
  title: string
  format: string
  content: string
}

export const docsApi = {
  sections: () => api.get<DocsSection[]>("/docs/sections").then((r) => r.data),
  files: (section: string) =>
    api.get<DocsFileMeta[]>(`/docs/${encodeURIComponent(section)}/files`).then((r) => r.data),
  file: (section: string, name: string) =>
    api
      .get<DocsDocument>(`/docs/${encodeURIComponent(section)}/file`, { params: { name } })
      .then((r) => r.data),
}
