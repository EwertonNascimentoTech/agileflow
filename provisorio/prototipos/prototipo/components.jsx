// ─────────── Shared UI primitives ───────────
// Mirrors components used by ProjectBoardPage.tsx (real codebase)

const Avatar = ({ user, size = 28, title }) => {
  if (!user) return (
    <div className="assignee-avatar"
         style={{ background: '#94A3B8', width: size, height: size, fontSize: size * 0.36 }}
         title={title ?? 'Sem responsável'}>
      ?
    </div>
  );
  return (
    <div className="assignee-avatar"
         style={{ background: colorForUser(user.id), width: size, height: size, fontSize: size * 0.36 }}
         title={user.full_name}>
      {initialsOf(user.full_name)}
    </div>
  );
};

const AvatarStack = ({ ids = [], size = 22, max = 3 }) => {
  const users = ids.map(id => AppData.memberById(id)).filter(Boolean);
  const shown = users.slice(0, max);
  const more = users.length - shown.length;
  return (
    <div style={{ display: 'flex' }}>
      {shown.map((u, i) => (
        <div key={u.id}
             className="assignee-avatar"
             style={{ background: colorForUser(u.id), width: size, height: size, fontSize: size * 0.36,
                      marginLeft: i === 0 ? 0 : -size * 0.3, border: '2px solid var(--card)' }}
             title={u.full_name}>
          {u.initials}
        </div>
      ))}
      {more > 0 && (
        <div className="assignee-avatar"
             style={{ background: '#94A3B8', width: size, height: size, fontSize: size * 0.32,
                      marginLeft: -size * 0.3, border: '2px solid var(--card)' }}>
          +{more}
        </div>
      )}
    </div>
  );
};

// Chip — generic small badge. Variants match the design system token names.
const Chip = ({ children, variant = 'default', icon, style }) => (
  <span className={`chip ${variant !== 'default' ? variant : ''}`} style={style}>
    {icon}
    {children}
  </span>
);

// SLA state badge (ok | warning | breached | none)
const SLABadge = ({ state }) => {
  if (state === 'ok' || state === 'none' || !state) return null;
  if (state === 'warning') return <Chip variant="warning">SLA: alerta</Chip>;
  if (state === 'breached') return <Chip variant="destructive">SLA: atrasado</Chip>;
  return null;
};

// ─────────── TaskCard (v1 style — type pill + ID top, meta row bottom) ───────────
const TaskCard = ({ task, onOpen, onDragStart, onDragEnd, dragging }) => {
  const assignees = task.assignees ? task.assignees : (task.assigned_to ? [task.assigned_to] : []);
  const type = AppData.typeById(task.demand_type_id);
  const parent = task.parent_task_id ? AppData.taskById(task.parent_task_id) : null;
  const due = task.due_date ? new Date(task.due_date + 'T00:00:00') : null;
  const today = new Date(2026, 4, 26); today.setHours(0,0,0,0);
  const overdue = due && due < today && !task.completed_at;

  const onCardDragStart = (e) => {
    onDragStart(e, task);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', task.id); } catch {}
  };

  return (
    <article
      className={`task-card ${dragging ? 'dragging' : ''}`}
      draggable
      onDragStart={onCardDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
    >
      <div className="top-row">
        {type && (
          <Chip variant="default" style={{ background: type.color + '22', color: type.color }}>
            {type.name}
          </Chip>
        )}
        <SLABadge state={task.sla_state}/>
        {task.completed_at && <Chip variant="success" icon={<Icon name="check" size={10}/>}>Concluída</Chip>}
        <span className="task-id">{task.id}</span>
      </div>

      <h4 className="title">{task.title}</h4>

      {(parent || task.origin_task_id) && (
        <div className="meta-chips">
          {parent && (
            <Chip variant="muted" icon={<Icon name="git" size={10}/>}>
              <span style={{ maxWidth: 140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {parent.title}
              </span>
            </Chip>
          )}
          {task.origin_task_id && <Chip variant="info" icon={<Icon name="arrowUp" size={10}/>}>origem</Chip>}
        </div>
      )}

      {task.sub_total > 0 && (
        <div className={`subtask-bar ${task.sub_done === task.sub_total ? 'done' : ''}`}>
          <Icon name="checkSquare" size={11} style={{ color: 'var(--muted-fg)' }}/>
          <div className="track">
            <div className="fill" style={{ width: (task.sub_done/task.sub_total)*100 + '%' }}/>
          </div>
          <span className="lbl">{task.sub_done}/{task.sub_total}</span>
        </div>
      )}

      <div className="meta-row">
        {due && (
          <span className={`due-pill ${overdue ? 'overdue' : ''}`} style={{ marginTop: 0 }}>
            <span className="dot"/>
            {due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          </span>
        )}
        {task.comments > 0 && (
          <span className="stat" title={`${task.comments} comentário(s)`}>
            <Icon name="message" size={11}/> {task.comments}
          </span>
        )}
        {task.attachments > 0 && (
          <span className="stat" title={`${task.attachments} anexo(s)`}>
            <Icon name="paperclip" size={11}/> {task.attachments}
          </span>
        )}
        <span className="spacer"/>
        <AvatarStack ids={assignees} size={22} max={3}/>
      </div>
    </article>
  );
};

Object.assign(window, { Avatar, AvatarStack, Chip, SLABadge, TaskCard });
