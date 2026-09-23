import { Link } from "react-router-dom"
import type { OrgNode, OrgTree } from "@/api/teamops"

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

function NodeCard({ node, depth }: { node: OrgNode; depth: number }) {
  const colors = nodeColors(depth)
  const cargo = node.person.position?.name ?? "Sem cargo"
  return (
    <Link
      to={`/app/modules/teamops/people/${node.person.id}`}
      className={`relative inline-block min-w-[200px] max-w-[260px] rounded-md px-4 py-3 text-center shadow-sm transition hover:shadow-md hover:opacity-95 ${colors.bg} ${colors.text}`}
    >
      <div className="text-sm font-semibold leading-tight">{node.person.full_name}</div>
      <div className="mt-1 text-xs italic opacity-95">{cargo}</div>
      {node.area_name && (
        <div className="mt-1 text-[10px] uppercase tracking-wide opacity-75">
          {node.area_name}
        </div>
      )}
    </Link>
  )
}

/**
 * Renderiza um nó da árvore com seus filhos.
 * Conectores: linha vertical descendente do card pai, linha horizontal entre irmãos
 * (segmentos por irmão para que primeiro/último não estendam além do limite).
 */
function NodeTree({ node, depth }: { node: OrgNode; depth: number }) {
  return (
    <div className="flex flex-col items-center">
      <NodeCard node={node} depth={depth} />

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
                <div key={child.person.id} className="relative flex flex-col items-center px-4">
                  {/* Barra horizontal (segmento) */}
                  <div className={`absolute top-0 h-px bg-border ${horizontalStyle}`} />
                  {/* Linha vertical subindo do card do filho até a horizontal */}
                  <div className="h-6 w-px bg-border" />
                  <NodeTree node={child} depth={depth + 1} />
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
  if (tree.roots.length === 0 && tree.orphans.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma pessoa cadastrada. Comece criando o gerente e os coordenadores.
      </p>
    )
  }

  return (
    <div className="w-full overflow-x-auto rounded-md border bg-card p-6">
      <div className="inline-flex min-w-full flex-col items-center gap-8 px-4">
        {tree.roots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum gerente ou coordenador cadastrado. Cadastre alguém com cargo "Gerente"
            ou "Coordenador" para iniciar a árvore.
          </p>
        ) : (
          tree.roots.map((root) => <NodeTree key={root.person.id} node={root} depth={0} />)
        )}

        {tree.orphans.length > 0 && (
          <div className="w-full border-t pt-6">
            <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
              Pessoas sem vínculo hierárquico ({tree.orphans.length})
            </p>
            <div className="flex flex-wrap gap-4">
              {tree.orphans.map((o) => (
                <NodeTree key={o.person.id} node={o} depth={1} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
