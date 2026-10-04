/**
 * Zium Fitness · banco de dados em planilha Google.
 * Cada tabela do sistema vira uma aba. A coluna "_json" é a fonte de verdade:
 * as outras colunas são só para você ler/filtrar. Para alterar dados, use o sistema.
 */
const TOKEN = 'TROQUE-ESTE-TOKEN';   // invente uma senha longa e repita em config.js
const COLS = ['users', 'paymentMethods', 'saleTypes', 'suppliers', 'products', 'customers', 'entries', 'sales', 'transfers', 'orders'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.token !== TOKEN) return out_({ ok: false, error: 'token' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const props = PropertiesService.getScriptProperties();
    const rev = props.getProperty('REV') || '0';
    if (req.action === 'load') return out_({ ok: true, rev: rev, data: read_(ss) });
    if (req.action === 'save') {
      if (req.baseRev !== rev && rev !== '0') return out_({ ok: false, error: 'conflict', rev: rev, data: read_(ss) });
      write_(ss, req.data);
      const nr = String(Date.now());
      props.setProperty('REV', nr);
      return out_({ ok: true, rev: nr });
    }
    return out_({ ok: false, error: 'acao' });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally { lock.releaseLock(); }
}
function doGet() { return out_({ ok: true, msg: 'Zium Fitness API no ar' }); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function read_(ss) {
  const d = {};
  COLS.forEach(function (c) {
    d[c] = [];
    const sh = ss.getSheetByName(c);
    if (!sh || sh.getLastRow() < 2) return;
    const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const jc = hdr.indexOf('_json');
    if (jc < 0) return;
    sh.getRange(2, jc + 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0]) d[c].push(JSON.parse(r[0])); });
  });
  return d;
}

function write_(ss, data) {
  COLS.forEach(function (c) {
    const rows = data[c] || [];
    const sh = ss.getSheetByName(c) || ss.insertSheet(c);
    sh.clear();
    const keys = [];
    rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (k !== 'hash' && k !== 'salt' && keys.indexOf(k) < 0) keys.push(k); }); });
    const hdr = keys.concat(['_json']);
    sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (!rows.length) return;
    const m = rows.map(function (r) {
      return keys.map(function (k) { const v = r[k]; return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); }).concat([JSON.stringify(r)]);
    });
    sh.getRange(2, 1, m.length, hdr.length).setNumberFormat('@').setValues(m);
  });
}
