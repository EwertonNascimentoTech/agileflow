// List, Gantt, Calendar views
const { useState: useV } = React;

// ─────────── List ───────────
const ListView = ({ tasks, onOpen, funnelId }) => {
  const statuses = AppData.statuses.filter(s => s.funnel_id === funnelId)
                    .sort((a,b) => a.order - b.order);
  const [collapsed, setCollapsed] = useV({});
  const toggle = (k) => setCollapsed(c => ({ ...c, [k]: !c[k] }));

  return (
    <div className="canvas">
      <div className="list-card">
        <div className="list-row header">
          <span/>
          <span>Demanda</span>
          <span>Tipo</span>
          <span>Status</span>
          <span>Responsável</span>
          <span>SLA</span>
          <span>Prazo</span>
        </div>

        {statuses.map(s => {
          const stTasks = tasks.filter(t => t.status_id === s.id);
          if (stTasks.length === 0) return null;
          return (
            <React.Fragment key={s.id}>
              <div className="list-row group" onClick={() => toggle(s.id)} style={{ display: 'flex' }}>
                <Icon name={collapsed[s.id] ? 'chevRight' : 'chevDown'} size={12}/>
                <span className="status-dot" style={{ background: s.color }}/>
                <span>{s.name}</span>
                <span style={{ color: 'var(--muted-fg)', fontWeight: 500 }}>{stTasks.length}</span>
              </div>
              {!collapsed[s.id] && stTasks.map(t => {
                const a = AppData.memberById(t.assigned_to);
                const ty = AppData.typeById(t.demand_type_id);
                const due = t.due_date ? new Date(t.due_date + 'T00:00:00') : null;
                const today = new Date(2026, 4, 26);
                const overdue = due && due < today && !t.completed_at;
                return (
                  <div key={t.id} className="list-row task" onClick={() => onOpen(t)}>
                    <input type="checkbox" onClick={e => e.stopPropagation()}
                           style={{ width: 14, height: 14, accentColor: 'var(--primary)' }}/>
                    <div className="col-title">
                      <span className="text">{t.title}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-fg)', flexShrink: 0 }}>
                        {t.id}
                      </span>
                    </div>
                    {ty && <Chip>{ty.name}</Chip>}
                    <Chip variant="muted" style={{ background: s.color + '22', color: s.color }}>
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: s.color, marginRight: 4 }}/>
                      {s.name}
                    </Chip>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar user={a} size={22}/>
                      <span style={{ fontSize: 12 }}>{a?.full_name?.split(' ')[0] ?? '—'}</span>
                    </div>
                    <SLABadge state={t.sla_state}/>
                    {due && (
                      <span className={`due-pill ${overdue ? 'overdue' : ''}`}>
                        <span className="dot"/>
                        {due.toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ─────────── Gantt ───────────
const GanttView = ({ allTasks, onOpen, onUpdateTask }) => {
  const [projectId, setProjectId] = useV('p-marketing');
  const [scale, setScale] = useV('day'); // 'day' | 'week'
  const [editingTask, setEditingTask] = useV(null);
  const [projDropdown, setProjDropdown] = useV(false);
  const ddRef = React.useRef();

  React.useEffect(() => {
    const fn = (e) => { if (ddRef.current && !ddRef.current.contains(e.target)) setProjDropdown(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Funnels of the selected project
  const projectFunnels = AppData.funnels.filter(f => f.project_id === projectId);
  const funnelIds = new Set(projectFunnels.map(f => f.id));

  // Project tasks (across all funnels of project)
  const projectTasks = allTasks.filter(t => funnelIds.has(t.funnel_id) && t.start_date && t.due_date);
  const project = AppData.projects.find(p => p.id === projectId);

  // Day window: anchor on today, range = -7..+28 days
  const today = new Date(2026, 4, 26);
  const start = new Date(today); start.setDate(start.getDate() - 7);
  const end   = new Date(today); end.setDate(end.getDate() + 28);
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));

  const dowLabels = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
  const monthLabels = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

  const dayPct = 100 / days.length;
  const todayIdx = days.findIndex(d => d.toDateString() === today.toDateString());
  const todayLeft = (todayIdx + 0.5) * dayPct;

  // Week strip
  const weeks = [];
  let curW = null;
  days.forEach((d) => {
    const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toDateString();
    if (!curW || curW.key !== key) {
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      curW = { key, label: `${monthLabels[monday.getMonth()]} ${monday.getDate()}–${sunday.getDate()}`, cols: 0 };
      weeks.push(curW);
    }
    curW.cols += 1;
  });

  // Index of bar by id (for dep arrows)
  const barIndex = new Map();
  let rowCounter = 0;
  const swimlanes = projectFunnels.map(f => {
    const fTasks = projectTasks.filter(t => t.funnel_id === f.id);
    const rows = fTasks.map(t => {
      const s = new Date(t.start_date + 'T00:00:00');
      const e = new Date(t.due_date + 'T00:00:00');
      let sIdx = days.findIndex(d => d.toDateString() === s.toDateString());
      let eIdx = days.findIndex(d => d.toDateString() === e.toDateString());
      if (sIdx === -1) sIdx = s < days[0] ? 0 : days.length - 1;
      if (eIdx === -1) eIdx = e > days[days.length-1] ? days.length - 1 : 0;
      const rowIndex = rowCounter++;
      const bar = { task: t, sIdx, eIdx, rowIndex };
      barIndex.set(t.id, bar);
      return bar;
    });
    return { funnel: f, rows };
  });

  const barColor = (t) => {
    if (t.completed_at) return 'var(--success)';
    if (t.sla_state === 'breached') return 'var(--destructive)';
    if (t.sla_state === 'warning') return 'var(--warning)';
    return 'var(--primary)';
  };

  // Row layout constants (must match CSS .gantt-task-row min-height)
  const ROW_H = 44;
  const GROUP_H = 33; // group header height + borders
  // Compute Y position of a row (relative to track top within the overall task area)
  const trackTopY = (rowIndex, funnelIdx) => {
    // sum of all previous group headers + preceding rows
    let prev = 0;
    for (let i = 0; i <= funnelIdx; i++) {
      prev += GROUP_H;
      if (i < funnelIdx) prev += swimlanes[i].rows.length * ROW_H;
    }
    const localOffset = rowIndex - swimlanes.slice(0, funnelIdx).reduce((a, sw) => a + sw.rows.length, 0);
    return prev + localOffset * ROW_H + ROW_H / 2;
  };

  // Build dependency arrows
  const deps = [];
  swimlanes.forEach((sw, sfi) => {
    sw.rows.forEach(bar => {
      const pid = bar.task.predecessor_id;
      if (!pid) return;
      const fromBar = barIndex.get(pid);
      if (!fromBar) return;
      const fromFunnelIdx = swimlanes.findIndex(s => s.rows.includes(fromBar));
      if (fromFunnelIdx < 0) return;
      const fromY = trackTopY(fromBar.rowIndex, fromFunnelIdx);
      const toY   = trackTopY(bar.rowIndex, sfi);
      const fromX = (fromBar.eIdx + 1) * dayPct;
      const toX   = bar.sIdx * dayPct;
      // breached if predecessor finishes AFTER successor starts
      const breached = fromBar.eIdx >= bar.sIdx;
      deps.push({ fromX, fromY, toX, toY, breached, id: pid + '-' + bar.task.id });
    });
  });

  const totalHeight = swimlanes.reduce((sum, sw) => sum + GROUP_H + sw.rows.length * ROW_H, 0);

  return (
    <>
    <div className="canvas">
      {/* Gantt toolbar */}
      <div className="gantt-toolbar" ref={ddRef}>
        <div className="title">
          <h1>Gantt</h1>
          <span className="slash">/</span>
          <span className="project-name">{project?.name}</span>
          <span className="count-pill">{projectTasks.length}</span>
        </div>

        {/* Project filter */}
        <div className="relative" style={{ marginLeft: 8 }}>
          <button className="filter-btn"
                  onClick={() => setProjDropdown(d => !d)}>
            <Icon name="folder" size={13}/>
            <span>{project?.name ?? 'Selecionar projeto'}</span>
            <Icon name="chevDown" size={12}/>
          </button>
          {projDropdown && (
            <div className="dd-menu">
              <div className="dd-head">Filtrar por projeto</div>
              {AppData.projects.map(p => (
                <div key={p.id} className="dd-item"
                     onClick={() => { setProjectId(p.id); setProjDropdown(false); }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color }}/>
                  <span style={{ flex: 1 }}>{p.name}</span>
                  {projectId === p.id && <Icon name="check" size={13} style={{ color: 'var(--primary)' }}/>}
                </div>
              ))}
            </div>
          )}
        </div>

        <span style={{ flex: 1 }}/>

        <div className="scale-toggle">
          <button className={scale === 'day' ? 'on' : ''} onClick={() => setScale('day')}>Dia</button>
          <button className={scale === 'week' ? 'on' : ''} onClick={() => setScale('week')}>Semana</button>
        </div>

        <button className="btn primary icon">
          <Icon name="plus" size={16}/>
        </button>
      </div>

      <div className="gantt">
        {/* Week strip */}
        <div className="gantt-row-grid">
          <div className="gantt-head-cell">Demanda</div>
          <div className="gantt-head-cell right">
            <div className="gantt-weeks">
              {weeks.map((w, i) => (
                <div key={i} className="gantt-week" style={{ flex: w.cols }}>{w.label}</div>
              ))}
            </div>
          </div>
        </div>
        {/* Day strip */}
        <div className="gantt-row-grid">
          <div className="gantt-head-cell" style={{ color: 'var(--muted-fg)', fontWeight: 500 }}>
            {projectTasks.length} demanda{projectTasks.length !== 1 && 's'}
          </div>
          <div className="gantt-head-cell right">
            <div className="gantt-days">
              {days.map((d, i) => {
                const dow = dowLabels[d.getDay()];
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                const isToday = d.toDateString() === today.toDateString();
                return (
                  <div key={i} className={`gantt-day ${weekend ? 'weekend' : ''} ${isToday ? 'today' : ''}`}>
                    <div className="dow">{dow}</div>
                    <div className="num">{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Container for relative deps positioning */}
        <div style={{ position: 'relative' }}>
          {/* SVG dependency layer */}
          <svg className="gantt-deps"
               style={{ height: totalHeight, position: 'absolute', left: 320, right: 0, top: 0,
                        width: 'calc(100% - 320px)' }}
               preserveAspectRatio="none">
            {deps.map(dep => {
              // Draw L-shape arrow with rounded corner
              const fromXAbs = dep.fromX; // already in %
              const toXAbs   = dep.toX;
              const path = `
                M ${fromXAbs}% ${dep.fromY}
                L ${(fromXAbs + (toXAbs - fromXAbs) / 2).toFixed(2)}% ${dep.fromY}
                L ${(fromXAbs + (toXAbs - fromXAbs) / 2).toFixed(2)}% ${dep.toY}
                L ${toXAbs}% ${dep.toY}
              `;
              return (
                <g key={dep.id}>
                  <path d={path} className={dep.breached ? 'breached' : ''}/>
                  <circle cx={`${toXAbs}%`} cy={dep.toY} r={2.5}
                          fill={dep.breached ? 'var(--destructive)' : 'var(--muted-fg)'}/>
                </g>
              );
            })}
          </svg>

          {/* Swimlanes */}
          {swimlanes.map((sw, sfi) => (
            <React.Fragment key={sw.funnel.id}>
              <div className="gantt-group-row">
                <div className="label">
                  <Icon name="git" size={13} style={{ color: 'var(--muted-fg)' }}/>
                  <span>{sw.funnel.name}</span>
                  <span className="count">{sw.rows.length}</span>
                </div>
                <div className="right"/>
              </div>
              {sw.rows.map(bar => {
                const left  = bar.sIdx * dayPct;
                const width = Math.max(dayPct * 0.9, (bar.eIdx - bar.sIdx + 1) * dayPct);
                const color = barColor(bar.task);
                const subProgress = bar.task.sub_total > 0 ? (bar.task.sub_done / bar.task.sub_total) : 0;
                return (
                  <div key={bar.task.id} className="gantt-task-row">
                    <div className="label">
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }}/>
                      <span className="text"
                            onClick={() => setEditingTask(bar.task)}
                            style={{ cursor: 'pointer' }}
                            title="Clique para editar">
                        {bar.task.title}
                      </span>
                      <Avatar user={AppData.memberById(bar.task.assigned_to)} size={20}/>
                    </div>
                    <div className="gantt-track" style={{ minHeight: ROW_H }}>
                      {days.map((d, i) => {
                        const weekend = d.getDay() === 0 || d.getDay() === 6;
                        return <div key={i} className={`cell ${weekend ? 'weekend' : ''}`}/>;
                      })}
                      <div className="gantt-today-line" style={{ left: todayLeft + '%' }}/>
                      <div className="gantt-bar"
                           onClick={() => onOpen(bar.task)}
                           style={{ left: left + '%', width: width + '%', background: color }}>
                        {subProgress > 0 && (
                          <span className="bar-progress" style={{ width: (subProgress * 100) + '%' }}/>
                        )}
                        <span className="bar-title"
                              onClick={(e) => { e.stopPropagation(); setEditingTask(bar.task); }}>
                          {bar.task.title}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}

          {swimlanes.every(s => s.rows.length === 0) && (
            <div className="empty-state">
              <div className="icon-wrap"><Icon name="gantt" size={24}/></div>
              <h3>Nenhuma demanda com prazo neste projeto</h3>
              <p>Adicione data de início e prazo às demandas para visualizá-las aqui.</p>
            </div>
          )}
        </div>
      </div>
    </div>

    {editingTask && (
      <GanttEditModal
        task={editingTask}
        projectTasks={projectTasks.filter(t => t.id !== editingTask.id)}
        onClose={() => setEditingTask(null)}
        onSave={(patch) => { onUpdateTask(editingTask.id, patch); setEditingTask(null); }}
      />
    )}
    </>
  );
};

// ─────────── Quick edit modal (Gantt) ───────────
const GanttEditModal = ({ task, projectTasks, onClose, onSave }) => {
  const [title, setTitle] = useV(task.title);
  const [startDate, setStartDate] = useV(task.start_date || '');
  const [dueDate, setDueDate]     = useV(task.due_date || '');
  const [predecessor, setPredecessor] = useV(task.predecessor_id || '');
  const [assignee, setAssignee] = useV(task.assigned_to || '');

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const predTask = projectTasks.find(t => t.id === predecessor);
  const predConflict = predTask && predTask.due_date && startDate && predTask.due_date > startDate;
  const dateInverted = startDate && dueDate && startDate > dueDate;

  const status = AppData.statusById(task.status_id);
  const type = AppData.typeById(task.demand_type_id);

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h2>Editar demanda</h2>
            <div className="crumb">
              <span style={{ fontFamily: 'var(--font-mono)' }}>{task.id}</span>
              {type && <> · {type.name}</>}
              {status && <> · {status.name}</>}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={16}/></button>
        </div>
        <div className="modal-body">
          <div className="form-field">
            <label className="form-label"><Icon name="fileText" size={12}/> Título</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus/>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="form-label"><Icon name="calendar" size={12}/> Início</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}/>
            </div>
            <div className="form-field">
              <label className="form-label"><Icon name="calendarCheck" size={12}/> Vencimento</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/>
            </div>
          </div>
          {dateInverted && (
            <div className="form-hint" style={{ color: 'var(--destructive)' }}>
              ⚠ Data de início é posterior ao vencimento.
            </div>
          )}

          <div className="form-field">
            <label className="form-label"><Icon name="git" size={12}/> Predecessor (deve concluir antes)</label>
            <select value={predecessor} onChange={e => setPredecessor(e.target.value)}>
              <option value="">— Sem predecessor —</option>
              {projectTasks.map(t => (
                <option key={t.id} value={t.id}>
                  {t.id} · {t.title}{t.due_date ? ` (vence ${t.due_date.slice(5)})` : ''}
                </option>
              ))}
            </select>
          </div>
          {predConflict && (
            <div className="form-hint" style={{ color: 'var(--warning)' }}>
              ⚠ Predecessor "{predTask.title}" vence em {predTask.due_date}, depois do início desta demanda.
            </div>
          )}

          <div className="form-field">
            <label className="form-label"><Icon name="user" size={12}/> Responsável</label>
            <select value={assignee} onChange={e => setAssignee(e.target.value)}>
              <option value="">— Sem responsável —</option>
              {AppData.members.map(m => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <span className="spacer"/>
          <button className="btn primary"
                  onClick={() => onSave({
                    title: title.trim() || task.title,
                    start_date: startDate || null,
                    due_date: dueDate || null,
                    predecessor_id: predecessor || null,
                    assigned_to: assignee || null,
                  })}>
            <Icon name="check" size={14}/> Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────── Calendar ───────────
const CalendarView = ({ tasks, onOpen }) => {
  const today = new Date(2026, 4, 26);
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const startDow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const dows = ['SEG','TER','QUA','QUI','SEX','SÁB','DOM'];

  return (
    <div className="canvas">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          {months[today.getMonth()]} {today.getFullYear()}
        </h2>
        <button className="btn ghost" style={{ width: 32, height: 32, padding: 0 }}>
          <Icon name="chevLeft" size={14}/>
        </button>
        <button className="btn ghost" style={{ width: 32, height: 32, padding: 0 }}>
          <Icon name="chevRight" size={14}/>
        </button>
        <span style={{ flex: 1 }}/>
        <button className="btn ghost">Hoje</button>
      </div>

      <div className="cal-grid" style={{ marginBottom: 6 }}>
        {dows.map(d => (
          <div key={d} style={{ padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--muted-fg)', textTransform: 'uppercase' }}>
            {d}
          </div>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((day, i) => {
          if (!day) return <div key={i}/>;
          const dayDate = new Date(today.getFullYear(), today.getMonth(), day);
          const isToday = day === today.getDate();
          const dayTasks = tasks.filter(t => {
            if (!t.due_date) return false;
            const d = new Date(t.due_date + 'T00:00:00');
            return d.toDateString() === dayDate.toDateString();
          });
          return (
            <div key={i} className={`cal-day ${isToday ? 'today' : ''}`}>
              <div className="num">{day}</div>
              {dayTasks.slice(0, 3).map(t => {
                const ty = AppData.typeById(t.demand_type_id);
                return (
                  <div key={t.id} className="cal-tag"
                       onClick={() => onOpen(t)}
                       style={ty ? { background: ty.color + '22', color: ty.color } : undefined}>
                    {t.title}
                  </div>
                );
              })}
              {dayTasks.length > 3 && (
                <div style={{ fontSize: 10, color: 'var(--muted-fg)' }}>+{dayTasks.length - 3}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

Object.assign(window, { ListView, GanttView, GanttEditModal, CalendarView });
