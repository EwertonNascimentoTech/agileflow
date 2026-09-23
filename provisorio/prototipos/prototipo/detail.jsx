// Task Detail Drawer — mirrors ProjectTaskDrawer.tsx (real codebase)
const { useState: useD, useEffect: useDE, useMemo: useDM } = React;

const TaskDetail = ({ task, onClose, onUpdate }) => {
  const [comment, setComment] = useD('');
  const [subtasks, setSubtasks] = useD([]);

  useDE(() => {
    if (!task) return;
    const templates = [
      'Definir escopo com stakeholder',
      'Briefing e validação',
      'Wireframe / rascunho',
      'Implementação inicial',
      'Revisão de pares',
      'QA / validação final',
      'Publicação',
      'Comunicar área solicitante',
      'Documentar entrega',
      'Coletar feedback',
    ];
    const list = [];
    for (let i = 0; i < task.sub_total; i++) {
      list.push({ id: i, title: templates[i % templates.length], done: i < task.sub_done });
    }
    setSubtasks(list);
  }, [task && task.id]);

  if (!task) return null;

  const assignee = AppData.memberById(task.assigned_to);
  const status = AppData.statusById(task.status_id);
  const type = AppData.typeById(task.demand_type_id);
  const parent = task.parent_task_id ? AppData.taskById(task.parent_task_id) : null;
  const origin = task.origin_task_id ? AppData.taskById(task.origin_task_id) : null;
  const due = task.due_date ? new Date(task.due_date + 'T00:00:00') : null;
  const start = task.start_date ? new Date(task.start_date + 'T00:00:00') : null;
  const fmt = (d) => d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  // child tasks
  const children = AppData.tasks.filter(t => t.parent_task_id === task.id);

  // mock activity
  const activities = [
    { who: 'Marina Castro', when: 'há 12 min',  text: `Movi para ${status?.name ?? '—'} após alinhamento com PMO.` },
    { who: 'Rafael Souza',  when: 'há 1 h',     text: 'Adicionei mockup inicial em anexos. Comentários bem-vindos.' },
    { who: 'Ana Paula Lima',when: 'há 3 h',     text: 'Validei requisitos com a área. Tudo certo para seguir.' },
  ];

  const toggleSub = (id) =>
    setSubtasks(ss => ss.map(s => s.id === id ? { ...s, done: !s.done } : s));

  return (
    <div className="drawer-overlay open" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="crumb">
            <Icon name="folder" size={13} style={{ color: 'var(--muted-fg)' }}/>
            <span className="muted">Marketing Web</span>
            <Icon name="chevRight" size={11} className="sep"/>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted-fg)' }}>{task.id}</span>
          </div>
          <span className="spacer"/>
          <button className="icon-btn" title="Anexar"><Icon name="paperclip" size={15}/></button>
          <button className="icon-btn" title="Compartilhar"><Icon name="share" size={15}/></button>
          <button className="icon-btn" title="Excluir"><Icon name="trash" size={15}/></button>
          <div className="divider-v"/>
          <button className="icon-btn" onClick={onClose} title="Fechar"><Icon name="close" size={16}/></button>
        </div>

        <div className="drawer-body">
          {/* Status pills row */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {type && (
              <span className="chip" style={{ background: type.color + '22', color: type.color }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: type.color }}/>
                {type.name}
              </span>
            )}
            {status && (
              <span className="chip" style={{ background: status.color + '22', color: status.color }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: status.color }}/>
                {status.name}
              </span>
            )}
            <SLABadge state={task.sla_state}/>
            {task.completed_at && <Chip variant="success" icon={<Icon name="check" size={10}/>}>Concluída</Chip>}
            {parent && (
              <Chip variant="muted" icon={<Icon name="git" size={10}/>}>
                Filho de {parent.id}
              </Chip>
            )}
            {origin && <Chip variant="info" icon={<Icon name="arrowUp" size={10}/>}>Origem: {origin.id}</Chip>}
          </div>

          <h1>{task.title}</h1>
          {task.description && (
            <p style={{ color: 'var(--foreground-2)', marginTop: 4, fontSize: 13.5 }}>{task.description}</p>
          )}

          {/* Field grid */}
          <div className="drawer-fields">
            <div className="drawer-field">
              <span className="label"><Icon name="user" size={12}/> Responsável</span>
              <span className="value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar user={assignee} size={24}/>
                <span>{assignee?.full_name ?? <span className="empty">Sem responsável</span>}</span>
              </span>
            </div>
            <div className="drawer-field">
              <span className="label"><Icon name="calendar" size={12}/> Início</span>
              <span className="value">{fmt(start)}</span>
            </div>
            <div className="drawer-field">
              <span className="label"><Icon name="briefcase" size={12}/> Tipo</span>
              <span className="value">
                {type && (
                  <span className="chip" style={{ background: type.color + '22', color: type.color }}>
                    {type.name}
                  </span>
                )}
              </span>
            </div>
            <div className="drawer-field">
              <span className="label"><Icon name="calendarCheck" size={12}/> Vencimento</span>
              <span className="value">{fmt(due)}</span>
            </div>
            <div className="drawer-field">
              <span className="label"><Icon name="clock" size={12}/> SLA</span>
              <span className="value">
                {task.sla_state === 'ok' ? (
                  <Chip variant="success" icon={<Icon name="check" size={10}/>}>No prazo</Chip>
                ) : task.sla_state === 'warning' ? (
                  <Chip variant="warning">Em alerta</Chip>
                ) : task.sla_state === 'breached' ? (
                  <Chip variant="destructive">Atrasado</Chip>
                ) : (
                  <span className="empty">Sem SLA</span>
                )}
              </span>
            </div>
            <div className="drawer-field">
              <span className="label"><Icon name="folder" size={12}/> Tags</span>
              <span className="value" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {task.tags?.length > 0
                  ? task.tags.map(t => <Chip key={t} variant="muted">{t}</Chip>)
                  : <span className="empty">—</span>}
              </span>
            </div>
          </div>

          {/* Hierarchy */}
          {(parent || origin || children.length > 0) && (
            <>
              <h3 className="section-title">Hierarquia</h3>
              <div className="surface-block" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {parent && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <Icon name="git" size={13} style={{ color: 'var(--muted-fg)' }}/>
                    <span style={{ color: 'var(--muted-fg)' }}>Filho de:</span>
                    <span style={{ fontWeight: 500 }}>{parent.title}</span>
                  </div>
                )}
                {origin && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <Icon name="arrowUp" size={13} style={{ color: 'var(--info)' }}/>
                    <span style={{ color: 'var(--muted-fg)' }}>Originado por:</span>
                    <span style={{ fontWeight: 500 }}>{origin.title}</span>
                    <span className="chip info">demanda</span>
                  </div>
                )}
                {children.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 6 }}>
                      {children.length} card{children.length > 1 && 's'} filho{children.length > 1 && 's'}:
                    </div>
                    {children.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                        <span className="status-dot" style={{ background: AppData.statusById(c.status_id)?.color }}/>
                        <span>{c.title}</span>
                        <span style={{ marginLeft: 'auto', color: 'var(--muted-fg)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>{c.id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Subtasks */}
          {subtasks.length > 0 && (
            <>
              <h3 className="section-title">
                Subtarefas <span style={{ color: 'var(--muted-fg)', fontWeight: 500, marginLeft: 6 }}>
                  · {subtasks.filter(s => s.done).length}/{subtasks.length}
                </span>
              </h3>
              <div className="surface-block">
                {subtasks.map(s => (
                  <label key={s.id} className={`subtask ${s.done ? 'done' : ''}`}>
                    <input type="checkbox" checked={s.done} onChange={() => toggleSub(s.id)}/>
                    <span>{s.title}</span>
                  </label>
                ))}
                <button className="btn ghost" style={{ marginTop: 8, height: 28 }}>
                  <Icon name="plus" size={12}/> Adicionar subtarefa
                </button>
              </div>
            </>
          )}

          {/* Activity */}
          <h3 className="section-title">Atividade</h3>
          <div className="surface-block">
            {activities.map((a, i) => {
              const m = AppData.members.find(x => x.full_name === a.who);
              return (
                <div key={i} className="comment">
                  <Avatar user={m} size={32}/>
                  <div style={{ flex: 1 }}>
                    <div>
                      <span className="who">{a.who}</span>
                      <span className="when">{a.when}</span>
                    </div>
                    <div className="body">{a.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="composer">
          <div className="box">
            <textarea
              placeholder="Escreva um comentário... use @ para mencionar"
              value={comment} onChange={e => setComment(e.target.value)}/>
            <div className="ctrl">
              <button className="icon-btn" style={{ width: 28, height: 28 }} title="Anexar"><Icon name="paperclip" size={13}/></button>
              <button className="icon-btn" style={{ width: 28, height: 28 }} title="Mencionar"><Icon name="user" size={13}/></button>
              <span className="spacer"/>
              <button className="btn primary"
                      disabled={!comment.trim()}
                      style={{ height: 32 }}>
                <Icon name="reply" size={12}/> Comentar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

window.TaskDetail = TaskDetail;
