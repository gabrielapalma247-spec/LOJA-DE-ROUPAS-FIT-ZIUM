/**
 * Zium Fitness · banco de dados em planilha Google (versão 2).
 * Cada tabela do sistema vira uma aba (criada sozinha). A coluna "_json" é a fonte de verdade:
 * as outras colunas são só para você ler/filtrar. Para alterar dados, use o sistema.
 * Esta versão aceita qualquer tabela nova que o sistema criar (empresas, despesas etc.).
 */
const TOKEN = 'iUgjZhuG-pnM8M8UQAV31MOxZicO5ooO';
const API = 2;

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.token !== TOKEN) return out_({ ok: false, error: 'token', api: API });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const props = PropertiesService.getScriptProperties();
    const rev = props.getProperty('REV') || '0';
    if (req.action === 'load') return out_({ ok: true, api: API, rev: rev, data: read_(ss) });
    if (req.action === 'save') {
      if (req.baseRev !== rev && rev !== '0') return out_({ ok: false, api: API, error: 'conflict', rev: rev, data: read_(ss) });
      write_(ss, req.data);
      const nr = String(Date.now());
      props.setProperty('REV', nr);
      return out_({ ok: true, api: API, rev: nr });
    }
    return out_({ ok: false, api: API, error: 'acao' });
  } catch (err) {
    return out_({ ok: false, api: API, error: String(err) });
  } finally { lock.releaseLock(); }
}
function doGet() { return out_({ ok: true, api: API, msg: 'Zium Fitness API no ar' }); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function read_(ss) {
  const d = {};
  ss.getSheets().forEach(function (sh) {
    if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) return;
    const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const jc = hdr.indexOf('_json');
    if (jc < 0) return;
    const rows = [];
    if (sh.getLastRow() >= 2) sh.getRange(2, jc + 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0]) rows.push(JSON.parse(r[0])); });
    d[sh.getName()] = rows;
  });
  return d;
}

function write_(ss, data) {
  Object.keys(data).forEach(function (c) {
    const rows = data[c];
    if (!Array.isArray(rows)) return;
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
