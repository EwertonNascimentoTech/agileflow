import { useEffect, useState } from "react"
import { projetosApi, type ProjectDefaultFormField } from "@/api/projetos"
import { FALLBACK_DEFAULT_FORM_FIELDS, sortDefaultFormFields } from "@/modules/projetos/defaultFormUtils"

let cache: ProjectDefaultFormField[] | null = null

export function invalidateDefaultFormCache() {
  cache = null
}

export function useDefaultFormConfig() {
  const [fields, setFields] = useState<ProjectDefaultFormField[]>(cache ?? FALLBACK_DEFAULT_FORM_FIELDS)
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    let cancelled = false
    projetosApi.getDefaultFormFields()
      .then((rows) => {
        if (cancelled) return
        const sorted = sortDefaultFormFields(rows)
        cache = sorted
        setFields(sorted)
      })
      .catch(() => {
        if (!cancelled) setFields(FALLBACK_DEFAULT_FORM_FIELDS)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return { fields, loading }
}
