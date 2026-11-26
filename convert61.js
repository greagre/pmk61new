/* =========================================================
   pmk61 / convert61.js — конвертер каталога программ (ревизия 1)

   Зачем: файлы каталога (programs/mk61/*.json в репозитории
   mk-emulator, а также выгрузки MKPro) хранят программу как массив
   ОБЪЕКТОВ {addr, hex, cmd, note}, а библиотека pmk61 ждёт массив
   ЧИСЕЛ. Штатная кнопка «Загрузить файл» такие файлы не берёт.

   Что делает:
   - добавляет в панель библиотеки кнопку «⇧ Каталог .json»;
   - принимает файл (или несколько) и ссылку raw.githubusercontent.com;
   - переводит элементы в коды 0..255;
   - при "??" (неопознанная команда) НЕ подставляет 0 и НЕ грузит
     такую программу молча — показывает адреса и блокирует загрузку;
   - готовую программу отдаёт в PMK61Lib.applyItem (регистры и X тоже).

   Ядро (core.js), слой ввода (core-keys.js) и library.js не трогаются.
   Подключение: после library.js.
   ========================================================= */
(function (global) {
  'use strict';

  var LIB = global.PMK61Lib;
  if (!LIB) return;                       /* без библиотеки смысла нет */
  if (global.PMK61Convert) return;        /* дважды не подключаемся */

  function core() { return global.PMK61_CORE || null; }

  /* ---------- перевод одной ячейки в код ---------- */
  function hexToCode(x) {
    if (typeof x === 'number') {
      if (!isFinite(x)) return null;
      return (x >= 0 && x <= 255) ? (x | 0) : null;
    }
    if (typeof x === 'string') {
      var t = x.trim();
      if (!t || t === '??' || t === '?' || t === '--') return null;
      if (/^0x[0-9a-f]{1,2}$/i.test(t)) return parseInt(t, 16) & 255;
      if (/^[0-9a-f]{1,2}$/i.test(t)) return parseInt(t, 16) & 255;
      return null;
    }
    if (x && typeof x === 'object') {
      if (typeof x.dec === 'number' && isFinite(x.dec)) return x.dec & 255;
      if (x.hex != null) return hexToCode(x.hex);
      if (x.code != null) return hexToCode(x.code);
    }
    return null;
  }

  /* ---------- массив ячеек -> плоский массив кодов ----------
     Возвращает { codes, missing, partial }.
     missing — адреса, где команда не опознана. codes в этих местах
     содержат NOP, но partial = true, и грузить такую программу
     по умолчанию нельзя: лучше дырка, чем тихо неверная команда. */
  function programCodes(arr, nop) {
    var codes = [], missing = [], i, el, code, addr;
    for (i = 0; i < arr.length; i++) {
      el = arr[i];
      addr = i;
      if (el && typeof el === 'object' && typeof el.addr === 'number') addr = el.addr;
      code = hexToCode(el);
      if (code === null) {
        missing.push(addr);
        codes.push(nop);
      } else {
        codes.push(code);
      }
    }
    return { codes: codes, missing: missing, partial: missing.length > 0 };
  }

  /* ---------- разбор файла ----------
     Понимает:
     1) { format:"programs", programs:[{name, prog, data, regs, ...}] }
     2) { name, prog:[...], regs, model, status }
     3) просто массив [...]
     prog — массив объектов {addr,hex,cmd,note}, массив чисел или hex-строк. */
  function programsFrom(obj, fname) {
    var out = [], i, p;

    function push(item, idx) {
      var arr = item.prog;
      if (!Array.isArray(arr) || !arr.length) return;
      out.push({
        name: item.name || (fname + (idx != null ? ' #' + (idx + 1) : '')),
        raw: arr,
        regs: item.regs,
        data: item.data,
        model: item.model || obj.model,
        status: item.status || obj.status
      });
    }

    if (Array.isArray(obj)) {
      push({ name: fname, prog: obj }, null);
      return out;
    }
    if (obj && obj.format === 'programs' && Array.isArray(obj.programs)) {
      for (i = 0; i < obj.programs.length; i++) push(obj.programs[i], i);
      return out;
    }
    if (obj && Array.isArray(obj.prog)) {
      push(obj, null);
      return out;
    }
    return out;
  }

  /* ---------- разметка окна ---------- */
  var CSS = ''
    + '.cvlist{max-height:46vh;overflow:auto;margin-top:8px}'
    + '.cvitem{border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 9px;margin-bottom:7px;background:rgba(0,0,0,.2)}'
    + '.cvitem .t{font-size:12px;font-weight:600;margin-bottom:2px}'
    + '.cvitem .s{font-size:10px;color:#9aa1ad;margin-bottom:6px;line-height:1.5}'
    + '.cvitem .s.bad{color:#e08a8a}'
    + '.cvitem .a{display:flex;gap:5px;flex-wrap:wrap}'
    + '.cvitem .a button{appearance:none;border:1px solid rgba(255,255,255,.12);border-radius:7px;'
    + 'background:rgba(255,255,255,.05);color:#dfe4ec;font-size:11px;padding:5px 9px;cursor:pointer}'
    + '.cvitem .a button.go{border-color:#e8b64c;color:#f0d79b}'
    + '.cvitem .a button[disabled]{opacity:.45;cursor:default}'
    + '.cvrow{display:flex;gap:6px;margin-top:8px}'
    + '.cvrow input{flex:1;min-width:0;appearance:none;border:1px solid rgba(255,255,255,.12);'
    + 'border-radius:7px;background:rgba(0,0,0,.28);color:#dfe4ec;font-size:11px;padding:7px 8px}'
    + '.cvrow button{appearance:none;border:1px solid rgba(232,182,76,.5);border-radius:7px;'
    + 'background:rgba(232,182,76,.14);color:#f0d79b;font-size:11px;font-weight:600;padding:7px 10px;cursor:pointer}'
    + '.cvbtn{grid-column:1/-1}';

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

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- состояние окна ---------- */
  var ov = null;
  var items = [];             /* [{name, codes, missing, partial, model, regs, data}] */

  function render() {
    var host = ov && ov.querySelector('#cvlist');
    if (!host) return;
    if (!items.length) {
      host.innerHTML = '<div class="libempty">Файл не выбран. Нажми «Выбрать .json» или вставь ссылку.</div>';
      return;
    }
    var html = '', i, it, c;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      c = core();
      var steps = 0;
      for (var k = 0; k < it.codes.length; k++) if (!c || it.codes[k] !== c.NOP) steps++;
      html += '<div class="cvitem">'
        + '<div class="t">' + escapeHtml(it.name) + '</div>'
        + '<div class="s' + (it.partial ? ' bad' : '') + '">'
        + 'шагов: ' + steps
        + (it.model ? ' · модель: ' + escapeHtml(it.model) : '')
        + (it.partial
            ? ' · <b>не опознано: ' + it.missing.length + '</b> (адреса ' + it.missing.slice(0, 12).join(', ')
              + (it.missing.length > 12 ? '…' : '') + ')'
            : ' · все ячейки опознаны')
        + '</div>'
        + '<div class="a">'
        + '<button class="go" data-i="' + i + '"' + (it.partial ? ' disabled' : '') + '>▶ Загрузить в МК-61</button>'
        + '</div></div>';
    }
    host.innerHTML = html;
  }

  function addFileText(text, fname) {
    var obj;
    try { obj = JSON.parse(text); }
    catch (e) { return false; }
    var list = programsFrom(obj, fname);
    if (!list.length) return false;
    var c = core();
    var nop = c ? c.NOP : 0x54;
    var taken = 0;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var res = programCodes(p.raw, nop);
      items.push({
        name: p.name,
        codes: res.codes,
        missing: res.missing,
        partial: res.partial,
        model: p.model,
        regs: p.regs,
        data: p.data
      });
      taken++;
    }
    return taken;
  }

  /* ---------- окно ---------- */
  function openWin() {
    if (!ov) {
      ov = el('<div class="libov on"><div class="libbox">'
        + '<div class="libhead"><b>Каталог .json → МК-61</b><button data-x="1">×</button></div>'
        + '<div class="cvrow">'
        + '<input id="cvurl" placeholder="https://raw.githubusercontent.com/…/nim.json">'
        + '<button data-act="url">↙ Взять</button>'
        + '</div>'
        + '<div class="cvrow"><button data-act="pick" style="flex:1">📂 Выбрать .json</button></div>'
        + '<div class="cvlist" id="cvlist"></div>'
        + '<div class="libnote" id="cvnote"></div>'
        + '</div></div>');
      document.body.appendChild(ov);

      var file = document.createElement('input');
      file.type = 'file';
      file.accept = '.json,application/json';
      file.multiple = true;
      file.style.display = 'none';
      document.body.appendChild(file);

      ov.addEventListener('click', function (e) {
        if (e.target === ov || e.target.dataset.x) { ov.classList.remove('on'); return; }

        var act = e.target.dataset.act;
        if (act === 'pick') { file.click(); return; }

        if (act === 'url') {
          var u = ov.querySelector('#cvurl').value.trim();
          if (!u) { note('Вставь ссылку на .json'); return; }
          if (!/^https?:\/\//i.test(u)) { note('Ссылка должна начинаться с http:// или https://'); return; }
          note('Читаю…');
          fetch(u, { cache: 'no-store' }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
          }).then(function (txt) {
            var fname = u.split('/').pop().split('?')[0] || 'по ссылке';
            var n = addFileText(txt, fname);
            if (!n) { note('В файле не нашлось ни одной программы'); return; }
            note('Добавлено программ: ' + n);
            render();
          }).catch(function (err) {
            note('Не удалось прочитать: ' + (err && err.message ? err.message : 'ошибка сети'));
          });
          return;
        }

        var go = e.target.closest('[data-i]');
        if (go && !go.disabled) {
          var it = items[+go.dataset.i];
          if (!it) return;
          if (it.partial) { note('Есть неопознанные команды — загрузка заблокирована'); return; }
          var ok = LIB.applyItem({
            name: it.name,
            prog: it.codes.slice(0),
            regs: it.regs,
            x: null,
            angle: null
          });
          if (ok) {
            ov.classList.remove('on');
            note('');
            items = [];
          } else {
            note('Библиотека не приняла программу');
          }
          return;
        }
      });

      file.addEventListener('change', function () {
        var fl = file.files;
        if (!fl || !fl.length) return;
        var left = fl.length, okCount = 0, badCount = 0;
        note('Читаю файлов: ' + fl.length);
        function done() {
          if (--left > 0) return;
          note('Добавлено программ: ' + okCount + (badCount ? ' · не разобрано файлов: ' + badCount : ''));
          render();
        }
        for (var i = 0; i < fl.length; i++) {
          (function (f) {
            var rd = new FileReader();
            rd.onload = function () {
              var n = addFileText(String(rd.result), f.name.replace(/\.json$/i, ''));
              if (n) okCount += n; else badCount++;
              done();
            };
            rd.onerror = function () { badCount++; done(); };
            rd.readAsText(f);
          })(fl[i]);
        }
        file.value = '';
      });
    } else {
      ov.classList.add('on');
    }
    render();
  }

  function note(t) {
    var n = ov && ov.querySelector('#cvnote');
    if (n) n.textContent = t || '';
  }

  /* ---------- кнопка в панели библиотеки ---------- */
  function addButton() {
    var bar = document.querySelector('.libbar');
    if (!bar || bar.querySelector('[data-cv]')) return false;
    var b = el('<button data-cv="1" class="cvbtn">⇧ Каталог .json</button>');
    var load = bar.querySelector('[data-act="load"]');
    if (load && load.parentNode) load.parentNode.insertBefore(b, load.nextSibling);
    else bar.appendChild(b);
    b.addEventListener('click', function () { items = []; openWin(); });
    return true;
  }

  function boot() {
    style();
    if (!addButton()) {
      /* панель библиотеки строится позже — пробуем ещё раз */
      setTimeout(addButton, 60);
      setTimeout(addButton, 250);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.PMK61Convert = {
    version: 1,
    hexToCode: hexToCode,
    programCodes: programCodes,
    programsFrom: programsFrom
  };
})(typeof window !== 'undefined' ? window : this);
