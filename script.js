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
let selectedItemId = null; // card selecionado (seleção mobile)

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

// Modal de confirmação genérico
const confirmModalOverlay = document.getElementById('confirmModalOverlay');
const confirmTitleEl = document.getElementById('confirmTitle');
const confirmMessageEl = document.getElementById('confirmMessage');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const confirmOkBtn = document.getElementById('confirmOkBtn');

// Interface mobile: toolbar inferior
const mobileToolbar = document.getElementById('mobileToolbar');
const mobileNewBtn = document.getElementById('mobileNewBtn');
const mobileSortBtn = document.getElementById('mobileSortBtn');
const mobileSearchBtn = document.getElementById('mobileSearchBtn');
const mobileMoreBtn = document.getElementById('mobileMoreBtn');
const mobileExitBtn = document.getElementById('mobileExitBtn');
const mobileEditBtn = document.getElementById('mobileEditBtn');
const mobileDeleteBtn = document.getElementById('mobileDeleteBtn');
const mobileUpBtn = document.getElementById('mobileUpBtn');
const mobileDownBtn = document.getElementById('mobileDownBtn');

// Interface mobile: busca sobreposta
const mobileSearchBar = document.getElementById('mobileSearchBar');
const mobileSearchInput = document.getElementById('mobileSearchInput');
const mobileSearchCloseBtn = document.getElementById('mobileSearchCloseBtn');

// Interface mobile: gavetas "Ordenar" e "Mais"
const sortSheetOverlay = document.getElementById('sortSheetOverlay');
const mobileFilterSelect = document.getElementById('mobileFilterSelect');
const moreSheetOverlay = document.getElementById('moreSheetOverlay');
const mobileColumnsSelect = document.getElementById('mobileColumnsSelect');
const mobileExportListBtn = document.getElementById('mobileExportListBtn');
const mobileImportListBtn = document.getElementById('mobileImportListBtn');
const mobileExportImagesBtn = document.getElementById('mobileExportImagesBtn');
const mobileImportImagesBtn = document.getElementById('mobileImportImagesBtn');
const mobileClearMarkersBtn = document.getElementById('mobileClearMarkersBtn');
const mobileExportImageBtn = document.getElementById('mobileExportImageBtn');

// Exportar como imagem
const exportImageBtn = document.getElementById('exportImageBtn');
const exportImageModalOverlay = document.getElementById('exportImageModalOverlay');
const exportImgCategorySelect = document.getElementById('exportImgCategorySelect');
const exportImgIncludeTitle = document.getElementById('exportImgIncludeTitle');
const exportImgIncludeImages = document.getElementById('exportImgIncludeImages');
const exportImgUseProxy = document.getElementById('exportImgUseProxy');
const exportImgIncludeNotes = document.getElementById('exportImgIncludeNotes');
const exportImgIncludeNewBadge = document.getElementById('exportImgIncludeNewBadge');
const exportImgIncludeUnranked = document.getElementById('exportImgIncludeUnranked');
const exportImageError = document.getElementById('exportImageError');
const exportImageCancelBtn = document.getElementById('exportImageCancelBtn');
const exportImageGenerateBtn = document.getElementById('exportImageGenerateBtn');
const exportImageResultOverlay = document.getElementById('exportImageResultOverlay');
const exportImagePreviewImg = document.getElementById('exportImagePreviewImg');
const exportImageShareBtn = document.getElementById('exportImageShareBtn');
const exportImageSaveBtn = document.getElementById('exportImageSaveBtn');
const exportImageCloseBtn = document.getElementById('exportImageCloseBtn');

titleInput.value = db.title;
columnsSelect.value = String(db.columns);
mobileColumnsSelect.value = String(db.columns);
mobileFilterSelect.value = filterSelect.value;

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
  const allItems = [...dbObj.ranked, ...dbObj.unranked];
  const hasAnyMarker = allItems.some((i) => i.review || i.isNew || i.moveDelta);
  if (hasAnyMarker) {
    lines.push('');
    lines.push('Legenda:');
    lines.push('* = A revisar');
    lines.push('! = Novo');
    lines.push('[+N] = Subiu N posições');
    lines.push('[-N] = Desceu N posições');
  }
  return lines.join('\n');
}

const TXT_TITLE_REGEX = /^t[íi]tulo\s*:\s*(.+)$/i;
const TXT_SECTION_REGEX = /^n[ãa]o\s+ranqueados?\s*:?\s*$/i;
const TXT_LEGEND_REGEX = /^legenda/i;
const TXT_RANKED_LINE_REGEX = /^(\d+)\.\s*(.+)$/;
const TXT_UNRANKED_LINE_REGEX = /^-\s*(.+)$/;
const TXT_REST_REGEX = /^(.*?)(?:\s*\(([^()]*)\))?\s*(\*)?\s*(!)?\s*(?:\[([+-]\d+)\])?\s*$/;

function parseTxtRest(rest) {
  const m = rest.match(TXT_REST_REGEX) || [];
  const moveDelta = m[5] ? parseInt(m[5], 10) : 0;
  return {
    name: (m[1] || '').trim(),
    note: m[2] ? m[2].trim() : '',
    review: !!m[3],
    isNew: !!m[4],
    moveDelta: Number.isFinite(moveDelta) ? moveDelta : 0,
  };
}

function parseListText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  let title = null;
  const rankedRaw = [];
  const unranked = [];
  let inUnranked = false;
  let inLegend = false;

  for (const line of lines) {
    if (TXT_LEGEND_REGEX.test(line)) {
      inLegend = true;
      continue;
    }
    if (inLegend) continue; // a legenda ocupa várias linhas agora — ignora todas
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
  const confirmed = await showConfirm({
    title: 'Exportar lista?',
    message: 'A lista atual será copiada para a área de transferência.',
    confirmLabel: 'Exportar',
  });
  if (!confirmed) return;
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
  const confirmed = await showConfirm({
    title: 'Importar lista?',
    message: 'Os dados importados poderão substituir a lista atual, e as imagens dos itens serão limpas (importe o arquivo de imagens em seguida, se quiser).',
    confirmLabel: 'Continuar',
  });
  if (!confirmed) return;

  db.ranked = parsed.ranked.map((i) => ({
    id: generateId(),
    name: i.name,
    image: '',
    note: i.note,
    review: i.review,
    moveDelta: i.moveDelta || 0,
    isNew: !!i.isNew,
  }));
  db.unranked = parsed.unranked.map((i) => ({
    id: generateId(),
    name: i.name,
    image: '',
    note: i.note,
    review: i.review,
    moveDelta: i.moveDelta || 0,
    isNew: !!i.isNew,
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
  const confirmed = await showConfirm({
    title: 'Exportar imagens?',
    message: 'A lista de imagens atual será copiada para a área de transferência.',
    confirmLabel: 'Exportar',
  });
  if (!confirmed) return;
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
  const confirmed = await showConfirm({
    title: 'Importar imagens?',
    message: 'As imagens importadas vão sobrescrever as imagens atuais dos itens correspondentes.',
    confirmLabel: 'Continuar',
  });
  if (!confirmed) return;
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

async function clearAllMarkers() {
  const confirmed = await showConfirm({
    title: 'Limpar marcações?',
    message: 'As marcações atuais serão removidas.',
    confirmLabel: 'Limpar',
  });
  if (!confirmed) return;
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
  if (item.id === selectedItemId) card.classList.add('selected');

  card.addEventListener('click', () => {
    if (!isMobileViewport()) return;
    toggleCardSelection(item.id);
  });

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

function passesSearch(item, searchTerm) {
  return item.name.toLowerCase().includes(searchTerm);
}

function passesFilter(item, isRanked, filterValue) {
  if (filterValue === 'ranked') return isRanked;
  if (filterValue === 'unranked') return !isRanked;
  if (filterValue === 'review') return item.review;
  return true;
}

function getCurrentlyFilteredItems() {
  const search = searchInput.value.trim().toLowerCase();
  const filter = filterSelect.value;
  return {
    ranked: db.ranked.filter((i) => passesSearch(i, search) && passesFilter(i, true, filter)),
    unranked: db.unranked.filter((i) => passesSearch(i, search) && passesFilter(i, false, filter)),
  };
}

function render() {
  save();
  updateStats();

  const search = searchInput.value.trim().toLowerCase();
  const filter = filterSelect.value;

  const filteredRanked = db.ranked.filter((i) => passesSearch(i, search) && passesFilter(i, true, filter));
  const filteredUnranked = db.unranked.filter((i) => passesSearch(i, search) && passesFilter(i, false, filter));

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

  updateMobileToolbarState();
}

/* Modal de confirmação genérico */

// Usado por excluir, exportar, importar e limpar marcações — tanto no
// desktop quanto no mobile. Devolve uma Promise<boolean> (true = confirmou).
function showConfirm({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    confirmTitleEl.textContent = title;
    confirmMessageEl.textContent = message;
    confirmCancelBtn.textContent = cancelLabel;
    confirmOkBtn.textContent = confirmLabel;
    confirmOkBtn.classList.toggle('danger-btn', danger);

    confirmModalOverlay.classList.remove('hidden');
    confirmModalOverlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => confirmOkBtn.focus(), 0);

    function cleanup(result) {
      confirmModalOverlay.classList.add('hidden');
      confirmModalOverlay.setAttribute('aria-hidden', 'true');
      confirmOkBtn.removeEventListener('click', onOk);
      confirmCancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() {
      cleanup(true);
    }
    function onCancel() {
      cleanup(false);
    }

    confirmOkBtn.addEventListener('click', onOk);
    confirmCancelBtn.addEventListener('click', onCancel);
  });
}

confirmModalOverlay.addEventListener('click', (e) => {
  if (e.target === confirmModalOverlay) confirmCancelBtn.click();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !confirmModalOverlay.classList.contains('hidden')) {
    confirmCancelBtn.click();
  }
});

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

async function deleteItem(id) {
  const item = findItem(id);
  if (!item) return;
  const confirmed = await showConfirm({
    title: 'Excluir item?',
    message: 'Tem certeza que deseja excluir este item?',
    confirmLabel: 'Excluir',
    danger: true,
  });
  if (!confirmed) return;
  removeItem(id);
  if (selectedItemId === id) selectedItemId = null;
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

/* Seleção de card (mobile) */

function isMobileViewport() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function toggleCardSelection(id) {
  selectedItemId = selectedItemId === id ? null : id;
  render();
}

function deselectCard() {
  selectedItemId = null;
  render();
}

function updateMobileToolbarState() {
  if (selectedItemId && !findItem(selectedItemId)) {
    selectedItemId = null;
  }

  mobileToolbar.classList.toggle('selected-mode', !!selectedItemId);
  if (!selectedItemId) return;

  const idx = db.ranked.findIndex((i) => i.id === selectedItemId);
  const isRankedItem = idx !== -1;
  mobileUpBtn.disabled = !isRankedItem || idx <= 0;
  mobileDownBtn.disabled = !isRankedItem || idx >= db.ranked.length - 1;
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
function handleFilterChange(value) {
  filterSelect.value = value;
  mobileFilterSelect.value = value;
  render();
}
filterSelect.addEventListener('change', (e) => handleFilterChange(e.target.value));
mobileFilterSelect.addEventListener('change', (e) => handleFilterChange(e.target.value));

function handleColumnsChange(rawValue) {
  db.columns = rawValue === 'custom' ? 'custom' : Number(rawValue);
  columnsSelect.value = String(db.columns);
  mobileColumnsSelect.value = String(db.columns);
  ranking.className = 'grid cols-' + db.columns;
  unranked.className = 'grid cols-' + db.columns;
  save();
  render(); // re-renderiza os cards: necessário pro modo "Personalizado" aplicar
            // a classe de imagem em tamanho natural nos itens já existentes
}
columnsSelect.addEventListener('change', (e) => handleColumnsChange(e.target.value));
mobileColumnsSelect.addEventListener('change', (e) => handleColumnsChange(e.target.value));

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
exportImageBtn.addEventListener('click', openExportImageModal);

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModalFn();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModalFn();
  if (e.key === 'Escape' && !exportImageModalOverlay.classList.contains('hidden')) closeExportImageModal();
  if (e.key === 'Escape' && !exportImageResultOverlay.classList.contains('hidden')) closeExportImageResultModal();
});

/* Exportar como imagem */

// A imagem é desenhada a partir dos DADOS do ranking (não é um print da
// tela) — assim é fácil excluir tudo que é interface de gerenciamento
// (botões, toolbar, menus) e manter só o conteúdo visual do ranking.

const EXPORT_LAYOUT = {
  padding: 32,
  gap: 22,
  cardWidth: 300,
  imageHeight: 170,
  cardPaddingX: 16,
  cardPaddingTop: 16,
  cardPaddingBottom: 16,
  rankLineHeight: 26,
  moveLineHeight: 22,
  reviewLineHeight: 24,
  noteLineHeight: 20,
  noteMaxLines: 2,
  sectionLabelHeight: 44,
  titleHeight: 78,
  footerHeight: 40,
};

function computeExportColumns(format, count) {
  if (count <= 0) return 1;
  if (format === 'horizontal') return Math.min(6, Math.max(2, Math.ceil(Math.sqrt(count * 2))));
  if (format === 'vertical') return Math.min(2, count);
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

// Muitos hosts de imagem não enviam cabeçalho CORS, e sem ele o navegador
// recusa desenhar a imagem num canvas que será exportado. O jeito de
// contornar isso do lado do cliente é passar por um proxy que rebusca a
// imagem e a reenvia com o cabeçalho correto. É "melhor esforço": depende
// de um serviço externo (a URL da imagem é enviada a ele) e pode falhar.
const IMAGE_PROXY_BASE = 'https://images.weserv.nl/?url=';

function tryLoadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadImageForCanvas(url, useProxyFallback) {
  if (!url) return null;

  const direct = await tryLoadImage(url);
  if (direct) return direct;

  // data: e blob: já são locais — proxy não ajudaria
  if (!useProxyFallback || /^(data|blob):/i.test(url)) return null;

  return tryLoadImage(IMAGE_PROXY_BASE + encodeURIComponent(url));
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawRoundedRectTop(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function drawImageCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function truncateCanvasText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}

function wrapCanvasText(ctx, text, maxWidth, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  const consumedWords = lines.join(' ').split(' ').length;
  if (consumedWords < words.length && lines.length > 0) {
    lines[lines.length - 1] = truncateCanvasText(ctx, lines[lines.length - 1] + '…', maxWidth);
  }
  return lines;
}

function buildExportSections(options) {
  if (options.contentMode === 'category') {
    const isRankedCategory = options.category !== 'unranked';
    const items = isRankedCategory ? db.ranked : db.unranked;
    return [{ label: isRankedCategory ? 'Ranking' : 'Não Ranqueados', items, isRanked: isRankedCategory }];
  }

  let rankedItems = db.ranked;
  let unrankedItems = db.unranked;
  if (options.contentMode === 'filtered') {
    const filtered = getCurrentlyFilteredItems();
    rankedItems = filtered.ranked;
    unrankedItems = filtered.unranked;
  }

  const sections = [{ label: 'Ranking', items: rankedItems, isRanked: true }];
  if (options.includeUnranked && unrankedItems.length > 0) {
    sections.push({ label: 'Não Ranqueados', items: unrankedItems, isRanked: false });
  }
  return sections;
}

function computeCardHeight(L, { includeImages, hasReview, hasNotes, hasMove, hasNewInline }) {
  let h = L.cardPaddingTop + L.rankLineHeight;
  if (hasNewInline) h += L.moveLineHeight;
  if (hasMove) h += L.moveLineHeight;
  if (hasReview) h += L.reviewLineHeight;
  if (hasNotes) h += L.noteLineHeight * L.noteMaxLines;
  if (includeImages) h += L.imageHeight;
  h += L.cardPaddingBottom;
  return h;
}

function drawExportCard(ctx, item, x, y, w, h, sectionFlags, opts) {
  const L = EXPORT_LAYOUT;

  drawRoundedRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = '#242424';
  ctx.fill();
  drawRoundedRect(ctx, x, y, w, h, 14);
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 1;
  ctx.stroke();

  let cursorY = y;

  if (opts.includeImages) {
    const safeUrl = safeImageUrl(item.image);
    const loadedImg = safeUrl ? opts.imageCache.get(safeUrl) : null;
    ctx.save();
    drawRoundedRectTop(ctx, x, y, w, L.imageHeight, 14);
    ctx.clip();
    if (loadedImg) {
      drawImageCover(ctx, loadedImg, x, y, w, L.imageHeight);
    } else {
      ctx.fillStyle = '#111111';
      ctx.fillRect(x, y, w, L.imageHeight);
      ctx.fillStyle = '#555555';
      ctx.font = 'bold 52px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((item.name.charAt(0) || '?').toUpperCase(), x + w / 2, y + L.imageHeight / 2 + 4);
    }
    ctx.restore();
    cursorY += L.imageHeight;
  }

  if (opts.includeImages && opts.includeNewBadge && item.isNew) {
    ctx.font = 'bold 14px Arial, sans-serif';
    const label = 'Novo';
    const badgeW = ctx.measureText(label).width + 20;
    const badgeH = 26;
    const badgeX = x + w - badgeW - 10;
    const badgeY = y + 10;
    drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  cursorY += L.cardPaddingTop;
  const textX = x + L.cardPaddingX;
  const textMaxWidth = w - L.cardPaddingX * 2;

  cursorY += L.rankLineHeight * 0.72;
  ctx.font = '600 17px Arial, sans-serif';
  ctx.fillStyle = '#60a5fa';
  const rankLine = opts.rankNumber ? opts.rankNumber + '. ' + item.name : '— ' + item.name;
  ctx.fillText(truncateCanvasText(ctx, rankLine, textMaxWidth), textX, cursorY);
  cursorY += L.rankLineHeight * 0.28;

  if (sectionFlags.hasNewInline) {
    cursorY += L.moveLineHeight * 0.7;
    if (opts.includeNewBadge && item.isNew) {
      ctx.font = 'bold 13px Arial, sans-serif';
      ctx.fillStyle = '#facc15';
      ctx.fillText('● Novo', textX, cursorY);
    }
    cursorY += L.moveLineHeight * 0.3;
  }

  if (sectionFlags.hasMove) {
    cursorY += L.moveLineHeight * 0.7;
    if (item.moveDelta) {
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.fillStyle = item.moveDelta > 0 ? '#4ade80' : '#f87171';
      const sign = item.moveDelta > 0 ? '+' : '';
      ctx.fillText('[' + sign + item.moveDelta + ']', textX, cursorY);
    }
    cursorY += L.moveLineHeight * 0.3;
  }

  if (sectionFlags.hasReview) {
    cursorY += L.reviewLineHeight * 0.7;
    if (item.review) {
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.fillStyle = '#facc15';
      ctx.fillText('★ A revisar', textX, cursorY);
    }
    cursorY += L.reviewLineHeight * 0.3;
  }

  if (sectionFlags.hasNotes && opts.includeNotes && item.note) {
    ctx.font = '14px Arial, sans-serif';
    ctx.fillStyle = '#cccccc';
    const lines = wrapCanvasText(ctx, item.note, textMaxWidth, L.noteMaxLines);
    lines.forEach((line) => {
      cursorY += L.noteLineHeight * 0.7;
      ctx.fillText(line, textX, cursorY);
      cursorY += L.noteLineHeight * 0.3;
    });
  }
}

async function renderRankingImage(options) {
  const L = EXPORT_LAYOUT;
  const sections = buildExportSections(options).filter((s) => s.items.length > 0);

  if (sections.length === 0) {
    throw new Error('Não há itens para exportar com essas opções.');
  }

  const imageCache = new Map();
  if (options.includeImages) {
    const urls = new Set();
    sections.forEach((s) => s.items.forEach((item) => {
      const safe = safeImageUrl(item.image);
      if (safe) urls.add(safe);
    }));
    await Promise.all([...urls].map(async (url) => {
      imageCache.set(url, await loadImageForCanvas(url, options.useImageProxy));
    }));
  }

  const sectionLayouts = sections.map((section) => {
    const cols = computeExportColumns(options.format, section.items.length);
    const rows = Math.ceil(section.items.length / cols);
    const sectionFlags = {
      hasNotes: options.includeNotes && section.items.some((i) => i.note),
      hasReview: section.items.some((i) => i.review),
      hasMove: section.items.some((i) => i.moveDelta),
      hasNewInline: !options.includeImages && options.includeNewBadge && section.items.some((i) => i.isNew),
    };
    const cardH = computeCardHeight(L, { includeImages: options.includeImages, ...sectionFlags });
    return { section, cols, rows, cardH, sectionFlags };
  });

  const maxCols = Math.max(...sectionLayouts.map((s) => s.cols), 1);
  const width = L.padding * 2 + maxCols * L.cardWidth + (maxCols - 1) * L.gap;

  const titleH = options.includeTitle && db.title ? L.titleHeight : 0;
  let height = L.padding + titleH;
  sectionLayouts.forEach((layout, i) => {
    if (i > 0) height += L.gap;
    height += L.sectionLabelHeight + layout.rows * layout.cardH + (layout.rows - 1) * L.gap;
  });
  height += L.footerHeight + L.padding;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#181818';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = L.padding;

  if (options.includeTitle && db.title) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(truncateCanvasText(ctx, db.title, width - L.padding * 2), L.padding, y + 40);
    y += titleH;
  }

  sectionLayouts.forEach(({ section, cols, cardH, sectionFlags }, sectionIdx) => {
    if (sectionIdx > 0) y += L.gap;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(section.label.toUpperCase(), L.padding, y + 24);
    y += L.sectionLabelHeight;

    section.items.forEach((item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = L.padding + col * (L.cardWidth + L.gap);
      const cardY = y + row * (cardH + L.gap);
      drawExportCard(ctx, item, x, cardY, L.cardWidth, cardH, sectionFlags, {
        rankNumber: section.isRanked ? idx + 1 : null,
        includeImages: options.includeImages,
        includeNotes: options.includeNotes,
        includeNewBadge: options.includeNewBadge,
        imageCache,
      });
    });

    const rows = Math.ceil(section.items.length / cols);
    y += rows * cardH + (rows - 1) * L.gap;
  });

  ctx.fillStyle = '#555555';
  ctx.font = '13px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Gerado com RankIt', canvas.width - L.padding, canvas.height - L.padding + 10);

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/* Modal: configurar exportação como imagem */

function updateExportImageModalState() {
  const contentMode = document.querySelector('input[name="exportImgContent"]:checked').value;
  exportImgCategorySelect.disabled = contentMode !== 'category';
  exportImgIncludeUnranked.disabled = contentMode === 'category';
  exportImgUseProxy.disabled = !exportImgIncludeImages.checked;
}

exportImgIncludeImages.addEventListener('change', updateExportImageModalState);

document.querySelectorAll('input[name="exportImgContent"]').forEach((radio) => {
  radio.addEventListener('change', updateExportImageModalState);
});

function openExportImageModal() {
  updateExportImageModalState();
  exportImageError.hidden = true;
  exportImageModalOverlay.classList.remove('hidden');
  exportImageModalOverlay.setAttribute('aria-hidden', 'false');
}

function closeExportImageModal() {
  exportImageModalOverlay.classList.add('hidden');
  exportImageModalOverlay.setAttribute('aria-hidden', 'true');
}

exportImageModalOverlay.addEventListener('click', (e) => {
  if (e.target === exportImageModalOverlay) closeExportImageModal();
});
exportImageCancelBtn.addEventListener('click', closeExportImageModal);

function collectExportImageOptions() {
  return {
    contentMode: document.querySelector('input[name="exportImgContent"]:checked').value,
    category: exportImgCategorySelect.value,
    includeTitle: exportImgIncludeTitle.checked,
    includeImages: exportImgIncludeImages.checked,
    useImageProxy: exportImgUseProxy.checked,
    includeNotes: exportImgIncludeNotes.checked,
    includeNewBadge: exportImgIncludeNewBadge.checked,
    includeUnranked: exportImgIncludeUnranked.checked,
    format: document.querySelector('input[name="exportImgFormat"]:checked').value,
  };
}

let lastExportImageBlobUrl = null;

exportImageGenerateBtn.addEventListener('click', async () => {
  exportImageError.hidden = true;
  const options = collectExportImageOptions();

  exportImageGenerateBtn.disabled = true;
  exportImageGenerateBtn.textContent = 'Gerando…';
  try {
    const canvas = await renderRankingImage(options);
    const blob = await canvasToBlob(canvas);
    if (!blob) throw new Error('Não foi possível gerar a imagem.');

    if (lastExportImageBlobUrl) URL.revokeObjectURL(lastExportImageBlobUrl);
    lastExportImageBlobUrl = URL.createObjectURL(blob);
    exportImagePreviewImg.src = lastExportImageBlobUrl;

    closeExportImageModal();
    openExportImageResultModal();
  } catch (err) {
    exportImageError.textContent = err.message || 'Não foi possível gerar a imagem. Tente outras opções.';
    exportImageError.hidden = false;
  } finally {
    exportImageGenerateBtn.disabled = false;
    exportImageGenerateBtn.textContent = 'Gerar imagem';
  }
});

/* Modal: resultado da exportação como imagem */

function openExportImageResultModal() {
  const canShareFiles = !!(navigator.canShare && navigator.share);
  exportImageShareBtn.hidden = !canShareFiles;
  exportImageResultOverlay.classList.remove('hidden');
  exportImageResultOverlay.setAttribute('aria-hidden', 'false');
}

function closeExportImageResultModal() {
  exportImageResultOverlay.classList.add('hidden');
  exportImageResultOverlay.setAttribute('aria-hidden', 'true');
}

exportImageResultOverlay.addEventListener('click', (e) => {
  if (e.target === exportImageResultOverlay) closeExportImageResultModal();
});
exportImageCloseBtn.addEventListener('click', closeExportImageResultModal);

exportImageSaveBtn.addEventListener('click', () => {
  if (!lastExportImageBlobUrl) return;
  const a = document.createElement('a');
  a.href = lastExportImageBlobUrl;
  a.download = safeFileNameFromTitle() + '.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
});

exportImageShareBtn.addEventListener('click', async () => {
  if (!lastExportImageBlobUrl) return;
  try {
    const response = await fetch(lastExportImageBlobUrl);
    const blob = await response.blob();
    const file = new File([blob], safeFileNameFromTitle() + '.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: db.title || 'RankIt' });
    } else {
      alert('Compartilhamento de imagem não é suportado neste navegador. Use "Salvar imagem".');
    }
  } catch (err) {
    if (err && err.name !== 'AbortError') {
      alert('Não foi possível compartilhar a imagem. Use "Salvar imagem".');
    }
  }
});

function safeFileNameFromTitle() {
  return (
    (db.title || 'ranking')
      .trim()
      .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
      .replace(/\s+/g, '-') || 'ranking'
  );
}

/* Interface mobile: toolbar inferior, busca, gavetas */

// Toolbar — estado normal
mobileNewBtn.addEventListener('click', () => openModal());
mobileSortBtn.addEventListener('click', openSortSheet);
mobileSearchBtn.addEventListener('click', openMobileSearch);
mobileMoreBtn.addEventListener('click', openMoreSheet);

// Toolbar — estado selecionado (reaproveita as funções já existentes)
mobileExitBtn.addEventListener('click', deselectCard);
mobileEditBtn.addEventListener('click', () => {
  if (!selectedItemId) return;
  editItem(selectedItemId);
  deselectCard();
});
mobileDeleteBtn.addEventListener('click', () => {
  if (selectedItemId) deleteItem(selectedItemId);
});
mobileUpBtn.addEventListener('click', () => {
  if (selectedItemId) moveItemUp(selectedItemId);
});
mobileDownBtn.addEventListener('click', () => {
  if (selectedItemId) moveItemDown(selectedItemId);
});

// Busca sobreposta
function openMobileSearch() {
  mobileSearchInput.value = searchInput.value;
  mobileSearchBar.classList.remove('hidden');
  requestAnimationFrame(() => mobileSearchBar.classList.add('open'));
  mobileSearchBtn.setAttribute('aria-expanded', 'true');
  setTimeout(() => mobileSearchInput.focus(), 50);
}

function closeMobileSearch() {
  mobileSearchBar.classList.remove('open');
  mobileSearchBtn.setAttribute('aria-expanded', 'false');
  setTimeout(() => mobileSearchBar.classList.add('hidden'), 200);
}

mobileSearchInput.addEventListener('input', () => {
  searchInput.value = mobileSearchInput.value;
  render();
});
mobileSearchCloseBtn.addEventListener('click', closeMobileSearch);

// Gaveta "Ordenar"
function openSortSheet() {
  sortSheetOverlay.classList.remove('hidden');
  mobileSortBtn.setAttribute('aria-expanded', 'true');
}

function closeSortSheet() {
  sortSheetOverlay.classList.add('hidden');
  mobileSortBtn.setAttribute('aria-expanded', 'false');
}

sortSheetOverlay.addEventListener('click', (e) => {
  if (e.target === sortSheetOverlay) closeSortSheet();
});

// Gaveta "Mais" (colunas + ações secundárias, todas reaproveitando funções existentes)
function openMoreSheet() {
  moreSheetOverlay.classList.remove('hidden');
  mobileMoreBtn.setAttribute('aria-expanded', 'true');
}

function closeMoreSheet() {
  moreSheetOverlay.classList.add('hidden');
  mobileMoreBtn.setAttribute('aria-expanded', 'false');
}

moreSheetOverlay.addEventListener('click', (e) => {
  if (e.target === moreSheetOverlay) closeMoreSheet();
});

mobileExportListBtn.addEventListener('click', () => {
  closeMoreSheet();
  exportListTxt();
});
mobileImportListBtn.addEventListener('click', () => {
  closeMoreSheet();
  importListFromClipboard();
});
mobileExportImagesBtn.addEventListener('click', () => {
  closeMoreSheet();
  exportImagesTxt();
});
mobileImportImagesBtn.addEventListener('click', () => {
  closeMoreSheet();
  importImagesFromClipboard();
});
mobileClearMarkersBtn.addEventListener('click', () => {
  closeMoreSheet();
  clearAllMarkers();
});
mobileExportImageBtn.addEventListener('click', () => {
  closeMoreSheet();
  openExportImageModal();
});

// Esc fecha o que estiver aberto (busca ou qualquer uma das gavetas)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!sortSheetOverlay.classList.contains('hidden')) closeSortSheet();
  else if (!moreSheetOverlay.classList.contains('hidden')) closeMoreSheet();
  else if (mobileSearchBar.classList.contains('open')) closeMobileSearch();
});

// Ao cruzar de volta pro desktop (redimensionar/girar a tela), fecha
// qualquer painel mobile aberto e sai do modo de seleção — nenhum deles
// existe na interface desktop.
const mobileBreakpointQuery = window.matchMedia('(max-width: 768px)');
mobileBreakpointQuery.addEventListener('change', (e) => {
  if (e.matches) return;
  closeSortSheet();
  closeMoreSheet();
  closeMobileSearch();
  if (selectedItemId) deselectCard();
});

/* Inicialização */

const fourColsOption = columnsSelect.querySelector('option[value="4"]');
const mobileFourColsOption = mobileColumnsSelect.querySelector('option[value="4"]');
const mobileColsQuery = window.matchMedia('(max-width: 480px)');

function applyMobileColumnsGuard() {
  const isMobile = mobileColsQuery.matches;
  fourColsOption.hidden = isMobile;
  mobileFourColsOption.hidden = isMobile;
  if (isMobile && db.columns === 4) {
    db.columns = 3;
    columnsSelect.value = '3';
    mobileColumnsSelect.value = '3';
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
