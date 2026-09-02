// API живёт на том же домене под /api (см. docs/SERVER_SETUP.md — nginx проксирует).
// Если тестируешь локально без nginx, поменяй на полный адрес бэкенда, например:
// const API_BASE = 'http://localhost:3000/api';
const API_BASE = '/api';

const THEME_STORAGE_KEY = 'wordbook-theme';
const API_KEY_STORAGE_KEY = 'wordbook-api-key';

const state = {
  status: '',
  search: '',
  entries: [],
  editingEntry: null,
  viewingIndex: -1,
};

const el = {
  form: document.getElementById('inputForm'),
  input: document.getElementById('wordInput'),
  submitBtn: document.getElementById('submitBtn'),
  hint: document.getElementById('inputHint'),
  previewLine: document.getElementById('previewLine'),
  filters: document.getElementById('filters'),
  search: document.getElementById('searchInput'),
  stats: document.getElementById('stats'),
  entries: document.getElementById('entries'),
  netStatus: document.getElementById('netStatus'),
  dictStatus: document.getElementById('dictStatus'),
  template: document.getElementById('entryTemplate'),

  themeToggle: document.getElementById('themeToggle'),
  themeColorMeta: document.getElementById('themeColorMeta'),
  settingsBtn: document.getElementById('settingsBtn'),

  contextToggle: document.getElementById('contextToggle'),
  contextInput: document.getElementById('contextInput'),

  manualPanel: document.getElementById('manualPanel'),
  manualTranslation: document.getElementById('manualTranslation'),
  manualSave: document.getElementById('manualSave'),
  manualCancel: document.getElementById('manualCancel'),

  editModal: document.getElementById('editModal'),
  editModalSource: document.getElementById('editModalSource'),
  editModalField: document.getElementById('editModalField'),
  editModalContext: document.getElementById('editModalContext'),
  editModalSave: document.getElementById('editModalSave'),
  editModalCancel: document.getElementById('editModalCancel'),

  viewModal: document.getElementById('viewModal'),
  viewModalStatus: document.getElementById('viewModalStatus'),
  viewModalSource: document.getElementById('viewModalSource'),
  viewModalTranslated: document.getElementById('viewModalTranslated'),
  viewModalContext: document.getElementById('viewModalContext'),
  viewModalStatuses: document.getElementById('viewModalStatuses'),
  viewModalPrev: document.getElementById('viewModalPrev'),
  viewModalNext: document.getElementById('viewModalNext'),
  viewModalCopy: document.getElementById('viewModalCopy'),
  viewModalEdit: document.getElementById('viewModalEdit'),
  viewModalDelete: document.getElementById('viewModalDelete'),
  viewModalClose: document.getElementById('viewModalClose'),

  settingsModal: document.getElementById('settingsModal'),
  apiKeyField: document.getElementById('apiKeyField'),
  settingsSave: document.getElementById('settingsSave'),
  settingsCancel: document.getElementById('settingsCancel'),

  appearanceBtn: document.getElementById('appearanceBtn'),
  appearanceModal: document.getElementById('appearanceModal'),
  appearanceBgThemeHint: document.getElementById('appearanceBgThemeHint'),
  paletteOptions: document.getElementById('paletteOptions'),
  bgOptions: document.getElementById('bgOptions'),
  fontOptions: document.getElementById('fontOptions'),
  sizeOptions: document.getElementById('sizeOptions'),
  appearanceReset: document.getElementById('appearanceReset'),
  appearanceClose: document.getElementById('appearanceClose'),

  practiceBtn: document.getElementById('practiceBtn'),
  practiceOverlay: document.getElementById('practiceOverlay'),
  practiceSetup: document.getElementById('practiceSetup'),
  practiceSetupClose: document.getElementById('practiceSetupClose'),
  practiceStatusChecks: document.getElementById('practiceStatusChecks'),
  practiceShuffle: document.getElementById('practiceShuffle'),
  practiceSetupEmpty: document.getElementById('practiceSetupEmpty'),
  practiceStart: document.getElementById('practiceStart'),
  practiceSession: document.getElementById('practiceSession'),
  practiceExit: document.getElementById('practiceExit'),
  practiceProgressText: document.getElementById('practiceProgressText'),
  practiceCard: document.getElementById('practiceCard'),
  flipCardInner: document.getElementById('flipCardInner'),
  practiceFrontWord: document.getElementById('practiceFrontWord'),
  practiceFrontContext: document.getElementById('practiceFrontContext'),
  practiceBackWord: document.getElementById('practiceBackWord'),
  practiceBackContext: document.getElementById('practiceBackContext'),
  practiceAssess: document.getElementById('practiceAssess'),
  practiceForgot: document.getElementById('practiceForgot'),
  practiceRemember: document.getElementById('practiceRemember'),
  practicePrev: document.getElementById('practicePrev'),
  practiceNext: document.getElementById('practiceNext'),
  practiceDone: document.getElementById('practiceDone'),
  practiceDoneText: document.getElementById('practiceDoneText'),
  practiceAgain: document.getElementById('practiceAgain'),
  practiceCloseDone: document.getElementById('practiceCloseDone'),
};

const STATUS_LABELS = {
  learning: 'учу',
  read: 'прочтено',
  learned: 'изучено',
  reviewing: 'вспоминаю',
};

function detectLang(text) {
  return /[а-яёА-ЯЁ]/.test(text) ? 'ru' : 'en';
}

function isSingleWord(text) {
  return text.trim().split(/\s+/).length === 1;
}

function setHint(text, isError = false) {
  el.hint.textContent = text;
  el.hint.classList.toggle('input-hint--error', isError);
}

function updateNetBadge() {
  const online = navigator.onLine;
  el.netStatus.textContent = online ? 'online' : 'offline';
  el.netStatus.classList.toggle('net-status--online', online);
  el.netStatus.classList.toggle('net-status--offline', !online);
}

// ---------- Хранилище настроек в браузере (тема, API-ключ) ----------
// localStorage тут уместен: это обычное веб-приложение/PWA, а не превью
// внутри чата — настройки должны переживать перезапуск и работать офлайн.

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
  try {
    if (value === null || value === undefined || value === '') {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // приватный режим браузера / квота — не критично, просто не сохранится
  }
}

// ---------- API-обёртка: подставляет X-API-Key, если он задан ----------

function getApiKey() {
  return storageGet(API_KEY_STORAGE_KEY) || '';
}

function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const key = getApiKey();
  if (key) headers['X-API-Key'] = key;
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

// ---------- Тема (светлая по умолчанию: оранжевый + бело-жёлтый;
//             тёмная по кнопке: чёрный + оранжевый) ----------

function applyTheme(theme) {
  const isDark = theme === 'dark';
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  el.themeToggle.textContent = isDark ? '☀️' : '🌙';
  applyAppearance(); // фон/цвет вкладки зависят от темы — пересчитываем при каждом переключении
}

function initTheme() {
  const saved = storageGet(THEME_STORAGE_KEY);
  applyTheme(saved === 'dark' ? 'dark' : 'light');
}

el.themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  applyTheme(next);
  storageSet(THEME_STORAGE_KEY, next);
});

// ---------- Оформление: цветовая пара, фон, шрифт, размер текста ----------
// Всё это — просто атрибуты на <html> (data-palette / data-bg / data-font /
// data-size), а нужные значения переменных подставляются в style.css.
// Фон хранится отдельно для светлой и тёмной темы (bgLight / bgDark), т.к.
// то, что хорошо смотрится днём, не обязательно подходит ночью.

const APPEARANCE_STORAGE_KEY = 'wordbook-appearance';

const DEFAULT_APPEARANCE = { palette: 'amber', bgLight: 'parchment', bgDark: 'midnight', font: 'serif', size: 'md' };

const PALETTES = [
  { id: 'amber', label: 'Янтарь', light: ['#D98C3D', '#3F9E8F'], dark: ['#F2B872', '#7DD3C0'] },
  { id: 'rose', label: 'Роза', light: ['#C1548C', '#7C6FD1'], dark: ['#E79BC9', '#A79AF0'] },
  { id: 'ocean', label: 'Океан', light: ['#2E86AB', '#2FA98E'], dark: ['#74C6E8', '#6FE0C2'] },
  { id: 'sunset', label: 'Закат', light: ['#DD6B3E', '#C94F72'], dark: ['#F2A26E', '#F0879F'] },
  { id: 'forest', label: 'Лес', light: ['#4C7A3D', '#2E8B7A'], dark: ['#8FCB77', '#68D4BD'] },
  { id: 'berry', label: 'Ягода', light: ['#8E3B6B', '#5A4FCF'], dark: ['#D98CB8', '#9C93F2'] },
  { id: 'slate', label: 'Сталь', light: ['#3D5A73', '#3FA6A1'], dark: ['#9BC4DE', '#78E0D6'] },
  { id: 'copper', label: 'Медь', light: ['#A15C2C', '#B8862F'], dark: ['#E8A26B', '#F0C572'] },
];

const BG_OPTIONS = {
  light: [
    { id: 'parchment', label: 'Пергамент', swatch: '#F6EBDC', metaColor: '#FDF7EC' },
    { id: 'mint', label: 'Мята', swatch: '#E8F4EC', metaColor: '#F2FAF5' },
    { id: 'peach', label: 'Персик', swatch: '#FCE7DC', metaColor: '#FFF4EC' },
    { id: 'lavender', label: 'Лаванда', swatch: '#ECE7F6', metaColor: '#F5F2FB' },
    { id: 'sand', label: 'Песок', swatch: '#F1E9D8', metaColor: '#F8F1E3' },
  ],
  dark: [
    { id: 'midnight', label: 'Полночь', swatch: '#1A1330', metaColor: '#1A1330' },
    { id: 'graphite', label: 'Графит', swatch: '#191B1F', metaColor: '#17181B' },
    { id: 'emerald', label: 'Изумруд', swatch: '#0F2921', metaColor: '#0E2119' },
    { id: 'wine', label: 'Вино', swatch: '#2B1420', metaColor: '#26111C' },
    { id: 'abyss', label: 'Бездна', swatch: '#0C1524', metaColor: '#0A121F' },
  ],
};

const FONT_OPTIONS = [
  { id: 'serif', label: 'Классика', family: 'var(--font-serif)' },
  { id: 'sans', label: 'Модерн', family: 'var(--font-sans)' },
  { id: 'mono', label: 'Печатная', family: 'var(--font-mono)' },
];

const SIZE_OPTIONS = [
  { id: 'sm', label: 'Меньше', scale: '0.82em' },
  { id: 'md', label: 'Обычный', scale: '1em' },
  { id: 'lg', label: 'Крупнее', scale: '1.22em' },
];

let appearance = { ...DEFAULT_APPEARANCE };

function loadAppearance() {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (raw) appearance = { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
  } catch {
    appearance = { ...DEFAULT_APPEARANCE };
  }
}

function saveAppearance() {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // localStorage недоступен — оформление просто не запомнится между визитами
  }
}

function isDarkTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function currentBgList() {
  return isDarkTheme() ? BG_OPTIONS.dark : BG_OPTIONS.light;
}

function currentBgId() {
  return isDarkTheme() ? appearance.bgDark : appearance.bgLight;
}

function applyAppearance() {
  const root = document.documentElement;

  if (appearance.palette !== 'amber') root.setAttribute('data-palette', appearance.palette);
  else root.removeAttribute('data-palette');

  const bgId = currentBgId();
  const defaultBg = isDarkTheme() ? 'midnight' : 'parchment';
  if (bgId !== defaultBg) root.setAttribute('data-bg', bgId);
  else root.removeAttribute('data-bg');

  if (appearance.font !== 'serif') root.setAttribute('data-font', appearance.font);
  else root.removeAttribute('data-font');

  if (appearance.size !== 'md') root.setAttribute('data-size', appearance.size);
  else root.removeAttribute('data-size');

  const bgMeta = currentBgList().find((b) => b.id === bgId);
  if (bgMeta) el.themeColorMeta.setAttribute('content', bgMeta.metaColor);

  renderAppearanceOptions();
}

function swatchButton({ id, label, dotStyle, isActive, onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'swatch' + (isActive ? ' is-active' : '');
  btn.innerHTML = `<span class="swatch__dot" style="${dotStyle}"></span><span class="swatch__label"></span>`;
  btn.querySelector('.swatch__label').textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function pillButton({ label, style, isActive, onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pill' + (isActive ? ' is-active' : '');
  if (style) btn.setAttribute('style', style);
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderAppearanceOptions() {
  // Палитра
  el.paletteOptions.innerHTML = '';
  PALETTES.forEach((p) => {
    const [c1, c2] = isDarkTheme() ? p.dark : p.light;
    el.paletteOptions.appendChild(swatchButton({
      label: p.label,
      dotStyle: `background: linear-gradient(135deg, ${c1}, ${c2});`,
      isActive: appearance.palette === p.id,
      onClick: () => {
        appearance.palette = p.id;
        saveAppearance();
        applyAppearance();
      },
    }));
  });

  // Фон — список зависит от текущей темы
  el.bgOptions.innerHTML = '';
  el.appearanceBgThemeHint.textContent = isDarkTheme() ? '(для тёмной темы)' : '(для светлой темы)';
  currentBgList().forEach((b) => {
    el.bgOptions.appendChild(swatchButton({
      label: b.label,
      dotStyle: `background: ${b.swatch};`,
      isActive: currentBgId() === b.id,
      onClick: () => {
        if (isDarkTheme()) appearance.bgDark = b.id;
        else appearance.bgLight = b.id;
        saveAppearance();
        applyAppearance();
      },
    }));
  });

  // Шрифт
  el.fontOptions.innerHTML = '';
  FONT_OPTIONS.forEach((f) => {
    el.fontOptions.appendChild(pillButton({
      label: f.label,
      style: `font-family: ${f.family};`,
      isActive: appearance.font === f.id,
      onClick: () => {
        appearance.font = f.id;
        saveAppearance();
        applyAppearance();
      },
    }));
  });

  // Размер текста
  el.sizeOptions.innerHTML = '';
  SIZE_OPTIONS.forEach((s) => {
    el.sizeOptions.appendChild(pillButton({
      label: s.label,
      style: `font-size: ${s.scale};`,
      isActive: appearance.size === s.id,
      onClick: () => {
        appearance.size = s.id;
        saveAppearance();
        applyAppearance();
      },
    }));
  });
}

function initAppearance() {
  loadAppearance();
}

function openAppearanceModal() {
  renderAppearanceOptions();
  el.appearanceModal.hidden = false;
}

function closeAppearanceModal() {
  el.appearanceModal.hidden = true;
}

el.appearanceBtn.addEventListener('click', openAppearanceModal);
el.appearanceClose.addEventListener('click', closeAppearanceModal);
el.appearanceReset.addEventListener('click', () => {
  appearance = { ...DEFAULT_APPEARANCE };
  saveAppearance();
  applyAppearance();
});

// ---------- Офлайн-словарь на устройстве (первое наполнение) ----------

// При первом запуске приложения (пока в IndexedDB ещё пусто) тихо тянем
// компактный бандл с бэкенда и складываем в WordbookDB — это реализация
// "скачать офлайн-словарь при запуске приложения" из docs/LOGIC.md.
// Бэкенд отдаёт бандл только после того, как сам соберёт его (см.
// scripts/ensure-dictionary.js) — если бэкенд ещё не готов или сети нет,
// просто пробуем в следующий раз, когда приложение откроется снова.
async function ensureOfflineDictionary() {
  try {
    const existing = await WordbookDB.deviceDictionaryCount();
    if (existing > 0) return;

    setDictStatus('офлайн-словарь: загружаю…');
    let imported = 0;

    for (const pair of ['en-ru', 'ru-en']) {
      const res = await apiFetch(`/dictionary/device-bundle?pair=${pair}`, {
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue; // бандл ещё не собран на бэкенде или сети нет — попробуем позже

      const { items } = await res.json();
      await WordbookDB.bulkImportDeviceDictionary(items.map((item) => ({ ...item, pair })));
      imported += items.length;
    }

    setDictStatus(imported > 0 ? `офлайн-словарь: ${imported} слов` : '');
  } catch {
    // нет сети или бэкенд недоступен — тихо пропускаем, не мешаем работе приложения
    setDictStatus('');
  }
}

function setDictStatus(text) {
  if (el.dictStatus) el.dictStatus.textContent = text;
}

// ---------- Контекст (необязательное поле "откуда слово") ----------

el.contextToggle.addEventListener('click', () => {
  const showing = !el.contextInput.hidden;
  if (showing) {
    el.contextInput.hidden = true;
    el.contextInput.value = '';
    el.contextToggle.textContent = '+ добавить контекст (откуда слово)';
  } else {
    el.contextInput.hidden = false;
    el.contextInput.focus();
    el.contextToggle.textContent = '− убрать контекст';
  }
});

function resetContextField() {
  el.contextInput.hidden = true;
  el.contextInput.value = '';
  el.contextToggle.textContent = '+ добавить контекст (откуда слово)';
}

// ---------- Предпросмотр перевода (пока печатаешь, до отправки) ----------
// Показывает результат полупрозрачно ещё до того, как слово реально
// сохранится, и подсказывает источник (офлайн-словарь на устройстве / онлайн
// LibreTranslate / серверный словарь) — тот же путь поиска, что и при
// отправке, просто без создания записи. Если к моменту отправки текст не
// менялся, submit переиспользует уже найденный результат и не бьёт в сеть
// второй раз за то же самое слово.

let previewTimer = null;
let previewController = null;
let previewCache = { text: '', result: null };

const PREVIEW_SOURCE_LABELS = {
  online: 'онлайн',
  server_dict: 'словарь сервера',
  device_dict: 'офлайн-словарь',
};

function hidePreview() {
  if (previewController) { previewController.abort(); previewController = null; }
  clearTimeout(previewTimer);
  previewCache = { text: '', result: null };
  el.previewLine.hidden = true;
  el.previewLine.textContent = '';
  el.previewLine.classList.remove('preview-line--empty', 'preview-line--loading');
}

function renderPreview(text, sourceKey) {
  el.previewLine.hidden = false;
  el.previewLine.classList.remove('preview-line--empty', 'preview-line--loading');
  el.previewLine.textContent = '';

  const arrow = document.createElement('span');
  arrow.className = 'preview-line__arrow';
  arrow.textContent = '→';

  const ghost = document.createElement('span');
  ghost.className = 'preview-line__ghost';
  ghost.textContent = text;

  const tag = document.createElement('span');
  tag.className = 'preview-line__tag';
  tag.textContent = PREVIEW_SOURCE_LABELS[sourceKey] || sourceKey;

  el.previewLine.append(arrow, ' ', ghost, ' ', tag);
}

function renderPreviewEmpty(message) {
  el.previewLine.hidden = false;
  el.previewLine.classList.remove('preview-line--loading');
  el.previewLine.classList.add('preview-line--empty');
  el.previewLine.textContent = message;
}

async function runPreview(text) {
  if (previewController) previewController.abort();
  const controller = new AbortController();
  previewController = controller;

  const source = detectLang(text);
  const target = source === 'ru' ? 'en' : 'ru';

  // Офлайн-словарь на устройстве — только отдельные слова (это список слов,
  // а не переводчик фраз), зато мгновенно и без сети.
  if (isSingleWord(text)) {
    try {
      const local = await WordbookDB.lookupDeviceWord(text, `${source}-${target}`);
      if (controller.signal.aborted) return;
      if (local) {
        previewCache = { text, result: { translatedText: local, source, target, via: 'device_dict' } };
        renderPreview(local, 'device_dict');
        return;
      }
    } catch {
      // IndexedDB недоступна — просто идём дальше к сетевому пути
    }
  }

  try {
    const res = await apiFetch('/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;

    if (!res.ok) {
      renderPreviewEmpty('перевод не найден — можно будет ввести вручную');
      return;
    }
    const data = await res.json();
    previewCache = { text, result: data };
    renderPreview(data.translatedText, data.via);
  } catch {
    if (!controller.signal.aborted) {
      renderPreviewEmpty(
        navigator.onLine
          ? 'перевод не найден — можно будет ввести вручную'
          : 'нет сети — при отправке попробуем офлайн-словарь'
      );
    }
  }
}

el.input.addEventListener('input', () => {
  clearTimeout(previewTimer);
  const text = el.input.value.trim();

  if (!text) { hidePreview(); return; }

  if (text === previewCache.text && previewCache.result) {
    renderPreview(previewCache.result.translatedText, previewCache.result.via);
    return;
  }

  el.previewLine.hidden = false;
  el.previewLine.classList.remove('preview-line--empty');
  el.previewLine.classList.add('preview-line--loading');
  el.previewLine.textContent = '…';

  previewTimer = setTimeout(() => runPreview(text), 450);
});

// ---------- Перевод ----------

async function translate(text) {
  // Без таймаута fetch может зависнуть надолго на плохой, но не полностью
  // мёртвой сети — а весь смысл цепочки источников в LOGIC.md в том, чтобы
  // быстро переходить к следующему источнику, а не ждать бесконечно.
  const res = await apiFetch('/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(8000),
  });

  if (res.ok) return res.json();

  // сервер ответил, но перевода нет (503 с fallback: 'device_dict')
  const data = await res.json().catch(() => ({}));
  const err = new Error(data.error || 'Перевод недоступен');
  err.fallback = data.fallback;
  err.source = data.source;
  err.target = data.target;
  throw err;
}

async function handleSubmit(e) {
  e.preventDefault();
  const text = el.input.value.trim();
  if (!text) return;

  hideManualPanel();
  el.submitBtn.disabled = true;
  setHint('перевожу…');

  const source = detectLang(text);
  const target = source === 'ru' ? 'en' : 'ru';
  const context = el.contextInput.hidden ? '' : el.contextInput.value.trim();

  try {
    const result = (text === previewCache.text && previewCache.result)
      ? previewCache.result
      : await translate(text);
    const entry = await createEntry({
      source_text: text,
      translated_text: result.translatedText,
      source_lang: result.source,
      target_lang: result.target,
      status: 'learning',
      source: result.via,
      context,
    });
    state.entries.unshift(entry);
    render();
    loadStats();
    el.input.value = '';
    resetContextField();
    setHint('');
    hidePreview();
  } catch (err) {
    // сеть до бэкенда вообще не достучалась, либо запрос завис и истёк
    // таймаут (offline / плохая сеть), либо сервер ответил, но перевода
    // нигде не нашлось (503) — во всех этих случаях пробуем офлайн-словарь
    // на устройстве, а если и там пусто — даём вписать перевод руками.
    const isNetworkFailure =
      err instanceof TypeError ||
      err.name === 'TimeoutError' ||
      err.name === 'AbortError' ||
      err.fallback === 'device_dict';

    if (isNetworkFailure && isSingleWord(text)) {
      const pair = `${source}-${target}`;
      const localTranslation = await WordbookDB.lookupDeviceWord(text, pair);

      if (localTranslation) {
        const pendingEntry = {
          localId: Date.now(),
          id: `local-${Date.now()}`,
          source_text: text,
          translated_text: localTranslation,
          source_lang: source,
          target_lang: target,
          status: 'learning',
          source: 'device_dict',
          context: context || null,
          pending: true,
          created_at: new Date().toISOString(),
        };
        await WordbookDB.addPendingEntry(pendingEntry);
        state.entries.unshift(pendingEntry);
        render();
        loadStats();
        el.input.value = '';
        resetContextField();
        setHint('сохранено офлайн — синхронизируется при появлении сети');
        hidePreview();
      } else {
        setHint('автоперевод не нашёл слово — впиши перевод сам ниже', true);
        showManualPanel(text, source, target, context);
      }
    } else if (isNetworkFailure) {
      setHint('автоперевод недоступен для фразы — впиши перевод сам ниже', true);
      showManualPanel(text, source, target, context);
    } else {
      setHint(err.message, true);
    }
  } finally {
    el.submitBtn.disabled = false;
  }
}

// ---------- Ручной ввод перевода (когда ни один источник не сработал) ----------

function showManualPanel(text, source, target, context) {
  hidePreview();
  state.manualEntry = { text, source, target, context };
  el.manualTranslation.value = '';
  el.manualPanel.hidden = false;
  el.manualTranslation.focus();
}

function hideManualPanel() {
  state.manualEntry = null;
  el.manualPanel.hidden = true;
  el.manualTranslation.value = '';
}

el.manualCancel.addEventListener('click', hideManualPanel);

el.manualSave.addEventListener('click', async () => {
  const translated = el.manualTranslation.value.trim();
  if (!translated || !state.manualEntry) return;

  const { text, source, target, context } = state.manualEntry;
  const payload = {
    source_text: text,
    translated_text: translated,
    source_lang: source,
    target_lang: target,
    status: 'learning',
    source: 'manual',
    context: context || null,
  };

  el.manualSave.disabled = true;
  try {
    let entry;
    if (navigator.onLine) {
      entry = await createEntry(payload);
    } else {
      throw new Error('offline');
    }
    state.entries.unshift(entry);
    setHint('сохранено');
  } catch {
    // нет сети (или сервер моргнул) — кладём в очередь синхронизации,
    // как и обычные офлайн-записи из device_dict
    const pendingEntry = {
      ...payload,
      localId: Date.now(),
      id: `local-${Date.now()}`,
      pending: true,
      created_at: new Date().toISOString(),
    };
    await WordbookDB.addPendingEntry(pendingEntry);
    state.entries.unshift(pendingEntry);
    setHint('сохранено офлайн — синхронизируется при появлении сети');
  } finally {
    el.manualSave.disabled = false;
  }

  hideManualPanel();
  el.input.value = '';
  resetContextField();
  render();
  loadStats();
  hidePreview();
});

// ---------- CRUD записей ----------

async function createEntry(payload) {
  const res = await apiFetch('/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Не удалось сохранить запись');
  return res.json();
}

async function updateEntry(id, patch) {
  const res = await apiFetch(`/entries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Не удалось обновить запись');
  return res.json();
}

async function deleteEntry(id) {
  const res = await apiFetch(`/entries/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error('Не удалось удалить запись');
}

async function loadEntries() {
  const params = new URLSearchParams();
  if (state.status) params.set('status', state.status);
  if (state.search) params.set('search', state.search);

  try {
    const res = await apiFetch(`/entries?${params}`);
    if (!res.ok) throw new Error('Сервер недоступен');
    const serverEntries = await res.json();
    await WordbookDB.cacheEntries(serverEntries);

    const pending = await WordbookDB.getPendingEntries();
    state.entries = [...pending, ...serverEntries];
  } catch {
    // офлайн — показываем то, что успели закэшировать + то, что ждёт синка,
    // применяя те же фильтры, что обычно делает сервер (GET /api/entries?
    // search=&status=), иначе выбранный чип/поиск незаметно перестаёт
    // работать, как только пропадает сеть.
    const [cached, pending] = await Promise.all([
      WordbookDB.getCachedEntries(),
      WordbookDB.getPendingEntries(),
    ]);
    const search = state.search.toLowerCase();
    const matchesFilter = (entry) => {
      if (state.status && entry.status !== state.status) return false;
      if (search) {
        const haystack = `${entry.source_text} ${entry.translated_text}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    };
    state.entries = [...pending.filter(matchesFilter), ...cached.filter(matchesFilter)];
  }
  render();
  loadStats();
}

async function loadStats() {
  try {
    const res = await apiFetch('/entries/stats');
    if (!res.ok) throw new Error();
    const { total, byStatus } = await res.json();
    el.stats.textContent = total === 1 ? '1 слово в блокноте' : `${total} слов в блокноте`;
    updateChipCounts({ '': total, ...byStatus });
  } catch {
    el.stats.textContent = 'статистика недоступна офлайн';
    updateChipCounts(null);
  }
}

function updateChipCounts(counts) {
  el.filters.querySelectorAll('.chip').forEach((chip) => {
    const countEl = chip.querySelector('.chip__count');
    if (!countEl) return;
    countEl.textContent = counts ? (counts[chip.dataset.status] ?? 0) : '';
  });
}

// ---------- Синхронизация офлайн-записей ----------

async function syncPending() {
  const pending = await WordbookDB.getPendingEntries();
  if (!pending.length) return;

  for (const entry of pending) {
    try {
      const saved = await createEntry({
        source_text: entry.source_text,
        translated_text: entry.translated_text,
        source_lang: entry.source_lang,
        target_lang: entry.target_lang,
        status: entry.status,
        source: entry.source,
        context: entry.context ?? null,
      });
      await WordbookDB.removePendingEntry(entry.localId);
      const idx = state.entries.findIndex((e) => e.localId === entry.localId);
      if (idx !== -1) state.entries[idx] = saved;
    } catch {
      // сервер всё ещё недоступен, попробуем в следующий раз
    }
  }
  render();
  loadStats();
}

// ---------- Рендер ----------

function render() {
  el.entries.innerHTML = '';

  if (!state.entries.length) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'Записей пока нет — впиши первое слово выше.';
    el.entries.appendChild(p);
    return;
  }

  for (const entry of state.entries) {
    const node = el.template.content.cloneNode(true);
    const ticket = node.querySelector('.ticket');

    ticket.dataset.id = entry.id;
    ticket.classList.toggle('ticket--pending', Boolean(entry.pending));

    node.querySelector('.ticket__source').textContent = entry.source_text;
    node.querySelector('.ticket__translated').textContent = entry.translated_text;
    node.querySelector('.ticket__context').textContent = entry.context ? `«${entry.context}»` : '';

    const badge = node.querySelector('.ticket__status-badge');
    badge.textContent = STATUS_LABELS[entry.status] || entry.status;
    badge.className = `ticket__status-badge status--${entry.status}`;

    const menuBtn = node.querySelector('.ticket__menu-btn');
    const menu = node.querySelector('.ticket__menu');

    menuBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      document.querySelectorAll('.ticket__menu--open').forEach((m) => {
        if (m !== menu) m.classList.remove('ticket__menu--open');
      });
      menu.classList.toggle('ticket__menu--open');
    });

    menu.querySelector('[data-action="edit"]').addEventListener('click', () => openEditModal(entry));
    menu.querySelector('[data-action="delete"]').addEventListener('click', () => onDelete(entry));
    menu.querySelectorAll('[data-action="status"]').forEach((btn) => {
      btn.addEventListener('click', () => onStatusChange(entry, btn.dataset.status));
    });

    const body = node.querySelector('.ticket__body');
    const openThisEntry = () => {
      const idx = state.entries.indexOf(entry);
      openViewModal(idx);
    };
    body.addEventListener('click', openThisEntry);
    body.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        openThisEntry();
      }
    });

    el.entries.appendChild(node);
  }

  // Отмечаем карточки, чей текст обрезался рамкой ticket__preview —
  // им показываем подсказку "развернуть" и градиентное затемнение снизу.
  // Делается одним проходом после вставки всех карточек в DOM, чтобы не
  // дёргать layout на каждой карточке по отдельности.
  el.entries.querySelectorAll('.ticket').forEach((ticket) => {
    const preview = ticket.querySelector('.ticket__preview');
    if (preview && preview.scrollHeight > preview.clientHeight + 2) {
      ticket.classList.add('ticket--long');
    }
  });
}

// ---------- Модалка редактирования (заменяет старый prompt()) ----------

function openEditModal(entry) {
  state.editingEntry = entry;
  el.editModalSource.textContent = `${entry.source_text} →`;
  el.editModalField.value = entry.translated_text;
  el.editModalContext.value = entry.context || '';
  el.editModal.hidden = false;
  el.editModalField.focus();
  el.editModalField.select();
}

function closeEditModal() {
  el.editModal.hidden = true;
  state.editingEntry = null;
}

el.editModalCancel.addEventListener('click', closeEditModal);

// ---------- Модалка просмотра записи целиком ----------
// Открывается по клику/Enter на карточке — показывает слово, перевод и
// контекст без обрезки, по центру экрана (и на телефоне, и на ПК), плюс
// позволяет тут же полистать соседние записи, сменить статус или удалить.

function openViewModal(index) {
  const entry = state.entries[index];
  if (!entry) return;
  state.viewingIndex = index;

  el.viewModalSource.textContent = entry.source_text;
  el.viewModalTranslated.textContent = entry.translated_text;
  el.viewModalContext.textContent = entry.context ? `«${entry.context}»` : '';

  el.viewModalStatus.textContent = STATUS_LABELS[entry.status] || entry.status;
  el.viewModalStatus.className = `ticket__status-badge status--${entry.status}`;

  el.viewModalStatuses.querySelectorAll('button').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.status === entry.status);
  });

  el.viewModalPrev.disabled = index <= 0;
  el.viewModalNext.disabled = index >= state.entries.length - 1;

  el.viewModalCopy.textContent = 'Скопировать';

  el.viewModal.hidden = false;
  el.viewModalClose.focus();
}

function closeViewModal() {
  el.viewModal.hidden = true;
  state.viewingIndex = -1;
}

function currentViewEntry() {
  return state.entries[state.viewingIndex];
}

el.viewModalClose.addEventListener('click', closeViewModal);

el.viewModalPrev.addEventListener('click', () => {
  if (state.viewingIndex > 0) openViewModal(state.viewingIndex - 1);
});

el.viewModalNext.addEventListener('click', () => {
  if (state.viewingIndex < state.entries.length - 1) openViewModal(state.viewingIndex + 1);
});

el.viewModalStatuses.addEventListener('click', async (evt) => {
  const btn = evt.target.closest('button[data-status]');
  const entry = currentViewEntry();
  if (!btn || !entry) return;
  const status = btn.dataset.status;
  if (status === entry.status) return;
  await onStatusChange(entry, status);
  const idx = state.entries.findIndex((e) => e === entry || e.id === entry.id || (e.localId && e.localId === entry.localId));
  if (idx !== -1) openViewModal(idx);
});

el.viewModalEdit.addEventListener('click', () => {
  const entry = currentViewEntry();
  if (!entry) return;
  closeViewModal();
  openEditModal(entry);
});

el.viewModalDelete.addEventListener('click', async () => {
  const entry = currentViewEntry();
  if (!entry) return;
  const deleted = await onDelete(entry);
  if (deleted) closeViewModal();
});

el.viewModalCopy.addEventListener('click', async () => {
  const entry = currentViewEntry();
  if (!entry) return;
  const text = `${entry.source_text} → ${entry.translated_text}`;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API недоступен (нет https / нет разрешения) — молча пропускаем
    return;
  }
  el.viewModalCopy.textContent = '✓ скопировано';
  setTimeout(() => {
    if (!el.viewModal.hidden) el.viewModalCopy.textContent = 'Скопировать';
  }, 1200);
});

el.editModalSave.addEventListener('click', async () => {
  const entry = state.editingEntry;
  if (!entry) return;

  const newTranslation = el.editModalField.value.trim();
  if (!newTranslation) return;
  const newContext = el.editModalContext.value.trim();

  try {
    if (entry.pending) {
      // Раньше здесь правился только объект в памяти, а следующий же
      // loadEntries() перезатирал state.entries свежими данными из
      // IndexedDB — правка молча пропадала. Поэтому пишем и в очередь.
      entry.translated_text = newTranslation;
      entry.context = newContext || null;
      await WordbookDB.updatePendingEntry(entry);
    } else {
      await updateEntry(entry.id, { translated_text: newTranslation, context: newContext || null });
    }
  } catch (err) {
    alert(err.message || 'Не удалось сохранить изменение (нет сети?)');
  }

  closeEditModal();
  await loadEntries();
});

async function onDelete(entry) {
  if (!confirm(`Удалить «${entry.source_text}»?`)) return false;
  try {
    if (entry.pending) {
      await WordbookDB.removePendingEntry(entry.localId);
    } else {
      await deleteEntry(entry.id);
    }
  } catch (err) {
    alert(err.message || 'Не удалось удалить запись (нет сети?)');
    return false;
  }
  await loadEntries();
  return true;
}

async function onStatusChange(entry, status) {
  try {
    if (entry.pending) {
      entry.status = status;
      await WordbookDB.updatePendingEntry(entry);
    } else {
      await updateEntry(entry.id, { status });
    }
  } catch (err) {
    alert(err.message || 'Не удалось сменить статус (нет сети?)');
  }
  await loadEntries();
}

// ---------- Настройки (API-ключ) ----------

function openSettingsModal() {
  el.apiKeyField.value = getApiKey();
  el.settingsModal.hidden = false;
  el.apiKeyField.focus();
}

function closeSettingsModal() {
  el.settingsModal.hidden = true;
}

el.settingsBtn.addEventListener('click', openSettingsModal);
el.settingsCancel.addEventListener('click', closeSettingsModal);

el.settingsSave.addEventListener('click', () => {
  storageSet(API_KEY_STORAGE_KEY, el.apiKeyField.value.trim());
  closeSettingsModal();
  loadEntries(); // сразу проверить, подходит ли ключ
});

// Общее закрытие модалок: клик по подложке или Escape
[el.editModal, el.settingsModal, el.viewModal, el.appearanceModal].forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      if (modal === el.editModal) closeEditModal();
      else if (modal === el.viewModal) closeViewModal();
      else if (modal === el.appearanceModal) closeAppearanceModal();
      else closeSettingsModal();
    }
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!el.editModal.hidden) closeEditModal();
    if (!el.settingsModal.hidden) closeSettingsModal();
    if (!el.viewModal.hidden) closeViewModal();
    if (!el.appearanceModal.hidden) closeAppearanceModal();
    if (!el.practiceOverlay.hidden) closePracticeOverlay();
    return;
  }
  // В сессии тренировки стрелками ← → листаем карточки без оценки
  if (!el.practiceOverlay.hidden && !el.practiceSession.hidden) {
    if (e.key === 'ArrowLeft' && !el.practicePrev.disabled) el.practicePrev.click();
    if (e.key === 'ArrowRight' && !el.practiceNext.disabled) el.practiceNext.click();
    return;
  }
  // В модалке просмотра стрелками ← → тоже можно листать соседние слова
  if (el.viewModal.hidden) return;
  if (e.key === 'ArrowLeft' && !el.viewModalPrev.disabled) el.viewModalPrev.click();
  if (e.key === 'ArrowRight' && !el.viewModalNext.disabled) el.viewModalNext.click();
});

// ---------- Web Share Target: приём текста, расшаренного из других
//            приложений (например, выделил слово в доке → "Поделиться") ----------

function handleIncomingShare() {
  const params = new URLSearchParams(window.location.search);
  const shared = params.get('shared_text') || params.get('shared_title') || params.get('shared_url');
  if (!shared) return;

  el.input.value = shared.trim();
  el.input.focus();
  setHint('текст пришёл через «Поделиться» — проверь и отправь на перевод');

  // Убираем query-параметры из адресной строки, чтобы обновление страницы
  // не «переигрывало» тот же шаринг заново.
  window.history.replaceState(null, '', window.location.pathname);
}

// ---------- Режим тренировки (флеш-карточки) ----------
// Полноэкранный оверлей: экран настройки (какие статусы повторяем +
// перемешать или нет) → сессия с карточками (тап/Space — перевернуть,
// стрелки/свайп — пролистать без оценки, "Помню"/"Забыл" — оценить и
// перейти дальше) → финальный экран со сводкой. Оценка карточки НЕ меняет
// статус записи на сервере — это отдельная от ручного управления статусами
// вещь, чисто для тренировки в моменте.

const practice = {
  queue: [],
  index: 0,
  flipped: false,
  remembered: 0,
  forgotten: 0,
  total: 0,
};
let practiceAllEntries = [];

async function fetchAllEntriesForPractice() {
  // Тянем вообще все записи одним запросом (без фильтра по статусу — их
  // может быть выбрано сразу несколько), дальше фильтруем по чекбоксам
  // на клиенте. limit намного больше дефолтных 50 на бэкенде.
  try {
    const res = await apiFetch('/entries?limit=2000');
    if (!res.ok) throw new Error();
    const serverEntries = await res.json();
    const pending = await WordbookDB.getPendingEntries();
    return [...pending, ...serverEntries];
  } catch {
    const [cached, pending] = await Promise.all([
      WordbookDB.getCachedEntries(),
      WordbookDB.getPendingEntries(),
    ]);
    return [...pending, ...cached];
  }
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getSelectedPracticeStatuses() {
  return Array.from(
    el.practiceStatusChecks.querySelectorAll('input[type="checkbox"]:checked')
  ).map((cb) => cb.value);
}

function updatePracticeStartAvailability() {
  const statuses = getSelectedPracticeStatuses();
  const matching = statuses.length
    ? practiceAllEntries.filter((entry) => statuses.includes(entry.status))
    : [];
  el.practiceSetupEmpty.hidden = matching.length > 0 || statuses.length === 0;
  el.practiceStart.disabled = matching.length === 0;
}

async function openPracticeSetup() {
  el.practiceOverlay.hidden = false;
  el.practiceSetup.hidden = false;
  el.practiceSession.hidden = true;
  el.practiceDone.hidden = true;
  el.practiceStart.disabled = true;

  practiceAllEntries = await fetchAllEntriesForPractice();

  const counts = { learning: 0, read: 0, learned: 0, reviewing: 0 };
  practiceAllEntries.forEach((entry) => {
    if (counts[entry.status] !== undefined) counts[entry.status] += 1;
  });
  el.practiceStatusChecks.querySelectorAll('.practice-check__count').forEach((span) => {
    span.textContent = `(${counts[span.dataset.count] || 0})`;
  });

  updatePracticeStartAvailability();
}

function closePracticeOverlay() {
  el.practiceOverlay.hidden = true;
}

function showPracticeCard() {
  const entry = practice.queue[practice.index];
  practice.flipped = false;
  el.flipCardInner.classList.remove('flip-card__inner--flipped');
  el.practiceCard.setAttribute('aria-pressed', 'false');
  el.practiceAssess.hidden = true;

  // Небольшая анимация появления при каждой новой карточке — снимаем и
  // тут же возвращаем класс с принудительным reflow между ними, иначе
  // повторное добавление того же класса подряд не переиграет анимацию.
  el.practiceCard.classList.remove('flip-card--enter');
  void el.practiceCard.offsetWidth;
  el.practiceCard.classList.add('flip-card--enter');

  el.practiceFrontWord.textContent = entry.source_text;
  el.practiceFrontContext.textContent = entry.context ? `«${entry.context}»` : '';
  el.practiceBackWord.textContent = entry.translated_text;
  el.practiceBackContext.textContent = entry.context ? `«${entry.context}»` : '';

  el.practiceProgressText.textContent = `${practice.index + 1} / ${practice.queue.length}`;
  el.practicePrev.disabled = practice.index === 0;
  el.practiceNext.disabled = practice.index >= practice.queue.length - 1;
}

function flipPracticeCard() {
  practice.flipped = !practice.flipped;
  el.flipCardInner.classList.toggle('flip-card__inner--flipped', practice.flipped);
  el.practiceCard.setAttribute('aria-pressed', String(practice.flipped));
  el.practiceAssess.hidden = !practice.flipped;
}

function goToPracticeIndex(newIndex) {
  if (newIndex < 0 || newIndex >= practice.queue.length) return;
  practice.index = newIndex;
  showPracticeCard();
}

function finishPracticeSession() {
  el.practiceSession.hidden = true;
  el.practiceDone.hidden = false;
  el.practiceDoneText.textContent =
    `Слов в сессии: ${practice.total} · «Помню»: ${practice.remembered} · «Забыл»: ${practice.forgotten}`;
}

function assessPracticeCard(remembered) {
  if (remembered) {
    practice.remembered += 1;
  } else {
    practice.forgotten += 1;
    // "Забыл" — откладываем эту же карточку в конец очереди, чтобы увидеть
    // её снова в этой же сессии, а не просто пролистать дальше.
    practice.queue.push(practice.queue[practice.index]);
  }

  if (practice.index >= practice.queue.length - 1) {
    finishPracticeSession();
  } else {
    goToPracticeIndex(practice.index + 1);
  }
}

el.practiceBtn.addEventListener('click', openPracticeSetup);
el.practiceSetupClose.addEventListener('click', closePracticeOverlay);
el.practiceExit.addEventListener('click', closePracticeOverlay);
el.practiceCloseDone.addEventListener('click', closePracticeOverlay);

el.practiceStatusChecks.addEventListener('change', updatePracticeStartAvailability);

el.practiceStart.addEventListener('click', () => {
  const statuses = getSelectedPracticeStatuses();
  let queue = practiceAllEntries.filter((entry) => statuses.includes(entry.status));
  if (!queue.length) return;
  if (el.practiceShuffle.checked) queue = shuffleArray(queue);

  practice.queue = queue;
  practice.index = 0;
  practice.remembered = 0;
  practice.forgotten = 0;
  practice.total = queue.length;

  el.practiceSetup.hidden = true;
  el.practiceDone.hidden = true;
  el.practiceSession.hidden = false;
  showPracticeCard();
});

el.practiceAgain.addEventListener('click', () => {
  el.practiceDone.hidden = true;
  el.practiceSetup.hidden = false;
  updatePracticeStartAvailability();
});

el.practiceCard.addEventListener('click', flipPracticeCard);
el.practiceCard.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    flipPracticeCard();
  }
});

// Свайп по карточке — та же навигация, что кнопки/стрелки, без оценки
let practiceTouchStartX = null;
el.practiceCard.addEventListener('touchstart', (e) => {
  practiceTouchStartX = e.touches[0].clientX;
}, { passive: true });
el.practiceCard.addEventListener('touchend', (e) => {
  if (practiceTouchStartX === null) return;
  const dx = e.changedTouches[0].clientX - practiceTouchStartX;
  practiceTouchStartX = null;
  if (Math.abs(dx) < 40) return; // маленькое движение — это тап (флип), не свайп
  e.preventDefault(); // гасим синтетический click, иначе карточка ещё и перевернётся следом
  goToPracticeIndex(practice.index + (dx < 0 ? 1 : -1));
});

el.practicePrev.addEventListener('click', () => goToPracticeIndex(practice.index - 1));
el.practiceNext.addEventListener('click', () => goToPracticeIndex(practice.index + 1));
el.practiceRemember.addEventListener('click', () => assessPracticeCard(true));
el.practiceForgot.addEventListener('click', () => assessPracticeCard(false));

// ---------- События ----------

el.form.addEventListener('submit', handleSubmit);

el.filters.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  el.filters.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip--active'));
  btn.classList.add('chip--active');
  state.status = btn.dataset.status;
  loadEntries();
});

let searchTimer;
el.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = el.search.value.trim();
    loadEntries();
  }, 300);
});

document.addEventListener('click', () => {
  document.querySelectorAll('.ticket__menu--open').forEach((m) => m.classList.remove('ticket__menu--open'));
});

window.addEventListener('online', () => { updateNetBadge(); syncPending(); loadEntries(); });
window.addEventListener('offline', updateNetBadge);

// ---------- Инициализация ----------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service worker не зарегистрировался:', err);
    });
  });
}

initAppearance();
initTheme();
updateNetBadge();
handleIncomingShare();
loadEntries();
ensureOfflineDictionary();
if (navigator.onLine) syncPending();