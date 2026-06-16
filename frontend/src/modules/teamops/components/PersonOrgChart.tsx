import { Link } from "react-router-dom"
import {
  EMPLOYMENT_TYPE_DOT, EMPLOYMENT_TYPE_LABELS,
  type OrgAreaNode, type OrgTree,
} from "@/api/teamops"

function nodeColors(depth: number): { bg: string; text: string } {
  // Paleta institucional aplicada por nível
  if (depth === 0) {
    // Diretoria — azul brand escuro
    return { bg: "bg-brand-800", text: "text-white" }
  }
  if (depth === 1) {
    // Áreas/Diretorias — verde (ação positiva)
    return { bg: "bg-success", text: "text-success-foreground" }
  }
  if (depth === 2) {
    // Sub-áreas — azul ciano (info)
    return { bg: "bg-info", text: "text-info-foreground" }
  }
  // Níveis mais profundos
  return { bg: "bg-brand-700", text: "text-white" }
}

/** Caixa de uma área: cabeçalho colorido + uma linha por pessoa alocada. */
function AreaCard({ node, depth }: { node: OrgAreaNode; depth: number }) {
  const colors = nodeColors(depth)
  return (
    <div className="inline-block min-w-[220px] max-w-[300px] overflow-hidden rounded-md border shadow-sm">
      <div className={`px-4 py-2 text-center text-sm font-semibold ${colors.bg} ${colors.text}`}>
        {node.area_name}
        <span className="ml-2 text-xs font-normal opacity-80">({node.person_count})</span>
      </div>
      <div className="divide-y bg-card">
        {node.members.length === 0 ? (
          <div className="px-4 py-2 text-center text-xs italic text-muted-foreground">
            Sem pessoas alocadas
          </div>
        ) : (
          node.members.map((member) => (
            <Link
              key={member.person_id}
              to={`/app/modules/teamops/people/${member.person_id}`}
              className="block px-4 py-2 text-center transition hover:bg-muted/50"
            >
              <div className="flex items-center justify-center gap-1.5 text-sm font-medium leading-tight">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${EMPLOYMENT_TYPE_DOT[member.employment_type]}`}
                  title={EMPLOYMENT_TYPE_LABELS[member.employment_type]}
                />
                {member.name}
              </div>
              <div className="mt-0.5 text-xs italic text-muted-foreground">
                {member.position || "Sem cargo"}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

/**
 * Renderiza um nó (área) da árvore com suas sub-áreas.
 * Conectores: linha vertical descendente do card pai, linha horizontal entre irmãos
 * (segmentos por irmão para que primeiro/último não estendam além do limite).
 */
function AreaTree({ node, depth }: { node: OrgAreaNode; depth: number }) {
  return (
    <div className="flex flex-col items-center">
      <AreaCard node={node} depth={depth} />

      {node.children.length > 0 && (
        <>
          {/* Linha vertical descendo do card pai até a horizontal */}
          <div className="h-6 w-px bg-border" />

          <div className="flex items-start">
            {node.children.map((child, i, arr) => {
              const isFirst = i === 0
              const isLast = i === arr.length - 1
              const isOnly = arr.length === 1
              // Posicionamento da barra horizontal por irmão:
              //  - único: nada (só a vertical conta)
              //  - primeiro: do centro até a direita
              //  - último: da esquerda até o centro
              //  - meio: cobre o container inteiro
              const horizontalStyle = isOnly
                ? "hidden"
                : isFirst
                  ? "left-1/2 right-0"
                  : isLast
                    ? "left-0 right-1/2"
                    : "inset-x-0"
              return (
                <div key={child.area_id} className="relative flex flex-col items-center px-4">
                  {/* Barra horizontal (segmento) */}
                  <div className={`absolute top-0 h-px bg-border ${horizontalStyle}`} />
                  {/* Linha vertical subindo do card do filho até a horizontal */}
                  <div className="h-6 w-px bg-border" />
                  <AreaTree node={child} depth={depth + 1} />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export function PersonOrgChart({ tree }: { tree: OrgTree }) {
  if (tree.roots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma área cadastrada. Crie áreas e aloque pessoas para montar o organograma.
      </p>
    )
  }

  return (
    <div className="w-full space-y-3">
      <OrgChartLegend />
      <div className="w-full overflow-x-auto rounded-md border bg-card p-6">
        <div className="inline-flex min-w-full flex-col items-center gap-8 px-4">
          {tree.roots.map((root) => (
            <AreaTree key={root.area_id} node={root} depth={0} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Legenda das cores de vínculo (CLT / PJ / Estágio / Terceiro). */
function OrgChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {(Object.keys(EMPLOYMENT_TYPE_LABELS) as (keyof typeof EMPLOYMENT_TYPE_LABELS)[]).map((type) => (
        <span key={type} className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${EMPLOYMENT_TYPE_DOT[type]}`} />
          {EMPLOYMENT_TYPE_LABELS[type]}
        </span>
      ))}
    </div>
  )
}
