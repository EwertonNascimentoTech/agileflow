// Kanban board — mirrors ProjectBoardPage.tsx column layout
const { useState: useK, useMemo: useMK } = React;

const KanbanView = ({ tasks, setTasks, onOpen, onCreate, funnelId }) => {
  const [draggingId, setDragging] = useK(null);
  const [overCol, setOverCol] = useK(null);

  // Columns from selected funnel
  const columns = useMK(
    () => AppData.statuses
      .filter(s => s.funnel_id === funnelId)
      .sort((a, b) => a.order - b.order),
    [funnelId]
  );

  const onDragStart = (e, task) => { setDragging(task.id); };
  const onDragEnd   = () => { setDragging(null); setOverCol(null); };

  const onDragOver  = (colId) => (e) => { e.preventDefault(); if (overCol !== colId) setOverCol(colId); };
  const onDrop      = (colId) => (e) => {
    e.preventDefault();
    if (!draggingId) return;
    setTasks(prev => prev.map(t => t.id === draggingId ? { ...t, status_id: colId } : t));
    setDragging(null);
    setOverCol(null);
  };

  return (
    <div className="canvas" style={{ paddingTop: 16 }}>
      <div className="board scrollbar-thin"
           style={{ height: '100%', minHeight: 'min-content' }}>
        {columns.map(col => {
          const colTasks = tasks.filter(t => t.status_id === col.id);
          return (
            <section key={col.id}
                     className={`column ${overCol === col.id ? 'drag-over' : ''}`}
                     onDragOver={onDragOver(col.id)}
                     onDrop={onDrop(col.id)}>
              <div className="col-bar" style={{ background: col.color }}/>
              <header className="column-head">
                <div className="left">
                  <h3>{col.name}</h3>
                  <span className="col-count">{colTasks.length}</span>
                </div>
                <button className="col-plus"
                        onClick={() => onCreate?.(col)}
                        title="Nova demanda nesta etapa">
                  <Icon name="plus" size={13}/>
                </button>
              </header>

              <div className="col-body">
                {colTasks.length === 0 ? (
                  <div className="col-empty">Nenhuma demanda</div>
                ) : colTasks.map(t => (
                  <TaskCard key={t.id}
                            task={t}
                            onOpen={onOpen}
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                            dragging={draggingId === t.id}/>
                ))}
              </div>

              <div className="col-foot">
                <button onClick={() => onCreate?.(col)}>+ Nova demanda</button>
              </div>
            </section>
          );
        })}

        {/* + Nova coluna */}
        <button className="btn ghost" style={{ flexShrink: 0, alignSelf: 'flex-start', marginTop: 8 }}>
          <Icon name="plus" size={14}/> Nova coluna
        </button>
      </div>
    </div>
  );
};

window.KanbanView = KanbanView;
