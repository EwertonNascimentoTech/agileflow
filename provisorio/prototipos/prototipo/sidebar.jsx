// Rail (column 1) + ContextualSidebar (column 2)
// Mirrors AppLayout.tsx / ModuleRail.tsx / ContextualSidebar.tsx from the real code.

const { useState: useS_sb } = React;

const Rail = ({ active = 'projetos', onChange = () => {} }) => {
  const items = [
    { key: 'home',     label: 'Visão geral',      icon: 'layoutDash',    color: '#94A8C6' },
    { key: 'crm',      label: 'CRM',               icon: 'briefcase',     color: '#008BD2' },
    { key: 'projetos', label: 'Projetos',          icon: 'folder',        color: '#014898' },
    { key: 'estoque',  label: 'Estoque',           icon: 'package',       color: '#7C3AED' },
    { key: 'pdv',      label: 'PDV',               icon: 'trendingUp',    color: '#6AB42F' },
    { key: 'teamops',  label: 'Equipe',            icon: 'users',         color: '#E84E0F', notif: true },
  ];
  const bottom = [
    { key: 'settings', label: 'Configurações',     icon: 'settings' },
  ];

  const renderItem = (it) => (
    <button key={it.key}
            className={`rail-btn ${active === it.key ? 'active' : ''}`}
            onClick={() => onChange(it.key)}
            title={it.label}>
      <span className="icon-wrap"
            style={active === it.key && it.color ? { background: it.color + '22', color: it.color } : {}}>
        <Icon name={it.icon} size={18}/>
      </span>
      {it.notif && <span className="dot"/>}
      <span className="rail-tooltip">{it.label}</span>
    </button>
  );

  return (
    <nav className="rail" aria-label="Módulos">
      <div className="logo" title="AgileFlow">A</div>
      {items.map(renderItem)}
      <div className="rail-spacer"/>
      {bottom.map(renderItem)}
    </nav>
  );
};

// Contextual sidebar — shows current module's nav (Projetos by default)
const ContextualSidebar = ({ activeSection = 'board', onSection = () => {}, project }) => {
  // Nav sections for the Projetos module (mirrors moduleNavConfig.ts)
  const sections = [
    { key: 'overview', label: 'Visão geral',     icon: 'layoutDash' },
    { key: 'board',    label: 'Quadro',           icon: 'board' },
    { key: 'list',     label: 'Lista',            icon: 'list' },
    { key: 'gantt',    label: 'Gantt',            icon: 'gantt' },
    { key: 'cal',      label: 'Calendário',       icon: 'calendar' },
    { key: 'reports',  label: 'Relatórios',       icon: 'trendingUp' },
    { key: 'config',   label: 'Configurações',    icon: 'settings' },
  ];

  // Projects list under same module
  const projects = AppData.projects;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-icon"><Icon name="folder" size={16}/></div>
        <span className="sidebar-title">Projetos</span>
      </div>

      <div className="sidebar-scroll">
        {sections.map(s => (
          <div key={s.key}
               className={`sb-section ${activeSection === s.key ? 'active' : ''}`}
               onClick={() => onSection(s.key)}>
            <Icon name={s.icon} size={16}/>
            <span>{s.label}</span>
          </div>
        ))}

        <div className="sb-divider"/>
        <div className="sb-group-title">Projetos ativos</div>
        {projects.map(p => (
          <div key={p.id}
               className={`sb-section ${project === p.id ? 'active' : ''}`}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flexShrink: 0 }}/>
            <span style={{ flex: 1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
          </div>
        ))}
        <div className="sb-section" style={{ color: 'var(--muted-fg)' }}>
          <Icon name="plus" size={14}/>
          <span>Novo projeto</span>
        </div>
      </div>

      <div className="sidebar-foot">
        <div className="user-card">
          <div className="avatar">EN</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              Ewerton Nascimento
            </div>
            <div className="email" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              ewerton@sistemafiea.com.br
            </div>
          </div>
        </div>
        <button className="logout-btn">
          <Icon name="logOut" size={14}/>
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
};

Object.assign(window, { Rail, ContextualSidebar });
