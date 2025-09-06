/* ===== Helpers ===== */
const el = (id) => document.getElementById(id);
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

// === helpers de livro selecionado / limite do dia ===
function remainingForSelectedBook(){
  const b = getSelectedBook();
  if (!b) return 0;
  const total = Math.max(0, Number(b.pages||0));
  const done  = Math.max(0, Number(b.pagesRead||0));
  return Math.max(0, total - done);
}
function isSelectedBookDone(){ return remainingForSelectedBook() === 0; }

// garante que sempre existe um livro selecionado válido
function repairSelectedBookId(){
  if (!Array.isArray(state.books)) state.books = [];
  if (state.books.length === 0){
    const sample = { id: crypto.randomUUID(), title:'— selecione ou adicione —', author:'', pages:0, status:'novo' };
    state.books.push(sample);
    state.selectedBookId = sample.id;
    return;
  }
  // se o selectedBookId não existe mais, cai pro primeiro
  const ok = state.books.some(b => b.id === state.selectedBookId);
  if (!ok) state.selectedBookId = state.books[0].id;
}
function getCreatedAt(book) {
  if (book.createdAt) return new Date(book.createdAt);
  // fallback: pega a data do primeiro progresso, se existir
  const first = (book.progress || [])
    .map(p => new Date(p.dateISO))
    .sort((a, b) => a - b)[0];
  return first || new Date();
}
// “teto” para a meta do dia (não passa do que falta no livro)
function dayCap(){
  const rem = remainingForSelectedBook();
  return rem > 0 ? Math.min(state.goal, rem) : state.goal;
}

// Abre uma confirmação simples (usa confirm nativo se você não tiver modal genérico)
function confirmAdjustGoal(rem){
  const msg = `Faltam ${rem} página(s) neste livro.\nDeseja ajustar a meta de hoje para ${rem}?`;
  return window.confirm(msg);
}

// Ajusta meta caso seja maior do que o restante do livro
function ensureGoalFitsBook(trigger=''){
  const rem = remainingForSelectedBook();
  if (!rem) return;                         // sem livro ou sem páginas restantes definidas
  if (state.goal > rem){
    if (confirmAdjustGoal(rem)){
      state.goal = rem;
      setValue('goal', rem);
      render();
    }
  }
}

// Habilita/desabilita botões quando o livro terminar
function disableReadingControls(on){
  ['goal','plus1','minus1','cycleDone','saveDay'].forEach(id=>{
    const n = el(id);
    if (n) n.disabled = !!on;
  });
}


// ===== Calendário: config global (defina UMA vez) =====
window.WINDOW_SIZE = window.WINDOW_SIZE || 7;                // quantos meses aparecem
window.HALF        = Math.floor(window.WINDOW_SIZE / 2);     // posição central

// nomes dos meses (se ainda não existir)
window.CAL_MONTHS = Array.isArray(window.CAL_MONTHS)
  ? window.CAL_MONTHS
  : ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];


function setupModalCloseOnOutside(modalId) {
  const modal = el(modalId);
  if (!modal) return;

  modal.addEventListener('click', (e) => {
    const card = e.target.closest('.modal-card');
    if (!card) {
      modal.classList.add('hidden');
    }
  });
}
function refreshFinishedModalIfOpen(){
  const md = el('finishedModal');
  if (md && !md.classList.contains('hidden') && window.__lastFinishedOpts){
    openFinishedModal(window.__lastFinishedOpts);
  }
}


// ===== Estado inicial do calendário (sem redeclarar) =====
(function initCalendarGlobals(){
  const now = new Date();

  // estado de visualização
  if (!window.view || typeof window.view !== 'object') {
    window.view = {
      year:  now.getFullYear(),
      month: now.getMonth(),
      windowStart: Math.max(0, Math.min(now.getMonth() - HALF, 11 - (WINDOW_SIZE - 1))),

    };
  } else {
    // normaliza se vier faltando algo
    if (typeof window.view.year  !== 'number') window.view.year  = now.getFullYear();
    if (typeof window.view.month !== 'number') window.view.month = now.getMonth();
    if (typeof window.view.windowStart !== 'number') {
      window.view.windowStart = Math.max(0, Math.min(
        window.view.month - window.HALF,
        11 - (window.WINDOW_SIZE - 1)
      ));
    }
  }
})();


/* ===== Calendário (helpers) ===== */
function clampWindowStart(){
  const maxStart = 11 - (window.WINDOW_SIZE - 1); // 👈 usa sempre window.WINDOW_SIZE
  window.view.windowStart = Math.max(0, Math.min(window.view.windowStart, maxStart));
}

// centraliza a janela em torno do mês ativo
function centerWindowOnMonth(){
  window.view.windowStart = window.view.month - window.HALF;
  clampWindowStart();

  // se ao centralizar o mês ativo escapou pra fora (borda esquerda/direita), puxa de volta
  if (window.view.month < window.view.windowStart) {
    window.view.windowStart = window.view.month;
  }
  if (window.view.month > window.view.windowStart + (window.WINDOW_SIZE - 1)) {
    window.view.windowStart = window.view.month - (window.WINDOW_SIZE - 1);
    clampWindowStart();
  }
}


function ensureMonthInsideWindow(){
  // mantém o mês selecionado dentro da janela
  const end = window.view.windowStart + (window.WINDOW_SIZE - 1);

  if (window.view.month < window.view.windowStart) {
    window.view.windowStart = window.view.month - window.HALF;
  }
  if (window.view.month > end) {
    window.view.windowStart = window.view.month - window.HALF;
  }

  clampWindowStart();
}


// ===== Helpers do calendário (uma única versão!) =====
function lastAllowedMonth(year){
  const now = new Date();
  if (year <  now.getFullYear()) return 11;          // anos passados: jan..dez
  if (year >  now.getFullYear()) return -1;          // ano futuro: nenhum
  return now.getMonth();                              // ano atual: até mês corrente
}
function isFutureMonth(y, m){
  const now = new Date();
  if (y > now.getFullYear()) return true;
  if (y < now.getFullYear()) return false;
  return m > now.getMonth();
}
function ensureActiveMonthVisible(){
  const vp   = document.querySelector('.months-viewport');   // se estiver usando viewport
  const list = document.getElementById('calMonths');
  const active = list?.querySelector('.month-chip.active');
  if (!vp || !list || !active) return;
  const target = active.offsetLeft - (vp.clientWidth - active.clientWidth)/2;
  vp.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
}

// ===== Render da barra (7 meses, setas movem mês e mantêm central) =====
function renderCalendarStrip(){
  const yEl = document.getElementById('calYear');
  if (yEl) yEl.textContent = window.view.year;

  // garante janela válida e contendo o mês ativo
  ensureMonthInsideWindow();

  const wrap = document.getElementById('calMonths');
  if (!wrap) return;
  wrap.innerHTML = '';

  const maxStart = 11 - (window.WINDOW_SIZE - 1);
  const start = Math.max(0, Math.min(window.view.windowStart, maxStart));
  const end   = Math.min(11, start + (window.WINDOW_SIZE - 1));

  for (let idx = start; idx <= end; idx++){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'month-chip';
    btn.textContent = window.CAL_MONTHS[idx];

    if (idx === window.view.month) btn.classList.add('active');
    if (isFutureMonth(window.view.year, idx)) btn.classList.add('disabled');

    btn.addEventListener('click', () => {
      if (isFutureMonth(window.view.year, idx)) return;
      window.view.month = idx;
      // centraliza ao clicar
      window.view.windowStart = idx - window.HALF;
      clampWindowStart();
      renderCalendarStrip();
      window.renderShelf?.();
    });

    wrap.appendChild(btn);
  }

  // setas: mudam o MÊS selecionado e mantêm central
  const prev = document.getElementById('calPrev');
  const next = document.getElementById('calNext');

  if (prev){
    prev.disabled = (window.view.year === 1900 && window.view.month === 0);
    prev.onclick = () => {
      // volta um mês (pode cruzar de ano)
      let y = window.view.year, m = window.view.month - 1;
      if (m < 0){ m = 11; y--; }
      // não entra em ano totalmente futuro
      if (lastAllowedMonth(y) === -1) return;
      window.view.year = y; window.view.month = m;
      window.view.windowStart = m - window.HALF;
      clampWindowStart();
      renderCalendarStrip(); window.renderShelf?.();
    };
  }

  if (next){
    const now = new Date();
    const endOfYear =
      (window.view.year === now.getFullYear() &&
       window.view.month >= lastAllowedMonth(window.view.year));
    next.disabled = endOfYear;

    next.onclick = () => {
      let y = window.view.year, m = window.view.month + 1;
      if (m > 11){ m = 0; y++; }
      if (isFutureMonth(y, m)) return; // bloqueia futuro
      window.view.year = y; window.view.month = m;
      window.view.windowStart = m - window.HALF;
      clampWindowStart();
      renderCalendarStrip(); window.renderShelf?.();
    };
  }
}
ensureActiveMonthVisible()

/* ===== Seletor de Ano (novo) ===== */
function initYearPicker(){
  const openBtn = document.getElementById('yearButton') || document.getElementById('calYear');
  const modal   = document.getElementById('yearPickerModal');
  const ypPrev  = document.getElementById('ypPrev');
  const ypNext  = document.getElementById('ypNext');
  const ypYears = document.getElementById('ypYears');
  if (!openBtn || !modal || !ypYears) return;

  function isFutureYear(y){
    const now = new Date().getFullYear();
    return y > now;
  }

  function renderYearDial(centerYear){
    ypYears.innerHTML = '';

    const years = [centerYear - 1, centerYear, centerYear + 1];
    years.forEach((y, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = y;
      btn.className = 'btn-year ' + (i === 1 ? 'is-center' : 'is-side');
      if (isFutureYear(y)) btn.classList.add('disabled');

      btn.addEventListener('click', () => {
        if (isFutureYear(y)) return;
        // seleciona ano e ajusta mês se necessário
        window.view.year = y;
        const last = lastAllowedMonth(window.view.year);
        if (last >= 0 && window.view.month > last) window.view.month = last;
        if (last < 0) window.view.month = 0;

        renderCalendarStrip();
        window.renderShelf?.();
        modal.classList.add('hidden');
      });

      ypYears.appendChild(btn);
    });

    // setas play (travadas se o próximo centro for futuro)
    ypPrev?.classList.remove('disabled');
    ypPrev.onclick = () => renderYearDial(centerYear - 1);

    // se o "centro + 1" é futuro, trava a seta direita
    const willBeFuture = isFutureYear(centerYear + 1);
    ypNext?.classList.toggle('disabled', willBeFuture);
    ypNext.onclick = () => {
      if (!willBeFuture) renderYearDial(centerYear + 1);
    };
  }

  openBtn.addEventListener('click', () => {
    renderYearDial(window.view?.year || new Date().getFullYear());
    modal.classList.remove('hidden');
  });

  setupModalCloseOnOutside('yearPickerModal');
}


// ===== Âncora "hoje" =====
function renderTodayAnchor(){
  const now = new Date();
  const dia = String(now.getDate()).padStart(2,'0');
  const semana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
                   .format(now).replace('.', '').toLowerCase();

  const btn = document.getElementById('todayAnchor');
  if (!btn) return;

  btn.textContent = `${dia} - ${semana}`;

  btn.onclick = () => {
    window.view.year  = now.getFullYear();
    window.view.month = now.getMonth();
    // centraliza a janela em torno do mês atual
    window.view.windowStart = window.view.month - window.HALF;
    clampWindowStart();
    renderCalendarStrip();
    window.renderShelf?.();

    // opcional: se estiver usando viewport com overflow e quiser
    // garantir o chip “mês atual” centralizado visualmente:
    setTimeout(ensureActiveMonthVisible, 0);
  };
}


/* ===== Ações do botão de ano / modal de ano ===== */
(function wireYearPicker(){
  // abre o modal ao clicar no ano
  document.getElementById('yearButton')?.addEventListener('click', () => {
    document.getElementById('yearPickerModal')?.classList.remove('hidden');
  });

  // fecha clicando fora (usa seu helper)
  setupModalCloseOnOutside('yearPickerModal');

  // (opcional) setinhas do modal, se existirem:
  const ypPrev = document.getElementById('ypPrev');
  const ypNext = document.getElementById('ypNext');
  const ypYears = document.getElementById('ypYears');

  function renderYearList(centerYear = window.view.year){
    if (!ypYears) return;
    ypYears.innerHTML = ''; // exibe [center-1, center, center+1]
    const years = [centerYear - 1, centerYear, centerYear + 1];
    years.forEach(y => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'year-pill' + (y === window.view.year ? ' active' : '');
      b.textContent = y;
      b.onclick = () => {
        window.view.year = y;
        // ao trocar de ano, mantém o mês mas respeita “futuro”
        const last = lastAllowedMonth(window.view.year);
        if (last >= 0 && window.view.month > last) window.view.month = last;
        if (last < 0) window.view.month = 0; // nenhum permitido
        renderCalendarStrip();
        if (typeof renderShelf === 'function') renderShelf();
        document.getElementById('yearPickerModal')?.classList.add('hidden');
      };
      ypYears.appendChild(b);
    });
  }

  ypPrev?.addEventListener('click', () => renderYearList(window.view.year - 1));
  ypNext?.addEventListener('click', () => renderYearList(window.view.year + 1));

  // primeira renderização (se o modal existir)
  renderYearList();
})();

/* ===== Chamada inicial ===== */
// chame isso DEPOIS que o DOM existir (você já usa <script type="module"> no final)
renderCalendarStrip();
renderTodayAnchor();


/* ===== Modal de anos ===== */
function renderYearPicker(center = view.year){
  const list = document.getElementById('ypYears'); if (!list) return;
  list.innerHTML = '';
  // mostra janela de 5 anos (center-1, center, center+1 … ajuste como quiser)
  const years = [center - 1, center, center + 1];
  years.forEach(y => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'year-item' + (y === view.year ? ' active' : '');
    b.textContent = y;
    b.onclick = () => {
      view.year = y;
      // se o mês selecionado for “futuro” nesse ano, recua para dezembro ou mês atual
      if (isFutureMonth(view.year, view.month)){
        const now = new Date();
        view.month = (view.year === now.getFullYear()) ? now.getMonth() : 11;
      }
      renderCalendarStrip();
      renderYearPicker(view.year);
      renderShelf();
      // fecha ao escolher
      document.getElementById('yearPickerModal')?.classList.add('hidden');
    };
    list.appendChild(b);
  });

  const prev = document.getElementById('ypPrev');
  const next = document.getElementById('ypNext');
  prev.onclick = () => renderYearPicker(center - 1);
  next.onclick = () => renderYearPicker(center + 1);
}

document.getElementById('yearButton')?.addEventListener('click', () => {
  renderYearPicker(view.year);
  document.getElementById('yearPickerModal')?.classList.remove('hidden');
});

// Fechar modal de anos clicando fora (segue seu padrão)
(function setupYearModalOutside(){
  const modal = document.getElementById('yearPickerModal');
  if (!modal) return;
  let pressedOnBackdrop = false;
  modal.addEventListener('pointerdown', (e)=>{ pressedOnBackdrop = (e.target === modal); });
  modal.addEventListener('click', (e)=>{ if (pressedOnBackdrop && e.target === modal) modal.classList.add('hidden'); pressedOnBackdrop=false; });
})();

const setText  = (id, value) => { const n = el(id); if (n) n.textContent = value; };
const setValue = (id, value) => { const n = el(id); if (n) n.value = value; };



/* =================== ESTADO =================== */
const state = {
  goal: 85, ppm: 1.5, interval: 5, read: 0,
  todaySeconds: 0,
  diary: [],                  // legado
  books: [],                  // {id,title,author,pages,status,cover,progress[],pagesRead,secondsRead,finishedAt}
  selectedBookId: null
};
const STORAGE_KEY = 'reading-app-v4';
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

/* ===== cover placeholder ===== */
function defaultCover(title='Livro'){
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="400" height="600">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0ea5e9"/><stop offset="100%" stop-color="#22c55e"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="#0b1220"/><rect x="12" y="12" width="376" height="576" rx="18" fill="url(#g)" opacity=".35"/>
    <text x="200" y="310" font-size="42" text-anchor="middle" fill="#e5e7eb" font-family="Arial" font-weight="700">${(title||'Livro').slice(0,18)}</text>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

/* ===== normalize ===== */
function normalizeBooks(){
  state.books.forEach(b=>{
    b.author ??= ''; b.pages ??= 0; b.status ??= 'novo';
    b.cover ??= ''; b.progress ??= []; b.pagesRead ??= 0; b.secondsRead ??= 0; b.finishedAt ??= null;
  });
}

/* ===== hoje (evita quebra mesmo sem elementos no HTML) ===== */
function updateTodayStats(){
  const secs = Number(state.todaySeconds || 0);
  const mins = Math.round(secs / 60);
  setText('todayTime',  `${mins} min`);
  setText('todayPages', Number(state.read || 0));
}

/* ========= LOAD ========= */
const load = () => {
  try {
    Object.assign(state, JSON.parse(localStorage.getItem(STORAGE_KEY)) || {});
  } catch {}

  // garante id e lista válidos (se você já tem essa helper)
  repairSelectedBookId();

  // normaliza uma única vez
  normalizeBooks();

  // inputs base
  setValue('goal',     state.goal);
  setValue('ppm',      state.ppm);
  setValue('interval', state.interval);
  setValue('read',     state.read);

  // selects e UI inicial
  renderBookSelect();
  renderTimerSelect();
  syncBookSelects();
  renderCurrentBookBar();   // uma vez só
  updatePagesPill();
  renderBookOverall();

  // se colou o helper, ajusta meta ao livro atual (opcional mas útil)
  ensureGoalFitsBook?.('bookChange');

  // grids/contadores
  render();
  renderShelf();
  updateCounters();
  updateTodayStats();
};


/* =================== UI: Drawer e BookBar =================== */
const drawer         = el('drawer');
const drawerToggle   = el('drawerToggle');
const currentBookBar = el('currentBookBar');

// mantém botão hambúrguer e barra do livro em sincronia com o estado do drawer
function syncHamburgerToDrawer(){
  const open = drawer?.classList.contains('open');
  drawerToggle?.classList.toggle('is-open', open);
  currentBookBar?.classList.toggle('hidden', open); // esconde só quando o drawer abrir
  updatePagesPill();
  renderBookOverall();
}

// garante que o app SEMPRE comece com drawer fechado
drawer?.classList.remove('open');
syncHamburgerToDrawer();

/* Clique no hambúrguer: alterna e sincroniza */
drawerToggle?.addEventListener('click', () => {
  drawer?.classList.toggle('open');
  syncHamburgerToDrawer();
});

/* Observa mudanças externas de classe no drawer e sincroniza */
if (drawer){
  const mo = new MutationObserver(syncHamburgerToDrawer);
  mo.observe(drawer, { attributes: true, attributeFilter: ['class'] });
}

/* Sincroniza no carregamento (caso o HTML já venha com .open) */
syncHamburgerToDrawer();


// ===== Colocar o título logo abaixo dos menus, só no PROGRESSO =====
function placeBookBar() {
  const bar   = document.getElementById('currentBookBar');
  const tabs  = document.querySelector('header .tabs');
  const hdr   = document.querySelector('header');
  const page  = document.querySelector('.tab.active')?.dataset.page;

  if (!bar || !hdr) return;

  const onProgresso = (page === 'progresso');

  if (onProgresso) {
    // garante que o título fique DENTRO do header e logo depois das tabs
    if (tabs) tabs.after(bar); else hdr.appendChild(bar);
    bar.classList.remove('hidden');
  } else {
    // fora do Progresso, esconde (não precisa manter no header)
    bar.classList.add('hidden');
    // opcional: se quiser devolver para fora do header, use:
    // hdr.after(bar);
  }
}

// chame SEMPRE que:
// - carregar a página
// - trocar de aba
// - abrir/fechar o drawer

/* ===== livros / selects ===== */
function renderBookSelect(){
  repairSelectedBookId();

  const sel = el('bookSelect');        // <<< aqui é bookSelect
  if (!sel) return;

  sel.innerHTML = '';
  state.books.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.title || '(sem título)';
    sel.appendChild(opt);
  });

  // seleciona o atual (se não bater, cai pro primeiro)
  sel.value = state.selectedBookId;
  if (sel.value !== state.selectedBookId){
    sel.value = state.books[0]?.id || '';
    state.selectedBookId = sel.value || null;
  }
}
// handler único para troca de livro
function onChangeBook(e){
  const id = e.target.value;
  if (!state.books.find(b => b.id === id)) return;

  state.selectedBookId = id;
  syncBookSelects();
  renderCurrentBookBar();
  updatePagesPill();
  renderBookOverall();
  ensureGoalFitsBook?.('bookChange'); // ajusta meta se passar do que falta
  save();
}

// liga o listener (e evita duplicado)
const bookSel = el('bookSelect');
if (bookSel){
  bookSel.removeEventListener('change', onChangeBook);
  bookSel.addEventListener('change', onChangeBook);
}

function renderBookOverall() {
  const book = state.books.find(b => b.id === state.selectedBookId);
  if (!book) return;

  const total = Math.max(0, Number(book.pages || 0));
  const lidas = Math.max(0, Number(book.pagesRead || 0));

  // Mostra lidas/total como dica, sem sobrescrever o valor numérico
  const input = el('read'); // seu input de “páginas do dia”
  if (input) {
    input.placeholder = `${lidas} / ${total}`;
    // importante: NÃO fazer input.value = "108/412"
  }
}


function renderTimerSelect(){
  const sel = el('timerBookSelect'); if (!sel) return;
  sel.innerHTML = '';
  state.books.forEach(b=>{
    const opt=document.createElement('option');
    opt.value=b.id; opt.textContent=b.title; sel.appendChild(opt);
  });
  sel.value = state.selectedBookId;
}

function syncBookSelects(){
  const mainSel  = el('bookSelect');
  const timerSel = el('timerBookSelect');
  if (mainSel)  mainSel.value  = state.selectedBookId;
  if (timerSel) timerSel.value = state.selectedBookId;
}

function renderCurrentBookBar(usePreview = true){
  const book = state.books.find(b => b.id === state.selectedBookId);

  // se não houver barra, sai
  const bar      = document.getElementById('currentBookBar');
  if (!bar) return;

  // elementos opcionais (se não existirem, a função ignora)
  const nameEl   = document.getElementById('currentBookName');
  const statusEl = document.getElementById('currentBookStatus');
  const coverEl  = document.getElementById('currentBookCover');

  // título
  if (nameEl) nameEl.textContent = book?.title || '—';

  // prévia: páginas lidas reais + páginas do dia (antes de gravar)
  let total = Math.max(1, Number(book?.pages || 1));
  let base  = Math.max(0, Number(book?.pagesRead || 0));
  let live  = Math.max(0, Number(state.read || 0));
  const previewRead = Math.min(total, base + (usePreview ? live : 0));

  const pct = Math.min(100, Math.round((previewRead / total) * 100));

  // status
  if (statusEl) {
    let label = 'Novo';
    if (pct >= 100)            label = 'Lido • 100%';
    else if (pct > 0)          label = `Lendo • ${pct}%`;
    statusEl.textContent = label;
  }

  // capa: só mostra quando 100%
  if (coverEl) {
    if (pct >= 100) {
      coverEl.src = (book?.cover || defaultCover(book?.title || 'Livro'));
      coverEl.classList.remove('hidden');
    } else {
      coverEl.classList.add('hidden');
    }
  }
  // marca a barra como concluída para o CSS estilizar
  bar?.classList.toggle('is-complete', pct >= 100);

  // continua escondendo a barra quando o drawer abre
  bar.classList.toggle('hidden', drawer?.classList.contains('open'));
}

function getSelectedBook(){
  return state.books.find(b => b.id === state.selectedBookId);
}

function pctForBook(book){
  const total = Math.max(1, Number(book.pages||0));
  const read  = Math.max(0, Number(book.pagesRead||0));
  return Math.min(100, Math.round((read/total)*100));
}

function pillClassForPct(p){
  if (p >= 90) return 'pill-blue';
  if (p >= 70) return 'pill-green';
  if (p >= 40) return 'pill-amber';
  if (p >   0) return 'pill-red';
  return 'pill-gray';
}

function updatePagesPill(){
  const book = getSelectedBook(); if(!book) return;
  const pillRead  = $('#pillRead');
  const pillTotal = $('#pillTotal');
  const badge     = $('#pagesPill .pill-badge');
  if (pillRead)  pillRead.textContent  = Number(book.pagesRead||0);
  if (pillTotal) pillTotal.textContent = Number(book.pages||0);
  if (badge)     badge.className = 'pill-badge ' + pillClassForPct(pctForBook(book));
}

el('bookSelect')?.addEventListener('change', (e)=>{ 
  state.selectedBookId = e.target.value;
  syncBookSelects();
  renderCurrentBookBar();
  updatePagesPill();
  renderBookOverall();
  ensureGoalFitsBook('bookChange');
  save();
});

document.addEventListener('change', (e)=>{ 
  if (e.target?.id === 'timerBookSelect') {
    state.selectedBookId = e.target.value;
    syncBookSelects();
    renderCurrentBookBar();
    updatePagesPill();
    renderBookOverall(); 
    save();
  }
});

/* =================== MODAL: Adicionar Livro =================== */
const modal = el('bookModal');
const addBookBtn = el('addBookBtn');
const bkTitle = el('bk_title'), bkAuthor = el('bk_author'), bkPages = el('bk_pages');
const bkCoverInput = el('bk_cover'); const bkCoverPreview = el('bk_cover_preview');
let bkStatus = 'novo', bkCoverDataURL = '';

addBookBtn?.addEventListener('click', openModal);
$('#bk_cancel')?.addEventListener('click', closeModal);
$('#bk_save')?.addEventListener('click', saveBook);

$$('#bk_status .chip').forEach(ch => {
  ch.addEventListener('click', ()=>{
    $$('#bk_status .chip').forEach(x=>x.classList.remove('active'));
    ch.classList.add('active'); bkStatus = ch.dataset.v;
  });
});

bkCoverInput?.addEventListener('change', (e)=>{
  const file = e.target.files?.[0];
  if(!file){
    bkCoverDataURL=''; if (bkCoverPreview) bkCoverPreview.src = defaultCover(bkTitle.value||'Livro'); return;
  }
  const reader = new FileReader();
  reader.onload = () => { bkCoverDataURL = reader.result; if (bkCoverPreview) bkCoverPreview.src = bkCoverDataURL; };
  reader.readAsDataURL(file);
});

function openModal(){ if (!modal) return;
  bkTitle.value=''; bkAuthor.value=''; bkPages.value=''; bkStatus='novo'; bkCoverDataURL='';
  $$('#bk_status .chip').forEach(x=>x.classList.toggle('active', x.dataset.v==='novo'));
  if (bkCoverPreview) bkCoverPreview.src = defaultCover('Livro');
  modal.classList.remove('hidden');
}
function closeModal(){ modal?.classList.add('hidden'); }
// fechar o modal "Novo livro" clicando fora da caixa
modal?.addEventListener('click', (e) => {
  const caixa = e.target.closest('.modal-card');
  if (!caixa) closeModal();
});

function saveBook(){
  const title = bkTitle.value.trim();
  const author = bkAuthor.value.trim();
  const pages = Math.max(0, Number(bkPages.value||0));
  if(!title){ alert('Dê um nome ao livro.'); return; }
  const cover = bkCoverDataURL || defaultCover(title);

  const book = {
    id: crypto.randomUUID(),
    title,
    author,
    pages,
    status: bkStatus,
    cover,
    progress: [],
    pagesRead: 0,
    secondsRead: 0,
    createdAt: new Date().toISOString(), // ⬅️ novo
    finishedAt: null
  };

  state.books.push(book);
  state.selectedBookId = book.id;
  closeModal();
  renderBookSelect(); renderTimerSelect(); syncBookSelects(); renderCurrentBookBar();
  renderShelf(); updatePagesPill(); renderBookOverall(); save();
}



/* ===== PAGES EDIT MODAL ===== */
const peModal = el('pagesEditModal');
const peRead  = el('pe_read');
const peTotal = el('pe_total');

function openPagesEdit(){
  const book = getSelectedBook(); if(!book) return;
  peRead.value  = Number(book.pagesRead || 0);
  peTotal.value = Math.max(1, Number(book.pages || 1));
  peModal.classList.remove('hidden');
}
function closePagesEdit(){ peModal.classList.add('hidden'); }

el('pagesPill')?.addEventListener('click', openPagesEdit);

peModal?.addEventListener('click', (e)=>{
  const card = e.target.closest('.modal-card');
  if (!card) closePagesEdit();
});

$('#pe_cancel')?.addEventListener('click', closePagesEdit);
$('#pe_save')?.addEventListener('click', ()=>{
  const book = getSelectedBook(); if(!book) return;

  const total = Math.max(1, Number(peTotal.value||1));
  let read    = Math.max(0, Number(peRead.value||0));
  if (read > total) read = total;

  book.pages     = total;
  book.pagesRead = read;

  const pct = pctForBook(book);
  if (pct >= 100){ book.status='lido'; book.finishedAt ||= new Date().toISOString(); }
  else if (pct > 0 && book.status==='novo'){ book.status='lendo'; }
  if (pct < 100){ book.finishedAt = null; } // caso reduza o total

  save();
  updatePagesPill();
  renderShelf();
  closePagesEdit();
});


/* =================== PROGRESSO (grid + controles) =================== */
const pagesPerCycle = () => Math.max(1, Math.round(state.ppm * state.interval));
const totalRows     = () => Math.ceil(state.goal / pagesPerCycle());

function fmtMinutes(m){
  // >=5min arredonda inteiro; <5min mostra 1 casa
  return (m >= 5 ? Math.round(m) : Math.round(m*10)/10) + 'm';
}

function render(){
  const rem  = remainingForSelectedBook();
  const goal = Math.min(state.goal, rem || state.goal); // se não houver restante, usa a meta

  const left = Math.max(0, goal - state.read);
  setText('pagesLeft', left);
  setText('pace',      pagesPerCycle());
  setText('eta',       `${Math.ceil(left / (state.ppm || 0.1))} min`);

  // trava/destrava controles se o livro terminou
  disableReadingControls(isSelectedBookDone());

  const grid = el('grid'); if (!grid) return;
  grid.innerHTML = '';

  const ppc  = pagesPerCycle();
  const rows = Math.max(1, Math.ceil(goal / ppc));

  for (let r = 0; r < rows; r++) {
    const row   = document.createElement('div'); row.className = 'row-grid';
    const cycle = document.createElement('div'); cycle.className = 'cycle'; cycle.textContent = r + 1;

    const cells = document.createElement('div'); cells.className = 'cells';

    const start = r * ppc;
    const end   = Math.min((r + 1) * ppc, goal);  // <= aqui

    for (let i = start; i < end; i++) {
      const c = document.createElement('div');
      c.className = 'cell' + (i < state.read ? ' done' : '');
      cells.appendChild(c);
    }

    const pagesThisRow = end - start;
    let minutesThisRow;
    if (pagesThisRow === ppc) minutesThisRow = state.interval;
    else minutesThisRow = Math.ceil(pagesThisRow / (state.ppm || 0.1));

    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = fmtMinutes(minutesThisRow);

    row.append(cycle, cells, time);
    grid.appendChild(row);
  }

  const dc = el('dayCount'); if (dc) dc.textContent = state.read;
  renderCurrentBookBar(true);
  save();
}


['goal','ppm','interval','read'].forEach(id => {
  el(id)?.addEventListener('input', () => {
    const v = Number((el(id).value || '').toString().replace(',', '.'));
    state[id] = isFinite(v) ? v : state[id];

    if (id === 'goal') {
      // pode ou não ajustar a meta ao restante do livro…
      ensureGoalFitsBook('goalChange'); // …essa função chama render() só quando ajusta
      render(); // …garante re-render SEMPRE que a meta muda
      return;
    }

    render();
  });
});



el('plus1')?.addEventListener('click', () => {
  state.read = Math.min(dayCap(), state.read + 1);
  render();
});
el('minus1')?.addEventListener('click', () => {
  state.read = Math.max(0, state.read - 1);
  render();
});
el('cycleDone')?.addEventListener('click', () => {
  state.read = Math.min(dayCap(), state.read + pagesPerCycle());
  render();
});
el('clearAll')?.addEventListener('click', () => {
  if (confirm('Zerar apenas as páginas lidas hoje?')) {
    state.read = 0;
    render();
  }
});

/* =================== REVIEW MODAL (abre ao gravar dia) =================== */
const rvModal = el('reviewModal');
const rvStars = el('rv_stars');
const rvNote  = el('rv_note');
let rvRating = 0;

function renderStars(container, value){
  if (!container) return;

  // impede que qualquer clique dentro do bloco das estrelas feche o modal
  container.onclick = (e) => e.stopPropagation();

  container.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.className = 'star' + (i <= value ? ' on' : '');
    s.textContent = '★';
    s.dataset.v = i;
    s.setAttribute('role', 'button');
    s.setAttribute('aria-label', `${i} estrela${i>1?'s':''}`);

    // bloqueia a propagação para o backdrop antes de re-renderizar
    s.addEventListener('pointerdown', (e) => e.stopPropagation());
    s.addEventListener('click', (e) => {
      e.stopPropagation();            // ⬅️ chave para não fechar o modal
      rvRating = i;
      renderStars(container, rvRating);
    });

    container.appendChild(s);
  }
}

function openReviewModal(){
  rvRating = 0;
  if (rvNote) rvNote.value = '';
  renderStars(rvStars, rvRating);
  rvModal?.classList.remove('hidden');
}
function closeReviewModal(){ rvModal?.classList.add('hidden'); }

rvModal?.addEventListener('click', (e)=>{
  if (e.target === rvModal) closeReviewModal();
});
$('#rv_cancel')?.addEventListener('click', closeReviewModal);
$('#rv_x')?.addEventListener('click', closeReviewModal);

el('saveDay')?.addEventListener('click', () => {
  if (!state.read) { alert('Nada para gravar ainda.'); return; }

  const rem = remainingForSelectedBook();
  if (rem === 0){
    alert('Este livro já está concluído. Edite as páginas para continuar.');
    return;
  }
  if (state.read > rem){
    state.read = rem; // nunca passa do restante
  }
  openReviewModal();
});

$('#rv_save')?.addEventListener('click', (e) => {
  e.preventDefault();
  const book = state.books.find(b => b.id === state.selectedBookId);
  if (!book) { alert('Selecione um livro.'); return; }

  const entry = {
    dateISO: new Date().toISOString(),
    book: book.title,
    pages: state.read,
    seconds: state.todaySeconds,
    rating: rvRating || 0,
    note: (rvNote?.value || '').trim()
  };

  // legado (export)
  state.diary.unshift(entry);

  // grava no livro
  book.progress.unshift({
    dateISO: entry.dateISO,
    pages: entry.pages,
    seconds: entry.seconds,
    rating: entry.rating,
    note: entry.note
  });
  book.pagesRead += entry.pages;
  book.secondsRead += entry.seconds;

  const total = Math.max(1, Number(book.pages || 0));
  const pct = Math.min(100, Math.round((book.pagesRead / total) * 100));

  // quando completar 100% e ainda não tiver carimbo de conclusão
  if (pct >= 100 && !book.finishedAt) {
    book.finishedAt = entry.dateISO;  // <-- data exata do registro
    book.status = 'lido';
    book.pagesRead = total;           // fecha exatamente no total
  } else if (pct > 0 && book.status === 'novo') {
    book.status = 'lendo';
  }

  // limpar “hoje”
  state.read = 0; state.todaySeconds = 0; setValue('read', 0);

  closeReviewModal();
  rvRating = 0;
  render(); renderShelf(); updateCounters(); updateTodayStats(); updatePagesPill(); save(); refreshFinishedModalIfOpen();
  alert('Registro gravado!');
});



/* =================== TIMER =================== */
let timer = { totalSec:25*60, remaining:25*60, running:false, handle:null, elapsed:0 };
const fmt = s => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;

function syncTimer(){
  setText('timerDisplay', fmt(timer.remaining));
setValue('timerMinutes', Math.ceil(timer.totalSec/60));
}
function setTimerFromInput(){
  const tm = el('timerMinutes');
  const m = Math.max(1, Number(tm?.value||25));
  timer.totalSec = m*60;
  if(!timer.running){ timer.remaining = timer.totalSec; }
  syncTimer(); saveTimer();
}
function tick(){
  if(!timer.running) return;
  timer.remaining--; timer.elapsed++;
  if(timer.remaining<=0){
    timer.running=false; clearInterval(timer.handle); notifyFinish();
  }
  syncTimer(); saveTimer();
}
function start(){ if(timer.running) return; timer.running=true; timer.handle=setInterval(tick,1000); setActive('start'); saveTimer(); }
function pause(){ timer.running=false; clearInterval(timer.handle); setActive('pause'); saveTimer(); }
function reset(){ timer.running=false; clearInterval(timer.handle); timer.remaining=timer.totalSec; timer.elapsed=0; setActive(null); syncTimer(); saveTimer(); }
function notifyFinish(){ try{ if('vibrate' in navigator) navigator.vibrate([200,100,200]); }catch{} alert('Tempo encerrado! Registre as páginas e toque em "Adicionar ao progresso".'); }
function saveTimer(){ localStorage.setItem('reading-timer-v3', JSON.stringify(timer)); }
function loadTimer(){ try{ Object.assign(timer, JSON.parse(localStorage.getItem('reading-timer-v3')) || {}); }catch{} syncTimer(); if(timer.running){ start(); } }

el('timerMinutes')?.addEventListener('input', setTimerFromInput);
el('timerStart')?.addEventListener('click', start);
el('timerPause')?.addEventListener('click', pause);
el('timerReset')?.addEventListener('click', reset);
el('timerCommit')?.addEventListener('click', () => {
  if (isSelectedBookDone()){
    alert('Este livro já está concluído. Edite as páginas para continuar.');
    return;
  }
  const add = Math.max(0, Number(el('timerPagesRead')?.value||0));
  if(add>0){
    const cap = dayCap();
    state.read = Math.min(cap, state.read + add);
    state.todaySeconds += timer.elapsed;
    timer.elapsed = 0;
    render(); updateTodayStats(); save();
    const tpr = el('timerPagesRead'); if (tpr) tpr.value = 0;
    alert('Progresso atualizado!');
  }
});
function setActive(which){
  const s = el('timerStart'), p = el('timerPause');
  [s,p].forEach(b=>b?.classList.remove('active'));
  if(which==='start') s?.classList.add('active');
  if(which==='pause') p?.classList.add('active');
}

function renameTimerLabels(){
  const lblMeta = document.querySelector('label[for="timerTargetPages"]');
  if (lblMeta) lblMeta.textContent = 'Meta de páginas';
};

/* =================== DIÁRIO: Estante =================== */
function booksFinishedIn(range){
  const now = new Date();
  return state.books.filter(b=>{
    if(!b.finishedAt) return false;
    const d = new Date(b.finishedAt);
    if (range==='year')  return d.getFullYear()===now.getFullYear();
    if (range==='month') return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
    return false;
  }).length;
}
function bookPercent(b){
  const total = Math.max(1, Number(b.pages||0));
  return Math.min(100, Math.round((Number(b.pagesRead||0)/total)*100));
}
function updateCounters(){
  const y = (window.view && typeof window.view.year  === 'number')
    ? window.view.year  : new Date().getFullYear();
  const m = (window.view && typeof window.view.month === 'number')
    ? window.view.month : new Date().getMonth();

  setText('cntMonth', finishedBooksByMonth(y, m).length);
  setText('cntYear',  finishedBooksByYear(y).length);
}


function renderShelf(){
  const shelf = el('shelf');
  if (!shelf) return;
  shelf.innerHTML = '';

  const now = new Date();
  const y = (window.view && typeof window.view.year  === 'number')
    ? window.view.year  : now.getFullYear();
  const m = (window.view && typeof window.view.month === 'number')
    ? window.view.month : now.getMonth();

  const visibleBooks = (state.books || []).filter(b => {
    if (b.title?.startsWith('— selecione')) return false;

    // Concluído: só no mês/ano do finishedAt
    if (b.finishedAt) {
      const f = new Date(b.finishedAt);
      return f.getFullYear() === y && f.getMonth() === m;
    }

    // Não concluído: aparece de createdAt até o mês atual (nunca no futuro)
    const created = getCreatedAt(b);

    const afterCreation =
      (y > created.getFullYear()) ||
      (y === created.getFullYear() && m >= created.getMonth());

    const notInFuture =
      (y < now.getFullYear()) ||
      (y === now.getFullYear() && m <= now.getMonth());

    return afterCreation && notInFuture;
  });

  // render
  visibleBooks.forEach(book => {
    const card = createBookCard(book);
    shelf.appendChild(card);
  });

  // vazio?
  if (visibleBooks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-shelf';
    empty.textContent = 'Nenhum livro para este mês.';
    shelf.appendChild(empty);
  }

  // mantém contadores sincronizados com o mês/ano selecionados
  updateCounters();
}

// expõe para os cliques do calendário (que chamam window.renderShelf?.())
window.renderShelf = renderShelf;

// deixa disponível para os cliques do calendário (que chamam window.renderShelf?.())
window.renderShelf = renderShelf;

el('shelf')?.addEventListener('click', (e)=>{
  const card = e.target.closest('.book-card'); if(!card) return;
  const book = state.books.find(b=> b.id === card.dataset.id); if(!book) return;

  if (ui.selectMode){
    const now = !ui.selected.has(book.id);
    toggleSelect(book.id, now);
    // marca/desmarca o checkbox visual
    const cb = card.querySelector('.select-check'); if (cb) cb.checked = now;
    return; // não abre o detalhe no modo seleção
  }

  state.selectedBookId = book.id;
  openDetail(book);
});


/* ===== Modal de edição de metas ===== */
function openGoalEditModal(type){
  const modal = document.getElementById('goalEditModal');
  const title = document.getElementById('geTitle');
  const input = document.getElementById('geInput');
  const msg   = document.getElementById('geMessage');
  const saveB = document.getElementById('geSave');

  if (!modal || !title || !input || !msg || !saveB) return;

  title.textContent = (type==='month') ? 'Meta mensal' : 'Meta anual';
  input.value = (state.meta?.[type+'Books'] || '') || '';
  msg.textContent = input.value ? goalMessage(type, Number(input.value)) : 'Digite um número…';

  modal.classList.remove('hidden');

  input.oninput = () => {
    const v = Number(input.value||0);
    msg.textContent = v ? goalMessage(type,v) : 'Digite um número…';
  };

  saveB.onclick = () => {
    const v = Math.max(1, Number(input.value||0));
    if (!state.meta) state.meta = {};
    state.meta[type+'Books'] = v;
    save();
    modal.classList.add('hidden');
    // reabrir finishedModal atualizado
    if (type==='month') openFinishedModal({type:'month', year:view.year, month:view.month});
    else openFinishedModal({type:'year', year:view.year});
  };
}

document.getElementById('geClose')?.addEventListener('click', ()=> {
  document.getElementById('goalEditModal')?.classList.add('hidden');
});
setupModalCloseOnOutside('goalEditModal');

/* ===== Frases motivacionais ===== */
function goalMessage(type, v){
  const msgsMonth = {
    1: "Jogar no básico é sempre mais seguro — e assim se vai longe.",
    2: "Dois já dão ritmo. Bora!",
    3: "Trinca certeira! Foco que dá!",
    4: "Quatro pede constância, mas tá tranquilo.",
    5: "Boa média! Precisa de determinação… vamos nessa!",
    6: "Seis é maratona leve, dá pra manter.",
    7: "Sete: já exige disciplina de verdade.",
    8: "Oito livros? Tá buscando nível avançado!",
    9: "Nove: agora é jogo de elite.",
    10:"This is what I'm talking about!!! Vamos com TUDOO!!"
  };
  const msgsYear = {
    1: "Uma leitura por ano: devagar e sempre.",
    5: "Cinco livros no ano é um belo hábito!",
    10: "Dez no ano: rotina de leitor raiz!",
    11: "Onze livros! A engrenagem tá rodando.",
    12: "Doze: um por mês! Ritmo perfeito.",
    13: "Treze leituras, já virou superstição boa.",
    14: "Quatorze: quase quinze, bora seguir firme!",
    15: "Quinze livros! Você tá numa maratona.",
    16: "Dezesseis: disciplina e constância.",
    17: "Dezessete leituras, já parece profissional.",
    18: "Dezoito livros: dá pra sentir evolução!",
    19: "Dezenove! Chegando nos vinte!",
    20: "Vinte? Tá virando lenda!",
    21: "Vinte e um: é vitória atrás de vitória.",
    22: "Vinte e dois: leitor imbatível.",
    23: "Vinte e três livros, disciplina exemplar.",
    24: "Vinte e quatro: dois por mês!",
    25: "Vinte e cinco livros, metade de cinquenta!",
    26: "Vinte e seis: nível intermediário de maratonista.",
    27: "Vinte e sete leituras: foco absurdo.",
    28: "Vinte e oito: tá quase em trinta!",
    29: "Vinte e nove: mais um e fecha trintão!",
    30: "Trinta livros: disciplina de monge.",
    31: "Trinta e um: começa a segunda metade do ano forte.",
    32: "Trinta e dois: leitura sem parar!",
    33: "Trinta e três: número místico, leitor lendário.",
    34: "Trinta e quatro: já não tem volta!",
    35: "Trinta e cinco livros: potência literária.",
    36: "Trinta e seis: constância absurda.",
    37: "Trinta e sete leituras, visão de águia.",
    38: "Trinta e oito: leitor de elite.",
    39: "Trinta e nove, só falta um pro quarentão!",
    40: "Quarenta é missão de maratonista literário.",
    41: "Quarenta e um: começou a escalada final.",
    42: "Quarenta e dois: leitor sideral!",
    43: "Quarenta e três leituras, quase cinquenta.",
    44: "Quarenta e quatro: ritmo avassalador.",
    45: "Quarenta e cinco livros! Que disciplina!",
    46: "Quarenta e seis leituras firmes.",
    47: "Quarenta e sete: tá voando!",
    48: "Quarenta e oito: duas dúzias x2!",
    49: "Quarenta e nove, falta só um pro cinquentão.",
    50: "Cinquenta no ano? Profissional da leitura!",
    51: "Cinquenta e um: ultrapassando limites.",
    52: "Cinquenta e dois: um por semana!",
    53: "Cinquenta e três: resistência literária.",
    54: "Cinquenta e quatro leituras: disciplina de atleta.",
    55: "Cinquenta e cinco: quase sessentinha!",
    56: "Cinquenta e seis: nível sobre-humano.",
    57: "Cinquenta e sete livros: respeita!",
    58: "Cinquenta e oito: foco absoluto.",
    59: "Cinquenta e nove: rumo aos sessenta.",
    60: "Sessenta leituras! Pódio garantido.",
    61: "Sessenta e um: começou a jornada final.",
    62: "Sessenta e dois: imparável.",
    63: "Sessenta e três: firme, constante.",
    64: "Sessenta e quatro: oito por oito!",
    65: "Sessenta e cinco livros: quase setenta!",
    66: "Sessenta e seis: nível lendário.",
    67: "Sessenta e sete leituras, você é exemplo.",
    68: "Sessenta e oito: ultrapassando barreiras.",
    69: "Sessenta e nove, falta um pro setentão!",
    70: "Setenta livros: resistência absurda.",
    71: "Setenta e um: maratona infinita.",
    72: "Setenta e dois: seis por mês!",
    73: "Setenta e três leituras: respeito máximo.",
    74: "Setenta e quatro: imparável.",
    75: "Setenta e cinco: três quartos do caminho!",
    76: "Setenta e seis: disciplina insana.",
    77: "Setenta e sete: número mágico, leitor supremo.",
    78: "Setenta e oito livros: grandeza literária.",
    79: "Setenta e nove: já bateu recordes.",
    80: "Oitenta leituras: atleta literário.",
    81: "Oitenta e um: resistência pura.",
    82: "Oitenta e dois: recorde atrás de recorde.",
    83: "Oitenta e três: maratonista profissional.",
    84: "Oitenta e quatro leituras, constância exemplar.",
    85: "Oitenta e cinco: só quinze pro cem!",
    86: "Oitenta e seis: quase lá.",
    87: "Oitenta e sete: foco total.",
    88: "Oitenta e oito: dois infinitos literários.",
    89: "Oitenta e nove: falta um pro noventão!",
    90: "Noventa leituras: mestre da leitura.",
    91: "Noventa e um: reta final.",
    92: "Noventa e dois: o impossível virou rotina.",
    93: "Noventa e três: disciplina inabalável.",
    94: "Noventa e quatro: imparável!",
    95: "Noventa e cinco: só cinco pro cem!",
    96: "Noventa e seis leituras: meta lendária.",
    97: "Noventa e sete livros: orgulho puro.",
    98: "Noventa e oito: tá batendo no limite!",
    99: "Noventa e nove: só falta UM!",
    100: "CEM livros no ano! Você é MITO da leitura!",
  };
  if (type==='month'){
    return msgsMonth[v] || (v>10 ? "Meta ousada! Vamos superar limites!" : "");
  } else {
    // pega a maior chave <= v
    let chosen = "";
    Object.keys(msgsYear).map(Number).sort((a,b)=>a-b).forEach(k=>{
      if (v>=k) chosen = msgsYear[k];
    });
    return chosen || "Bora criar consistência!";
  }
}

// Apagar TODOS os registros deste livro
$('#bd_deleteLogs')?.addEventListener('click', () => {
  const book = state.books.find(b => b.id === state.selectedBookId);
  if (!book) return;
  if (!confirm(`Apagar TODOS os registros de "${book.title}"?`)) return;

  book.progress = [];
  book.pagesRead = 0;
  book.secondsRead = 0;
  book.status = 'novo';
  book.finishedAt = null;
  save();
  openDetail(book);
  renderShelf();
  updateCounters();
  updatePagesPill();

});

// Apagar o livro inteiro
$('#bd_deleteBook')?.addEventListener('click', () => {
  const book = state.books.find(b => b.id === state.selectedBookId);
  if (!book) return;
  if (!confirm(`Apagar o livro "${book.title}"? Esta ação não pode ser desfeita.`)) return;

  state.books = state.books.filter(b => b.id !== book.id);
  state.selectedBookId = state.books[0]?.id || null;

  save();
  bdModal?.classList.add('hidden');
  renderBookSelect(); renderTimerSelect(); syncBookSelects(); renderCurrentBookBar();updatePagesPill();        // <— ADICIONE
  renderBookOverall();
  renderShelf(); updateCounters(); updatePagesPill();
});

function deleteBookById(bookId){
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;

  confirmDialog({
    title: 'Apagar livro',
    msg: `Apagar o livro "<b>${book.title}</b>" e <b>todos os registros</b>? Esta ação não pode ser desfeita.`,
    okLabel: 'Apagar',
    onOk: (ok) => {
      if (!ok) return;

      state.books = state.books.filter(b => b.id !== book.id);
      if (state.selectedBookId === book.id) {
        state.selectedBookId = state.books[0]?.id || null;
      }

      save();
      el('bookDetailModal')?.classList.add('hidden');
      renderBookSelect(); renderTimerSelect(); syncBookSelects();
      renderCurrentBookBar(); updatePagesPill();
      renderShelf(); updateCounters();
    }
  });
}

$('#bd_trash')?.addEventListener('click', () => {
  const book = getSelectedBook(); if (!book) return;
  deleteBookById(book.id);
});
$('#bd_deleteBook')?.addEventListener('click', () => {
  const book = getSelectedBook(); if (!book) return;
  deleteBookById(book.id);
});

/* ============== DATA em Diário ============== */
function renderTodayCard(){
  const now = new Date();

  // “Set 25”: mês abreviado + ano 2 dígitos
  const mesAbrev = new Intl.DateTimeFormat('pt-BR', { month:'short' }).format(now);
  const ano2 = String(now.getFullYear()).slice(-2);
  const topo = `${mesAbrev.charAt(0).toUpperCase()+mesAbrev.slice(1)} ${ano2}`;

  // “01”: dia com 2 dígitos
  const dia = String(now.getDate()).padStart(2,'0');

  // “Seg”: dia da semana abreviado
  const semana = new Intl.DateTimeFormat('pt-BR', { weekday:'short' })
                 .format(now).replace('.', ''); // alguns navegadores colocam ponto

  const tcMonth = document.getElementById('tcMonth');
  const tcDay   = document.getElementById('tcDay');
  const tcWeek  = document.getElementById('tcWeek');

  if (tcMonth) tcMonth.textContent = topo;
  if (tcDay)   tcDay.textContent   = dia;
  if (tcWeek)  tcWeek.textContent  = semana.charAt(0).toUpperCase()+semana.slice(1);
}


// ====== Seleção em Lote (Diário)
const ui = { selectMode: false, selected: new Set() };

function updateBulkUI(){
  const btn = el('shelfBulkDelete');
  $('#shelfBulkDelete')?.classList.toggle('hidden', !ui.selectMode);
  $('#shelfSelectToggle')?.classList.toggle('active', ui.selectMode);
  setText('selectedCount', ui.selected.size);
  if (btn) btn.disabled = !ui.selectMode || ui.selected.size === 0;
}

function setSelectMode(on){
  ui.selectMode = !!on;
  ui.selected.clear();
  updateBulkUI();
  el('shelf')?.classList.toggle('is-select-mode', ui.selectMode); // precisa disso
  renderShelf();
}

function toggleSelect(id, checked){
  if (checked) ui.selected.add(id);
  else ui.selected.delete(id);
  setText('selectedCount', ui.selected.size);
  updateBulkUI();
}

// ← DEIXE SÓ ESTE
$('#shelfSelectToggle')?.addEventListener('click', () => {
  setSelectMode(!ui.selectMode);
});

// botão “Apagar selecionados”
el('shelfBulkDelete')?.addEventListener('click', (e) => {
  e.preventDefault();
  openBulkDeleteConfirm();
});


// === Apagar selecionados (bulk) === //
function performBulkDelete(ids){
  // remove livros do estado
  state.books = state.books.filter(b => !ids.has(b.id));

  // corrige seleção atual
  if (!state.books.find(b => b.id === state.selectedBookId)) {
    state.selectedBookId = state.books[0]?.id || null; // <- sem espaço aqui
  }

  // persiste e refaz UI
  save();
  setSelectMode(false); // sai do modo seleção
  renderBookSelect(); renderTimerSelect(); syncBookSelects();
  renderCurrentBookBar(); updatePagesPill();
  renderShelf(); updateCounters();
}


function openBulkDeleteConfirm(){
  const n = ui.selected.size;
  if (!n) { alert('Selecione ao menos 1 livro.'); return; }

  const ids = new Set(ui.selected);

  const modal  = el('confirmDeleteModal');
  const title  = el('cd_bookTitle');
  const btnYes = el('cd_yes');
  const btnNo  = el('cd_no');

  if (modal && btnYes && btnNo){
    if (title) title.textContent = `${n} livro(s) selecionado(s)`;
    modal.classList.remove('hidden');

    const onYes = () => {
      performBulkDelete(ids);
      modal.classList.add('hidden');
      btnYes.removeEventListener('click', onYes);
    };
    const onNo = () => {
      modal.classList.add('hidden');
      btnYes.removeEventListener('click', onYes);
    };

    btnYes.addEventListener('click', onYes, { once:false });
    btnNo.addEventListener('click', onNo,  { once:true  });
    return;
  }

  // fallback nativo
  if (confirm(`Apagar ${n} livro(s) selecionado(s) e todos os registros?`)){
    performBulkDelete(ids);
  }
}

// liga o botão
el('shelfBulkDelete')?.addEventListener('click', (e) => {
  e.preventDefault();
  openBulkDeleteConfirm();
});


/* ======= Modal de Detalhe ======= */
const bdModal = el('bookDetailModal');

// fechar clicando fora (overlay)
bdModal?.addEventListener('click', (e)=>{
  if (e.target === bdModal) bdModal.classList.add('hidden');
});

// botões fechar (compatíveis com HTML atual)
$('#bd_close')?.addEventListener('click', ()=> bdModal.classList.add('hidden'));
$('#bd_x')?.addEventListener('click', ()=> bdModal.classList.add('hidden'));
// (mantém compatibilidade se existir um antigo)
$('#bd_fechar')?.addEventListener('click', ()=> bdModal.classList.add('hidden'));

function openDetail(book){
  $('#bd_title').textContent = book.title || '—';
  $('#bd_cover').src = book.cover || defaultCover(book.title);
  $('#bd_author').textContent = book.author || '—';
  $('#bd_pages').textContent  = Number(book.pages||0);

  $('#bd_time').textContent   = `${Math.round((book.secondsRead||0)/60)} min`;
  const spm = (book.secondsRead||0) ? (book.pagesRead / ((book.secondsRead)/60)) : 0;
  $('#bd_speed').textContent  = `${(spm||0).toFixed(2)} pág/min`;

  // média de estrelas
  const ratings = (book.progress||[]).map(p=>Number(p.rating||0)).filter(Boolean);
  const avg = ratings.length ? ratings.reduce((a,b)=>a+b,0)/ratings.length : 0;
  renderAvgStars($('#bd_avgStars'), avg);

  // registros
  const logs = $('#bd_logs'); if (!logs) return;
  logs.innerHTML='';
  (book.progress||[]).forEach(p=>{
    const item = document.createElement('div'); item.className='bd-log';

    const head = document.createElement('div'); head.className='bd-log-head';
    const left = document.createElement('div');
    left.textContent = `${new Date(p.dateISO).toLocaleDateString()} • ${p.pages||0} pág • ${Math.round((p.seconds||0)/60)} min`;

    const right = document.createElement('div');
    right.className = 'bd-log-stars';
    right.innerHTML = starRowHTML(p.rating||0);

    head.append(left, right);
    item.append(head);

    if ((p.note||'').trim()){
      const note = document.createElement('div'); note.className='bd-log-note';
      note.textContent = p.note.trim();
      item.append(note);
    }
    logs.appendChild(item);
  });

  bdModal?.classList.remove('hidden');
}



function starRowHTML(n){
  let s = '';
  for (let i = 1; i <= 5; i++) {
    s += `<span class="star ${i <= n ? 'on' : ''}">${i <= n ? '★' : '☆'}</span>`;
  }
  return s;
}

function renderAvgStars(container, avg){
  if (!container) return;
  container.innerHTML = '';
  const round = Math.round(avg);
  for (let i = 1; i <= 5; i++) {
    const span = document.createElement('span');
    span.className = 'star' + (i <= round ? ' on' : '');
    span.textContent = i <= round ? '★' : '☆';
    span.title = `${avg.toFixed(1)} / 5`;
    container.appendChild(span);
  }
}

/* — Export CSV baseado nos progressos por livro */
el('exportCsv')?.addEventListener('click', () => {
  const rows = [['data','livro','paginas','tempo(min)','rating','nota']];
  state.books.forEach(b=>{
    (b.progress||[]).forEach(p=>{
      const d = new Date(p.dateISO).toISOString().split('T')[0];
      rows.push([d, b.title||'', p.pages||0, Math.round((p.seconds||0)/60), p.rating||0, (p.note||'').replace(/\n/g,' ') ]);
    });
  });
  if(rows.length===1){ alert('Sem registros para exportar.'); return; }
  const csv = rows.map(l=>l.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='diario-leitura.csv'; a.click(); URL.revokeObjectURL(url);
});
el('clearDiary')?.addEventListener('click', () => {
  if(confirm('Apagar TODOS os registros do diário (de todos os livros)?')){
    state.books.forEach(b=>{ b.progress=[]; b.pagesRead=0; b.secondsRead=0; b.status='novo'; b.finishedAt=null; });
    state.diary = []; renderShelf(); updateCounters(); save();
  }
});

/* ========= NOOOVOOO =========== */

// abrir confirmação
$('#bd_delete')?.addEventListener('click', () => {
  const book = state.books.find(b => b.id === state.selectedBookId);
  if (!book) return;
  $('#cd_bookTitle').textContent = book.title;
  $('#confirmDeleteModal').classList.remove('hidden');
});

// cancelar
$('#cd_no')?.addEventListener('click', () => {
  $('#confirmDeleteModal').classList.add('hidden');
});

// confirmar exclusão
$('#cd_yes')?.addEventListener('click', () => {
  const book = state.books.find(b => b.id === state.selectedBookId);
  if (!book) return;

  // remove o livro e troca a seleção
  state.books = state.books.filter(b => b.id !== book.id);
  state.selectedBookId = state.books[0]?.id || null;

  // persiste e atualiza a UI
  save();
  $('#confirmDeleteModal').classList.add('hidden');
  $('#bookDetailModal').classList.add('hidden');

  renderBookSelect();
  renderTimerSelect();
  syncBookSelects();
  renderCurrentBookBar();
  updatePagesPill();
  renderBookOverall();
  renderShelf();
  updateCounters();
  updatePagesPill(); // se você usa essa função para atualizar a pílula novamente
});

// helper $ (só cria se você não tiver um)
window.$ = window.$ || (sel => document.querySelector(sel));
function setupDeleteConfirm() {
  const delBtn   = $('#bd_delete');
  const modal    = $('#confirmDeleteModal');
  const btnNo    = $('#cd_no');
  const btnYes   = $('#cd_yes');
  const titleEl  = $('#cd_bookTitle');
  const detailMd = $('#bookDetailModal');

  if (!delBtn || !modal || !btnNo || !btnYes) return; // não está no DOM ainda

  function openConfirm() {
    try {
      const book = (window.state && Array.isArray(state.books))
        ? state.books.find(b => b.id === state.selectedBookId)
        : null;
      if (book && titleEl) titleEl.textContent = book.title;
    } catch(_) {}
    modal.classList.remove('hidden');
  }

  function closeConfirm() {
    modal.classList.add('hidden');
  }

  delBtn.addEventListener('click', openConfirm);
  btnNo.addEventListener('click', closeConfirm);

  btnYes.addEventListener('click', () => {
    try {
      if (!window.state || !Array.isArray(state.books)) return closeConfirm();
      const id = state.selectedBookId;
      if (!id) return closeConfirm();

      // remove livro
      state.books = state.books.filter(b => b.id !== id);
      state.selectedBookId = state.books[0] ? state.books[0].id : null;

      // persiste
      if (typeof save === 'function') save();

      // re-renderizações (cada chamada só roda se existir)
      window.renderBookSelect     && renderBookSelect();
      window.renderTimerSelect    && renderTimerSelect();
      window.syncBookSelects      && syncBookSelects();
      window.renderCurrentBookBar && renderCurrentBookBar();
      window.updatePagesPill      && updatePagesPill();
      window.renderBookOverall    && renderBookOverall();
      window.renderShelf          && renderShelf();
      window.updateCounters       && updateCounters();

      // fecha modais
      closeConfirm();
      detailMd && detailMd.classList.add('hidden');
    } catch (err) {
      console.error(err);
      closeConfirm();
    }
  });
}

// só conecta depois que o DOM existir
document.addEventListener('DOMContentLoaded', setupDeleteConfirm);


// Dispara o bulk delete mesmo que o botão tenha id diferente
document.addEventListener('click', (e) => {
  const btn = e.target.closest('#shelfBulkDelete, #shelfBulkDeleteBtn, [data-bulk-delete], [data-action="bulk-delete"]');
  if (!btn) return;
  e.preventDefault();
  openBulkDeleteConfirm();
}, { capture: true });

/* ===== Concluídos (Mês/Ano) – helpers ===== */
function finishedBooksByMonth(y, m){
  return state.books.filter(b=>{
    if (!b.finishedAt) return false;
    const d = new Date(b.finishedAt);
    return d.getFullYear()===y && d.getMonth()===m;
  });
}
function finishedBooksByYear(y){
  return state.books.filter(b=>{
    if (!b.finishedAt) return false;
    const d = new Date(b.finishedAt);
    return d.getFullYear()===y;
  }).sort((a,b)=> new Date(a.finishedAt) - new Date(b.finishedAt));
}

// metas opcionais (livros/mês e livros/ano). Se não tiver, tratamos como 0 (=sem meta)
function getGoals(){
  const g = state.meta || {};
  return {
    month: Math.max(0, Number(g.monthBooks||0)),
    year : Math.max(0, Number(g.yearBooks ||0)),
  };
}

// cria card igual o da estante
function createBookCard(b){
  const card = document.createElement('div');
  card.className = 'book-card';
  card.dataset.id = b.id;

  const cover = document.createElement('div'); cover.className='book-cover';
  const img = document.createElement('img'); img.alt=b.title; img.src=b.cover || defaultCover(b.title);
  cover.appendChild(img);

  // badge por status real
  const pct = bookPercent(b);
  const badge = document.createElement('div');
  if (b.finishedAt || pct >= 100) { badge.className='badge lido';  badge.textContent='Lido'; }
  else if (pct > 0)               { badge.className='badge lendo'; badge.textContent='Lendo'; }
  else                            { badge.className='badge novo';  badge.textContent='Novo'; }
  cover.appendChild(badge);

  const title = document.createElement('div'); title.className='book-title'; title.textContent=b.title;

  const bar = document.createElement('div'); bar.className='progress-bar';
  const fill = document.createElement('span'); fill.style.width = Math.min(100, pct)+'%'; bar.appendChild(fill);

  card.append(cover, title, bar);
  return card;
}



/* ===== Modal controller ===== */
function openFinishedModal(opts){
  const type  = (opts?.type === 'month') ? 'month' : 'year';
  const now   = new Date();
  const year  = Number.isFinite(opts?.year)  ? opts.year  : now.getFullYear();
  const month = (type==='month' && Number.isFinite(opts?.month)) ? opts.month : now.getMonth();

  window.__lastFinishedOpts = { type, year, month };

  const modal   = el('finishedModal');
  const titleEl = el('fmTitle');
  const grid    = el('fmGrid');
  const goalEl  = el('fmGoal');
  const doneEl  = el('fmDone');
  const bar     = el('fmBar');
  const fill    = el('fmBarFill');
  const editBtn = el('fmEditMeta');
  const meter   = bar?.closest('.fm-meter');
  if (!modal || !titleEl || !grid || !goalEl || !doneEl || !bar || !fill || !meter) return;

  const goals = state.meta || {};
  const goalMonth = Math.max(0, Number(goals.monthBooks || 0));
  const goalYear  = Math.max(0, Number(goals.yearBooks  || 0));

  let books = [], goal = 0, title = '';
  if (type === 'month'){
    books = finishedBooksByMonth(year, month);
    goal  = goalMonth;
    const mes = new Intl.DateTimeFormat('pt-BR', { month:'long' }).format(new Date(year, month, 1));
    title = mes.charAt(0).toUpperCase() + mes.slice(1) + ' • ' + year;
  } else {
    books = finishedBooksByYear(year);
    goal  = goalYear;
    title = String(year);
  }

  titleEl.textContent = title;

  const done = books.length;
  goalEl.textContent = goal > 0 ? `${goal} livro${goal>1?'s':''}` : '—';
  doneEl.textContent = `${done} livro${done!==1?'s':''}`;

  // % da meta
  const metaPct = goal > 0 ? Math.min(100, Math.round((done/goal)*100)) : 0;

  // cor da barra + cor dos valores (mesma paleta)
  const pill = (goal>0 ? pillClassForPct(metaPct) : 'pill-gray'); // pill-blue/green/amber/red/gray
  bar.className = 'progress-bar fm-bar ' + pill;
  meter.classList.remove('accent-blue','accent-green','accent-amber','accent-red','accent-gray');
  meter.classList.add(
    pill === 'pill-blue'  ? 'accent-blue'  :
    pill === 'pill-green' ? 'accent-green' :
    pill === 'pill-amber' ? 'accent-amber' :
    pill === 'pill-red'   ? 'accent-red'   : 'accent-gray'
  );

  // garante L→R e anima
  fill.style.left  = '0';
  fill.style.right = 'auto';
  fill.style.width = '0';
  requestAnimationFrame(() => { fill.style.width = (goal>0 ? metaPct : 0) + '%'; });

  // grade
  grid.innerHTML = '';
  books.forEach(b => grid.appendChild(createBookCard(b)));

  grid.onclick = (e)=>{
    const card = e.target.closest('.book-card'); if(!card) return;
    const book = state.books.find(x=> x.id === card.dataset.id); if (!book) return;
    openDetail(book);                          // aparece na frente (z-index já setado no CSS)
  };

  // clique em qualquer área “meta” abre editor também
  editBtn && (editBtn.onclick = () => openGoalEditModal(type));
  goalEl.onclick = () => openGoalEditModal(type);
  bar.onclick    = () => openGoalEditModal(type);

  modal.classList.remove('hidden');
}

// fechar
document.getElementById('fmClose')?.addEventListener('click', ()=> {
  document.getElementById('finishedModal')?.classList.add('hidden');
});
setupModalCloseOnOutside('finishedModal');  // fecha clicando no backdrop

/* ===== Ações nos contadores =====
   Ouvimos tanto o próprio número (#cntMonth/#cntYear)
   quanto wrappers opcionais (#btnMonthFinished/#btnYearFinished) */
(function wireFinishedShortcuts(){
  const monthBtn = document.getElementById('btnMonthFinished') || document.getElementById('cntMonth');
  const yearBtn  = document.getElementById('btnYearFinished')  || document.getElementById('cntYear');

  monthBtn?.addEventListener('click', ()=>{
    openFinishedModal({ type:'month', year: view.year, month: view.month });
  });
  yearBtn?.addEventListener('click', ()=>{
    openFinishedModal({ type:'year', year: view.year });
  });
})();

/* =================== NAVEGAÇÃO =================== */
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  btn.classList.add('active'); document.getElementById('page-' + btn.dataset.page).classList.add('active');

  const isProg = btn.dataset.page === 'progresso';
  const headerEl = document.querySelector('header');
  headerEl?.classList.toggle('hamburger-hidden', !isProg);

  if (isProg) {
    renderCurrentBookBar();
    updatePagesPill();        // <— ADICIONE
    renderBookOverall();      // <— ADICIONE
  } else {
    drawer?.classList.remove('open');
    currentBookBar?.classList.add('hidden');
  }

  // sempre sincroniza o ícone após a troca
  syncHamburgerToDrawer();
}));

/* =================== PWA mínimo =================== */
(function createManifest(){
  const link = document.getElementById('manifestLink'); if(!link) return;
  const manifest = { name:'Leitura Diária', short_name:'Leitura', start_url:'.', display:'standalone',
    background_color:'#0f172a', theme_color:'#0f172a',
    icons: [{ src: '/book-logo.png', sizes: '192x192', type: 'image/png' }, { src: '/book-logo.png', sizes: '512x512', type: 'image/png' }]
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'}));
  link.setAttribute('href', url);
})();
(function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  const sw = `
    const CACHE='leitura-cache-v1';
    self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./'])));self.skipWaiting();});
    self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});
    self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request).then(res=>{const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request, copy)); return res;}).catch(()=>r)));});
  `;
  const url = URL.createObjectURL(new Blob([sw],{type:'text/javascript'}));
  navigator.serviceWorker.register(url);
})();

document.addEventListener('DOMContentLoaded', () => {
  // já tinha setupDeleteConfirm
  setupDeleteConfirm();

  // aplicar fechamento ao clicar fora
  [
    'bookModal',
    'bookDetailModal',
    'confirmDeleteModal',
    'pagesEditModal',
    'reviewModal',
    'confirmModal'
  ].forEach(setupModalCloseOnOutside);
});


/* ========= init ========= */
load(); 
placeBookBar(); 
loadTimer();
renderCalendarStrip(); 
renderTodayAnchor(); 
renderShelf();
setTimeout(ensureActiveMonthVisible, 0);
initYearPicker();

// ===== Recentraliza mês ativo quando a tela for redimensionada =====
let __rz;
window.addEventListener('resize', () => {
  clearTimeout(__rz);
  __rz = setTimeout(ensureActiveMonthVisible, 120);
});
document.addEventListener('DOMContentLoaded', () => {
  // ... seu init atual
  initYearPicker();   // <- habilita o seletor estilizado
});

