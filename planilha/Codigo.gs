/**
 * Validação MCN-PDTIC — recebe as respostas do site e calcula o IVC.
 *
 * Como usar (uma vez):
 *   1. Na planilha: Extensões > Apps Script. Apague o que houver e cole este arquivo inteiro.
 *   2. Salve. Clique em Implantar > Nova implantação > tipo "App da Web".
 *      Executar como: Eu. Quem pode acessar: Qualquer pessoa.
 *   3. Copie o URL do app da Web (termina em /exec) e coloque em "submitUrl" no config.json do site.
 *
 * Abas criadas automaticamente: "Respostas" (uma linha por especialista) e "IVC" (resultados).
 * O formulário não recebe nome, e-mail nem instituição; o Google não repassa ao script quem enviou.
 */

var REQUIREMENTS = [["N01","normativa"],["N02","normativa"],["N03","normativa"],["N04","normativa"],["N05","normativa"],["N06","normativa"],["N07","normativa"],["N08","normativa"],["N09","normativa"],["N10","normativa"],["N11","normativa"],["N12","normativa"],["N13","normativa"],["N14","normativa"],["N15","normativa"],["N16","normativa"],["N17","normativa"],["N18","normativa"],["N19","normativa"],["N20","normativa"],["E01","estrategica"],["E02","estrategica"],["E03","estrategica"],["E04","estrategica"],["E05","estrategica"],["E06","estrategica"],["E07","estrategica"],["E08","estrategica"],["E09","estrategica"],["E10","estrategica"],["E11","estrategica"],["E12","estrategica"],["E13","estrategica"],["E14","estrategica"],["E15","estrategica"],["E16","estrategica"],["E17","estrategica"],["E18","estrategica"],["E19","estrategica"],["E20","estrategica"],["O01","operacional"],["O02","operacional"],["O03","operacional"],["O04","operacional"],["O05","operacional"],["O06","operacional"],["O07","operacional"],["O08","operacional"],["O09","operacional"],["O10","operacional"],["O11","operacional"],["O12","operacional"],["O13","operacional"],["O14","operacional"],["O15","operacional"],["O16","operacional"],["O17","operacional"],["O18","operacional"],["O19","operacional"],["O20","operacional"],["G01","governanca"],["G02","governanca"],["G03","governanca"],["G04","governanca"],["G05","governanca"],["G06","governanca"],["G07","governanca"],["G08","governanca"],["G09","governanca"],["G10","governanca"],["G11","governanca"],["G12","governanca"],["G13","governanca"],["G14","governanca"],["G15","governanca"],["G16","governanca"],["G17","governanca"],["G18","governanca"],["G19","governanca"],["G20","governanca"]];
var DIMENSIONS = ['normativa', 'estrategica', 'operacional', 'governanca'];
var DIMENSION_LABELS = { normativa: 'Normativa', estrategica: 'Estratégica', operacional: 'Operacional', governanca: 'Governança' };
var PROFILES = {
  gestor_ifes_norte: 'Gestor(a) de TIC de IFES da Região Norte',
  auditoria_controle: 'Especialista em auditoria/controle',
  pesquisador_doutor: 'Pesquisador(a) doutor(a)'
};
var ITEM_THRESHOLD = 0.78;
var GLOBAL_THRESHOLD = 0.8;
var MAX_TEXT = 4000;

function doGet() {
  return json_({ ok: true, status: 'Planilha conectada. Envie as respostas pelo site.' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var input = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var row = validate_(input);
    lock.waitLock(20000);
    var sheet = responsesSheet_();
    var id = Utilities.getUuid();
    var submittedAt = new Date();
    sheet.appendRow([id, submittedAt].concat(row));
    recalcularIVC();
    return json_({ ok: true, id: id, submittedAt: submittedAt.toISOString() });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function headers_() {
  var head = ['id', 'enviado_em', 'perfil', 'anos_experiencia'];
  REQUIREMENTS.forEach(function (r) { head.push(r[0] + '_clareza', r[0] + '_relevancia'); });
  DIMENSIONS.forEach(function (d) { head.push(d + '_abrangencia', d + '_aplicabilidade', d + '_sugestoes', d + '_sobreposicoes'); });
  head.push('comentarios_adicionais');
  return head;
}

function responsesSheet_() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName('Respostas');
  if (!sheet) {
    sheet = book.insertSheet('Respostas');
    sheet.getRange(1, 1, 1, headers_().length).setValues([headers_()]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rating_(value, label) {
  var n = Number(value);
  if (!(n === 1 || n === 2 || n === 3 || n === 4)) throw new Error('Nota inválida em ' + label + '.');
  return n;
}

// Text is stored as plain text; a leading = + - @ is neutralised so it never runs as a formula.
function text_(value) {
  if (value === null || value === undefined) return '';
  var s = String(value).slice(0, MAX_TEXT).trim();
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function validate_(input) {
  if (input.consentAccepted !== true) throw new Error('É necessário aceitar o TCLE.');
  if (input.hasDirectUFRRLink !== false) throw new Error('Confirmação de vínculo ausente.');
  if (!PROFILES[input.profile]) throw new Error('Perfil inválido.');
  var years = Number(input.yearsExperience);
  if (!(Math.floor(years) === years && years >= 2 && years <= 70)) throw new Error('Anos de experiência inválidos.');
  var ratings = Array.isArray(input.ratings) ? input.ratings : [];
  var byCode = {};
  ratings.forEach(function (r) { if (r && typeof r.code === 'string') byCode[r.code] = r; });
  if (ratings.length !== REQUIREMENTS.length || Object.keys(byCode).length !== REQUIREMENTS.length) {
    throw new Error('A avaliação precisa conter uma resposta para cada um dos 80 requisitos.');
  }
  var row = [PROFILES[input.profile], years];
  REQUIREMENTS.forEach(function (r) {
    var item = byCode[r[0]];
    if (!item) throw new Error('Falta o requisito ' + r[0] + '.');
    row.push(rating_(item.clarity, r[0]), rating_(item.relevance, r[0]));
  });
  var dims = input.dimensions || {};
  DIMENSIONS.forEach(function (d) {
    var v = dims[d];
    if (!v) throw new Error('Falta a síntese da dimensão ' + d + '.');
    row.push(rating_(v.breadth, d), rating_(v.applicability, d), text_(v.suggestions), text_(v.duplicateConcerns));
  });
  row.push(text_(input.additionalComments));
  return row;
}

function ivc_(values) {
  var valid = values.filter(function (v) { return v >= 1 && v <= 4; });
  if (!valid.length) return null;
  return valid.filter(function (v) { return v >= 3; }).length / valid.length;
}
function mean_(values) {
  var valid = values.filter(function (v) { return v !== null; });
  if (!valid.length) return null;
  return valid.reduce(function (a, b) { return a + b; }, 0) / valid.length;
}
function verdict_(value, threshold) {
  return value === null ? 'sem dados' : value >= threshold ? 'atinge' : 'abaixo';
}

/** Recalcula a aba "IVC". Roda sozinho a cada resposta; também pode ser executado pelo menu do Apps Script. */
function recalcularIVC() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var data = responsesSheet_().getDataRange().getValues();
  var head = data[0];
  var rows = data.slice(1);
  var col = {};
  head.forEach(function (h, i) { col[h] = i; });
  var column = function (name) { return rows.map(function (r) { return Number(r[col[name]]); }); };

  var out = [];
  out.push(['Validação MCN-PDTIC — Índice de Validade de Conteúdo', '', '', '', '', '']);
  out.push(['Respostas recebidas', rows.length, 'Painel alvo: 9–12 especialistas', '', '', '']);
  Object.keys(PROFILES).forEach(function (p) {
    var label = PROFILES[p];
    out.push(['  ' + label, rows.filter(function (r) { return r[col.perfil] === label; }).length, 'meta: 3–4', '', '', '']);
  });
  out.push(['', '', '', '', '', '']);

  var items = REQUIREMENTS.map(function (r) {
    return { code: r[0], dim: r[1], c: ivc_(column(r[0] + '_clareza')), v: ivc_(column(r[0] + '_relevancia')) };
  });
  var dims = DIMENSIONS.map(function (d) {
    return { d: d, b: ivc_(column(d + '_abrangencia')), a: ivc_(column(d + '_aplicabilidade')) };
  });
  var g = {
    c: mean_(items.map(function (i) { return i.c; })),
    v: mean_(items.map(function (i) { return i.v; })),
    b: mean_(dims.map(function (i) { return i.b; })),
    a: mean_(dims.map(function (i) { return i.a; }))
  };
  out.push(['IVC GLOBAL (limite ' + GLOBAL_THRESHOLD + ')', 'IVC', 'Situação', '', '', '']);
  out.push(['Clareza (média dos 80 itens)', g.c, verdict_(g.c, GLOBAL_THRESHOLD), '', '', '']);
  out.push(['Relevância (média dos 80 itens)', g.v, verdict_(g.v, GLOBAL_THRESHOLD), '', '', '']);
  out.push(['Abrangência (média das 4 dimensões)', g.b, verdict_(g.b, GLOBAL_THRESHOLD), '', '', '']);
  out.push(['Aplicabilidade (média das 4 dimensões)', g.a, verdict_(g.a, GLOBAL_THRESHOLD), '', '', '']);
  out.push(['', '', '', '', '', '']);
  out.push(['POR DIMENSÃO (descritivo)', 'Abrangência', 'Aplicabilidade', '', '', '']);
  dims.forEach(function (x) { out.push([DIMENSION_LABELS[x.d], x.b, x.a, '', '', '']); });
  out.push(['', '', '', '', '', '']);
  out.push(['POR ITEM (limite ' + ITEM_THRESHOLD + ')', 'Dimensão', 'IVC clareza', 'Clareza', 'IVC relevância', 'Relevância']);
  items.forEach(function (i) {
    out.push([i.code, DIMENSION_LABELS[i.dim], i.c, verdict_(i.c, ITEM_THRESHOLD), i.v, verdict_(i.v, ITEM_THRESHOLD)]);
  });
  out.push(['', '', '', '', '', '']);
  out.push(['Nota: IVC = proporção de notas 3 ou 4 entre as respostas válidas. Os quatro critérios permanecem separados; os resultados por dimensão são descritivos.', '', '', '', '', '']);

  var sheet = book.getSheetByName('IVC') || book.insertSheet('IVC');
  sheet.clear();
  var values = out.map(function (r) { return r.map(function (v) { return v === null ? '—' : v; }); });
  sheet.getRange(1, 1, values.length, 6).setValues(values);
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  sheet.getRange(1, 2, values.length, 5).setNumberFormat('0.0%');
  sheet.getRange(2, 2, 4, 1).setNumberFormat('0');
  sheet.setColumnWidth(1, 330);
  values.forEach(function (r, i) {
    if (/^(IVC GLOBAL|POR DIMENSÃO|POR ITEM)/.test(String(r[0]))) sheet.getRange(i + 1, 1, 1, 6).setFontWeight('bold');
  });
}
