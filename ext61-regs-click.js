/* =========================================================
   pmk61 / ext61-regs-click.js
   Регистры на вкладке «Регистры»: просмотр одним касанием,
   запись — двойным.

   Зачем двойное: раньше запись шла по обычному клику и срабатывала
   всегда, даже когда в X лежит 0. Одно случайное касание затирало
   регистр, а если там был аргумент или счётчик цикла — программа
   считала не то. Теперь:
     • одно касание  — только показать значение (ничего не пишет);
     • двойное        — записать текущий X в этот регистр.

   Правила:
     • режим выбора (после x→П / П→X) не перехватываем —
       там работает родной обработчик ui.js;
     • никаких постоянных текстов в интерфейс не добавляем:
       правило «двойное касание пишет X» живёт в документации;
       одно касание лишь пишет строку в штатную подсказку внизу;
     • ui.js не трогаем: работаем через MutationObserver
       на #tabRegs, ячейки пересоздаются при каждой отрисовке.
   ========================================================= */
(function () {
  'use strict';

  var MK = window.MKCore || {};
  var box = document.getElementById('tabRegs');
  if (!box) return;

  var DOUBLE_MS = 500;
  var lastIdx = -1;
  var lastAt = 0;

  function core() {
    return (window.MKUI && window.MKUI.getCore) ? window.MKUI.getCore() : null;
  }

  function hint(text) {
    if (window.MKUI && window.MKUI.hint) window.MKUI.hint(text);
  }

  function isPicking() {
    return document.body.classList.contains('picking');
  }

  function nameToIdx(name) {
    var names = MK.REG_NAMES || [];
    var n = String(name || '').trim().toLowerCase();
    for (var i = 0; i < names.length; i++) {
      if (String(names[i]).toLowerCase() === n) return i;
    }
    return -1;
  }

  function regName(idx) {
    var names = MK.REG_NAMES || [];
    return names[idx] !== undefined ? names[idx] : String(idx);
  }

  function regValue(c, idx) {
    var arr = (c && c.ST && c.ST.R) ? c.ST.R : [];
    var v = arr[idx];
    return (c && c.fmt) ? c.fmt(v) : v;
  }

  function writeReg(c, idx) {
    /* штатный путь: x→П, затем выбор регистра — те же вызовы, что у ui.js */
    c.key({ t: 'x→П', a: 'stox' });
    c.key({ a: 'reg', r: idx, mode: 'sto' });
  }

  function bind() {
    var cells = box.querySelectorAll('.reg');
    Array.prototype.forEach.call(cells, function (cell) {
      if (cell.dataset.clickBound === '1') return;
      cell.dataset.clickBound = '1';
      cell.style.cursor = 'pointer';
      cell.style.touchAction = 'manipulation';

      cell.addEventListener('click', function (ev) {
        /* идёт выбор регистра — не мешаем родному обработчику */
        if (isPicking()) return;

        var c = core();
        if (!c || !c.key) return;

        var letter = cell.querySelector('b');
        var idx = nameToIdx(letter ? letter.textContent : '');
        if (idx < 0) return;

        ev.preventDefault();

        var now = Date.now();
        var second = (idx === lastIdx) && (now - lastAt < DOUBLE_MS);

        if (second) {
          /* второе касание подряд — запись */
          lastIdx = -1;
          lastAt = 0;
          writeReg(c, idx);
          hint('Записано: Р' + regName(idx) + ' = ' + regValue(c, idx));
        } else {
          /* первое касание — только посмотреть */
          lastIdx = idx;
          lastAt = now;
          hint('Р' + regName(idx) + ' = ' + regValue(c, idx) +
               ' · коснись ещё раз, чтобы записать X');
        }
      });
    });
  }

  var obs = new MutationObserver(function () { bind(); });
  obs.observe(box, { childList: true });

  /* подстраховка: после переключения вкладок и смены модели */
  document.addEventListener('click', function () { setTimeout(bind, 0); }, true);
  window.addEventListener('mk-model-change', function () { setTimeout(bind, 0); });

  bind();
})();
