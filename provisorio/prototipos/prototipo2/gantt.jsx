/* ============================================================
   AgileFlow — Gantt chart, edit panel, app
   ============================================================ */
(function(){
const { useState, useMemo, useRef, useEffect, useLayoutEffect,
  PEOPLE, TYPES, STATUS, TREE, MONTHS, MONTHS_FULL, WD,
  RANGE_START, RANGE_END, TODAY, TOTAL_DAYS,
  pd, iso, addDays, daysBetween, isWeekend, fmtShort, fmtLong, workdays, flatten, findNode, I } = window.AF;
const { Avatar, TypeBadge, Sidebar, Topbar } = window.AFUI;

const ROW_H = 52, HEAD_H = 64, BAR_H = 22, IND = 14, STEP = 18, LW = 376;
const DW = { week: 20, day: 44 };

/* inject gantt-specific css */
const GCSS = `
.gantt{flex:1;display:flex;flex-direction:column;min-height:0;}
.gscroll{flex:1;overflow:auto;position:relative;}
.ginner{position:relative;}
.hrow{display:flex;position:relative;z-index:4;}
.corner{position:sticky;left:0;top:0;z-index:6;background:var(--card);border-right:1px solid var(--border);border-bottom:1px solid var(--border);display:flex;align-items:flex-end;padding:0 16px 10px;}
.corner .lbl{font-size:11px;font-weight:800;letter-spacing:.06em;color:var(--faint);text-transform:uppercase;}
.thead{position:sticky;top:0;z-index:3;background:var(--card);border-bottom:1px solid var(--border);}
.thead .months{display:flex;height:28px;border-bottom:1px solid #f0f1f4;}
.thead .mo{display:flex;align-items:center;padding-left:10px;font-size:12px;font-weight:800;color:var(--ink);border-right:1px solid var(--border);letter-spacing:.01em;}
.thead .subs{position:relative;height:36px;}
.thead .wk{position:absolute;top:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--muted);border-right:1px solid #f0f1f4;}
.thead .day{position:absolute;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--muted);gap:1px;}
.thead .day .wd{font-size:9px;color:var(--faint);font-weight:700;}
.thead .day.we{background:#f6f7f9;color:#aeb6c0;}
.thead .day.we .wd{color:#c3c9d2;}

.grow-row{display:flex;position:relative;z-index:2;}
.lcell{position:sticky;left:0;z-index:2;width:${LW}px;flex:none;background:var(--card);border-right:1px solid var(--border);border-bottom:1px solid #f1f2f4;}
.tcell{flex:none;border-bottom:1px solid #f4f5f7;}
.grow-row:hover .lcell{background:#fbfcfd;}

/* left row */
.lrow{position:relative;height:${ROW_H}px;display:flex;align-items:center;}
.lrow .guides i{position:absolute;}
.g-v{top:0;bottom:0;width:1.5px;background:#e7eaee;}
.g-elbow{top:0;height:${ROW_H/2}px;width:13px;border-left:1.5px solid #dbe0e6;border-bottom:1.5px solid #dbe0e6;border-bottom-left-radius:7px;}
.lrow .grip{position:absolute;left:-1px;width:16px;height:26px;display:grid;place-items:center;color:#c2c9d2;opacity:0;cursor:grab;transition:.12s;}
.lrow:hover .grip{opacity:1;}
.lrow .grip:active{cursor:grabbing;}
.lrow .chev{width:18px;height:18px;display:grid;place-items:center;color:var(--muted);border-radius:5px;flex:none;transition:.14s;}
.lrow .chev:hover{background:#eef0f3;color:var(--ink);}
.lrow .chev svg{transition:transform .16s var(--ease);}
.lrow .chev.open svg{transform:rotate(90deg);}
.lrow .chev.leaf{visibility:hidden;}
.lrow .lmain{flex:1;min-width:0;margin-left:9px;}
.lrow .tline{display:flex;align-items:center;gap:8px;min-width:0;}
.lrow .title{font-size:13.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;letter-spacing:-.005em;}
.lrow.epic .title{font-weight:800;}
.lrow .title:hover{color:var(--blue);}
.lrow .dates{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:11.5px;color:var(--faint);font-weight:600;}
.lrow .dates .nodate{color:#b6bcc6;font-style:italic;}
.lrow .dates .ar{color:#cbd0d8;}
.lrow .dates .chip{cursor:pointer;padding:1px 4px;border-radius:4px;}
.lrow .dates .chip:hover{background:var(--blue-50);color:var(--blue);}
.lrow .acts{display:flex;align-items:center;gap:2px;padding-right:12px;padding-left:8px;opacity:0;transition:.12s;background:linear-gradient(90deg,transparent,var(--card) 22%);position:absolute;right:0;height:100%;}
.grow-row:hover .acts{opacity:1;}
.lrow .acts.always{opacity:1;}
.lrow .act{width:26px;height:26px;border-radius:6px;display:grid;place-items:center;color:var(--faint);}
.lrow .act.add:hover{background:var(--blue-50);color:var(--blue);}
.lrow .act.del:hover{background:var(--orange-50);color:var(--orange);}
.lrow .sla{position:absolute;left:0;top:13px;bottom:13px;width:3px;border-radius:0 3px 3px 0;}

/* overlay */
.overlay{position:absolute;z-index:1;pointer-events:none;}
.gridbg{position:absolute;inset:0;pointer-events:none;}
.gridbg .we{position:absolute;top:0;bottom:0;background:#fafbfc;}
.gridbg .gl{position:absolute;top:0;bottom:0;width:1px;background:#f1f2f4;}
.gridbg .rl{position:absolute;left:0;right:0;height:1px;background:#f4f5f7;}
.today{position:absolute;top:0;bottom:0;width:2px;background:var(--orange);z-index:3;pointer-events:none;}
.today .flag{position:absolute;top:0;left:50%;transform:translateX(-50%);background:var(--orange);color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:0 0 6px 6px;white-space:nowrap;letter-spacing:.02em;}
.arrows{position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:2;}

/* bar */
.bar{position:absolute;height:${BAR_H}px;border-radius:6px;pointer-events:auto;cursor:grab;display:flex;align-items:center;overflow:hidden;transition:box-shadow .14s,filter .14s;}
.bar:hover{box-shadow:0 4px 12px rgba(16,24,40,.22);filter:saturate(1.05);z-index:5;}
.bar.dragging{box-shadow:0 8px 22px rgba(16,24,40,.28);cursor:grabbing;z-index:6;}
.bar .fill{position:absolute;left:0;top:0;bottom:0;border-radius:6px 0 0 6px;}
.bar .blabel{position:relative;z-index:1;font-size:11px;font-weight:800;padding:0 8px;white-space:nowrap;}
.bar .hnd{position:absolute;top:0;bottom:0;width:9px;display:grid;place-items:center;cursor:ew-resize;opacity:0;z-index:2;}
.bar:hover .hnd{opacity:1;}
.bar .hnd::before{content:"";width:3px;height:12px;border-radius:2px;background:rgba(255,255,255,.9);box-shadow:0 0 0 1px rgba(0,0,0,.06);}
.bar .hnd.l{left:0;}
.bar .hnd.r{right:0;}
.barside{position:absolute;height:${BAR_H}px;display:flex;align-items:center;gap:6px;pointer-events:none;font-size:11px;font-weight:700;color:var(--muted);}
.barside .pct{font-variant-numeric:tabular-nums;}

/* epic summary bar */
.ebar{position:absolute;pointer-events:auto;cursor:pointer;}
.ebar .track{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:8px;border-radius:4px;}
.ebar .cap{position:absolute;top:50%;width:2px;height:15px;transform:translateY(-50%);border-radius:1px;}
.ebar .cap.l{left:0;} .ebar .cap.r{right:0;}
.ebar .efill{position:absolute;left:0;top:50%;transform:translateY(-50%);height:8px;border-radius:4px;}
.ebar:hover{filter:brightness(.95);}

/* tooltip */
.tip{position:fixed;z-index:60;background:#10182a;color:#fff;border-radius:9px;padding:11px 13px;box-shadow:0 12px 30px rgba(0,0,0,.32);width:228px;pointer-events:none;animation:fade .12s var(--ease);}
.tip .th{display:flex;align-items:center;gap:8px;margin-bottom:9px;}
.tip .th .t{font-size:13px;font-weight:800;line-height:1.2;}
.tip .trow{display:flex;align-items:center;justify-content:space-between;font-size:12px;margin-top:6px;color:#c4ccda;font-weight:600;}
.tip .trow b{color:#fff;font-weight:700;}
.tip .pbar{height:6px;border-radius:4px;background:rgba(255,255,255,.16);margin-top:9px;overflow:hidden;}
.tip .pbar i{display:block;height:100%;border-radius:4px;}
.tip .slatag{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;padding:2px 7px;border-radius:5px;}
.tip .arrow{position:absolute;width:10px;height:10px;background:#10182a;transform:rotate(45deg);}
`;
if(!document.getElementById("af-gcss")){ const s=document.createElement("style"); s.id="af-gcss"; s.textContent=GCSS; document.head.appendChild(s); }

/* ---------- Toolbar ---------- */
function Toolbar({ scale, setScale, view, setView, project, setProject, count, onAdd }){
  return (
    <div className="toolbar">
      <div className="tb-line">
        <div className="tb-title"><h2>Cronograma do projeto</h2><span className="proj">/ Transformação Digital</span></div>
        <div className="tb-spacer"></div>
        <span className="counter"><b>{count}</b> demandas</span>
        <button className="btn-primary" onClick={onAdd}><I.plus/> Adicionar etapa</button>
      </div>
      <div className="tb-line">
        <button className="selectish" onClick={()=>setProject(project==="portal"?"empty":"portal")}>
          <I.folder className="ic"/>
          <span className="lbl">Projeto</span>
          {project==="portal" ? "Portal do Cliente" : "App de Pagamentos"}
          <I.chevron className="ch" style={{transform:"rotate(90deg)"}}/>
        </button>
        <button className="selectish">
          <I.branch className="ic"/>
          <span className="lbl">Programa</span>
          Transformação Digital
          <I.chevron className="ch" style={{transform:"rotate(90deg)"}}/>
        </button>
        <div className="tb-div"></div>
        <div className="seg">
          <button className={scale==="day"?"on":""} onClick={()=>setScale("day")}>Dia</button>
          <button className={scale==="week"?"on":""} onClick={()=>setScale("week")}>Semana</button>
        </div>
        <div className="seg">
          <button className={view==="crono"?"on":""} onClick={()=>setView("crono")}><I.cal/>Cronograma</button>
          <button className={view==="recursos"?"on":""} onClick={()=>setView("recursos")}><I.people/>Recursos</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Legend ---------- */
function Legend(){
  return (
    <div className="legend">
      <span className="lg-title">SLA</span>
      <span className="lg"><span className="sw" style={{background:STATUS.ontrack.color}}></span>No prazo</span>
      <span className="lg"><span className="sw" style={{background:STATUS.done.color}}></span>Concluída</span>
      <span className="lg"><span className="sw" style={{background:STATUS.risk.color}}></span>Em risco / atrasada</span>
      <span className="dep">
        <svg width="34" height="12"><path d="M2 6h22" stroke="#9aa3b0" strokeWidth="1.6" fill="none"/><path d="M24 2l5 4-5 4" stroke="#9aa3b0" strokeWidth="1.6" fill="none" strokeLinejoin="round" strokeLinecap="round"/></svg>
        Dependência (Fim → Início)
      </span>
    </div>
  );
}

/* ---------- Bar (task) ---------- */
function Bar({ node, dw, y, onDown, onOpen, onTip, onTipOut }){
  const st = STATUS[node.status];
  const x = daysBetween(RANGE_START, node.start) * dw;
  const w = (daysBetween(node.start, node.end) + 1) * dw;
  const top = y + (ROW_H - BAR_H) / 2;
  const pct = node.progress;
  return (
    <React.Fragment>
      <div className={"bar"+(node._drag?" dragging":"")}
        style={{ left:x+1, top, width:Math.max(w-2,10), background:st.soft, boxShadow:"inset 0 0 0 1.5px "+st.color+"33" }}
        onPointerDown={(e)=>onDown(e,node,"move")}
        onClick={()=>onOpen(node.id)}
        onMouseMove={(e)=>onTip(e,node)} onMouseLeave={onTipOut}>
        <div className="fill" style={{ width:pct+"%", background:st.color }}></div>
        <span className="blabel" style={{ color: pct>55 ? "#fff" : st.color }}>{pct}%</span>
        <div className="hnd l" onPointerDown={(e)=>onDown(e,node,"l")}></div>
        <div className="hnd r" onPointerDown={(e)=>onDown(e,node,"r")}></div>
      </div>
      <div className="barside" style={{ left:x+w+9, top }}>
        <Avatar who={node.owner} size={20} />
      </div>
    </React.Fragment>
  );
}

/* ---------- Epic summary bar ---------- */
function EpicBar({ node, dw, y, onOpen, onTip, onTipOut }){
  const st = STATUS[node.status];
  const x = daysBetween(RANGE_START, node.start) * dw;
  const w = (daysBetween(node.start, node.end) + 1) * dw;
  return (
    <div className="ebar" style={{ left:x, top:y, width:w, height:ROW_H }}
      onClick={()=>onOpen(node.id)} onMouseMove={(e)=>onTip(e,node)} onMouseLeave={onTipOut}>
      <div className="track" style={{ background:"#d4dae2" }}></div>
      <div className="efill" style={{ width:node.progress+"%", background:st.color }}></div>
      <div className="cap l" style={{ background:"#7a8596" }}></div>
      <div className="cap r" style={{ background:"#7a8596" }}></div>
    </div>
  );
}

/* ---------- Dependency arrows ---------- */
function Arrows({ rows, rowIndex, dw, getNode }){
  const paths = [];
  rows.forEach((r)=>{
    const n = getNode(r.id);
    if(!n.deps) return;
    n.deps.forEach((dep)=>{
      if(rowIndex[dep]===undefined || rowIndex[r.id]===undefined) return;
      const p = getNode(dep);
      const px = daysBetween(RANGE_START, p.start)*dw;
      const pw = (daysBetween(p.start,p.end)+1)*dw;
      const x2 = px + pw, yp = rowIndex[dep]*ROW_H + ROW_H/2;
      const sx = daysBetween(RANGE_START, n.start)*dw;
      const x1 = sx, ys = rowIndex[r.id]*ROW_H + ROW_H/2;
      let d;
      if(x1 > x2 + 14){
        d = `M${x2} ${yp} H${x2+9} V${ys} H${x1-3}`;
      } else {
        const mid = (yp+ys)/2;
        d = `M${x2} ${yp} H${x2+9} V${mid} H${x1-12} V${ys} H${x1-3}`;
      }
      paths.push(<path key={dep+">"+r.id} d={d} fill="none" stroke="#aab2bf" strokeWidth="1.5" />);
      paths.push(<path key={dep+">"+r.id+"h"} d={`M${x1-3} ${ys} l-5 -3.2 v6.4 z`} fill="#8b95a3" />);
    });
  });
  return <svg className="arrows">{paths}</svg>;
}

/* ---------- Tooltip ---------- */
function Tip({ data }){
  if(!data) return null;
  const { node, x, y } = data;
  const st = STATUS[node.status];
  const p = PEOPLE[node.owner];
  return (
    <div className="tip" style={{ left:x, top:y }}>
      <div className="th">
        <span className="slatag" style={{ background:st.color+"26", color:st.color }}>
          <span className="sla-dot" style={{ background:st.color }}></span>{st.label}
        </span>
      </div>
      <div className="th" style={{ marginBottom:6 }}><span className="t">{node.title}</span></div>
      <div className="trow"><span>Período</span><b>{fmtShort(node.start)} → {fmtShort(node.end)}</b></div>
      <div className="trow"><span>Responsável</span><b>{p? p.name : "—"}</b></div>
      <div className="trow"><span>Concluído</span><b>{node.progress}%</b></div>
      <div className="pbar"><i style={{ width:node.progress+"%", background:st.color }}></i></div>
    </div>
  );
}

/* ---------- Left list row ---------- */
function ListRow({ r, node, collapsed, onToggle, onOpen, onAdd, onDel, selected }){
  const st = STATUS[node.status];
  const isEpic = node.type==="epic";
  const pl = IND + r.level*STEP + (r.level>0?18:4);
  return (
    <div className={"lrow"+(isEpic?" epic":"")} style={{ background: selected? "var(--blue-50)":"transparent" }}>
      <span className="sla" style={{ background:st.color }}></span>
      <div className="guides">
        {r.ancestorLines.map((show,d)=> show ? <i key={d} className="g-v" style={{ left: IND + d*STEP + 6 }}></i> : null)}
        {r.level>0 && <i className="g-elbow" style={{ left: IND + (r.level-1)*STEP + 6 }}></i>}
      </div>
      <button className="grip" title="Arrastar para reordenar"><I.grip/></button>
      <div style={{ display:"flex", alignItems:"center", paddingLeft:pl, width:"100%", minWidth:0 }}>
        <button className={"chev"+(r.hasKids?"":" leaf")+(!collapsed.has(node.id)?" open":"")}
          onClick={()=>onToggle(node.id)}><I.chevron/></button>
        <Avatar who={node.owner} size={26} />
        <div className="lmain">
          <div className="tline">
            <span className="title" onClick={()=>onOpen(node.id)} title={node.title}>{node.title}</span>
            <TypeBadge t={node.type} />
          </div>
          <div className="dates">
            <I.cal style={{ color:"#c4cad3" }}/>
            <span className="chip" onClick={()=>onOpen(node.id)}>{fmtShort(node.start)}</span>
            <span className="ar">→</span>
            <span className="chip" onClick={()=>onOpen(node.id)}>{fmtShort(node.end)}</span>
          </div>
        </div>
      </div>
      <div className="acts">
        <button className="act add" title="Adicionar sub-etapa" onClick={()=>onAdd(node.id)}><I.plus/></button>
        <button className="act del" title="Excluir" onClick={()=>onDel(node.id)}><I.trash/></button>
      </div>
    </div>
  );
}

/* ---------- Gantt chart ---------- */
function GanttChart({ scale, rows, rowIndex, getNode, collapsed, onToggle, onOpen, onAdd, onDel, selectedId, onDrag, tip, setTip }){
  const dw = DW[scale];
  const TLW = TOTAL_DAYS * dw;
  const bodyH = rows.length * ROW_H;
  const scrollRef = useRef(null);

  useEffect(()=>{
    if(scrollRef.current){
      const todayX = daysBetween(RANGE_START, TODAY) * dw;
      scrollRef.current.scrollLeft = Math.max(0, todayX - LW);
    }
  }, [scale]);

  /* month header segments */
  const months = [];
  { let cur = pd(RANGE_START); cur.setDate(1);
    while(cur <= pd(RANGE_END)){
      const first = iso(cur);
      const nx = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
      const s = Math.max(0, daysBetween(RANGE_START, first));
      const e = Math.min(TOTAL_DAYS, daysBetween(RANGE_START, iso(nx)));
      months.push({ label: MONTHS_FULL[cur.getMonth()]+" "+cur.getFullYear(), left:s*dw, width:(e-s)*dw });
      cur = nx;
    }
  }
  /* sub header */
  const subs = [];
  if(scale==="week"){
    let cur = pd(RANGE_START);
    while(cur.getDay()!==1) cur.setDate(cur.getDate()-1); // back to Monday
    while(cur <= pd(RANGE_END)){
      const ws = iso(cur);
      const off = daysBetween(RANGE_START, ws);
      subs.push({ left: off*dw, width: 7*dw, label: fmtShort(ws) });
      cur.setDate(cur.getDate()+7);
    }
  } else {
    for(let i=0;i<TOTAL_DAYS;i++){
      const d = addDays(RANGE_START, i);
      subs.push({ left:i*dw, width:dw, label:String(pd(d).getDate()), wd:WD[pd(d).getDay()], we:isWeekend(d), day:true });
    }
  }
  /* weekend bands + gridlines */
  const bands=[], glines=[];
  for(let i=0;i<TOTAL_DAYS;i++){
    if(isWeekend(addDays(RANGE_START,i))) bands.push({ left:i*dw, width:dw });
  }
  const glStep = scale==="week" ? 7 : 1;
  for(let i=0;i<=TOTAL_DAYS;i+=glStep) glines.push(i*dw);
  const todayX = daysBetween(RANGE_START, TODAY) * dw;

  return (
    <div className="gantt">
      <div className="gscroll" ref={scrollRef}>
        <div className="ginner" style={{ width: LW + TLW, height: HEAD_H + bodyH }}>
          {/* header */}
          <div className="hrow" style={{ height: HEAD_H }}>
            <div className="corner" style={{ width:LW, height:HEAD_H }}><span className="lbl">Item / Etapa</span></div>
            <div className="thead" style={{ width:TLW, height:HEAD_H }}>
              <div className="months">
                {months.map((m,i)=><div key={i} className="mo" style={{ width:m.width }}>{m.label}</div>)}
              </div>
              <div className="subs">
                {scale==="week"
                  ? subs.map((s,i)=><div key={i} className="wk" style={{ left:s.left, width:s.width }}>{s.label}</div>)
                  : subs.map((s,i)=><div key={i} className={"day"+(s.we?" we":"")} style={{ left:s.left, width:s.width }}><span>{s.label}</span><span className="wd">{s.wd}</span></div>)
                }
              </div>
            </div>
          </div>

          {/* rows */}
          {rows.map((r)=>{
            const node = getNode(r.id);
            return (
              <div className="grow-row" key={r.id}>
                <div className="lcell">
                  <ListRow r={r} node={node} collapsed={collapsed} onToggle={onToggle}
                    onOpen={onOpen} onAdd={onAdd} onDel={onDel} selected={selectedId===r.id}/>
                </div>
                <div className="tcell" style={{ width:TLW, height:ROW_H }}></div>
              </div>
            );
          })}

          {/* overlay (grid + bars + arrows + today) */}
          <div className="overlay" style={{ left:LW, top:HEAD_H, width:TLW, height:bodyH }}>
            <div className="gridbg">
              {bands.map((b,i)=><div key={"b"+i} className="we" style={{ left:b.left, width:b.width }}></div>)}
              {glines.map((x,i)=><div key={"g"+i} className="gl" style={{ left:x }}></div>)}
              {rows.map((r,i)=><div key={"r"+i} className="rl" style={{ top:(i+1)*ROW_H }}></div>)}
            </div>
            <Arrows rows={rows} rowIndex={rowIndex} dw={dw} getNode={getNode} />
            {rows.map((r)=>{
              const node = getNode(r.id);
              const y = rowIndex[r.id]*ROW_H;
              return node.type==="epic"
                ? <EpicBar key={r.id} node={node} dw={dw} y={y} onOpen={onOpen} onTip={(e,n)=>setTip(mkTip(e,n))} onTipOut={()=>setTip(null)} />
                : <Bar key={r.id} node={node} dw={dw} y={y} onDown={onDrag} onOpen={onOpen} onTip={(e,n)=>setTip(mkTip(e,n))} onTipOut={()=>setTip(null)} />;
            })}
            <div className="today" style={{ left:todayX }}><span className="flag">HOJE</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
function mkTip(e, node){
  return { node, x: Math.min(e.clientX+16, window.innerWidth-244), y: Math.max(e.clientY-150, 12) };
}

/* ---------- Edit panel ---------- */
function EditPanel({ node, getNode, allRows, onClose, onChange }){
  if(!node) return null;
  const wd = workdays(node.start, node.end);
  const hours = (node.hours!=null) ? node.hours : wd*8;
  const candidates = allRows.filter(r=> r.id!==node.id && getNode(r.id).type!=="epic");
  const [addOpen, setAddOpen] = useState(false);
  const deps = node.deps || [];
  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose}></div>
      <aside className="panel" role="dialog" aria-label="Edição rápida">
        <div className="panel-head">
          <div className="row1">
            <span className="ttl-eyebrow">Edição rápida</span>
            <div style={{ flex:1 }}></div>
            <button className="icon-btn" style={{ width:32, height:32 }} onClick={onClose}><I.x/></button>
          </div>
          <input className="title" value={node.title} onChange={(e)=>onChange(node.id,{title:e.target.value})}/>
          <div className="meta">
            <TypeBadge t={node.type}/>
            <span className="slatag" style={{ background:STATUS[node.status].color+"1f", color:STATUS[node.status].color, display:"inline-flex", alignItems:"center", gap:5, fontSize:11, fontWeight:800, padding:"3px 8px", borderRadius:6 }}>
              <span className="sla-dot" style={{ background:STATUS[node.status].color }}></span>{STATUS[node.status].label}
            </span>
          </div>
        </div>
        <div className="panel-body">
          <div className="grid2">
            <div className="field">
              <label>Início</label>
              <div className="inp"><I.cal className="ic"/><input type="date" value={node.start} onChange={(e)=>onChange(node.id,{start:e.target.value})}/></div>
            </div>
            <div className="field">
              <label>Vencimento</label>
              <div className="inp"><I.cal className="ic"/><input type="date" value={node.end} onChange={(e)=>onChange(node.id,{end:e.target.value})}/></div>
            </div>
          </div>

          <div className="field">
            <label>Horas estimadas</label>
            <div className="inp"><I.clock className="ic"/><input type="number" value={hours} onChange={(e)=>onChange(node.id,{hours:+e.target.value})}/><span style={{ color:"var(--faint)", fontWeight:700, fontSize:13 }}>h</span></div>
            <div className="hint"><I.check style={{ color:"var(--green)" }}/> Equivale a <b>{(hours/8).toFixed(1).replace(".",",")} dias úteis</b> · {wd} dias no período</div>
          </div>

          <div className="field">
            <label>Responsável</label>
            <div className="owner-row">
              <Avatar who={node.owner} size={26}/>
              <select value={node.owner||""} onChange={(e)=>onChange(node.id,{owner:e.target.value})}>
                <option value="">Sem responsável</option>
                {Object.keys(PEOPLE).map(k=><option key={k} value={k}>{PEOPLE[k].name}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Predecessoras (Fim → Início)</label>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {deps.length===0 && <div style={{ fontSize:12.5, color:"var(--faint)", fontWeight:600, padding:"2px 0 4px" }}>Nenhuma dependência. Esta etapa pode iniciar livremente.</div>}
              {deps.map(dep=>{
                const dn = getNode(dep);
                if(!dn) return null;
                return (
                  <div className="dep" key={dep}>
                    <span className="dep-ic"><I.link/></span>
                    <div className="dep-info"><div className="t">{dn.title}</div><div className="s">{fmtShort(dn.start)} → {fmtShort(dn.end)} · {PEOPLE[dn.owner]?.name||"—"}</div></div>
                    <button className="rm" onClick={()=>onChange(node.id,{deps:deps.filter(d=>d!==dep)})}><I.x/></button>
                  </div>
                );
              })}
              {addOpen ? (
                <div className="owner-row" style={{ background:"#fff" }}>
                  <I.link style={{ color:"var(--muted)" }}/>
                  <select defaultValue="" onChange={(e)=>{ if(e.target.value){ onChange(node.id,{deps:[...deps,e.target.value]}); setAddOpen(false);} }}>
                    <option value="">Selecionar etapa…</option>
                    {candidates.filter(r=>!deps.includes(r.id)).map(r=>{ const c=getNode(r.id); return <option key={r.id} value={r.id}>{c.title}</option>; })}
                  </select>
                </div>
              ) : (
                <button className="add-dep" onClick={()=>setAddOpen(true)}><I.plus/> Adicionar predecessora</button>
              )}
            </div>
          </div>
        </div>
        <div className="panel-foot">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={onClose}><I.check/> Salvar alterações</button>
        </div>
      </aside>
    </React.Fragment>
  );
}

/* ---------- Empty state ---------- */
function EmptyState({ onAdd }){
  return (
    <div className="empty">
      <I.empty/>
      <h3>Nenhuma etapa com datas ainda</h3>
      <p>Este projeto ainda não possui etapas no cronograma. Adicione a primeira etapa e defina início e prazo para visualizar o Gantt, dependências e alocação de recursos.</p>
      <button className="btn-primary" onClick={onAdd}><I.plus/> Adicionar primeira etapa</button>
    </div>
  );
}

/* ---------- Recursos view ---------- */
function RecursosView({ getNode, allRows }){
  const roles = { MM:"Product Manager", BA:"Tech Lead", CL:"UX Researcher", DR:"DevOps", EC:"Front-end", PD:"Designer", TN:"QA / Analista", SR:"QA Lead" };
  const load = {};
  allRows.forEach(r=>{ const n=getNode(r.id); if(n.type==="epic"||!n.owner) return; const h=workdays(n.start,n.end)*8; load[n.owner]=(load[n.owner]||0)+h; });
  const max = Math.max(...Object.values(load), 1);
  const entries = Object.keys(load).sort((a,b)=>load[b]-load[a]);
  return (
    <div className="recursos">
      {entries.map(k=>{
        const h = load[k]; const ratio = h/max; const over = h>160;
        const color = over ? STATUS.risk.color : ratio>0.7 ? STATUS.ontrack.color : STATUS.done.color;
        return (
          <div className="res-row" key={k}>
            <div className="res-person"><Avatar who={k} size={36}/><div className="txt"><div className="nm">{PEOPLE[k].name}</div><div className="rl">{roles[k]}</div></div></div>
            <div className="res-bar"><i style={{ width:Math.min(100,ratio*100)+"%", background:color }}></i></div>
            <div className="res-meta">{h}h<small>{(h/8).toFixed(0)} dias úteis</small></div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- App ---------- */
function App(){
  const [scale, setScale] = useState("week");
  const [view, setView] = useState("crono");
  const [project, setProject] = useState("portal");
  const [collapsed, setCollapsed] = useState(new Set());
  const [selectedId, setSelectedId] = useState("3.2");
  const [overrides, setOverrides] = useState({});
  const [tip, setTip] = useState(null);
  const dragRef = useRef(null);

  const getNode = (id)=>{ const base = findNode(TREE, id); return { ...base, ...(overrides[id]||{}) }; };
  const change = (id, patch)=> setOverrides(o=>({ ...o, [id]: { ...(o[id]||{}), ...patch } }));

  const rows = useMemo(()=> project==="empty" ? [] : flatten(TREE, collapsed), [collapsed, project]);
  const rowIndex = useMemo(()=>{ const m={}; rows.forEach((r,i)=>m[r.id]=i); return m; }, [rows]);
  const allRows = useMemo(()=> flatten(TREE, new Set()), []);
  const count = allRows.filter(r=>r.id!=="p").length;

  const toggle = (id)=> setCollapsed(c=>{ const n=new Set(c); n.has(id)?n.delete(id):n.add(id); return n; });
  const selectedNode = selectedId ? getNode(selectedId) : null;

  /* dragging bars */
  const onDrag = (e, node, mode)=>{
    e.preventDefault(); e.stopPropagation();
    const dw = DW[scale];
    const startX = e.clientX;
    const orig = { start:node.start, end:node.end };
    dragRef.current = { id:node.id, mode, startX, orig, dw };
    change(node.id, { _drag:true });
    const move = (ev)=>{
      const dr = dragRef.current; if(!dr) return;
      const delta = Math.round((ev.clientX - dr.startX)/dr.dw);
      if(delta===0){ return; }
      if(dr.mode==="move"){ change(dr.id, { start:addDays(dr.orig.start,delta), end:addDays(dr.orig.end,delta) }); }
      else if(dr.mode==="l"){ const ns=addDays(dr.orig.start,delta); if(daysBetween(ns,dr.orig.end)>=0) change(dr.id,{start:ns}); }
      else if(dr.mode==="r"){ const ne=addDays(dr.orig.end,delta); if(daysBetween(dr.orig.start,ne)>=0) change(dr.id,{end:ne}); }
    };
    const up = ()=>{ change(dragRef.current.id,{_drag:false}); dragRef.current=null; window.removeEventListener("pointermove",move); window.removeEventListener("pointerup",up); };
    window.addEventListener("pointermove",move); window.addEventListener("pointerup",up);
  };

  return (
    <div className="app">
      <Sidebar/>
      <div className="main">
        <Topbar/>
        <div className="content">
          <div className="workspace">
            <Toolbar scale={scale} setScale={setScale} view={view} setView={setView}
              project={project} setProject={setProject} count={count} onAdd={()=>{}}/>
            {project==="empty" ? <EmptyState onAdd={()=>setProject("portal")}/>
              : view==="recursos" ? <RecursosView getNode={getNode} allRows={allRows}/>
              : <React.Fragment>
                  <Legend/>
                  <GanttChart scale={scale} rows={rows} rowIndex={rowIndex} getNode={getNode}
                    collapsed={collapsed} onToggle={toggle} onOpen={setSelectedId}
                    onAdd={()=>{}} onDel={()=>{}} selectedId={selectedId}
                    onDrag={onDrag} tip={tip} setTip={setTip}/>
                </React.Fragment>}
          </div>
        </div>
      </div>
      {view==="crono" && project==="portal" && <EditPanel node={selectedNode} getNode={getNode} allRows={allRows} onClose={()=>setSelectedId(null)} onChange={change}/>}
      <Tip data={tip}/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
})();
