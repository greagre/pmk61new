/* =========================================================
   pmk61 / library.js — библиотека программ (ревизия 2)

   Что делает:
   - сохраняет текущую программу ВМЕСТЕ с регистрами, X и углом;
   - список сохранённых, кнопка ▶ возвращает и программу, и регистры;
   - выгружает TXT в договорённом формате: «Перед пуском», затем шаги
     «адрес · десятичный код · подпись команды», плюс строки кодов;
   - выгружает и принимает JSON;
   - принимает TXT обратно: строки «адрес  код  подпись» или «Коды (hex):».

   «Перед пуском» показывает ТОЛЬКО входные регистры — те, которые
   программа читает раньше, чем записывает. Правило взято из 34-го проекта.

   Ревизия 2 (закрыты два долга контрольных тестов):
   - коды 0x4F и 0x6F адресуют R0, а не «R15»: младшая цифра F
     нормализуется ДО сверки с числом регистров профиля. Раньше запись
     в written[15] молча выбрасывалась циклом до REG_COUNT, и программа
     с 4F/6F считалась «без входных регистров» независимо от кода;
   - X возвращается при импорте TXT: строка «Результат на момент
     сохранения: X = …» теперь пишется всегда, когда X известно
     (и при X = 0 тоже), и разбирается обратно;
   - числа разбираются с учётом формата индикатора: «1.2345678 05»
     читается как 1.2345678·10^5, а не как 1.234567805. Это касается
     и X, и строки «Регистры при сохранении».

   Ядро (core.js) и слой ввода (core-keys.js) не трогаются.
   Подключение: после core-keys.js и ДО скрипта, который вызывает
   MKCore.create(). Файл перехватывает создание ядра, чтобы получить
   на него ссылку: интерфейс держит core в своём замыкании.
   ========================================================= */
(function (global) {
  'use strict';

  var MK = global.MKCore;
  if (!MK || typeof MK.create !== 'function') return;
  if (global.PMK61Lib) return;              /* дважды не подключаемся */

  var origCreate = MK.create;
  MK.create = function (opt) {
    var core = origCreate(opt);
    global.PMK61_CORE = core;
    return core;
  };

  var STORE = 'pmk61/library';

  /* ---------- хранилище ---------- */
  function loadAll() {
    try {
      var raw = localStorage.getItem(STORE);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function saveAll(list) {
    try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) {}
  }

  function stamp(ts) {
    var d = ts ? new Date(ts) : new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function core() { return global.PMK61_CORE || null; }

  /* ---------- разбор чисел индикатора ----------
     Ядро печатает большие и малые числа как на ПМК: мантисса, пробел,
     знак порядка (или пробел) и две цифры порядка. Поэтому «1.5 09»
     означает 1.5·10^9, а «-1.5-09» — −1.5·10^−9.
     Наивный parseFloat после удаления пробелов дал бы 1.509 — неверно. */
  function numFromText(s) {
    var t = String(s == null ? '' : s).trim().replace(',', '.');
    if (!t) return NaN;
    var m = t.match(/^(-?\d+(?:\.\d+)?)\s+([-+]?\d{1,2})$/);
    if (m) {
      var mant = parseFloat(m[1]);
      var exp = parseInt(m[2], 10);
      if (isFinite(mant) && isFinite(exp)) return mant * Math.pow(10, exp);
    }
    return parseFloat(t.replace(/\s+/g, ''));
  }

  /* ---------- что считаем входным регистром ----------
     Идём по всей памяти программ и следим за двумя множествами:
     «уже записан» и «уже прочитан до записи». Регистр, который
     прочитан раньше первой записи, — входной. Циклы L0–L3 читают
     и тут же меняют свой регистр, поэтому он тоже входной.

     Младшая цифра F (15) по таблице кодов означает R0 — нормализуем
     её до любых сравнений с числом регистров профиля. */
  var REG_F = 15;

  function normReg(lo) {
    return lo === REG_F ? 0 : lo;
  }

  function loopReg(code) {
    if (code === 0x5D) return 0;
    if (code === 0x5B) return 1;
    if (code === 0x58) return 2;
    if (code === 0x5A) return 3;
    return -1;
  }

  function inputRegisters(c) {
    var prog = c.getProgram();
    var written = {}, inputs = {}, i, code, hi, r;
    for (i = 0; i < prog.length; i++) {
      code = prog[i];
      hi = code & 0xF0;
      r = normReg(code & 0x0F);
      if (r >= c.REG_COUNT) r = -1;

      if (hi === 0x40 || hi === 0xB0) {        /* x→П, K x→П — запись */
        if (r >= 0) written[r] = 1;
      } else if (hi === 0x60) {               /* П→x — чтение */
        if (r >= 0 && !written[r]) inputs[r] = 1;
      } else if (loopReg(code) >= 0) {        /* F L0…L3 — счётчик */
        r = loopReg(code);
        if (!written[r]) inputs[r] = 1;
      }
    }
    var out = [];
    for (r = 0; r < c.REG_COUNT; r++) {
      if (inputs[r]) out.push(r);
    }
    return out;
  }

  function regsLine(c, withValues) {
    var ins = inputRegisters(c);
    if (!ins.length) return 'Перед пуском: ничего вводить не нужно';
    var parts = [];
    for (var i = 0; i < ins.length; i++) {
      var r = ins[i];
      parts.push('R' + c.REG_NAMES[r] + (withValues ? ' = ' + c.fmt(c.ST.R[r]) : ''));
    }
    return 'Перед пуском: ' + parts.join(' · ');
  }

  /* ---------- читаемый TXT ---------- */
  function listingRows(c) {
    var prog = c.getProgram();
    var rows = [];
    for (var i = 0; i < prog.length; i++) {
      var code = prog[i];
      if (code === c.NOP) continue;
      rows.push({
        addr: i,
        addrText: c.addrShow(i),
        code: code,
        hex: MK.codeStr(code),
        dec: code,
        name: c.cmdName(code)
      });
    }
    return rows;
  }

  function toText(c, item) {
    var rows = listingRows(c);
    var lines = [];
    lines.push('МК-61 · ' + (item && item.name ? item.name : 'без названия'));
    lines.push('Сохранено: ' + stamp(item && item.savedAt));
    lines.push(regsLine(c, true));
    /* X пишем всегда, когда он известен: ноль — тоже результат */
    if (item && typeof item.x === 'number') {
      lines.push('Результат на момент сохранения: X = ' + c.fmt(item.x));
    }
    lines.push('Угол: ' + c.angleName(item && item.angle ? item.angle : c.getAngle()));
    lines.push('');
    lines.push('Адрес  Код  Команда');
    var hex = [], dec = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      lines.push(pad(r.addrText, 5) + pad(String(r.dec), 5) + r.name);
      hex.push(r.hex);
      dec.push(String(r.dec));
    }
    if (!rows.length) lines.push('(память программ пуста)');
    lines.push('');
    lines.push('Коды (hex): ' + hex.join(' '));
    lines.push('Коды (dec): ' + dec.join(' '));
    lines.push('');
    lines.push('Регистры при сохранении:');
    var rl = [];
    for (var j = 0; j < c.REG_COUNT; j++) rl.push('R' + c.REG_NAMES[j] + '=' + c.fmt(c.ST.R[j]));
    lines.push('  ' + rl.join('  '));
    return lines.join('\n');
  }

  function pad(s, n) {
    s = String(s);
    while (s.length < n) s += ' ';
    return s;
  }

  /* ---------- разбор при импорте ---------- */
  function addrToIndex(txt, c) {
    var t = String(txt).trim();
    if (t.charAt(0) === '-') return c.ADDR_FIRST + parseInt(t.charAt(1), 10);
    return parseInt(t, 10);
  }

  function fromText(text, c) {
    var prog = new Array(c.PROG_LEN).fill(c.NOP);
    var regs = null;
    var xval;
    var name = null;
    var lines = String(text).split(/\r?\n/);
    var i, m;

    for (i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (!name && /^МК-61\s*·/.test(line)) {
        name = line.replace(/^МК-61\s*·\s*/, '').trim();
      }

      /* результат на момент сохранения — только X, остальное в снимке */
      m = line.match(/^Результат на момент сохранения:\s*X\s*=\s*(.+)$/i);
      if (m) {
        var xv = numFromText(m[1]);
        if (isFinite(xv)) xval = xv;
        continue;
      }

      /* строка со всеми кодами в hex */
      m = line.match(/^Коды\s*\(hex\)\s*:\s*(.+)$/i);
      if (m) {
        var toks = m[1].trim().split(/\s+/);
        for (var k = 0; k < toks.length && k < prog.length; k++) {
          var v = parseInt(toks[k], 16);
          if (isFinite(v)) prog[k] = v & 255;
        }
        continue;
      }

      /* строка со всеми кодами в десятичном виде */
      m = line.match(/^Коды\s*\(dec\)\s*:\s*(.+)$/i);
      if (m && !prog.some(function (x) { return x !== c.NOP; })) {
        var dt = m[1].trim().split(/\s+/);
        for (var q = 0; q < dt.length && q < prog.length; q++) {
          var dv = parseInt(dt[q], 10);
          if (isFinite(dv)) prog[q] = dv & 255;
        }
        continue;
      }

      /* обычная строка листинга: адрес, код, подпись */
      m = line.match(/^\s*(-?\d{1,3})\s+(\d{1,3})\s+\S/);
      if (m) {
        var at = addrToIndex(m[1], c);
        var cv = parseInt(m[2], 10);
        if (isFinite(at) && at >= 0 && at < prog.length && isFinite(cv)) prog[at] = cv & 255;
        continue;
      }

      /* строки регистров: R0=7  R1=0  …  и «R0 = 7» тоже */
      m = line.match(/R(\w)\s*=\s*([^\sR]+(?:\s*[-+]?\d{1,2})?)/g);
      if (m) {
        regs = regs || {};
        for (var z = 0; z < m.length; z++) {
          var rm = m[z].match(/^R(\w)\s*=\s*(.+)$/);
          if (!rm) continue;
          var idx = c.REG_NAMES.indexOf(rm[1]);
          var num = numFromText(rm[2]);
          if (idx >= 0 && isFinite(num)) regs[idx] = num;
        }
      }
    }

    if (!prog.some(function (x) { return x !== c.NOP; })) return null;
    return { name: name || 'Импорт ' + stamp(), prog: prog, regs: regs, x: xval };
  }

  /* ---------- действия ---------- */
  function snapshotCurrent(name) {
    var c = core();
    if (!c) return null;
    return {
      id: 'p' + Date.now(),
      name: name || ('Программа ' + stamp()),
      prog: c.getProgram(),
      regs: c.ST.R.slice(0),
      x: c.ST.X,
      angle: c.getAngle(),
      savedAt: Date.now()
    };
  }

  function applyItem(item) {
    var c = core();
    if (!c || !item) return false;
    c.setProgram(item.prog, true);
    if (Array.isArray(item.regs)) {
      for (var i = 0; i < c.REG_COUNT; i++) {
        c.setRegister(i, typeof item.regs[i] === 'number' ? item.regs[i] : 0);
      }
    }
    if (typeof item.x === 'number') c.setX(item.x);
    if (item.angle) c.setAngle(item.angle);
    c.ST.ip = 0;
    c.ST.sub = [];
    c.ST.mode = 'AUT';
    c.ST.run = false;
    c.ST.err = false;
    c.changed();
    c.hint('Загружено: ' + item.name + ' (' + (item.prog ? item.prog.length : 0) + ' шагов, регистры восстановлены)');
    return true;
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 800);
  }

  function safeName(s) {
    return String(s || 'program').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
  }

  /* ---------- разметка ---------- */
  var CSS = ''
    + '.libbar{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin:12px 4px 0}'
    + '.libbar button{appearance:none;border:1px solid rgba(255,255,255,.1);border-radius:8px;'
    + 'background:rgba(0,0,0,.22);color:#cfd6e0;font-size:11px;font-weight:600;padding:9px 4px;cursor:pointer}'
    + '.libbar button:active{background:rgba(232,182,76,.18);border-color:#e8b64c}'
    + '.libov{position:fixed;inset:0;background:rgba(8,10,14,.78);display:none;'
    + 'align-items:flex-start;justify-content:center;padding:16px;z-index:50;overflow:auto}'
    + '.libov.on{display:flex}'
    + '.libbox{width:100%;max-width:430px;background:#22262d;border:1px solid rgba(255,255,255,.1);'
    + 'border-radius:14px;padding:12px;color:#e8eaee;font-family:-apple-system,Roboto,sans-serif}'
    + '.libhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}'
    + '.libhead b{font-size:13px;letter-spacing:.06em;color:#f0e2bd}'
    + '.libhead button{appearance:none;border:0;background:transparent;color:#9aa1ad;font-size:20px;cursor:pointer}'
    + '.libitem{border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 9px;margin-bottom:7px;'
    + 'background:rgba(0,0,0,.2)}'
    + '.libitem .t{font-size:12px;font-weight:600;margin-bottom:2px}'
    + '.libitem .s{font-size:10px;color:#9aa1ad;margin-bottom:6px}'
    + '.libitem .a{display:flex;gap:5px;flex-wrap:wrap}'
    + '.libitem .a button{appearance:none;border:1px solid rgba(255,255,255,.12);border-radius:7px;'
    + 'background:rgba(255,255,255,.05);color:#dfe4ec;font-size:11px;padding:5px 9px;cursor:pointer}'
    + '.libitem .a button.go{border-color:#e8b64c;color:#f0d79b}'
    + '.libitem .a button.del{color:#e08a8a}'
    + '.liblist{max-height:52vh;overflow:auto}'
    + '.lrow{display:grid;grid-template-columns:38px 44px 1fr;gap:6px;width:100%;text-align:left;'
    + 'appearance:none;border:0;border-bottom:1px solid rgba(255,255,255,.05);background:transparent;'
    + 'color:#dfe4ec;font-family:ui-monospace,Menlo,monospace;font-size:11px;padding:4px 2px;cursor:pointer}'
    + '.lrow:active{background:rgba(232,182,76,.14)}'
    + '.libnote{font-family:ui-monospace,monospace;font-size:11px;color:#f0d79b;min-height:16px;margin:8px 2px 2px}'
    + '.libempty{font-size:11px;color:#9aa1ad;padding:10px 2px}';

  function style() {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return d.firstElementChild;
  }

  /* ---------- панель ---------- */
  function buildBar() {
    var host = document.querySelector('.case');
    if (!host) return null;
    var bar = el('<div class="libbar">'
      + '<button data-act="save">💾 Сохранить</button>'
      + '<button data-act="open">📂 Библиотека</button>'
      + '<button data-act="txt">⇩ В TXT</button>'
      + '<button data-act="json">⇩ В JSON</button>'
      + '<button data-act="load" style="grid-column:1/-1">⇧ Загрузить файл (TXT или JSON)</button>'
      + '</div>');
    var foot = host.querySelector('.foot');
    if (foot) host.insertBefore(bar, foot);
    else host.appendChild(bar);

    var file = document.createElement('input');
    file.type = 'file';
    file.accept = '.txt,.json,text/plain,application/json';
    file.style.display = 'none';
    document.body.appendChild(file);

    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var c = core();
      if (!c) return;
      var act = b.dataset.act;

      if (act === 'save') {
        var name = prompt('Название программы', 'Программа ' + stamp());
        if (name === null) return;
        var item = snapshotCurrent(name.trim() || undefined);
        if (!item) return;
        var list = loadAll();
        for (var i = 0; i < list.length; i++) {
          if (list[i].name === item.name) { item.id = list[i].id; list.splice(i, 1); break; }
        }
        list.unshift(item);
        saveAll(list);
        c.hint('Сохранено в библиотеку: ' + item.name);
      }

      if (act === 'open') openLib();

      if (act === 'txt') {
        var t = toText(c, { name: 'Текущая программа', savedAt: Date.now(), x: c.ST.X });
        download(safeName('mk61-program') + '.txt', t);
      }

      if (act === 'json') {
        download(safeName('mk61-program') + '.json', JSON.stringify(snapshotCurrent('Экспорт ' + stamp()), null, 1),
                 'application/json');
      }

      if (act === 'load') file.click();
    });

    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var c = core();
        if (!c) return;
        var text = String(rd.result);
        var item = null;
        if (/\.json$/i.test(f.name)) {
          try {
            var obj = JSON.parse(text);
            if (obj && Array.isArray(obj.prog)) {
              item = { name: obj.name || f.name.replace(/\.json$/i, ''), prog: obj.prog, regs: obj.regs, x: obj.x, angle: obj.angle };
            }
          } catch (e) { item = null; }
        } else {
          item = fromText(text, c);
        }
        if (!item) { c.hint('Не удалось разобрать файл: коды не найдены'); return; }
        applyItem(item);
      };
      rd.readAsText(f);
      file.value = '';
    });

    return bar;
  }

  /* ---------- окно библиотеки ---------- */
  var ov = null;

  function openLib() {
    if (!ov) {
      ov = el('<div class="libov"><div class="libbox">'
        + '<div class="libhead"><b>Библиотека программ</b><button data-x="1">×</button></div>'
        + '<div class="liblist" id="liblist"></div>'
        + '<div class="libnote" id="libnote"></div>'
        + '</div></div>');
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) {
        if (e.target === ov || e.target.dataset.x) { ov.classList.remove('on'); return; }
        var go = e.target.closest('[data-go]');
        if (go) {
          var list = loadAll();
          var it = list.filter(function (x) { return x.id === go.dataset.go; })[0];
          if (it) { applyItem(it); ov.classList.remove('on'); }
          return;
        }
        var del = e.target.closest('[data-del]');
        if (del) {
          var rest = loadAll().filter(function (x) { return x.id !== del.dataset.del; });
          saveAll(rest);
          renderLib();
          return;
        }
        var t = e.target.closest('[data-txt]');
        if (t) {
          var l2 = loadAll();
          var it2 = l2.filter(function (x) { return x.id === t.dataset.txt; })[0];
          if (it2) {
            var c = core();
            if (!c) return;
            /* временно подставляем программу, чтобы снять регистры именно её */
            var keep = c.snapshot();
            c.setProgram(it2.prog, true);
            if (Array.isArray(it2.regs)) for (var i = 0; i < c.REG_COUNT; i++) c.setRegister(i, it2.regs[i] || 0);
            var text = toText(c, it2);
            c.restore(keep);
            download(safeName(it2.name) + '.txt', text);
          }
          return;
        }
        var row = e.target.closest('.lrow');
        if (row) {
          var c2 = core();
          var code = +row.dataset.c;
          if (c2) document.getElementById('libnote').textContent =
            row.dataset.addr + ' · код ' + code + ' (0x' + MK.hex2(code) + ') — ' + c2.cmdName(code);
        }
      });
    }
    renderLib();
    ov.classList.add('on');
  }

  function renderLib() {
    var host = document.getElementById('liblist');
    if (!host) return;
    var c = core();
    var list = loadAll();
    if (!list.length) {
      host.innerHTML = '<div class="libempty">Пока пусто. Набери программу и нажми «💾 Сохранить».</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var steps = 0;
      if (Array.isArray(it.prog) && c) {
        for (var k = 0; k < it.prog.length; k++) if (it.prog[k] !== c.NOP) steps++;
      }
      html += '<div class="libitem">'
        + '<div class="t">' + escapeHtml(it.name) + '</div>'
        + '<div class="s">' + stamp(it.savedAt) + ' · шагов: ' + steps + '</div>'
        + '<div class="a">'
        + '<button class="go" data-go="' + it.id + '">▶ Загрузить</button>'
        + '<button data-txt="' + it.id + '">⇩ TXT</button>'
        + '<button class="del" data-del="' + it.id + '">Удалить</button>'
        + '</div></div>';
    }
    host.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- запуск ---------- */
  function boot() {
    style();
    buildBar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.PMK61Lib = {
    version: 2,
    toText: toText,
    fromText: fromText,
    applyItem: applyItem,
    snapshotCurrent: snapshotCurrent,
    inputRegisters: inputRegisters,
    listingRows: listingRows,
    loadAll: loadAll,
    numFromText: numFromText
  };
})(typeof window !== 'undefined' ? window : this);
