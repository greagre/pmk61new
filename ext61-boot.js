/* =========================================================
   pmk61 / ext61-boot.js  (v=10)
   Включение расширения БЕЗ правки ui.js — через выбор модели.

   ЧТО БЫЛО СЛОМАНО (v1)

   Первая версия подменяла MKCore.create для ВСЕХ моделей и возвращала
   не ядро, а объект расширения (обёртку). ui.js в setModel() делает
       core = window.MKCore.create({ onEvent: onEvent });
   и дальше зовёт core.fmt(), core.ST, core.key(). У обёртки этого нет,
   поэтому render() падал на первой строке: клавиатура (#keys) и
   служебные кнопки (#service) не строились вовсе.

   ЧТО ТЕПЕРЬ

   1. Расширение — это модель в списке: «МК-61 (расширенный)».
      Обычный МК-61 работает ровно как раньше, без расширения.
   2. Подмена срабатывает, только если в <select id="model"> выбран
      mk-61-ext. ui.js выставляет значение до создания ядра, поэтому
      к моменту вызова create() выбор уже известен.
   3. Наружу отдаётся НАСТОЯЩЕЕ ядро (ext.core), а объект расширения
      приклеивается к нему как core.ext.
   4. Клавиша F0 (действие ext0 из слоя f) перехватывается здесь же.
      Кнопка F0 живёт только во втором слое, где цифр нет, поэтому
      после неё панель ПРИНУДИТЕЛЬНО возвращается на слой main —
      иначе вторую цифру просто негде нажать (это и было главной
      жалобой: «F0 не на цифровой панели»).
   5. После ввода обеих цифр слой тоже остаётся main: можно сразу
      набирать следующую команду, ничего не переключая.
   6. Ссылка может сразу открыть нужную модель: index.html?model=mk-61-ext.
      Это нужно тестам и закладкам — иначе после проверки расширения
      эмулятор открывается обычным МК-61 и выбор приходится делать руками.

   КАК НАБИРАЕТСЯ КОМАНДА

       ПРГ → f → F0 → 4 → 0      =  F0 40  (x→П в банк-адресат)
       ПРГ → f → F0 → 0 → 4      =  F0 04  (номер банка → X)

   После нажатия F0 панель сама становится цифровой, поэтому
   последовательность «f, F0, 4, 0» выполняется без ручного
   переключения слоя.

   Второй байт двухзначный: первая цифра — старшая, вторая — младшая.
   Кнопок для A…F в раскладке нет, поэтому набираются только байты,
   состоящие из обычных цифр: 00…06, 10, 11, 20…24, 40…49 и 60…69;
   регистры R a…R e пока вводятся только через панель «Записать».

   ПОРЯДОК ПОДКЛЮЧЕНИЯ ВАЖЕН

       profiles-ui.js → ext61-boot.js → ui.js
   Тогда baseCreate — это фабрика с параметрами МК-61 (105 шагов,
   15 регистров, адреса выше 99), и расширенное ядро получает их тоже.

   Если ext61.js не загрузился или MKExt61 недоступен, файл молча
   ничего не делает: эмулятор остаётся обычным МК-61.
   ========================================================= */
(function (global) {
  'use strict';

  var C = global.MKCore;
  var E = global.MKExt61;
  if (!C || !E) return;
  if (typeof C.create !== 'function' || typeof E.create !== 'function') return;

  var EXT_MODEL = 'mk-61-ext';
  var baseCreate = C.create;
  var inside = false;

  function extSelected() {
    var sel = document.getElementById('model');
    return !!(sel && sel.value === EXT_MODEL);
  }

  /* Режим программы. Ядро хранит признак в ST; имя поля может быть
     prg (boolean) или mode (строка) — поддерживаем оба, чтобы файл
     не зависел от версии core.js. */
  function inPrg(core) {
    var ST = (core && core.ST) || {};
    if (typeof ST.prg === 'boolean') return ST.prg;
    if (typeof ST.mode === 'string') {
      var m = String(ST.mode).toUpperCase();
      return m === 'PRG' || m.indexOf('ПРГ') >= 0;
    }
    return true;
  }

  function note(core, text) {
    if (core && typeof core.hint === 'function') core.hint(text);
  }

  function hex2(n) {
    var s = (n & 0xFF).toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }

  /* Вернуть цифровую панель и заставить интерфейс её перерисовать.
     ui.js подписан на changed(), поэтому клавиши обновляются сами. */
  function backToDigits(core) {
    if (!core || !core.ST) return;
    core.ST.layer = 'main';
    if (typeof core.changed === 'function') {
      try { core.changed(); } catch (err) { /* перерисовка не критична */ }
    }
  }

  /* ---------- ввод F0 с клавиатуры ---------- */

  function attachInput(core, ext) {
    var origKey = core.key;
    var wait = false;
    var digits = '';

    core.key = function (k) {
      /* нажата кнопка F0 в слое f */
      if (k && k.a === 'ext0') {
        if (!inPrg(core)) {
          note(core, 'F0 — команда программы: сначала включите режим ПРГ');
          return;
        }
        wait = true;
        digits = '';
        /* ГЛАВНОЕ: уходим из слоя f на цифры, иначе вторую цифру
           нажать негде — в слое f на месте цифр другие функции */
        backToDigits(core);
        note(core, 'F0: введите второй байт — две цифры (04, 10, 21, 40, 63 …)');
        return;
      }

      if (wait) {
        if (k && k.a === 'digit') {
          digits += String(k.d).toLowerCase();
          if (digits.length < 2) {
            backToDigits(core);
            note(core, 'F0 ' + digits.toUpperCase() + '_ — введите вторую цифру');
            return;
          }
          var b = parseInt(digits, 16);
          wait = false;
          digits = '';
          backToDigits(core);
          if (isNaN(b)) {
            note(core, 'F0: второй байт не распознан');
            return;
          }
          if (!E.isExt(b)) {
            note(core, 'F0 ' + hex2(b) + ' — такой EXT-команды нет');
            return;
          }
          if (ext.writeExt(b)) {
            note(core, 'Записано F0 ' + hex2(b) + ' — ' + E.extName(b));
          }
          return;
        }
        /* любая другая клавиша отменяет ожидание и работает как обычно */
        wait = false;
        digits = '';
      }

      return origKey.call(core, k);
    };
  }

  /* ---------- фабрика ---------- */

  C.create = function (opts) {
    /* вызов изнутри ext61.js — уходим в базовую фабрику без обёртки,
       иначе получится рекурсия и переполнение стека */
    if (inside) return baseCreate.call(C, opts);
    if (!extSelected()) return baseCreate.call(C, opts);

    inside = true;
    var ext = null;
    try {
      ext = E.create(opts || {});
    } catch (err) {
      ext = null;
    } finally {
      inside = false;
    }

    var core = (ext && ext.core) ? ext.core : null;
    if (!core) return baseCreate.call(C, opts);

    /* Ядро остаётся ядром: fmt, key, step, ST — всё на месте.
       Расширение живёт рядом, отдельным объектом. */
    core.ext = ext;
    core.writeExt = function (second) { return ext.writeExt(second); };
    core.extBank = function () { return ext.bank ? ext.bank() : 0; };
    core.extPage = function () { return ext.page ? ext.page() : 0; };
    core.extBackToDigits = function () { return backToDigits(core); };

    attachInput(core, ext);

    return core;
  };

  /* ---------- модель из адресной строки ---------- */

  /* ?model=mk-61-ext открывает расширенную модель сразу.
     Дожидаемся окончания загрузки: список моделей строит ui.js,
     а он подключается ПОСЛЕ этого файла. */
  function applyUrlModel() {
    try {
      var m = null;
      var mm = /[?&]model=([^&]+)/.exec(String(global.location.search || ''));
      if (mm) m = decodeURIComponent(mm[1]);
      if (!m) return;

      var sel = document.getElementById('model');
      if (!sel || !sel.options) return;
      if (sel.value === m) return;

      var has = false;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === m) { has = true; break; }
      }
      if (!has) return;

      sel.value = m;
      var ev = null;
      try {
        ev = new Event('change', { bubbles: true });
      } catch (err) {
        ev = document.createEvent('Event');
        ev.initEvent('change', true, true);
      }
      sel.dispatchEvent(ev);
    } catch (err) { /* ссылка без параметра — обычное поведение */ }
  }

  function scheduleUrlModel() {
    global.setTimeout(applyUrlModel, 0);
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', scheduleUrlModel);
    } else {
      scheduleUrlModel();
    }
  }
})(typeof window !== 'undefined' ? window : this);
