/* =========================================================
   pmk61 / core-keys.js — слой ввода (ревизия 4)

   Зачем отдельный файл:
   правила нажатий — это не вычисления. Раньше они лежали внутри
   core.js, и любая правка ввода требовала трогать файл на тысячу
   строк. Теперь ввод живёт здесь, а ядро только считает.

   Что делает этот слой:
   - набор числа: цифры, точка, ВП, смена знака, Cx, В↑, Вx;
   - режим ПРГ: запись кодов, ввод адреса перехода двумя цифрами;
   - регистры: X→П, П→x и косвенные виды с выбором регистра;
   - слои F и K;
   - служебные: С/П, ПП, БП, В/О, ПРГ, АВТ, CF;
   - полный сброс resetAll() — стек, регистры и память программ.

   Правило ввода регистров (исправленный долг):
   после записи числа в регистр набор ЗАВЕРШАЕТСЯ. Набрали 5,
   нажали X→П, R1 — на индикаторе 5, но набор закрыт,
   и следующая цифра 7 даёт 7, а не 57. Так у настоящего ПМК.
   Показ числа при этом не меняется — сбрасывается только
   состояние набора, а не значение X.

   Ревизия 4:
   - добавлен resetAll(): гасит стек, все регистры профиля и память
     команд. Пользуется готовыми reset() и clearProgram() ядра —
     своей логики очистки здесь нет, чтобы не расходиться с ядром.
     Угол (Р-ГРД-Г) намеренно не сбрасывается: на корпусе это
     переключатель, а не часть вычислений. Сохранённые в библиотеке
     программы слой не видит и не трогает.

   Обращается к ядру только через его открытый API:
   ST, exec, step, writeStep, writeJump, changed, hint, fmt,
   MAXDIG, MAX_ADDR, PROG_LEN, REG_NAMES, ADDR_FIRST, addrShow,
   reset, clearProgram. Исключение — выбор регистра: событие
   'pick-register' умеет отправлять только само ядро, поэтому там
   вызывается исходный обработчик (keyNative).

   Подключение: после core.js и ДО скрипта, который вызывает
   MKCore.create() — слой подменяет key у создаваемых ядер.
   ========================================================= */
(function (global) {
  'use strict';

  var MK = global.MKCore;
  if (!MK || typeof MK.create !== 'function') return;

  var origCreate = MK.create;

  /* Короткая запись клавиши: {c: 0x21} равнозначно {a:'code', c:0x21}.
     Признак перехода для режима ПРГ определяем сами, чтобы интерфейсу
     не приходилось дублировать эту таблицу. */
  function normKey(k) {
    if (!k) return null;
    if (k.a === undefined && k.c === undefined) return null;
    if (k.a === undefined) k.a = 'code';
    if (k.a === 'code' && k.jump === undefined) k.jump = MK.isJumpCmd(k.c);
    return k;
  }

  function makeKey(core) {
    var ST = core.ST;
    var MAXDIG = core.MAXDIG;

    /* ---------- набор числа ---------- */
    function endTyping() {
      ST.typing = false;
      ST.input = '';
      ST.exp = false;
    }

    function shiftUp() {
      ST.T = ST.Z;
      ST.Z = ST.Y;
      ST.Y = ST.X;
    }

    function push(v) {
      var n = MK.norm(v, MAXDIG);
      shiftUp();
      ST.X = isNaN(n) ? NaN : n;
      endTyping();
    }

    function startTyping() {
      if (!ST.typing) {
        shiftUp();
        ST.input = '';
        ST.typing = true;
        ST.exp = false;
      }
      ST.err = false;
    }

    function mantissaDigits(s) {
      return String(s).split('e')[0].replace(/[^0-9]/g, '').length;
    }

    function typeDigit(d) {
      startTyping();
      if (ST.exp) {
        var parts = ST.input.split('e');
        if ((parts[1] || '').length >= 2) {
          core.hint('Порядок — только 2 цифры, как у оригинала');
          return;
        }
      } else if (mantissaDigits(ST.input) >= MAXDIG) {
        core.hint('Мантисса — ' + MAXDIG + ' цифр, как у оригинала. Дальше вводи порядок через ВП.');
        return;
      }
      ST.input += String(d);
      var v = parseFloat(ST.input);
      ST.X = isNaN(v) ? 0 : v;
    }

    function typeDot() {
      startTyping();
      if (ST.exp) return;
      if (ST.input === '') ST.input = '0';
      if (ST.input.indexOf('.') < 0) ST.input += '.';
      ST.X = parseFloat(ST.input) || 0;
    }

    function typeExp() {
      startTyping();
      if (ST.input === '') ST.input = '0';
      if (ST.input.indexOf('e') < 0) {
        ST.input += 'e';
        ST.exp = true;
      }
    }

    function negate() {
      ST.X = -ST.X;
      if (ST.typing) ST.input = String(ST.X);
    }

    /* ---------- запись в программную память ---------- */
    function writeCode(c, jump) {
      if (jump) {
        core.writeJump(c);
      } else {
        core.writeStep(c);
        core.hint('Код ' + MK.codeStr(c));
      }
      ST.layer = 'main';
      core.changed();
    }

    /* ---------- адрес перехода ---------- */
    function addrStep(k) {
      var cell = null;
      if (k.a === 'digit') cell = k.d;
      else if (k.a === 'dot') cell = 0x0A;
      if (cell === null) return;

      ST.prog[ST.ip] = cell;
      ST.ip = (ST.ip + 1) % core.PROG_LEN;
      ST.addrBuf += (cell === 0x0A ? '.' : String(cell));

      if (ST.addrBuf.length >= 2) {
        var full = ST.addrBuf.charAt(0) === '.'
          ? (core.ADDR_FIRST + parseInt(ST.addrBuf.charAt(1), 10))
          : parseInt(ST.addrBuf, 10);
        core.hint('Адрес перехода записан: ' + core.addrShow(full));
        ST.addrBuf = '';
        ST.await = null;
      } else {
        core.hint('Адрес: ' + ST.addrBuf + '_ (вторая цифра)');
      }
      core.changed();
    }

    /* ---------- полный сброс ---------- */
    /* Ядро уже умеет нужное: reset() гасит стек, регистры, адрес,
       слои и буферы, clearProgram() забивает память команд «К НОП»
       и при этом регистры не трогает. Своей очистки здесь нет
       специально — пусть правила будут в одном месте.
       Угол Р-ГРД-Г остаётся: это переключатель на корпусе. */
    function resetAll() {
      core.reset();          /* стек, R0…Rе, адрес 00, слой main */
      core.clearProgram();   /* память программ → «К НОП» */
      ST.mode = 'AUT';       /* выходим из ПРГ, как после включения */
      core.hint('Сброс: стек, регистры и память программ очищены. Сохранённые в библиотеке остались.');
      core.changed();
    }

    /* ---------- основная функция нажатия ---------- */
    function key(rawKey) {
      var k = normKey(rawKey);
      if (!k) return;

      /* ввод адреса перехода идёт раньше всех остальных правил */
      if (ST.await === 'addr') { addrStep(k); return; }

      if (k.a === 'pref-f') {
        ST.layer = (ST.layer === 'f') ? 'main' : 'f';
        core.changed();
        return;
      }
      if (k.a === 'pref-k') {
        ST.layer = (ST.layer === 'k') ? 'main' : 'k';
        core.changed();
        return;
      }

      if (k.a === 'digit') {
        if (ST.mode === 'PRG') { writeCode(k.d, false); return; }
        typeDigit(k.d);
        ST.layer = 'main';
        core.changed();
        return;
      }

      if (k.a === 'dot') {
        if (ST.mode === 'PRG') { writeCode(0x0A, false); return; }
        typeDot();
        ST.layer = 'main';
        core.changed();
        return;
      }

      if (k.a === 'code') {
        if (ST.mode === 'PRG') { writeCode(k.c, !!k.jump); return; }
        core.exec(k.c);
        /* x→П (прямая и косвенная) закрывает набор числа */
        if ((k.c & 0xF0) === 0x40 || (k.c & 0xF0) === 0xB0) endTyping();
        ST.layer = 'main';
        core.changed();
        return;
      }

      /* выбор регистра: событие 'pick-register' отправляет только ядро,
         поэтому здесь работает исходный обработчик */
      if (k.a === 'stox' || k.a === 'loadx' || k.a === 'kcmd') {
        if (core.keyNative) core.keyNative(k);
        return;
      }

      if (k.a === 'reg') {
        var mode = k.mode;
        if (ST.mode === 'PRG') {
          if (mode === 'sto') core.writeStep(0x40 | k.r);
          else if (mode === 'ld') core.writeStep(0x60 | k.r);
          else core.writeStep((ST.kind || 0x40) | k.r);
          ST.await = null;
          ST.kind = null;
          core.changed();
          return;
        }

        if (mode === 'sto') {
          /* вот он, долг: число остаётся на индикаторе, но набор закрыт */
          ST.R[k.r] = MK.norm(ST.X, MAXDIG);
          endTyping();
          core.hint('X → R' + core.REG_NAMES[k.r] + ' = ' + core.fmt(ST.X));
        } else if (mode === 'ld') {
          push(ST.R[k.r]);
          core.hint('R' + core.REG_NAMES[k.r] + ' → X = ' + core.fmt(ST.R[k.r]));
        }
        ST.await = null;
        ST.kind = null;
        core.changed();
        return;
      }

      if (k.a === 'sp') {
        if (ST.mode === 'PRG') { writeCode(0x50, false); return; }
        if (ST.run) {
          ST.run = false;
          core.hint('Остановлено клавишей С/П на адресе ' + core.addrShow(ST.ip));
        } else {
          ST.run = true;
        }
        ST.layer = 'main';
        core.changed();
        return;
      }

      if (k.a === 'pp') {
        if (ST.mode === 'PRG') { writeCode(0x53, true); return; }
        ST.run = false;
        core.step();
        ST.layer = 'main';
        core.changed();
        return;
      }

      if (k.a === 'bp') {
        if (ST.mode === 'PRG') { writeCode(0x51, true); return; }
        ST.await = 'addr';
        ST.addrBuf = '';
        core.hint('Введи адрес перехода двумя цифрами');
        ST.layer = 'main';
        core.changed();
        return;
      }

      if (k.a === 'vo') {
        if (ST.mode === 'PRG') { writeCode(0x52, false); return; }
        ST.ip = 0;
        ST.sub = [];
        core.hint('Адрес 00');
        ST.layer = 'main';
        core.changed();
        return;
      }

      if (k.a === 'prg') {
        ST.mode = 'PRG';
        endTyping();
        ST.run = false;
        core.hint('Режим программирования: нажимай клавиши — их коды пишутся в память');
        ST.layer = 'main';
        core.changed();
        return;
      }

      if (k.a === 'aut') {
        ST.mode = 'AUT';
        ST.err = false;
        core.hint('Автоматический режим');
        ST.layer = 'main';
        core.changed();
        return;
      }

      if (k.a === 'cf') {
        ST.layer = 'main';
        ST.await = null;
        ST.kind = null;
        core.changed();
        return;
      }

      if (k.a === 'reset') {
        resetAll();
        return;
      }

      if (k.a === 'layer-cmd') {
        if (ST.mode === 'PRG') { writeCode(k.c, !!k.jump); return; }
        core.exec(k.c);
        if ((k.c & 0xF0) === 0x40 || (k.c & 0xF0) === 0xB0) endTyping();
        ST.layer = 'main';
        core.changed();
        return;
      }
    }

    /* вспомогательные вещи, полезные интерфейсу */
    core.negateX = negate;
    core.endTyping = endTyping;
    core.resetAll = resetAll;
    return key;
  }

  MK.create = function (opt) {
    var core = origCreate(opt);
    core.keyNative = core.key;   /* исходный обработчик ядра — для делегирования */
    core.key = makeKey(core);
    return core;
  };

  MK.KEYS_VERSION = 4;
})(typeof window !== 'undefined' ? window : this);
