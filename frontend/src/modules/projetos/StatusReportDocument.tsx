import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import type {
  StatusReportSnapshot,
  StatusReportProject,
  StatusReportRisk,
  StatusReportCustomSection,
  StatusReportScheduleItem,
} from "@/api/projetos"

/**
 * Renderiza o Status Report no layout institucional FIEA a partir de um snapshot.
 * `editable` liga a edição dos campos de narrativa (objetivo, resumo executivo, decisões,
 * ação dos riscos, plano 30/60/90); em modo leitura tudo fica estático. O CSS é embutido e
 * escopado em `.sr-doc` (+ `@media print`), seguindo o padrão de impressão das propostas.
 */

const HEALTH_LABEL: Record<string, string> = { verde: "No prazo", amarelo: "Atenção", vermelho: "Risco" }

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—"
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function statusBadge(p: StatusReportProject): { cls: string; label: string } {
  if (p.progress_pct >= 100 || (p.subtree_total > 0 && p.subtree_completed === p.subtree_total)) {
    return { cls: "concluido", label: "Concluído" }
  }
  if (p.progress_pct === 0) return { cls: "planejamento", label: "Planejado" }
  return { cls: "execucao", label: "Em execução" }
}

/** Bloco "Dados da Solicitação" — campos personalizados da demanda, minimizável. */
function RequestBlock({ sections }: { sections: StatusReportCustomSection[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="sr-request">
      <div className="sr-request-head">
        <span>Detalhes do Projeto</span>
        <button
          type="button"
          className="sr-request-toggle no-print"
          onClick={() => setOpen((o) => !o)}
          title={open ? "Minimizar" : "Maximizar"}
          aria-expanded={open}
        >
          <ChevronDown className={`sr-chevron${open ? " up" : ""}`} size={16} />
        </button>
      </div>
      <div className={`sr-request-body${open ? "" : " collapsed"}`}>
        {sections.map((sec, si) => (
          <div key={si} className="sr-panel">
            <h3>{sec.title}</h3>
            <div className="sr-request-grid">
              {sec.fields.map((f, fi) => (
                <div key={fi} className={`sr-field${f.field_type === "text_long" ? " full" : ""}`}>
                  <small>{f.label}</small>
                  {f.field_type === "url" ? (
                    <a className="sr-field-val sr-link" href={f.value} target="_blank" rel="noreferrer">{f.value}</a>
                  ) : (
                    <div className="sr-field-val">{f.value}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Tabela do cronograma com Features (nível 0) recolhíveis — começam minimizadas. */
function CronogramaTable({ items }: { items: StatusReportScheduleItem[] }) {
  const lvl = (c: StatusReportScheduleItem) => c.level ?? 0
  // Índice da Feature (nível 0) "dona" de cada linha + features que têm filhos.
  const ownerOf: number[] = []
  let cur = -1
  items.forEach((c, i) => { if (lvl(c) === 0) cur = i; ownerOf[i] = cur })
  const hasChildren = (i: number) => i + 1 < items.length && lvl(items[i + 1]) > 0
  // Começa tudo minimizado (todas as features com filhos colapsadas).
  const [collapsed, setCollapsed] = useState<Set<number>>(
    () => new Set(items.map((c, i) => (lvl(c) === 0 && hasChildren(i) ? i : -1)).filter((i) => i >= 0)),
  )
  const toggle = (i: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  return (
    <table>
      <thead><tr><th>Atividade</th><th>Status</th><th>Execução</th><th>Planejado</th><th>Finalizado</th></tr></thead>
      <tbody>
        {items.length === 0 && <tr><td colSpan={5} className="sr-td-empty">Sem atividades no cronograma.</td></tr>}
        {items.map((c, i) => {
          const level = lvl(c)
          const isFeature = level === 0
          const canToggle = isFeature && hasChildren(i)
          const isCollapsed = collapsed.has(i)
          const hidden = level > 0 && ownerOf[i] >= 0 && collapsed.has(ownerOf[i])
          return (
            <tr key={i} className={`${c.open ? "sr-row-open " : ""}${hidden ? "sr-row-hidden" : ""}`.trim()}>
              <td style={{ paddingLeft: 14 + level * 18 }}>
                <span className={isFeature ? "sr-cron-parent" : "sr-cron-child"}>
                  {canToggle && (
                    <button type="button" className="sr-cron-toggle no-print" onClick={() => toggle(i)}
                      title={isCollapsed ? "Expandir" : "Recolher"} aria-expanded={!isCollapsed}>
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                  {level > 0 && <span className="sr-cron-tree">└ </span>}
                  {c.title}
                </span>
              </td>
              <td>
                {c.status || "—"}
                {c.kanban && <span className="sr-cron-kanban">{c.kanban}</span>}
              </td>
              <td>
                <div className="sr-cron-pct">
                  <div className="sr-cron-bar"><span className={c.percent >= 100 ? "done" : ""} style={{ width: `${c.percent}%` }} /></div>
                  <span className="sr-cron-num">{c.percent}%</span>
                </div>
              </td>
              <td>{fmtDate(c.planned_date)}</td>
              <td>{c.completed_at ? <span className="sr-mini-status done"><span>{fmtDate(c.completed_at)}</span></span> : "—"}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function StatusReportDocument({
  snapshot,
  editable = false,
  onChange,
}: {
  snapshot: StatusReportSnapshot
  editable?: boolean
  onChange?: (next: StatusReportSnapshot) => void
}) {
  const [tab, setTab] = useState<string>("visao-geral")
  const { meta, kpis, projects, plano } = snapshot

  const recorte = [meta.diretoria_label, meta.area_label].filter(Boolean).join(" · ") || "Todas as diretorias / áreas"

  function updateProject(taskId: string, patch: Partial<StatusReportProject>) {
    if (!onChange) return
    onChange({ ...snapshot, projects: projects.map((p) => (p.task_id === taskId ? { ...p, ...patch } : p)) })
  }
  function updatePlano(key: "d30" | "d60" | "d90", value: string) {
    if (!onChange) return
    onChange({ ...snapshot, plano: { ...plano, [key]: value } })
  }

  return (
    <div className="sr-doc">
      <style>{CSS}</style>

      {/* HERO */}
      <section className="sr-hero">
        <div className="sr-hero-top">
          <div className="sr-brand">
            <span className="sr-brand-sistema">Sistema</span>
            <span className="sr-brand-fiea">FIEA</span>
            <span className="sr-brand-entidades">SESI&nbsp;|&nbsp;SENAI&nbsp;|&nbsp;IEL</span>
          </div>
        </div>
        <div className="sr-hero-main">
          <h1>
            <span className="t-cyan">Status Report</span>
            <span className="t-navy">Projetos de TI</span>
          </h1>
          <div className="sr-hero-tag">{recorte}</div>
        </div>
        <div className="sr-hero-foot">
          <div className="foot-block">
            <small>Recorte</small>
            <strong>{recorte}</strong>
          </div>
          <div className="foot-block">
            <small>Gerado em</small>
            <strong>{fmtDate(meta.generated_at)}</strong>
          </div>
        </div>
      </section>

      {/* NAV (some na impressão) */}
      <nav className="sr-tab-nav no-print">
        <button className={`sr-tab-btn${tab === "visao-geral" ? " active" : ""}`} onClick={() => setTab("visao-geral")}>
          <span>Visão Geral</span>
        </button>
        {projects.map((p) => (
          <button key={p.task_id} className={`sr-tab-btn${tab === p.task_id ? " active" : ""}`} onClick={() => setTab(p.task_id)}>
            <span>{p.title}</span>
          </button>
        ))}
      </nav>

      {/* VISÃO GERAL */}
      <div className={`sr-tab-content${tab === "visao-geral" ? " active" : ""}`}>
        <section className="sr-summary-grid">
          <article className="sr-kpi">
            <span className="sr-label-caps">Total de projetos</span>
            <strong>{kpis.total}</strong>
            <span>Projetos/programas acompanhados neste recorte.</span>
          </article>
          <article className="sr-kpi">
            <span className="sr-label-caps">Concluído</span>
            <strong>{kpis.concluido}</strong>
            <span>Com 100% das etapas finalizadas.</span>
          </article>
          <article className="sr-kpi">
            <span className="sr-label-caps">Planejados (0%)</span>
            <strong>{kpis.planejado}</strong>
            <span>Aguardando início/priorização.</span>
          </article>
          <article className="sr-kpi">
            <span className="sr-label-caps">Sem data prevista</span>
            <strong>{kpis.sem_data}</strong>
            <span>Sem prazo definido.</span>
          </article>
        </section>

        <section className="sr-section-block">
          <div className="sr-section-header">
            <h2>Resumo executivo por projeto</h2>
            <p>Visão de um relance — detalhes em cada aba.</p>
          </div>
          <div className="sr-exec-grid">
            {projects.map((p) => {
              const sb = statusBadge(p)
              return (
                <article key={p.task_id} className={`sr-exec-card ${p.health}`}>
                  <div className="sr-exec-head">
                    <h3>{p.title}</h3>
                    <span className={`sr-badge ${sb.cls}`}><span>{sb.label}</span></span>
                  </div>
                  {p.description && <p className="sr-exec-desc">{p.description}</p>}
                  <div className="sr-exec-progress">
                    <div className="progress-head"><span>Progresso</span><span>{p.progress_pct}%</span></div>
                    <div className="sr-progress"><span className={p.progress_pct >= 100 ? "done" : ""} style={{ width: `${p.progress_pct}%` }} /></div>
                  </div>
                  <div className="sr-exec-facts">
                    <div className="sr-exec-fact"><small>Próximo marco</small><strong>{fmtDate(p.next_due_date)}</strong></div>
                    <div className="sr-exec-fact"><small>Saúde</small><strong>{HEALTH_LABEL[p.health] ?? p.health}</strong></div>
                  </div>
                  <div className="sr-exec-footer no-print">
                    <button className="sr-exec-link" onClick={() => setTab(p.task_id)}>Ver detalhes do projeto</button>
                  </div>
                </article>
              )
            })}
            {projects.length === 0 && (
              <p className="sr-empty">Nenhum projeto/programa encontrado para este recorte.</p>
            )}
          </div>
        </section>

        {/* Plano 30/60/90 (narrativa editável) */}
        <section className="sr-section-block">
          <div className="sr-section-header">
            <h2>Plano 30 / 60 / 90 dias</h2>
            <p>Condução sugerida para os próximos ciclos.</p>
          </div>
          <div className="sr-timeline">
            {([["d30", "Próximos 30 dias"], ["d60", "Próximos 60 dias"], ["d90", "Próximos 90 dias"]] as const).map(([key, label]) => (
              <article key={key} className="sr-timeline-item">
                <small>{label}</small>
                {editable ? (
                  <textarea
                    className="sr-input"
                    rows={4}
                    placeholder="Descreva o foco deste ciclo…"
                    value={plano?.[key] ?? ""}
                    onChange={(e) => updatePlano(key, e.target.value)}
                  />
                ) : (
                  <p>{plano?.[key] || "—"}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>

      {/* ABAS POR PROJETO */}
      {projects.map((p) => (
        <div key={p.task_id} className={`sr-tab-content${tab === p.task_id ? " active" : ""}`} data-project>
          <section className="sr-project-card">
            <div className="sr-project-top">
              <div className="sr-project-title">
                <h2>{p.title}</h2>
                {p.description && <p>{p.description}</p>}
              </div>
              <div className="sr-status-stack">
                <span className={`sr-badge ${statusBadge(p).cls}`}><span>{statusBadge(p).label}</span></span>
                <span className={`sr-badge ${p.health === "vermelho" ? "atencao" : p.health === "amarelo" ? "atencao" : "concluido"}`}>
                  <span>{HEALTH_LABEL[p.health] ?? p.health}</span>
                </span>
              </div>
            </div>

            {(p.custom_sections?.length ?? 0) > 0 && <RequestBlock sections={p.custom_sections} />}

            <div className="sr-project-body">
              <div>
                <div className="sr-info-grid">
                  <div className="sr-info-box"><small>Fase atual</small><strong>{p.fase || "—"}</strong></div>
                  <div className="sr-info-box"><small>Próximo marco</small><strong>{fmtDate(p.next_due_date)}</strong></div>
                  <div className="sr-info-box"><small>Responsável</small><strong>{p.responsavel || "—"}</strong></div>
                </div>

                <div className="sr-progress-wrap">
                  <div className="progress-head"><span>Progresso</span><span>{p.progress_pct}%</span></div>
                  <div className="sr-progress"><span className={p.progress_pct >= 100 ? "done" : ""} style={{ width: `${p.progress_pct}%` }} /></div>
                </div>

                {(p.open_stages?.length ?? 0) > 0 && (
                  <div className="sr-openstages">
                    <div className="sr-openstages-head">⚠ Cards em aberto ({p.open_stages.length}) — impedem a conclusão</div>
                    <ul>
                      {p.open_stages.map((o, i) => (
                        <li key={i}>
                          <span className="sr-os-title">{o.title}{o.is_root && <span className="sr-os-tag">projeto</span>}</span>
                          <span className="sr-os-meta">{o.kanban || "—"} · <strong>{o.stage || "—"}</strong></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="sr-executive-note">
                  <strong>Resumo executivo</strong>
                  {editable ? (
                    <textarea className="sr-input" rows={4} placeholder="Resumo executivo do projeto…"
                      value={p.resumo_executivo} onChange={(e) => updateProject(p.task_id, { resumo_executivo: e.target.value })} />
                  ) : (
                    <p>{p.resumo_executivo || "—"}</p>
                  )}
                </div>

                <div className="sr-panel">
                  <h3>Riscos e decisões necessárias</h3>
                  <table>
                    <thead><tr><th>Ponto</th><th>Impacto</th><th>Ação</th>{editable && <th aria-label="Remover" style={{ width: 36 }}></th>}</tr></thead>
                    <tbody>
                      {!editable && p.riscos.length === 0 && <tr><td colSpan={3} className="sr-td-empty">Nenhum risco sinalizado.</td></tr>}
                      {p.riscos.map((r: StatusReportRisk, i) => {
                        const setRisco = (patch: Partial<StatusReportRisk>) =>
                          updateProject(p.task_id, { riscos: p.riscos.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
                        if (!editable) {
                          return <tr key={i}><td>{r.ponto}</td><td>{r.impacto}</td><td>{r.acao || "—"}</td></tr>
                        }
                        return (
                          <tr key={i}>
                            <td><input className="sr-input" placeholder="Ponto de risco/decisão…" value={r.ponto}
                              onChange={(e) => setRisco({ ponto: e.target.value })} /></td>
                            <td>
                              <select className="sr-input" value={["Alto", "Médio", "Baixo"].includes(r.impacto) ? r.impacto : "Médio"}
                                onChange={(e) => setRisco({ impacto: e.target.value })}>
                                <option value="Alto">Alto</option>
                                <option value="Médio">Médio</option>
                                <option value="Baixo">Baixo</option>
                              </select>
                            </td>
                            <td><input className="sr-input" placeholder="Ação…" value={r.acao}
                              onChange={(e) => setRisco({ acao: e.target.value })} /></td>
                            <td>
                              <button type="button" className="sr-row-del" title="Remover"
                                onClick={() => updateProject(p.task_id, { riscos: p.riscos.filter((_, j) => j !== i) })}>×</button>
                            </td>
                          </tr>
                        )
                      })}
                      {editable && (
                        <tr>
                          <td colSpan={4}>
                            <button type="button" className="sr-add-btn"
                              onClick={() => updateProject(p.task_id, { riscos: [...p.riscos, { ponto: "", impacto: "Médio", acao: "" }] })}>
                              + Adicionar risco/decisão
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="sr-panel">
                  <h3>Decisões necessárias</h3>
                  <div className="sr-panel-body">
                    {editable ? (
                      <textarea className="sr-input" rows={3} placeholder="Uma decisão por linha…"
                        value={p.decisoes.join("\n")}
                        onChange={(e) => updateProject(p.task_id, { decisoes: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
                    ) : p.decisoes.length ? (
                      <ul className="sr-decisoes">{p.decisoes.map((d, i) => <li key={i}>{d}</li>)}</ul>
                    ) : (
                      <p className="sr-muted">—</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="sr-panel">
                  <h3>Cronograma do Projeto</h3>
                  <CronogramaTable items={p.cronograma ?? []} />
                </div>
              </div>
            </div>
          </section>
        </div>
      ))}
    </div>
  )
}

const CSS = `
.sr-doc { --navy:#1b3a8f; --navy-dark:#142d73; --cyan:#00a3e0; --cyan-soft:#e3f4fc; --navy-soft:#e8edf9;
  --ink:#1c2433; --muted:#5c6675; --border:#d9dee6; --surface:#fff; --surface-soft:#f5f6f8;
  --green:#1e8e3e; --green-bg:#e9f5ec; --amber:#9a6a00; --amber-bg:#fdf3da; --red:#b42323; --red-bg:#fdeaea;
  --gray-bg:#e9ecf1; --radius:10px; --shadow:0 6px 22px rgba(20,45,115,.08);
  color:var(--ink); font-family:"Segoe UI","Trebuchet MS",Tahoma,Arial,sans-serif; }
.sr-doc * { box-sizing:border-box; }
.sr-label-caps { text-transform:uppercase; letter-spacing:.08em; font-weight:700; font-size:11px; color:var(--muted); }

.sr-hero { background:linear-gradient(180deg,#f4f5f6 0%,#ebedef 100%); border:1px solid #e2e5ea; border-radius:14px;
  overflow:hidden; margin-bottom:20px; box-shadow:var(--shadow); }
.sr-hero-top { padding:22px 30px 0; }
.sr-brand { display:inline-block; color:var(--navy); line-height:1.05; }
.sr-brand-sistema { display:block; font-size:12px; font-weight:700; font-style:italic; }
.sr-brand-fiea { display:block; font-size:28px; font-weight:900; font-style:italic; letter-spacing:-.02em; }
.sr-brand-entidades { display:block; font-size:9px; font-weight:800; letter-spacing:.22em; margin-top:1px; }
.sr-hero-main { padding:18px 30px 0; }
.sr-hero-main h1 { margin:0; font-style:italic; font-weight:900; text-transform:uppercase; letter-spacing:-.015em; line-height:.98; font-size:clamp(28px,4vw,48px); }
.sr-hero-main h1 .t-cyan { display:block; color:var(--cyan); }
.sr-hero-main h1 .t-navy { display:block; color:var(--navy); }
.sr-hero-tag { margin-top:10px; color:var(--cyan); text-transform:uppercase; letter-spacing:.1em; font-weight:600; font-size:13px; }
.sr-hero-foot { padding:18px 30px 22px; display:flex; gap:40px; flex-wrap:wrap; }
.sr-hero-foot .foot-block small { display:block; color:var(--muted); font-size:12px; margin-bottom:2px; }
.sr-hero-foot .foot-block strong { display:block; color:var(--navy); text-transform:uppercase; font-weight:800; font-size:13.5px; }

.sr-tab-nav { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 20px; }
.sr-tab-btn { appearance:none; border:1px solid var(--border); cursor:pointer; font-family:inherit; padding:10px 16px;
  background:#fff; color:var(--navy); border-radius:4px; font-weight:800; font-style:italic; text-transform:uppercase;
  font-size:12px; letter-spacing:.03em; transform:skewX(-12deg); transition:.18s ease; }
.sr-tab-btn > span { display:inline-block; transform:skewX(12deg); }
.sr-tab-btn:hover { border-color:var(--cyan); color:var(--cyan); }
.sr-tab-btn.active { background:var(--navy); border-color:var(--navy); color:#fff; box-shadow:0 4px 12px rgba(27,58,143,.28); }

.sr-tab-content { display:none; }
.sr-tab-content.active { display:block; }

.sr-summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px; }
.sr-kpi { background:var(--surface); border:1px solid var(--border); border-top:4px solid var(--cyan); border-radius:var(--radius); padding:16px 18px; box-shadow:var(--shadow); }
.sr-kpi:first-child { border-top-color:var(--navy); }
.sr-kpi strong { display:block; margin-top:8px; font-size:34px; color:var(--navy); font-style:italic; font-weight:900; letter-spacing:-.03em; line-height:1; }
.sr-kpi span { display:block; margin-top:6px; color:var(--muted); font-size:12.5px; line-height:1.45; }

.sr-section-block { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:22px 24px; box-shadow:var(--shadow); margin-bottom:20px; }
.sr-section-header { display:flex; align-items:baseline; justify-content:space-between; gap:18px; margin-bottom:16px; }
.sr-section-header h2 { margin:0; font-size:18px; color:var(--navy); font-style:italic; font-weight:900; text-transform:uppercase; display:flex; align-items:center; gap:10px; }
.sr-section-header h2::before { content:""; width:14px; height:20px; background:var(--cyan); transform:skewX(-20deg); border-radius:2px; flex:0 0 auto; }
.sr-section-header p { margin:0; color:var(--muted); font-size:13px; }

.sr-exec-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }
.sr-exec-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow); overflow:hidden; display:flex; flex-direction:column; }
.sr-exec-card::before { content:""; display:block; height:5px; background:linear-gradient(100deg,var(--navy) 0%,var(--navy) 38%,var(--cyan) 70%,#8fd3f0 100%); }
.sr-exec-card.verde::before { background:linear-gradient(100deg,var(--green) 0%,#4caf6d 60%,#a7dcb8 100%); }
.sr-exec-card.vermelho::before { background:linear-gradient(100deg,var(--red) 0%,#d05a5a 60%,#f1bcbc 100%); }
.sr-exec-card.amarelo::before { background:linear-gradient(100deg,var(--amber) 0%,#d3a64a 60%,#f0dca7 100%); }
.sr-exec-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding:16px 18px 10px; }
.sr-exec-head h3 { margin:0; font-size:16.5px; color:var(--navy); font-style:italic; font-weight:900; text-transform:uppercase; line-height:1.15; }
.sr-exec-desc { padding:0 18px; margin:0 0 12px; color:var(--muted); font-size:12.5px; line-height:1.5; }
.sr-exec-progress { padding:0 18px; margin-bottom:12px; }
.sr-exec-progress .progress-head, .sr-progress-wrap .progress-head { display:flex; justify-content:space-between; margin-bottom:6px; font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--navy); }
.sr-exec-facts { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--border); border-top:1px solid var(--border); margin-top:auto; }
.sr-exec-fact { background:var(--surface-soft); padding:11px 18px; }
.sr-exec-fact small { display:block; color:var(--muted); font-size:9.5px; text-transform:uppercase; font-weight:800; letter-spacing:.07em; margin-bottom:4px; }
.sr-exec-fact strong { font-size:12.5px; color:#2a3344; font-weight:700; }
.sr-exec-footer { border-top:1px solid var(--border); padding:10px 18px; display:flex; justify-content:flex-end; background:#fbfcfd; }
.sr-exec-link { appearance:none; border:0; background:none; cursor:pointer; color:var(--cyan); font-weight:800; font-style:italic; text-transform:uppercase; font-size:11.5px; letter-spacing:.04em; }
.sr-exec-link:hover { color:var(--navy); text-decoration:underline; }

.sr-progress { height:10px; overflow:hidden; background:#dfe4eb; border-radius:3px; }
.sr-progress span { display:block; height:100%; background:linear-gradient(90deg,var(--navy),var(--cyan)); transform:skewX(-12deg); transform-origin:left; border-radius:0 3px 3px 0; }
.sr-progress span.done { background:var(--green); }

.sr-badge { display:inline-block; padding:5px 11px; font-size:10.5px; font-weight:900; font-style:italic; text-transform:uppercase; letter-spacing:.05em; white-space:nowrap; transform:skewX(-12deg); border-radius:3px; }
.sr-badge > span { display:inline-block; transform:skewX(12deg); }
.sr-badge.execucao { background:var(--cyan-soft); color:#086d99; }
.sr-badge.planejamento { background:var(--navy-soft); color:var(--navy); }
.sr-badge.backlog { background:var(--gray-bg); color:#4a5568; }
.sr-badge.concluido { background:var(--green-bg); color:var(--green); }
.sr-badge.atencao { background:var(--amber-bg); color:var(--amber); }

.sr-timeline { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
.sr-timeline-item { background:var(--surface-soft); border:1px solid var(--border); border-top:4px solid var(--cyan); border-radius:8px; padding:16px; }
.sr-timeline-item:first-child { border-top-color:var(--navy); }
.sr-timeline-item small { color:var(--muted); font-weight:800; text-transform:uppercase; letter-spacing:.07em; font-size:10.5px; }
.sr-timeline-item p { margin:8px 0 0; color:var(--muted); font-size:13px; line-height:1.5; white-space:pre-wrap; }

.sr-project-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow); margin:0 0 22px; overflow:hidden; }
.sr-project-card::before { content:""; display:block; height:5px; background:linear-gradient(100deg,var(--navy) 0%,var(--navy) 38%,var(--cyan) 70%,#8fd3f0 100%); }
.sr-project-top { display:grid; grid-template-columns:1fr auto; gap:18px; padding:22px 26px; border-bottom:1px solid var(--border); background:linear-gradient(180deg,#fff 0%,#f8fafc 100%); }
.sr-project-title h2 { margin:0 0 8px; font-size:22px; color:var(--navy); font-style:italic; font-weight:900; text-transform:uppercase; line-height:1.12; }
.sr-project-title p { margin:0; color:var(--muted); line-height:1.55; font-size:13.5px; }
.sr-status-stack { display:flex; align-items:flex-end; flex-direction:column; gap:8px; }
.sr-project-body { padding:22px 26px 26px; display:grid; grid-template-columns:.9fr 1.1fr; gap:22px; }
.sr-info-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-bottom:16px; }
.sr-info-box { background:var(--surface-soft); border:1px solid var(--border); border-radius:8px; padding:13px 14px; }
.sr-info-box small { display:block; color:var(--muted); font-size:10.5px; text-transform:uppercase; font-weight:800; letter-spacing:.06em; margin-bottom:6px; }
.sr-info-box strong { font-size:13.5px; line-height:1.35; color:#2a3344; }
.sr-progress-wrap { background:var(--surface-soft); border:1px solid var(--border); border-radius:8px; padding:15px 16px; }
.sr-executive-note { margin-top:16px; background:var(--navy-soft); border-left:4px solid var(--navy); border-radius:6px; padding:14px 16px; color:#25304a; line-height:1.55; font-size:13.5px; }
.sr-executive-note strong { color:var(--navy); text-transform:uppercase; font-style:italic; font-size:12px; letter-spacing:.03em; display:block; margin-bottom:6px; }
.sr-executive-note p { margin:0; white-space:pre-wrap; }

.sr-panel { background:var(--surface-soft); border:1px solid var(--border); border-radius:8px; overflow:hidden; margin-bottom:14px; }
.sr-panel h3 { margin:0; padding:13px 16px; background:#fff; border-bottom:1px solid var(--border); font-size:12.5px; color:var(--navy); font-style:italic; font-weight:900; text-transform:uppercase; }
.sr-panel-body { padding:13px 16px; }
.sr-doc table { width:100%; border-collapse:collapse; }
.sr-doc th, .sr-doc td { padding:11px 14px; text-align:left; vertical-align:top; border-bottom:1px solid var(--border); font-size:13px; line-height:1.4; }
.sr-doc th { color:var(--muted); text-transform:uppercase; letter-spacing:.06em; font-size:10px; background:#fbfcfd; }
.sr-doc tr:last-child td { border-bottom:0; }
.sr-td-empty { color:var(--muted); font-style:italic; }
.sr-mini-status { display:inline-block; padding:4px 9px; font-size:10.5px; font-weight:800; font-style:italic; text-transform:uppercase; background:var(--gray-bg); color:#4a5568; white-space:nowrap; transform:skewX(-12deg); border-radius:3px; }
.sr-mini-status > span { display:inline-block; transform:skewX(12deg); }
.sr-mini-status.done { background:var(--green-bg); color:var(--green); }
.sr-cron-pct { display:flex; align-items:center; gap:8px; }
.sr-cron-bar { flex:1; min-width:48px; height:7px; background:#dfe4eb; border-radius:3px; overflow:hidden; }
.sr-cron-bar span { display:block; height:100%; background:linear-gradient(90deg,var(--navy),var(--cyan)); border-radius:3px; }
.sr-cron-bar span.done { background:var(--green); }
.sr-cron-num { font-size:11px; font-weight:700; color:#2a3344; font-variant-numeric:tabular-nums; min-width:34px; text-align:right; }
.sr-cron-parent { font-weight:800; color:var(--navy); }
.sr-cron-child { color:#2a3344; }
.sr-cron-tree { color:var(--muted); }
.sr-cron-toggle { appearance:none; border:0; background:none; padding:0; margin-right:5px; cursor:pointer; color:var(--navy); vertical-align:middle; display:inline-flex; }
.sr-cron-toggle:hover { color:var(--cyan); }
.sr-row-hidden { display:none; }
.sr-cron-kanban { display:block; font-size:10px; color:var(--muted); margin-top:2px; }
.sr-row-open { background:var(--amber-bg); }
.sr-row-open td:first-child { box-shadow:inset 3px 0 0 var(--amber); }

.sr-openstages { margin-top:14px; background:var(--amber-bg); border:1px solid #efd9a3; border-left:4px solid var(--amber); border-radius:8px; padding:12px 14px; }
.sr-openstages-head { font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.03em; color:var(--amber); margin-bottom:8px; }
.sr-openstages ul { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:6px; }
.sr-openstages li { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:6px; font-size:12.5px; border-top:1px solid #efe1c0; padding-top:6px; }
.sr-openstages li:first-child { border-top:0; padding-top:0; }
.sr-os-title { font-weight:700; color:#5b4708; }
.sr-os-tag { display:inline-block; margin-left:6px; font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; background:var(--amber); color:#fff; border-radius:3px; padding:1px 5px; vertical-align:middle; }
.sr-os-meta { color:#7a6a3a; font-size:11.5px; }
.sr-add-btn { appearance:none; border:1px dashed var(--cyan); background:var(--cyan-soft); color:#086d99; cursor:pointer; font-family:inherit; font-weight:700; font-size:12px; padding:7px 12px; border-radius:6px; }
.sr-add-btn:hover { background:#d5eefb; }
.sr-row-del { appearance:none; border:1px solid var(--border); background:#fff; color:var(--muted); cursor:pointer; width:26px; height:26px; line-height:1; border-radius:6px; font-size:16px; }
.sr-row-del:hover { border-color:var(--red); color:var(--red); }
.sr-doc td select.sr-input { padding:6px 8px; }
.sr-decisoes { margin:0; padding-left:18px; color:#2a3344; font-size:13px; line-height:1.6; }
.sr-muted { color:var(--muted); }
.sr-empty { color:var(--muted); font-style:italic; padding:8px 0; }

.sr-input { width:100%; border:1px solid var(--border); border-radius:6px; padding:7px 9px; font-family:inherit; font-size:13px; color:var(--ink); background:#fff; resize:vertical; }
.sr-input:focus { outline:none; border-color:var(--cyan); box-shadow:0 0 0 2px var(--cyan-soft); }
.sr-info-box .sr-input, .sr-executive-note .sr-input, .sr-timeline-item .sr-input { margin-top:4px; }

.sr-request { padding:16px 26px; border-bottom:1px solid var(--border); background:#fcfdfe; }
.sr-request-head { font-size:13px; color:var(--navy); font-style:italic; font-weight:900; text-transform:uppercase; margin:0 0 12px; display:flex; align-items:center; gap:8px; }
.sr-request-head::before { content:""; width:12px; height:18px; background:var(--cyan); transform:skewX(-20deg); border-radius:2px; }
.sr-request-toggle { margin-left:auto; display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; padding:0; border:1px solid var(--border); border-radius:6px; background:#fff; color:var(--navy); cursor:pointer; transition:.15s ease; }
.sr-request-toggle:hover { border-color:var(--cyan); color:var(--cyan); }
.sr-chevron { transition:transform .18s ease; }
.sr-chevron.up { transform:rotate(180deg); }
.sr-request-body.collapsed { display:none; }
.sr-request .sr-panel { margin-bottom:14px; }
.sr-request .sr-panel:last-child { margin-bottom:0; }
.sr-request-grid { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--border); }
.sr-field { background:var(--surface-soft); padding:11px 16px; }
.sr-field.full { grid-column:1 / -1; }
.sr-field small { display:block; color:var(--muted); font-size:10px; text-transform:uppercase; font-weight:800; letter-spacing:.06em; margin-bottom:5px; }
.sr-field-val { font-size:13px; color:#2a3344; line-height:1.45; white-space:pre-wrap; word-break:break-word; }
.sr-link { color:var(--cyan); text-decoration:underline; }

@media (max-width:1000px) {
  .sr-project-body, .sr-exec-grid { grid-template-columns:1fr; }
  .sr-summary-grid { grid-template-columns:repeat(2,1fr); }
  .sr-timeline { grid-template-columns:1fr; }
  .sr-project-top { grid-template-columns:1fr; }
  .sr-request-grid { grid-template-columns:1fr; }
}

@media print {
  .sr-doc .no-print { display:none !important; }
  .sr-doc .sr-request-body.collapsed { display:block !important; }
  .sr-doc tr.sr-row-hidden { display:table-row !important; }
  .sr-tab-content { display:block !important; }
  .sr-hero, .sr-section-block, .sr-kpi, .sr-exec-card, .sr-project-card { box-shadow:none; }
  .sr-project-card, .sr-exec-card { break-inside:avoid; page-break-inside:avoid; }
  .sr-tab-content[data-project] { page-break-before:always; }
}
`
