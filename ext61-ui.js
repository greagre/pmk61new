/* =========================================================
   pmk61 / ext61-ui.js
   Панель «Листинг расширения» + ввод EXT-команд + банки и переходы.

   ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ

   Штатный листинг строит ui.js, и он про префикс 0xF0 ничего не знает:
   для него каждая ячейка — одна команда. Править ui.js ради этого не
   нужно и рискованно, поэтому панель живёт рядом: ui.js перерисовывает
   свою программу в #prog, а мы показываем свою — в блоке, который
   вставлен сразу после него и не пересекается с чужим рендером.

   КАК ОБНОВЛЯЕТСЯ

   MutationObserver на #prog: каждый render() в ui.js пересобирает
   содержимое этого узла, значит наблюдатель срабатывает ровно тогда,
   когда программа или её состояние изменились. Никаких таймеров.

   ВВОД КОМАНД

   Выбираешь команду в списке и жмёшь «Записать» — она ложится в
   программу по текущему адресу, ровно как обычный набор в ПРГ.
   Пишется через writeExt(): две ячейки, префикс и второй байт,
   адрес сдвигается на две. Поэтому F0 21 не может превратиться
   в две самостоятельные команды.

   ЧТО ДОБАВЛЕНО В v=2

   1. Переключатель банка. Живёт НЕ внутри #tabRegs: ui.js полностью
      перерисовывает эту панель в renderRegs(), и любые вложенные
      кнопки сносились бы на каждом render(). Поэтому блок вставляется
      перед панелью и обновляет подсветку сам.
      Переключение идёт через ext.selectBank(n) — то же самое, что
      команда F0 0n, только без записи в программу.
   2. Журнал переходов банков и страниц. Журнал ui.js держит записи
      в локальной переменной journal и наружу их не отдаёт, поэтому
      свой список ведётся отдельно: step() ядра оборачивается, до
      и после вызова сравниваются bank() и page(). Появляется строка
      только когда банк или страница ДЕЙСТВИТЕЛЬНО сменились —
      чистый прогон остаётся без лишнего шума.

   ДВА РАЗНЫХ ОТКАЗА

   Раньше на любое отсутствие — и ядра, и декодера — панель писала
   «декодер не подключён». Это сбивало с толку: ядра могло не быть
   из-за ошибки в другом файле, а сообщение указывало не туда.
   Теперь причины различаются. И порядок проверок правильный:
   панель ввода должна оставаться рабочей даже без декодера.

   ПРАВКА v=10 (25.11.2026) — ОДИН ФОРМАТ КОДА ПЕРЕХОДА

   Декодер печатает переход тремя байтами («5D 00 03»), а ui.js в своём
   листинге — кодом и адресом подряд («5D 03»). Одна и та же программа
   выглядела в двух панелях по-разному, и это читалось как ошибка.
   Теперь панель расширения приводит код перехода к виду ui.js через
   jumpCodeText(): берёт байты у декодера (r.bytes) и печатает так же.
   Сам декодер не тронут — его формат проверяют тесты, и он остаётся
   «байты как есть» для тех, кому нужны именно ячейки.
   ========================================================= */
(function (global) {
  'use strict';

  var MIN_ROWS = 12;
  var box = null;
  var body = null;
  var info = null;
  var inp = null;
  var sel = null;
  var atLabel = null;
  var observer = null;
  var scheduled = false;

  var REG_CHARS = '0123456789abcde';

  /* --- новое в v=2 --- */
  var bankBox = null;
  var bankBtns = [];
  var tgtLabel = null;
  var jumpBox = null;
  var jumpBody = null;
  var jumps = [];
  var JUMP_MAX = 40;
  var cssDone = false;

  function pad2(n) {
    var s = String(n | 0);
    return s.length < 2 ? '0' + s : s;
  }

  function hex2(n) {
    var s = (n & 0xFF).toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }

  /* Код перехода в том же виде, что в основном листинге ui.js:
     код команды и две цифры адреса подряд — «5D 03», а не «5D 00 03». */
  function jumpCodeText(r) {
    if (!r) return '';
    if (!r.bytes || r.bytes.length !== 3) return r.code || '';
    return hex2(r.bytes[0]) + ' ' + String(r.bytes[1] & 0xFF) + String(r.bytes[2] & 0xFF);
  }

  function getCore() {
    return (global.MKUI && typeof global.MKUI.getCore === 'function')
      ? global.MKUI.getCore()
      : null;
  }

  function extOf(core) {
    return (core && core.ext) ? core.ext : null;
  }

  /* ---------- стили ---------- */

  function injectCss() {
    if (cssDone || document.getElementById('ext61ui-css')) { cssDone = true; return; }
    var st = document.createElement('style');
    st.id = 'ext61ui-css';
    st.textContent =
      '.ext-bank{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 8px 8px}' +
      '.ext-bank button{min-width:36px;padding:5px 9px;font:inherit;border-radius:9px;' +
        'border:1px solid rgba(0,0,0,.18);background:rgba(255,255,255,.55);cursor:pointer}' +
      '.ext-bank button.on{background:#2e7d32;color:#fff;border-color:#2e7d32}' +
      '.ext-cap{font-size:.85em;opacity:.75}' +
      '.ext-jumps .jrow{display:flex;gap:8px;padding:2px 8px;font-size:.9em}' +
      '.ext-jumps .jnum{opacity:.6;min-width:42px}' +
      '.ext-jumps .jtxt{flex:1}' +
      '.ext-jumps .logempty{padding:6px 8px;opacity:.7;font-size:.9em}';
    document.head.appendChild(st);
    cssDone = true;
  }

  /* ---------- список команд ---------- */

  function commandList() {
    var list = [
      [0x00, 'банк 0'], [0x01, 'банк 1'], [0x02, 'банк 2'], [0x03, 'банк 3'],
      [0x04, 'банк → X'], [0x05, 'банк-адресат ← X'], [0x06, 'банк-адресат → X'],
      [0x10, 'адрес → X'], [0x11, 'следующий адрес → X'],
      [0x20, 'страница 0'], [0x21, 'страница 1'], [0x22, 'страница 2'], [0x23, 'страница 3'],
      [0x24, 'страница → X']
    ];
    var i;
    for (i = 0; i < REG_CHARS.length; i++) {
      list.push([0x40 + i, 'x→П R' + REG_CHARS.charAt(i) + ' в банк-адресат']);
    }
    for (i = 0; i < REG_CHARS.length; i++) {
      list.push([0x60 + i, 'П→x R' + REG_CHARS.charAt(i) + ' из банка-адресата']);
    }
    return list;
  }

  /* ---------- запись ---------- */

  function writeSelected() {
    var core = getCore();
    if (!core || !sel) return;

    var ext = core.ext;
    if (!ext || typeof ext.writeExt !== 'function') {
      if (info) info.textContent = 'ядро без расширения — проверь порядок скриптов';
      return;
    }

    var second = parseInt(sel.value, 10);
    var at = core.ST.ip | 0;
    if (!ext.writeExt(second)) return;

    if (typeof core.changed === 'function') core.changed();
    if (global.MKUI && typeof global.MKUI.hint === 'function') {
      global.MKUI.hint('Записано F0 ' + hex2(second) + ' по адресу ' + pad2(at) +
        ' (две ячейки: ' + pad2(at) + ' и ' + pad2((at + 1) % core.PROG_LEN) + ')');
    }
    schedule();
  }

  /* ---------- построение панели листинга ---------- */

  function buildInput() {
    inp = document.createElement('div');
    inp.className = 'ext-input';
    inp.style.display = 'flex';
    inp.style.gap = '6px';
    inp.style.alignItems = 'center';
    inp.style.flexWrap = 'wrap';
    inp.style.padding = '6px 8px 8px';

    atLabel = document.createElement('span');
    atLabel.style.fontSize = '0.85em';
    atLabel.style.opacity = '0.75';

    sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Команда расширения');
    sel.style.flex = '1 1 200px';
    sel.style.minWidth = '0';

    commandList().forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = String(o[0]);
      opt.textContent = 'F0 ' + hex2(o[0]) + ' — ' + o[1];
      sel.appendChild(opt);
    });

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Записать';
    btn.addEventListener('click', writeSelected);

    inp.appendChild(sel);
    inp.appendChild(btn);
    inp.appendChild(atLabel);
  }

  function ensureBox() {
    if (box && box.parentNode) return true;
    var prog = document.getElementById('prog');
    if (!prog || !prog.parentNode) return false;

    box = document.createElement('div');
    box.className = 'prog ext-listing';
    box.id = 'extProg';

    var head = document.createElement('div');
    head.className = 'prog-head';

    var left = document.createElement('span');
    left.textContent = 'Листинг расширения';

    info = document.createElement('span');
    info.className = 'ext-info';

    head.appendChild(left);
    head.appendChild(info);

    body = document.createElement('div');

    box.appendChild(head);
    box.appendChild(body);

    buildInput();
    box.appendChild(inp);

    prog.parentNode.insertBefore(box, prog.nextSibling);
    return true;
  }

  /* ---------- переключатель банка ---------- */

  function ensureBankBox() {
    if (bankBox && bankBox.parentNode) return true;
    var regs = document.getElementById('tabRegs');
    if (!regs || !regs.parentNode) return false;

    injectCss();

    bankBox = document.createElement('div');
    bankBox.className = 'ext-bank';
    bankBox.id = 'extBank';

    var cap = document.createElement('span');
    cap.className = 'ext-cap';
    cap.textContent = 'Банк:';
    bankBox.appendChild(cap);

    bankBtns = [];
    for (var i = 0; i < 4; i++) {
      (function (n) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = String(n);
        b.setAttribute('aria-label', 'Показать банк регистров ' + n);
        b.addEventListener('click', function () { pickBank(n); });
        bankBox.appendChild(b);
        bankBtns.push(b);
      })(i);
    }

    tgtLabel = document.createElement('span');
    tgtLabel.className = 'ext-cap';
    bankBox.appendChild(tgtLabel);

    regs.parentNode.insertBefore(bankBox, regs);
    return true;
  }

  function pickBank(n) {
    var core = getCore();
    var ext = extOf(core);
    if (!ext || typeof ext.selectBank !== 'function') return;
    if (!ext.selectBank(n)) return;
    if (typeof core.changed === 'function') core.changed();
    if (global.MKUI && typeof global.MKUI.hint === 'function') {
      global.MKUI.hint('Банк регистров ' + n + ': на вкладке показаны R0…Re банка ' + n);
    }
    schedule();
  }

  function renderBankBox(core) {
    if (!ensureBankBox()) return;
    var ext = extOf(core);
    bankBox.style.display = ext ? 'flex' : 'none';
    if (!ext) return;

    var cur = (typeof ext.bank === 'function') ? ext.bank() : 0;
    bankBtns.forEach(function (b, i) { b.classList.toggle('on', i === cur); });
    if (tgtLabel) {
      var t = (typeof ext.targetBank === 'function') ? ext.targetBank() : 0;
      tgtLabel.textContent = 'адресат: ' + t;
    }
  }

  /* ---------- журнал переходов ---------- */

  function ensureJumpBox() {
    if (jumpBox && jumpBox.parentNode) return true;
    var log = document.getElementById('log');
    if (!log || !log.parentNode) return false;

    injectCss();

    jumpBox = document.createElement('div');
    jumpBox.className = 'prog ext-jumps';
    jumpBox.id = 'extJumpLog';

    var head = document.createElement('div');
    head.className = 'prog-head';
    var l = document.createElement('span');
    l.textContent = 'Переходы банков и страниц';
    head.appendChild(l);

    jumpBody = document.createElement('div');

    jumpBox.appendChild(head);
    jumpBox.appendChild(jumpBody);

    log.parentNode.insertBefore(jumpBox, log.nextSibling);
    return true;
  }

  function renderJumps() {
    if (!ensureJumpBox()) return;
    var ext = extOf(getCore());
    jumpBox.style.display = ext ? '' : 'none';
    if (!ext) return;

    jumpBody.innerHTML = '';
    if (!jumps.length) {
      var e = document.createElement('div');
      e.className = 'logempty';
      e.textContent = 'Пусто. Здесь появятся смены банка (F0 0n) и перехода на другую страницу (F0 2n).';
      jumpBody.appendChild(e);
      return;
    }

    jumps.forEach(function (j) {
      var row = document.createElement('div');
      row.className = 'jrow';
      var n = document.createElement('span');
      n.className = 'jnum';
      n.textContent = '#' + j.n;
      var t = document.createElement('span');
      t.className = 'jtxt';
      t.textContent = j.txt;
      var d = document.createElement('span');
      d.className = 'jnum';
      d.textContent = 'адр ' + pad2(j.ip);
      row.appendChild(n);
      row.appendChild(t);
      row.appendChild(d);
      jumpBody.appendChild(row);
    });
    jumpBody.scrollTop = jumpBody.scrollHeight;
  }

  function pushJump(core, b0, b1, p0, p1) {
    var parts = [];
    if (b0 !== b1) parts.push('банк ' + b0 + ' → ' + b1);
    if (p0 !== p1) parts.push('страница ' + p0 + ' → ' + p1);
    if (!parts.length) return;

    jumps.push({
      n: (core.ST && core.ST.steps) || 0,
      txt: parts.join(' · '),
      ip: (core.ST && core.ST.ip) || 0
    });
    if (jumps.length > JUMP_MAX) jumps.shift();
    renderJumps();
  }

  /* Оборачиваем step(): журнал ui.js наружу записей не отдаёт, поэтому
     смену банка и страницы отслеживаем сами — до и после шага. */
  function hookCore(core) {
    var ext = extOf(core);
    if (!ext || typeof ext.bank !== 'function' || core.__extUiHooked) return;
    core.__extUiHooked = true;

    var base = core.step;
    core.step = function () {
      var b0 = ext.bank();
      var p0 = (typeof ext.page === 'function') ? ext.page() : 0;
      var r = base.apply(core, arguments);
      var b1 = ext.bank();
      var p1 = (typeof ext.page === 'function') ? ext.page() : 0;
      if (b0 !== b1 || p0 !== p1) {
        pushJump(core, b0, b1, p0, p1);
        schedule();
      }
      return r;
    };
  }

  /* ---------- отрисовка листинга ---------- */

  function render() {
    scheduled = false;
    var core = getCore();

    /* блоки банков и переходов не зависят от декодера */
    renderBankBox(core);
    renderJumps(core);
    if (core) hookCore(core);

    if (!ensureBox()) return;

    /* Ядро — отдельно: без него нет ни программы, ни адреса. */
    if (!core || !core.ST) {
      body.innerHTML = '';
      info.textContent = 'ядро не подключено';
      return;
    }

    /* Декодер — отдельно: без него можно писать команды, но не читать. */
    if (!global.MKDasm) {
      body.innerHTML = '';
      info.textContent = 'декодер не подключён (disasm61.js)';
      if (atLabel) atLabel.textContent = '→ адрес ' + pad2(core.ST.ip | 0);
      return;
    }

    var prog = core.ST.prog;
    if (!prog) return;

    var total = prog.length;
    var used = global.MKDasm.used(prog);
    var end = Math.max(used, MIN_ROWS);
    if (end > total) end = total;

    var rows = global.MKDasm.rows(prog, { length: end });
    var ip = core.ST.ip | 0;
    var extCount = 0;

    var frag = document.createDocumentFragment();

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.kind === 'ext') extCount++;

      var row = document.createElement('div');
      row.className = 'prow'
        + (r.empty ? ' empty' : '')
        + (r.addr === ip ? ' cur' : '')
        + (r.kind === 'ext' ? ' ext' : '');

      var a = document.createElement('span');
      a.className = 'paddr';
      a.textContent = pad2(r.addr);

      var t = document.createElement('span');
      t.className = 'plabel';
      t.textContent = r.text;

      var c = document.createElement('span');
      c.className = 'pcode';
      c.textContent = (r.kind === 'jump') ? jumpCodeText(r) : r.code;

      row.appendChild(a);
      row.appendChild(t);
      row.appendChild(c);

      frag.appendChild(row);
    }

    body.innerHTML = '';
    body.appendChild(frag);

    var ext = extOf(core);
    var bank = ext ? ext.bank() : 0;
    var page = ext ? ext.page() : 0;
    var target = ext ? ext.targetBank() : 0;

    info.textContent = 'F0: ' + extCount + ' · занято ' + used + ' из ' + total +
      ' · банк ' + bank + ' · страница ' + page + (ext ? ' · адресат ' + target : '');
    if (atLabel) atLabel.textContent = '→ адрес ' + pad2(ip);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    if (global.requestAnimationFrame) {
      global.requestAnimationFrame(render);
    } else {
      setTimeout(render, 30);
    }
  }

  function attach() {
    var prog = document.getElementById('prog');
    if (!prog) return false;
    if (!observer && global.MutationObserver) {
      observer = new MutationObserver(function () { schedule(); });
      observer.observe(prog, { childList: true, characterData: true, subtree: true });
    }
    return true;
  }

  function boot() {
    if (!attach()) {
      /* ui.js строит панели не сразу — подождём один такт */
      setTimeout(boot, 60);
      return;
    }
    ensureBox();
    render();

    /* переключение вкладок и любые нажатия — повод пересчитать листинг */
    document.addEventListener('click', function () { schedule(); }, true);
    document.addEventListener('change', function () { schedule(); }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.MKExtUI = {
    refresh: schedule,
    render: render,
    write: writeSelected,
    selectBank: pickBank,
    jumps: function () { return jumps.slice(); }
  };
})(typeof window !== 'undefined' ? window : this);
