/* ============================================================
   AgileFlow — UI shell, panels, styles
   ============================================================ */
(function(){
const { useState, useMemo, useRef, useEffect, PEOPLE, TYPES, STATUS,
  MONTHS, MONTHS_FULL, fmtShort, fmtLong, workdays, daysBetween, addDays, I } = window.AF;

/* ---------- Inject component CSS once ---------- */
const CSS = `
.app{display:grid;grid-template-columns:64px 264px 1fr;min-height:100vh;background:var(--bg);}

/* ---- icon rail ---- */
.rail{background:var(--rail);display:flex;flex-direction:column;align-items:center;padding:14px 0;gap:6px;}
.rail .logo{width:40px;height:40px;border-radius:10px;background:linear-gradient(150deg,#1f5fb8,#013a78);color:#fff;display:grid;place-items:center;font-weight:800;font-size:19px;box-shadow:0 4px 10px rgba(1,58,120,.5);margin-bottom:10px;}
.rail .ri{width:42px;height:42px;border-radius:10px;display:grid;place-items:center;color:#8ea6c9;transition:.16s var(--ease);}
.rail .ri:hover{background:var(--rail-soft);color:#dce8f7;}
.rail .ri.active{background:#1c3d6b;color:#fff;}
.rail .spacer{flex:1;}
.rail .ri.bottom{color:#6f86a8;}

/* ---- processos sidebar ---- */
.side{background:var(--card);border-right:1px solid var(--border);display:flex;flex-direction:column;}
.side-head{display:flex;align-items:center;gap:11px;padding:17px 18px;border-bottom:1px solid var(--border);}
.side-head .mark{width:34px;height:34px;border-radius:9px;background:var(--blue-50);color:var(--blue);display:grid;place-items:center;}
.side-head h1{font-size:17px;font-weight:800;margin:0;letter-spacing:-.01em;}
.side-head .kbd{margin-left:auto;font-size:11px;color:var(--faint);border:1px solid var(--border);border-radius:5px;padding:2px 6px;font-weight:600;}
.side-body{padding:14px 12px;overflow:auto;flex:1;}
.nav-item{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:7px;color:var(--muted);font-weight:600;font-size:14px;transition:.14s var(--ease);}
.nav-item:hover{background:#f3f5f8;color:var(--ink);}
.nav-label{font-size:11px;font-weight:800;letter-spacing:.09em;color:var(--faint);padding:18px 11px 8px;text-transform:uppercase;}
.kan{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:7px;color:var(--muted);font-weight:600;font-size:14px;transition:.14s var(--ease);cursor:pointer;}
.kan:hover{background:#f3f5f8;color:var(--ink);}
.kan.active{background:var(--blue-50);color:var(--blue);font-weight:700;}
.kan .dot{width:9px;height:9px;border-radius:50%;flex:none;}
.side-foot{border-top:1px solid var(--border);padding:12px;}
.user{display:flex;align-items:center;gap:11px;padding:7px 8px;border-radius:8px;}
.user:hover{background:#f3f5f8;}
.user .av{width:36px;height:36px;border-radius:9px;background:var(--blue);color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px;flex:none;}
.user .nm{font-size:13px;font-weight:700;line-height:1.25;overflow:hidden;}
.user .em{font-size:11px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;}

/* ---- top bar ---- */
.main{display:flex;flex-direction:column;min-width:0;position:relative;z-index:0;isolation:isolate;}
.topbar{height:64px;display:flex;align-items:center;gap:14px;padding:0 26px;border-bottom:1px solid var(--border);background:var(--card);}
.crumb{display:flex;align-items:center;gap:9px;font-size:14px;}
.crumb .c0{color:var(--muted);font-weight:600;}
.crumb .sep{color:#c3c9d2;}
.crumb .c1{color:var(--ink);font-weight:800;}
.topbar .grow{flex:1;}
.searchbox{display:flex;align-items:center;gap:9px;height:38px;padding:0 12px;border:1px solid var(--border);border-radius:9px;color:var(--faint);background:#fafbfc;min-width:230px;}
.searchbox span{font-size:13.5px;color:var(--muted);font-weight:500;}
.searchbox .kbd{margin-left:auto;font-size:11px;border:1px solid var(--border);border-radius:5px;padding:1px 6px;font-weight:600;color:var(--faint);}
.icon-btn{width:40px;height:40px;border-radius:9px;display:grid;place-items:center;color:var(--muted);transition:.14s var(--ease);}
.icon-btn:hover{background:#f3f5f8;color:var(--ink);}

/* ---- content / toolbar ---- */
.content{flex:1;overflow:auto;padding:22px 26px 30px;}
.workspace{background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-sm);overflow:hidden;display:flex;flex-direction:column;height:calc(100vh - 64px - 52px);min-height:560px;}
.toolbar{display:flex;flex-direction:column;align-items:stretch;gap:13px;padding:15px 18px;border-bottom:1px solid var(--border);}
.tb-line{display:flex;align-items:center;gap:12px;}
.tb-div{width:1px;height:24px;background:var(--border);margin:0 2px;}
.tb-title{display:flex;align-items:baseline;gap:9px;}
.tb-title h2{font-size:17px;font-weight:800;margin:0;letter-spacing:-.015em;}
.tb-title .proj{font-size:13px;color:var(--faint);font-weight:600;}
.selectish{display:flex;align-items:center;gap:8px;height:36px;padding:0 11px;border:1px solid var(--border);border-radius:8px;background:var(--card);font-size:13px;font-weight:600;color:var(--ink);transition:.14s var(--ease);white-space:nowrap;}
.selectish:hover{border-color:var(--border-strong);background:#fafbfc;}
.selectish .ic{color:var(--muted);}
.selectish .ch{color:var(--faint);margin-left:1px;}
.selectish .lbl{font-size:10.5px;color:var(--faint);font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-right:-2px;}
.seg{display:inline-flex;background:#eef0f3;border-radius:9px;padding:3px;gap:2px;}
.seg button{display:flex;align-items:center;gap:7px;height:30px;padding:0 13px;border-radius:7px;font-size:13px;font-weight:700;color:var(--muted);transition:.14s var(--ease);white-space:nowrap;}
.seg button.on{background:var(--card);color:var(--blue);box-shadow:var(--shadow-sm);}
.seg button:not(.on):hover{color:var(--ink);}
.tb-spacer{flex:1;}
.counter{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:8px;background:var(--blue-50);color:var(--blue);font-weight:700;font-size:13px;white-space:nowrap;}
.counter b{font-size:14px;}
.btn-primary{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 16px;border-radius:9px;background:var(--blue);color:#fff;font-weight:700;font-size:13.5px;box-shadow:0 2px 6px rgba(1,72,152,.28);transition:.15s var(--ease);white-space:nowrap;}
.btn-primary:hover{background:var(--blue-700);box-shadow:0 4px 12px rgba(1,72,152,.36);transform:translateY(-1px);}
.btn-ghost{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 13px;border-radius:9px;color:var(--muted);font-weight:700;font-size:13.5px;border:1px solid var(--border);transition:.14s var(--ease);}
.btn-ghost:hover{background:#f3f5f8;color:var(--ink);border-color:var(--border-strong);}

/* ---- legend ---- */
.legend{display:flex;align-items:center;gap:16px;padding:9px 18px;border-bottom:1px solid var(--border);background:#fcfcfd;}
.legend .lg-title{font-size:11px;font-weight:800;letter-spacing:.05em;color:var(--faint);text-transform:uppercase;}
.legend .lg{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--muted);}
.legend .sw{width:22px;height:11px;border-radius:3px;}
.legend .dep{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--muted);margin-left:auto;}

/* ---- avatar / badge ---- */
.avatar{border-radius:50%;color:#fff;display:grid;place-items:center;font-weight:700;flex:none;box-shadow:0 0 0 2px #fff;}
.badge{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:5px;font-size:11px;font-weight:700;letter-spacing:.01em;white-space:nowrap;}
.sla-dot{width:8px;height:8px;border-radius:50%;flex:none;}

/* ---- edit panel ---- */
.scrim{position:fixed;inset:0;background:rgba(15,23,40,.34);z-index:40;}
@keyframes fade{from{opacity:0}to{opacity:1}}
.panel{position:fixed;top:0;right:0;height:100vh;width:432px;background:#ffffff;box-shadow:var(--shadow-lg);z-index:41;display:flex;flex-direction:column;}
@keyframes slidein{from{transform:translateX(28px);opacity:.6}to{transform:translateX(0);opacity:1}}
.panel-head{padding:18px 20px;border-bottom:1px solid var(--border);}
.panel-head .row1{display:flex;align-items:center;gap:10px;margin-bottom:13px;}
.panel-head .ttl-eyebrow{font-size:11px;font-weight:800;letter-spacing:.06em;color:var(--faint);text-transform:uppercase;}
.panel-head input.title{width:100%;font-size:18px;font-weight:800;border:none;outline:none;color:var(--ink);padding:6px 2px;border-bottom:2px solid transparent;letter-spacing:-.01em;}
.panel-head input.title:focus{border-bottom-color:var(--blue);}
.panel-head .meta{display:flex;align-items:center;gap:8px;margin-top:10px;}
.panel-body{padding:18px 20px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:18px;}
.field label{display:block;font-size:11.5px;font-weight:800;letter-spacing:.03em;color:var(--muted);text-transform:uppercase;margin-bottom:7px;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.inp{display:flex;align-items:center;gap:9px;height:40px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:#fafbfc;transition:.14s var(--ease);}
.inp:focus-within{border-color:var(--blue);background:#fff;box-shadow:0 0 0 3px var(--blue-50);}
.inp input,.inp select{border:none;outline:none;background:none;font-size:14px;font-weight:600;color:var(--ink);width:100%;}
.inp .ic{color:var(--muted);flex:none;}
.hint{font-size:12px;color:var(--faint);margin-top:7px;display:flex;align-items:center;gap:6px;font-weight:600;}
.hint b{color:var(--blue);font-weight:800;}
.owner-row{display:flex;align-items:center;gap:10px;height:40px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:#fafbfc;}
.owner-row select{border:none;outline:none;background:none;font-size:14px;font-weight:600;flex:1;}
.dep{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:#fafbfc;}
.dep .dep-ic{width:26px;height:26px;border-radius:6px;display:grid;place-items:center;background:#eef0f3;color:var(--muted);flex:none;}
.dep .dep-info{flex:1;min-width:0;}
.dep .dep-info .t{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dep .dep-info .s{font-size:11.5px;color:var(--faint);font-weight:600;}
.dep .rm{width:24px;height:24px;border-radius:6px;display:grid;place-items:center;color:var(--faint);}
.dep .rm:hover{background:var(--orange-50);color:var(--orange);}
.add-dep{display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;border:1px dashed var(--border-strong);border-radius:8px;color:var(--muted);font-weight:700;font-size:13px;justify-content:center;transition:.14s var(--ease);}
.add-dep:hover{border-color:var(--blue);color:var(--blue);background:var(--blue-50);}
.panel-foot{padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:10px;}
.panel-foot .btn-primary{flex:1;justify-content:center;}

/* ---- empty state ---- */
.empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;}
.empty h3{font-size:20px;font-weight:800;margin:20px 0 10px;letter-spacing:-.01em;line-height:1.3;}
.empty p{font-size:14px;color:var(--muted);max-width:380px;line-height:1.55;margin:0 0 22px;font-weight:500;}

/* ---- recursos ---- */
.recursos{flex:1;overflow:auto;padding:20px 22px;}
.res-row{display:grid;grid-template-columns:230px 1fr 90px;align-items:center;gap:16px;padding:13px 14px;border:1px solid var(--border);border-radius:10px;margin-bottom:10px;background:var(--card);transition:.14s var(--ease);}
.res-row:hover{box-shadow:var(--shadow-sm);border-color:var(--border-strong);}
.res-person{display:flex;align-items:center;gap:11px;min-width:0;}
.res-person .txt{min-width:0;}
.res-person .nm{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3;}
.res-person .rl{font-size:12px;color:var(--faint);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3;}
.res-bar{height:14px;border-radius:7px;background:#eef0f3;overflow:hidden;position:relative;}
.res-bar i{display:block;height:100%;border-radius:7px;}
.res-meta{text-align:right;font-weight:800;font-size:14px;}
.res-meta small{display:block;font-size:11px;color:var(--faint);font-weight:600;}
`;
if(!document.getElementById("af-css")){ const s=document.createElement("style"); s.id="af-css"; s.textContent=CSS; document.head.appendChild(s); }

/* ---------- Avatar ---------- */
function Avatar({ who, size=26, ring=true }){
  if(!who) return <div className="avatar" style={{width:size,height:size,background:"#eef0f3",color:"#94a0b0",boxShadow:ring?"0 0 0 2px #fff":"none",fontSize:size*0.42}}>?</div>;
  const p = PEOPLE[who];
  return <div className="avatar" title={p.name} style={{width:size,height:size,background:p.color,fontSize:size*0.4,boxShadow:ring?"0 0 0 2px #fff":"none"}}>{p.initials}</div>;
}
function TypeBadge({ t }){ const x=TYPES[t]; return <span className="badge" style={{background:x.bg,color:x.fg}}>{x.label}</span>; }

/* ---------- Sidebar (rail + processos) ---------- */
function Sidebar(){
  const kanbans=[
    {dot:"#7C3AED",label:"Solicitações",active:true},
    {dot:"#008BD2",label:"Projetos / Programas"},
    {dot:"#7C3AED",label:"Features"},
    {dot:"#6AB42F",label:"US - User Story"},
    {dot:"#0F766E",label:"DevSecOps"},
  ];
  return (
    <React.Fragment>
      <nav className="rail">
        <div className="logo">A</div>
        <div className="ri"><I.grid/></div>
        <div className="ri active"><I.folder/></div>
        <div className="ri"><I.people/></div>
        <div className="spacer"></div>
        <div className="ri bottom"><I.gear/></div>
      </nav>
      <aside className="side">
        <div className="side-head">
          <div className="mark"><I.folder/></div>
          <h1>Processos</h1>
          <span className="kbd">⌘P</span>
        </div>
        <div className="side-body">
          <div className="nav-item"><I.report/> Relatórios</div>
          <div className="nav-item"><I.gear/> Configurações</div>
          <div className="nav-label">Kanbans ativos</div>
          {kanbans.map((k,i)=>(
            <div key={i} className={"kan"+(k.active?" active":"")}>
              <span className="dot" style={{background:k.dot}}></span>{k.label}
            </div>
          ))}
        </div>
        <div className="side-foot">
          <div className="user">
            <div className="av">EC</div>
            <div style={{minWidth:0}}>
              <div className="nm">Ewerton Costa do Nas…</div>
              <div className="em">ewerton.nascimento@sistemafiea…</div>
            </div>
          </div>
          <div className="nav-item" style={{marginTop:4}}><I.logout/> Sair</div>
        </div>
      </aside>
    </React.Fragment>
  );
}

/* ---------- Top bar ---------- */
function Topbar(){
  return (
    <header className="topbar">
      <div className="crumb">
        <span className="c0">Processos</span>
        <span className="sep">›</span>
        <span className="c1">Solicitações</span>
      </div>
      <div className="grow"></div>
      <div className="searchbox"><I.search/><span>Buscar</span><span className="kbd">⌘K</span></div>
      <button className="icon-btn"><I.moon/></button>
      <button className="icon-btn"><I.bell/></button>
    </header>
  );
}

window.AFUI = { Avatar, TypeBadge, Sidebar, Topbar };
})();
