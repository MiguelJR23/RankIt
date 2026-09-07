'use strict';

/* =========================================================
   RankIt — script.js
   ========================================================= */

/* Armazenamento (chaves do localStorage) */

const STORAGE_KEY = 'rankit-v3';
const LEGACY_STORAGE_KEY = 'rankit-v2';

/* Estado e referências do DOM */

/** @typedef {{ id:string, name:string, image:string, note:string, review:boolean, moveDelta:number, isNew:boolean }} Item */
/** @typedef {{ title:string, columns:(number|string), ranked:Item[], unranked:Item[] }} DB */

/** @type {DB} */
let db = loadDb();
let editingId = null;

const ranking = document.getElementById('ranking');
const unranked = document.getElementById('unranked');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const formError = document.getElementById('formError');

const titleInput = document.getElementById('titleInput');
const totalItemsEl = document.getElementById('totalItems');
const reviewCountEl = document.getElementById('reviewCount');
const unrankedCountEl = document.getElementById('unrankedCount');
const searchInput = document.getElementById('search');
const filterSelect = document.getElementById('filter');
const columnsSelect = document.getElementById('columns');
const newBtn = document.getElementById('newBtn');
const toolsToggleBtn = document.getElementById('toolsToggleBtn');
const toolsPanel = document.getElementById('toolsPanel');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');
const exportListTxtBtn = document.getElementById('exportListTxtBtn');
const importListTxtBtn = document.getElementById('importListTxtBtn');
const exportImagesTxtBtn = document.getElementById('exportImagesTxtBtn');
const importImagesTxtBtn = document.getElementById('importImagesTxtBtn');
const clearMarkersBtn = document.getElementById('clearMarkersBtn');

const nameInput = document.getElementById('nameInput');
const imageInput = document.getElementById('imageInput');
const noteInput = document.getElementById('noteInput');
const rankInput = document.getElementById('rankInput');
const reviewInput = document.getElementById('reviewInput');

titleInput.value = db.title;
columnsSelect.value = String(db.columns);

/* Persistência */

function makeDefaultDb() {
  return { title: 'Meu Ranking', columns: 2, ranked: [], unranked: [] };
}

function loadDb() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return makeDefaultDb();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('Dados salvos corrompidos, iniciando do zero.', err);
    return makeDefaultDb();
  }

  // Formato antigo: { title, items: [{ id, name, image, note, review, rank }] }
  if (Array.isArray(parsed.items)) {
    const sorted = parsed.items
      .slice()
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    const rebuilt = { title: parsed.title || 'Meu Ranking', columns: 2, ranked: [], unranked: [] };
    sorted.forEach((i) => {
      const item = {
        id: String(i.id ?? generateId()),
        name: i.name || '',
        image: i.image || '',
        note: i.note || '',
        review: !!i.review,
        moveDelta: 0,
        isNew: false,
      };
      if (i.rank === null || i.rank === undefined) rebuilt.unranked.push(item);
      else rebuilt.ranked.push(item);
    });
    return rebuilt;
  }

  if (!Array.isArray(parsed.ranked) || !Array.isArray(parsed.unranked)) {
    return makeDefaultDb();
  }
  return {
    title: parsed.title || 'Meu Ranking',
    columns: parsed.columns === 'custom' ? 'custom' : Number(parsed.columns) || 2,
    ranked: parsed.ranked,
    unranked: parsed.unranked,
  };
}

function save() {
  db.title = titleInput.value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

/* Área de transferência (clipboard) */

async function writeClipboardText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // sem permissão/contexto inseguro — cai no fallback abaixo
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (err) {
    return false;
  }
}

async function readClipboardText() {
  if (navigator.clipboard && navigator.clipboard.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch (err) {
      // sem permissão/contexto inseguro — pede pra colar na mão abaixo
    }
  }
  return window.prompt('Cole aqui o texto copiado:');
}

/* Lista (texto) */

function formatTxtItemLine(rank, item, type) {
  let s = type === 'ranked' ? rank + '. ' + item.name : '- ' + item.name;
  if (item.note) s += ' (' + item.note + ')';
  if (item.review) s += ' *';
  if (item.isNew) s += ' !';
  if (item.moveDelta) s += ' [' + (item.moveDelta > 0 ? '+' : '') + item.moveDelta + ']';
  return s;
}

function generateListText(dbObj) {
  const lines = [];
  if (dbObj.title) lines.push('Título: ' + dbObj.title);
  lines.push('');
  dbObj.ranked.forEach((item, idx) => lines.push(formatTxtItemLine(idx + 1, item, 'ranked')));
  if (dbObj.unranked.length > 0) {
    lines.push('');
    lines.push('Não ranqueados:');
    dbObj.unranked.forEach((item) => lines.push(formatTxtItemLine(null, item, 'unranked')));
  }
  const hasReview = [...dbObj.ranked, ...dbObj.unranked].some((i) => i.review);
  if (hasReview) {
    lines.push('');
    lines.push('Legenda: * = A ser revisado');
  }
  return lines.join('\n');
}

const TXT_TITLE_REGEX = /^t[íi]tulo\s*:\s*(.+)$/i;
const TXT_SECTION_REGEX = /^n[ãa]o\s+ranqueados?\s*:?\s*$/i;
const TXT_LEGEND_REGEX = /^legenda/i;
const TXT_RANKED_LINE_REGEX = /^(\d+)\.\s*(.+)$/;
const TXT_UNRANKED_LINE_REGEX = /^-\s*(.+)$/;
const TXT_REST_REGEX = /^(.*?)(?:\s*\(([^()]*)\))?\s*(\*)?\s*(?:!)?\s*(?:\[([+-]\d+)\])?\s*$/;

function parseTxtRest(rest) {
  const m = rest.match(TXT_REST_REGEX) || [];
  const moveDelta = m[4] ? parseInt(m[4], 10) : 0;
  // "isNew" (a faixa "Novo") nunca é atribuído a partir de texto importado —
  // esse marcador só existe para itens criados pelo botão "Novo".
  return {
    name: (m[1] || '').trim(),
    note: m[2] ? m[2].trim() : '',
    review: !!m[3],
    moveDelta: Number.isFinite(moveDelta) ? moveDelta : 0,
  };
}

function parseListText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  let title = null;
  const rankedRaw = [];
  const unranked = [];
  let inUnranked = false;

  for (const line of lines) {
    if (TXT_LEGEND_REGEX.test(line)) continue;
    const titleMatch = line.match(TXT_TITLE_REGEX);
    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }
    if (TXT_SECTION_REGEX.test(line)) {
      inUnranked = true;
      continue;
    }
    if (!inUnranked) {
      const m = line.match(TXT_RANKED_LINE_REGEX);
      if (m) {
        rankedRaw.push({ rank: parseInt(m[1], 10), ...parseTxtRest(m[2]) });
        continue;
      }
    }
    const um = line.match(TXT_UNRANKED_LINE_REGEX);
    if (um) {
      unranked.push(parseTxtRest(um[1]));
      continue;
    }
    if (inUnranked) unranked.push(parseTxtRest(line));
  }
  rankedRaw.sort((a, b) => a.rank - b.rank);
  return { title, ranked: rankedRaw.map(({ rank, ...rest }) => rest), unranked };
}

async function exportListTxt() {
  save();
  const ok = await writeClipboardText(generateListText(db));
  alert(ok ? 'Lista copiada! Cole onde quiser guardar.' : 'Não foi possível copiar. Tente novamente.');
}

async function importListFromClipboard() {
  const text = await readClipboardText();
  if (text === null) return; // usuário cancelou

  if (!text.trim()) {
    alert('Não há texto para importar (área de transferência vazia).');
    return;
  }
  const parsed = parseListText(text);
  if (parsed.ranked.length === 0 && parsed.unranked.length === 0) {
    alert('Não foi possível reconhecer nenhum item nesse texto. Confira o formato (ex: "1. Nome").');
    return;
  }
  const msg =
    'Importar esta lista vai substituir os itens atuais ("' +
    db.title +
    '") e limpar as imagens deles. Se quiser recuperar as imagens, importe a lista de imagens (clipboard) logo em seguida. Continuar?';
  if (!confirm(msg)) return;

  db.ranked = parsed.ranked.map((i) => ({
    id: generateId(),
    name: i.name,
    image: '',
    note: i.note,
    review: i.review,
    moveDelta: i.moveDelta || 0,
    isNew: false,
  }));
  db.unranked = parsed.unranked.map((i) => ({
    id: generateId(),
    name: i.name,
    image: '',
    note: i.note,
    review: i.review,
    moveDelta: i.moveDelta || 0,
    isNew: false,
  }));
  if (parsed.title) db.title = parsed.title;

  titleInput.value = db.title;
  render();
}

/* Imagens (texto) */

const TXT_IMAGE_HEADER_REGEX = /^imagens?\s*:?\s*$/i;
const TXT_IMAGE_LINE_REGEX = /^(\d+)\.\s*(.+)$/;

function generateImagesText(dbObj) {
  const totalItems = dbObj.ranked.length + dbObj.unranked.length;
  if (totalItems === 0) return '(a lista atual não tem itens)';
  const lines = ['Imagem:', ''];
  dbObj.ranked.forEach((item, idx) => {
    lines.push(idx + 1 + '. ' + (item.image ? item.image : '(sem imagem)'));
  });
  if (dbObj.unranked.length > 0) {
    lines.push('');
    lines.push('Não ranqueados:');
    dbObj.unranked.forEach((item, idx) => {
      lines.push(idx + 1 + '. ' + (item.image ? item.image : '(sem imagem)'));
    });
  }
  return lines.join('\n');
}

function parseImagesText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  let section = 'ranked'; // tolerante: sem cabeçalho, trata linhas numeradas como ranqueadas
  let hasUnrankedSection = false;
  const rankedUrls = [];
  const unrankedUrls = [];

  for (const line of lines) {
    if (TXT_IMAGE_HEADER_REGEX.test(line)) {
      section = 'ranked';
      continue;
    }
    if (TXT_SECTION_REGEX.test(line)) {
      section = 'unranked';
      hasUnrankedSection = true;
      continue;
    }
    if (TXT_LEGEND_REGEX.test(line)) continue;
    const m = line.match(TXT_IMAGE_LINE_REGEX);
    if (!m) continue;
    const url = /^\(sem imagem\)$/i.test(m[2].trim()) ? '' : m[2].trim();
    (section === 'unranked' ? unrankedUrls : rankedUrls).push(url);
  }
  return { rankedUrls, unrankedUrls, hasUnrankedSection };
}

function validateImagesAgainstDb(parsedImages, targetDb) {
  const errors = [];
  if (parsedImages.rankedUrls.length !== targetDb.ranked.length) {
    errors.push(
      'A seção de ranqueados tem ' +
        parsedImages.rankedUrls.length +
        ' linha(s), mas a lista atual tem ' +
        targetDb.ranked.length +
        ' item(ns) ranqueado(s).'
    );
  }
  if (parsedImages.hasUnrankedSection && parsedImages.unrankedUrls.length !== targetDb.unranked.length) {
    errors.push(
      'A seção "Não ranqueados" tem ' +
        parsedImages.unrankedUrls.length +
        ' linha(s), mas a lista atual tem ' +
        targetDb.unranked.length +
        ' item(ns) não ranqueado(s).'
    );
  }
  return errors.length > 0 ? { success: false, error: errors.join(' ') } : { success: true };
}

function commitImagesToDb(parsedImages, targetDb) {
  targetDb.ranked.forEach((item, idx) => {
    item.image = parsedImages.rankedUrls[idx];
  });
  if (parsedImages.hasUnrankedSection) {
    targetDb.unranked.forEach((item, idx) => {
      item.image = parsedImages.unrankedUrls[idx];
    });
  }
}

async function exportImagesTxt() {
  save();
  const ok = await writeClipboardText(generateImagesText(db));
  alert(ok ? 'Lista de imagens copiada! Cole onde quiser guardar.' : 'Não foi possível copiar. Tente novamente.');
}

async function importImagesFromClipboard() {
  const text = await readClipboardText();
  if (text === null) return; // usuário cancelou

  if (!text.trim()) {
    alert('Não há texto para importar (área de transferência vazia).');
    return;
  }
  const parsedImages = parseImagesText(text);
  if (parsedImages.rankedUrls.length === 0 && parsedImages.unrankedUrls.length === 0) {
    alert('Não foi possível reconhecer nenhuma linha de imagem nesse texto. Confira o formato (ex: "1. https://...").');
    return;
  }
  const check = validateImagesAgainstDb(parsedImages, db);
  if (!check.success) {
    alert(check.error);
    return;
  }
  if (!confirm('Aplicar essas imagens vai sobrescrever as imagens atuais dos itens correspondentes. Continuar?')) {
    return;
  }
  commitImagesToDb(parsedImages, db);
  render();
}

/* Utilidades */

function generateId() {
  if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function placeholder(nome) {
  return 'https://placehold.co/400x600/111/666?text=' + encodeURIComponent(nome || '?');
}

// Só aceita esquemas de URL inofensivos para <img src>; qualquer outra coisa
// (por exemplo "javascript:") é descartada e cai no placeholder.
function safeImageUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url, window.location.href);
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'data:') return url;
  } catch (err) {
    // URL inválida
  }
  return '';
}

function findItem(id) {
  return db.ranked.find((i) => i.id === id) || db.unranked.find((i) => i.id === id);
}

function removeItem(id) {
  db.ranked = db.ranked.filter((i) => i.id !== id);
  db.unranked = db.unranked.filter((i) => i.id !== id);
}

function clearAllMarkers() {
  if (!confirm('Isso vai remover as marcações de [+/-] e a faixa "Novo" de todos os itens. Continuar?')) return;
  [...db.ranked, ...db.unranked].forEach((item) => {
    item.moveDelta = 0;
    item.isNew = false;
  });
  render();
}

/* Lógica de rank */

function clampRank(inputRank, length) {
  if (inputRank === null || inputRank === undefined) return null;
  if (typeof inputRank === 'string' && inputRank.trim() === '') return null;
  let r = Math.floor(Number(inputRank));
  if (!Number.isFinite(r)) return null;
  if (r < 1) r = 1;
  if (r > length + 1) r = length + 1;
  return r;
}

function insertAt(array, item, position) {
  const copy = array.slice();
  copy.splice(position - 1, 0, item);
  return copy;
}

/* Estatísticas */

function updateStats() {
  totalItemsEl.textContent = db.ranked.length + db.unranked.length + ' itens';
  const reviewCount =
    db.ranked.filter((i) => i.review).length + db.unranked.filter((i) => i.review).length;
  reviewCountEl.textContent = reviewCount + ' revisão';
  unrankedCountEl.textContent = db.unranked.length + ' não ranqueados';
}

/* Renderização */

function createCard(item, isRanked, rankNumber, canReorder) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = item.id;

  const isDraggable = isRanked && canReorder;
  card.draggable = isDraggable;
  if (isRanked && !canReorder) {
    card.title = 'Limpe a busca e o filtro "A Revisar" para reordenar arrastando';
  }

  if (item.isNew) {
    const ribbon = document.createElement('span');
    ribbon.className = 'new-ribbon';
    ribbon.textContent = 'Novo';
    card.appendChild(ribbon);
  }

  const img = document.createElement('img');
  const url = safeImageUrl(item.image);
  img.src = url || placeholder(item.name);
  img.alt = item.name;
  img.loading = 'lazy';
  // No modo "Personalizado", so imagens de verdade (nao o placeholder) usam
  // altura natural -- sem imagem real, o card mantem o tamanho padrao.
  if (db.columns === 'custom' && url) {
    img.classList.add('custom-size');
  }
  img.addEventListener('error', () => {
    img.src = placeholder(item.name);
    img.classList.remove('custom-size');
  });
  card.appendChild(img);

  const info = document.createElement('div');
  info.className = 'info';

  const rankLine = document.createElement('div');
  rankLine.className = 'rank';
  rankLine.appendChild(document.createTextNode((isRanked ? rankNumber + '. ' : '— ') + item.name));
  if (item.moveDelta) {
    const moveBadge = document.createElement('span');
    moveBadge.className = 'move-badge ' + (item.moveDelta > 0 ? 'move-up' : 'move-down');
    moveBadge.textContent = ' [' + (item.moveDelta > 0 ? '+' : '') + item.moveDelta + ']';
    rankLine.appendChild(moveBadge);
  }
  info.appendChild(rankLine);

  if (item.review) {
    const review = document.createElement('div');
    review.className = 'review';
    review.textContent = '★ A revisar';
    info.appendChild(review);
  }

  if (item.note) {
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = item.note;
    info.appendChild(note);
  }

  const actions = document.createElement('div');
  actions.className = 'actions';

  if (isRanked) {
    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'move-btn';
    upBtn.textContent = '▲';
    upBtn.setAttribute('aria-label', 'Subir ' + item.name + ' uma posicao');
    upBtn.disabled = rankNumber <= 1;
    upBtn.addEventListener('click', () => moveItemUp(item.id));

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'move-btn';
    downBtn.textContent = '▼';
    downBtn.setAttribute('aria-label', 'Descer ' + item.name + ' uma posicao');
    downBtn.disabled = rankNumber >= db.ranked.length;
    downBtn.addEventListener('click', () => moveItemDown(item.id));

    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
  }

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.textContent = '✏';
  editBtn.setAttribute('aria-label', 'Editar ' + item.name);
  editBtn.addEventListener('click', () => editItem(item.id));

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.textContent = '🗑';
  delBtn.setAttribute('aria-label', 'Excluir ' + item.name);
  delBtn.addEventListener('click', () => deleteItem(item.id));

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  info.appendChild(actions);
  card.appendChild(info);

  if (isDraggable) {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      rebuildRanksFromDOM();
    });
  }

  return card;
}

function render() {
  save();
  updateStats();

  const search = searchInput.value.trim().toLowerCase();
  const filter = filterSelect.value;

  const passesSearch = (i) => i.name.toLowerCase().includes(search);
  const passesFilter = (i, isRanked) => {
    if (filter === 'ranked') return isRanked;
    if (filter === 'unranked') return !isRanked;
    if (filter === 'review') return i.review;
    return true;
  };

  const filteredRanked = db.ranked.filter((i) => passesSearch(i) && passesFilter(i, true));
  const filteredUnranked = db.unranked.filter((i) => passesSearch(i) && passesFilter(i, false));

  // Só libera o arrasto quando a grade mostrada é IDÊNTICA (mesmos itens, mesma
  // ordem) à lista completa. Caso contrário, um drag reordenaria só os cards
  // visíveis e corromperia a posição dos itens escondidos pelo filtro/busca.
  const canReorder =
    filteredRanked.length === db.ranked.length &&
    filteredRanked.every((item, idx) => item.id === db.ranked[idx].id);

  ranking.innerHTML = '';
  unranked.innerHTML = '';

  filteredRanked.forEach((item) => {
    const trueIndex = db.ranked.findIndex((i) => i.id === item.id);
    ranking.appendChild(createCard(item, true, trueIndex + 1, canReorder));
  });

  filteredUnranked.forEach((item) => {
    unranked.appendChild(createCard(item, false, null, false));
  });
}

/* Modal (adicionar / editar item) */

function openModal(item = null) {
  editingId = item ? item.id : null;
  modalTitle.textContent = item ? 'Editar' : 'Novo Item';
  formError.hidden = true;
  formError.textContent = '';

  nameInput.value = item ? item.name : '';
  imageInput.value = item ? item.image : '';
  noteInput.value = item ? item.note : '';
  reviewInput.checked = item ? item.review : false;

  if (item) {
    const idx = db.ranked.findIndex((i) => i.id === item.id);
    rankInput.value = idx >= 0 ? String(idx + 1) : '';
  } else {
    rankInput.value = '';
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => nameInput.focus(), 0);
}

function closeModalFn() {
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  editingId = null;
}

function saveItem() {
  const name = nameInput.value.trim();
  if (!name) {
    formError.textContent = 'Nome obrigatório.';
    formError.hidden = false;
    nameInput.focus();
    return;
  }

  const image = imageInput.value.trim();
  const note = noteInput.value.trim();
  const review = reviewInput.checked;
  const rankRaw = rankInput.value;

  let item;
  if (editingId) {
    item = findItem(editingId);
    if (!item) {
      closeModalFn();
      return;
    }
    removeItem(editingId);
    item.name = name;
    item.image = image;
    item.note = note;
    item.review = review;
  } else {
    item = { id: generateId(), name, image, note, review, moveDelta: 0, isNew: true };
  }

  const rank = clampRank(rankRaw, db.ranked.length);
  if (rank === null) {
    db.unranked.push(item);
  } else {
    db.ranked = insertAt(db.ranked, item, rank);
  }

  closeModalFn();
  render();
}

function editItem(id) {
  const item = findItem(id);
  if (item) openModal(item);
}

function deleteItem(id) {
  const item = findItem(id);
  if (!item) return;
  if (!confirm('Excluir "' + item.name + '"?')) return;
  removeItem(id);
  render();
}

function moveItemUp(id) {
  const idx = db.ranked.findIndex((i) => i.id === id);
  if (idx <= 0) return; // já é o primeiro
  const [item] = db.ranked.splice(idx, 1);
  db.ranked.splice(idx - 1, 0, item);
  item.moveDelta = (item.moveDelta || 0) + 1;
  render();
}

function moveItemDown(id) {
  const idx = db.ranked.findIndex((i) => i.id === id);
  if (idx === -1 || idx >= db.ranked.length - 1) return; // já é o último
  const [item] = db.ranked.splice(idx, 1);
  db.ranked.splice(idx + 1, 0, item);
  item.moveDelta = (item.moveDelta || 0) - 1;
  render();
}

/* Arrastar e soltar */

function rebuildRanksFromDOM() {
  const orderedIds = [...ranking.children].map((c) => c.dataset.id);
  const newRanked = orderedIds.map((id) => db.ranked.find((i) => i.id === id)).filter(Boolean);
  // Só aplica se todos os itens foram encontrados (garante que nada se perdeu).
  if (newRanked.length === db.ranked.length) {
    db.ranked = newRanked;
  }
  render();
}

// Encontra, entre os cards não-arrastados, o mais próximo do ponteiro (usando
// X e Y — funciona em grades de 1, 2 ou 3 colunas) e devolve o elemento antes
// do qual o card arrastado deve ser inserido (ou null para inserir no final).
function getDragAfterElement(container, x, y) {
  const elements = [...container.querySelectorAll('.card:not(.dragging)')];
  let closest = null;
  let closestDistance = Infinity;

  elements.forEach((el) => {
    const box = el.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const distance = Math.hypot(x - cx, y - cy);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = { el, cx, cy, box };
    }
  });

  if (!closest) return null;

  const goesAfter =
    y > closest.cy + closest.box.height / 4 ||
    (Math.abs(y - closest.cy) <= closest.box.height / 4 && x > closest.cx);

  return goesAfter ? closest.el.nextElementSibling : closest.el;
}

ranking.addEventListener('dragover', (e) => {
  e.preventDefault();
  const dragging = ranking.querySelector('.dragging');
  if (!dragging) return;
  const afterElement = getDragAfterElement(ranking, e.clientX, e.clientY);
  if (afterElement == null) {
    ranking.appendChild(dragging);
  } else {
    ranking.insertBefore(dragging, afterElement);
  }
});

/* Eventos gerais */

titleInput.addEventListener('input', save);
searchInput.addEventListener('input', render);
filterSelect.addEventListener('change', render);

columnsSelect.addEventListener('change', (e) => {
  const val = e.target.value;
  db.columns = val === 'custom' ? 'custom' : Number(val);
  ranking.className = 'grid cols-' + db.columns;
  unranked.className = 'grid cols-' + db.columns;
  save();
});

newBtn.addEventListener('click', () => openModal());
cancelBtn.addEventListener('click', closeModalFn);
saveBtn.addEventListener('click', saveItem);

toolsToggleBtn.addEventListener('click', () => {
  const isOpen = toolsPanel.classList.toggle('open');
  toolsToggleBtn.setAttribute('aria-expanded', String(isOpen));
  toolsToggleBtn.textContent = isOpen ? '✕ Fechar' : '☰ Ferramentas';
});

exportListTxtBtn.addEventListener('click', exportListTxt);
importListTxtBtn.addEventListener('click', importListFromClipboard);

exportImagesTxtBtn.addEventListener('click', exportImagesTxt);
importImagesTxtBtn.addEventListener('click', importImagesFromClipboard);

clearMarkersBtn.addEventListener('click', clearAllMarkers);

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModalFn();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModalFn();
});

/* Inicialização */

const fourColsOption = columnsSelect.querySelector('option[value="4"]');
const mobileColsQuery = window.matchMedia('(max-width: 480px)');

function applyMobileColumnsGuard() {
  const isMobile = mobileColsQuery.matches;
  fourColsOption.hidden = isMobile;
  if (isMobile && db.columns === 4) {
    db.columns = 3;
    columnsSelect.value = '3';
    ranking.className = 'grid cols-' + db.columns;
    unranked.className = 'grid cols-' + db.columns;
    save();
  }
}

mobileColsQuery.addEventListener('change', applyMobileColumnsGuard);
applyMobileColumnsGuard();

ranking.className = 'grid cols-' + db.columns;
unranked.className = 'grid cols-' + db.columns;
render();
