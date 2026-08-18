/* Mi Presupuesto — gastos, ingresos y deudas. 100% local, sin servidor. */
'use strict';

/* ------------------------- Estado ------------------------- */
const DB_NAME = 'presupuesto';
const DB_VERSION = 2;
let db = null;
let currentMonth = ymNow();
let currentCurrency = localStorage.getItem('currency') || 'HNL';
let movFilter = 'todos';
let categories = [];   // categorías de gasto (editables, con reglas)

const CURRENCIES = [
  {code:'HNL', label:'Lempiras', sym:'L'},
  {code:'USD', label:'Dólares', sym:'US$'}
];
const INCOME_CATEGORIES = [
  {name:'Salario', icon:'💼', color:'#0e9384'},
  {name:'Negocio', icon:'🏪', color:'#2563eb'},
  {name:'Freelance', icon:'💻', color:'#7c3aed'},
  {name:'Regalo', icon:'🎁', color:'#db2777'},
  {name:'Reembolso', icon:'↩️', color:'#0891b2'},
  {name:'Otros ingresos', icon:'➕', color:'#64748b'}
];

/* ------------------------- Utilidades ------------------------- */
function ymNow(){ const d=new Date(); return d.getFullYear()+'-'+p2(d.getMonth()+1); }
function todayISO(){ const d=new Date(); return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()); }
function p2(x){ return String(x).padStart(2,'0'); }
function $(id){ return document.getElementById(id); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function curInfo(code){ return CURRENCIES.find(c=>c.code===code) || {code, label:code, sym:code}; }
function money(n, code){
  const cur = code || currentCurrency; const v = Number(n)||0;
  try { return new Intl.NumberFormat('es-HN', {style:'currency', currency:cur, currencyDisplay:'narrowSymbol', minimumFractionDigits:2}).format(v); }
  catch(e){
    try { return new Intl.NumberFormat('es-HN', {style:'currency', currency:cur, minimumFractionDigits:2}).format(v); }
    catch(e2){ return curInfo(cur).sym + ' ' + v.toFixed(2); }
  }
}
function monthLabel(ym){
  const [y,m]=ym.split('-').map(Number);
  const n=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return n[m-1]+' '+y;
}
function addMonth(ym, d){ let [y,m]=ym.split('-').map(Number); m+=d; while(m<1){m+=12;y--;} while(m>12){m-=12;y++;} return y+'-'+p2(m); }
let toastTimer;
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2400); }

/* ------------------------- IndexedDB ------------------------- */
function openDB(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded=e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains('tx')){ const s=d.createObjectStore('tx',{keyPath:'id'}); s.createIndex('month','month'); }
      if(!d.objectStoreNames.contains('categories')) d.createObjectStore('categories',{keyPath:'id'});
      if(!d.objectStoreNames.contains('debts')) d.createObjectStore('debts',{keyPath:'id'});
    };
    r.onsuccess=()=>{ db=r.result; res(db); };
    r.onerror=()=>rej(r.error);
  });
}
const store=(s,m='readonly')=>db.transaction(s,m).objectStore(s);
const dbGetAll=s=>new Promise((res,rej)=>{const r=store(s).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const dbPut=(s,v)=>new Promise((res,rej)=>{const r=store(s,'readwrite').put(v);r.onsuccess=()=>res(v);r.onerror=()=>rej(r.error);});
const dbDel=(s,k)=>new Promise((res,rej)=>{const r=store(s,'readwrite').delete(k);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});
const dbClear=s=>new Promise((res,rej)=>{const r=store(s,'readwrite').clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});

/* ------------------------- Categorías ------------------------- */
const DEFAULT_CATEGORIES=[
  {name:'Supermercado',icon:'🛒',color:'#16a34a',keywords:['super','market','grocery','walmart','soriana','oxxo','despensa','maxi','paiz','la colonia','mercado','pulperia','pulpería']},
  {name:'Restaurantes',icon:'🍔',color:'#f59e0b',keywords:['rest','cafe','café','coffee','espresso','pizza','burger','taco','baleada','pollo','comida','food','bar ']},
  {name:'Transporte',icon:'🚗',color:'#0ea5e9',keywords:['uber','indriver','taxi','bus','gasolin','combustible','uno','puma','texaco','shell','peaje','parqueo','estacion']},
  {name:'Compras',icon:'🛍️',color:'#a855f7',keywords:['amazon','store','tienda','shop','mall','zara','nike','ropa','farsiman']},
  {name:'Servicios',icon:'💡',color:'#eab308',keywords:['enee','luz','agua','aguas','internet','tigo','claro','hondutel','cable','netflix','spotify','telefono','teléfono','renta','alquiler']},
  {name:'Salud',icon:'💊',color:'#ef4444',keywords:['farmacia','kielsa','siman','hospital','clinica','clínica','doctor','dental','gym','gimnasio']},
  {name:'Entretenimiento',icon:'🎬',color:'#ec4899',keywords:['cine','cinema','multiplaza','pelicula','película','juego','concierto','boleto','ticket']},
  {name:'Otros',icon:'📦',color:'#94a3b8',keywords:[]}
];
async function ensureCategories(){
  categories=await dbGetAll('categories');
  if(!categories.length){ for(const c of DEFAULT_CATEGORIES) await dbPut('categories',{id:uid(),...c}); categories=await dbGetAll('categories'); }
}
function catLook(name){ return categories.find(c=>c.name===name) || INCOME_CATEGORIES.find(c=>c.name===name); }
function catColor(name){ const c=catLook(name); return c?c.color:'#94a3b8'; }
function catIcon(name){ const c=catLook(name); return c?c.icon:'📦'; }
function autoCategory(merchant){
  const m=(merchant||'').toLowerCase();
  for(const c of categories) for(const kw of (c.keywords||[])) if(kw && m.includes(kw.toLowerCase())) return c.name;
  return catLook('Otros')?'Otros':(categories[0]&&categories[0].name)||'Otros';
}
function hexA(hex,a){ const h=hex.replace('#',''); const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }

/* ------------------------- Datos ------------------------- */
async function getMonthTx(ym){
  const all=await dbGetAll('tx');
  return all.filter(t=>t.month===ym).sort((a,b)=>(b.date.localeCompare(a.date))||(b.createdAt-a.createdAt));
}
async function saveTransaction(t){
  t.type = t.type||'gasto';
  t.currency = t.currency||'HNL';
  t.month = (t.date||todayISO()).slice(0,7);
  t.amount = Math.abs(Number(t.amount)||0);
  if(!t.id){ t.id=uid(); t.createdAt=Date.now(); }
  await dbPut('tx',t);
}
const sum=list=>list.reduce((a,t)=>a+(Number(t.amount)||0),0);

/* ------------------------- Render principal ------------------------- */
async function renderAll(){
  $('monthLabel').textContent=monthLabel(currentMonth);
  const monthAll=await getMonthTx(currentMonth);
  const prevAll=await getMonthTx(addMonth(currentMonth,-1));
  const debts=await dbGetAll('debts');
  renderCurrencyBar(monthAll, debts);
  const cur=currentCurrency;
  const list=monthAll.filter(t=>(t.currency||'HNL')===cur);
  const prevList=prevAll.filter(t=>(t.currency||'HNL')===cur);
  renderResumen(list, prevList, debts.filter(d=>(d.currency||'HNL')===cur));
  renderMovimientos(list);
  renderDebts(debts.filter(d=>(d.currency||'HNL')===cur));
  renderCategoriesView();
}

function renderCurrencyBar(monthAll, debts){
  const bar=$('currencyBar');
  const codes=Array.from(new Set([...CURRENCIES.map(c=>c.code), ...monthAll.map(t=>t.currency||'HNL'), ...(debts||[]).map(d=>d.currency||'HNL')]));
  bar.innerHTML=codes.map(code=>{
    const gastos=monthAll.filter(t=>(t.currency||'HNL')===code && (t.type||'gasto')==='gasto');
    const tot=sum(gastos);
    const info=curInfo(code), active=code===currentCurrency;
    return `<button class="cur-chip ${active?'active':''}" data-cur="${code}"><span class="cc-lbl">${info.label}</span><span class="cc-tot">${money(tot,code)}</span></button>`;
  }).join('');
  bar.querySelectorAll('[data-cur]').forEach(b=>b.addEventListener('click',()=>{ currentCurrency=b.dataset.cur; localStorage.setItem('currency',currentCurrency); renderAll(); }));
}

function renderResumen(list, prevList, debts){
  const gastos=list.filter(t=>(t.type||'gasto')==='gasto');
  const ingresos=list.filter(t=>t.type==='ingreso');
  const totG=sum(gastos), totI=sum(ingresos);
  $('monthTotal').innerHTML=`<span class="cur">${curInfo(currentCurrency).sym}</span>${new Intl.NumberFormat('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(totG)}`;
  $('monthSub').textContent = gastos.length? `${gastos.length} gasto(s) en ${monthLabel(currentMonth)}` : 'Sin gastos este mes.';
  $('kpiIncome').textContent = totI>0? money(totI) : '—';
  const bal=totI-totG;
  const be=$('kpiBalance'); be.textContent=money(bal); be.className='v '+(bal>=0?'pos':'neg');
  const prevG=sum(prevList.filter(t=>(t.type||'gasto')==='gasto'));
  const de=$('kpiDelta');
  if(prevG>0){ const d=(totG-prevG)/prevG*100, up=d>=0; de.innerHTML=`<span style="color:${up?'var(--expense)':'var(--income)'}">${up?'▲':'▼'} ${Math.abs(d).toFixed(0)}%</span>`; }
  else de.textContent='—';

  // Deudas resumen
  const dcard=$('debtSummaryCard');
  if(debts.length){
    dcard.style.display='';
    const debo=debts.filter(d=>d.kind==='debo'), meDeben=debts.filter(d=>d.kind==='me_deben');
    const rem=d=>Math.max(0,(Number(d.amount)||0)-(Number(d.paid)||0));
    const sDebo=debo.reduce((a,d)=>a+rem(d),0), sMe=meDeben.reduce((a,d)=>a+rem(d),0);
    let h='';
    if(sDebo>0) h+=`<div class="stat" style="margin-bottom:8px"><div class="l">Debo</div><div class="v neg">${money(sDebo)}</div></div>`;
    if(sMe>0)   h+=`<div class="stat"><div class="l">Me deben</div><div class="v pos">${money(sMe)}</div></div>`;
    $('debtSummary').innerHTML=`<div class="stats" style="margin-top:0">${h||'<div class="subtle">Todo saldado 🎉</div>'}</div>`;
  } else dcard.style.display='none';

  // Barras por categoría (solo gastos)
  const byCat={};
  for(const t of gastos) byCat[t.category]=(byCat[t.category]||0)+(Number(t.amount)||0);
  const entries=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const max=entries.length?entries[0][1]:0;
  const bars=$('catBars');
  bars.innerHTML = entries.length? entries.map(([cat,val])=>{
    const pct=max?Math.round(val/max*100):0, share=totG?Math.round(val/totG*100):0;
    return `<div class="bar-row"><div class="bar-top"><span class="cat"><span class="dot" style="background:${catColor(cat)}"></span>${catIcon(cat)} ${esc(cat)}</span><span class="val">${money(val)}<span class="pct">${share}%</span></span></div><div class="track"><div class="fill" style="width:${pct}%;background:${catColor(cat)}"></div></div></div>`;
  }).join('') : `<div class="empty"><span class="big">📊</span>Aún no hay gastos en ${curInfo(currentCurrency).label}.</div>`;

  renderTxInto($('recentList'), list.slice(0,6));
}

function renderMovimientos(list){
  let filtered = movFilter==='todos'? list : list.filter(t=>(t.type||'gasto')===movFilter);
  renderTxInto($('txList'), filtered);
}

function renderTxInto(container, list){
  if(!list.length){ container.innerHTML='<div class="empty"><span class="big">🧾</span>Sin movimientos. Toca ＋ o importa tu CSV.</div>'; return; }
  container.innerHTML=list.map(t=>{
    const isIn=t.type==='ingreso';
    const d=t.date? t.date.slice(8,10)+'/'+t.date.slice(5,7):'';
    const thumb=t.photo?`<img class="thumb" data-img="${t.id}" alt="recibo">`:'';
    const sign=isIn?'+':'';
    return `<div class="tx" data-edit="${t.id}">
      <div class="ic" style="background:${hexA(catColor(t.category),.16)}">${catIcon(t.category)}</div>
      <div class="mid"><div class="mer">${esc(t.merchant||(isIn?'Ingreso':'(sin nombre)'))}</div>
      <div class="meta">${esc(t.category||'')}<span class="sep">·</span>${d}</div></div>
      ${thumb}
      <div class="amt ${isIn?'in':'ex'}">${sign}${money(t.amount,t.currency)}</div></div>`;
  }).join('');
  container.querySelectorAll('.thumb[data-img]').forEach(img=>{
    const t=list.find(x=>x.id===img.dataset.img);
    if(t&&t.photo) img.src=URL.createObjectURL(t.photo);
    img.addEventListener('click',e=>{ e.stopPropagation(); openImg(t.photo); });
  });
  container.querySelectorAll('[data-edit]').forEach(row=>row.addEventListener('click',()=>editTx(row.dataset.edit,list)));
}

/* ------------------------- Deudas ------------------------- */
function renderDebts(debts){
  const el=$('debtList');
  if(!debts.length){ el.innerHTML='<div class="empty"><span class="big">🤝</span>Sin deudas ni préstamos en '+curInfo(currentCurrency).label+'.</div>'; return; }
  const rem=d=>Math.max(0,(Number(d.amount)||0)-(Number(d.paid)||0));
  el.innerHTML=debts.sort((a,b)=>rem(b)-rem(a)).map(d=>{
    const total=Number(d.amount)||0, paid=Math.min(total,Number(d.paid)||0), r=rem(d);
    const pct=total?Math.round(paid/total*100):0;
    const owe=d.kind==='debo';
    const done=r<=0;
    const due=d.due?` · vence ${d.due.slice(8,10)}/${d.due.slice(5,7)}`:'';
    return `<div class="debt" data-debt="${d.id}">
      <div class="dt"><span class="dn">${esc(d.name||'(sin nombre)')} <span class="dk ${owe?'owe':'owed'}">${owe?'Yo debo':'Me deben'}</span></span>
      <span class="drem" style="color:${done?'var(--income)':(owe?'var(--expense)':'var(--accent-ink)')}">${done?'Saldado ✓':money(r,d.currency)}</span></div>
      <div class="track"><div class="fill" style="width:${pct}%;background:${owe?'var(--expense)':'var(--accent)'}"></div></div>
      <div class="dmeta">Pagado ${money(paid,d.currency)} de ${money(total,d.currency)} (${pct}%)${due}${d.note?' · '+esc(d.note):''}</div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-debt]').forEach(row=>row.addEventListener('click',()=>editDebt(row.dataset.debt,debts)));
}

/* ------------------------- Vista categorías ------------------------- */
function renderCategoriesView(){
  const el=$('catList');
  el.innerHTML=categories.map(c=>`<div class="tx" data-cat="${c.id}">
    <div class="ic" style="background:${hexA(c.color,.16)}">${c.icon||'🏷️'}</div>
    <div class="mid"><div class="mer">${esc(c.name)}</div><div class="cat-kw">${(c.keywords&&c.keywords.length)?esc(c.keywords.join(', ')):'sin palabras clave'}</div></div>
    <button class="secondary" data-editcat="${c.id}" style="padding:7px 12px;font-size:13px">Editar</button></div>`).join('');
  el.querySelectorAll('[data-editcat]').forEach(b=>b.addEventListener('click',()=>editCategory(b.dataset.editcat)));
}
async function editCategory(id){
  const c=categories.find(x=>x.id===id); if(!c) return;
  const name=prompt('Nombre de la categoría:',c.name); if(name===null) return;
  const icon=prompt('Emoji / ícono:',c.icon||'🏷️'); if(icon===null) return;
  const color=prompt('Color (hex, ej #0e9384):',c.color||'#0e9384'); if(color===null) return;
  const kws=prompt('Palabras clave separadas por coma (para auto-categorizar):',(c.keywords||[]).join(', ')); if(kws===null) return;
  c.name=name.trim()||c.name; c.icon=icon.trim()||c.icon; c.color=color.trim()||c.color;
  c.keywords=kws.split(',').map(s=>s.trim()).filter(Boolean);
  await dbPut('categories',c); await ensureCategories(); renderAll(); toast('Categoría guardada');
}
async function addCategory(){
  const name=prompt('Nombre de la nueva categoría:'); if(!name) return;
  const icon=prompt('Emoji / ícono:','🏷️')||'🏷️';
  const color=prompt('Color (hex):','#0e9384')||'#0e9384';
  const kws=prompt('Palabras clave (coma):','')||'';
  await dbPut('categories',{id:uid(),name:name.trim(),icon:icon.trim(),color:color.trim(),keywords:kws.split(',').map(s=>s.trim()).filter(Boolean)});
  await ensureCategories(); renderAll(); toast('Categoría creada');
}

/* ------------------------- Segmentos (toggles) ------------------------- */
function buildSeg(el, items, val, onPick){
  el.innerHTML=items.map(it=>`<button type="button" data-v="${it.v}" class="${it.v===val?'on':''}">${it.l}</button>`).join('');
  el.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    el.querySelectorAll('button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); onPick(b.dataset.v);
  }));
}
function segValue(el){ const b=el.querySelector('button.on'); return b?b.dataset.v:null; }

/* ------------------------- Modal movimiento ------------------------- */
let pendingPhoto=null, editList=[], modalType='gasto', modalCurrency='HNL';
function fillCategorySelect(type){
  const cats = type==='ingreso'? INCOME_CATEGORIES : categories;
  $('txCategory').innerHTML=cats.map(c=>`<option value="${esc(c.name)}">${c.icon} ${esc(c.name)}</option>`).join('');
}
function applyTypeUI(type){
  modalType=type;
  $('txModalTitle').textContent = type==='ingreso'?'Nuevo ingreso':'Nuevo gasto';
  $('txMerchantField').firstChild.textContent = type==='ingreso'?'Descripción / fuente':'Comercio / descripción';
  fillCategorySelect(type);
}
function curSegItems(){ return CURRENCIES.map(c=>({v:c.code,l:c.sym+' '+c.label})); }
function openTxModal(){ $('txModal').classList.add('open'); }
function closeTxModal(){ $('txModal').classList.remove('open'); pendingPhoto=null; $('txPhotoPreview').innerHTML=''; $('txPhoto').value=''; }

function newTx(){
  $('txId').value=''; $('txAmount').value=''; $('txMerchant').value=''; $('txDate').value=todayISO();
  buildSeg($('txTypeSeg'),[{v:'gasto',l:'Gasto'},{v:'ingreso',l:'Ingreso'}],'gasto',applyTypeUI);
  applyTypeUI('gasto');
  buildSeg($('txCurrencySeg'),curSegItems(),currentCurrency,v=>{});
  pendingPhoto=null; $('txPhotoPreview').innerHTML=''; $('txPhoto').value=''; $('deleteTx').style.display='none';
  openTxModal();
}
function editTx(id,list){
  editList=list; const t=list.find(x=>x.id===id); if(!t) return;
  $('txId').value=t.id; $('txAmount').value=t.amount; $('txMerchant').value=t.merchant||''; $('txDate').value=t.date||todayISO();
  buildSeg($('txTypeSeg'),[{v:'gasto',l:'Gasto'},{v:'ingreso',l:'Ingreso'}],t.type||'gasto',applyTypeUI);
  applyTypeUI(t.type||'gasto');
  $('txCategory').value=t.category;
  buildSeg($('txCurrencySeg'),curSegItems(),t.currency||'HNL',v=>{});
  $('txModalTitle').textContent = (t.type==='ingreso'?'Editar ingreso':'Editar gasto');
  pendingPhoto=t.photo||null;
  $('txPhotoPreview').innerHTML=t.photo?`<img class="thumb" style="width:64px;height:64px" src="${URL.createObjectURL(t.photo)}">`:'';
  $('txPhoto').value=''; $('deleteTx').style.display='block';
  openTxModal();
}
async function onSaveTx(){
  const amount=parseFloat($('txAmount').value);
  if(!(amount>0)){ toast('Ingresa un monto válido'); return; }
  const id=$('txId').value;
  const t={ id:id||undefined, type:segValue($('txTypeSeg'))||'gasto', amount,
    currency:segValue($('txCurrencySeg'))||'HNL', date:$('txDate').value||todayISO(),
    merchant:$('txMerchant').value.trim(), category:$('txCategory').value, photo:pendingPhoto||null };
  if(id){ const old=editList.find(x=>x.id===id); if(old) t.createdAt=old.createdAt; }
  await saveTransaction(t); closeTxModal(); await renderAll(); toast('Guardado ✓');
}
async function onDeleteTx(){ const id=$('txId').value; if(!id) return; if(!confirm('¿Eliminar este movimiento?')) return; await dbDel('tx',id); closeTxModal(); await renderAll(); toast('Eliminado'); }

/* ------------------------- Modal deuda ------------------------- */
let editDebtList=[];
function openDebtModal(){ $('debtModal').classList.add('open'); }
function closeDebtModal(){ $('debtModal').classList.remove('open'); }
function newDebt(){
  $('debtId').value=''; $('debtName').value=''; $('debtAmount').value=''; $('debtPaid').value=''; $('debtDue').value=''; $('debtNote').value=''; $('debtPayNow').value='';
  $('debtModalTitle').textContent='Nueva deuda';
  buildSeg($('debtKindSeg'),[{v:'debo',l:'Yo debo'},{v:'me_deben',l:'Me deben'}],'debo',v=>{});
  buildSeg($('debtCurrencySeg'),curSegItems(),currentCurrency,v=>{});
  $('deleteDebt').style.display='none';
  openDebtModal();
}
function editDebt(id,list){
  editDebtList=list; const d=list.find(x=>x.id===id); if(!d) return;
  $('debtId').value=d.id; $('debtName').value=d.name||''; $('debtAmount').value=d.amount||''; $('debtPaid').value=d.paid||0;
  $('debtDue').value=d.due||''; $('debtNote').value=d.note||''; $('debtPayNow').value='';
  $('debtModalTitle').textContent='Editar deuda';
  buildSeg($('debtKindSeg'),[{v:'debo',l:'Yo debo'},{v:'me_deben',l:'Me deben'}],d.kind||'debo',v=>{});
  buildSeg($('debtCurrencySeg'),curSegItems(),d.currency||'HNL',v=>{});
  $('deleteDebt').style.display='block';
  openDebtModal();
}
async function onSaveDebt(){
  const amount=parseFloat($('debtAmount').value);
  if(!(amount>0)){ toast('Ingresa el monto total'); return; }
  const id=$('debtId').value;
  let paid=Math.max(0,parseFloat($('debtPaid').value)||0);
  const payNow=parseFloat($('debtPayNow').value)||0;
  if(payNow>0) paid+=payNow;
  const d={ id:id||uid(), kind:segValue($('debtKindSeg'))||'debo', name:$('debtName').value.trim(),
    amount, paid:Math.min(amount,paid), currency:segValue($('debtCurrencySeg'))||'HNL',
    due:$('debtDue').value||'', note:$('debtNote').value.trim() };
  if(id){ const old=editDebtList.find(x=>x.id===id); if(old) d.createdAt=old.createdAt; } else d.createdAt=Date.now();
  await dbPut('debts',d); closeDebtModal(); await renderAll();
  toast(payNow>0?`Abono de ${money(payNow,d.currency)} registrado`:'Deuda guardada ✓');
}
async function onDeleteDebt(){ const id=$('debtId').value; if(!id) return; if(!confirm('¿Eliminar esta deuda?')) return; await dbDel('debts',id); closeDebtModal(); await renderAll(); toast('Deuda eliminada'); }

/* ------------------------- Fotos ------------------------- */
function compressImage(file,maxDim=1280,q=0.7){
  return new Promise(res=>{
    const img=new Image(), url=URL.createObjectURL(file);
    img.onload=()=>{ let {width,height}=img;
      if(width>height&&width>maxDim){ height=Math.round(height*maxDim/width); width=maxDim; }
      else if(height>maxDim){ width=Math.round(width*maxDim/height); height=maxDim; }
      const c=document.createElement('canvas'); c.width=width; c.height=height;
      c.getContext('2d').drawImage(img,0,0,width,height);
      c.toBlob(b=>{ URL.revokeObjectURL(url); res(b||file); },'image/jpeg',q);
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); res(file); }; img.src=url;
  });
}
let imgUrl=null;
function openImg(blob){ if(!blob) return; imgUrl=URL.createObjectURL(blob); $('imgViewImg').src=imgUrl; $('imgView').classList.add('open'); }
function closeImg(){ $('imgView').classList.remove('open'); if(imgUrl){ URL.revokeObjectURL(imgUrl); imgUrl=null; } }

/* ------------------------- CSV ------------------------- */
function detectDelimiter(text){
  const line=text.split(/\r?\n/).find(l=>l.trim())||''; const c={',':0,';':0,'\t':0,'|':0};
  for(const ch of line) if(ch in c) c[ch]++;
  return Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0]||',';
}
function parseCSV(text,delim){
  const rows=[]; let row=[],field='',i=0,inQ=false;
  while(i<text.length){ const c=text[i];
    if(inQ){ if(c==='"'){ if(text[i+1]==='"'){field+='"';i+=2;continue;} inQ=false;i++;continue; } field+=c;i++;continue; }
    if(c==='"'){ inQ=true;i++;continue; }
    if(c===delim){ row.push(field); field='';i++;continue; }
    if(c==='\n'){ row.push(field); rows.push(row); row=[];field='';i++;continue; }
    if(c==='\r'){ i++;continue; }
    field+=c;i++;
  }
  if(field.length||row.length){ row.push(field); rows.push(row); }
  return rows.filter(r=>r.some(c=>String(c).trim()!==''));
}
function looksLikeDate(s){ return /\d{1,4}[\/\-.]\d{1,2}([\/\-.]\d{1,4})?/.test(String(s)) || /\d{1,2}\s+(de\s+)?[a-zA-Zéáíóú]{3,}/.test(String(s)); }
function parseAmount(s){
  if(s==null) return NaN;
  let v=String(s).replace(/[^\d.,\-]/g,'').trim(); if(!v) return NaN;
  if(v.includes(',')&&v.includes('.')){ if(v.lastIndexOf(',')>v.lastIndexOf('.')) v=v.replace(/\./g,'').replace(',','.'); else v=v.replace(/,/g,''); }
  else if(v.includes(',')){ if(/,\d{1,2}$/.test(v)) v=v.replace(/\./g,'').replace(',','.'); else v=v.replace(/,/g,''); }
  const n=parseFloat(v); return isNaN(n)?NaN:Math.abs(n);
}
const MONTHS_ES={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12,ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,set:9,oct:10,nov:11,dic:12};
function normalizeDate(s){
  s=String(s||'').trim(); if(!s) return null; let m;
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  if((m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))){
    let [,a,b,y]=m; if(y.length===2) y='20'+y; let day=a,mon=b;
    if(Number(a)>12&&Number(b)<=12){ day=a; mon=b; } else if(Number(b)>12&&Number(a)<=12){ day=b; mon=a; }
    return `${y}-${p2(mon)}-${p2(day)}`;
  }
  // "15 de agosto de 2026" / "15 ago 2026" / "ago 15 2026"
  const low=s.toLowerCase();
  let mm=low.match(/(\d{1,2})\s*(?:de\s*)?([a-záéíóú]{3,})\.?\s*(?:de\s*)?(\d{4})/);
  if(mm && MONTHS_ES[mm[2].slice(0,3)]!=null){ return `${mm[3]}-${p2(MONTHS_ES[mm[2].slice(0,3)])}-${p2(mm[1])}`; }
  mm=low.match(/([a-záéíóú]{3,})\.?\s*(\d{1,2}),?\s*(\d{4})/);
  if(mm && MONTHS_ES[mm[1].slice(0,3)]!=null){ return `${mm[3]}-${p2(MONTHS_ES[mm[1].slice(0,3)])}-${p2(mm[2])}`; }
  const d=new Date(s); if(!isNaN(d)) return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());
  return null;
}

let importRows=[], importHeader=[], importRawText='';
function colStats(sample,i){
  let numeric=0,dates=0,nonEmpty=0; const vals=new Set();
  for(const r of sample){ const c=(r[i]==null?'':String(r[i])).trim(); if(!c) continue; nonEmpty++; vals.add(c.toLowerCase());
    if(!isNaN(parseAmount(c))&&/\d/.test(c)) numeric++; if(looksLikeDate(c)) dates++; }
  return {numeric,dates,nonEmpty,variety:nonEmpty?vals.size/nonEmpty:0};
}
// Detecta columnas por su CONTENIDO (no solo por el título), tolerante a hojas con encabezados corridos.
function guessColumns(header,sample){
  const H=header.map(h=>String(h||'').toLowerCase());
  const cols=Math.max(...sample.map(r=>r.length),(H.length||0));
  const st=[]; for(let i=0;i<cols;i++) st.push(colStats(sample,i));
  const hm=(i,...k)=>H[i] && k.some(x=>H[i].includes(x));
  // Fecha: mayor proporción de fechas
  let dateCol=-1,best=-1;
  for(let i=0;i<cols;i++){ const s=st[i]; if(!s.nonEmpty||!s.dates) continue; let sc=s.dates/s.nonEmpty; if(hm(i,'fecha','date','día','dia')) sc+=0.3; if(sc>best){ best=sc; dateCol=i; } }
  // Monto: columna mayormente numérica (no la fecha); prioriza títulos de dinero y no ser la más variada de texto
  let amtCol=-1; best=-1;
  for(let i=0;i<cols;i++){ if(i===dateCol) continue; const s=st[i]; if(!s.nonEmpty) continue; const ratio=s.numeric/s.nonEmpty; if(ratio<0.5) continue; let sc=ratio; if(hm(i,'total','monto','importe','amount','valor','precio','cobro','lempira','dolar')) sc+=0.3; if(sc>best){ best=sc; amtCol=i; } }
  // Comercio: columna de texto (no numérica), distinta de fecha/monto, con más variedad de valores
  let merCol=-1; best=-1;
  for(let i=0;i<cols;i++){ if(i===dateCol||i===amtCol) continue; const s=st[i]; if(!s.nonEmpty) continue; if(s.numeric/s.nonEmpty>0.6) continue; let sc=s.variety; if(hm(i,'comercio','tienda','descrip','concepto','lugar','detalle','nombre','merchant','store')) sc+=0.2; if(sc>best){ best=sc; merCol=i; } }
  let catCol=H.findIndex(h=>h&&(h.includes('categor')||h.includes('rubro')));
  return {dateCol,amtCol,merCol,catCol};
}
function analyzeCsv(){
  const text=importRawText||$('csvText').value;
  if(!text||!text.trim()){ toast('Sube un archivo o pega el CSV'); return; }
  const delim=detectDelimiter(text); const rows=parseCSV(text,delim);
  if(!rows.length){ toast('No se encontraron filas'); return; }
  const first=rows[0];
  const firstIsHeader=first.filter(c=>looksLikeDate(c)||!isNaN(parseAmount(c))).length < Math.ceil(first.length/2);
  importHeader=firstIsHeader?first.map(h=>String(h).trim()):first.map((_,i)=>'Columna '+(i+1));
  importRows=firstIsHeader?rows.slice(1):rows;
  if(!importRows.length){ toast('No hay filas de datos'); return; }
  renderImportUI(guessColumns(importHeader,importRows.slice(0,25)));
}
function colOptions(sel){ return importHeader.map((h,i)=>`<option value="${i}" ${i===sel?'selected':''}>${esc(h)}</option>`).join('')+`<option value="-1" ${sel<0?'selected':''}>— ninguna —</option>`; }
function renderImportUI(g){
  $('importArea').innerHTML=`
    <div class="hint" style="margin-top:16px;color:var(--ink)"><b>${importRows.length}</b> fila(s) detectadas. Confirma las columnas:</div>
    <div class="row2"><label class="field">📅 Fecha<select id="mapDate">${colOptions(g.dateCol)}</select></label><label class="field">💵 Monto<select id="mapAmt">${colOptions(g.amtCol)}</select></label></div>
    <div class="row2"><label class="field">🏪 Comercio<select id="mapMer">${colOptions(g.merCol)}</select></label><label class="field">🏷️ Categoría<select id="mapCat">${colOptions(g.catCol)}</select></label></div>
    <div class="row2"><label class="field">Tipo<div class="seg" id="mapTypeSeg"></div></label><label class="field">Moneda<div class="seg" id="mapCurSeg"></div></label></div>
    <div id="importPreview"></div>
    <button class="block" id="doImport" style="margin-top:14px">Importar ${importRows.length} movimiento(s)</button>`;
  buildSeg($('mapTypeSeg'),[{v:'gasto',l:'Gastos'},{v:'ingreso',l:'Ingresos'}],'gasto',()=>updatePreview());
  buildSeg($('mapCurSeg'),curSegItems(),currentCurrency,()=>updatePreview());
  ['mapDate','mapAmt','mapMer','mapCat'].forEach(id=>$(id).addEventListener('change',updatePreview));
  $('doImport').addEventListener('click',doImport);
  updatePreview();
}
function currentMapping(){
  return { dC:+$('mapDate').value, aC:+$('mapAmt').value, mC:+$('mapMer').value, cC:+$('mapCat').value,
    type:segValue($('mapTypeSeg'))||'gasto', cur:segValue($('mapCurSeg'))||currentCurrency };
}
function updatePreview(){
  const m=currentMapping(); const el=$('importPreview');
  let warn = m.dC<0? `<div class="hint bad" style="margin:10px 0 0">⚠️ No elegiste columna de <b>Fecha</b>: se usará la fecha de hoy para todo.</div>`:'';
  const rows=importRows.slice(0,5).map(r=>{
    const amount=parseAmount(r[m.aC]);
    const merchant=m.mC>=0?String(r[m.mC]||'').trim():'';
    let cat=m.cC>=0?String(r[m.cC]||'').trim():'';
    if(m.type==='gasto'&&(!cat||!catLook(cat))) cat=autoCategory(merchant);
    if(m.type==='ingreso'&&!cat) cat='Otros ingresos';
    const rawDate=m.dC>=0?r[m.dC]:''; const date=m.dC>=0?normalizeDate(rawDate):todayISO();
    const dateBad=m.dC>=0&&!date;
    return `<tr>
      <td class="${dateBad?'bad':''}">${date?esc(date):'⚠ '+esc(String(rawDate||''))}</td>
      <td class="${isNaN(amount)?'bad':''}">${isNaN(amount)?'—':money(amount,m.cur)}</td>
      <td>${esc(merchant||'—')}</td><td>${catIcon(cat)} ${esc(cat)}</td></tr>`;
  }).join('');
  el.innerHTML=warn+`<div class="scrollx"><table class="preview-table"><thead><tr><th>Fecha</th><th>Monto</th><th>${m.type==='ingreso'?'Fuente':'Comercio'}</th><th>Categoría</th></tr></thead><tbody>${rows}</tbody></table></div><div class="hint" style="margin-top:8px">Vista previa de las primeras filas. Si la <b>fecha</b> se ve mal, cambia la columna 📅 arriba.</div>`;
}
async function doImport(){
  const m=currentMapping();
  if(m.aC<0){ toast('Selecciona la columna de Monto'); return; }
  let imported=0,skipped=0,lastMonth='';
  for(const r of importRows){
    const amount=parseAmount(r[m.aC]); if(!(amount>0)){ skipped++; continue; }
    const merchant=m.mC>=0?String(r[m.mC]||'').trim():'';
    let category=m.cC>=0?String(r[m.cC]||'').trim():'';
    if(m.type==='gasto'&&(!category||!catLook(category))) category=autoCategory(merchant);
    if(m.type==='ingreso'&&!category) category='Otros ingresos';
    const date=m.dC>=0?(normalizeDate(r[m.dC])||todayISO()):todayISO();
    await saveTransaction({type:m.type,amount,currency:m.cur,merchant,category,date,photo:null});
    const mo=date.slice(0,7); if(mo>lastMonth) lastMonth=mo;
    imported++;
  }
  if(lastMonth) currentMonth=lastMonth;   // saltar al mes de los datos importados
  currentCurrency=m.cur;
  $('importArea').innerHTML=''; $('csvText').value=''; $('csvFile').value=''; importRawText=''; importRows=[]; importHeader=[];
  await renderAll(); switchView('resumen');
  toast(`Importados ${imported}${skipped?`, ${skipped} omitidos`:''}`);
}

/* ------------------------- Respaldo ------------------------- */
function blobToDataURL(b){ return new Promise(res=>{ if(!b){res(null);return;} const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(b); }); }
function dataURLtoBlob(u){ if(!u) return null; const [meta,b64]=u.split(','); const mime=(meta.match(/:(.*?);/)||[])[1]||'image/jpeg'; const bin=atob(b64); const a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return new Blob([a],{type:mime}); }
async function exportJson(){
  const txs=await dbGetAll('tx'), debts=await dbGetAll('debts'); const out=[];
  for(const t of txs) out.push({...t,photo:await blobToDataURL(t.photo)});
  const data={app:'mi-presupuesto',version:2,exportedAt:'',categories,debts,transactions:out};
  download(new Blob([JSON.stringify(data)],{type:'application/json'}),`respaldo-presupuesto-${todayISO()}.json`); toast('Respaldo exportado');
}
async function exportCsv(){
  const txs=(await dbGetAll('tx')).sort((a,b)=>a.date.localeCompare(b.date));
  const head='Fecha,Tipo,Monto,Moneda,Comercio,Categoria\n';
  const body=txs.map(t=>[t.date,t.type||'gasto',t.amount,t.currency||'HNL',`"${(t.merchant||'').replace(/"/g,'""')}"`,t.category].join(',')).join('\n');
  download(new Blob([head+body],{type:'text/csv'}),`movimientos-${todayISO()}.csv`); toast('CSV exportado');
}
function download(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000); }
async function importJson(file){
  try{
    const data=JSON.parse(await file.text());
    if(!data.transactions){ toast('Archivo no válido'); return; }
    if(!confirm(`Restaurar ${data.transactions.length} movimiento(s)? Se combinarán con tus datos.`)) return;
    if(data.categories) for(const c of data.categories){ if(!categories.find(x=>x.name===c.name)) await dbPut('categories',{...c,id:c.id||uid()}); }
    await ensureCategories();
    if(data.debts) for(const d of data.debts) await dbPut('debts',{...d,id:d.id||uid()});
    for(const t of data.transactions) await dbPut('tx',{...t,photo:dataURLtoBlob(t.photo),month:(t.date||todayISO()).slice(0,7)});
    await renderAll(); toast('Respaldo restaurado');
  }catch(e){ toast('Error al leer el archivo'); }
}

/* ------------------------- Navegación ------------------------- */
let currentView='resumen';
function switchView(name){
  currentView=name;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  $('view-'+name).classList.add('active');
  document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  $('fabAdd').style.display=(name==='importar'||name==='ajustes')?'none':'flex';
  window.scrollTo(0,0);
}

/* ------------------------- Wiring ------------------------- */
function wire(){
  document.querySelectorAll('.tabbar button').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  $('goDebts').addEventListener('click',()=>switchView('deudas'));
  $('fabAdd').addEventListener('click',()=>{ if(currentView==='deudas') newDebt(); else newTx(); });
  $('prevMonth').addEventListener('click',()=>{ currentMonth=addMonth(currentMonth,-1); renderAll(); });
  $('nextMonth').addEventListener('click',()=>{ currentMonth=addMonth(currentMonth,1); renderAll(); });
  document.querySelectorAll('#movFilter button').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('#movFilter button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); movFilter=b.dataset.f; renderAll();
  }));
  // tx modal
  $('saveTx').addEventListener('click',onSaveTx); $('closeTx').addEventListener('click',closeTxModal); $('deleteTx').addEventListener('click',onDeleteTx);
  $('txModal').addEventListener('click',e=>{ if(e.target.id==='txModal') closeTxModal(); });
  $('txPhoto').addEventListener('change',async e=>{ const f=e.target.files[0]; if(!f) return; pendingPhoto=await compressImage(f); $('txPhotoPreview').innerHTML=`<img class="thumb" style="width:64px;height:64px" src="${URL.createObjectURL(pendingPhoto)}">`; });
  // debt modal
  $('addDebt').addEventListener('click',newDebt); $('saveDebt').addEventListener('click',onSaveDebt); $('closeDebt').addEventListener('click',closeDebtModal); $('deleteDebt').addEventListener('click',onDeleteDebt);
  $('debtModal').addEventListener('click',e=>{ if(e.target.id==='debtModal') closeDebtModal(); });
  // import & backup
  $('csvFile').addEventListener('change',async e=>{ const f=e.target.files[0]; if(f){ importRawText=await f.text(); toast('Archivo cargado, pulsa Analizar'); } });
  $('parseCsv').addEventListener('click',analyzeCsv);
  $('exportJson').addEventListener('click',exportJson); $('exportCsv').addEventListener('click',exportCsv);
  $('importJson').addEventListener('change',e=>{ const f=e.target.files[0]; if(f) importJson(f); e.target.value=''; });
  // categorías & datos
  $('addCat').addEventListener('click',addCategory);
  $('closeImg').addEventListener('click',closeImg);
  $('wipe').addEventListener('click',async ()=>{ if(!confirm('¿Borrar TODOS los datos (gastos, ingresos y deudas)? No se puede deshacer.')) return; await dbClear('tx'); await dbClear('debts'); await dbClear('categories'); await ensureCategories(); await renderAll(); toast('Datos borrados'); });
}

/* ------------------------- Inicio ------------------------- */
async function init(){
  await openDB(); await ensureCategories(); wire(); await renderAll();
  switchView('resumen');
  if('serviceWorker' in navigator){
    try{
      const reg=await navigator.serviceWorker.register('sw.js');
      reg.addEventListener('updatefound',()=>{ const nw=reg.installing; if(!nw) return;
        nw.addEventListener('statechange',()=>{ if(nw.state==='activated' && navigator.serviceWorker.controller) location.reload(); });
      });
      if(reg.update) reg.update();
    }catch(e){}
  }
}
init();
