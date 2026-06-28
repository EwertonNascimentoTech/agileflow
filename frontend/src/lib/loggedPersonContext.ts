import { teamopsApi } from "@/api/teamops"
import type { DefaultSelectOption } from "@/modules/projetos/defaultFormOptions"

export interface LoggedPersonAutoFill {
  personId: string
  userName: string
  userArea: string | null
}

export function matchAreaToSelectValue(
  areaName: string | null | undefined,
  options: DefaultSelectOption[],
): string | null {
  if (!areaName?.trim()) return null
  const hit = options.find((o) => o.value === areaName || o.label === areaName)
  return hit?.value ?? areaName.trim()
}

/** Carrega nome e área da pessoa vinculada ao login (TeamOps). */
export async function loadLoggedPersonAutoFill(
  areaOptions: DefaultSelectOption[] = [],
): Promise<LoggedPersonAutoFill | null> {
  try {
    const me = await teamopsApi.getMyPerson()
    const areaName = me.areas?.[0]?.name ?? me.area?.name ?? null
    return {
      personId: me.id,
      userName: me.full_name,
      userArea: matchAreaToSelectValue(areaName, areaOptions),
    }
  } catch {
    return null
  }
}
