/* =========================================================
   pmk61 / ui.js
   Перенос интерфейса из mk-emulator — один-в-один.
   Отличия от 34-й ровно три:
     1. раскладки берутся из window.MKUI_MODELS (здесь — МК-61);
     2. ключи памяти с префиксом pmk61/;
     3. ядро своё (core.js ревизии 7), создаётся без параметров —
        у него умолчания линии 61: 105 шагов, 15 регистров, K-функции.

   ПРАВКА v3 (25.11.2026) — адреса выше 99 и страницы:

   1. Ядро создаётся С ПАРАМЕТРАМИ ПРОФИЛЯ (coreOptions). Раньше звали
      MKCore.create({ onEvent }) — и в core.js оставалось ADDR_HIGH = false.
      Из-за этого jumpAddr всегда возвращал −1, и листинг рисовал «→ ??»
      даже там, где адрес есть. Профиль mk-61 разрешает адреса 100…104,
      значит теперь они включены и у обычной МК-61.

   2. Адрес перехода больше НЕ считается здесь (было a*10+b). Логика
      одна и живёт в ядре: core.jumpAddr(i) понимает и обычные 00…99,
      и 100…104 (первая ячейка «•» 0x0A, вторая — цифра 0…4), и даёт −1
      там, где адрес битый. Две разные арифметики адреса — это источник
      расхождений, и его больше нет.

   3. Печать адреса — core.addrShow: «00»…«99» и «-0»…«-4», как на
      индикаторе. pad2 для адресов больше не используется (pad2 остался
      только для номера программы в метке).

   4. Длина памяти берётся у ЭКЗЕМПЛЯРА ядра (core.PROG_LEN), а не из
      глобального MK.PROG_LEN. У расширения память страничная: четыре
      страницы по 105, адреса внутри страницы двузначные — поэтому
      в листинге показывается «занято N из 105 · страница k/4 (всего 420)».

   ПРАВКА v4 (25.11.2026) — листинг и двухбайтные команды расширения:

   1. rowText знает префикс 0xF0: строка показывается ОДНОЙ командой
      («банк 1», «страница 0», «адрес → X») с кодом «F0 01», а не двумя
      строками «?» и «01». Второй байт читается по кругу — ровно так же,
      как его читает ядро, иначе листинг и исполнение разойдутся.
      Название операции берётся у MKExt61.extName — того же источника,
      что у панели «Листинг расширения». Один источник имён на два экрана.

   2. Размер строки стал свойством строки (info.wide): 1 обычная команда,
      2 у префикса F0, 3 у перехода. Раньше «3» было зашито отдельно
      только для переходов, а F0 шёл как одна ячейка — из-за этого после
      каждой F0-команды нумерация съезжала на единицу.

   3. «Занято N из 105» считается по ПРОГРАММЕ (MKDasm.used — последняя
      непустая строка), а не по позиции счётчика команд. Раньше было
      used = lastStep()+1: короткая программа после прогона до шага 50
      показывала «занято 51».

   Два режима:
     work  — «Работа»: корпус, дисплей, клавиатура, Пуск/Сброс.
     study — «Учёба»: плюс четыре вкладки
                      Числа · Регистры · Код · Журнал,
                      Шаг/Авто/00 и темп.

   Название загруженной программы (номер + имя) показывается
   в двух местах: чипом под дисплеем и на кнопке библиотеки.

   Наружу отдаёт мост window.MKUI — им пользуется shelf.js
   (библиотека программ): загрузка, прогон для проверки, подсказка.
   ========================================================= */
(function () {
  'use strict';

  var MODELS = window.MKUI_MODELS || window.MKProfiles || {};
  var STORE_KEY = 'pmk61/state/';
  var MODE_KEY = 'pmk61/mode';
  var TAB_KEY = 'pmk61/tab';
  var TEMPO_KEY = 'pmk61/tempo';
  var NAME_KEY = 'pmk61/progmeta/';
  var RUN_LIMIT = 20000;
  var LOG_MAX = 100;

  /* Префикс двухбайтных команд расширения. */
  var EXT_PREFIX = 0xF0;

  /* Демонстрационная программа: 7! — 5040.
     R0 — счётчик цикла, R1 — накопитель. */
  var DEMO_FACT = [
    0x40,       /* 00  X→П 0 : n в счётчик   */
    0x01,       /* 01  1                      */
    0x41,       /* 02  X→П 1 : накопитель = 1 */
    0x61,       /* 03  П→X 1 : начало цикла   */
    0x60,       /* 04  П→X 0                  */
    0x12,       /* 05  ×                      */
    0x41,       /* 06  X→П 1                  */
    0x5D, 0x00, 0x03, /* 07  F L0 03          */
    0x61,       /* 10  П→X 1 : результат      */
    0x50        /* 11  С/П                    */
  ];

  var el = {
    model: document.getElementById('model'),
    modelName: document.getElementById('modelName'),
    lcd: document.getElementById('lcd'),
    mode: document.getElementById('stMode'),
    layer: document.getElementById('stLayer'),
    step: document.getElementById('stStep'),
    stack: document.getElementById('stack'),
    regs: document.getElementById('tabRegs'),
    keys: document.getElementById('keys'),
    prog: document.getElementById('prog'),
    hint: document.getElementById('hint'),
    service: document.getElementById('service'),
    tempo: document.getElementById('tempo'),
    tempoRow: document.getElementById('tempoRow'),
    status: document.getElementById('status'),
    modeseg: document.getElementById('modeseg'),
    tabs: document.getElementById('tabs'),
    log: document.getElementById('log'),
    logClear: document.getElementById('logClear'),
    logCount: document.getElementById('logCount'),
    progTag: document.getElementById('progTag'),
    progTagNum: document.getElementById('progTagNum'),
    progTagName: document.getElementById('progTagName')
  };

  var profile = null;
  var core = null;
  var pick = null;
  var storeKey = '';
  var nameKey = '';

  var uiMode = 'study';
  var uiTab = 'num';
  var autoTimer = null;
  var stepCount = 0;
  var journal = [];
  var progMeta = null;   /* { num: 1, title: 'n! — факториал' } или null */

  /* ---------- модели ---------- */

  /* Параметры ядра из профиля модели. Раньше их не передавали вовсе,
     и ядро работало с умолчаниями — без адресов выше 99, потому что
     ADDR_HIGH в core.js включается ТОЛЬКО явно. Профиль mk-61 адреса
     100…104 разрешает, значит передавать их обязательно. */
  function coreOptions(id) {
    var o = { onEvent: onEvent };
    var P = window.MKProfiles;
    var p = (P && typeof P.get === 'function') ? P.get(id) : null;
    if (!p) return o;
    if (p.progLen > 0) o.progLen = p.progLen;
    if (p.regCount > 0) o.regCount = p.regCount;
    if (typeof p.nop === 'number') o.nop = p.nop;
    if (p.maxDig > 0) o.maxDig = p.maxDig;
    if (typeof p.addrHigh === 'boolean') o.addrHigh = p.addrHigh;
    if (typeof p.addrHighFirst === 'number') o.addrHighFirst = p.addrHighFirst;
    if (typeof p.addrHighLast === 'number') o.addrHighLast = p.addrHighLast;
    return o;
  }

  function buildModelList() {
    var ids = Object.keys(MODELS);
    el.model.innerHTML = '';
    ids.forEach(function (id) {
      var o = document.createElement('option');
      o.value = id;
      o.textContent = MODELS[id].model || MODELS[id].title || id;
      el.model.appendChild(o);
    });
    if (!ids.length) el.model.style.display = 'none';
  }

  function setModel(id) {
    profile = MODELS[id];
    if (!profile) return;
    storeKey = STORE_KEY + id;
    nameKey = NAME_KEY + id;
    el.modelName.textContent = profile.model || profile.title || id;
    core = window.MKCore.create(coreOptions(id));
    pick = null;
    stepCount = 0;
    journal = [];
    progMeta = null;
    stopAuto();
    loadProgMeta();
    loadState();
    render();
    setHint('Модель ' + (profile.model || profile.title) + '. Клавиша f — второй слой, k — слой косвенных команд МК-61.');
  }

  /* ---------- метка программы ---------- */
  function setProgMeta(meta) {
    progMeta = (meta && meta.title) ? { num: meta.num || null, title: String(meta.title) } : null;
    try {
      if (progMeta) localStorage.setItem(nameKey, JSON.stringify(progMeta));
      else localStorage.removeItem(nameKey);
    } catch (e) {}
    renderProgTag();
    renderService();
  }

  function loadProgMeta() {
    progMeta = null;
    try {
      var raw = localStorage.getItem(nameKey);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.title) progMeta = { num: o.num || null, title: String(o.title) };
      }
    } catch (e) {}
    renderProgTag();
  }

  function progLabel(short) {
    if (!progMeta) return '';
    var num = progMeta.num ? pad2(progMeta.num) + ' · ' : '';
    return num + progMeta.title;
  }

  function renderProgTag() {
    if (!el.progTag) return;
    if (!progMeta) {
      el.progTag.hidden = true;
      return;
    }
    el.progTag.hidden = false;
    if (el.progTagNum) el.progTagNum.textContent = progMeta.num ? pad2(progMeta.num) : '—';
    if (el.progTagName) el.progTagName.textContent = progMeta.title;
    el.progTag.title = 'Загружена программа: ' + progLabel() + '. Нажми, чтобы открыть библиотеку';
  }

  /* ---------- режим Работа / Учёба ---------- */
  function setMode(mode, silent) {
    uiMode = (mode === 'work') ? 'work' : 'study';
    document.body.dataset.mode = uiMode;
    try { localStorage.setItem(MODE_KEY, uiMode); } catch (e) {}
    Array.prototype.forEach.call(el.modeseg.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.dataset.mode === uiMode);
    });
    if (uiMode === 'work') stopAuto();
    render();
    if (!silent) {
      setHint(uiMode === 'work'
        ? 'Режим «Работа»: клавиатура и Пуск. Переключись в «Учёбу», чтобы видеть листинг и шаги.'
        : 'Режим «Учёба»: вкладки Числа · Регистры · Код · Журнал, шаг с любого адреса и авто с темпом.');
    }
  }

  function loadMode() {
    var m = null;
    try { m = localStorage.getItem(MODE_KEY); } catch (e) {}
    setMode(m === 'work' ? 'work' : 'study', true);
  }

  /* ---------- вкладки Учёбы ---------- */
  var TABS = ['num', 'regs', 'code', 'log'];

  function setTab(tab, silent) {
    uiTab = (TABS.indexOf(tab) >= 0) ? tab : 'num';
    document.body.dataset.tab = uiTab;
    try { localStorage.setItem(TAB_KEY, uiTab); } catch (e) {}
    Array.prototype.forEach.call(el.tabs.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.dataset.tab === uiTab);
    });
    renderPanes();
    if (!silent) {
      setHint(uiTab === 'num' ? 'Числа: стек X Y Z T X1.'
        : uiTab === 'regs' ? 'Регистры: R0…Re. Меняются командами x→П и П→X.'
        : uiTab === 'code' ? 'Код: листинг программы. Нажми строку — шаг пойдёт с этого адреса.'
        : 'Журнал: что выполнилось и какие регистры изменились.');
    }
  }

  function loadTab() {
    var t = null;
    try { t = localStorage.getItem(TAB_KEY); } catch (e) {}
    setTab(t || 'num', true);
  }

  function renderPanes() {
    if (uiTab === 'num') renderStack();
    else if (uiTab === 'regs') renderRegs();
    else if (uiTab === 'code') renderProgram();
    else renderLog();
  }

  /* ---------- события ядра ---------- */
  function onEvent(type, data) {
    if (type === 'pick-register') {
      pick = { mode: (data && data.mode) || 'stox' };
      document.body.classList.toggle('picking', !!pick);
      /* выбрать регистр можно только на вкладке «Регистры» */
      if (uiMode === 'study' && uiTab !== 'regs') setTab('regs', true);
      render();
      setHint('Выбери регистр: ' + window.MKCore.REG_NAMES[0] + ' … ' + window.MKCore.REG_NAMES[window.MKCore.REG_COUNT - 1]);
      return;
    }
    if (type === 'hint' && typeof data === 'string') {
      setHint(data);
      return;
    }
    if (type === 'change' || type === 'error') render();
  }

  function setHint(text) {
    el.hint.textContent = text || '';
  }

  /* ---------- сохранение ---------- */
  function saveState() {
    try {
      localStorage.setItem(storeKey, JSON.stringify(core.snapshot()));
    } catch (e) { /* приватный режим — просто не сохраняем */ }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(storeKey);
      if (raw) core.restore(JSON.parse(raw));
    } catch (e) { /* битое состояние не должно мешать запуску */ }
  }

  /* ---------- отрисовка ---------- */
  function lcdText() {
    var st = core.ST;
    if (st.err) return 'ЕГГОГ';
    return core.fmt(st.X);
  }

  function pad2(n) {
    var s = String(n | 0);
    return s.length < 2 ? '0' + s : s;
  }

  function hex2(n) {
    var s = (n & 0xFF).toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }

  /* Адрес для человека: «00»…«99» и «-0»…«-4». Печать живёт в ядре,
     чтобы листинг и индикатор не разошлись. */
  function addrText(n) {
    if (core && typeof core.addrShow === 'function') return core.addrShow(n);
    return pad2(n);
  }

  /* Страница программы — только у расширения (ext61.js).
     У обычной МК-61 памяти страничной нет и подпись не нужна. */
  function pageText() {
    if (!core || !core.ext || typeof core.ext.page !== 'function') return '';
    var total = (typeof core.ext.pagesCount === 'function') ? core.ext.pagesCount() : 0;
    if (!total) return '';
    return 'страница ' + (core.ext.page() + 1) + '/' + total;
  }

  function pagesTotal() {
    if (!core || !core.ext || typeof core.ext.pagesCount !== 'function') return 0;
    return core.ext.pagesCount() || 0;
  }

  function render() {
    if (!core) return;
    var st = core.ST;

    el.lcd.textContent = lcdText();
    el.lcd.classList.toggle('err', !!st.err);
    el.mode.textContent = st.mode === 'PRG' ? 'ПРГ' : 'АВТ';
    el.layer.textContent = st.layer === 'f' ? 'F' : (st.layer === 'k' ? 'K' : '—');
    el.step.textContent = addrText(st.ip);

    renderPanes();
    renderKeys();
    renderService();
    renderStatus();
    renderProgTag();
    saveState();
  }

  function renderStack() {
    var st = core.ST;
    var rows = [
      ['X', lcdText()],
      ['Y', core.fmt(st.Y)],
      ['Z', core.fmt(st.Z)],
      ['T', core.fmt(st.T)],
      ['X1', core.fmt(st.X1)]
    ];
    el.stack.innerHTML = '';
    rows.forEach(function (row) {
      var d = document.createElement('div');
      d.className = 'cell' + (row[0] === 'X' ? ' cur' : '');
      var b = document.createElement('b');
      b.textContent = row[0];
      var s = document.createElement('span');
      s.textContent = row[1];
      d.appendChild(b);
      d.appendChild(s);
      el.stack.appendChild(d);
    });
  }

  function renderRegs() {
    var st = core.ST;
    el.regs.innerHTML = '';
    for (var i = 0; i < window.MKCore.REG_COUNT; i++) {
      (function (idx) {
        var d = document.createElement(pick ? 'button' : 'div');
        if (pick) d.type = 'button';
        d.className = 'reg' + (pick ? ' pick' : '');
        var b = document.createElement('b');
        b.textContent = window.MKCore.REG_NAMES[idx];
        var s = document.createElement('span');
        s.textContent = core.fmt(st.R[idx]);
        d.appendChild(b);
        d.appendChild(s);
        if (pick) {
          d.addEventListener('click', function () {
            var mode = pick.mode === 'stox' ? 'sto' : (pick.mode === 'loadx' ? 'ld' : 'k');
            pick = null;
            document.body.classList.remove('picking');
            core.key({ a: 'reg', r: idx, mode: mode });
            setHint('Регистр ' + window.MKCore.REG_NAMES[idx] + ' = ' + core.fmt(st.R[idx]));
            render();
          });
        }
        el.regs.appendChild(d);
      })(i);
    }
  }

  function renderKeys() {
    var layer = core.ST.layer || 'main';
    var keys = (profile.layers[layer] || profile.layers.main);
    el.keys.innerHTML = '';
    keys.forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'key' + (k.cls ? ' ' + k.cls : '');
      if ((k.a === 'pref-f' && layer === 'f') || (k.a === 'pref-k' && layer === 'k')) {
        b.classList.add('on');
      }
      b.textContent = k.t;
      b.addEventListener('click', function () { press(k); });
      el.keys.appendChild(b);
    });
  }

  /* ---------- служебные кнопки по режиму ---------- */
  function mkBtn(text, handler, on) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (on) b.classList.add('on');
    b.addEventListener('click', handler);
    return b;
  }

  function openLibrary() {
    if (window.MKSHELF) window.MKSHELF.open();
    else setHint('Библиотека программ не подключена');
  }

  function libraryBtn() {
    var text = progMeta
      ? '📂 ' + progLabel()
      : '📂 Программа';
    return mkBtn(text, openLibrary);
  }

  function renderService() {
    el.service.innerHTML = '';
    el.service.classList.toggle('wide', uiMode === 'work');

    if (uiMode === 'work') {
      el.service.appendChild(mkBtn('▶ Пуск', function () { runProgram(); render(); }));
      el.service.appendChild(mkBtn('⟲ Сброс', function () { doReset(); }));
      el.service.appendChild(libraryBtn());
      el.service.appendChild(mkBtn('Очистить память', function () { clearProg(); }));
      return;
    }

    el.service.appendChild(mkBtn('Шаг ▶', function () { doStep(); }));
    el.service.appendChild(mkBtn(autoTimer ? '⏸ Стоп' : '▷ Авто', function () { toggleAuto(); }, !!autoTimer));
    el.service.appendChild(mkBtn('00', function () { setAddressZero(); }));
    el.service.appendChild(mkBtn('⟲ Сброс', function () { doReset(); }));
    el.service.appendChild(libraryBtn());
    el.service.appendChild(mkBtn('Очистить память', function () { clearProg(); }));
  }

  function renderStatus() {
    if (!el.status) return;
    el.status.innerHTML = '';
    var page = pageText();
    var l = document.createElement('span');
    l.innerHTML = 'шаг <b>' + stepCount + '</b> · PC <b>' + addrText(core.ST.ip) + '</b> / ' + core.PROG_LEN +
      (page ? ' · ' + page : '');
    var r = document.createElement('span');
    r.textContent = autoTimer
      ? 'авто ' + tempoSec() + ' с'
      : (instantTempo() ? 'мгновенно' : 'вручную');
    el.status.appendChild(l);
    el.status.appendChild(r);
  }

  /* ---------- листинг программы ---------- */

  /* Подпись строки. Размер строки возвращается вместе с подписью (wide),
     потому что он зависит от ПЕРВОГО байта:
        0xF0    → 2 ячейки (префикс + второй байт)
        переход → 3 ячейки (команда + десятки + единицы)
        прочее  → 1 ячейка
     Раньше «3» считалось отдельно в renderProgram только для переходов,
     а F0 шёл как одна ячейка — и после каждой команды расширения адреса
     съезжали на единицу, второй байт печатался как своя команда («01»),
     а сам префикс как «?».

     Имя операции у F0 берётся у MKExt61.extName — того же источника,
     что у панели «Листинг расширения»: два экрана не могут разойтись. */
  function rowText(code, i) {
    var MK = window.MKCore;
    if (code === MK.NOP) return { label: '—', code: '', empty: true, wide: 1 };

    if (code === EXT_PREFIX) {
      /* Второй байт читается по кругу — так же, как его берёт ядро,
         иначе листинг покажет не то, что исполнится. */
      var second = core.ST.prog[(i + 1) % core.PROG_LEN] & 0xFF;
      var name = (window.MKExt61 && typeof window.MKExt61.extName === 'function')
        ? window.MKExt61.extName(second)
        : 'EXT ' + hex2(second);
      return { label: name, code: 'F0 ' + hex2(second), empty: false, wide: 2 };
    }

    if (MK.isJumpCmd(code)) {
      var a = core.ST.prog[(i + 1) % core.PROG_LEN];
      var b = core.ST.prog[(i + 2) % core.PROG_LEN];
      var ad = (typeof core.jumpAddr === 'function') ? core.jumpAddr(i) : -1;
      return {
        label: core.cmdName(code) + (ad >= 0 ? ' → ' + addrText(ad) : ' → ??'),
        code: MK.codeStr(code) + ' ' + a + b,
        empty: false,
        wide: 3
      };
    }
    return { label: core.cmdName(code), code: MK.codeStr(code), empty: false, wide: 1 };
  }

  /* Сколько ячеек занимает программа по факту: конец последней непустой
     строки. Пустая память даёт 0, а не 105. Считает декодер, у которого
     те же правила размера строки, что и у листинга. */
  function usedCells() {
    if (window.MKDasm && typeof window.MKDasm.used === 'function') {
      return window.MKDasm.used(core.ST.prog, { length: core.PROG_LEN });
    }
    return Math.max(core.lastStep() + 1, 0);
  }

  function renderProgram() {
    if (!el.prog) return;
    var st = core.ST;
    var MK = window.MKCore;
    var last = core.lastStep();

    var end = Math.max(last + 1, st.ip + 1, 12);
    if (end > core.PROG_LEN) end = core.PROG_LEN;

    el.prog.innerHTML = '';

    var head = document.createElement('div');
    head.className = 'prog-head';
    var left = document.createElement('span');
    left.textContent = progMeta ? ('Программа · ' + progLabel()) : 'Программа';
    var right = document.createElement('span');
    var used = usedCells();
    var page = pageText();
    var total = pagesTotal();
    right.innerHTML = 'адрес <b>' + addrText(st.ip) + '</b> · занято <b>' + used + '</b> из ' + core.PROG_LEN +
      (page ? ' · ' + page : '') +
      (total ? ' <span class="pdim">(всего ' + (core.PROG_LEN * total) + ')</span>' : '');
    head.appendChild(left);
    head.appendChild(right);
    el.prog.appendChild(head);

    var i = 0;
    while (i < end) {
      var code = st.prog[i] & 0xFF;
      var info = rowText(code, i);
      var wide = info.wide || 1;

      var row = document.createElement('div');
      row.className = 'prow' + (info.empty ? ' empty' : '') + (i === st.ip ? ' cur' : '');

      var a = document.createElement('span');
      a.className = 'paddr';
      a.textContent = addrText(i);

      var t = document.createElement('span');
      t.className = 'plabel';
      t.textContent = info.label;

      var c = document.createElement('span');
      c.className = 'pcode';
      c.textContent = info.code;

      row.appendChild(a);
      row.appendChild(t);
      row.appendChild(c);

      (function (addr, label, empty) {
        row.addEventListener('click', function () {
          core.ST.ip = addr;
          setHint('Адрес ' + addrText(addr) + (empty ? ' — пустая ячейка' : ': ' + label));
          render();
        });
      })(i, info.label, info.empty);

      el.prog.appendChild(row);
      i += wide;
    }

    var cur = el.prog.querySelector('.prow.cur');
    if (cur && uiMode === 'study' && el.prog.scrollHeight > el.prog.clientHeight) {
      var top = cur.offsetTop - el.prog.clientHeight / 2;
      el.prog.scrollTop = Math.max(0, top);
    }
  }

  /* ---------- журнал шагов ---------- */
  function snap() {
    var st = core.ST;
    var R = [];
    for (var i = 0; i < window.MKCore.REG_COUNT; i++) R.push(st.R[i] & 255);
    return { R: R, X: st.X, ip: st.ip };
  }

  function collectDiff(before) {
    var st = core.ST;
    var out = [];
    for (var i = 0; i < window.MKCore.REG_COUNT; i++) {
      var now = st.R[i] & 255;
      if (now !== before.R[i]) {
        out.push(window.MKCore.REG_NAMES[i] + ' ' + core.fmt(before.R[i]) + '→' + core.fmt(now));
      }
    }
    if ((st.X & 255) !== (before.X & 255) || Math.abs(st.X - before.X) > 1e-12) {
      out.push('X ' + core.fmt(before.X) + '→' + core.fmt(st.X));
    }
    return out;
  }

  function journalAdd(before, label, result) {
    var st = core.ST;
    var diff = collectDiff(before);
    if (st.ip !== before.ip) diff.push('→ ' + addrText(st.ip));
    var note = '';
    if (result === 'stop') note = 'С/П';
    else if (result === 'error') note = 'ошибка';

    journal.push({
      n: stepCount,
      addr: before.ip,
      label: label,
      diff: diff,
      note: note,
      err: result === 'error'
    });
    if (journal.length > LOG_MAX) journal.shift();
  }

  function renderLog() {
    if (!el.log) return;
    if (el.logCount) el.logCount.textContent = String(journal.length);
    el.log.innerHTML = '';

    if (!journal.length) {
      var e = document.createElement('div');
      e.className = 'logempty';
      e.textContent = 'Пусто. Загрузи пример и жми «Шаг ▶» или «▷ Авто» — здесь появятся выполненные команды.';
      el.log.appendChild(e);
      return;
    }

    journal.forEach(function (rec) {
      var row = document.createElement('div');
      row.className = 'logrow' + (rec.err ? ' err' : '');

      var n = document.createElement('span');
      n.className = 'lnum';
      n.textContent = '#' + rec.n;

      var a = document.createElement('span');
      a.className = 'laddr';
      a.textContent = addrText(rec.addr);

      var l = document.createElement('span');
      l.className = 'llab';
      l.textContent = rec.label + (rec.note ? ' · ' + rec.note : '');

      var d = document.createElement('span');
      d.className = 'ldiff' + (rec.diff.length ? '' : ' dim');
      d.textContent = rec.diff.length ? rec.diff.join(' · ') : 'без изменений';

      row.appendChild(n);
      row.appendChild(a);
      row.appendChild(l);
      row.appendChild(d);
      el.log.appendChild(row);
    });

    el.log.scrollTop = el.log.scrollHeight;
  }

  function clearJournal(silent) {
    journal = [];
    renderLog();
    if (!silent) setHint('Журнал шагов очищен');
  }

  /* ---------- нажатия ---------- */
  function press(k) {
    var wasPrg = core.ST.mode === 'PRG';
    var isSp = (k.a === 'sp');
    var oldMeta = progMeta;
    core.key(k);

    /* своя команда в ПРГ — значит программа больше не та, что загружена */
    if (wasPrg && oldMeta) {
      setProgMeta(null);
      setHint('Программа изменена вручную — метка «' + oldMeta.title + '» снята');
    }

    /* С/П в автоматическом режиме запускает прогон программы */
    if (isSp && core.ST.run) {
      runProgram();
    }
    render();
  }

  function stepOnce() {
    var before = snap();
    var code = core.ST.prog[core.ST.ip] & 255;
    var info = rowText(code, core.ST.ip);
    var r = core.step();
    stepCount++;
    journalAdd(before, info.empty ? 'пустая ячейка' : info.label, r);
    return r;
  }

  function runProgram() {
    stopAuto();
    var steps = 0;
    var overflow = false;
    var err = false;

    while (steps < RUN_LIMIT) {
      var r = stepOnce();
      steps++;
      if (r === 'stop') break;
      if (r === 'error') { err = true; break; }
    }
    if (steps >= RUN_LIMIT) overflow = true;

    var name = progMeta ? ' «' + progLabel() + '»' : '';
    if (overflow) {
      setHint('Остановлено по лимиту шагов (' + RUN_LIMIT + ') — похоже на вечный цикл');
    } else if (err) {
      setHint('Ошибка выполнения на шаге ' + steps + ' · адрес ' + addrText(core.ST.ip));
    } else {
      setHint('Программа' + name + ': остановка на адресе ' + addrText(core.ST.ip) + ' · шагов: ' + steps + ' · X = ' + core.fmt(core.ST.X));
    }
    render();
  }

  function doStep() {
    var r = stepOnce();
    if (r === 'stop') setHint('С/П на адресе ' + addrText(core.ST.ip));
    else if (r === 'error') setHint('Ошибка выполнения на адресе ' + addrText(core.ST.ip));
    else setHint('Шаг выполнен · адрес ' + addrText(core.ST.ip));
    render();
  }

  function doReset() {
    stopAuto();
    core.reset(false);
    pick = null;
    document.body.classList.remove('picking');
    stepCount = 0;
    journal = [];
    setHint('Сброшено: стек, регистры, адрес 00 и журнал шагов');
    render();
  }

  function setAddressZero() {
    stopAuto();
    core.ST.ip = 0;
    setHint('Счётчик команд на адресе 00');
    render();
  }

  function clearProg() {
    stopAuto();
    core.clearProgram();
    core.ST.ip = 0;
    stepCount = 0;
    journal = [];
    setProgMeta(null);
    setHint('Программная память очищена, адрес 00');
    render();
  }

  function loadDemo() {
    stopAuto();
    core.setProgram(DEMO_FACT, false);
    core.setX(7);
    pick = null;
    document.body.classList.remove('picking');
    stepCount = 0;
    journal = [];
    setProgMeta({ num: 1, title: 'n! — факториал (демо)' });
    setHint('Пример 7! в памяти: R0 = 7. Нажми «Пуск» — должно получиться 5040.');
    render();
  }

  /* ---------- авто-прогон с темпом ---------- */
  function tempoSec() {
    return parseInt(el.tempo && el.tempo.value, 10) || 0;
  }

  /* «мгновенно» — темп без пауз: весь прогон за один такт */
  function instantTempo() {
    return !!(el.tempo && String(el.tempo.value) === 'instant');
  }

  function ensureInstantTempo() {
    if (!el.tempo) return;
    if (el.tempo.querySelector('option[value="instant"]')) return;
    var o = document.createElement('option');
    o.value = 'instant';
    o.textContent = 'мгновенно';
    el.tempo.insertBefore(o, el.tempo.firstChild);
  }

  function toggleAuto() {
    if (autoTimer) {
      stopAuto();
      setHint('Авто остановлено на адресе ' + addrText(core.ST.ip));
      render();
      return;
    }
    if (instantTempo()) {
      runProgram();
      setHint('Авто: мгновенный прогон · шагов ' + stepCount + ' · X = ' + core.fmt(core.ST.X));
      render();
      return;
    }
    var sec = tempoSec();
    if (!sec) {
      setHint('Темп «вручную»: жми «Шаг ▶» по одной команде.');
      return;
    }
    autoTimer = setInterval(function () {
      var r = stepOnce();
      render();
      if (r === 'stop' || r === 'error') {
        stopAuto();
        setHint(r === 'stop'
          ? 'Авто: С/П на адресе ' + addrText(core.ST.ip) + ' · X = ' + core.fmt(core.ST.X)
          : 'Авто: ошибка на адресе ' + addrText(core.ST.ip));
        render();
      }
    }, sec * 1000);
    setHint('Авто: шаг каждые ' + sec + ' с · журнал пополняется');
    render();
  }

  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }

  /* ---------- обработчики вне клавиатуры ---------- */
  el.model.addEventListener('change', function () {
    try { localStorage.removeItem(storeKey); } catch (e) {}
    setModel(el.model.value);
  });

  el.modeseg.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mode]');
    if (b) setMode(b.dataset.mode);
  });

  el.tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (b) setTab(b.dataset.tab);
  });

  if (el.logClear) {
    el.logClear.addEventListener('click', function () { clearJournal(); });
  }

  if (el.progTag) {
    el.progTag.addEventListener('click', openLibrary);
  }

  if (el.tempo) {
    el.tempo.addEventListener('change', function () {
      try { localStorage.setItem(TEMPO_KEY, el.tempo.value); } catch (e) {}
      if (autoTimer) { stopAuto(); toggleAuto(); } else renderStatus();
    });
  }

  /* ---------- мост для библиотеки программ (shelf.js) ---------- */
  window.MKUI = {
    /* загрузка программы с данными в регистрах и меткой (номер + имя) */
    loadProgram: function (prog, regs, meta) {
      if (!core) return;
      stopAuto();
      core.reset(false);
      core.setProgram(prog, false);
      if (regs) {
        Object.keys(regs).forEach(function (k) {
          var i = parseInt(k, 10);
          if (i >= 0 && i < window.MKCore.REG_COUNT) core.ST.R[i] = regs[k];
        });
      }
      core.ST.X = 0;
      core.ST.Y = 0;
      core.ST.Z = 0;
      core.ST.T = 0;
      core.ST.X1 = 0;
      core.ST.ip = 0;
      core.ST.err = null;
      pick = null;
      document.body.classList.remove('picking');
      stepCount = 0;
      journal = [];
      if (meta !== undefined) setProgMeta(meta);
      render();
    },

    /* прогон ради проверки: возвращает результат, шаги и X */
    runForCheck: function (limit) {
      var max = limit || RUN_LIMIT;
      var steps = 0;
      var res = 'limit';
      while (steps < max) {
        var r = stepOnce();
        steps++;
        if (r === 'stop') { res = 'stop'; break; }
        if (r === 'error') { res = 'error'; break; }
      }
      render();
      return { result: res, steps: steps, X: core.ST.X };
    },

    /* сколько ячеек занято — по программе, а не по счётчику шагов */
    usedCells: function () { return usedCells(); },

    setProgMeta: function (meta) { setProgMeta(meta); },
    progMeta: function () { return progMeta; },
    hint: function (t) { setHint(t); },
    fmt: function (v) { return core.fmt(v); },
    getCore: function () { return core; },
    openShelf: function () { openLibrary(); }
  };

  /* ---------- старт ---------- */
  buildModelList();
  setModel(el.model.value || Object.keys(MODELS)[0]);
  ensureInstantTempo();
  try {
    var savedTempo = localStorage.getItem(TEMPO_KEY);
    if (savedTempo && el.tempo) el.tempo.value = savedTempo;
  } catch (e) {}
  loadMode();
  loadTab();
})();
