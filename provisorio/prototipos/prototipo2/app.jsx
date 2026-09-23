/* ============================================================
   AgileFlow — Cronograma (Gantt) redesign
   ============================================================ */
(function(){
const { useState, useMemo, useRef, useEffect, useLayoutEffect } = React;

/* ---------- People (avatar palette from brand) ---------- */
const PEOPLE = {
  MM: { name: "Marina Mendes",  initials: "MM", color: "#7C3AED" },
  BA: { name: "Bruno Antunes",  initials: "BA", color: "#008BD2" },
  CL: { name: "Carla Lima",     initials: "CL", color: "#6AB42F" },
  DR: { name: "Diego Rocha",    initials: "DR", color: "#E84E0F" },
  EC: { name: "Ewerton Costa",  initials: "EC", color: "#014898" },
  PD: { name: "Paula Dias",     initials: "PD", color: "#DB2777" },
  TN: { name: "Tiago Neves",    initials: "TN", color: "#0F766E" },
  SR: { name: "Sofia Reis",     initials: "SR", color: "#64748B" },
};

/* ---------- Demand types ---------- */
const TYPES = {
  epic:  { label: "Épico",      bg: "#efe9fb", fg: "#6d28d9" },
  feat:  { label: "Feature",    bg: "#e3f0fb", fg: "#0369a1" },
  us:    { label: "User Story", bg: "#eef7e6", fg: "#4d7d1f" },
  bug:   { label: "Bug",        bg: "#fde7e0", fg: "#c2410c" },
  task:  { label: "Tarefa",     bg: "#eef0f3", fg: "#475467" },
};

/* status: done | ontrack | risk */
const STATUS = {
  done:    { label: "Concluída", color: "#6AB42F", soft: "#eef7e6" },
  ontrack: { label: "No prazo",  color: "#014898", soft: "#eaf1fa" },
  risk:    { label: "Em risco",  color: "#E84E0F", soft: "#fdece4" },
};

/* ---------- Project tree (Portal do Cliente) ---------- */
const TREE = [
  { id:"p", title:"Portal do Cliente", type:"epic", owner:"EC", start:"2026-04-27", end:"2026-07-31", status:"ontrack", progress:52, children:[
    { id:"1", title:"Descoberta & Pesquisa", type:"epic", owner:"MM", start:"2026-04-27", end:"2026-05-15", status:"done", progress:100, children:[
      { id:"1.1", title:"Entrevistas com usuários", type:"us", owner:"CL", start:"2026-04-27", end:"2026-05-06", status:"done", progress:100, deps:[] },
      { id:"1.2", title:"Análise de concorrentes", type:"us", owner:"TN", start:"2026-05-04", end:"2026-05-15", status:"done", progress:100, deps:["1.1"] },
    ]},
    { id:"2", title:"Design & Protótipo", type:"epic", owner:"PD", start:"2026-05-11", end:"2026-06-05", status:"ontrack", progress:78, children:[
      { id:"2.1", title:"Wireframes", type:"feat", owner:"PD", start:"2026-05-11", end:"2026-05-20", status:"done", progress:100, deps:["1.2"] },
      { id:"2.2", title:"UI Design", type:"feat", owner:"PD", start:"2026-05-18", end:"2026-06-01", status:"done", progress:100, deps:["2.1"] },
      { id:"2.3", title:"Testes de usabilidade", type:"us", owner:"SR", start:"2026-05-28", end:"2026-06-08", status:"risk", progress:40, deps:["2.2"] },
    ]},
    { id:"3", title:"Desenvolvimento", type:"epic", owner:"BA", start:"2026-05-25", end:"2026-07-17", status:"ontrack", progress:38, children:[
      { id:"3.1", title:"Setup de infraestrutura", type:"task", owner:"DR", start:"2026-05-25", end:"2026-06-01", status:"done", progress:100, deps:[] },
      { id:"3.2", title:"API de autenticação", type:"feat", owner:"BA", start:"2026-06-01", end:"2026-06-15", status:"ontrack", progress:60, deps:["3.1"] },
      { id:"3.3", title:"Tela de login", type:"feat", owner:"EC", start:"2026-06-08", end:"2026-06-19", status:"ontrack", progress:25, deps:["3.2"] },
      { id:"3.4", title:"Dashboard do cliente", type:"feat", owner:"BA", start:"2026-06-15", end:"2026-07-03", status:"ontrack", progress:5, deps:["3.3"] },
      { id:"3.5", title:"Notificações push", type:"us", owner:"DR", start:"2026-06-22", end:"2026-07-10", status:"risk", progress:0, deps:["3.2"] },
    ]},
    { id:"4", title:"QA & Homologação", type:"epic", owner:"SR", start:"2026-07-06", end:"2026-07-24", status:"ontrack", progress:0, children:[
      { id:"4.1", title:"Testes automatizados", type:"task", owner:"TN", start:"2026-07-06", end:"2026-07-17", status:"ontrack", progress:0, deps:["3.4"] },
      { id:"4.2", title:"Correção de bugs", type:"bug", owner:"DR", start:"2026-07-13", end:"2026-07-24", status:"risk", progress:0, deps:["4.1"] },
    ]},
    { id:"5", title:"Lançamento", type:"epic", owner:"EC", start:"2026-07-27", end:"2026-07-31", status:"ontrack", progress:0, children:[
      { id:"5.1", title:"Deploy em produção", type:"task", owner:"EC", start:"2026-07-27", end:"2026-07-29", status:"ontrack", progress:0, deps:["4.2"] },
      { id:"5.2", title:"Comunicação & marketing", type:"us", owner:"MM", start:"2026-07-27", end:"2026-07-31", status:"ontrack", progress:0, deps:["4.2"] },
    ]},
  ]},
];

/* ---------- Date helpers ---------- */
const MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const MONTHS_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WD = ["D","S","T","Q","Q","S","S"]; // dom..sab
const RANGE_START = "2026-04-27";
const RANGE_END   = "2026-08-02";
const TODAY        = "2026-06-04";

function pd(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function iso(dt){ return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0"); }
function addDays(s,n){ const dt=pd(s); dt.setDate(dt.getDate()+n); return iso(dt); }
function daysBetween(a,b){ return Math.round((pd(b)-pd(a))/86400000); }
function isWeekend(s){ const w=pd(s).getDay(); return w===0||w===6; }
function fmtShort(s){ const dt=pd(s); return String(dt.getDate()).padStart(2,"0")+" "+MONTHS[dt.getMonth()]; }
function fmtLong(s){ const dt=pd(s); return dt.getDate()+" de "+MONTHS_FULL[dt.getMonth()].toLowerCase()+" de "+dt.getFullYear(); }
function workdays(a,b){ let c=0,cur=pd(a),end=pd(b); while(cur<=end){ const w=cur.getDay(); if(w!==0&&w!==6)c++; cur.setDate(cur.getDate()+1);} return c; }

const TOTAL_DAYS = daysBetween(RANGE_START, RANGE_END) + 1;

/* ---------- Flatten tree with tree-guide metadata ---------- */
function flatten(nodes, collapsed){
  const out=[];
  function walk(list, level, ancestorLines){
    list.forEach((n, i)=>{
      const isLast = i===list.length-1;
      const hasKids = !!(n.children && n.children.length);
      out.push({ ...n, level, hasKids, isLast, ancestorLines });
      if(hasKids && !collapsed.has(n.id)){
        walk(n.children, level+1, [...ancestorLines, !isLast]);
      }
    });
  }
  walk(nodes, 0, []);
  return out;
}

/* find node by id (deep) */
function findNode(nodes, id){
  for(const n of nodes){
    if(n.id===id) return n;
    if(n.children){ const f=findNode(n.children,id); if(f) return f; }
  }
  return null;
}

/* ---------- Icons ---------- */
const I = {
  chevron:(p)=><svg viewBox="0 0 16 16" width="14" height="14" {...p}><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  grip:(p)=><svg viewBox="0 0 16 16" width="14" height="14" {...p}><g fill="currentColor"><circle cx="6" cy="4" r="1.3"/><circle cx="10" cy="4" r="1.3"/><circle cx="6" cy="8" r="1.3"/><circle cx="10" cy="8" r="1.3"/><circle cx="6" cy="12" r="1.3"/><circle cx="10" cy="12" r="1.3"/></g></svg>,
  plus:(p)=><svg viewBox="0 0 16 16" width="15" height="15" {...p}><path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  trash:(p)=><svg viewBox="0 0 16 16" width="14" height="14" {...p}><path d="M3 4.5h10M6.5 4.5V3.2c0-.4.3-.7.7-.7h1.6c.4 0 .7.3.7.7v1.3M5 4.5l.5 8c0 .5.4.9.9.9h3.2c.5 0 .9-.4.9-.9l.5-8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  cal:(p)=><svg viewBox="0 0 16 16" width="14" height="14" {...p}><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 6.5h11M5.5 2.2v2.4M10.5 2.2v2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  search:(p)=><svg viewBox="0 0 18 18" width="16" height="16" {...p}><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M12 12l3.2 3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  bell:(p)=><svg viewBox="0 0 18 18" width="17" height="17" {...p}><path d="M9 2.5c-2.2 0-3.7 1.7-3.7 3.8 0 3.4-.9 4.5-1.5 5.1-.3.3-.1.8.3.8h9.8c.4 0 .6-.5.3-.8-.6-.6-1.5-1.7-1.5-5.1 0-2.1-1.5-3.8-3.7-3.8z" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M7.5 14.5a1.5 1.5 0 003 0" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>,
  moon:(p)=><svg viewBox="0 0 18 18" width="17" height="17" {...p}><path d="M14.5 10.5A6 6 0 017.5 3.5a6 6 0 100 11 6 6 0 007-4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  grid:(p)=><svg viewBox="0 0 20 20" width="18" height="18" {...p}><g fill="currentColor"><rect x="3" y="3" width="6" height="6" rx="1.4"/><rect x="11" y="3" width="6" height="6" rx="1.4"/><rect x="3" y="11" width="6" height="6" rx="1.4"/><rect x="11" y="11" width="6" height="6" rx="1.4"/></g></svg>,
  folder:(p)=><svg viewBox="0 0 20 20" width="18" height="18" {...p}><path d="M3 5.5C3 4.7 3.7 4 4.5 4h3l1.5 1.6h6c.8 0 1.5.7 1.5 1.5v7c0 .8-.7 1.5-1.5 1.5h-11C3.7 15.6 3 14.9 3 14V5.5z" fill="currentColor"/></svg>,
  people:(p)=><svg viewBox="0 0 20 20" width="18" height="18" {...p}><g fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7.5" cy="7" r="2.6"/><path d="M3 16c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/><path d="M13 5.2a2.4 2.4 0 010 4.6M14.5 16c0-2.2-1.2-3.6-3-4"/></g></svg>,
  report:(p)=><svg viewBox="0 0 20 20" width="18" height="18" {...p}><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 16V9M8 16V5M12 16v-4M16 16V7"/></g></svg>,
  gear:(p)=><svg viewBox="0 0 20 20" width="18" height="18" {...p}><path d="M10 13a3 3 0 100-6 3 3 0 000 6z" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M10 2.5l1 1.8 2-.5.4 2 1.9.8-.8 1.9.8 1.9-1.9.8-.4 2-2-.5-1 1.8-1-1.8-2 .5-.4-2-1.9-.8.8-1.9-.8-1.9 1.9-.8.4-2 2 .5z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>,
  branch:(p)=><svg viewBox="0 0 16 16" width="15" height="15" {...p}><g fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="4" cy="4" r="1.6"/><circle cx="4" cy="12" r="1.6"/><circle cx="12" cy="5.5" r="1.6"/><path d="M4 5.6v4.8M5.6 4.4h3c.9 0 1.4.6 1.4 1.5v.6"/><path d="M10.4 6.5C10 8.5 7.5 9 5.6 9.3"/></g></svg>,
  logout:(p)=><svg viewBox="0 0 18 18" width="16" height="16" {...p}><path d="M11 5.5V4c0-.8-.7-1.5-1.5-1.5h-5C3.7 2.5 3 3.2 3 4v10c0 .8.7 1.5 1.5 1.5h5c.8 0 1.5-.7 1.5-1.5v-1.5M8 9h7m0 0l-2.2-2.2M15 9l-2.2 2.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  empty:(p)=><svg viewBox="0 0 64 64" width="64" height="64" {...p}><rect x="8" y="14" width="48" height="38" rx="4" fill="#eaf1fa" stroke="#cfe0f3" strokeWidth="2"/><path d="M8 24h48" stroke="#cfe0f3" strokeWidth="2"/><rect x="14" y="30" width="14" height="5" rx="2.5" fill="#bcd3ee"/><rect x="32" y="30" width="18" height="5" rx="2.5" fill="#d9e6f6"/><rect x="14" y="40" width="22" height="5" rx="2.5" fill="#d9e6f6"/><circle cx="46" cy="46" r="11" fill="#fff" stroke="#014898" strokeWidth="2"/><path d="M46 41.5v9M41.5 46h9" stroke="#014898" strokeWidth="2" strokeLinecap="round"/></svg>,
  link:(p)=><svg viewBox="0 0 16 16" width="13" height="13" {...p}><path d="M6.5 9.5l3-3M5.5 7.5L4 9a2.1 2.1 0 003 3l1.5-1.5M10.5 8.5L12 7a2.1 2.1 0 00-3-3L7.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  x:(p)=><svg viewBox="0 0 16 16" width="15" height="15" {...p}><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  clock:(p)=><svg viewBox="0 0 16 16" width="14" height="14" {...p}><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v3l2 1.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  check:(p)=><svg viewBox="0 0 16 16" width="13" height="13" {...p}><path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

window.AF = { PEOPLE, TYPES, STATUS, TREE, MONTHS, MONTHS_FULL, WD, RANGE_START, RANGE_END, TODAY, TOTAL_DAYS,
  pd, iso, addDays, daysBetween, isWeekend, fmtShort, fmtLong, workdays, flatten, findNode, I,
  useState, useMemo, useRef, useEffect, useLayoutEffect };
})();
