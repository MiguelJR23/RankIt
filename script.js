'use strict';

/* =========================================================
   RankIt — script.js (corrigido)

   Principais mudanças em relação à versão anterior:
   - Esquema de dados trocado de "items[] com campo rank" para
     "ranked[] + unranked[]" explícitos. A ordem do array
     ranked[] É o rank — isso elimina de vez o bug de empate
     de ranks (não existe mais um número duplicado para
     desempatar).
   - Cartões são montados via DOM (createElement/textContent),
     não mais via innerHTML com template string — corrige a
     falha de XSS pelo nome/nota/imagem do item.
   - IDs gerados com crypto.randomUUID() (com fallback), em vez
     de Date.now(), evitando colisão de itens criados no mesmo
     milissegundo.
   - Arrastar-e-soltar só fica habilitado quando a grade de
     ranking exibida é exatamente igual (mesmos itens, mesma
     ordem) à lista completa — ou seja, com busca/filtro que
     esconda itens, o arrasto é desativado em vez de
     embaralhar a ordem real por trás dos itens escondidos.
   - Cálculo de "depois de qual card soltar" agora considera
     X e Y (funciona em grades de 2 e 3 colunas, não só 1).
   - Coluna escolhida é persistida; imagem quebrada cai num
     placeholder; exclusão pede confirmação; modal fecha com
     Esc e tem foco inicial.
   ========================================================= */

const STORAGE_KEY = 'rankit-v3';
const LEGACY_STORAGE_KEY = 'rankit-v2';

/** @typedef {{ id:string, name:string, image:string, note:string, review:boolean }} Item */
/** @typedef {{ title:string, columns:number, ranked:Item[], unranked:Item[] }} DB */

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
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const importJsonBtn = document.getElementById('importJsonBtn');
const importJsonInput = document.getElementById('importJsonInput');

const nameInput = document.getElementById('nameInput');
const imageInput = document.getElementById('imageInput');
const noteInput = document.getElementById('noteInput');
const rankInput = document.getElementById('rankInput');
const reviewInput = document.getElementById('reviewInput');

titleInput.value = db.title;
columnsSelect.value = String(db.columns);

/* ---------------------------------------------------------
   Persistência (com migração do formato antigo)
   --------------------------------------------------------- */

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
    columns: Number(parsed.columns) || 2,
    ranked: parsed.ranked,
    unranked: parsed.unranked,
  };
}

function save() {
  db.title = titleInput.value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

/* ---------------------------------------------------------
   Backup em JSON (exportar / importar arquivo)

   Complementa o localStorage: gera um arquivo .json com título,
   colunas e as duas listas, para o usuário guardar fora do
   navegador ou levar para outro dispositivo. Ao importar, os
   ids dos itens são sempre regenerados (nunca confiamos em ids
   vindos de um arquivo externo) e o arquivo é validado antes de
   qualquer coisa ser sobrescrita.
   --------------------------------------------------------- */

function exportJson() {
  save();
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    title: db.title,
    columns: db.columns,
    ranked: db.ranked,
    unranked: db.unranked,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName =
    (db.title || 'ranking')
      .trim()
      .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
      .replace(/\s+/g, '-') || 'ranking';
  a.download = safeName + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function validateImportedItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;
  return {
    id: generateId(),
    name,
    image: typeof raw.image === 'string' ? raw.image.trim() : '',
    note: typeof raw.note === 'string' ? raw.note.trim() : '',
    review: !!raw.review,
  };
}

// Recebe o JSON já parseado (objeto) e o db atual como fallback para
// título/colunas ausentes; nunca lança exceção, sempre devolve
// { success, error } ou { success, db }.
function buildDbFromImport(parsed, fallback) {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.ranked) || !Array.isArray(parsed.unranked)) {
    return { success: false, error: 'Esse arquivo não tem o formato esperado (faltam as listas "ranked"/"unranked").' };
  }
  const ranked = parsed.ranked.map(validateImportedItem).filter(Boolean);
  const unranked = parsed.unranked.map(validateImportedItem).filter(Boolean);
  if (ranked.length === 0 && unranked.length === 0) {
    return { success: false, error: 'Nenhum item válido foi encontrado no arquivo.' };
  }
  const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : fallback.title;
  const columns = [1, 2, 3].includes(Number(parsed.columns)) ? Number(parsed.columns) : fallback.columns;
  return { success: true, db: { title, columns, ranked, unranked } };
}

function handleJsonFileSelected(e) {
  const file = e.target.files[0];
  importJsonInput.value = ''; // permite selecionar o mesmo arquivo de novo depois
  if (!file) return;

  const reader = new FileReader();
  reader.onerror = () => alert('Não foi possível ler o arquivo.');
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch (err) {
      alert('Esse arquivo não é um JSON válido.');
      return;
    }

    const result = buildDbFromImport(parsed, { title: db.title, columns: db.columns });
    if (!result.success) {
      alert(result.error);
      return;
    }

    if (!confirm('Importar este arquivo vai substituir a lista atual ("' + db.title + '"). Continuar?')) {
      return;
    }

    db = result.db;
    titleInput.value = db.title;
    columnsSelect.value = String(db.columns);
    ranking.className = 'grid cols-' + db.columns;
    unranked.className = 'grid cols-' + db.columns;
    render();
  };
  reader.readAsText(file);
}

/* ---------------------------------------------------------
   Utilidades
   --------------------------------------------------------- */

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

/* ---------------------------------------------------------
   Lógica de rank (testada isoladamente antes de entrar aqui)
   --------------------------------------------------------- */

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

/* ---------------------------------------------------------
   Estatísticas
   --------------------------------------------------------- */

function updateStats() {
  totalItemsEl.textContent = db.ranked.length + db.unranked.length + ' itens';
  const reviewCount =
    db.ranked.filter((i) => i.review).length + db.unranked.filter((i) => i.review).length;
  reviewCountEl.textContent = reviewCount + ' revisão';
  unrankedCountEl.textContent = db.unranked.length + ' não ranqueados';
}

/* ---------------------------------------------------------
   Renderização
   --------------------------------------------------------- */

function createCard(item, isRanked, rankNumber, canReorder) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = item.id;

  const isDraggable = isRanked && canReorder;
  card.draggable = isDraggable;
  if (isRanked && !canReorder) {
    card.title = 'Limpe a busca e o filtro "A Revisar" para reordenar arrastando';
  }

  const img = document.createElement('img');
  const url = safeImageUrl(item.image);
  img.src = url || placeholder(item.name);
  img.alt = item.name;
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    img.src = placeholder(item.name);
  });
  card.appendChild(img);

  const info = document.createElement('div');
  info.className = 'info';

  const rankLine = document.createElement('div');
  rankLine.className = 'rank';
  rankLine.textContent = (isRanked ? rankNumber + '. ' : '— ') + item.name;
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

/* ---------------------------------------------------------
   Modal — adicionar / editar item
   --------------------------------------------------------- */

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
    item = { id: generateId(), name, image, note, review };
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

/* ---------------------------------------------------------
   Arrastar e soltar (só na grade de ranking, quando
   canReorder=true — ver render())
   --------------------------------------------------------- */

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

/* ---------------------------------------------------------
   Eventos gerais
   --------------------------------------------------------- */

titleInput.addEventListener('input', save);
searchInput.addEventListener('input', render);
filterSelect.addEventListener('change', render);

columnsSelect.addEventListener('change', (e) => {
  db.columns = Number(e.target.value);
  ranking.className = 'grid cols-' + db.columns;
  unranked.className = 'grid cols-' + db.columns;
  save();
});

newBtn.addEventListener('click', () => openModal());
cancelBtn.addEventListener('click', closeModalFn);
saveBtn.addEventListener('click', saveItem);

exportJsonBtn.addEventListener('click', exportJson);
importJsonBtn.addEventListener('click', () => importJsonInput.click());
importJsonInput.addEventListener('change', handleJsonFileSelected);

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModalFn();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModalFn();
});

/* ---------------------------------------------------------
   Inicialização
   --------------------------------------------------------- */

ranking.className = 'grid cols-' + db.columns;
unranked.className = 'grid cols-' + db.columns;
render();