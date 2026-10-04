'use strict';
/* =========================================================
   Zium Fitness · Estoque e Vendas
   App estático (sem build). Dados ficam no navegador (localStorage).
   ========================================================= */

/* ---------- utilidades ---------- */
const KEY = 'zium_estoque_v1', SES = 'zium_sessao_v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const brl = n => (+n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const int = n => Math.round(+n || 0).toLocaleString('pt-BR');
const pad = (n, l = 2) => String(n).padStart(l, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const fdate = iso => (iso ? iso.split('-').reverse().join('/') : '');
const digits = s => String(s || '').replace(/\D/g, '');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/* ---------- banco local ---------- */
let db, me = null;
const ui = { per: 'mes', cadTab: 'products', rel: 'estoque', saidaMode: 'venda', histTab: 'entries' };

function defaults() {
  const mk = n => ({ id: uid(), name: n, active: true });
  return {
    users: [],
    locations: ['Casa', 'Loja'].map(mk),
    paymentMethods: ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito'].map(mk),
    saleTypes: ['Vendas da loja', 'Vendas por indicação', 'Vendas redes sociais', 'Outros'].map(mk),
    suppliers: [], products: [], customers: [], entries: [], sales: [], transfers: [], orders: []
  };
}
function load() {
  try { const r = localStorage.getItem(KEY); db = r ? JSON.parse(r) : defaults(); } catch { db = defaults(); }
  const d = defaults();
  for (const k of Object.keys(d)) if (!Array.isArray(db[k])) db[k] = d[k];
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { toast('Não consegui salvar no navegador (armazenamento cheio ou bloqueado).', true); }
  if (cloudOn && cloudReady) { dirty = true; clearTimeout(pushT); pushT = setTimeout(push, 700); setSync('pend'); }
}

/* ---------- sincronização com a planilha (Google Sheets via Apps Script) ---------- */
const CLOUD = window.ZIUM_CLOUD || {};
const cloudOn = !!(CLOUD.url && CLOUD.token);
let cloudRev = null, cloudReady = false, pushT = null, pushing = false, dirty = false, syncState = 'ok';
async function cloudCall(body) {
  const r = await fetch(CLOUD.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: CLOUD.token, ...body }) });
  return r.json();
}
const SYNC_TXT = { ok: '☁ Planilha sincronizada', pend: '☁ Salvando…', err: '⚠ Sem conexão com a planilha — tentando de novo' };
function setSync(s) { syncState = s; const el = $('#sync'); if (el) el.textContent = SYNC_TXT[s] || ''; }
function adopt(data, rev) {
  db = data; load2(); cloudRev = rev; dirty = false;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { }
  me = db.users.find(u => u.id === me?.id && u.active !== false) || null; render();
}
async function push() {
  if (pushing) { pushT = setTimeout(push, 500); return; }
  pushing = true; dirty = false;
  try {
    const j = await cloudCall({ action: 'save', baseRev: cloudRev, data: db });
    if (j.ok) { cloudRev = j.rev; setSync(dirty ? 'pend' : 'ok'); }
    else if (j.error === 'conflict') { adopt(j.data, j.rev); setSync('ok'); toast('Outra pessoa alterou os dados ao mesmo tempo. Recarreguei — refaça sua última ação.', true); }
    else throw new Error(j.error);
  } catch { dirty = true; setSync('err'); clearTimeout(pushT); pushT = setTimeout(push, 8000); }
  finally { pushing = false; }
}
async function pullIfChanged() {
  if (!cloudOn || !cloudReady || dirty || pushing || !$('#modal').hidden || document.hidden) return;
  if (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  try { const j = await cloudCall({ action: 'load' }); if (j.ok && j.rev !== cloudRev && !dirty) adopt(j.data, j.rev); } catch { }
}

/* ---------- login ---------- */
async function hashPw(pw, salt) {
  const data = new TextEncoder().encode(salt + ':' + pw);
  if (window.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const c of data) h = ((h << 5) + h + c) >>> 0; return 'x' + h;
}
async function ensureAdmin() {
  if (db.users.length) return;
  const salt = uid();
  db.users.push({ id: uid(), name: 'Administrador', login: 'admin', salt, hash: await hashPw('zium123', salt), role: 'admin', active: true, defaultPw: true });
  save();
}
async function tryLogin(login, pw) {
  const u = db.users.find(u => norm(u.login) === norm(login) && u.active !== false);
  if (!u) return null;
  return (await hashPw(pw, u.salt)) === u.hash ? u : null;
}
const isAdmin = () => me && me.role === 'admin';

/* ---------- regras de estoque ---------- */
const prod = id => db.products.find(p => p.id === id);
const sup = id => db.suppliers.find(s => s.id === id);
const cust = id => db.customers.find(c => c.id === id);
const byId = (list, id) => list.find(x => x.id === id);
const prodLabel = p => p ? `${p.sku} · ${p.name}${p.size ? ' ' + p.size : ''}${p.color ? ' · ' + p.color : ''}` : '(removido)';
const prodShort = p => p ? `${p.name}${p.size ? ' ' + p.size : ''}${p.color ? ' ' + p.color : ''}` : '(removido)';

const defLoc = () => (db.locations[0] || {}).id || '';
const locOf = x => x.locationId || defLoc();
const locName = id => (byId(db.locations, id) || {}).name || '—';
/* estoque por produto; com `loc` considera só aquele local (Casa/Loja), sem `loc` soma todos */
function stockMap(loc) {
  const m = {};
  for (const p of db.products) m[p.id] = 0;
  for (const e of db.entries) if (!loc || locOf(e) === loc) m[e.productId] = (m[e.productId] || 0) + e.qty;
  for (const s of db.sales) if (!loc || locOf(s) === loc) for (const i of s.items) m[i.productId] = (m[i.productId] || 0) - i.qty;
  for (const t of db.transfers) {
    const from = t.fromId || defLoc(), to = t.toId || '';
    if (!loc) { if (!to) m[t.productId] = (m[t.productId] || 0) - t.qty; }
    else { if (from === loc) m[t.productId] = (m[t.productId] || 0) - t.qty; if (to === loc) m[t.productId] = (m[t.productId] || 0) + t.qty; }
  }
  return m;
}
function avgDaily(pid, days = 30) {
  const from = addDays(today(), -days); let q = 0;
  for (const s of db.sales) if (s.date > from) for (const i of s.items) if (i.productId === pid) q += i.qty;
  return q / days;
}
function leadFor(p) {
  if (p.leadDays !== '' && p.leadDays != null) return num(p.leadDays);
  const s = sup(p.supplierId); return s ? num(s.leadDays) : 0;
}
function pendingOrders(pid) { return db.orders.filter(o => o.status === 'pendente' && (!pid || o.productId === pid)); }

/* status de reposição de um produto */
function reorder(p, stock) {
  const lead = leadFor(p), avg = avgDaily(p.id), min = num(p.minStock);
  const rop = Math.ceil(avg * lead) + min;
  const pend = pendingOrders(p.id);
  const pendQty = sum(pend, o => o.qty);
  const late = pend.some(o => o.expectedDate && o.expectedDate < today());
  const hasHistory = db.entries.some(e => e.productId === p.id) || min > 0;
  const suggest = Math.max(1, Math.ceil(avg * (lead + 30)) + min - stock - pendQty);
  let st = 'ok';
  if (p.active !== false && hasHistory && stock <= rop) {
    if (pendQty > 0) st = late ? 'atrasado' : 'caminho';
    else st = stock <= 0 ? 'zerado' : 'pedir';
  }
  return { lead, avg, rop, pendQty, suggest, st, hasHistory };
}
const ST = {
  ok: ['ok', 'OK'], pedir: ['warn', 'Pedir agora'], zerado: ['bad', 'Zerado'],
  caminho: ['info', 'Pedido a caminho'], atrasado: ['bad', 'Pedido atrasado']
};
const stPill = k => `<span class="pill ${ST[k][0]}">${ST[k][1]}</span>`;
function alertList() {
  const sm = stockMap();
  return db.products.map(p => ({ p, stock: sm[p.id] || 0, r: reorder(p, sm[p.id] || 0) })).filter(x => x.r.st !== 'ok');
}
const needOrder = () => alertList().filter(x => x.r.st === 'pedir' || x.r.st === 'zerado' || x.r.st === 'atrasado');

/* ---------- períodos ---------- */
function range(p) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  if (p === 'mes') return [ymd(new Date(y, m, 1)), ymd(new Date(y, m + 1, 0))];
  if (p === 'mesant') return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
  if (p === '30d') return [addDays(today(), -29), today()];
  if (p === 'ano') return [`${y}-01-01`, `${y}-12-31`];
  if (p === 'custom') return [ui.from || '0000-01-01', ui.to || '9999-12-31'];
  return ['0000-01-01', '9999-12-31'];
}
const inRange = (d, [a, b]) => d >= a && d <= b;
function periodSel() {
  const o = [['mes', 'Este mês'], ['mesant', 'Mês passado'], ['30d', '30 dias'], ['ano', 'Este ano'], ['tudo', 'Tudo'], ['custom', 'Personalizado']];
  return `<div class="row no-print"><div class="seg">${o.map(([k, t]) => `<button data-act="per" data-k="${k}" class="${ui.per === k ? 'on' : ''}">${t}</button>`).join('')}</div>
  ${ui.per === 'custom' ? `<input type="date" style="width:auto" value="${ui.from || ''}" data-on="from"> <span class="muted">até</span> <input type="date" style="width:auto" value="${ui.to || ''}" data-on="to">` : ''}</div>`;
}
const perLabel = () => ui.per === 'tudo' ? 'Todo o período' : (r => `${fdate(r[0])} a ${fdate(r[1])}`)(range(ui.per));

/* ---------- vendas: cálculos ---------- */
const saleCost = s => sum(s.items, i => i.qty * i.cost);
const saleQty = s => sum(s.items, i => i.qty);
const saleItemsText = s => s.items.map(i => `${i.qty}× ${prodShort(prod(i.productId))}`).join(', ');

/* ---------- UI base ---------- */
const ICON = {
  dashboard: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  estoque: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  entrada: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  saida: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  vendas: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  cadastros: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  relatorios: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'
};
const ROUTES = {
  dashboard: ['Dashboard', () => viewDashboard()],
  estoque: ['Estoque', () => viewEstoque()],
  entrada: ['Entrada', () => viewEntrada()],
  saida: ['Saída', () => viewSaida()],
  vendas: ['Vendas', () => viewVendas()],
  cadastros: ['Cadastros', () => viewCadastros()],
  relatorios: ['Relatórios', () => viewRelatorios()]
};
const curRoute = () => { const r = location.hash.replace(/^#\/?/, ''); return ROUTES[r] ? r : 'dashboard'; };
const go = r => { location.hash = '#/' + r; };

let toastT;
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, err ? 5000 : 2600);
}
function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="box">${html}</div>`; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; modalCtx = null; }
let modalCtx = null;

function render() {
  const app = $('#app');
  if (!me) {
    const adm = db.users.find(u => u.defaultPw);
    app.innerHTML = `<div class="login"><form class="login-card" data-form="login" autocomplete="on">
      <img src="logo.svg" alt="Zium Fitness">
      <div class="fgrid" style="grid-template-columns:1fr">
        <div><label>Usuário</label><input name="login" autocomplete="username" required autofocus></div>
        <div><label>Senha</label><input name="pw" type="password" autocomplete="current-password" required></div>
      </div>
      <button class="btn block" style="margin-top:20px">Entrar</button>
      ${adm ? `<div class="hint">Primeiro acesso: usuário <b>admin</b> · senha <b>zium123</b>.<br>Troque a senha logo depois de entrar.</div>` : ''}
    </form></div>`;
    return;
  }
  const r = curRoute();
  const nAlert = needOrder().length;
  const nav = Object.entries(ROUTES).map(([k, [t]]) =>
    `<a href="#/${k}" class="${r === k ? 'on' : ''}" data-act="closeMenu"><svg viewBox="0 0 24 24">${ICON[k]}</svg>${t}${k === 'estoque' && nAlert ? `<span class="badge">${nAlert}</span>` : ''}</a>`).join('');
  app.innerHTML = `<div class="shell">
    <aside class="side" id="side"><div class="brand"><img src="logo.svg" alt="Zium Fitness"></div>
      <nav class="nav">${nav}</nav>
      <div class="who">${cloudOn ? `<div id="sync" class="muted sm" style="margin-bottom:10px">${SYNC_TXT[syncState]}</div>` : ''}<b>${esc(me.name)}</b>${me.role === 'admin' ? 'Administrador' : 'Vendedor(a)'}
        <div class="row" style="margin-top:10px"><button class="btn ghost sm" data-act="chpw">Trocar senha</button><button class="btn ghost sm" data-act="logout">Sair</button></div></div>
    </aside>
    <main class="main"><div class="row no-print" style="margin-bottom:14px"><button class="btn ghost sm menu-btn" data-act="menu">☰ Menu</button>${r !== 'dashboard' ? '<button class="btn ghost sm" data-act="back">← Voltar</button>' : ''}</div><div id="view">${ROUTES[r][1]()}</div></main></div>`;
  afterRender(r);
}
function afterRender(r) {
  if (r === 'saida' && ui.saidaMode === 'venda') { if (!$$('.line').length) addLine(); calcSale(); }
  if (r === 'entrada') refreshOrderSelect();
}
const rerender = () => { const y = scrollY; render(); scrollTo(0, y); };

/* ---------- formulários genéricos ---------- */
function fieldHTML(f, v) {
  const val = v ?? f.default ?? '';
  const req = f.required ? 'required' : '';
  const on = f.on ? `data-on="${f.on}"` : '';
  let input;
  if (f.type === 'select') {
    const opts = f.options();
    input = `<select name="${f.name}" ${req} ${on}>${f.blank !== undefined ? `<option value="">${esc(f.blank || '—')}</option>` : ''}${opts.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(val) ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`;
    if (f.quick) input = `<div class="withplus">${input}<button type="button" class="btn ghost" data-act="quickAdd" data-kind="${f.quick}" data-field="${f.name}" title="Cadastrar ${f.quick === 'products' ? 'novo produto' : 'novo fornecedor'}">+</button></div>`;
  } else if (f.type === 'checkbox') {
    return `<div class="${f.full ? 'full' : ''}"><label class="chk"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}> ${esc(f.label)}</label></div>`;
  } else if (f.type === 'textarea') {
    input = `<textarea name="${f.name}" ${req}>${esc(val)}</textarea>`;
  } else {
    const dl = f.list ? `list="dl_${f.name}"` : '';
    input = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" ${req} ${on} ${dl}
      ${f.readonly ? 'readonly tabindex="-1" style="opacity:.75"' : ''} ${f.step ? `step="${f.step}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} ${f.type === 'password' ? 'autocomplete="new-password"' : 'autocomplete="off"'}>
      ${f.list ? `<datalist id="dl_${f.name}">${f.list().map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
  }
  return `<div class="${f.full ? 'full' : ''}"><label>${esc(f.label)}${f.required ? ' *' : ''}</label>${input}${f.hint ? `<div class="muted sm" style="margin-top:4px">${esc(f.hint)}</div>` : ''}</div>`;
}
const fieldsHTML = (fields, vals = {}) => `<div class="fgrid">${fields.map(f => fieldHTML(f, vals[f.name])).join('')}</div>`;
function formData(form, fields) {
  const d = {};
  for (const f of fields) {
    const el = form.elements[f.name]; if (!el) continue;
    if (f.type === 'checkbox') d[f.name] = el.checked;
    else if (f.type === 'number') d[f.name] = el.value === '' ? '' : num(el.value);
    else d[f.name] = el.value.trim();
  }
  return d;
}
function modalForm(title, fields, vals, onSave, saveLabel = 'Salvar') {
  modalCtx = { fields, onSave };
  openModal(`<h2>${esc(title)}</h2><form data-form="modal">${fieldsHTML(fields, vals)}
    <div class="foot"><button type="button" class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn">${saveLabel}</button></div></form>`);
}

/* ---------- cadastro rápido (botão +) dentro de outros formulários ---------- */
let modal2Ctx = null;
function modal2Form(title, fields, vals, onSave) {
  let m = $('#modal2');
  if (!m) { m = document.createElement('div'); m.id = 'modal2'; m.className = 'modal'; m.style.zIndex = 55; document.body.appendChild(m); }
  modal2Ctx = { fields, onSave };
  m.innerHTML = `<div class="box"><h2>${esc(title)}</h2><form data-form="modal2">${fieldsHTML(fields, vals)}<div class="foot"><button type="button" class="btn ghost" data-act="closeModal2">Cancelar</button><button class="btn">Salvar</button></div></form></div>`;
  m.hidden = false;
}
function closeModal2() { const m = $('#modal2'); if (m) { m.hidden = true; m.innerHTML = ''; } modal2Ctx = null; }
function quickAdd(kind, form, fname) {
  const sc = SCHEMA[kind], pre = {};
  if (kind === 'products' && form.elements.supplierId && form.elements.supplierId.value) pre.supplierId = form.elements.supplierId.value;
  modal2Form(`Novo ${sc.one}`, sc.fields(null), pre, async d => {
    const err = await saveRecord(kind, d, null); if (err) return err;
    const rec = sc.list()[sc.list().length - 1];
    const sel = form.elements[fname]; if (!sel) return;
    const blank = sel.querySelector('option[value=""]');
    const opts = kind === 'products' ? prodOpts(false, rec.id) : optsOf(db.suppliers, rec.id);
    sel.innerHTML = (blank ? blank.outerHTML : '') + opts.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('');
    sel.value = rec.id; sel.dispatchEvent(new Event('change', { bubbles: true }));
    toast(`${sc.one[0].toUpperCase() + sc.one.slice(1)} cadastrado e selecionado.`);
  });
}

/* ---------- opções de selects ---------- */
const activeOf = list => list.filter(x => x.active !== false);
const optsOf = (list, cur) => list.filter(x => x.active !== false || x.id === cur).map(x => ({ v: x.id, t: x.name }));
const locOpts = cur => optsOf(db.locations, cur);
const locSel = () => db.locations.length > 1 ? `<div class="seg no-print"><button data-act="loc" data-k="" class="${!ui.loc ? 'on' : ''}">Todos os estoques</button>${db.locations.filter(l => l.active !== false).map(l => `<button data-act="loc" data-k="${l.id}" class="${ui.loc === l.id ? 'on' : ''}">${esc(l.name)}</button>`).join('')}</div>` : '';
const prodOpts = (onlyStock, cur, loc) => {
  const sm = stockMap(loc);
  return db.products.filter(p => (p.active !== false || p.id === cur) && (!onlyStock || sm[p.id] > 0))
    .sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ v: p.id, t: prodLabel(p) + (onlyStock ? ` (${sm[p.id]} un)` : '') }));
};

/* =========================================================
   DASHBOARD
   ========================================================= */
function viewDashboard() {
  const R = range(ui.per), F = ui.df || {};
  const pOk = p => (!F.tipo || p.tipo === F.tipo) && (!F.productId || p.id === F.productId) && (!F.supplierId || p.supplierId === F.supplierId);
  const fSales = list => list.filter(s => (!F.typeId || s.typeId === F.typeId) && (!F.paymentId || s.paymentId === F.paymentId) && (!F.customerId || s.customerId === F.customerId) && (!F.userId || s.userId === F.userId) && (!F.locationId || locOf(s) === F.locationId))
    .map(s => { const items = s.items.filter(i => { const p = prod(i.productId); return p && pOk(p); }); return { ...s, items, total: sum(items, i => i.qty * i.price) }; }).filter(s => s.items.length);
  const eOk = e => { const p = prod(e.productId); return !!p && pOk(p) && (!F.locationId || locOf(e) === F.locationId); };
  const PF = db.products.filter(pOk);
  const S = fSales(db.sales.filter(s => inRange(s.date, R)));
  const E = db.entries.filter(e => e.kind !== 'devolucao' && inRange(e.date, R) && eOk(e));
  const nF = Object.values(F).filter(Boolean).length;
  const fsel = (k, label, opts) => `<div><label>${label}</label><select data-on="df" data-k="${k}"><option value="">Todos</option>${opts.map(o => `<option value="${esc(o.v)}" ${F[k] === o.v ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select></div>`;
  const filtros = `<div class="card no-print" style="margin-bottom:16px"><div class="row" style="justify-content:space-between;margin-bottom:12px"><h3>Filtros${nF ? ` · ${nF} ativo(s)` : ''}</h3>${nF ? '<button class="btn ghost sm" data-act="clearDf">Limpar filtros</button>' : ''}</div>
    <div class="fgrid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">
    ${db.locations.length > 1 ? fsel('locationId', 'Estoque (local)', db.locations.map(x => ({ v: x.id, t: x.name }))) : ''}
    ${fsel('typeId', 'Tipo de venda', db.saleTypes.map(x => ({ v: x.id, t: x.name })))}
    ${fsel('paymentId', 'Forma de pagamento', db.paymentMethods.map(x => ({ v: x.id, t: x.name })))}
    ${fsel('tipo', 'Tipo de produto', [...new Set(db.products.map(p => p.tipo))].sort().map(t => ({ v: t, t })))}
    ${fsel('productId', 'Produto', db.products.filter(p => !F.tipo || p.tipo === F.tipo).sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ v: p.id, t: prodLabel(p) })))}
    ${fsel('supplierId', 'Fornecedor', db.suppliers.map(x => ({ v: x.id, t: x.name })))}
    ${fsel('customerId', 'Cliente', db.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map(x => ({ v: x.id, t: x.name })))}
    ${fsel('userId', 'Vendedor(a)', db.users.map(x => ({ v: x.id, t: x.name })))}</div>
    ${F.typeId || F.paymentId || F.customerId || F.userId || F.locationId ? '<div class="muted sm" style="margin-top:10px">Filtros de venda (tipo, pagamento, cliente, vendedor) valem só para as vendas; compras e estoque seguem os filtros de produto/fornecedor.</div>' : ''}</div>`;
  const receita = sum(S, s => s.total), custo = sum(S, saleCost), compras = sum(E, e => e.qty * e.buyPrice);
  const lucro = receita - custo, saldo = receita - compras, margem = receita ? lucro / receita * 100 : 0;
  const sm = stockMap(F.locationId || undefined);
  const stCusto = sum(PF, p => Math.max(0, sm[p.id] || 0) * num(p.buyPrice));
  const stVenda = sum(PF, p => Math.max(0, sm[p.id] || 0) * num(p.sellPrice));
  const stQtd = sum(PF, p => Math.max(0, sm[p.id] || 0));
  const al = alertList().filter(x => pOk(x.p));

  // últimos 6 meses
  const n = new Date(), months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(n.getFullYear(), n.getMonth() - i, 1); months.push({ k: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, l: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, v: 0, c: 0 }); }
  for (const s of fSales(db.sales)) { const m = months.find(x => x.k === s.date.slice(0, 7)); if (m) m.v += s.total; }
  for (const e of db.entries) if (e.kind !== 'devolucao' && eOk(e)) { const m = months.find(x => x.k === e.date.slice(0, 7)); if (m) m.c += e.qty * e.buyPrice; }

  const group = (keyFn, labelFn) => {
    const m = {}; for (const s of S) { const k = keyFn(s); m[k] = (m[k] || 0) + s.total; }
    return Object.entries(m).map(([k, v]) => [labelFn(k), v]).sort((a, b) => b[1] - a[1]);
  };
  const byType = group(s => s.typeId, k => byId(db.saleTypes, k)?.name || '—');
  const byPay = group(s => s.paymentId, k => byId(db.paymentMethods, k)?.name || '—');
  const pm = {}; for (const s of S) for (const i of s.items) { pm[i.productId] = pm[i.productId] || { q: 0, v: 0 }; pm[i.productId].q += i.qty; pm[i.productId].v += i.qty * i.price; }
  const top = Object.entries(pm).map(([id, x]) => [`${prodShort(prod(id))} (${x.q} un)`, x.v]).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const mes = n.getMonth() + 1;
  const bdays = db.customers.filter(c => c.birthday && +c.birthday.slice(5, 7) === mes).sort((a, b) => a.birthday.slice(8) - b.birthday.slice(8));

  return `<div class="page-head"><div><h1>Dashboard</h1><p>${perLabel()}</p></div>${periodSel()}</div>
  ${filtros}
  <div class="grid g4">
    <div class="kpi gold"><div class="l">Entrou (vendas)</div><div class="v">${brl(receita)}</div><div class="s">${S.length} venda(s) · ticket ${brl(S.length ? receita / S.length : 0)}</div></div>
    <div class="kpi"><div class="l">Saiu (compras)</div><div class="v">${brl(compras)}</div><div class="s">${E.length} entrada(s) de mercadoria</div></div>
    <div class="kpi ${saldo >= 0 ? 'ok' : 'bad'}"><div class="l">Saldo do período</div><div class="v">${brl(saldo)}</div><div class="s">vendas − compras</div></div>
    <div class="kpi ${lucro >= 0 ? 'ok' : 'bad'}"><div class="l">Lucro bruto</div><div class="v">${brl(lucro)}</div><div class="s">margem ${margem.toFixed(1).replace('.', ',')}% · custo vendido ${brl(custo)}</div></div>
  </div>
  <div class="grid g4" style="margin-top:14px">
    <div class="kpi"><div class="l">Estoque (unidades)</div><div class="v">${int(stQtd)}</div><div class="s">${PF.filter(p => p.active !== false).length} produtos ativos</div></div>
    <div class="kpi"><div class="l">Estoque a custo</div><div class="v">${brl(stCusto)}</div><div class="s">dinheiro parado em mercadoria</div></div>
    <div class="kpi"><div class="l">Estoque a preço de venda</div><div class="v">${brl(stVenda)}</div><div class="s">lucro potencial ${brl(stVenda - stCusto)}</div></div>
    <div class="kpi ${al.filter(x => x.r.st !== 'caminho').length ? 'bad' : ''}"><div class="l">Alertas de reposição</div><div class="v">${al.length}</div><div class="s">${needOrder().length} pedir/atrasado · ${al.filter(x => x.r.st === 'caminho').length} a caminho</div></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>Vendas × compras · 6 meses</h3>
      <div class="legend" style="margin-top:10px"><span><i style="background:var(--gold)"></i>Vendas</span><span><i style="background:#6f7480"></i>Compras</span></div>${barChart(months)}</div>
    <div class="card"><h3>Reposição</h3>${al.length ? `<div class="list" style="margin-top:8px">${al.slice(0, 7).map(({ p, stock, r }) =>
      `<div class="it"><div><b>${esc(prodShort(p))}</b><div class="muted sm">estoque ${stock} · ponto de pedido ${r.rop}</div></div>${stPill(r.st)}</div>`).join('')}</div>
      ${al.length > 7 ? `<div class="muted sm" style="margin-top:8px">+ ${al.length - 7} no Estoque</div>` : ''}` : `<div class="empty">Nenhum produto precisando de pedido 🎉</div>`}</div>
  </div>
  <div class="grid g3" style="margin-top:16px">
    <div class="card"><h3>Vendas por tipo</h3>${hbars(byType)}</div>
    <div class="card"><h3>Forma de pagamento</h3>${hbars(byPay)}</div>
    <div class="card"><h3>Mais vendidos</h3>${hbars(top)}</div>
  </div>
  <div class="card" style="margin-top:16px"><h3>Aniversariantes de ${MESES[mes - 1]}</h3>${bdays.length ? `<div class="list" style="margin-top:8px">${bdays.map(c =>
    `<div class="it"><span><b>${esc(c.name)}</b> <span class="muted">· dia ${c.birthday.slice(8)}</span></span>${c.phone ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${digits(c.phone).length <= 11 ? '55' : ''}${digits(c.phone)}">WhatsApp</a>` : ''}</div>`).join('')}</div>` : `<div class="empty">Nenhum aniversário cadastrado neste mês.</div>`}</div>`;
}
function hbars(rows) {
  if (!rows.length) return '<div class="empty">Sem dados no período</div>';
  const max = Math.max(...rows.map(r => r[1])) || 1;
  return `<div class="bars" style="margin-top:12px">${rows.map(([l, v]) => `<div class="bar"><div class="top"><span>${esc(l)}</span><span>${brl(v)}</span></div><div class="track"><div class="fill" style="width:${Math.max(2, v / max * 100)}%"></div></div></div>`).join('')}</div>`;
}
function barChart(months) {
  const W = 640, H = 230, pb = 28, pt = 18, gw = W / months.length;
  const max = Math.max(...months.flatMap(m => [m.v, m.c])) || 1, ch = H - pb - pt;
  const short = v => v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : Math.round(v);
  const bar = (x, v, col, t) => { const h = v / max * ch; return `<rect x="${x}" y="${H - pb - h}" width="${gw * .3}" height="${Math.max(h, v ? 2 : 0)}" rx="4" fill="${col}"><title>${t}: ${brl(v)}</title></rect>${v ? `<text x="${x + gw * .15}" y="${H - pb - h - 5}" text-anchor="middle" font-size="11" fill="#9b978d">${short(v)}</text>` : ''}`; };
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Vendas e compras por mês">
    <line x1="0" y1="${H - pb}" x2="${W}" y2="${H - pb}" stroke="#2c2c2f"/>
    ${months.map((m, i) => { const x = i * gw; return bar(x + gw * .18, m.v, '#DDA443', 'Vendas') + bar(x + gw * .52, m.c, '#6f7480', 'Compras') + `<text x="${x + gw / 2}" y="${H - 8}" text-anchor="middle" font-size="12" fill="#9b978d">${m.l}</text>`; }).join('')}</svg>`;
}

/* =========================================================
   ESTOQUE
   ========================================================= */
function viewEstoque() {
  const smAll = stockMap(), sm = ui.loc ? stockMap(ui.loc) : smAll, locMaps = db.locations.map(l => [l, stockMap(l.id)]), q = norm(ui.estq || '');
  const rows = db.products.map(p => ({ p, stock: sm[p.id] || 0, total: smAll[p.id] || 0 })).map(x => ({ ...x, r: reorder(x.p, x.total) }))
    .filter(x => (!q || norm(`${x.p.sku} ${x.p.name} ${x.p.tipo} ${x.p.color} ${x.p.size}`).includes(q)) && (!ui.onlyAlert || x.r.st !== 'ok') && (ui.showInactive || x.p.active !== false))
    .sort((a, b) => a.p.name.localeCompare(b.p.name));
  const lastEntry = pid => db.entries.filter(e => e.productId === pid).map(e => e.date).sort().pop();
  const orders = pendingOrders();
  return `<div class="page-head"><div><h1>Estoque</h1><p>Posição atual, alertas de reposição e pedidos ao fornecedor.</p></div>
    <div class="row"><button class="btn ghost" data-act="newOrder">+ Novo pedido</button><a class="btn" href="#/entrada">+ Dar entrada</a></div></div>
  ${orders.length ? `<div class="card" style="margin-bottom:16px"><h3>Pedidos a caminho</h3><div class="tw" style="margin-top:10px"><table><thead><tr><th>Pedido em</th><th>Produto</th><th>Fornecedor</th><th class="num">Qtd</th><th>Previsão</th><th></th></tr></thead><tbody>
    ${orders.sort((a, b) => (a.expectedDate || '').localeCompare(b.expectedDate || '')).map(o => `<tr><td>${fdate(o.date)}</td><td>${esc(prodLabel(prod(o.productId)))}</td><td>${esc(sup(o.supplierId)?.name || '—')}</td><td class="num">${o.qty}</td>
    <td>${fdate(o.expectedDate)} ${o.expectedDate && o.expectedDate < today() ? '<span class="pill bad">atrasado</span>' : ''}</td>
    <td class="act"><button class="btn sm" data-act="recvOrder" data-id="${o.id}">Receber</button> <button class="btn ghost sm" data-act="cancelOrder" data-id="${o.id}">Cancelar</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
  <div class="row no-print" style="margin-bottom:14px">${locSel()}<input style="max-width:300px" placeholder="Buscar SKU, produto, cor…" value="${esc(ui.estq || '')}" data-on="estq">
    <label class="chk"><input type="checkbox" ${ui.onlyAlert ? 'checked' : ''} data-on="onlyAlert"> só com alerta</label>
    <label class="chk"><input type="checkbox" ${ui.showInactive ? 'checked' : ''} data-on="showInactive"> mostrar inativos</label></div>
  <div class="tw"><table><thead><tr><th>SKU</th><th>Produto</th><th>Fornecedor</th><th class="num">Estoque</th><th class="num">Pto. pedido</th><th class="num">Custo</th><th class="num">Venda</th><th>Últ. entrada</th><th>Situação</th><th></th></tr></thead><tbody>
  ${rows.length ? rows.map(({ p, stock, total, r }) => `<tr><td><b>${esc(p.sku)}</b></td><td>${esc(prodShort(p))}<div class="muted sm">${esc(p.tipo)}</div></td><td>${esc(sup(p.supplierId)?.name || '—')}</td>
    <td class="num"><b style="color:${stock <= 0 ? 'var(--bad)' : 'inherit'}">${stock}</b>${!ui.loc && db.locations.length > 1 ? `<div class="muted sm">${locMaps.map(([l, m]) => `${esc(l.name)} ${m[p.id] || 0}`).join(' · ')}</div>` : ''}</td><td class="num muted" title="Venda média ${r.avg.toFixed(2)}/dia × prazo ${r.lead}d + mínimo ${p.minStock || 0}">${r.rop}</td>
    <td class="num">${brl(p.buyPrice)}</td><td class="num">${brl(p.sellPrice)}</td><td class="muted">${fdate(lastEntry(p.id)) || '—'}</td><td>${stPill(r.st)}${r.st === 'ok' && p.active === false ? ' <span class="pill">inativo</span>' : ''}</td>
    <td class="act">${r.st === 'pedir' || r.st === 'zerado' || r.st === 'atrasado' ? `<button class="btn sm" data-act="newOrder" data-pid="${p.id}">Pedir</button> ` : ''}${stock > 0 ? `<button class="btn danger sm" data-act="zeroStock" data-pid="${p.id}">Excluir estoque</button>` : ''}</td></tr>`).join('')
    : `<tr><td colspan="10" class="empty">${db.products.length ? 'Nada encontrado.' : 'Nenhum produto ainda. Comece em Cadastros → Produtos.'}</td></tr>`}</tbody></table></div>
  <p class="muted sm" style="margin-top:10px">Ponto de pedido = venda média diária (últimos 30 dias) × prazo de entrega + estoque mínimo. Passe o mouse no número para ver a conta.</p>`;
}
function orderModal(pid, orderId) {
  const p = pid ? prod(pid) : null;
  let suggest = '';
  if (p) { const sm = stockMap(); suggest = reorder(p, sm[p.id] || 0).suggest; }
  const lead = p ? leadFor(p) : 0;
  const fields = [
    { name: 'date', label: 'Data do pedido', type: 'date', required: true, default: today(), on: 'orderCalc' },
    { name: 'productId', label: 'Produto', type: 'select', required: true, options: () => prodOpts(false, pid), blank: 'Selecione…', on: 'orderProd', quick: 'products' },
    { name: 'supplierId', label: 'Fornecedor', type: 'select', options: () => optsOf(db.suppliers, p?.supplierId), blank: '—', quick: 'suppliers' },
    { name: 'locationId', label: 'Chega em qual estoque', type: 'select', required: true, options: () => locOpts(), default: ui.lastLoc || defLoc() },
    { name: 'qty', label: 'Quantidade', type: 'number', min: 1, step: 1, required: true },
    { name: 'expectedDate', label: 'Previsão de chegada', type: 'date', required: true, hint: 'Calculada pelo prazo do fornecedor/produto. Pode ajustar.' }
  ];
  modalForm('Novo pedido ao fornecedor', fields, { productId: pid || '', supplierId: p?.supplierId || '', qty: suggest, date: today(), expectedDate: addDays(today(), lead) }, d => {
    if (!d.productId || d.qty < 1) return 'Escolha o produto e a quantidade.';
    db.orders.push({ id: uid(), status: 'pendente', ...d }); save(); rerender(); toast('Pedido registrado.');
  });
}

/* =========================================================
   ENTRADA
   ========================================================= */
function viewEntrada() {
  const pf = ui.prefill || {}; ui.prefill = null;
  const p = pf.productId ? prod(pf.productId) : null;
  const fields = [
    { name: 'date', label: 'Data de entrada', type: 'date', required: true, default: today() },
    { name: 'kind', label: 'Tipo', type: 'select', options: () => [{ v: 'compra', t: 'Compra de fornecedor' }, { v: 'devolucao', t: 'Devolução de transferência / ajuste' }] },
    { name: 'locationId', label: 'Entra em qual estoque', type: 'select', required: true, options: () => locOpts(), default: ui.lastLoc || defLoc() },
    { name: 'productId', label: 'Produto', type: 'select', required: true, blank: 'Selecione…', options: () => prodOpts(false), on: 'entryProd', full: true, quick: 'products' },
    { name: 'qty', label: 'Quantidade', type: 'number', min: 1, step: 1, required: true },
    { name: 'buyPrice', label: 'Valor de compra (un.)', type: 'number', min: 0, step: 0.01, required: true },
    { name: 'sellPrice', label: 'Valor de venda (un.)', type: 'number', min: 0, step: 0.01, required: true },
    { name: 'supplierId', label: 'Fornecedor', type: 'select', blank: '—', options: () => optsOf(db.suppliers), quick: 'suppliers' },
    { name: 'orderId', label: 'Dar baixa no pedido', type: 'select', blank: 'Nenhum', options: () => [] },
    { name: 'note', label: 'Observação / nota fiscal', full: true }
  ];
  const vals = p ? { locationId: pf.locationId, productId: p.id, qty: pf.qty, buyPrice: p.buyPrice, sellPrice: p.sellPrice, supplierId: p.supplierId } : {};
  ui.entryOrderPre = pf.orderId || '';
  const E = db.entries.filter(e => inRange(e.date, range(ui.per)) && (!ui.loc || locOf(e) === ui.loc)).sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0)).slice(0, 100);
  return `<div class="page-head"><div><h1>Entrada de estoque</h1><p>Registre a mercadoria que chegou, o valor de compra e o preço que vai vender.</p></div></div>
  <form class="card" data-form="entry">${fieldsHTML(fields, vals)}
    <div class="row" style="margin-top:18px"><button class="btn">Registrar entrada</button><button class="btn ghost" data-again="1">Salvar e lançar outra</button></div></form>
  <div class="page-head" style="margin-top:28px"><h2>Entradas do período</h2><div class="row">${locSel()}${periodSel()}</div></div>
  <div class="tw"><table><thead><tr><th>Data</th><th>Produto</th><th>Estoque</th><th>Fornecedor</th><th>Tipo</th><th class="num">Qtd</th><th class="num">Compra un.</th><th class="num">Venda un.</th><th class="num">Total compra</th><th></th></tr></thead><tbody>
  ${E.length ? E.map(e => `<tr><td>${fdate(e.date)}</td><td>${esc(prodLabel(prod(e.productId)))}${e.note ? `<div class="muted sm">${esc(e.note)}</div>` : ''}</td><td><span class="pill">${esc(locName(locOf(e)))}</span></td><td>${esc(sup(e.supplierId)?.name || '—')}</td><td>${e.kind === 'devolucao' ? '<span class="pill info">Devolução</span>' : 'Compra'}</td>
  <td class="num">${e.qty}</td><td class="num">${brl(e.buyPrice)}</td><td class="num">${brl(e.sellPrice)}</td><td class="num">${e.kind === 'devolucao' ? '—' : brl(e.qty * e.buyPrice)}</td><td class="act"><button class="btn danger sm" data-act="delEntry" data-id="${e.id}">Excluir</button></td></tr>`).join('') : `<tr><td colspan="10" class="empty">Nenhuma entrada no período.</td></tr>`}</tbody></table></div>`;
}
function refreshOrderSelect() {
  const f = $('form[data-form=entry]'); if (!f) return;
  const pid = f.elements.productId.value, sel = f.elements.orderId;
  const list = pendingOrders(pid);
  sel.innerHTML = `<option value="">${list.length ? 'Nenhum' : 'Sem pedidos pendentes'}</option>` + list.map(o => `<option value="${o.id}">${fdate(o.date)} · ${o.qty} un${o.expectedDate ? ' · prev. ' + fdate(o.expectedDate) : ''}</option>`).join('');
  if (ui.entryOrderPre) { sel.value = ui.entryOrderPre; ui.entryOrderPre = ''; }
}

/* =========================================================
   SAÍDA (venda / transferência)
   ========================================================= */
function viewSaida() {
  const seg = `<div class="seg"><button data-act="saidaMode" data-k="venda" class="${ui.saidaMode === 'venda' ? 'on' : ''}">Saída para venda</button><button data-act="saidaMode" data-k="transf" class="${ui.saidaMode === 'transf' ? 'on' : ''}">Transferência de estoque</button></div>`;
  const head = `<div class="page-head"><div><h1>Saída de estoque</h1><p>Venda (gera o registro financeiro) ou transferência (só movimenta o estoque).</p></div>${seg}</div>`;
  if (ui.saidaMode === 'transf') {
    const start = ui.lastLoc || defLoc();
    const fields = [
      { name: 'date', label: 'Data', type: 'date', required: true, default: today() },
      { name: 'fromId', label: 'Sai de qual estoque', type: 'select', required: true, options: () => locOpts(), default: start, on: 'transFrom' },
      { name: 'toId', label: 'Vai para', type: 'select', blank: 'Outro destino (fora dos estoques)', options: () => locOpts() },
      { name: 'productId', label: 'Produto', type: 'select', required: true, blank: 'Selecione…', options: () => prodOpts(true, null, start) },
      { name: 'qty', label: 'Quantidade', type: 'number', min: 1, step: 1, required: true },
      { name: 'destino', label: 'Destino externo', ph: 'Só se for para fora: loja da Ana, evento, consignado…', list: () => [...new Set(db.transfers.map(t => t.destino).filter(Boolean))] },
      { name: 'note', label: 'Observação', full: true }
    ];
    const T = db.transfers.filter(t => inRange(t.date, range(ui.per)) && (!ui.loc || (t.fromId || defLoc()) === ui.loc || t.toId === ui.loc)).sort((a, b) => b.date.localeCompare(a.date));
    return head + `<form class="card" data-form="transfer">${fieldsHTML(fields)}<div class="row" style="margin-top:18px"><button class="btn">Registrar transferência</button></div></form>
    <div class="page-head" style="margin-top:28px"><h2>Transferências do período</h2><div class="row">${locSel()}${periodSel()}</div></div>
    <div class="tw"><table><thead><tr><th>Data</th><th>Produto</th><th class="num">Qtd</th><th>De</th><th>Para</th><th></th></tr></thead><tbody>
    ${T.length ? T.map(t => `<tr><td>${fdate(t.date)}</td><td>${esc(prodLabel(prod(t.productId)))}</td><td class="num">${t.qty}</td><td>${esc(locName(t.fromId || defLoc()))}</td><td>${t.kind === 'baixa' ? '<span class="pill bad">Baixa (estoque excluído)</span>' : esc(t.toId ? locName(t.toId) : (t.destino || 'Fora dos estoques'))}${t.note && t.kind !== 'baixa' ? `<div class="muted sm">${esc(t.note)}</div>` : ''}</td><td class="act"><button class="btn danger sm" data-act="delTransfer" data-id="${t.id}">Excluir</button></td></tr>`).join('') : `<tr><td colspan="6" class="empty">Nenhuma transferência no período.</td></tr>`}</tbody></table></div>`;
  }
  const typeOpts = optsOf(db.saleTypes), payOpts = optsOf(db.paymentMethods);
  const custList = db.customers.filter(c => c.active !== false);
  return head + `<form class="card" data-form="sale">
    <div class="fgrid">
      <div><label>Data *</label><input type="date" name="date" value="${today()}" required></div>
      <div><label>Tipo de venda *</label><select name="typeId" required>${typeOpts.map(o => `<option value="${o.v}">${esc(o.t)}</option>`).join('')}</select></div>
      <div><label>Forma de pagamento *</label><select name="paymentId" required>${payOpts.map(o => `<option value="${o.v}">${esc(o.t)}</option>`).join('')}</select></div>
      <div><label>Sai de qual estoque *</label><select name="locationId" data-on="saleLoc" required>${locOpts().map(o => `<option value="${o.v}" ${o.v === (ui.lastLoc || defLoc()) ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select></div>
      <div class="full"><label>Cliente * <span class="muted">— digite nome ou telefone; se não existir, cadastre aqui mesmo</span></label>
        <input id="custq" data-on="custq" list="custlist" autocomplete="off" placeholder="Nome ou telefone do cliente" required>
        <datalist id="custlist">${custList.map(c => `<option value="${esc(c.name)} · ${esc(c.phone)}">`).join('')}</datalist>
        <div id="custbox"></div></div>
    </div>
    <h3 style="margin:22px 0 10px">Produtos</h3>
    <div class="lines" id="lines"></div>
    <button type="button" class="btn ghost sm" style="margin-top:10px" data-act="addLine">+ Adicionar produto</button>
    <div class="totalbar"><span>Total</span><span id="saleTotal">${brl(0)}</span></div>
    <div class="row" style="margin-top:18px"><button class="btn">Registrar venda</button></div></form>
  <p class="muted sm" style="margin-top:10px">O histórico e a exclusão de vendas ficam na aba <a href="#/vendas">Vendas</a>.</p>`;
}
function addLine() {
  const sm = stockMap((($('form[data-form=sale] [name=locationId]')) || {}).value || undefined);
  const opts = db.products.filter(p => p.active !== false && sm[p.id] > 0).sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `<option value="${p.id}" data-price="${p.sellPrice}" data-stock="${sm[p.id]}">${esc(prodLabel(p))} (${sm[p.id]} un)</option>`).join('');
  $('#lines').insertAdjacentHTML('beforeend', `<div class="line"><div class="prod"><label>Produto</label><select name="productId" data-on="saleProd"><option value="">Selecione…</option>${opts}</select></div>
    <div><label>Qtd</label><input type="number" name="qty" min="1" step="1" value="1" data-on="saleCalc"></div>
    <div><label>Valor un.</label><input type="number" name="price" min="0" step="0.01" data-on="saleCalc"></div>
    <div><label>Subtotal</label><div class="sub">${brl(0)}</div></div>
    <button type="button" class="btn ghost sm" data-act="rmLine" title="Remover">✕</button></div>`);
}
function calcSale() {
  let t = 0;
  for (const l of $$('.line')) { const s = num(l.querySelector('[name=qty]').value) * num(l.querySelector('[name=price]').value); t += s; l.querySelector('.sub').textContent = brl(s); }
  const el = $('#saleTotal'); if (el) el.textContent = brl(t);
}
function resolveCustomer(q) {
  q = q.trim(); if (!q) return null;
  const list = db.customers.filter(c => c.active !== false);
  let c = list.find(c => `${c.name} · ${c.phone}` === q); if (c) return c;
  const d = digits(q);
  if (d.length >= 8) { c = list.find(c => digits(c.phone) && (digits(c.phone).endsWith(d) || d.endsWith(digits(c.phone)))); if (c) return c; }
  return list.find(c => norm(c.name) === norm(q)) || null;
}
function updateCustBox() {
  const box = $('#custbox'); if (!box) return;
  const q = $('#custq').value, c = resolveCustomer(q);
  const mode = c ? 'f' + c.id : (q.trim() ? 'new' : 'none');
  if (box.dataset.mode === mode) {
    if (mode === 'new') { const nm = box.querySelector('[name=cname]'), ph = box.querySelector('[name=cphone]'); if (!nm.dataset.t && !digits(q).length) nm.value = q; }
    return;
  }
  box.dataset.mode = mode;
  if (c) box.innerHTML = `<div class="custbox found"><b>✓ ${esc(c.name)}</b> <span class="muted">· ${esc(c.phone)}${c.birthday ? ' · aniv. ' + fdate(c.birthday).slice(0, 5) : ''}</span></div>`;
  else if (q.trim()) {
    const isNum = digits(q).length >= 6 && !/[a-z]/i.test(q);
    box.innerHTML = `<div class="custbox"><div class="muted sm" style="margin-bottom:10px">Cliente novo — será cadastrado junto com a venda.</div><div class="fgrid">
      <div><label>Nome *</label><input name="cname" value="${isNum ? '' : esc(q)}" data-on="touch"></div>
      <div><label>Telefone *</label><input name="cphone" type="tel" value="${isNum ? esc(q) : ''}" placeholder="(00) 00000-0000"></div>
      <div><label>Aniversário <span class="muted">(opcional)</span></label><input name="cbday" type="date"></div></div></div>`;
  } else box.innerHTML = '';
}

/* =========================================================
   VENDAS (histórico)
   ========================================================= */
function viewVendas() {
  const R = range(ui.per), q = norm(ui.vq || '');
  const S = db.sales.filter(s => inRange(s.date, R) && (!ui.loc || locOf(s) === ui.loc) && (!ui.vtype || s.typeId === ui.vtype) && (!ui.vpay || s.paymentId === ui.vpay)
    && (!q || norm(`${cust(s.customerId)?.name} ${saleItemsText(s)}`).includes(q))).sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
  const total = sum(S, s => s.total), lucro = total - sum(S, saleCost);
  const sel = (k, list, all) => `<select style="width:auto" data-on="${k}"><option value="">${all}</option>${list.map(x => `<option value="${x.id}" ${ui[k] === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
  return `<div class="page-head"><div><h1>Vendas</h1><p>${perLabel()}</p></div><a class="btn" href="#/saida">+ Nova venda</a></div>
  <div class="row" style="margin-bottom:14px">${locSel()}${periodSel()}</div>
  <div class="row" style="margin-bottom:14px"><input style="max-width:260px" placeholder="Buscar cliente ou produto…" value="${esc(ui.vq || '')}" data-on="vq">${sel('vtype', db.saleTypes, 'Todos os tipos')}${sel('vpay', db.paymentMethods, 'Todos os pagamentos')}</div>
  <div class="grid g4" style="margin-bottom:14px"><div class="kpi gold"><div class="l">Total vendido</div><div class="v">${brl(total)}</div></div><div class="kpi"><div class="l">Vendas</div><div class="v">${S.length}</div></div>
  <div class="kpi"><div class="l">Ticket médio</div><div class="v">${brl(S.length ? total / S.length : 0)}</div></div><div class="kpi ok"><div class="l">Lucro bruto</div><div class="v">${brl(lucro)}</div></div></div>
  <div class="tw"><table><thead><tr><th>Data</th><th>Cliente</th><th>Itens</th><th>Tipo</th><th>Pagamento</th><th>Estoque</th><th class="num">Total</th><th class="num">Lucro</th><th></th></tr></thead><tbody>
  ${S.length ? S.map(s => `<tr><td>${fdate(s.date)}</td><td>${esc(cust(s.customerId)?.name || '—')}</td><td>${esc(saleItemsText(s))}</td><td>${esc(byId(db.saleTypes, s.typeId)?.name || '—')}</td><td>${esc(byId(db.paymentMethods, s.paymentId)?.name || '—')}</td><td><span class="pill">${esc(locName(locOf(s)))}</span></td>
  <td class="num"><b>${brl(s.total)}</b></td><td class="num">${brl(s.total - saleCost(s))}</td><td class="act"><button class="btn danger sm" data-act="delSale" data-id="${s.id}">Excluir</button></td></tr>`).join('') : `<tr><td colspan="9" class="empty">Nenhuma venda encontrada.</td></tr>`}</tbody></table></div>`;
}

/* =========================================================
   CADASTROS
   ========================================================= */
const SCHEMA = {
  products: {
    title: 'Produtos', one: 'produto', list: () => db.products,
    fields: v => [
      { name: 'tipo', label: 'Tipo de produto', required: true, ph: 'Legging, Macacão, Garrafa…', list: () => [...new Set(db.products.map(p => p.tipo))], hint: 'Define o prefixo do SKU (ex.: Legging → LEG-001).', on: v ? undefined : 'skuPrev' },
      { name: 'sku', label: 'SKU (gerado automaticamente)', readonly: true, default: v ? v.sku : '', ph: 'Aparece ao digitar o tipo' },
      { name: 'name', label: 'Nome / modelo', required: true },
      { name: 'size', label: 'Tamanho' }, { name: 'color', label: 'Cor' },
      { name: 'supplierId', label: 'Fornecedor', type: 'select', blank: '—', options: () => optsOf(db.suppliers, v?.supplierId) },
      { name: 'buyPrice', label: 'Valor de compra', type: 'number', min: 0, step: 0.01, default: 0 },
      { name: 'sellPrice', label: 'Valor de venda', type: 'number', min: 0, step: 0.01, default: 0 },
      { name: 'minStock', label: 'Estoque mínimo', type: 'number', min: 0, step: 1, default: 0, hint: 'Entra no cálculo do ponto de pedido.' },
      { name: 'leadDays', label: 'Prazo próprio (dias)', type: 'number', min: 0, step: 1, hint: 'Opcional. Vazio = usa o prazo do fornecedor.' },
      { name: 'active', label: 'Ativo', type: 'checkbox', default: true }],
    cols: [['SKU', p => `<b>${esc(p.sku)}</b>`], ['Produto', p => esc(prodShort(p))], ['Tipo', p => esc(p.tipo)], ['Fornecedor', p => esc(sup(p.supplierId)?.name || '—')], ['Compra', p => brl(p.buyPrice), 'num'], ['Venda', p => brl(p.sellPrice), 'num']],
    search: p => `${p.sku} ${p.name} ${p.tipo} ${p.color} ${p.size}`
  },
  customers: {
    title: 'Clientes', one: 'cliente', list: () => db.customers,
    fields: () => [{ name: 'name', label: 'Nome', required: true }, { name: 'phone', label: 'Telefone', type: 'tel', required: true }, { name: 'birthday', label: 'Aniversário', type: 'date', hint: 'Opcional.' },
      { name: 'note', label: 'Observação', full: true }, { name: 'active', label: 'Ativo', type: 'checkbox', default: true }],
    cols: [['Nome', c => `<a href="#" data-act="custHist" data-id="${c.id}" style="color:inherit"><b>${esc(c.name)}</b></a>`], ['Telefone', c => esc(c.phone)], ['Aniversário', c => c.birthday ? fdate(c.birthday).slice(0, 5) : '—'], ['Compras', c => String(db.sales.filter(s => s.customerId === c.id).length), 'num']],
    search: c => `${c.name} ${c.phone}`
  },
  suppliers: {
    title: 'Fornecedores', one: 'fornecedor', list: () => db.suppliers,
    fields: () => [{ name: 'name', label: 'Fornecedor', required: true }, { name: 'phone', label: 'Telefone / contato' },
      { name: 'leadDays', label: 'Prazo de entrega (dias)', type: 'number', min: 0, step: 1, default: 0, hint: 'Quantos dias o pedido leva para chegar. Base do alerta de reposição.' },
      { name: 'note', label: 'Observação', full: true }, { name: 'active', label: 'Ativo', type: 'checkbox', default: true }],
    cols: [['Fornecedor', s => `<b>${esc(s.name)}</b>`], ['Contato', s => esc(s.phone || '—')], ['Prazo de entrega', s => `${num(s.leadDays)} dia(s)`, 'num'], ['Produtos', s => String(db.products.filter(p => p.supplierId === s.id).length), 'num']],
    search: s => `${s.name} ${s.phone}`
  },
  locations: {
    title: 'Locais de estoque', one: 'local de estoque', list: () => db.locations,
    fields: () => [{ name: 'name', label: 'Nome', required: true, ph: 'Casa, Loja…' }, { name: 'active', label: 'Ativo', type: 'checkbox', default: true }],
    cols: [['Local', x => `<b>${esc(x.name)}</b>`], ['Status', x => x.active === false ? '<span class="pill">inativo</span>' : '<span class="pill ok">ativo</span>']], search: x => x.name
  },
  paymentMethods: {
    title: 'Formas de pagamento', one: 'forma de pagamento', list: () => db.paymentMethods,
    fields: () => [{ name: 'name', label: 'Nome', required: true }, { name: 'active', label: 'Ativo', type: 'checkbox', default: true }],
    cols: [['Forma de pagamento', x => `<b>${esc(x.name)}</b>`], ['Status', x => x.active === false ? '<span class="pill">inativo</span>' : '<span class="pill ok">ativo</span>']], search: x => x.name
  },
  saleTypes: {
    title: 'Tipos de venda', one: 'tipo de venda', list: () => db.saleTypes,
    fields: () => [{ name: 'name', label: 'Nome', required: true }, { name: 'active', label: 'Ativo', type: 'checkbox', default: true }],
    cols: [['Tipo de venda', x => `<b>${esc(x.name)}</b>`], ['Status', x => x.active === false ? '<span class="pill">inativo</span>' : '<span class="pill ok">ativo</span>']], search: x => x.name
  },
  users: {
    title: 'Usuários', one: 'usuário', list: () => db.users, admin: true,
    fields: v => [{ name: 'name', label: 'Nome', required: true }, { name: 'login', label: 'Usuário (login)', required: true },
      { name: 'password', label: 'Senha', type: 'password', required: !v, hint: v ? 'Deixe em branco para manter a atual.' : 'Mínimo de 6 caracteres.' },
      { name: 'role', label: 'Perfil', type: 'select', options: () => [{ v: 'vendedor', t: 'Vendedor(a) — opera estoque e vendas' }, { v: 'admin', t: 'Administrador — gerencia cadastros e usuários' }] },
      { name: 'active', label: 'Ativo', type: 'checkbox', default: true }],
    cols: [['Nome', u => `<b>${esc(u.name)}</b>`], ['Login', u => esc(u.login)], ['Perfil', u => u.role === 'admin' ? 'Administrador' : 'Vendedor(a)'], ['Status', u => u.active === false ? '<span class="pill">inativo</span>' : '<span class="pill ok">ativo</span>']], search: u => `${u.name} ${u.login}`
  }
};
const CAD_ORDER = ['products', 'customers', 'suppliers', 'locations', 'paymentMethods', 'saleTypes', 'users', 'system'];

function viewCadastros() {
  const tabs = CAD_ORDER.filter(k => isAdmin() || !(k === 'users' || k === 'system')).map(k => [k, k === 'system' ? 'Backup e sistema' : SCHEMA[k].title]);
  if (!tabs.find(t => t[0] === ui.cadTab)) ui.cadTab = 'products';
  const head = `<div class="page-head"><div><h1>Cadastros</h1><p>Produtos, clientes, fornecedores, pagamentos, tipos de venda e usuários.</p></div></div>
    <div class="tabs">${tabs.map(([k, t]) => `<button data-act="cadTab" data-k="${k}" class="${ui.cadTab === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  if (ui.cadTab === 'system') return head + viewSistema();
  const sc = SCHEMA[ui.cadTab], q = norm(ui.cq || '');
  const rows = sc.list().filter(x => !q || norm(sc.search(x)).includes(q)).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  return head + `<div class="row" style="justify-content:space-between;margin-bottom:14px"><input style="max-width:280px" placeholder="Buscar…" value="${esc(ui.cq || '')}" data-on="cq"><button class="btn" data-act="newRec">+ Novo ${sc.one}</button></div>
  <div class="tw"><table><thead><tr>${sc.cols.map(c => `<th class="${c[2] || ''}">${c[0]}</th>`).join('')}<th></th></tr></thead><tbody>
  ${rows.length ? rows.map(x => `<tr class="${x.active === false ? 'muted' : ''}">${sc.cols.map(c => `<td class="${c[2] || ''}">${c[1](x)}</td>`).join('')}<td class="act">${ui.cadTab === 'customers' ? `<button class="btn sm" data-act="custHist" data-id="${x.id}">Histórico</button> ` : ''}<button class="btn ghost sm" data-act="editRec" data-id="${x.id}">Editar</button> <button class="btn danger sm" data-act="delRec" data-id="${x.id}">Excluir</button></td></tr>`).join('') : `<tr><td colspan="${sc.cols.length + 1}" class="empty">Nada cadastrado ainda.</td></tr>`}</tbody></table></div>`;
}
function viewSistema() {
  return `<div class="grid g2">
    <div class="card"><h2>Backup</h2><p class="muted">Os dados ficam salvos <b>neste navegador</b>. Baixe um backup com frequência e use-o para levar os dados a outro computador ou celular.</p>
      <div class="row"><button class="btn" data-act="backup">Baixar backup (.json)</button><label class="btn ghost" style="margin:0;cursor:pointer">Restaurar backup<input type="file" accept="application/json,.json" hidden data-on="restore"></label></div></div>
    <div class="card"><h2>Zerar sistema</h2><p class="muted">Apaga produtos, vendas, clientes e tudo mais. Baixe um backup antes. Os usuários são mantidos.</p><button class="btn danger" data-act="wipe">Apagar todos os dados…</button></div></div>`;
}
function skuFor(tipo) {
  const pre = (norm(tipo).replace(/[^a-z0-9]/g, '').slice(0, 3) || 'PRD').toUpperCase();
  const n = db.products.filter(p => p.sku && p.sku.startsWith(pre + '-')).map(p => parseInt(p.sku.slice(pre.length + 1)) || 0);
  return `${pre}-${pad((n.length ? Math.max(...n) : 0) + 1, 3)}`;
}
async function saveRecord(kind, d, id) {
  const list = SCHEMA[kind].list(), cur = id ? list.find(x => x.id === id) : null;
  if (kind === 'users') {
    if (!d.name || !d.login) return 'Informe nome e usuário.';
    if (list.some(u => u.id !== id && norm(u.login) === norm(d.login))) return 'Já existe um usuário com esse login.';
    if (!cur && d.password.length < 6) return 'A senha precisa de pelo menos 6 caracteres.';
    if (cur && d.password && d.password.length < 6) return 'A senha precisa de pelo menos 6 caracteres.';
    if (cur && (d.role !== 'admin' || d.active === false) && cur.role === 'admin' && list.filter(u => u.role === 'admin' && u.active !== false && u.id !== id).length === 0) return 'Precisa existir ao menos um administrador ativo.';
    const rec = cur || { id: uid(), salt: uid() };
    Object.assign(rec, { name: d.name, login: d.login, role: d.role, active: d.active });
    if (d.password) { rec.salt = uid(); rec.hash = await hashPw(d.password, rec.salt); rec.defaultPw = false; }
    if (!cur) list.push(rec);
    if (me && rec.id === me.id) me = rec;
  } else {
    if (kind === 'products') { if (!d.tipo || !d.name) return 'Informe tipo e nome do produto.'; }
    else if (!d.name) return 'Informe o nome.';
    if (kind === 'customers') {
      if (!d.phone) return 'Informe o telefone.';
      const dup = list.find(c => c.id !== id && digits(c.phone) === digits(d.phone));
      if (dup) return `Já existe cliente com esse telefone: ${dup.name}.`;
    }
    if (kind === 'products') { d.buyPrice = num(d.buyPrice); d.sellPrice = num(d.sellPrice); d.minStock = num(d.minStock); }
    if (kind === 'products') delete d.sku;
    const rec = cur || { id: uid() };
    Object.assign(rec, d);
    if (kind === 'products' && !rec.sku) rec.sku = skuFor(d.tipo);
    if (!cur) list.push(rec);
  }
  save(); return null;
}
function usedBy(kind, id) {
  switch (kind) {
    case 'products': return db.entries.some(x => x.productId === id) || db.sales.some(s => s.items.some(i => i.productId === id)) || db.transfers.some(x => x.productId === id) || db.orders.some(x => x.productId === id);
    case 'suppliers': return db.products.some(x => x.supplierId === id) || db.entries.some(x => x.supplierId === id) || db.orders.some(x => x.supplierId === id);
    case 'locations': return db.entries.some(x => x.locationId === id) || db.sales.some(x => x.locationId === id) || db.transfers.some(x => x.fromId === id || x.toId === id) || db.orders.some(x => x.locationId === id) || db.locations.length <= 1;
    case 'paymentMethods': return db.sales.some(x => x.paymentId === id);
    case 'saleTypes': return db.sales.some(x => x.typeId === id);
    case 'customers': return db.sales.some(x => x.customerId === id);
    default: return false;
  }
}

/* =========================================================
   RELATÓRIOS
   ========================================================= */
function reportDefs() {
  const R = range(ui.per), sm = stockMap();
  const S = db.sales.filter(s => inRange(s.date, R) && (!ui.loc || locOf(s) === ui.loc)).sort((a, b) => a.date.localeCompare(b.date));
  return {
    estoque: ['Posição de estoque', false, () => {
      const locs = ui.loc ? db.locations.filter(l => l.id === ui.loc) : db.locations, maps = locs.map(l => stockMap(l.id));
      const rows = db.products.filter(p => p.active !== false).sort((a, b) => a.name.localeCompare(b.name)).map(p => {
        const qs = maps.map(m => m[p.id] || 0), q = sum(qs, x => x);
        return [p.sku, p.tipo, prodShort(p), sup(p.supplierId)?.name || '', ...qs, ...(locs.length > 1 ? [q] : []), num(p.buyPrice), num(p.sellPrice), q * num(p.buyPrice), q * num(p.sellPrice), ST[reorder(p, stockMap()[p.id] || 0).st][1]];
      });
      const nq = locs.length + (locs.length > 1 ? 1 : 0), pos = 4 + nq;
      return { head: ['SKU', 'Tipo', 'Produto', 'Fornecedor', ...locs.map(l => l.name), ...(locs.length > 1 ? ['Total'] : []), 'Custo un.', 'Venda un.', 'Total custo', 'Total venda', 'Situação'],
        types: ['t', 't', 't', 't', ...Array(nq).fill('i'), 'm', 'm', 'm', 'm', 't'], rows,
        totals: ['Total', '', '', '', ...Array.from({ length: nq }, (_, k) => sum(rows, r => r[4 + k])), '', '', sum(rows, r => r[pos + 2]), sum(rows, r => r[pos + 3]), ''] };
    }],
    reposicao: ['Reposição / ponto de pedido', false, () => {
      const rows = db.products.filter(p => p.active !== false).sort((a, b) => a.name.localeCompare(b.name)).map(p => { const q = sm[p.id] || 0, r = reorder(p, q); return [p.sku, prodShort(p), sup(p.supplierId)?.name || '', q, +r.avg.toFixed(2), r.lead, r.rop, r.pendQty, r.st === 'ok' ? 0 : r.suggest, ST[r.st][1]]; });
      return { head: ['SKU', 'Produto', 'Fornecedor', 'Estoque', 'Venda/dia', 'Prazo (d)', 'Pto. pedido', 'Pedido a caminho', 'Sugestão de compra', 'Situação'], types: ['t', 't', 't', 'i', 'n', 'i', 'i', 'i', 'i', 't'], rows };
    }],
    vendas: ['Vendas do período', true, () => {
      const rows = S.map(s => [s.date, byId(db.saleTypes, s.typeId)?.name || '', cust(s.customerId)?.name || '', byId(db.paymentMethods, s.paymentId)?.name || '', locName(locOf(s)), saleItemsText(s), saleQty(s), s.total, saleCost(s), s.total - saleCost(s)]);
      return { head: ['Data', 'Tipo de venda', 'Cliente', 'Pagamento', 'Estoque', 'Itens', 'Qtd', 'Total', 'Custo', 'Lucro'], types: ['d', 't', 't', 't', 't', 't', 'i', 'm', 'm', 'm'], rows, totals: ['Total', '', '', '', '', '', sum(rows, r => r[6]), sum(rows, r => r[7]), sum(rows, r => r[8]), sum(rows, r => r[9])] };
    }],
    produtos: ['Vendas por produto', true, () => {
      const m = {}; for (const s of S) for (const i of s.items) { const x = m[i.productId] = m[i.productId] || [0, 0, 0]; x[0] += i.qty; x[1] += i.qty * i.price; x[2] += i.qty * i.cost; }
      const rows = Object.entries(m).map(([id, [q, v, c]]) => [prod(id)?.sku || '', prodShort(prod(id)), q, v, c, v - c]).sort((a, b) => b[3] - a[3]);
      return { head: ['SKU', 'Produto', 'Qtd vendida', 'Receita', 'Custo', 'Lucro'], types: ['t', 't', 'i', 'm', 'm', 'm'], rows, totals: ['Total', '', sum(rows, r => r[2]), sum(rows, r => r[3]), sum(rows, r => r[4]), sum(rows, r => r[5])] };
    }],
    fornecedor: ['Acerto por fornecedor', true, () => {
      const m = {}; for (const s of S) for (const i of s.items) { const k = prod(i.productId)?.supplierId || ''; const x = m[k] = m[k] || [0, 0, 0]; x[0] += i.qty; x[1] += i.qty * i.cost; x[2] += i.qty * i.price; }
      const rows = Object.entries(m).map(([k, [q, c, v]]) => [sup(k)?.name || '(sem fornecedor)', q, c, v, v - c]).sort((a, b) => b[2] - a[2]);
      return { head: ['Fornecedor', 'Qtd vendida', 'Custo a repassar', 'Receita', 'Lucro'], types: ['t', 'i', 'm', 'm', 'm'], rows, totals: ['Total', sum(rows, r => r[1]), sum(rows, r => r[2]), sum(rows, r => r[3]), sum(rows, r => r[4])] };
    }],
    entradas: ['Entradas de estoque', true, () => {
      const rows = db.entries.filter(e => inRange(e.date, R) && (!ui.loc || locOf(e) === ui.loc)).sort((a, b) => a.date.localeCompare(b.date)).map(e => [e.date, prod(e.productId)?.sku || '', prodShort(prod(e.productId)), locName(locOf(e)), sup(e.supplierId)?.name || '', e.kind === 'devolucao' ? 'Devolução' : 'Compra', e.qty, e.buyPrice, e.sellPrice, e.kind === 'devolucao' ? 0 : e.qty * e.buyPrice]);
      return { head: ['Data', 'SKU', 'Produto', 'Estoque', 'Fornecedor', 'Tipo', 'Qtd', 'Compra un.', 'Venda un.', 'Total compra'], types: ['d', 't', 't', 't', 't', 't', 'i', 'm', 'm', 'm'], rows, totals: ['Total', '', '', '', '', '', sum(rows, r => r[6]), '', '', sum(rows, r => r[9])] };
    }],
    transferencias: ['Transferências', true, () => {
      const rows = db.transfers.filter(t => inRange(t.date, R) && (!ui.loc || (t.fromId || defLoc()) === ui.loc || t.toId === ui.loc)).sort((a, b) => a.date.localeCompare(b.date)).map(t => [t.date, prod(t.productId)?.sku || '', prodShort(prod(t.productId)), t.qty, locName(t.fromId || defLoc()), t.kind === 'baixa' ? 'Baixa (estoque excluído)' : (t.toId ? locName(t.toId) : (t.destino || 'Fora dos estoques')), t.note || '']);
      return { head: ['Data', 'SKU', 'Produto', 'Qtd', 'De', 'Para', 'Obs.'], types: ['d', 't', 't', 'i', 't', 't', 't'], rows };
    }],
    clientes: ['Clientes', false, () => {
      const rows = db.customers.sort((a, b) => a.name.localeCompare(b.name)).map(c => { const ss = db.sales.filter(s => s.customerId === c.id); return [c.name, c.phone, c.birthday ? fdate(c.birthday).slice(0, 5) : '', ss.length, sum(ss, s => s.total), ss.map(s => s.date).sort().pop() || '']; });
      return { head: ['Cliente', 'Telefone', 'Aniversário', 'Compras', 'Total gasto', 'Última compra'], types: ['t', 't', 't', 'i', 'm', 'd'], rows };
    }]
  };
}
function fmtCell(v, t) {
  if (t === 'm') return brl(v); if (t === 'i') return int(v); if (t === 'n') return String(v).replace('.', ',');
  if (t === 'd') return fdate(v); return esc(v);
}
function viewRelatorios() {
  const defs = reportDefs(); if (!defs[ui.rel]) ui.rel = 'estoque';
  const [title, hasPer, build] = defs[ui.rel], r = build();
  return `<div class="page-head"><div><h1>Relatórios</h1><p>Imprima ou baixe em planilha (abre no Excel / Google Sheets).</p></div></div>
  <div class="tabs">${Object.entries(defs).map(([k, d]) => `<button data-act="rel" data-k="${k}" class="${ui.rel === k ? 'on' : ''}">${d[0]}</button>`).join('')}</div>
  <div class="row" style="justify-content:space-between;margin-bottom:14px"><div class="row">${['clientes', 'reposicao'].includes(ui.rel) ? '' : locSel()}${hasPer ? periodSel() : ''}</div><div class="row no-print"><button class="btn ghost" data-act="csv">Baixar planilha</button><button class="btn" data-act="print">Imprimir</button></div></div>
  <div class="card"><div class="print-title"><img src="logo.svg" alt=""><h2>${title}</h2><div>${hasPer ? perLabel() + ' · ' : ''}emitido em ${fdate(today())}</div></div>
  <div class="tw"><table><thead><tr>${r.head.map((h, i) => `<th class="${'min'.includes(r.types[i]) && r.types[i] !== 't' ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>
  ${r.rows.length ? r.rows.map(row => `<tr>${row.map((v, i) => `<td class="${r.types[i] !== 't' && r.types[i] !== 'd' ? 'num' : ''}">${fmtCell(v, r.types[i])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${r.head.length}" class="empty">Sem dados.</td></tr>`}</tbody>
  ${r.totals && r.rows.length ? `<tfoot><tr>${r.totals.map((v, i) => `<td class="${r.types[i] !== 't' && r.types[i] !== 'd' ? 'num' : ''}">${v === '' ? '' : (i === 0 ? esc(v) : fmtCell(v, r.types[i]))}</td>`).join('')}</tr></tfoot>` : ''}</table></div></div>`;
}
function downloadFile(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCSV() {
  const [title, , build] = reportDefs()[ui.rel], r = build();
  const cell = (v, t) => { let s = t === 'm' ? (+v).toFixed(2).replace('.', ',') : t === 'd' ? fdate(v) : t === 'n' ? String(v).replace('.', ',') : String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [r.head.join(';'), ...r.rows.map(row => row.map((v, i) => cell(v, r.types[i])).join(';'))];
  if (r.totals) lines.push(r.totals.map((v, i) => v === '' ? '' : cell(v, r.types[i])).join(';'));
  downloadFile(`zium-${ui.rel}-${today()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}

/* =========================================================
   AÇÕES (cliques)
   ========================================================= */
const ACT = {
  logout() { me = null; localStorage.removeItem(SES); render(); },
  menu() { $('#side').classList.toggle('open'); },
  closeMenu() { const s = $('#side'); if (s) s.classList.remove('open'); },
  closeModal,
  custHist(el) {
    const c = cust(el.dataset.id); if (!c) return;
    const S = db.sales.filter(s => s.customerId === c.id).sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
    const total = sum(S, s => s.total), lucro = total - sum(S, saleCost), qtd = sum(S, saleQty);
    const pm = {}; for (const s of S) for (const i of s.items) pm[i.productId] = (pm[i.productId] || 0) + i.qty;
    const fav = Object.entries(pm).sort((a, b) => b[1] - a[1])[0];
    const wa = digits(c.phone);
    openModal(`<div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">${esc(c.name)}</h2>
      <div class="muted">${esc(c.phone)}${c.birthday ? ' · aniversário ' + fdate(c.birthday).slice(0, 5) : ''}${c.note ? ' · ' + esc(c.note) : ''}</div></div>
      <div class="row">${wa ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${wa.length <= 11 ? '55' : ''}${wa}">WhatsApp</a>` : ''}<button class="btn ghost sm" data-act="closeModal">Fechar</button></div></div>
      <div class="grid g4" style="margin:16px 0;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
        <div class="kpi"><div class="l">Compras</div><div class="v">${S.length}</div><div class="s">${qtd} peça(s)</div></div>
        <div class="kpi gold"><div class="l">Total gasto</div><div class="v">${brl(total)}</div></div>
        <div class="kpi"><div class="l">Ticket médio</div><div class="v">${brl(S.length ? total / S.length : 0)}</div></div>
        <div class="kpi"><div class="l">Última compra</div><div class="v" style="font-size:19px">${S.length ? fdate(S[0].date) : '—'}</div><div class="s">${fav ? 'mais comprou: ' + esc(prodShort(prod(fav[0]))) : ''}</div></div></div>
      <div class="tw"><table><thead><tr><th>Data</th><th>Itens</th><th>Tipo</th><th>Pagamento</th><th class="num">Total</th></tr></thead><tbody>
      ${S.length ? S.map(s => `<tr><td>${fdate(s.date)}</td><td>${esc(saleItemsText(s))}</td><td>${esc(byId(db.saleTypes, s.typeId)?.name || '—')}</td><td>${esc(byId(db.paymentMethods, s.paymentId)?.name || '—')}</td><td class="num"><b>${brl(s.total)}</b></td></tr>`).join('') : `<tr><td colspan="5" class="empty">Este cliente ainda não comprou.</td></tr>`}</tbody></table></div>
      ${S.length ? `<div class="muted sm" style="margin-top:8px">Lucro bruto com este cliente: ${brl(lucro)}</div>` : ''}`);
    $('#modal .box').style.maxWidth = '860px';
  },
  loc(el) { ui.loc = el.dataset.k; rerender(); },
  zeroStock(el) {
    const p = prod(el.dataset.pid);
    const locs = (ui.loc ? db.locations.filter(l => l.id === ui.loc) : db.locations).map(l => [l, stockMap(l.id)[p.id] || 0]).filter(x => x[1] > 0);
    if (!locs.length) return;
    const txt = locs.map(([l, q]) => `${q} un em ${l.name}`).join(' e ');
    if (!confirm(`Excluir o estoque de "${prodShort(p)}"?\n\nVai zerar: ${txt}.\nFica registrado como baixa na lista de transferências (dá para desfazer excluindo a baixa lá).`)) return;
    for (const [l, q] of locs) db.transfers.push({ id: uid(), at: Date.now(), date: today(), productId: p.id, qty: q, fromId: l.id, toId: '', destino: 'Baixa de estoque', kind: 'baixa', note: 'Estoque excluído', userId: me.id });
    save(); rerender(); toast('Estoque excluído (baixa registrada).');
  },
  closeModal2,
  quickAdd(el) { quickAdd(el.dataset.kind, el.closest('form'), el.dataset.field); },
  clearDf() { ui.df = {}; rerender(); },
  back() {
    navStack.pop();
    const prev = navStack[navStack.length - 1] || 'dashboard';
    if (location.hash === '#/' + prev) return render();
    goingBack = true; go(prev);
  },
  per(el) { ui.per = el.dataset.k; rerender(); },
  saidaMode(el) { ui.saidaMode = el.dataset.k; rerender(); },
  cadTab(el) { ui.cadTab = el.dataset.k; ui.cq = ''; rerender(); },
  rel(el) { ui.rel = el.dataset.k; rerender(); },
  print() { window.print(); },
  csv: exportCSV,
  addLine() { addLine(); },
  rmLine(el) { if ($$('.line').length > 1) { el.closest('.line').remove(); calcSale(); } },
  newOrder(el) { orderModal(el.dataset.pid); },
  recvOrder(el) { const o = db.orders.find(o => o.id === el.dataset.id); ui.prefill = { productId: o.productId, qty: o.qty, orderId: o.id, locationId: o.locationId }; go('entrada'); },
  cancelOrder(el) { if (confirm('Cancelar este pedido?')) { db.orders.find(o => o.id === el.dataset.id).status = 'cancelado'; save(); rerender(); } },
  delEntry(el) {
    const e = db.entries.find(x => x.id === el.dataset.id), sm = stockMap(locOf(db.entries.find(x => x.id === el.dataset.id)));
    if ((sm[e.productId] || 0) - e.qty < 0 && !confirm('Excluir esta entrada deixa o estoque do produto negativo. Excluir mesmo assim?')) return;
    if (!confirm('Excluir esta entrada?')) return;
    db.entries = db.entries.filter(x => x.id !== e.id); save(); rerender();
  },
  delTransfer(el) { if (confirm('Excluir a transferência? A mercadoria volta para o estoque.')) { db.transfers = db.transfers.filter(x => x.id !== el.dataset.id); save(); rerender(); } },
  delSale(el) { if (confirm('Excluir esta venda? A mercadoria volta para o estoque.')) { db.sales = db.sales.filter(x => x.id !== el.dataset.id); save(); rerender(); toast('Venda excluída.'); } },
  newRec() { recModal(ui.cadTab); },
  editRec(el) { recModal(ui.cadTab, el.dataset.id); },
  delRec(el) {
    const kind = ui.cadTab, id = el.dataset.id;
    if (kind === 'users' && id === me.id) return toast('Você não pode excluir o próprio usuário.', true);
    if (usedBy(kind, id)) return toast('Este item já tem movimentações. Edite e desmarque "Ativo" em vez de excluir.', true);
    if (!confirm('Excluir este registro?')) return;
    const l = SCHEMA[kind].list(); l.splice(l.findIndex(x => x.id === id), 1); save(); rerender();
  },
  chpw() {
    modalForm('Trocar minha senha', [{ name: 'old', label: 'Senha atual', type: 'password', required: true }, { name: 'n1', label: 'Nova senha', type: 'password', required: true }, { name: 'n2', label: 'Repita a nova senha', type: 'password', required: true }], {}, async d => {
      if ((await hashPw(d.old, me.salt)) !== me.hash) return 'Senha atual incorreta.';
      if (d.n1.length < 6) return 'A nova senha precisa de pelo menos 6 caracteres.';
      if (d.n1 !== d.n2) return 'As senhas novas não conferem.';
      me.salt = uid(); me.hash = await hashPw(d.n1, me.salt); me.defaultPw = false; save(); toast('Senha alterada.');
    });
  },
  backup() { downloadFile(`zium-backup-${today()}.json`, JSON.stringify(db, null, 1), 'application/json'); },
  wipe() {
    if (prompt('Isso apaga TODOS os dados (menos usuários). Digite APAGAR para confirmar:') !== 'APAGAR') return;
    const keep = db.users, d = defaults(); db = d; db.users = keep; save(); rerender(); toast('Dados apagados.');
  }
};
function recModal(kind, id) {
  const sc = SCHEMA[kind], cur = id ? sc.list().find(x => x.id === id) : null;
  modalForm(`${cur ? 'Editar' : 'Novo'} ${sc.one}`, sc.fields(cur), cur || {}, async d => {
    const err = await saveRecord(kind, d, id); if (err) return err;
    rerender(); toast('Salvo.');
  });
}

/* ---------- submits ---------- */
const FORM = {
  async login(f) {
    const u = await tryLogin(f.elements.login.value, f.elements.pw.value);
    if (!u) return toast('Usuário ou senha incorretos.', true);
    me = u; localStorage.setItem(SES, u.id); if (!location.hash) go('dashboard'); render();
    if (u.defaultPw) setTimeout(() => toast('Troque a senha padrão em "Trocar senha" (menu lateral).', true), 400);
  },
  async modal2(f) {
    if (!modal2Ctx) return;
    const d = formData(f, modal2Ctx.fields), err = await modal2Ctx.onSave(d);
    if (err) return toast(err, true);
    closeModal2();
  },
  async modal(f) {
    if (!modalCtx) return;
    const d = formData(f, modalCtx.fields), err = await modalCtx.onSave(d);
    if (err) return toast(err, true);
    closeModal();
  },
  entry(f, ev) {
    const fields = ['date', 'kind', 'locationId', 'productId', 'qty', 'buyPrice', 'sellPrice', 'supplierId', 'orderId', 'note'].map(n => ({ name: n, type: ['qty', 'buyPrice', 'sellPrice'].includes(n) ? 'number' : 'text' }));
    const d = formData(f, fields);
    if (!d.productId) return toast('Escolha o produto.', true);
    if (!(d.qty >= 1)) return toast('Informe a quantidade.', true);
    if (d.buyPrice === '' || d.sellPrice === '') return toast('Informe valor de compra e de venda.', true);
    ui.lastLoc = d.locationId;
    db.entries.push({ id: uid(), at: Date.now(), date: d.date, kind: d.kind, locationId: d.locationId, productId: d.productId, qty: Math.round(d.qty), buyPrice: d.buyPrice, sellPrice: d.sellPrice, supplierId: d.supplierId, note: d.note, userId: me.id });
    const p = prod(d.productId); p.buyPrice = d.buyPrice; p.sellPrice = d.sellPrice; if (d.supplierId) p.supplierId = d.supplierId;
    if (d.orderId) { const o = db.orders.find(o => o.id === d.orderId); if (o) o.status = 'recebido'; }
    save(); toast('Entrada registrada.');
    if (ev.submitter && ev.submitter.dataset.again) { ui.prefill = null; rerender(); } else go('estoque');
  },
  transfer(f) {
    const d = formData(f, ['date', 'fromId', 'toId', 'productId', 'qty', 'destino', 'note'].map(n => ({ name: n, type: n === 'qty' ? 'number' : 'text' })));
    if (!d.productId || !(d.qty >= 1)) return toast('Preencha produto e quantidade.', true);
    if (!d.toId && !d.destino) return toast('Escolha o estoque de destino ou informe o destino externo.', true);
    if (d.toId && d.toId === d.fromId) return toast('Origem e destino são o mesmo estoque.', true);
    const have = stockMap(d.fromId)[d.productId] || 0;
    if (d.qty > have) return toast(`Estoque insuficiente em ${locName(d.fromId)}: só há ${have} un.`, true);
    ui.lastLoc = d.fromId;
    db.transfers.push({ id: uid(), at: Date.now(), date: d.date, productId: d.productId, qty: Math.round(d.qty), fromId: d.fromId, toId: d.toId, destino: d.destino, note: d.note, userId: me.id });
    save(); rerender(); toast('Transferência registrada.');
  },
  sale(f) {
    const lines = $$('.line', f).map(l => ({ productId: l.querySelector('[name=productId]').value, qty: Math.round(num(l.querySelector('[name=qty]').value)), price: num(l.querySelector('[name=price]').value) })).filter(l => l.productId);
    if (!lines.length) return toast('Adicione pelo menos um produto.', true);
    const locId = f.elements.locationId.value, sm = stockMap(locId), need = {};
    for (const l of lines) {
      if (l.qty < 1) return toast('Quantidade inválida.', true);
      need[l.productId] = (need[l.productId] || 0) + l.qty;
    }
    for (const [pid, q] of Object.entries(need)) if (q > (sm[pid] || 0)) return toast(`Estoque insuficiente de ${prodShort(prod(pid))} em ${locName(locId)}: há ${sm[pid] || 0} un.`, true);
    let c = resolveCustomer($('#custq').value), newC = null;
    if (!c) {
      if (!$('#custq').value.trim()) return toast('Informe o cliente.', true);
      const name = ($('[name=cname]', f)?.value || '').trim(), phone = ($('[name=cphone]', f)?.value || '').trim();
      if (!name || !phone) return toast('Cliente novo: preencha nome e telefone.', true);
      const dup = db.customers.find(x => digits(x.phone) === digits(phone));
      if (dup) return toast(`Já existe cliente com esse telefone: ${dup.name}. Digite o nome dele no campo Cliente.`, true);
      newC = { id: uid(), name, phone, birthday: $('[name=cbday]', f).value || '', active: true }; c = newC;
    }
    const items = lines.map(l => ({ productId: l.productId, qty: l.qty, price: l.price, cost: num(prod(l.productId).buyPrice) }));
    if (newC) db.customers.push(newC);
    ui.lastLoc = locId;
    db.sales.push({ id: uid(), at: Date.now(), date: f.elements.date.value, locationId: locId, typeId: f.elements.typeId.value, paymentId: f.elements.paymentId.value, customerId: c.id, items, total: sum(items, i => i.qty * i.price), userId: me.id, userName: me.name });
    save(); rerender(); toast(`Venda registrada${newC ? ' e cliente cadastrado' : ''}.`);
  }
};

/* ---------- inputs ---------- */
const ON = {
  from(el) { ui.from = el.value; rerender(); }, to(el) { ui.to = el.value; rerender(); },
  estq(el) { ui.estq = el.value; keepFocus(el); }, onlyAlert(el) { ui.onlyAlert = el.checked; rerender(); }, showInactive(el) { ui.showInactive = el.checked; rerender(); },
  vq(el) { ui.vq = el.value; keepFocus(el); }, vtype(el) { ui.vtype = el.value; rerender(); }, vpay(el) { ui.vpay = el.value; rerender(); },
  cq(el) { ui.cq = el.value; keepFocus(el); },
  df(el) { ui.df = ui.df || {}; ui.df[el.dataset.k] = el.value; if (el.dataset.k === 'tipo') ui.df.productId = ''; rerender(); },
  saleLoc() { $('#lines').innerHTML = ''; addLine(); calcSale(); },
  transFrom(el) {
    const sel = el.form.elements.productId, blank = sel.querySelector('option[value=""]');
    sel.innerHTML = (blank ? blank.outerHTML : '') + prodOpts(true, null, el.value).map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('');
  },
  skuPrev(el) { const f = el.form; if (f && f.elements.sku) f.elements.sku.value = el.value.trim() ? skuFor(el.value) : ''; },
  touch(el) { el.dataset.t = 1; },
  custq() { updateCustBox(); },
  saleCalc() { calcSale(); },
  saleProd(el) {
    const o = el.selectedOptions[0], l = el.closest('.line');
    if (o && o.dataset.price !== undefined) { l.querySelector('[name=price]').value = o.dataset.price; l.querySelector('[name=qty]').max = o.dataset.stock; }
    calcSale();
  },
  entryProd(el) {
    const p = prod(el.value), f = el.form; if (!p) return refreshOrderSelect();
    f.elements.buyPrice.value = p.buyPrice; f.elements.sellPrice.value = p.sellPrice; f.elements.supplierId.value = p.supplierId || '';
    refreshOrderSelect();
  },
  orderProd(el) {
    const p = prod(el.value), f = el.form; if (!p) return;
    f.elements.supplierId.value = p.supplierId || '';
    f.elements.qty.value = reorder(p, stockMap()[p.id] || 0).suggest;
    ON.orderCalc(el);
  },
  orderCalc(el) {
    const f = el.form, p = prod(f.elements.productId.value); if (!p || !f.elements.date.value) return;
    f.elements.expectedDate.value = addDays(f.elements.date.value, leadFor(p));
  },
  restore(el) {
    const file = el.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result); if (!d || !Array.isArray(d.products) || !Array.isArray(d.users)) throw 0;
        if (!confirm('Restaurar este backup substitui TODOS os dados atuais. Continuar?')) return;
        db = d; load2(); save(); me = db.users.find(u => u.id === me?.id) || null; render(); toast('Backup restaurado.');
      } catch { toast('Arquivo de backup inválido.', true); }
    };
    r.readAsText(file);
  }
};
function load2() { const d = defaults(); for (const k of Object.keys(d)) if (!Array.isArray(db[k])) db[k] = d[k]; }
/* re-render sem perder o foco da caixa de busca */
function keepFocus(el) {
  const name = el.dataset.on, pos = el.selectionStart; render();
  const n = $(`[data-on=${name}]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { } }
}

/* ---------- delegação de eventos ---------- */
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (a && ACT[a.dataset.act]) { if (a.tagName === 'A' && a.dataset.act === 'closeMenu') return ACT.closeMenu(); e.preventDefault(); ACT[a.dataset.act](a, e); return; }
  if (e.target.id === 'modal') closeModal();
  if (e.target.id === 'modal2') closeModal2();
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f || !FORM[f.dataset.form]) return;
  e.preventDefault(); FORM[f.dataset.form](f, e);
});
const onEvt = e => { const el = e.target.closest('[data-on]'); if (el && ON[el.dataset.on]) ON[el.dataset.on](el, e); };
document.addEventListener('input', e => { const t = e.target; if (t.type === 'checkbox' || t.type === 'file' || t.tagName === 'SELECT' || t.type === 'date') return; onEvt(e); });
document.addEventListener('change', e => { const t = e.target; if (t.type === 'checkbox' || t.type === 'file' || t.tagName === 'SELECT' || t.type === 'date') onEvt(e); else if (t.dataset && t.dataset.on === 'custq') onEvt(e); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m2 = $('#modal2'); if (m2 && !m2.hidden) closeModal2(); else if (!$('#modal').hidden) closeModal(); } });
/* pilha de navegação para o botão Voltar */
const navStack = []; let goingBack = false;
function trackNav() {
  if (goingBack) { goingBack = false; return; }
  const r = curRoute(); if (navStack[navStack.length - 1] !== r) navStack.push(r);
}
window.addEventListener('hashchange', () => { trackNav(); render(); scrollTo(0, 0); });
window.addEventListener('beforeprint', () => document.title = 'Zium Fitness · Relatório');

/* ---------- boot ---------- */
document.addEventListener('visibilitychange', pullIfChanged);
window.addEventListener('focus', pullIfChanged);
setInterval(pullIfChanged, 60000);

(async function boot() {
  load();
  if (cloudOn) {
    $('#app').innerHTML = '<div class="login"><div class="login-card"><img src="logo.svg" alt="Zium Fitness"><p class="muted" style="text-align:center">Carregando dados da planilha…</p></div></div>';
    try {
      const j = await cloudCall({ action: 'load' });
      if (!j.ok) throw new Error(j.error);
      cloudRev = j.rev;
      if (j.data && j.data.users && j.data.users.length) { db = j.data; load2(); }
      await ensureAdmin(); cloudReady = true; save();
    } catch (e) {
      $('#app').innerHTML = `<div class="login"><div class="login-card"><img src="logo.svg" alt="Zium Fitness"><p style="text-align:center">Não consegui conectar na planilha.</p><p class="muted sm" style="text-align:center">Confira o endereço e o token em <b>config.js</b> e se a implantação do Apps Script está como "Qualquer pessoa".<br>(${esc(e.message)})</p><button class="btn block" onclick="location.reload()">Tentar de novo</button></div></div>`;
      return;
    }
  }
  await ensureAdmin();
  trackNav();
  const sid = localStorage.getItem(SES); me = db.users.find(u => u.id === sid && u.active !== false) || null;
  render();
})();
