// Main App — wires the AgileFlow shell (Rail + ContextualSidebar + Header + Views)

const { useState: useA, useEffect: useAE, useMemo: useAM } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "normal",
  "primaryColor": "#014898",
  "cardStyle": "default"
}/*EDITMODE-END*/;

const PRIMARY_OPTIONS = ['#014898', '#008BD2', '#6AB42F', '#E84E0F', '#7C3AED', '#0F766E'];

const App = () => {
  const tk = useTweaks(TWEAK_DEFAULTS);
  const tweak = tk[0]; const setTweak = tk[1];

  const [tasks, setTasks] = useA(AppData.tasks);
  const [activeView, setActiveView] = useA('board');
  const [activeProject, setActiveProject] = useA('p-marketing');
  const [activeSection, setActiveSection] = useA('board');
  const [selectedFunnelId, setFunnel] = useA('f-triagem');
  const [openTask, setOpenTask] = useA(null);
  const [filters, setFilters] = useA({ assignee: [], type: [], sla: [] });
  const [query, setQuery] = useA('');

  // Apply theme, density, primary
  useAE(() => {
    document.documentElement.setAttribute('data-theme', tweak.theme);
    document.documentElement.setAttribute('data-density', tweak.density);
    document.documentElement.setAttribute('data-card-style', tweak.cardStyle);
    document.documentElement.style.setProperty('--primary', tweak.primaryColor);
  }, [tweak.theme, tweak.density, tweak.cardStyle, tweak.primaryColor]);

  // Esc closes drawer
  useAE(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpenTask(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Sync activeSection ↔ activeView
  useAE(() => {
    if (['board','list','gantt','cal'].includes(activeSection)) setActiveView(activeSection);
  }, [activeSection]);

  // Project + funnels
  const project = AppData.projects.find(p => p.id === activeProject);
  const funnels = useAM(() => AppData.funnels.filter(f => f.project_id === activeProject), [activeProject]);

  // If funnel changes (or project changes) reset to default
  useAE(() => {
    if (!funnels.find(f => f.id === selectedFunnelId)) {
      const def = funnels.find(f => f.is_default) ?? funnels[0];
      if (def) setFunnel(def.id);
    }
  }, [funnels, selectedFunnelId]);

  // Filtering
  const filtered = useAM(() => {
    return tasks.filter(t => {
      if (t.funnel_id !== selectedFunnelId) return false;
      if (filters.assignee.length && !filters.assignee.includes(t.assigned_to)) return false;
      if (filters.type.length && !filters.type.includes(t.demand_type_id)) return false;
      if (filters.sla.length && !filters.sla.includes(t.sla_state ?? 'none')) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filters, query, selectedFunnelId]);

  const openTaskLive = openTask ? tasks.find(t => t.id === openTask.id) ?? openTask : null;

  return (
    <div className="app">
      <Rail/>
      <ContextualSidebar activeSection={activeSection} onSection={setActiveSection} project={activeProject}/>
      <div className="main-col">
        <Header project={project} activeSection={activeSection}
                theme={tweak.theme}
                onTheme={() => setTweak('theme', tweak.theme === 'light' ? 'dark' : 'light')}/>

        {/* Inline view tabs on top of canvas */}
        <ViewTabs active={activeView} onChange={(v) => { setActiveView(v); setActiveSection(v); }}
                  counts={{ board: filtered.length }}/>

        {/* Toolbar shows on board / list. Gantt has its own toolbar. */}
        {activeView !== 'gantt' && activeView !== 'cal' && (
          <div style={{ padding: '16px 24px 0' }}>
            <BoardToolbar
              funnels={funnels} selectedFunnelId={selectedFunnelId} onFunnel={setFunnel}
              filters={filters} onFilter={setFilters}
              query={query} onQuery={setQuery}
              totalTasks={filtered.length}/>
          </div>
        )}

        {activeView === 'board' && (
          <KanbanView tasks={filtered} setTasks={setTasks} onOpen={setOpenTask} funnelId={selectedFunnelId}/>
        )}
        {activeView === 'list' && (
          <ListView tasks={filtered} onOpen={setOpenTask} funnelId={selectedFunnelId}/>
        )}
        {activeView === 'gantt' && (
          <GanttView allTasks={tasks}
                     onOpen={setOpenTask}
                     onUpdateTask={(id, patch) => setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))}/>
        )}
        {activeView === 'cal' && (
          <CalendarView tasks={filtered} onOpen={setOpenTask}/>
        )}
      </div>

      {openTaskLive && <TaskDetail task={openTaskLive} onClose={() => setOpenTask(null)}/>}

      <AgileTweaks tweak={tweak} setTweak={setTweak}/>
    </div>
  );
};

const AgileTweaks = ({ tweak, setTweak }) => (
  <TweaksPanel title="Tweaks · AgileFlow">
    <TweakSection label="Tema & cor">
      <TweakRadio label="Tema" value={tweak.theme} onChange={v => setTweak('theme', v)}
                  options={['light','dark']}/>
      <TweakColor label="Cor primária"
                  value={tweak.primaryColor}
                  onChange={v => setTweak('primaryColor', v)}
                  options={PRIMARY_OPTIONS}/>
    </TweakSection>
    <TweakSection label="Layout">
      <TweakRadio label="Densidade"
                  value={tweak.density}
                  onChange={v => setTweak('density', v)}
                  options={['compact','normal','spacious']}/>
    </TweakSection>
  </TweaksPanel>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
