// Header + Toolbar — matches AppLayout.tsx (header) and ProjectBoardPage.tsx (toolbar)

const { useState: useS_tb, useRef: useR_tb, useEffect: useE_tb } = React;

const Header = ({ project, activeSection, theme, onTheme }) => {
  const sectionLabels = {
    overview: 'Visão geral', board: 'Quadro', list: 'Lista', gantt: 'Gantt',
    cal: 'Calendário', reports: 'Relatórios', config: 'Configurações',
  };
  return (
    <header className="header">
      <div className="crumb">
        <span className="muted">Projetos</span>
        <Icon name="chevRight" size={13} className="sep"/>
        <span className="cur">{project?.name ?? 'Marketing Web'}</span>
        {activeSection && (
          <>
            <Icon name="chevRight" size={13} className="sep"/>
            <span className="cur">{sectionLabels[activeSection] ?? ''}</span>
          </>
        )}
      </div>

      <div style={{ flex: 1 }}/>

      <button className="search-btn">
        <Icon name="search" size={13}/>
        <span>Buscar</span>
        <kbd>⌘K</kbd>
      </button>
      <button className="icon-btn" onClick={onTheme} title="Alternar tema">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16}/>
      </button>
      <button className="icon-btn" title="Notificações">
        <Icon name="bell" size={16}/>
        <span className="dot"/>
      </button>
    </header>
  );
};

// View tabs — Quadro / Lista / Gantt / Calendário inline under the header
const ViewTabs = ({ active, onChange, counts = {} }) => {
  const tabs = [
    { id: 'board', label: 'Quadro',     icon: 'board' },
    { id: 'list',  label: 'Lista',      icon: 'list' },
    { id: 'gantt', label: 'Gantt',      icon: 'gantt' },
    { id: 'cal',   label: 'Calendário', icon: 'calendar' },
  ];
  return (
    <div className="view-tabs">
      {tabs.map(t => (
        <button key={t.id}
                className={`view-tab ${active === t.id ? 'active' : ''}`}
                onClick={() => onChange(t.id)}>
          <Icon name={t.icon} size={14}/>
          {t.label}
          {counts[t.id] != null && <span className="pill">{counts[t.id]}</span>}
        </button>
      ))}
    </div>
  );
};

// Board toolbar — matches the styled toolbar from ProjectBoardPage.tsx
const BoardToolbar = ({
  funnels, selectedFunnelId, onFunnel,
  filters, onFilter,
  query, onQuery,
  totalTasks,
  onNew,
}) => {
  const [openMenu, setOpen] = useS_tb(null);
  const ref = useR_tb();

  useE_tb(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const selectedFunnel = funnels.find(f => f.id === selectedFunnelId);
  const activeFilterCount = (filters.assignee?.length || 0) + (filters.type?.length || 0) + (filters.sla?.length || 0);

  const toggleMulti = (key, val) => {
    const cur = filters[key] || [];
    const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val];
    onFilter({ ...filters, [key]: next });
  };
  const clear = () => onFilter({ assignee: [], type: [], sla: [] });

  return (
    <div className="board-toolbar" ref={ref}>
      <div className="board-title">
        <h1>Kanban</h1>
        {selectedFunnel && (
          <>
            <span className="slash">/</span>
            <span className="funnel-name">{selectedFunnel.name}</span>
          </>
        )}
        <span className="count-pill">{totalTasks}</span>
      </div>

      <div className="tb-search">
        <Icon name="search" size={14}/>
        <input value={query} onChange={e => onQuery(e.target.value)}
               placeholder="Buscar demandas pelo título..."/>
      </div>

      {/* Filter: Responsável */}
      <div className="relative">
        <button className={`filter-btn ${filters.assignee?.length ? 'active' : ''}`}
                onClick={() => setOpen(openMenu === 'assignee' ? null : 'assignee')}>
          <span>Responsável</span>
          {filters.assignee?.length > 0 && <span className="filter-count">{filters.assignee.length}</span>}
          <Icon name="chevDown" size={12}/>
        </button>
        {openMenu === 'assignee' && (
          <div className="dd-menu">
            <div className="dd-head">Filtrar por responsável</div>
            {AppData.members.map(m => {
              const checked = (filters.assignee || []).includes(m.id);
              return (
                <div key={m.id} className="dd-item" onClick={() => toggleMulti('assignee', m.id)}>
                  <span className={`check ${checked ? 'checked' : ''}`}>
                    {checked && <Icon name="check" size={11}/>}
                  </span>
                  <Avatar user={m} size={20}/>
                  <span>{m.full_name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter: Tipo */}
      <div className="relative">
        <button className={`filter-btn ${filters.type?.length ? 'active' : ''}`}
                onClick={() => setOpen(openMenu === 'type' ? null : 'type')}>
          <span>Tipo</span>
          {filters.type?.length > 0 && <span className="filter-count">{filters.type.length}</span>}
          <Icon name="chevDown" size={12}/>
        </button>
        {openMenu === 'type' && (
          <div className="dd-menu">
            <div className="dd-head">Tipo de demanda</div>
            {AppData.demandTypes.map(t => {
              const checked = (filters.type || []).includes(t.id);
              return (
                <div key={t.id} className="dd-item" onClick={() => toggleMulti('type', t.id)}>
                  <span className={`check ${checked ? 'checked' : ''}`}>
                    {checked && <Icon name="check" size={11}/>}
                  </span>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: t.color }}/>
                  <span>{t.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter: SLA */}
      <div className="relative">
        <button className={`filter-btn ${filters.sla?.length ? 'active' : ''}`}
                onClick={() => setOpen(openMenu === 'sla' ? null : 'sla')}>
          <span>SLA</span>
          {filters.sla?.length > 0 && <span className="filter-count">{filters.sla.length}</span>}
          <Icon name="chevDown" size={12}/>
        </button>
        {openMenu === 'sla' && (
          <div className="dd-menu">
            <div className="dd-head">SLA</div>
            {[
              { id: 'ok',       label: 'No prazo',    color: 'var(--success)' },
              { id: 'warning',  label: 'Em alerta',   color: 'var(--warning)' },
              { id: 'breached', label: 'Atrasado',    color: 'var(--destructive)' },
              { id: 'none',     label: 'Sem SLA',     color: 'var(--muted-fg)' },
            ].map(o => {
              const checked = (filters.sla || []).includes(o.id);
              return (
                <div key={o.id} className="dd-item" onClick={() => toggleMulti('sla', o.id)}>
                  <span className={`check ${checked ? 'checked' : ''}`}>
                    {checked && <Icon name="check" size={11}/>}
                  </span>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: o.color }}/>
                  <span>{o.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Funil selector */}
      <div className="relative">
        <button className="filter-btn" onClick={() => setOpen(openMenu === 'funnel' ? null : 'funnel')}>
          <Icon name="git" size={12}/>
          <span>{selectedFunnel?.name ?? 'Selecionar funil'}</span>
          <Icon name="chevDown" size={12}/>
        </button>
        {openMenu === 'funnel' && (
          <div className="dd-menu">
            <div className="dd-head">Kanbans deste projeto</div>
            {funnels.map(f => (
              <div key={f.id} className="dd-item"
                   onClick={() => { onFunnel(f.id); setOpen(null); }}>
                <Icon name={selectedFunnelId === f.id ? 'check' : 'folder'} size={13}
                      style={{ color: selectedFunnelId === f.id ? 'var(--primary)' : 'var(--muted-fg)' }}/>
                <span>{f.name}</span>
                {f.is_default && <span className="chip muted" style={{ marginLeft: 'auto' }}>Padrão</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {activeFilterCount > 0 && (
        <button className="btn ghost" onClick={clear}>
          <Icon name="close" size={14}/> Limpar
        </button>
      )}

      <button className="btn primary icon" onClick={onNew} title="Nova demanda">
        <Icon name="plus" size={16}/>
      </button>
    </div>
  );
};

Object.assign(window, { Header, ViewTabs, BoardToolbar });
