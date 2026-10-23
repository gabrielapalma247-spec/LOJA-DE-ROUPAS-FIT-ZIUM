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
/* Formato salvo (navegador e planilha): listas "planas"; cada registro de empresa leva `companyId`.
   Em memória: STORE guarda o que é de cada empresa e `db` é a visão da empresa escolhida (ou de todas). */
let db, STORE, me = null;
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const co0 = lsGet('zium_empresa');
const ui = { per: 'mes', cadTab: 'products', rel: 'estoque', saidaMode: 'venda', histTab: 'entries', company: co0 === 'todas' ? '' : (co0 || 'emp-natal') };
const GLOBAL = ['users', 'paymentMethods', 'saleTypes', 'expenseCategories', 'companies'];
const SCOPED = ['products', 'customers', 'suppliers', 'locations', 'entries', 'sales', 'transfers', 'orders', 'expenses'];

function defaults() {
  const mk = n => ({ id: uid(), name: n, active: true });
  return {
    users: [],
    companies: [{ id: 'emp-natal', name: 'Empresa Natal', active: true }, { id: 'emp-interior', name: 'Empresa Interior', active: true }],
    paymentMethods: ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito'].map(mk),
    saleTypes: ['Vendas da loja', 'Vendas por indicação', 'Vendas redes sociais', 'Outros'].map(mk),
    expenseCategories: ['Frete', 'Embalagens', 'Tráfego pago', 'Gasolina', 'Materiais de escritório', 'Outros'].map(mk),
    locations: [], suppliers: [], products: [], customers: [], entries: [], sales: [], transfers: [], orders: [], expenses: []
  };
}
/* monta o STORE a partir do formato plano; devolve true se precisou completar algo (aí vale salvar) */
function hydrate(flat) {
  const d = defaults(); let changed = false;
  STORE = { byCompany: {} };
  for (const k of GLOBAL) { if (Array.isArray(flat[k])) STORE[k] = flat[k]; else { STORE[k] = d[k]; changed = true; } }
  if (!STORE.companies.length) { STORE.companies = d.companies; changed = true; }
  for (const c of STORE.companies) STORE.byCompany[c.id] = Object.fromEntries(SCOPED.map(k => [k, []]));
  const first = STORE.companies[0].id;
  for (const k of SCOPED) for (const rec of (Array.isArray(flat[k]) ? flat[k] : [])) {
    const cid = STORE.byCompany[rec.companyId] ? rec.companyId : first;
    if (rec.companyId !== cid) { rec.companyId = cid; changed = true; }
    STORE.byCompany[cid][k].push(rec);
  }
  for (const c of STORE.companies) ensureCompanyData(c, () => { changed = true; });
  if (ui.company && !STORE.byCompany[ui.company]) ui.company = first;
  bindDb();
  return changed;
}
/* toda empresa precisa de pelo menos Casa e Loja */
function ensureCompanyData(c, onChange) {
  if (!STORE.byCompany[c.id]) STORE.byCompany[c.id] = Object.fromEntries(SCOPED.map(k => [k, []]));
  const B = STORE.byCompany[c.id];
  if (!B.locations.length) { ['Casa', 'Loja'].forEach(n => B.locations.push({ id: uid(), name: n, active: true, companyId: c.id })); if (onChange) onChange(); }
}
function bindDb() {
  db = {};
  for (const k of GLOBAL) Object.defineProperty(db, k, { get: () => STORE[k], set: v => { STORE[k] = v; }, enumerable: true });
  for (const k of SCOPED) Object.defineProperty(db, k, {
    get: () => ui.company ? STORE.byCompany[ui.company][k] : STORE.companies.flatMap(c => STORE.byCompany[c.id][k]),
    set: v => { if (ui.company) STORE.byCompany[ui.company][k] = v; else for (const c of STORE.companies) STORE.byCompany[c.id][k] = v.filter(x => x.companyId === c.id); },
    enumerable: true
  });
}
function serialize() {
  const o = {};
  for (const k of GLOBAL) o[k] = STORE[k];
  for (const k of SCOPED) { o[k] = []; for (const c of STORE.companies) for (const rec of STORE.byCompany[c.id][k]) { rec.companyId = c.id; o[k].push(rec); } }
  return o;
}
const allOf = k => STORE.companies.flatMap(c => STORE.byCompany[c.id][k]);
const coById = id => STORE.companies.find(c => c.id === id);
const coShort = id => ((coById(id) || {}).name || '').replace(/^Empresa\s+/i, '') || '—';
const allMode = () => !ui.company;
/* "Todas as empresas" é só para consultar: lançar/cadastrar exige escolher uma */
function needCo() {
  if (ui.company) return false;
  toast('Escolha uma empresa (Natal ou Interior) no menu para lançar ou cadastrar. "Todas" serve só para consultar.', true);
  return true;
}
function load() {
  let flat = null;
  try { const r = localStorage.getItem(KEY); flat = r ? JSON.parse(r) : null; } catch { flat = null; }
  hydrate(flat || defaults());
}
function save() {
  const flat = serialize();
  try { localStorage.setItem(KEY, JSON.stringify(flat)); }
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
  hydrate(data); cloudRev = rev; dirty = false;
  try { localStorage.setItem(KEY, JSON.stringify(serialize())); } catch { }
  me = db.users.find(u => u.id === me?.id && u.active !== false) || null; render();
}
async function push() {
  if (pushing) { pushT = setTimeout(push, 500); return; }
  pushing = true; dirty = false;
  try {
    const j = await cloudCall({ action: 'save', baseRev: cloudRev, data: serialize() });
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
const locName = id => { const l = byId(db.locations, id); return l ? l.name + (allMode() && STORE.companies.length > 1 ? ' · ' + coShort(l.companyId) : '') : '—'; };
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
  despesas: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  cadastros: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  relatorios: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'
};
const ROUTES = {
  dashboard: ['Dashboard', () => viewDashboard()],
  estoque: ['Estoque', () => viewEstoque()],
  entrada: ['Entrada', () => viewEntrada()],
  saida: ['Saída', () => viewSaida()],
  vendas: ['Vendas', () => viewVendas()],
  despesas: ['Despesas', () => viewDespesas()],
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
      <div class="co no-print"><div class="co-l">Empresa</div><div class="co-seg">${STORE.companies.filter(c => c.active !== false).map(c => `<button data-act="company" data-k="${c.id}" class="${ui.company === c.id ? 'on' : ''}">${esc(coShort(c.id))}</button>`).join('')}<button data-act="company" data-k="" class="${!ui.company ? 'on' : ''}">Todas</button></div></div>
      <nav class="nav">${nav}</nav>
      <div class="who">${cloudOn ? `<div id="sync" class="muted sm" style="margin-bottom:10px">${SYNC_TXT[syncState]}</div>` : ''}<b>${esc(me.name)}</b>${me.role === 'admin' ? 'Administrador' : 'Vendedor(a)'}
        <div class="row" style="margin-top:10px"><button class="btn ghost sm" data-act="chpw">Trocar senha</button><button class="btn ghost sm" data-act="logout">Sair</button></div></div>
    </aside>
    <main class="main"><div class="row no-print" style="margin-bottom:14px"><button class="btn ghost sm menu-btn" data-act="menu">☰ Menu</button>${r !== 'dashboard' ? '<button class="btn ghost sm" data-act="back">← Voltar</button>' : ''}</div>${ui.company ? '' : '<div class="co-banner no-print">Você está vendo <b>todas as empresas</b> juntas (modo consulta). Para lançar ou cadastrar, escolha uma empresa no menu.</div>'}<div id="view">${ROUTES[r][1]()}</div></main></div>`;
  afterRender(r);
}
function afterRender(r) {
  if (r === 'saida' && ui.saidaMode === 'venda' && $('#lines')) { if (!$$('.line').length) addLine(); calcSale(); }
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
    if (f.quick) input = `<div class="withplus">${input}<button type="button" class="btn ghost" data-act="quickAdd" data-kind="${f.quick}" data-field="${f.name}" title="Cadastrar ${({ products: 'novo produto', suppliers: 'novo fornecedor', expenseCategories: 'nova categoria' })[f.quick]}">+</button></div>`;
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
    const opts = kind === 'products' ? prodOpts(false, rec.id) : kind === 'expenseCategories' ? optsOf(db.expenseCategories, rec.id) : optsOf(db.suppliers, rec.id);
    sel.innerHTML = (blank ? blank.outerHTML : '') + opts.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('');
    sel.value = rec.id; sel.dispatchEvent(new Event('change', { bubbles: true }));
    toast(`${sc.one[0].toUpperCase() + sc.one.slice(1)} cadastrado e selecionado.`);
  });
}

const noticeAll = () => '<div class="card" style="margin-bottom:16px"><h3>Escolha uma empresa</h3><p class="muted" style="margin:6px 0 0">Para lançar, selecione <b>Natal</b> ou <b>Interior</b> no menu à esquerda. “Todas” mostra os números juntos, só para consultar.</p></div>';

/* ---------- opções de selects ---------- */
const activeOf = list => list.filter(x => x.active !== false);
const optsOf = (list, cur) => list.filter(x => x.active !== false || x.id === cur).map(x => ({ v: x.id, t: x.name }));
const locOpts = cur => optsOf(db.locations, cur);
const locSel = () => db.locations.length > 1 ? `<div class="seg no-print"><button data-act="loc" data-k="" class="${!ui.loc ? 'on' : ''}">Todos os estoques</button>${db.locations.filter(l => l.active !== false).map(l => `<button data-act="loc" data-k="${l.id}" class="${ui.loc === l.id ? 'on' : ''}">${esc(locName(l.id))}</button>`).join('')}</div>` : '';
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
  const X = db.expenses.filter(e => inRange(e.date, R) && (!F.xcat || e.categoryId === F.xcat) && (!F.paymentId || e.paymentId === F.paymentId) && (!F.supplierId || e.supplierId === F.supplierId));
  const xOk = e => (!F.xcat || e.categoryId === F.xcat) && (!F.paymentId || e.paymentId === F.paymentId) && (!F.supplierId || e.supplierId === F.supplierId);
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
    ${fsel('xcat', 'Categoria de despesa', db.expenseCategories.map(x => ({ v: x.id, t: x.name })))}
    ${fsel('customerId', 'Cliente', db.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map(x => ({ v: x.id, t: x.name })))}
    ${fsel('userId', 'Vendedor(a)', db.users.map(x => ({ v: x.id, t: x.name })))}</div>
    ${F.typeId || F.paymentId || F.customerId || F.userId || F.locationId ? '<div class="muted sm" style="margin-top:10px">Filtros de venda (tipo, pagamento, cliente, vendedor) valem só para as vendas; compras e estoque seguem os filtros de produto/fornecedor.</div>' : ''}</div>`;
  const receita = sum(S, s => s.total), custo = sum(S, saleCost), compras = sum(E, e => e.qty * e.buyPrice);
  const despesas = sum(X, e => e.value);
  const lucro = receita - custo, lucroLiq = lucro - despesas, saldo = receita - compras - despesas, margem = receita ? lucro / receita * 100 : 0, margemLiq = receita ? lucroLiq / receita * 100 : 0;
  const sm = stockMap(F.locationId || undefined);
  const stCusto = sum(PF, p => Math.max(0, sm[p.id] || 0) * num(p.buyPrice));
  const stVenda = sum(PF, p => Math.max(0, sm[p.id] || 0) * num(p.sellPrice));
  const stQtd = sum(PF, p => Math.max(0, sm[p.id] || 0));
  const al = alertList().filter(x => pOk(x.p));

  // últimos 6 meses
  const n = new Date(), months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(n.getFullYear(), n.getMonth() - i, 1); months.push({ k: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, l: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, v: 0, c: 0, x: 0 }); }
  for (const s of fSales(db.sales)) { const m = months.find(x => x.k === s.date.slice(0, 7)); if (m) m.v += s.total; }
  for (const e of db.entries) if (e.kind !== 'devolucao' && eOk(e)) { const m = months.find(x => x.k === e.date.slice(0, 7)); if (m) m.c += e.qty * e.buyPrice; }
  for (const e of db.expenses) if (xOk(e)) { const m = months.find(x => x.k === e.date.slice(0, 7)); if (m) m.x += e.value; }
  const byCatX = {}; for (const e of X) byCatX[e.categoryId] = (byCatX[e.categoryId] || 0) + e.value;
  const catX = Object.entries(byCatX).map(([k, v]) => [(byId(db.expenseCategories, k) || {}).name || '—', v]).sort((a, b) => b[1] - a[1]);
  const coRows = allMode() && STORE.companies.length > 1 ? STORE.companies.map(c => { const v = sum(S.filter(s => s.companyId === c.id), s => s.total), k = sum(S.filter(s => s.companyId === c.id), saleCost), cp = sum(E.filter(e => e.companyId === c.id), e => e.qty * e.buyPrice), dx = sum(X.filter(e => e.companyId === c.id), e => e.value); return [c.name, v, cp, dx, v - k - dx]; }) : null;

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
    <div class="kpi"><div class="l">Despesas operacionais</div><div class="v">${brl(despesas)}</div><div class="s">${X.length} lançamento(s)</div></div>
    <div class="kpi ${saldo >= 0 ? 'ok' : 'bad'}"><div class="l">Saldo do período</div><div class="v">${brl(saldo)}</div><div class="s">vendas − compras − despesas</div></div>
  </div>
  <div class="grid g4" style="margin-top:14px">
    <div class="kpi ${lucro >= 0 ? 'ok' : 'bad'}"><div class="l">Lucro bruto</div><div class="v">${brl(lucro)}</div><div class="s">margem ${margem.toFixed(1).replace('.', ',')}% · custo vendido ${brl(custo)}</div></div>
    <div class="kpi ${lucroLiq >= 0 ? 'ok' : 'bad'}"><div class="l">Lucro líquido</div><div class="v">${brl(lucroLiq)}</div><div class="s">lucro bruto − despesas · margem ${margemLiq.toFixed(1).replace('.', ',')}%</div></div>
    <div class="kpi"><div class="l">Estoque a custo</div><div class="v">${brl(stCusto)}</div><div class="s">${int(stQtd)} un · dinheiro parado em mercadoria</div></div>
    <div class="kpi"><div class="l">Estoque a preço de venda</div><div class="v">${brl(stVenda)}</div><div class="s">lucro potencial ${brl(stVenda - stCusto)}</div></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>Vendas × compras × despesas · 6 meses</h3>
      <div class="legend" style="margin-top:10px"><span><i style="background:var(--gold)"></i>Vendas</span><span><i style="background:#6f7480"></i>Compras</span><span><i style="background:#e86a5f"></i>Despesas</span></div>${barChart(months)}</div>
    <div class="card"><h3>Reposição · ${al.length} alerta(s)</h3>${al.length ? `<div class="list" style="margin-top:8px">${al.slice(0, 7).map(({ p, stock, r }) =>
      `<div class="it"><div><b>${esc(prodShort(p))}</b><div class="muted sm">estoque ${stock} · ponto de pedido ${r.rop}${allMode() ? ' · ' + esc(coShort(p.companyId)) : ''}</div></div>${stPill(r.st)}</div>`).join('')}</div>
      ${al.length > 7 ? `<div class="muted sm" style="margin-top:8px">+ ${al.length - 7} no Estoque</div>` : ''}` : `<div class="empty">Nenhum produto precisando de pedido 🎉</div>`}</div>
  </div>
  <div class="grid g3" style="margin-top:16px">
    <div class="card"><h3>Vendas por tipo</h3>${hbars(byType)}</div>
    <div class="card"><h3>Forma de pagamento</h3>${hbars(byPay)}</div>
    <div class="card"><h3>Mais vendidos</h3>${hbars(top)}</div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>Despesas por categoria</h3>${hbars(catX)}</div>
    <div class="card"><h3>Aniversariantes de ${MESES[mes - 1]}</h3>${bdays.length ? `<div class="list" style="margin-top:8px">${bdays.map(c =>
      `<div class="it"><span><b>${esc(c.name)}</b> <span class="muted">· dia ${c.birthday.slice(8)}${allMode() ? ' · ' + esc(coShort(c.companyId)) : ''}</span></span>${c.phone ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${digits(c.phone).length <= 11 ? '55' : ''}${digits(c.phone)}">WhatsApp</a>` : ''}</div>`).join('')}</div>` : `<div class="empty">Nenhum aniversário cadastrado neste mês.</div>`}</div>
  </div>
  ${coRows ? `<div class="card" style="margin-top:16px"><h3>Comparativo por empresa</h3><div class="tw" style="margin-top:10px"><table><thead><tr><th>Empresa</th><th class="num">Vendas</th><th class="num">Compras</th><th class="num">Despesas</th><th class="num">Lucro líquido</th></tr></thead><tbody>${coRows.map(r => `<tr><td><b>${esc(r[0])}</b></td><td class="num">${brl(r[1])}</td><td class="num">${brl(r[2])}</td><td class="num">${brl(r[3])}</td><td class="num"><b style="color:${r[4] >= 0 ? 'var(--ok)' : 'var(--bad)'}">${brl(r[4])}</b></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
}
function hbars(rows) {
  if (!rows.length) return '<div class="empty">Sem dados no período</div>';
  const max = Math.max(...rows.map(r => r[1])) || 1;
  return `<div class="bars" style="margin-top:12px">${rows.map(([l, v]) => `<div class="bar"><div class="top"><span>${esc(l)}</span><span>${brl(v)}</span></div><div class="track"><div class="fill" style="width:${Math.max(2, v / max * 100)}%"></div></div></div>`).join('')}</div>`;
}
function barChart(months) {
  const W = 640, H = 230, pb = 28, pt = 18, gw = W / months.length;
  const max = Math.max(...months.flatMap(m => [m.v, m.c, m.x || 0])) || 1, ch = H - pb - pt;
  const short = v => v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : Math.round(v);
  const bw = gw * .22;
  const bar = (x, v, col, t) => { const h = v / max * ch; return `<rect x="${x}" y="${H - pb - h}" width="${bw}" height="${Math.max(h, v ? 2 : 0)}" rx="3" fill="${col}"><title>${t}: ${brl(v)}</title></rect>${v ? `<text x="${x + bw / 2}" y="${H - pb - h - 4}" text-anchor="middle" font-size="9.5" fill="#9b978d">${short(v)}</text>` : ''}`; };
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Vendas, compras e despesas por mês">
    <line x1="0" y1="${H - pb}" x2="${W}" y2="${H - pb}" stroke="#2c2c2f"/>
    ${months.map((m, i) => { const x = i * gw; return bar(x + gw * .1, m.v, '#DDA443', 'Vendas') + bar(x + gw * .37, m.c, '#6f7480', 'Compras') + bar(x + gw * .64, m.x || 0, '#e86a5f', 'Despesas') + `<text x="${x + gw / 2}" y="${H - 8}" text-anchor="middle" font-size="12" fill="#9b978d">${m.l}</text>`; }).join('')}</svg>`;
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
    ${allMode() ? '' : '<div class="row"><button class="btn ghost" data-act="newOrder">+ Novo pedido</button><a class="btn" href="#/entrada">+ Dar entrada</a></div>'}</div>
  ${orders.length ? `<div class="card" style="margin-bottom:16px"><h3>Pedidos a caminho</h3><div class="tw" style="margin-top:10px"><table><thead><tr><th>Pedido em</th><th>Produto</th><th>Fornecedor</th><th class="num">Qtd</th><th>Previsão</th><th></th></tr></thead><tbody>
    ${orders.sort((a, b) => (a.expectedDate || '').localeCompare(b.expectedDate || '')).map(o => `<tr><td>${fdate(o.date)}</td><td>${esc(prodLabel(prod(o.productId)))}</td><td>${esc(sup(o.supplierId)?.name || '—')}</td><td class="num">${o.qty}</td>
    <td>${fdate(o.expectedDate)} ${o.expectedDate && o.expectedDate < today() ? '<span class="pill bad">atrasado</span>' : ''}</td>
    <td class="act"><button class="btn sm" data-act="recvOrder" data-id="${o.id}">Receber</button> <button class="btn ghost sm" data-act="cancelOrder" data-id="${o.id}">Cancelar</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
  <div class="row no-print" style="margin-bottom:14px">${locSel()}<input style="max-width:300px" placeholder="Buscar SKU, produto, cor…" value="${esc(ui.estq || '')}" data-on="estq">
    <label class="chk"><input type="checkbox" ${ui.onlyAlert ? 'checked' : ''} data-on="onlyAlert"> só com alerta</label>
    <label class="chk"><input type="checkbox" ${ui.showInactive ? 'checked' : ''} data-on="showInactive"> mostrar inativos</label></div>
  <div class="tw"><table><thead><tr><th>SKU</th><th>Produto</th><th>Fornecedor</th><th class="num">Estoque</th><th class="num">Pto. pedido</th><th class="num">Custo</th><th class="num">Venda</th><th>Últ. entrada</th><th>Situação</th><th></th></tr></thead><tbody>
  ${rows.length ? rows.map(({ p, stock, total, r }) => `<tr><td><b>${esc(p.sku)}</b></td><td>${esc(prodShort(p))}<div class="muted sm">${esc(p.tipo)}${allMode() ? ' · ' + esc(coShort(p.companyId)) : ''}</div></td><td>${esc(sup(p.supplierId)?.name || '—')}</td>
    <td class="num"><b style="color:${stock <= 0 ? 'var(--bad)' : 'inherit'}">${stock}</b>${!ui.loc && db.locations.length > 1 ? `<div class="muted sm">${locMaps.map(([l, m]) => `${esc(l.name)} ${m[p.id] || 0}`).join(' · ')}</div>` : ''}</td><td class="num muted" title="Venda média ${r.avg.toFixed(2)}/dia × prazo ${r.lead}d + mínimo ${p.minStock || 0}">${r.rop}</td>
    <td class="num">${brl(p.buyPrice)}</td><td class="num">${brl(p.sellPrice)}</td><td class="muted">${fdate(lastEntry(p.id)) || '—'}</td><td>${stPill(r.st)}${r.st === 'ok' && p.active === false ? ' <span class="pill">inativo</span>' : ''}</td>
    <td class="act"><div class="acts">${allMode() ? '' : `${r.st === 'pedir' || r.st === 'zerado' || r.st === 'atrasado' ? `<button class="btn sm" data-act="newOrder" data-pid="${p.id}">Pedir</button> ` : ''}<button class="btn ghost sm" data-act="labels" data-pid="${p.id}" data-qty="${Math.max(stock, 1)}">Etiquetas</button> ${stock > 0 ? `<button class="btn danger sm" data-act="zeroStock" data-pid="${p.id}">Excluir estoque</button>` : ''}`}</div></td></tr>`).join('')
    : `<tr><td colspan="10" class="empty">${db.products.length ? 'Nada encontrado.' : 'Nenhum produto ainda. Comece em Cadastros → Produtos.'}</td></tr>`}</tbody></table></div>
  <p class="muted sm" style="margin-top:10px">Ponto de pedido = venda média diária (últimos 30 dias) × prazo de entrega + estoque mínimo. Passe o mouse no número para ver a conta.</p>`;
}
function orderModal(pid, orderId) {
  const p = pid ? prod(pid) : null;
  let suggest = '';
  if (p) { const sm = stockMap(); suggest = reorder(p, sm[p.id] || 0).suggest; }
  const lead = p ? leadFor(p) : 0;
  const fields = [
    { name: 'date', label: 'Data do pedido', type: 'date', required: true, on: 'orderCalc' },
    { name: 'productId', label: 'Produto', type: 'select', required: true, options: () => prodOpts(false, pid), blank: 'Selecione…', on: 'orderProd', quick: 'products' },
    { name: 'supplierId', label: 'Fornecedor', type: 'select', options: () => optsOf(db.suppliers, p?.supplierId), blank: '—', quick: 'suppliers' },
    { name: 'locationId', label: 'Chega em qual estoque', type: 'select', required: true, options: () => locOpts(), default: ui.lastLoc || defLoc() },
    { name: 'qty', label: 'Quantidade', type: 'number', min: 1, step: 1, required: true },
    { name: 'expectedDate', label: 'Previsão de chegada', type: 'date', required: true, hint: 'Calculada pelo prazo do fornecedor/produto. Pode ajustar.' }
  ];
  modalForm('Novo pedido ao fornecedor', fields, { productId: pid || '', supplierId: p?.supplierId || '', qty: suggest, date: '', expectedDate: '' }, d => {
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
    { name: 'date', label: 'Data de entrada', type: 'date', required: true },
    { name: 'kind', label: 'Tipo', type: 'select', options: () => [{ v: 'compra', t: 'Compra de fornecedor' }, { v: 'devolucao', t: 'Devolução de transferência / ajuste' }] },
    { name: 'locationId', label: 'Entra em qual estoque', type: 'select', required: true, options: () => locOpts(), default: ui.lastLoc || defLoc() },
    { name: 'productId', label: 'Produto', type: 'select', required: true, blank: 'Selecione…', options: () => prodOpts(false), on: 'entryProd', full: true, quick: 'products' },
    { name: 'qty', label: 'Quantidade', type: 'number', min: 1, step: 1, required: true },
    { name: 'buyPrice', label: 'Valor de compra (un.)', type: 'number', min: 0, step: 0.01, required: true },
    { name: 'sellPrice', label: 'Valor de venda (un.)', type: 'number', min: 0, step: 0.01, required: true },
    { name: 'supplierId', label: 'Fornecedor', type: 'select', blank: '—', options: () => optsOf(db.suppliers), quick: 'suppliers' },
    { name: 'orderId', label: 'Dar baixa no pedido', type: 'select', blank: 'Nenhum', options: () => [] },
    { name: 'note', label: 'Observação / nota fiscal', full: true },
    { name: 'labels', label: 'Gerar etiquetas desta entrada (logo, descrição, tamanho e valor)', type: 'checkbox', default: true, full: true }
  ];
  const vals = p ? { locationId: pf.locationId, productId: p.id, qty: pf.qty, buyPrice: p.buyPrice, sellPrice: p.sellPrice, supplierId: p.supplierId } : {};
  ui.entryOrderPre = pf.orderId || '';
  const E = db.entries.filter(e => inRange(e.date, range(ui.per)) && (!ui.loc || locOf(e) === ui.loc)).sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0)).slice(0, 100);
  return `<div class="page-head"><div><h1>Entrada de estoque</h1><p>Registre a mercadoria que chegou, o valor de compra e o preço que vai vender.</p></div></div>
  ${allMode() ? noticeAll() : `<form class="card" data-form="entry">${fieldsHTML(fields, vals)}
    <div class="row" style="margin-top:18px"><button class="btn">Registrar entrada</button><button class="btn ghost" data-again="1">Salvar e lançar outra</button></div></form>`}
  <div class="page-head" style="margin-top:28px"><h2>Entradas do período</h2><div class="row">${locSel()}${periodSel()}</div></div>
  <div class="tw"><table><thead><tr><th>Data</th><th>Produto</th><th>Estoque</th><th>Fornecedor</th><th>Tipo</th><th class="num">Qtd</th><th class="num">Compra un.</th><th class="num">Venda un.</th><th class="num">Total compra</th><th></th></tr></thead><tbody>
  ${E.length ? E.map(e => `<tr><td>${fdate(e.date)}</td><td>${esc(prodLabel(prod(e.productId)))}${e.note ? `<div class="muted sm">${esc(e.note)}</div>` : ''}</td><td><span class="pill">${esc(locName(locOf(e)))}</span></td><td>${esc(sup(e.supplierId)?.name || '—')}</td><td>${e.kind === 'devolucao' ? '<span class="pill info">Devolução</span>' : 'Compra'}</td>
  <td class="num">${e.qty}</td><td class="num">${brl(e.buyPrice)}</td><td class="num">${brl(e.sellPrice)}</td><td class="num">${e.kind === 'devolucao' ? '—' : brl(e.qty * e.buyPrice)}</td><td class="act"><button class="btn ghost sm" data-act="labelsEntry" data-id="${e.id}">Etiquetas</button> <button class="btn danger sm" data-act="delEntry" data-id="${e.id}">Excluir</button></td></tr>`).join('') : `<tr><td colspan="10" class="empty">Nenhuma entrada no período.</td></tr>`}</tbody></table></div>`;
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
  if (allMode()) return head + noticeAll();
  if (ui.saidaMode === 'transf') {
    const start = ui.lastLoc || defLoc();
    const fields = [
      { name: 'date', label: 'Data', type: 'date', required: true },
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
      <div><label>Data *</label><input type="date" name="date" required></div>
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
  return `<div class="page-head"><div><h1>Vendas</h1><p>${perLabel()}</p></div>${allMode() ? '' : '<a class="btn" href="#/saida">+ Nova venda</a>'}</div>
  <div class="row" style="margin-bottom:14px">${locSel()}${periodSel()}</div>
  <div class="row" style="margin-bottom:14px"><input style="max-width:260px" placeholder="Buscar cliente ou produto…" value="${esc(ui.vq || '')}" data-on="vq">${sel('vtype', db.saleTypes, 'Todos os tipos')}${sel('vpay', db.paymentMethods, 'Todos os pagamentos')}</div>
  <div class="grid g4" style="margin-bottom:14px"><div class="kpi gold"><div class="l">Total vendido</div><div class="v">${brl(total)}</div></div><div class="kpi"><div class="l">Vendas</div><div class="v">${S.length}</div></div>
  <div class="kpi"><div class="l">Ticket médio</div><div class="v">${brl(S.length ? total / S.length : 0)}</div></div><div class="kpi ok"><div class="l">Lucro bruto</div><div class="v">${brl(lucro)}</div></div></div>
  <div class="tw"><table><thead><tr><th>Data</th><th>Cliente</th><th>Itens</th><th>Tipo</th><th>Pagamento</th><th>Estoque</th><th class="num">Total</th><th class="num">Lucro</th><th></th></tr></thead><tbody>
  ${S.length ? S.map(s => `<tr><td>${fdate(s.date)}</td><td>${esc(cust(s.customerId)?.name || '—')}</td><td>${esc(saleItemsText(s))}</td><td>${esc(byId(db.saleTypes, s.typeId)?.name || '—')}</td><td>${esc(byId(db.paymentMethods, s.paymentId)?.name || '—')}</td><td><span class="pill">${esc(locName(locOf(s)))}</span></td>
  <td class="num"><b>${brl(s.total)}</b></td><td class="num">${brl(s.total - saleCost(s))}</td><td class="act"><button class="btn danger sm" data-act="delSale" data-id="${s.id}">Excluir</button></td></tr>`).join('') : `<tr><td colspan="9" class="empty">Nenhuma venda encontrada.</td></tr>`}</tbody></table></div>`;
}

/* =========================================================
   ETIQUETAS (branca, logo em preto, descrição, tamanho e valor)
   ========================================================= */
const LBL_FORMATS = { '34x68': ['Tag 34 × 68 mm · 3 colunas', 34, 68], '60x40': ['Rolo 60 × 40 mm', 60, 40], '50x30': ['Rolo 50 × 30 mm', 50, 30], a4: ['Folha A4 (3 colunas · 66 × 34 mm)', 66, 34] };

/* Código de barras Code 128 (padrão que qualquer leitor lê). Padrões: largura das barras/espaços de cada símbolo. */
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232'];
function code128(text) {
  const codes = [104]; let chk = 104, n = 0;
  for (const ch of String(text)) { const v = ch.charCodeAt(0) - 32; if (v < 0 || v > 95) continue; n++; codes.push(v); chk += v * n; }
  codes.push(chk % 103);
  let w = codes.map(c => C128[c]).join('') + '2331112';
  return w.split('').map(Number);
}
/* SVG do código de barras: cada módulo tem 0,25 mm (2 pontos numa impressora de 203 dpi) */
function barcodeSVG(text, hmm, Q = 10) {
  const widths = code128(text), total = widths.reduce((a, b) => a + b, 0) + Q * 2;
  let x = Q, rects = '';
  widths.forEach((w, k) => { if (k % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="1"/>`; x += w; });
  return `<svg class="lbl-bar" viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges" style="width:${(total * 0.25).toFixed(1)}mm;height:${hmm}mm">${rects}</svg>`;
}
const lblGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
function labelHTML(p, price, fmt, o = {}) {
  const bar = o.bar !== false, foot = (o.foot || '').trim();
  const desc = [p.name, p.color].filter(Boolean).join(' · ');
  if (fmt === '34x68') {
    /* tag em duas partes separadas por picote: parte de cima (descrição e preço) e parte de baixo (controle com código de barras) */
    const h1 = Math.min(60, Math.max(20, num(o.h1) || 45)), cw = labelCW(o), narrow = cw < 34;
    return `<div class="lbl f34x68${narrow ? ' narrow' : ''}" style="--h1:${h1}mm;width:${cw}mm"><div class="tg-top"><img class="lbl-logo" src="logo-black.svg" alt="Zium Fitness">
      <div class="lbl-name">${esc(desc)}</div><div class="tg-mid">${p.size ? `<div class="lbl-size">TAM ${esc(p.size)}</div>` : ''}<div class="lbl-price">${brl(price)}</div></div>${foot ? `<div class="lbl-foot">${esc(foot)}</div>` : ''}</div>
      <div class="tg-cut"></div>
      <div class="tg-bot">${bar ? `${barcodeSVG(p.sku, 8, narrow ? 0 : 4)}<div class="lbl-code">${esc(p.sku)}</div>` : `<div class="lbl-code">${esc(p.sku)}</div>`}<div class="tg-bmeta">${p.size ? 'TAM ' + esc(p.size) : ''}<b>${brl(price)}</b></div></div></div>`;
  }
  const bh = fmt === '60x40' ? 9 : 6.5;
  return `<div class="lbl f${fmt}${bar ? ' wb' : ''}"><img class="lbl-logo" src="logo-black.svg" alt="Zium Fitness">
    <div class="lbl-name">${esc(desc)}</div>${bar ? '' : `<div class="lbl-sub">${esc(p.tipo || '')}</div>`}
    ${bar ? `<div class="lbl-barbox">${barcodeSVG(p.sku, bh)}<div class="lbl-code">${esc(p.sku)}</div></div>` : ''}
    <div class="lbl-row"><div class="lbl-size">${p.size ? 'TAM ' + esc(p.size) : ''}</div><div class="lbl-price">${brl(price)}</div></div>
    ${bar ? '' : `<div class="lbl-sku">${esc(p.sku)}</div>`}${foot ? `<div class="lbl-foot">${esc(foot)}</div>` : ''}</div>`;
}
const lblOpts = () => ({ bar: $('#lblBar') ? $('#lblBar').checked : true, foot: $('#lblFoot') ? $('#lblFoot').value : '', h1: $('#lblH1') ? num($('#lblH1').value) : 45, rot: $('#lblRot') ? $('#lblRot').value : '0', cols: $('#lblCols') ? +$('#lblCols').value : 3, pw: $('#lblPW') ? num($('#lblPW').value) || 100 : 100, pdfrot: $('#lblPDFRot') ? $('#lblPDFRot').value : '0', pdfmode: $('#lblPDFMode') ? $('#lblPDFMode').value : 'tall140', dy: $('#lblDY') ? num($('#lblDY').value) : 1, dy1: $('#lblDY1') ? num($('#lblDY1').value) : -4.5, vp: $('#lblVP') ? num($('#lblVP').value) || 72 : 72, gap: $('#lblGap') ? num($('#lblGap').value) : 2, ml: $('#lblML') ? num($('#lblML').value) : 0 });
function openLabels(pid, qty, price) {
  const p = prod(pid); if (!p) return;
  const fmt = ui.lblFmt || lblGet('zium_lbl_fmt', '34x68'), h1 = lblGet('zium_lbl_h1', '45'), gap = lblGet('zium_lbl_gap', '2'), ml = lblGet('zium_lbl_ml', '0'), rot = lblGet('zium_lbl_rot', '0'), cols = lblGet('zium_lbl_cols', '3'), pwid = lblGet('zium_lbl_pw', '100'), pdfrot = lblGet('zium_lbl_pdfrot2', '0'), pdfmode = lblGet('zium_lbl_pdfmode2', 'tall140'), dyv = lblGet('zium_lbl_dy2', '1'), dy1v = lblGet('zium_lbl_dy1c', '-4.5'), vpv = lblGet('zium_lbl_vp', '72'), val = price != null && price !== '' ? price : p.sellPrice, foot = lblGet('zium_lbl_foot', ''), bar = lblGet('zium_lbl_bar', '1') === '1';
  ui.lbl = { pid };
  openModal(`<h2>Etiquetas</h2><div class="muted" style="margin-bottom:12px">${esc(prodLabel(p))}</div>
    <div class="fgrid"><div><label>Quantidade de etiquetas</label><input type="number" id="lblQty" min="1" max="500" value="${Math.max(1, Math.round(qty) || 1)}"></div>
    <div><label>Formato</label><select id="lblFmt" data-on="lblPrev">${Object.entries(LBL_FORMATS).map(([k, v]) => `<option value="${k}" ${k === fmt ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
    <div><label>Valor na etiqueta (R$)</label><input type="number" id="lblPrice" min="0" step="0.01" value="${val}" data-on="lblPrev"></div>
    <div><label>Texto no rodapé <span class="muted">(opcional)</span></label><input id="lblFoot" value="${esc(foot)}" placeholder="@seuinstagram ou site" data-on="lblPrev"></div>
    <div class="full"><label class="chk"><input type="checkbox" id="lblBar" ${bar ? 'checked' : ''} data-on="lblPrev"> Código de barras (o SKU, para ler com leitor)</label></div></div>
    <div id="lblAdv" class="fgrid" style="margin-top:12px;${fmt === '34x68' ? '' : 'display:none'}">
      <div><label>Altura da parte de cima (mm)</label><input type="number" id="lblH1" min="20" max="60" step="1" value="${h1}" data-on="lblPrev"></div>
      <div><label>Largura máxima da impressora (mm)</label><input type="number" id="lblPW" min="40" max="110" step="1" value="${pwid}" data-on="lblPrev"></div>
      <div><label>Etiquetas por linha (colunas)</label><select id="lblCols" data-on="lblPrev"><option value="3" ${cols === '3' ? 'selected' : ''}>3 colunas (bobina inteira)</option><option value="2" ${cols === '2' ? 'selected' : ''}>2 colunas</option><option value="1" ${cols === '1' ? 'selected' : ''}>1 coluna</option></select></div>
      <div><label>Espaço entre as colunas (mm)</label><input type="number" id="lblGap" min="0" max="10" step="0.5" value="${gap}" data-on="lblPrev"></div>
      <div><label>Margem esquerda da bobina (mm)</label><input type="number" id="lblML" min="-5" max="10" step="0.5" value="${ml}" data-on="lblPrev"></div>
      <div style="grid-column:1/-1"><label>Página do PDF <span class="muted">(precisa combinar com o papel escolhido na impressão)</span></label><select id="lblPDFMode" data-on="lblPrev"><option value="tall140" ${pdfmode === 'tall140' ? 'selected' : ''}>Em pé 100 × 140 mm (2 linhas exatas, recomendado)</option><option value="tall150" ${pdfmode === 'tall150' ? 'selected' : ''}>Em pé 100 × 150 mm (papel antigo do driver)</option><option value="land" ${pdfmode === 'land' ? 'selected' : ''}>Deitada 100 × 68 mm (1 linha)</option></select></div>
      <div><label>Descer o conteúdo (mm)</label><input type="number" id="lblDY" min="-10" max="30" step="0.5" value="${dyv}" data-on="lblPrev"></div>
      <div><label>Descer só a 1ª linha (mm)</label><input type="number" id="lblDY1" min="-10" max="30" step="0.5" value="${dy1v}" data-on="lblPrev"></div>
      <div><label>Passo entre as linhas (mm)</label><input type="number" id="lblVP" min="60" max="80" step="0.5" value="${vpv}" data-on="lblPrev"></div>
      <div style="grid-column:1/-1"><label>Giro do PDF <span class="muted">(use 180° se sair de cabeça para baixo)</span></label><select id="lblPDFRot" data-on="lblPrev"><option value="0" ${pdfrot === '0' ? 'selected' : ''}>Sem giro</option><option value="180" ${pdfrot === '180' ? 'selected' : ''}>180° (de cabeça para baixo)</option></select></div>
      <div style="grid-column:1/-1"><label>Giro da impressão direta <span class="muted">(modo antigo, só se não usar o PDF)</span></label><select id="lblRot" data-on="lblPrev"><option value="0" ${rot === '0' ? 'selected' : ''}>Sem giro (normal)</option><option value="90" ${rot === '90' ? 'selected' : ''}>Girar 90° para a direita</option><option value="180" ${rot === '180' ? 'selected' : ''}>Girar 180° (de cabeça para baixo)</option><option value="-90" ${rot === '-90' ? 'selected' : ''}>Girar 90° para a esquerda</option></select></div>
      <div class="muted sm" id="lblW" style="grid-column:1/-1"></div></div>
    <div class="lbl-prev" id="lblPrev">${labelHTML(p, val, fmt, { bar, foot, h1 })}</div>
    <div class="muted sm" style="margin-top:8px">Etiqueta branca com a logo em preto. Na janela de impressão, escolha a impressora de etiquetas e deixe a escala em 100%.</div>
    <div class="foot"><button type="button" class="btn ghost" data-act="closeModal">Fechar</button><button type="button" class="btn ghost" data-act="printLabels" title="Modo antigo, direto pela página">Imprimir direto</button><button type="button" class="btn" data-act="printLabelsPDF">Imprimir pelo PDF</button></div>`);
  ON.lblPrev();
}
/* largura útil de cada etiqueta: se a impressora imprime menos que a bobina (ex.: 100 mm), o conteúdo de cada coluna encolhe e fica centralizado na etiqueta de 34 mm */
function labelCW(o) { const c = o.cols || 3, P = o.pw || 100; return Math.max(20, Math.min(34, P - (c - 1) * (34 + (o.gap || 0)))); }
/* ---------- PDF das etiquetas (caminho de impressão que a impressora de 100 mm entende) ---------- */
async function loadJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF;
  await new Promise((res, rej) => { const el = document.createElement('script'); el.src = 'jspdf.min.js'; el.onload = res; el.onerror = () => rej(new Error('Não consegui carregar o gerador de PDF.')); document.head.appendChild(el); });
  return window.jspdf.jsPDF;
}
function logoPNG() {
  return new Promise((res, rej) => {
    const img = new Image(), W = 1000, H = Math.round(W * 948.7 / 1687.72);
    img.onload = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(img, 0, 0, W, H); res(c.toDataURL('image/png')); };
    img.onerror = () => rej(new Error('Não consegui carregar a logo.'));
    img.src = 'logo-black.svg';
  });
}
/* quebra de linha só em espaços e depois de "/" (nunca no meio da palavra) */
function pdfWrap(doc, text, maxW) {
  const pieces = []; text.split(' ').forEach(w => { const parts = w.split('/'); parts.forEach((x, i) => pieces.push({ t: i < parts.length - 1 ? x + '/' : x, glue: i > 0 })); pieces.push({ sp: true }); });
  const lines = []; let cur = '';
  for (const pc of pieces) {
    if (pc.sp) { cur += ' '; continue; }
    const test = cur + pc.t;
    if (cur.trim() && doc.getTextWidth(test.trimEnd()) > maxW && !(pc.glue && false)) { lines.push(cur.trimEnd()); cur = pc.t; } else cur = test;
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines;
}
const pdfTxt = t => String(t == null ? '' : t).replace(/ /g, ' ');
async function buildLabelsPDF(p, price, o, n) {
  const jsPDF = await loadJsPDF(), logo = await logoPNG();
  const cols = o.cols || 3, cw = labelCW(o), pw = labelPageW(o), rows = Math.ceil(n / cols), pitch = 34 + (o.gap || 0);
  const mode = o.pdfmode || 'land', tall = mode !== 'land', H = mode === 'tall140' ? 140 : mode === 'tall150' ? 150 : 68, rowsPer = tall ? 2 : 1, VP = num(o.vp) || 72, DY = num(o.dy) || 0, DY1 = num(o.dy1) || 0, orient = tall ? 'portrait' : 'landscape';
  const h1 = Math.min(60, Math.max(20, num(o.h1) || 45)), ml = o.ml || 0, rot = o.pdfrot === '180';
  const doc = new jsPDF({ orientation: orient, unit: 'mm', format: [pw, H] }), k = doc.internal.scaleFactor;
  doc.setFillColor(0, 0, 0); doc.setDrawColor(0, 0, 0); doc.setTextColor(0, 0, 0);
  const desc = [p.name, p.color].filter(Boolean).join(' · ').toUpperCase(), price_ = pdfTxt(brl(price)), foot = (o.foot || '').trim();
  const widths = o.bar !== false ? code128(p.sku) : null, modules = widths ? widths.reduce((a, b) => a + b, 0) : 0, bw = modules * 0.25;
  const label = x0 => {
    const cx = x0 + cw / 2, narrow = cw < 34;
    doc.addImage(logo, 'PNG', cx - 5.34, 8.5, 10.68, 6.0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(narrow ? 6.8 : 7.5);
    pdfWrap(doc, pdfTxt(desc), cw - 2.4).slice(0, 3).forEach((ln, i) => doc.text(ln, cx, 18.5 + i * 2.8, { align: 'center' }));
    if (p.size) { doc.setLineWidth(0.35); doc.roundedRect(cx - 8, 29.2, 16, 5.8, 1.2, 1.2, 'S'); doc.setFontSize(9); doc.text('TAM ' + pdfTxt(p.size), cx, 33.4, { align: 'center' }); }
    doc.setFontSize(narrow ? 12.5 : 14); doc.text(price_, cx, 41.2, { align: 'center' });
    if (foot) { doc.setFont('helvetica', 'normal'); doc.setFontSize(5); doc.text(pdfTxt(foot), cx, 44.2, { align: 'center' }); }
    if (widths) {
      let x = cx - bw / 2; widths.forEach((w, i) => { if (i % 2 === 0) doc.rect(x, 47, w * 0.25, 8, 'F'); x += w * 0.25; });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.text(pdfTxt(p.sku), cx, 57.0, { align: 'center' });
    } else { doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.text(pdfTxt(p.sku), cx, 50, { align: 'center' }); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.text(p.size ? 'TAM ' + pdfTxt(p.size) : '', x0 + 1, 61.0);
    doc.setFontSize(8.5); doc.text(price_, x0 + cw - 1, 61.0, { align: 'right' });
  };
  const pages = Math.ceil(rows / rowsPer);
  for (let pg = 0; pg < pages; pg++) {
    if (pg > 0) doc.addPage([pw, H], orient);
    if (rot) doc.internal.write(`q -1 0 0 -1 ${(pw * k).toFixed(3)} ${(H * k).toFixed(3)} cm`);
    for (let ri = 0; ri < rowsPer; ri++) {
      const r = pg * rowsPer + ri; if (r >= rows) break;
      doc.internal.write(`q 1 0 0 1 0 ${(-(DY + ri * VP + (ri === 0 ? DY1 : 0)) * k).toFixed(3)} cm`);
      for (let c = 0; c < Math.min(cols, n - r * cols); c++) label(ml + c * pitch);
      doc.internal.write('Q');
    }
    if (rot) doc.internal.write('Q');
  }
  return doc;
}
async function printLabelsPDF() {
  const p = prod((ui.lbl || {}).pid); if (!p) return;
  const n = Math.max(1, Math.min(500, parseInt($('#lblQty').value) || 1)), price = num($('#lblPrice').value), o = lblOpts();
  try { for (const [k, v] of Object.entries({ zium_lbl_foot: o.foot, zium_lbl_bar: o.bar ? '1' : '0', zium_lbl_h1: o.h1, zium_lbl_gap: o.gap, zium_lbl_ml: o.ml, zium_lbl_cols: o.cols, zium_lbl_pw: o.pw, zium_lbl_pdfrot2: o.pdfrot, zium_lbl_pdfmode2: o.pdfmode, zium_lbl_dy2: o.dy, zium_lbl_dy1c: o.dy1, zium_lbl_vp: o.vp })) localStorage.setItem(k, v); } catch { }
  try {
    const doc = await buildLabelsPDF(p, price, o, n), url = URL.createObjectURL(doc.output('blob'));
    if (!window.open(url, '_blank')) doc.save(`etiquetas-${p.sku}.pdf`);
    toast('PDF aberto em outra aba: aperte Ctrl + P para imprimir.');
  } catch (e) { toast(e.message || 'Não consegui gerar o PDF.', true); }
}
function labelPageW(o) { const c = o.cols || 3; return (c - 1) * (34 + (o.gap || 0)) + labelCW(o) + 2 * (o.ml || 0); }
function printLabels() {
  const p = prod((ui.lbl || {}).pid); if (!p) return;
  const n = Math.max(1, Math.min(500, parseInt($('#lblQty').value) || 1)), fmt = $('#lblFmt').value, price = num($('#lblPrice').value), o = lblOpts();
  ui.lblFmt = fmt;
  try { for (const [k, v] of Object.entries({ zium_lbl_foot: o.foot, zium_lbl_bar: o.bar ? '1' : '0', zium_lbl_fmt: fmt, zium_lbl_h1: o.h1, zium_lbl_gap: o.gap, zium_lbl_ml: o.ml, zium_lbl_rot: o.rot, zium_lbl_cols: o.cols, zium_lbl_pw: o.pw })) localStorage.setItem(k, v); } catch { }
  const [, w, h] = LBL_FORMATS[fmt], pw = fmt === '34x68' ? labelPageW(o) : w, rot = fmt === '34x68' ? o.rot : '0';
  let st = $('#lblpage'); if (!st) { st = document.createElement('style'); st.id = 'lblpage'; document.head.appendChild(st); }
  st.textContent = fmt === 'a4' ? '@page{size:A4;margin:8mm}' : (rot === '90' || rot === '-90') ? `@page{size:${h}mm ${pw}mm;margin:0}` : `@page{size:${pw}mm ${h}mm;margin:0}`;
  let box = $('#labels'); if (!box) { box = document.createElement('div'); box.id = 'labels'; document.body.appendChild(box); }
  box.className = 'fmt-' + fmt;
  if (fmt === '34x68') {
    const cols = o.cols || 3, rows = Math.ceil(n / cols);
    const tr = rot === '90' ? `translate(${h}mm,0) rotate(90deg)` : `translate(0,${pw}mm) rotate(-90deg)`;
    box.innerHTML = Array.from({ length: rows }, (_, r) => {
      const row = `<div class="lbl-pg" style="width:${pw}mm;height:${h}mm;padding-left:${o.ml}mm;gap:${34 + o.gap - labelCW(o)}mm${rot === '180' ? ';transform:rotate(180deg)' : (rot === '90' || rot === '-90') ? `;position:absolute;top:0;left:0;transform-origin:0 0;transform:${tr}` : ''}">${Array.from({ length: Math.min(cols, n - r * cols) }, () => labelHTML(p, price, fmt, o)).join('')}</div>`;
      return (rot === '90' || rot === '-90') ? `<div class="lbl-rotwrap" style="width:${h}mm;height:${pw}mm">${row}</div>` : row;
    }).join('');
  } else box.innerHTML = Array.from({ length: n }, () => labelHTML(p, price, fmt, o)).join('');
  document.body.classList.add('print-labels');
  const done = () => { document.body.classList.remove('print-labels'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 120);
}

/* =========================================================
   DESPESAS OPERACIONAIS
   ========================================================= */
function viewDespesas() {
  const rg = range(ui.per);
  const X = db.expenses.filter(e => inRange(e.date, rg) && (!ui.xcat || e.categoryId === ui.xcat)).sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
  const total = sum(X, e => e.value);
  const byCat = {}; for (const e of X) byCat[e.categoryId] = (byCat[e.categoryId] || 0) + e.value;
  const catRows = Object.entries(byCat).map(([k, v]) => [(byId(db.expenseCategories, k) || {}).name || '—', v]).sort((a, b) => b[1] - a[1]);
  const fields = [
    { name: 'date', label: 'Data', type: 'date', required: true },
    { name: 'categoryId', label: 'Categoria', type: 'select', required: true, blank: 'Selecione…', options: () => optsOf(db.expenseCategories), quick: 'expenseCategories', default: ui.lastXcat || '' },
    { name: 'value', label: 'Valor (R$)', type: 'number', min: 0, step: 0.01, required: true },
    { name: 'paymentId', label: 'Forma de pagamento', type: 'select', blank: '—', options: () => optsOf(db.paymentMethods) },
    { name: 'supplierId', label: 'Fornecedor / prestador', type: 'select', blank: '—', options: () => optsOf(db.suppliers), quick: 'suppliers' },
    { name: 'description', label: 'Descrição', ph: 'Ex.: frete da Atacado Fit, anúncio no Instagram…', full: true }
  ];
  const catSel = `<select style="width:auto" data-on="xcat"><option value="">Todas as categorias</option>${db.expenseCategories.map(c => `<option value="${c.id}" ${ui.xcat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
  return `<div class="page-head"><div><h1>Despesas operacionais</h1><p>Frete, embalagens, tráfego pago, gasolina e outros gastos do negócio. Entram no resultado do dashboard.</p></div></div>
  ${allMode() ? noticeAll() : `<form class="card" data-form="expense">${fieldsHTML(fields)}<div class="row" style="margin-top:18px"><button class="btn">Registrar despesa</button></div></form>`}
  <div class="page-head" style="margin-top:28px"><h2>Despesas do período</h2><div class="row">${catSel}${periodSel()}</div></div>
  <div class="grid g3" style="margin-bottom:14px"><div class="kpi bad"><div class="l">Total de despesas</div><div class="v">${brl(total)}</div><div class="s">${X.length} lançamento(s)</div></div>
    <div class="card" style="grid-column:span 2"><h3>Por categoria</h3>${hbars(catRows)}</div></div>
  <div class="tw"><table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Pagamento</th>${allMode() ? '<th>Empresa</th>' : ''}<th class="num">Valor</th><th></th></tr></thead><tbody>
  ${X.length ? X.map(e => `<tr><td>${fdate(e.date)}</td><td><span class="pill">${esc((byId(db.expenseCategories, e.categoryId) || {}).name || '—')}</span></td><td>${esc(e.description || '—')}${e.supplierId ? `<div class="muted sm">${esc((sup(e.supplierId) || {}).name || '')}</div>` : ''}</td><td>${esc((byId(db.paymentMethods, e.paymentId) || {}).name || '—')}</td>${allMode() ? `<td><span class="pill">${esc(coShort(e.companyId))}</span></td>` : ''}<td class="num"><b>${brl(e.value)}</b></td><td class="act"><button class="btn danger sm" data-act="delExpense" data-id="${e.id}">Excluir</button></td></tr>`).join('')
    : `<tr><td colspan="${allMode() ? 7 : 6}" class="empty">Nenhuma despesa no período.</td></tr>`}</tbody></table></div>`;
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
  expenseCategories: {
    title: 'Categorias de despesa', one: 'categoria de despesa', list: () => db.expenseCategories,
    fields: () => [{ name: 'name', label: 'Nome', required: true, ph: 'Frete, Embalagens, Tráfego pago…' }, { name: 'active', label: 'Ativo', type: 'checkbox', default: true }],
    cols: [['Categoria', x => `<b>${esc(x.name)}</b>`], ['Lançamentos', x => String(allOf('expenses').filter(e => e.categoryId === x.id).length), 'num'], ['Status', x => x.active === false ? '<span class="pill">inativo</span>' : '<span class="pill ok">ativo</span>']], search: x => x.name
  },
  companies: {
    title: 'Empresas', one: 'empresa', list: () => db.companies, admin: true,
    fields: () => [{ name: 'name', label: 'Nome da empresa', required: true, ph: 'Empresa Natal' }, { name: 'active', label: 'Ativa', type: 'checkbox', default: true }],
    cols: [['Empresa', x => `<b>${esc(x.name)}</b>`], ['Produtos', x => String((STORE.byCompany[x.id] || { products: [] }).products.length), 'num'], ['Vendas', x => String((STORE.byCompany[x.id] || { sales: [] }).sales.length), 'num'], ['Status', x => x.active === false ? '<span class="pill">inativa</span>' : '<span class="pill ok">ativa</span>']], search: x => x.name
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
const SCOPED_KINDS = ['products', 'customers', 'suppliers', 'locations'];
const CAD_ORDER = ['products', 'customers', 'suppliers', 'locations', 'paymentMethods', 'saleTypes', 'expenseCategories', 'companies', 'users', 'system'];

function viewCadastros() {
  const tabs = CAD_ORDER.filter(k => isAdmin() || !['users', 'system', 'companies'].includes(k)).map(k => [k, k === 'system' ? 'Backup e sistema' : SCHEMA[k].title]);
  if (!tabs.find(t => t[0] === ui.cadTab)) ui.cadTab = 'products';
  const head = `<div class="page-head"><div><h1>Cadastros</h1><p>Produtos, clientes, fornecedores, locais, pagamentos, tipos de venda, categorias de despesa, empresas e usuários.</p></div></div>
    <div class="tabs">${tabs.map(([k, t]) => `<button data-act="cadTab" data-k="${k}" class="${ui.cadTab === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  if (ui.cadTab === 'system') return head + viewSistema();
  const sc = SCHEMA[ui.cadTab], q = norm(ui.cq || ''), showCo = allMode() && SCOPED_KINDS.includes(ui.cadTab);
  const rows = sc.list().filter(x => !q || norm(sc.search(x)).includes(q)).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  return head + `<div class="row" style="justify-content:space-between;margin-bottom:14px"><input style="max-width:280px" placeholder="Buscar…" value="${esc(ui.cq || '')}" data-on="cq">${showCo ? '' : `<button class="btn" data-act="newRec">+ Novo ${sc.one}</button>`}</div>
  <div class="tw"><table><thead><tr>${showCo ? '<th>Empresa</th>' : ''}${sc.cols.map(c => `<th class="${c[2] || ''}">${c[0]}</th>`).join('')}<th></th></tr></thead><tbody>
  ${rows.length ? rows.map(x => `<tr class="${x.active === false ? 'muted' : ''}">${showCo ? `<td><span class="pill">${esc(coShort(x.companyId))}</span></td>` : ''}${sc.cols.map(c => `<td class="${c[2] || ''}">${c[1](x)}</td>`).join('')}<td class="act">${ui.cadTab === 'customers' ? `<button class="btn sm" data-act="custHist" data-id="${x.id}">Histórico</button> ` : ''}${showCo ? '' : `<button class="btn ghost sm" data-act="editRec" data-id="${x.id}">Editar</button> <button class="btn danger sm" data-act="delRec" data-id="${x.id}">Excluir</button>`}</td></tr>`).join('') : `<tr><td colspan="${sc.cols.length + (showCo ? 2 : 1)}" class="empty">Nada cadastrado ainda.</td></tr>`}</tbody></table></div>`;
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
    if (kind === 'companies' && !cur) ensureCompanyData(rec);
  }
  save(); return null;
}
function usedBy(kind, id) {
  switch (kind) {
    case 'products': return db.entries.some(x => x.productId === id) || db.sales.some(s => s.items.some(i => i.productId === id)) || db.transfers.some(x => x.productId === id) || db.orders.some(x => x.productId === id);
    case 'suppliers': return db.products.some(x => x.supplierId === id) || db.entries.some(x => x.supplierId === id) || db.orders.some(x => x.supplierId === id);
    case 'locations': return db.entries.some(x => x.locationId === id) || db.sales.some(x => x.locationId === id) || db.transfers.some(x => x.fromId === id || x.toId === id) || db.orders.some(x => x.locationId === id) || db.locations.length <= 1;
    case 'paymentMethods': return allOf('sales').some(x => x.paymentId === id) || allOf('expenses').some(x => x.paymentId === id);
    case 'saleTypes': return allOf('sales').some(x => x.typeId === id);
    case 'expenseCategories': return allOf('expenses').some(x => x.categoryId === id);
    case 'companies': return true;
    case 'customers': return db.sales.some(x => x.customerId === id);
    default: return false;
  }
}

/* =========================================================
   RELATÓRIOS
   ========================================================= */
/* com "Todas as empresas", acrescenta a coluna Empresa */
const coCols = (res, cos) => allMode() && STORE.companies.length > 1 ? { ...res, head: ['Empresa', ...res.head], types: ['t', ...res.types], rows: res.rows.map((r, i) => [coShort(cos[i]), ...r]), totals: res.totals ? ['', ...res.totals] : undefined } : res;
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
      return { head: ['SKU', 'Tipo', 'Produto', 'Fornecedor', ...locs.map(l => locName(l.id)), ...(locs.length > 1 ? ['Total'] : []), 'Custo un.', 'Venda un.', 'Total custo', 'Total venda', 'Situação'],
        types: ['t', 't', 't', 't', ...Array(nq).fill('i'), 'm', 'm', 'm', 'm', 't'], rows,
        totals: ['Total', '', '', '', ...Array.from({ length: nq }, (_, k) => sum(rows, r => r[4 + k])), '', '', sum(rows, r => r[pos + 2]), sum(rows, r => r[pos + 3]), ''] };
    }],
    reposicao: ['Reposição / ponto de pedido', false, () => {
      const PL = db.products.filter(p => p.active !== false).sort((a, b) => a.name.localeCompare(b.name));
      const rows = PL.map(p => { const q = sm[p.id] || 0, r = reorder(p, q); return [p.sku, prodShort(p), sup(p.supplierId)?.name || '', q, +r.avg.toFixed(2), r.lead, r.rop, r.pendQty, r.st === 'ok' ? 0 : r.suggest, ST[r.st][1]]; });
      return coCols({ head: ['SKU', 'Produto', 'Fornecedor', 'Estoque', 'Venda/dia', 'Prazo (d)', 'Pto. pedido', 'Pedido a caminho', 'Sugestão de compra', 'Situação'], types: ['t', 't', 't', 'i', 'n', 'i', 'i', 'i', 'i', 't'], rows }, PL.map(p => p.companyId));
    }],
    vendas: ['Vendas do período', true, () => {
      const rows = S.map(s => [s.date, byId(db.saleTypes, s.typeId)?.name || '', cust(s.customerId)?.name || '', byId(db.paymentMethods, s.paymentId)?.name || '', locName(locOf(s)), saleItemsText(s), saleQty(s), s.total, saleCost(s), s.total - saleCost(s)]);
      return { head: ['Data', 'Tipo de venda', 'Cliente', 'Pagamento', 'Estoque', 'Itens', 'Qtd', 'Total', 'Custo', 'Lucro'], types: ['d', 't', 't', 't', 't', 't', 'i', 'm', 'm', 'm'], rows, totals: ['Total', '', '', '', '', '', sum(rows, r => r[6]), sum(rows, r => r[7]), sum(rows, r => r[8]), sum(rows, r => r[9])] };
    }],
    produtos: ['Vendas por produto', true, () => {
      const m = {}; for (const s of S) for (const i of s.items) { const x = m[i.productId] = m[i.productId] || [0, 0, 0]; x[0] += i.qty; x[1] += i.qty * i.price; x[2] += i.qty * i.cost; }
      const rows = Object.entries(m).map(([id, [q, v, c]]) => [prod(id)?.sku || '', prodShort(prod(id)) + (allMode() && prod(id) ? ' · ' + coShort(prod(id).companyId) : ''), q, v, c, v - c]).sort((a, b) => b[3] - a[3]);
      return { head: ['SKU', 'Produto', 'Qtd vendida', 'Receita', 'Custo', 'Lucro'], types: ['t', 't', 'i', 'm', 'm', 'm'], rows, totals: ['Total', '', sum(rows, r => r[2]), sum(rows, r => r[3]), sum(rows, r => r[4]), sum(rows, r => r[5])] };
    }],
    fornecedor: ['Acerto por fornecedor', true, () => {
      const m = {}; for (const s of S) for (const i of s.items) { const k = prod(i.productId)?.supplierId || ''; const x = m[k] = m[k] || [0, 0, 0]; x[0] += i.qty; x[1] += i.qty * i.cost; x[2] += i.qty * i.price; }
      const rows = Object.entries(m).map(([k, [q, c, v]]) => [(sup(k)?.name || '(sem fornecedor)') + (allMode() && sup(k) ? ' · ' + coShort(sup(k).companyId) : ''), q, c, v, v - c]).sort((a, b) => b[2] - a[2]);
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
      const CL = db.customers.slice().sort((a, b) => a.name.localeCompare(b.name));
      const rows = CL.map(c => { const ss = db.sales.filter(s => s.customerId === c.id); return [c.name, c.phone, c.birthday ? fdate(c.birthday).slice(0, 5) : '', ss.length, sum(ss, s => s.total), ss.map(s => s.date).sort().pop() || '']; });
      return coCols({ head: ['Cliente', 'Telefone', 'Aniversário', 'Compras', 'Total gasto', 'Última compra'], types: ['t', 't', 't', 'i', 'm', 'd'], rows }, CL.map(c => c.companyId));
    }],
    despesas: ['Despesas operacionais', true, () => {
      const L = db.expenses.filter(e => inRange(e.date, R)).sort((a, b) => a.date.localeCompare(b.date));
      const rows = L.map(e => [e.date, (byId(db.expenseCategories, e.categoryId) || {}).name || '', e.description || '', (sup(e.supplierId) || {}).name || '', (byId(db.paymentMethods, e.paymentId) || {}).name || '', e.value]);
      return coCols({ head: ['Data', 'Categoria', 'Descrição', 'Fornecedor', 'Pagamento', 'Valor'], types: ['d', 't', 't', 't', 't', 'm'], rows, totals: ['Total', '', '', '', '', sum(rows, r => r[5])] }, L.map(e => e.companyId));
    }],
    resultado: ['Resultado (vendas − despesas)', true, () => {
      const m = {}, slot = (date, cid) => { const mo = date.slice(0, 7), k = (allMode() ? cid + '|' : '') + mo; return m[k] = m[k] || { mo, co: cid, v: 0, c: 0, x: 0 }; };
      for (const sl of S) { const o = slot(sl.date, sl.companyId); o.v += sl.total; o.c += saleCost(sl); }
      for (const e of db.expenses.filter(e => inRange(e.date, R))) slot(e.date, e.companyId).x += e.value;
      const A = Object.values(m).sort((a, b) => a.mo.localeCompare(b.mo) || String(a.co).localeCompare(String(b.co)));
      const rows = A.map(o => [`${MESES[+o.mo.slice(5) - 1]}/${o.mo.slice(2, 4)}`, o.v, o.c, o.v - o.c, o.x, o.v - o.c - o.x]);
      return coCols({ head: ['Mês', 'Vendas', 'Custo das vendas', 'Lucro bruto', 'Despesas', 'Lucro líquido'], types: ['t', 'm', 'm', 'm', 'm', 'm'], rows, totals: ['Total', sum(rows, r => r[1]), sum(rows, r => r[2]), sum(rows, r => r[3]), sum(rows, r => r[4]), sum(rows, r => r[5])] }, A.map(o => o.co));
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
  labels(el) { if (needCo()) return; openLabels(el.dataset.pid, +el.dataset.qty || 1); },
  labelsEntry(el) { const e = db.entries.find(x => x.id === el.dataset.id); if (e) openLabels(e.productId, e.qty, e.sellPrice); },
  printLabels,
  printLabelsPDF,
  company(el) {
    ui.company = el.dataset.k; try { localStorage.setItem('zium_empresa', ui.company || 'todas'); } catch { }
    ui.loc = ''; ui.lastLoc = ''; ui.df = {}; ui.estq = ''; ui.cq = ''; ui.vq = ''; ui.vtype = ''; ui.vpay = ''; ui.xcat = '';
    ACT.closeMenu(); rerender();
  },
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
    if (needCo()) return;
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
  newOrder(el) { if (needCo()) return; orderModal(el.dataset.pid); },
  recvOrder(el) { const o = db.orders.find(o => o.id === el.dataset.id); ui.prefill = { productId: o.productId, qty: o.qty, orderId: o.id, locationId: o.locationId }; go('entrada'); },
  cancelOrder(el) { if (confirm('Cancelar este pedido?')) { db.orders.find(o => o.id === el.dataset.id).status = 'cancelado'; save(); rerender(); } },
  delEntry(el) {
    const e = db.entries.find(x => x.id === el.dataset.id), sm = stockMap(locOf(db.entries.find(x => x.id === el.dataset.id)));
    if ((sm[e.productId] || 0) - e.qty < 0 && !confirm('Excluir esta entrada deixa o estoque do produto negativo. Excluir mesmo assim?')) return;
    if (!confirm('Excluir esta entrada?')) return;
    db.entries = db.entries.filter(x => x.id !== e.id); save(); rerender();
  },
  delTransfer(el) { if (confirm('Excluir a transferência? A mercadoria volta para o estoque.')) { db.transfers = db.transfers.filter(x => x.id !== el.dataset.id); save(); rerender(); } },
  delExpense(el) { if (confirm('Excluir esta despesa?')) { db.expenses = db.expenses.filter(x => x.id !== el.dataset.id); save(); rerender(); toast('Despesa excluída.'); } },
  delSale(el) { if (confirm('Excluir esta venda? A mercadoria volta para o estoque.')) { db.sales = db.sales.filter(x => x.id !== el.dataset.id); save(); rerender(); toast('Venda excluída.'); } },
  newRec() { if (SCOPED_KINDS.includes(ui.cadTab) && needCo()) return; recModal(ui.cadTab); },
  editRec(el) { if (SCOPED_KINDS.includes(ui.cadTab) && needCo()) return; recModal(ui.cadTab, el.dataset.id); },
  delRec(el) {
    const kind = ui.cadTab, id = el.dataset.id;
    if (SCOPED_KINDS.includes(kind) && needCo()) return;
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
  backup() { downloadFile(`zium-backup-${today()}.json`, JSON.stringify(serialize(), null, 1), 'application/json'); },
  wipe() {
    if (prompt('Isso apaga TODOS os dados (menos usuários). Digite APAGAR para confirmar:') !== 'APAGAR') return;
    const flat = defaults(); flat.users = STORE.users; flat.companies = STORE.companies; hydrate(flat); save(); rerender(); toast('Dados apagados.');
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
  expense(f) {
    if (needCo()) return;
    const d = formData(f, [{ name: 'date' }, { name: 'categoryId' }, { name: 'value', type: 'number' }, { name: 'paymentId' }, { name: 'supplierId' }, { name: 'description' }]);
    if (!d.date) return toast('Escolha a data.', true);
    if (!d.categoryId) return toast('Escolha a categoria.', true);
    if (!(d.value > 0)) return toast('Informe o valor da despesa.', true);
    ui.lastXcat = d.categoryId;
    db.expenses.push({ id: uid(), at: Date.now(), date: d.date, categoryId: d.categoryId, value: d.value, paymentId: d.paymentId, supplierId: d.supplierId, description: d.description, userId: me.id });
    save(); rerender(); toast('Despesa registrada.');
  },
  entry(f, ev) {
    if (needCo()) return;
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
    const wantLabels = f.elements.labels && f.elements.labels.checked;
    if (ev.submitter && ev.submitter.dataset.again) { ui.prefill = null; rerender(); } else go('estoque');
    if (wantLabels) setTimeout(() => openLabels(d.productId, Math.round(d.qty), d.sellPrice), 200);
  },
  transfer(f) {
    if (needCo()) return;
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
    if (needCo()) return;
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
  lblPrev() {
    const p = prod((ui.lbl || {}).pid); if (!p) return;
    const fmt = $('#lblFmt').value, o = lblOpts();
    $('#lblPrev').innerHTML = labelHTML(p, num($('#lblPrice').value), fmt, o);
    const adv = $('#lblAdv'); if (adv) adv.style.display = fmt === '34x68' ? '' : 'none';
    const lw = $('#lblW'); if (lw) lw.innerHTML = `Cada linha tem ${o.cols || 3} etiqueta(s). O conteúdo de cada uma usa <b>${labelCW(o)} mm</b> de largura e a faixa enviada para a impressora tem <b>${labelPageW(o)} mm × 68 mm</b>. Cadastre esse papel no driver (largura ${labelPageW(o)}, altura 68). Cadastre esse papel no driver da impressora e ajuste espaço e margem depois do primeiro teste.`;
  },
  xcat(el) { ui.xcat = el.value; rerender(); },
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
        hydrate(d); save(); me = db.users.find(u => u.id === me?.id) || null; render(); toast('Backup restaurado.');
      } catch { toast('Arquivo de backup inválido.', true); }
    };
    r.readAsText(file);
  }
};
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
      if (!(j.api >= 2)) throw new Error('script-antigo');
      if (j.data && j.data.users && j.data.users.length) hydrate(j.data);
      await ensureAdmin(); cloudReady = true; save();
    } catch (e) {
      if (e.message === 'script-antigo') {
        $('#app').innerHTML = `<div class="login"><div class="login-card"><img src="logo.svg" alt="Zium Fitness"><p style="text-align:center"><b>Falta atualizar o Apps Script da planilha.</b></p><p class="muted sm" style="text-align:center">Esta versão do sistema (empresas e despesas) precisa do <b>Code.gs novo</b>. No Apps Script: <b>Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão → Implantar</b>. Depois recarregue esta página. Seus dados não foram alterados.</p><button class="btn block" onclick="location.reload()">Já atualizei, tentar de novo</button></div></div>`;
        return;
      }
      $('#app').innerHTML = `<div class="login"><div class="login-card"><img src="logo.svg" alt="Zium Fitness"><p style="text-align:center">Não consegui conectar na planilha.</p><p class="muted sm" style="text-align:center">Confira o endereço e o token em <b>config.js</b> e se a implantação do Apps Script está como "Qualquer pessoa".<br>(${esc(e.message)})</p><button class="btn block" onclick="location.reload()">Tentar de novo</button></div></div>`;
      return;
    }
  }
  await ensureAdmin();
  trackNav();
  const sid = localStorage.getItem(SES); me = db.users.find(u => u.id === sid && u.active !== false) || null;
  render();
})();
