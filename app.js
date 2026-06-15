/* Mi Presupuesto — app de gastos personales (100% local, sin servidor) */
'use strict';

/* ------------------------- Estado y utilidades ------------------------- */
const DB_NAME = 'presupuesto';
const DB_VERSION = 1;
let db = null;
let currentMonth = ymNow();          // "YYYY-MM"
let categories = [];                  // cache de categorías
let CURRENCY = localStorage.getItem('currency') || 'USD';

function ymNow(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }
function todayISO(){ const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function $(id){ return document.getElementById(id); }
function money(n){
  const v = Number(n)||0;
  try { return new Intl.NumberFormat('es', {style:'currency', currency:CURRENCY}).format(v); }
  catch(e){ return '$' + v.toFixed(2); }
}
function monthLabel(ym){
  const [y,m] = ym.split('-').map(Number);
  const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return names[m-1] + ' ' + y;
}
function addMonth(ym, delta){
  let [y,m] = ym.split('-').map(Number);
  m += delta;
  while(m<1){ m+=12; y--; } while(m>12){ m-=12; y++; }
  return y + '-' + String(m).padStart(2,'0');
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
let toastTimer;
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ------------------------- IndexedDB ------------------------- */
function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const d = e.target.result;
      if(!d.objectStoreNames.contains('tx')){
        const s = d.createObjectStore('tx', {keyPath:'id'});
        s.createIndex('month','month');
      }
      if(!d.objectStoreNames.contains('categories')){
        d.createObjectStore('categories', {keyPath:'id'});
      }
    };
    req.onsuccess = ()=>{ db = req.result; resolve(db); };
    req.onerror = ()=> reject(req.error);
  });
}
function tx(store, mode='readonly'){ return db.transaction(store, mode).objectStore(store); }
function dbGetAll(store){
  return new Promise((res,rej)=>{ const r = tx(store).getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
}
function dbPut(store, val){
  return new Promise((res,rej)=>{ const r = tx(store,'readwrite').put(val); r.onsuccess=()=>res(val); r.onerror=()=>rej(r.error); });
}
function dbDel(store, key){
  return new Promise((res,rej)=>{ const r = tx(store,'readwrite').delete(key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
}
function dbClear(store){
  return new Promise((res,rej)=>{ const r = tx(store,'readwrite').clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
}

/* ------------------------- Categorías por defecto ------------------------- */
const DEFAULT_CATEGORIES = [
  {name:'Supermercado', icon:'🛒', color:'#22c55e', keywords:['super','market','grocery','walmart','soriana','oxxo','aurrera','costco','mercado']},
  {name:'Restaurantes', icon:'🍔', color:'#f59e0b', keywords:['rest','cafe','café','coffee','starbucks','mcdonald','burger','pizza','taco','bar ','food']},
  {name:'Transporte', icon:'🚗', color:'#0ea5e9', keywords:['uber','lyft','taxi','gas','gasolin','pemex','shell','metro','bus','parking','estacion']},
  {name:'Compras', icon:'🛍️', color:'#a855f7', keywords:['amazon','store','tienda','shop','liverpool','zara','nike','mall']},
  {name:'Servicios', icon:'💡', color:'#eab308', keywords:['cfe','luz','agua','gas natural','internet','telmef','telcel','at&t','netflix','spotify','phone','renta','rent']},
  {name:'Salud', icon:'💊', color:'#ef4444', keywords:['farmacia','pharmacy','hospital','doctor','clinic','dental','gym','gimnasio']},
  {name:'Entretenimiento', icon:'🎬', color:'#ec4899', keywords:['cine','cinema','movie','game','juego','concert','boleto','ticket']},
  {name:'Otros', icon:'📦', color:'#94a3b8', keywords:[]}
];
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

async function ensureCategories(){
  categories = await dbGetAll('categories');
  if(!categories.length){
    for(const c of DEFAULT_CATEGORIES){ await dbPut('categories', {id:uid(), ...c}); }
    categories = await dbGetAll('categories');
  }
}
function catByName(name){ return categories.find(c=>c.name===name); }
function catColor(name){ const c=catByName(name); return c?c.color:'#94a3b8'; }
function catIcon(name){ const c=catByName(name); return c?c.icon:'📦'; }

function autoCategory(merchant){
  const m = (merchant||'').toLowerCase();
  for(const c of categories){
    for(const kw of (c.keywords||[])){
      if(kw && m.includes(kw.toLowerCase())) return c.name;
    }
  }
  return (catByName('Otros') ? 'Otros' : (categories[0] && categories[0].name) || 'Otros');
}

/* ------------------------- Datos: transacciones ------------------------- */
async function getMonthTx(ym){
  const all = await dbGetAll('tx');
  return all.filter(t=>t.month===ym).sort((a,b)=> (b.date.localeCompare(a.date)) || (b.createdAt-a.createdAt));
}
async function saveTransaction(t){
  t.month = (t.date||todayISO()).slice(0,7);
  t.amount = Math.abs(Number(t.amount)||0);
  if(!t.id){ t.id = uid(); t.createdAt = Date.now(); }
  await dbPut('tx', t);
}

/* ------------------------- Render ------------------------- */
async function refreshMonthSelect(){
  const all = await dbGetAll('tx');
  const set = new Set(all.map(t=>t.month));
  set.add(currentMonth); set.add(ymNow());
  const months = [...set].sort().reverse();
  const sel = $('monthSelect');
  sel.innerHTML = months.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');
  sel.value = currentMonth;
}

async function renderAll(){
  await refreshMonthSelect();
  const list = await getMonthTx(currentMonth);
  const prevList = await getMonthTx(addMonth(currentMonth,-1));
  renderResumen(list, prevList);
  renderTxList(list);
  renderCategoriesView();
  $('subtitle').textContent = `${list.length} movimiento(s) · ${monthLabel(currentMonth)}`;
}

function sum(list){ return list.reduce((a,t)=>a+(Number(t.amount)||0),0); }

function renderResumen(list, prevList){
  const total = sum(list);
  $('monthTotal').innerHTML = money(total) + (CURRENCY!=='USD'?'':'');
  $('kpiCount').textContent = list.length;
  const [cy,cm] = currentMonth.split('-').map(Number);
  const daysSoFar = currentMonth===ymNow() ? new Date().getDate() : new Date(cy, cm, 0).getDate();
  $('kpiAvg').textContent = money(total / Math.max(1, daysSoFar));
  $('kpiMax').textContent = money(list.reduce((m,t)=>Math.max(m, Number(t.amount)||0),0));
  const prevTotal = sum(prevList);
  if(prevTotal>0){
    const d = ((total-prevTotal)/prevTotal)*100;
    const up = d>=0;
    $('kpiDelta').innerHTML = `<span style="color:${up?'#ef4444':'#22c55e'}">${up?'▲':'▼'} ${Math.abs(d).toFixed(0)}%</span>`;
  } else { $('kpiDelta').textContent = '—'; }

  // Barras por categoría
  const byCat = {};
  for(const t of list){ byCat[t.category] = (byCat[t.category]||0) + (Number(t.amount)||0); }
  const entries = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const max = entries.length ? entries[0][1] : 0;
  const bars = $('catBars');
  if(!entries.length){ bars.innerHTML = '<div class="empty">Sin datos este mes.</div>'; }
  else {
    bars.innerHTML = entries.map(([cat,val])=>{
      const pct = max? Math.round(val/max*100):0;
      const share = total? Math.round(val/total*100):0;
      return `<div class="bar-row">
        <div class="bar-top">
          <span class="cat"><span class="dot" style="background:${catColor(cat)}"></span>${catIcon(cat)} ${esc(cat)}</span>
          <span><b>${money(val)}</b> <span class="pill">${share}%</span></span>
        </div>
        <div class="track"><div class="fill" style="width:${pct}%;background:${catColor(cat)}"></div></div>
      </div>`;
    }).join('');
  }

  // Recientes (5)
  renderTxInto($('recentList'), list.slice(0,5), true);
}

function renderTxList(list){ renderTxInto($('txList'), list, false); }

function renderTxInto(container, list, compact){
  if(!list.length){ container.innerHTML = '<div class="empty">No hay movimientos. Usa ＋ o importa tu CSV.</div>'; return; }
  container.innerHTML = list.map(t=>{
    const d = t.date ? t.date.slice(8,10)+'/'+t.date.slice(5,7) : '';
    const thumb = t.photo ? `<img class="thumb" data-img="${t.id}" src="" alt="recibo">` : '';
    return `<div class="tx" data-edit="${t.id}">
      <div class="ic" style="background:${hexA(catColor(t.category),.18)}">${catIcon(t.category)}</div>
      <div class="mid">
        <div class="mer">${esc(t.merchant||'(sin nombre)')}</div>
        <div class="meta"><span class="pill">${esc(t.category)}</span><span>${d}</span></div>
      </div>
      ${thumb}
      <div class="amt">${money(t.amount)}</div>
    </div>`;
  }).join('');
  // cargar miniaturas (blob -> objectURL)
  container.querySelectorAll('.thumb[data-img]').forEach(img=>{
    const t = list.find(x=>x.id===img.dataset.img);
    if(t && t.photo){ img.src = URL.createObjectURL(t.photo); }
    img.addEventListener('click', (e)=>{ e.stopPropagation(); openImg(t.photo); });
  });
  container.querySelectorAll('[data-edit]').forEach(row=>{
    row.addEventListener('click', ()=> editTx(row.dataset.edit, list));
  });
}

function hexA(hex,a){
  const h = hex.replace('#',''); const n = parseInt(h.length===3? h.split('').map(c=>c+c).join('') : h,16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

/* ------------------------- Vista categorías ------------------------- */
function renderCategoriesView(){
  const el = $('catList');
  el.innerHTML = categories.map(c=>`
    <div class="tx" data-cat="${c.id}">
      <div class="ic" style="background:${hexA(c.color,.18)}">${c.icon||'🏷️'}</div>
      <div class="mid">
        <div class="mer">${esc(c.name)}</div>
        <div class="meta">${(c.keywords&&c.keywords.length)? esc(c.keywords.join(', ')) : '<span style="opacity:.6">sin palabras clave</span>'}</div>
      </div>
      <button class="ghost" data-editcat="${c.id}">Editar</button>
    </div>`).join('');
  el.querySelectorAll('[data-editcat]').forEach(b=> b.addEventListener('click', ()=> editCategory(b.dataset.editcat)));
}

async function editCategory(id){
  const c = categories.find(x=>x.id===id);
  if(!c) return;
  const name = prompt('Nombre de la categoría:', c.name); if(name===null) return;
  const icon = prompt('Emoji / ícono:', c.icon||'🏷️'); if(icon===null) return;
  const color = prompt('Color (hex, ej #14b8a6):', c.color||'#14b8a6'); if(color===null) return;
  const kws = prompt('Palabras clave separadas por coma (para auto-categorizar):', (c.keywords||[]).join(', '));
  if(kws===null) return;
  c.name=name.trim()||c.name; c.icon=icon.trim()||c.icon; c.color=color.trim()||c.color;
  c.keywords = kws.split(',').map(s=>s.trim()).filter(Boolean);
  await dbPut('categories', c);
  await ensureCategories();
  renderCategoriesView(); fillCategorySelect(); renderAll();
  toast('Categoría guardada');
}
async function addCategory(){
  const name = prompt('Nombre de la nueva categoría:'); if(!name) return;
  const icon = prompt('Emoji / ícono:', '🏷️')||'🏷️';
  const color = prompt('Color (hex):', '#14b8a6')||'#14b8a6';
  const kws = prompt('Palabras clave (coma):','')||'';
  await dbPut('categories', {id:uid(), name:name.trim(), icon:icon.trim(), color:color.trim(), keywords:kws.split(',').map(s=>s.trim()).filter(Boolean)});
  await ensureCategories(); renderCategoriesView(); fillCategorySelect();
  toast('Categoría creada');
}

/* ------------------------- Modal de gasto ------------------------- */
let pendingPhoto = null;       // Blob seleccionado en el modal
function fillCategorySelect(){
  const sel = $('txCategory');
  sel.innerHTML = categories.map(c=>`<option value="${esc(c.name)}">${c.icon} ${esc(c.name)}</option>`).join('');
}
function openTxModal(){ $('txModal').classList.add('open'); }
function closeTxModal(){ $('txModal').classList.remove('open'); pendingPhoto=null; $('txPhotoPreview').innerHTML=''; $('txPhoto').value=''; }

function newTx(){
  $('txModalTitle').textContent='Nuevo gasto';
  $('txId').value=''; $('txAmount').value=''; $('txMerchant').value='';
  $('txDate').value=todayISO();
  fillCategorySelect();
  pendingPhoto=null; $('txPhotoPreview').innerHTML=''; $('txPhoto').value='';
  $('deleteTx').style.display='none';
  openTxModal();
}
let editList = [];
function editTx(id, list){
  editList = list;
  const t = list.find(x=>x.id===id); if(!t) return;
  $('txModalTitle').textContent='Editar gasto';
  $('txId').value=t.id; $('txAmount').value=t.amount; $('txMerchant').value=t.merchant||'';
  $('txDate').value=t.date||todayISO();
  fillCategorySelect(); $('txCategory').value=t.category;
  pendingPhoto = t.photo || null;
  $('txPhotoPreview').innerHTML = t.photo ? `<img class="thumb" style="width:70px;height:70px" src="${URL.createObjectURL(t.photo)}">` : '';
  $('txPhoto').value='';
  $('deleteTx').style.display='block';
  openTxModal();
}

async function onSaveTx(){
  const id = $('txId').value;
  const amount = parseFloat($('txAmount').value);
  if(!(amount>0)){ toast('Ingresa un monto válido'); return; }
  const t = {
    id: id||undefined,
    amount,
    date: $('txDate').value || todayISO(),
    merchant: $('txMerchant').value.trim(),
    category: $('txCategory').value,
    photo: pendingPhoto || null,
    createdAt: undefined
  };
  if(id){ const old = editList.find(x=>x.id===id); if(old){ t.createdAt = old.createdAt; } }
  await saveTransaction(t);
  closeTxModal(); await renderAll();
  toast('Gasto guardado');
}
async function onDeleteTx(){
  const id = $('txId').value; if(!id) return;
  if(!confirm('¿Eliminar este gasto?')) return;
  await dbDel('tx', id); closeTxModal(); await renderAll(); toast('Gasto eliminado');
}

/* ------------------------- Fotos (compresión) ------------------------- */
function compressImage(file, maxDim=1280, quality=0.7){
  return new Promise((resolve)=>{
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = ()=>{
      let {width,height} = img;
      if(width>height && width>maxDim){ height = Math.round(height*maxDim/width); width=maxDim; }
      else if(height>maxDim){ width = Math.round(width*maxDim/height); height=maxDim; }
      const canvas = document.createElement('canvas');
      canvas.width=width; canvas.height=height;
      canvas.getContext('2d').drawImage(img,0,0,width,height);
      canvas.toBlob(b=>{ URL.revokeObjectURL(url); resolve(b||file); }, 'image/jpeg', quality);
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* ------------------------- Visor de imagen ------------------------- */
let imgUrl=null;
function openImg(blob){ if(!blob) return; imgUrl=URL.createObjectURL(blob); $('imgViewImg').src=imgUrl; $('imgView').classList.add('open'); }
function closeImg(){ $('imgView').classList.remove('open'); if(imgUrl){ URL.revokeObjectURL(imgUrl); imgUrl=null; } }

/* ------------------------- CSV ------------------------- */
function detectDelimiter(text){
  const line = text.split(/\r?\n/).find(l=>l.trim()) || '';
  const counts = {',':0,';':0,'\t':0,'|':0};
  for(const ch of line){ if(ch in counts) counts[ch]++; }
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0] || ',';
}
function parseCSV(text, delim){
  const rows=[]; let row=[]; let field=''; let i=0; let inQ=false;
  while(i<text.length){
    const c=text[i];
    if(inQ){
      if(c==='"'){ if(text[i+1]==='"'){ field+='"'; i+=2; continue; } inQ=false; i++; continue; }
      field+=c; i++; continue;
    }
    if(c==='"'){ inQ=true; i++; continue; }
    if(c===delim){ row.push(field); field=''; i++; continue; }
    if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; i++; continue; }
    if(c==='\r'){ i++; continue; }
    field+=c; i++;
  }
  if(field.length||row.length){ row.push(field); rows.push(row); }
  return rows.filter(r=> r.some(c=> String(c).trim()!==''));
}
function looksLikeDate(s){ return /\d{1,4}[\/\-.]\d{1,2}([\/\-.]\d{1,4})?/.test(s) || /\d{4}-\d{2}-\d{2}/.test(s); }
function parseAmount(s){
  if(s==null) return NaN;
  let v = String(s).replace(/[^\d.,\-]/g,'').trim();
  if(!v) return NaN;
  // Si hay coma y punto, el último es el decimal
  if(v.includes(',') && v.includes('.')){
    if(v.lastIndexOf(',')>v.lastIndexOf('.')) v = v.replace(/\./g,'').replace(',', '.');
    else v = v.replace(/,/g,'');
  } else if(v.includes(',')){
    // coma como decimal si hay 2 dígitos después
    if(/,\d{2}$/.test(v)) v = v.replace(/\./g,'').replace(',', '.'); else v = v.replace(/,/g,'');
  }
  const n = parseFloat(v); return isNaN(n)? NaN : Math.abs(n);
}
function normalizeDate(s){
  s = String(s).trim();
  let m;
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  if((m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))){
    let [,a,b,y]=m; if(y.length===2) y='20'+y;
    // Asumir DD/MM/YYYY (formato Latinoamérica). Si a>12, es día.
    let day=a, mon=b;
    if(Number(a)>12 && Number(b)<=12){ day=a; mon=b; }
    else if(Number(b)>12 && Number(a)<=12){ day=b; mon=a; }
    return `${y}-${p2(mon)}-${p2(day)}`;
  }
  const d = new Date(s); if(!isNaN(d)) return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());
  return todayISO();
}
function p2(x){ return String(x).padStart(2,'0'); }

let importRows = [];   // filas crudas (sin encabezado)
let importHeader = []; // nombres de columna

function guessColumns(header, sample){
  const H = header.map(h=>String(h).toLowerCase());
  const find = (...keys)=> H.findIndex(h=> keys.some(k=> h.includes(k)));
  let dateCol = find('fecha','date','día','dia','time','hora');
  let amtCol  = find('monto','importe','amount','total','precio','cantidad','valor','cobro','$');
  let merCol  = find('comercio','merchant','tienda','descrip','concepto','lugar','nombre','detalle','store');
  let catCol  = find('categor','category','tipo','rubro');
  // Heurística por contenido si no se detectó
  const cols = (sample[0]||[]).length;
  if(dateCol<0){ for(let i=0;i<cols;i++){ if(sample.some(r=>looksLikeDate(r[i]))){ dateCol=i; break; } } }
  if(amtCol<0){ for(let i=0;i<cols;i++){ if(i!==dateCol && sample.some(r=>!isNaN(parseAmount(r[i])) && /\d/.test(String(r[i])))){ amtCol=i; break; } } }
  if(merCol<0){ for(let i=0;i<cols;i++){ if(i!==dateCol && i!==amtCol){ merCol=i; break; } } }
  return {dateCol, amtCol, merCol, catCol};
}

function analyzeCsv(){
  const text = importRawText || $('csvText').value;
  if(!text || !text.trim()){ toast('Sube un archivo o pega el CSV'); return; }
  const delim = detectDelimiter(text);
  let rows = parseCSV(text, delim);
  if(!rows.length){ toast('No se encontraron filas'); return; }
  // ¿La primera fila es encabezado? (no parece fecha ni número en su mayoría)
  const first = rows[0];
  const firstIsHeader = first.filter(c=> looksLikeDate(c) || !isNaN(parseAmount(c))).length < Math.ceil(first.length/2);
  importHeader = firstIsHeader ? first.map(h=>String(h).trim()) : first.map((_,i)=>'Columna '+(i+1));
  importRows = firstIsHeader ? rows.slice(1) : rows;
  if(!importRows.length){ toast('No hay filas de datos'); return; }

  const guess = guessColumns(importHeader, importRows.slice(0,20));
  renderImportUI(guess);
}

function colOptions(sel){
  return importHeader.map((h,i)=>`<option value="${i}" ${i===sel?'selected':''}>${esc(h)}</option>`).join('') + `<option value="-1" ${sel<0?'selected':''}>— ninguna —</option>`;
}
function renderImportUI(guess){
  const area = $('importArea');
  const preview = importRows.slice(0,5);
  area.innerHTML = `
    <div class="hint" style="margin-top:14px;color:var(--text)"><b>${importRows.length}</b> fila(s) detectadas. Confirma qué columna es cada cosa:</div>
    <div class="row2" style="margin-top:8px">
      <label class="field">📅 Fecha <select id="mapDate">${colOptions(guess.dateCol)}</select></label>
      <label class="field">💵 Monto <select id="mapAmt">${colOptions(guess.amtCol)}</select></label>
    </div>
    <div class="row2">
      <label class="field">🏪 Comercio <select id="mapMer">${colOptions(guess.merCol)}</select></label>
      <label class="field">🏷️ Categoría <select id="mapCat">${colOptions(guess.catCol)}</select></label>
    </div>
    <div class="scrollx"><table class="preview-table"><thead><tr>${importHeader.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${preview.map(r=>`<tr>${importHeader.map((_,i)=>`<td>${esc(r[i]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <button class="block" id="doImport" style="margin-top:12px">Importar ${importRows.length} gasto(s)</button>
  `;
  $('doImport').addEventListener('click', doImport);
}

async function doImport(){
  const dC = +$('mapDate').value, aC = +$('mapAmt').value, mC = +$('mapMer').value, cC = +$('mapCat').value;
  if(aC<0){ toast('Selecciona la columna de Monto'); return; }
  let imported=0, skipped=0;
  for(const r of importRows){
    const amount = parseAmount(r[aC]);
    if(!(amount>0)){ skipped++; continue; }
    const merchant = mC>=0 ? String(r[mC]||'').trim() : '';
    let category = cC>=0 ? String(r[cC]||'').trim() : '';
    if(!category || !catByName(category)) category = autoCategory(merchant);
    const date = dC>=0 ? normalizeDate(r[dC]) : todayISO();
    await saveTransaction({amount, merchant, category, date, photo:null});
    imported++;
  }
  $('importArea').innerHTML=''; $('csvText').value=''; $('csvFile').value=''; importRawText='';
  importRows=[]; importHeader=[];
  await renderAll();
  switchView('resumen');
  toast(`Importados ${imported} gasto(s)${skipped?`, ${skipped} omitidos`:''}`);
}

/* ------------------------- Export / Import respaldo ------------------------- */
function blobToDataURL(blob){
  return new Promise(res=>{ if(!blob){res(null);return;} const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(blob); });
}
function dataURLtoBlob(dataURL){
  if(!dataURL) return null;
  const [meta,b64]=dataURL.split(','); const mime=(meta.match(/:(.*?);/)||[])[1]||'image/jpeg';
  const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new Blob([arr],{type:mime});
}
async function exportJson(){
  const txs = await dbGetAll('tx');
  const out = [];
  for(const t of txs){ out.push({...t, photo: await blobToDataURL(t.photo)}); }
  const data = {app:'mi-presupuesto', version:1, exportedAt:new Date().toISOString(), currency:CURRENCY, categories, transactions:out};
  download(new Blob([JSON.stringify(data)],{type:'application/json'}), `respaldo-presupuesto-${todayISO()}.json`);
  toast('Respaldo exportado');
}
async function exportCsv(){
  const txs = (await dbGetAll('tx')).sort((a,b)=>a.date.localeCompare(b.date));
  const head = 'Fecha,Monto,Comercio,Categoria\n';
  const body = txs.map(t=>[t.date, t.amount, `"${(t.merchant||'').replace(/"/g,'""')}"`, t.category].join(',')).join('\n');
  download(new Blob([head+body],{type:'text/csv'}), `gastos-${todayISO()}.csv`);
  toast('CSV exportado');
}
function download(blob, name){
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
}
async function importJson(file){
  try{
    const data = JSON.parse(await file.text());
    if(!data.transactions){ toast('Archivo no válido'); return; }
    if(!confirm(`Restaurar ${data.transactions.length} gasto(s)? Se combinarán con tus datos actuales.`)) return;
    if(data.categories && data.categories.length){
      for(const c of data.categories){ if(!catByName(c.name)) await dbPut('categories', {...c, id:c.id||uid()}); }
      await ensureCategories(); fillCategorySelect();
    }
    if(data.currency){ CURRENCY=data.currency; localStorage.setItem('currency',CURRENCY); }
    for(const t of data.transactions){
      await dbPut('tx', {...t, photo: dataURLtoBlob(t.photo), month:(t.date||todayISO()).slice(0,7)});
    }
    await renderAll(); toast('Respaldo restaurado');
  }catch(e){ toast('Error al leer el archivo'); }
}

/* ------------------------- Navegación ------------------------- */
function switchView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  $('view-'+name).classList.add('active');
  document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  window.scrollTo(0,0);
}

/* ------------------------- Eventos ------------------------- */
let importRawText = '';
function wire(){
  document.querySelectorAll('.tabbar button').forEach(b=> b.addEventListener('click', ()=>switchView(b.dataset.view)));
  $('fabAdd').addEventListener('click', newTx);
  $('saveTx').addEventListener('click', onSaveTx);
  $('closeTx').addEventListener('click', closeTxModal);
  $('deleteTx').addEventListener('click', onDeleteTx);
  $('txModal').addEventListener('click', e=>{ if(e.target.id==='txModal') closeTxModal(); });
  $('txPhoto').addEventListener('change', async e=>{
    const f=e.target.files[0]; if(!f) return;
    pendingPhoto = await compressImage(f);
    $('txPhotoPreview').innerHTML = `<img class="thumb" style="width:70px;height:70px" src="${URL.createObjectURL(pendingPhoto)}">`;
  });
  $('monthSelect').addEventListener('change', e=>{ currentMonth=e.target.value; renderAll(); });
  $('prevMonth').addEventListener('click', ()=>{ currentMonth=addMonth(currentMonth,-1); renderAll(); });
  $('nextMonth').addEventListener('click', ()=>{ currentMonth=addMonth(currentMonth,1); renderAll(); });
  $('csvFile').addEventListener('change', async e=>{ const f=e.target.files[0]; if(f){ importRawText=await f.text(); toast('Archivo cargado, pulsa Analizar'); } });
  $('parseCsv').addEventListener('click', analyzeCsv);
  $('exportJson').addEventListener('click', exportJson);
  $('exportCsv').addEventListener('click', exportCsv);
  $('importJson').addEventListener('change', e=>{ const f=e.target.files[0]; if(f) importJson(f); e.target.value=''; });
  $('addCat').addEventListener('click', addCategory);
  $('closeImg').addEventListener('click', closeImg);
  $('wipe').addEventListener('click', async ()=>{
    if(!confirm('¿Borrar TODOS los gastos y categorías? Esto no se puede deshacer.')) return;
    await dbClear('tx'); await dbClear('categories'); await ensureCategories();
    fillCategorySelect(); await renderAll(); toast('Datos borrados');
  });
}

/* ------------------------- Inicio ------------------------- */
async function init(){
  await openDB();
  await ensureCategories();
  fillCategorySelect();
  wire();
  await renderAll();
  if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('sw.js'); }catch(e){} }
}
init();
