/* =========================================================
   pmk61 / core.js
   Чистое ядро семейства советских программируемых микрокалькуляторов.
   Копия greagre/pmk52/core.js — ядро общее для обеих линий.

   Правило синхронизации: ядро правится только при доказанном баге
   и одинаково в обоих проектах. Всё, что различает модели, живёт
   в profiles.js, а не здесь.

   Ревизия 2:
   - cmdName учитывает пятнадцатый регистр (4E / 6E = Re) и не выдумывает
     подпись для кода за пределами профиля;
   - jumpAddr понимает адреса 100…104, если профиль это разрешает;
   - modAddr считает модификацию по длине адресного пространства профиля.

   Ревизия 3 — K-функции (блок 0x26…0x3E):
     0x27/0x28/0x29  K −, K ×, K ÷        — ЕГГ0Г, как на ПМК;
     0x31            K |x|                — модуль;
     0x34            K [x]                — целая часть (у −1,2 будет −1);
     0x35            K {x}                — дробная часть (у −1,2 будет −0,2);
     0x36            K max                — максимум X и Y, ноль считается наибольшим;
     0x3B            K СЧ                 — датчик случайных чисел;
     0x3C            ошибка;
     0x3E            Y→X                  — копирование Y в X, прежний X уходит в X1.

   Ревизия 4 (по руководству Б3-34/МК-52/МК-54/МК-61, раздел
   «Назначение функциональных клавиш»):
   - codeStr: исправлена таблица символов кодов;
   - угловые переводы 0x26, 0x2A, 0x30, 0x33 реализованы по описанию
     руководства («градусы, минуты, секунды и доли секунды» ↔
     «градусы и доли градуса», и то же для часов, и вариант без секунд);
   - 0x32 K ЗН — определение знака числа;
   - косвенные команды с регистрами (0xB… и 0xD…) используют modReg:
     номер регистра модифицируется по модулю числа регистров профиля;
   - прямая запись X→П и вызов П→x с номером регистра за пределами
     профиля дают ЕГГ0Г.

   Ревизия 5 — по замечаниям контрольных тестов и руководству:
   - jumpAddr: адрес 100…104 записывается ПЕРВОЙ ячейкой «•» (код 0x0A),
     ВТОРОЙ — цифрой 0…4. Раньше было наоборот. На бумаге и на индикаторе
     такой адрес пишут «-0»…«-4»;
   - стек возврата ограничен пятью разрядами (шестой вызов ПП даёт ЕГГ0Г);
   - modAddr округляет содержимое регистра до целого: раньше адрес 4,7
     давал нецелый индекс и чтение «undefined» из памяти команд;
   - исправлен адрес возврата косвенного вызова ПП (0xA0): раньше он
     вычислялся уже после смены ST.ip и указывал не туда;
   - cmdName: код 4F подписывается как «R0» (по таблице F означает R0),
     а не как «Re» и не как «undefined».

   Ревизия 6 — закрыты два долга контрольных тестов:
   - код 0x4F (x→П с цифрой F) теперь пишет в R0, а не даёт ЕГГ0Г:
     проверка «lo >= regCount» отсекала 15 раньше, чем срабатывало
     правило «F в младшей цифре означает R0»;
   - код 0x6F (П→x с цифрой F) так же читает R0;
   - проверки границ регистров остались: у МК-61 код 0x4F теперь пишет
     в R0, а код 0x4E по-прежнему работает с Re, как и положено.

   Ревизия 7 — закрыт третий долг (X→П не завершал набор числа):
     набрал 5, нажал X→П, нажал 7 — получалось 57, у настоящего ПМК 7.
     Сброс набора сделан в ТРЁХ местах, иначе баг выживает в двух из них:
       exec(), блок hi === 4          — запись X→П из программы и с клавиши;
       step(), блок hi === 0xB        — косвенная запись K x→П;
       key(), ветка sto               — ручное нажатие X→П в интерфейсе.
     Чтение (hi === 6 и 0xD) и раньше закрывало набор, потому что идёт
     через pushValue().

   НЕ реализованы и дают ЕГГ0Г:
     0x37…0x3A                K AND, K OR, K XOR, K ИНВ — руководство
                              называет только смысл, но не описывает, над
                              чем выполняется операция (целые части? порядки?
                              сколько разрядов?). Нужна сверка с эталоном;
     0x55, 0x56               К 1, К 2 — назначение не установлено.

   Важно: K-функции есть только у МК-52 и МК-61.
   У Б3-34 и МК-54 этих клавиш нет вовсе — профиль линии 34-го должен
   отдавать ЕГГ0Г на весь блок 0x26…0x3E (кроме NOP).

   Правила этого файла:
   - ничего не знает про DOM, CSS, звук и вёрстку;
   - состояние — обычные данные, годится для JSON;
   - наружу отдаёт только состояния и события через onEvent.

   Профиль передаётся в create():
     progLen      — шагов программной памяти (105 у МК-61, 98 у Б3-34/МК-54)
     regCount     — число регистров (15 у МК-52/МК-61, 14 у Б3-34/МК-54)
     regNames     — подписи регистров (['0'..'9','a'..'e'])
     nop          — код пустого шага (0x54 «К НОП»)
     maxDig       — значащих цифр мантиссы (8)
     addrHigh     — разрешены ли адреса выше 99
     addrHighFirst — первый такой адрес (100)
     addrHighLast  — последний такой адрес (104)
     hasK         — есть ли K-функции (true у МК-52/МК-61)

   Угол (переключатель Р-ГРД-Г на корпусе):
     'deg'  — градусы, 'grad' — грады, 'rad' — радианы.
   Меняет только тригонометрию, кнопкой «Сброс» не сбрасывается.
   ========================================================= */
(function (global) {
  'use strict';

  var DEF_MAXDIG = 8;     /* значащих цифр мантиссы */
  var DEF_PROG_LEN = 105; /* шагов программной памяти у МК-61 */
  var DEF_NOP = 0x54;     /* «К НОП» — пустой шаг */
  var DEF_REG_COUNT = 15;
  var DEF_REG_NAMES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e'];
  /* Коды регистров по таблице «Номера и коды регистров»:
     10 = RGa, 11 = RGb, 12 = RGc, 13 = RGd, 14 = RGe. */
  var CODE_CHARS = '0123456789-LCDE ';
  var ANGLES = ['deg', 'grad', 'rad'];
  /* Предел вложенности подпрограмм: пять разрядов стека возврата. */
  var MAX_RET = 5;

  /* Цифра F (15) в младшей цифре кода адресует R0 — так в таблице кодов. */
  var REG_F = 15;

  var CMD_NAMES = {
    0x0A: '·', 0x0B: '/-/', 0x0C: 'ВП', 0x0D: 'Cx', 0x0E: 'В↑', 0x0F: 'Вx',
    0x10: '+', 0x11: '−', 0x12: '×', 0x13: '÷', 0x14: '↔',
    0x15: '10^x', 0x16: 'e^x', 0x17: 'lg', 0x18: 'ln',
    0x19: 'arcsin', 0x1A: 'arccos', 0x1B: 'arctg', 0x1C: 'sin', 0x1D: 'cos', 0x1E: 'tg',
    0x20: 'π', 0x21: '√', 0x22: 'x²', 0x23: '1/x', 0x24: 'x^y', 0x25: 'F◯',
    0x26: 'K °→′', 0x27: 'K −', 0x28: 'K ×', 0x29: 'K ÷', 0x2A: 'K °→′″',
    0x30: 'K °←′″', 0x31: 'K |x|', 0x32: 'K ЗН', 0x33: 'K °←′',
    0x34: 'K [x]', 0x35: 'K {x}', 0x36: 'K max', 0x37: 'K AND',
    0x38: 'K OR', 0x39: 'K XOR', 0x3A: 'K ИНВ', 0x3B: 'K СЧ',
    0x3C: 'ошибка', 0x3D: 'K °→′″ (дубль)', 0x3E: 'Y→X',
    0x50: 'С/П', 0x51: 'БП', 0x52: 'В/О', 0x53: 'ПП', 0x54: 'К НОП',
    0x55: 'К 1', 0x56: 'К 2',
    0x57: 'F x≠0', 0x58: 'F L2', 0x59: 'F x≥0', 0x5A: 'F L3',
    0x5B: 'F L1', 0x5C: 'F x<0', 0x5D: 'F L0', 0x5E: 'F x=0'
  };

  /* Подписи для диапазонов с номером регистра в младшей цифре.
     Названия совпадают с таблицей profiles.js, чтобы листинг,
     декодер и подсказки говорили одинаково. */
  var RANGE_NAMES = {
    0x40: 'x→П', 0x60: 'П→x',
    0x70: 'K x≠0', 0x80: 'K БП', 0x90: 'K x≥0', 0xA0: 'K ПП',
    0xB0: 'K x→П', 0xC0: 'K x<0', 0xD0: 'K П→x', 0xE0: 'K x=0'
  };

  function codeStr(c) {
    c = c & 255;
    return CODE_CHARS[(c >> 4) & 15] + CODE_CHARS[c & 15];
  }

  function hex2(c) {
    var s = (c & 255).toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }

  /* Подпись регистра по младшей цифре кода.
     Цифра F (15) по таблице означает R0, поэтому подписывается «0». */
  function regLabel(lo, regCount) {
    if (lo === REG_F) return '0';
    if (regCount && lo >= regCount) return null;
    return DEF_REG_NAMES[lo];
  }

  /* Переводит младшую цифру кода в настоящий номер регистра.
     F (15) означает R0; всё, что за пределами профиля, даёт −1. */
  function regIndex(lo, regCount) {
    var r = (lo === REG_F) ? 0 : lo;
    if (r < 0 || r >= regCount) return -1;
    return r;
  }

  /* regCount необязателен: без него считаем, что регистры есть до Re.
     Для линии Б3-34 интерфейс передаёт 14 — тогда 4E/6E подписи не получат. */
  function cmdName(c, regCount) {
    if (c >= 0 && c <= 9) return String(c);
    if (CMD_NAMES[c]) return CMD_NAMES[c];
    var hi = c & 0xF0, lo = c & 0x0F;
    var nm = RANGE_NAMES[hi];
    if (nm) {
      var lbl = regLabel(lo, regCount);
      if (lbl === null) return '?';
      return nm + ' ' + lbl;
    }
    return '?';
  }

  /* Переходы занимают три ячейки: команда, десятки адреса, единицы адреса. */
  function isJumpCmd(c) {
    return c === 0x51 || c === 0x53 ||
           c === 0x57 || c === 0x59 || c === 0x5C || c === 0x5E ||
           c === 0x5D || c === 0x5B || c === 0x58 || c === 0x5A;
  }

  function isCondJump(c) {
    return c === 0x57 || c === 0x59 || c === 0x5C || c === 0x5E;
  }

  function isLoopCmd(c) {
    return c === 0x5D || c === 0x5B || c === 0x58 || c === 0x5A;
  }

  function loopRegIndex(c) {
    if (c === 0x5D) return 0;
    if (c === 0x5B) return 1;
    if (c === 0x58) return 2;
    if (c === 0x5A) return 3;
    return -1;
  }

  /* ---------- числа в духе Б3-34 ---------- */
  function norm(x, maxDig) {
    var d = maxDig || DEF_MAXDIG;
    if (typeof x !== 'number' || isNaN(x) || !isFinite(x)) return NaN;
    if (x === 0) return 0;
    var a = Math.abs(x);
    if (a >= 1e100) return NaN;
    if (a < 1e-99) return NaN;
    var y = Number(x.toPrecision(d));
    if (!isFinite(y) || Math.abs(y) >= 1e100) return NaN;
    return y;
  }

  function fmtNum(x, maxDig) {
    var d = maxDig || DEF_MAXDIG;
    if (typeof x !== 'number' || isNaN(x) || !isFinite(x)) return 'ЕГГОГ';
    if (x === 0) return '0';
    var a = Math.abs(x), s, e, m, ms;
    if (a >= 1e8 || a < 1e-2) {
      e = Math.floor(Math.log10(a));
      m = x / Math.pow(10, e);
      ms = m.toFixed(d - 1).replace(/0+$/, '').replace(/\.$/, '');
      s = ms + ' ' + (e < 0 ? '-' : ' ') + String(Math.abs(e));
      if (String(Math.abs(e)).length < 2) s = ms + ' ' + (e < 0 ? '-' : ' ') + '0' + Math.abs(e);
      return s;
    }
    return Number(x.toPrecision(d)).toString();
  }

  /* ---------- фабрика ядра ---------- */
  function createCore(options) {
    var opt = options || {};
    var onEvent = typeof opt.onEvent === 'function' ? opt.onEvent : function () {};
    var maxLog = opt.maxLog || 4000;

    /* размеры памяти — из профиля модели */
    var PROG_LEN = opt.progLen > 0 ? Math.round(opt.progLen) : DEF_PROG_LEN;
    var REG_COUNT = opt.regCount > 0 ? Math.round(opt.regCount) : DEF_REG_COUNT;
    var NOP = typeof opt.nop === 'number' ? (opt.nop & 255) : DEF_NOP;
    var MAXDIG = opt.maxDig > 0 ? Math.round(opt.maxDig) : DEF_MAXDIG;
    var HAS_K = opt.hasK === undefined ? true : !!opt.hasK;
    var regNames = (Array.isArray(opt.regNames) && opt.regNames.length >= Math.min(REG_COUNT, 10)
      ? opt.regNames.slice(0, REG_COUNT)
      : DEF_REG_NAMES.slice(0, REG_COUNT));
    var REG_NAMES = regNames;
    /* наибольший допустимый адрес перехода: последний шаг программы */
    var MAX_ADDR = PROG_LEN - 1;

    /* адреса выше 99 (у МК-61 это 100…104, на бумаге «-0»…«-4») */
    var ADDR_HIGH = !!opt.addrHigh;
    var ADDR_FIRST = typeof opt.addrHighFirst === 'number' ? opt.addrHighFirst : 100;
    var ADDR_LAST = typeof opt.addrHighLast === 'number' ? opt.addrHighLast : MAX_ADDR;
    if (ADDR_LAST > MAX_ADDR) ADDR_LAST = MAX_ADDR;
    /* длина адресного пространства для модификации адреса:
       у Б3-34 прежнее поведение (100), у МК-61 — 105 */
    var ADDR_SPAN = ADDR_HIGH ? PROG_LEN : 100;

    var ST = {
      X: 0, Y: 0, Z: 0, T: 0, X1: 0,
      R: new Array(REG_COUNT).fill(0),
      prog: new Array(PROG_LEN).fill(NOP),
      ip: 0,
      mode: 'AUT',        /* AUT | PRG */
      run: false,
      sub: [],
      layer: 'main',      /* main | f | k */
      await: null,        /* null | 'reg' | 'addr' */
      kind: null,
      addrBuf: '',
      input: '',
      typing: false,
      exp: false,
      err: false,
      steps: 0,
      angle: (ANGLES.indexOf(opt.angle) >= 0 ? opt.angle : 'deg')
    };

    var log = [];

    function emit(type, data) {
      try { onEvent(type, data === undefined ? null : data); } catch (e) {}
    }

    function hint(text) { emit('hint', text); }
    function changed() { emit('change', null); }

    function pushLog(note) {
      log.push({
        step: ST.steps,
        ip: ST.ip,
        code: ST.prog[ST.ip],
        note: note || '',
        X: ST.X, Y: ST.Y, Z: ST.Z, T: ST.T, X1: ST.X1,
        R: ST.R.slice(0)
      });
      if (log.length > maxLog) log.shift();
    }

    /* ---------- стек ---------- */
    function shiftUp() {
      ST.T = ST.Z;
      ST.Z = ST.Y;
      ST.Y = ST.X;
    }

    function pushValue(v) {
      var n = norm(v, MAXDIG);
      shiftUp();
      ST.X = isNaN(n) ? NaN : n;
      ST.typing = false;
      ST.input = '';
      ST.exp = false;
    }

    function setErr() {
      ST.err = true;
      emit('error', null);
      changed();
    }

    /* ---------- ввод числа ---------- */
    function mantissaDigits(s) {
      return String(s).split('e')[0].replace(/[^0-9]/g, '').length;
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

    function typeDigit(d) {
      startTyping();
      if (ST.exp) {
        var parts = ST.input.split('e');
        if ((parts[1] || '').length >= 2) {
          hint('Порядок — только 2 цифры, как у оригинала');
          return;
        }
      } else if (mantissaDigits(ST.input) >= MAXDIG) {
        hint('Мантисса — ' + MAXDIG + ' цифр, как у оригинала. Дальше вводи порядок через ВП.');
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

    /* ---------- операции ---------- */
    function unary(fn) {
      var old = ST.X;
      var v = norm(fn(ST.X), MAXDIG);
      if (isNaN(v)) { setErr(); return; }
      ST.X1 = old;
      ST.X = v;
      ST.typing = false; ST.input = ''; ST.exp = false;
    }

    function binary(fn) {
      var x = ST.X, y = ST.Y;
      var v = norm(fn(y, x), MAXDIG);
      if (isNaN(v)) { setErr(); return; }
      ST.X1 = x;
      ST.Y = ST.Z;
      ST.Z = ST.T;
      ST.X = v;
      ST.typing = false; ST.input = ''; ST.exp = false;
    }

    /* ---------- K-функции ---------- */
    /* K max: по руководству ноль считается самым большим числом,
       то есть если хотя бы один операнд ноль — результат ноль. */
    function kMax(a, b) {
      if (a === 0 || b === 0) return 0;
      return a > b ? a : b;
    }

    /* K СЧ: датчик случайных чисел, 0 и 1 не выпадают.
       Значение выдаётся с точностью мантиссы профиля. */
    function kRandom() {
      var r = 0;
      for (var i = 0; i < 64; i++) {
        r = Number(Math.random().toFixed(MAXDIG));
        if (r > 0 && r < 1) return r;
      }
      return 0.5;
    }

    function truncPart(v) {
      return v < 0 ? Math.ceil(v) : Math.floor(v);
    }

    function fracPart(v) {
      return v - truncPart(v);
    }

    /* ---------- угловые переводы ---------- */
    function dmsToDeg(x) {
      var sign = x < 0 ? -1 : 1;
      var v = Math.abs(x);
      var d = Math.floor(v + 1e-11);
      var frac = v - d;
      var mm = Math.floor(frac * 100 + 1e-9);
      var ss = (frac * 100 - mm) * 100;
      return sign * (d + mm / 60 + ss / 3600);
    }

    function degToDms(x) {
      var sign = x < 0 ? -1 : 1;
      var v = Math.abs(x);
      var d = Math.floor(v + 1e-11);
      var rest = (v - d) * 60;
      var mm = Math.floor(rest + 1e-9);
      var ss = (rest - mm) * 60;
      ss = Math.round(ss * 100) / 100;
      if (ss >= 60) { ss -= 60; mm += 1; }
      if (mm >= 60) { mm -= 60; d += 1; }
      return sign * (d + mm / 100 + ss / 10000);
    }

    function dmToDeg(x) {
      var sign = x < 0 ? -1 : 1;
      var v = Math.abs(x);
      var d = Math.floor(v + 1e-11);
      var frac = v - d;
      var mm = frac * 100;
      return sign * (d + mm / 60);
    }

    function degToDm(x) {
      var sign = x < 0 ? -1 : 1;
      var v = Math.abs(x);
      var d = Math.floor(v + 1e-11);
      var rest = (v - d) * 60;
      var mm = Math.round(rest * 100) / 100;
      if (mm >= 60) { mm -= 60; d += 1; }
      return sign * (d + mm / 100);
    }

    /* ---------- угловые единицы (переключатель Р-ГРД-Г) ---------- */
    function setAngle(mode) {
      if (ANGLES.indexOf(mode) < 0) return ST.angle;
      if (ST.angle === mode) return ST.angle;
      ST.angle = mode;
      changed();
      return ST.angle;
    }

    function getAngle() { return ST.angle; }

    function angleName(mode) {
      var m = mode || ST.angle;
      return m === 'grad' ? 'грады' : (m === 'rad' ? 'радианы' : 'градусы');
    }

    /* вход тригонометрии: число на индикаторе -> радианы */
    function toRad(v) {
      if (ST.angle === 'rad') return v;
      if (ST.angle === 'grad') return v * Math.PI / 200;
      return v * Math.PI / 180;
    }

    /* выход обратной тригонометрии: радианы -> число на индикаторе */
    function fromRad(v) {
      if (ST.angle === 'rad') return v;
      if (ST.angle === 'grad') return v * 200 / Math.PI;
      return v * 180 / Math.PI;
    }

    /* ---------- выполнение одной команды ---------- */
    function exec(code) {
      code = code & 255;
      var hi = (code >> 4) & 15, lo = code & 15;

      if (code >= 0x00 && code <= 0x09) { typeDigit(code); return; }
      if (code === 0x0A) { typeDot(); return; }
      if (code === 0x0B) { ST.X = -ST.X; if (ST.typing) ST.input = String(ST.X); return; }
      if (code === 0x0C) { typeExp(); return; }
      if (code === 0x0D) { ST.X = 0; ST.typing = false; ST.input = ''; ST.exp = false; return; }
      if (code === 0x0E) { shiftUp(); ST.typing = false; ST.input = ''; ST.exp = false; return; }
      if (code === 0x0F) { var t = ST.X1; ST.X1 = ST.X; ST.X = t; ST.typing = false; return; }

      if (code === 0x10) { binary(function (a, b) { return a + b; }); return; }
      if (code === 0x11) { binary(function (a, b) { return a - b; }); return; }
      if (code === 0x12) { binary(function (a, b) { return a * b; }); return; }
      if (code === 0x13) { binary(function (a, b) { return a / b; }); return; }
      if (code === 0x14) { var q = ST.X; ST.X = ST.Y; ST.Y = q; ST.typing = false; return; }

      if (code === 0x15) { unary(function (v) { return Math.pow(10, v); }); return; }
      if (code === 0x16) { unary(function (v) { return Math.exp(v); }); return; }
      if (code === 0x17) { unary(function (v) { return Math.log10(v); }); return; }
      if (code === 0x18) { unary(function (v) { return Math.log(v); }); return; }
      if (code === 0x19) { unary(function (v) { return fromRad(Math.asin(v)); }); return; }
      if (code === 0x1A) { unary(function (v) { return fromRad(Math.acos(v)); }); return; }
      if (code === 0x1B) { unary(function (v) { return fromRad(Math.atan(v)); }); return; }
      if (code === 0x1C) { unary(function (v) { return Math.sin(toRad(v)); }); return; }
      if (code === 0x1D) { unary(function (v) { return Math.cos(toRad(v)); }); return; }
      if (code === 0x1E) { unary(function (v) { return Math.tan(toRad(v)); }); return; }

      if (code === 0x20) { pushValue(Math.PI); return; }
      if (code === 0x21) { unary(function (v) { return Math.sqrt(v); }); return; }
      if (code === 0x22) { unary(function (v) { return v * v; }); return; }
      if (code === 0x23) { unary(function (v) { return 1 / v; }); return; }
      if (code === 0x24) { binary(function (a, b) { return Math.pow(a, b); }); return; }
      if (code === 0x25) {
        var tx = ST.X;
        ST.X = ST.Y; ST.Y = ST.Z; ST.Z = ST.T; ST.T = tx;
        ST.typing = false;
        return;
      }

      /* ---- K-функции. Реализовано только то, что подтверждено руководством. ---- */
      var isKBlock = (code >= 0x26 && code <= 0x2A) || (code >= 0x30 && code <= 0x3E);
      if (isKBlock && !HAS_K) { setErr(); return; }   /* у Б3-34/МК-54 K-клавиш нет */

      if (code === 0x26) { unary(dmToDeg); return; }   /* K °→′   */
      if (code === 0x2A) { unary(dmsToDeg); return; }  /* K °→′″  */
      if (code === 0x30) { unary(degToDms); return; }  /* K °←′″  */
      if (code === 0x33) { unary(degToDm); return; }   /* K °←′  */
      if (code === 0x32) {                            /* K ЗН */
        unary(function (v) { return v > 0 ? 1 : (v < 0 ? -1 : 0); });
        return;
      }
      if (code === 0x27 || code === 0x28 || code === 0x29) { setErr(); return; } /* K −, K ×, K ÷ */
      if (code === 0x31) { unary(function (v) { return Math.abs(v); }); return; } /* K |x| */
      if (code === 0x34) { unary(truncPart); return; }                            /* K [x] */
      if (code === 0x35) { unary(fracPart); return; }                             /* K {x} */
      if (code === 0x36) { binary(kMax); return; }                                /* K max */
      if (code === 0x3B) { unary(function () { return kRandom(); }); return; }    /* K СЧ */
      if (code === 0x3C) { setErr(); return; }                                    /* ошибка по таблице */
      if (code === 0x3D) { unary(dmsToDeg); return; }                             /* дубль 0x2A */
      if (code === 0x3E) {                                                        /* Y→X */
        ST.X1 = ST.X;
        ST.X = ST.Y;
        ST.typing = false; ST.input = ''; ST.exp = false;
        return;
      }
      /* 0x37…0x3A (логические) и 0x55/0x56 (К 1, К 2) дают ЕГГ0Г:
         руководство не описывает, над чем выполняется операция. */
      if ((code >= 0x37 && code <= 0x3A) || code === 0x55 || code === 0x56) { setErr(); return; }

      if (hi === 4) {
        /* цифра F в младшей цифре кода означает R0 (таблица кодов) */
        var stReg = regIndex(lo, REG_COUNT);
        if (stReg < 0) { setErr(); return; }
        ST.R[stReg] = norm(ST.X, MAXDIG);
        /* Ревизия 7: X→П завершает набор числа. Без этих трёх строк
           «5 X→П 7» даёт 57 — набор продолжается после записи. */
        ST.typing = false; ST.input = ''; ST.exp = false;
        hint('X → R' + REG_NAMES[stReg]);
        return;
      }
      if (hi === 6) {
        /* цифра F в младшей цифре кода означает R0 (таблица кодов) */
        var ldReg = regIndex(lo, REG_COUNT);
        if (ldReg < 0) { setErr(); return; }
        pushValue(ST.R[ldReg]);
        hint('R' + REG_NAMES[ldReg] + ' → X');
        return;
      }

      if (code === 0x50) { return; }
      if (code === 0x52) { ST.ip = ST.sub.length ? ST.sub.pop() : 0; return; }

      setErr();
    }

    /* ---------- адреса ---------- */
    /* Адрес занимает две ячейки после команды.
       Обычный адрес 00…99: первая ячейка — десятки, вторая — единицы.
       Адрес 100…104 у МК-61 записывается наоборот: ПЕРВАЯ ячейка — клавиша
       «•» (код 0x0A), ВТОРАЯ — цифра 0…4. На индикаторе и на бумаге такой
       адрес пишут «-0»…«-4». */
    function jumpAddr(ip) {
      var at = (ip === undefined ? ST.ip : ip);
      var a = ST.prog[(at + 1) % PROG_LEN];
      var b = ST.prog[(at + 2) % PROG_LEN];

      if (a === 0x0A) {
        if (!ADDR_HIGH) return -1;
        if (b > (ADDR_LAST - ADDR_FIRST)) return -1;
        return ADDR_FIRST + b;
      }
      if (a > 9) return -1;
      if (b > 9) return -1;
      var v = a * 10 + b;
      if (v < 0 || v > MAX_ADDR) return -1;
      return v;
    }

    /* Модификация адреса перехода (руководство, «Модификация адреса»):
       RG0–RG3 — из содержимого вычитается 1,
       RG4–RG6 — прибавляется 1,
       RG7…RGe — содержимое не меняется.
       Содержимое регистра может быть нецелым, поэтому адрес округляется:
       иначе получается дробный индекс в массиве команд. */
    function modAddr(v, r) {
      var n = Math.round(Number(v));
      if (!isFinite(n)) return -1;
      var a;
      if (r >= 0 && r <= 3) a = (n - 1 + ADDR_SPAN) % ADDR_SPAN;
      else if (r >= 4 && r <= 6) a = (n + 1) % ADDR_SPAN;
      else a = ((n % ADDR_SPAN) + ADDR_SPAN) % ADDR_SPAN;
      if (a < 0 || a > MAX_ADDR) a = ((a % PROG_LEN) + PROG_LEN) % PROG_LEN;
      if (a < 0 || a >= PROG_LEN) return -1;
      return a;
    }

    /* Модификация НОМЕРА РЕГИСТРА для косвенных команд с регистрами —
       та же арифметика, но по модулю числа регистров профиля. */
    function modReg(v, r) {
      var a = Math.round(v);
      if (!isFinite(a)) return -1;
      if (r >= 0 && r <= 3) a = (a - 1 + REG_COUNT) % REG_COUNT;
      else if (r >= 4 && r <= 6) a = (a + 1) % REG_COUNT;
      else a = ((a % REG_COUNT) + REG_COUNT) % REG_COUNT;
      if (a < 0 || a >= REG_COUNT) return -1;
      return a;
    }

    function addrLimitText() {
      var txt = '00–' + (MAX_ADDR < 10 ? '0' + MAX_ADDR : Math.min(MAX_ADDR, 99));
      if (ADDR_HIGH && ADDR_LAST >= ADDR_FIRST) {
        txt += ' или -0…-' + (ADDR_LAST - ADDR_FIRST) + ' (шаги ' + ADDR_FIRST + '–' + ADDR_LAST + ')';
      }
      return txt;
    }

    function badAddress() {
      hint('Ошибка в адресе перехода: после команды должны стоять две цифры адреса (' +
           addrLimitText() + ')');
      ST.err = true;
      ST.run = false;
      emit('error', null);
      changed();
      return 'error';
    }

    /* ---------- один шаг программы ---------- */
    function step() {
      if (ST.err) return 'error';
      var code = ST.prog[ST.ip];
      var hi = (code >> 4) & 15, lo = code & 15;
      var addr, ok;

      if (code === 0x50) { ST.run = false; return 'stop'; }

      if (code === 0x51) {
        addr = jumpAddr();
        if (addr < 0) return badAddress();
        ST.ip = addr;
        return 'jump';
      }

      if (code === 0x52) {
        ST.ip = ST.sub.length ? ST.sub.pop() : 0;
        return 'jump';
      }

      if (code === 0x53) {
        addr = jumpAddr();
        if (addr < 0) return badAddress();
        /* стек возврата — пять разрядов, глубже ПМК не умеет */
        if (ST.sub.length >= MAX_RET) { ST.err = true; ST.run = false; emit('error', null); return 'error'; }
        ST.sub.push((ST.ip + 3) % PROG_LEN);
        ST.ip = addr;
        return 'jump';
      }

      if (code === NOP) { ST.ip = (ST.ip + 1) % PROG_LEN; return 'cont'; }

      /* Прямой условный переход (руководство): если условие НЕ выполняется —
         идём по адресу перехода; если выполняется — адрес не воспринимается
         и исполняется команда после него. */
      if (isCondJump(code)) {
        addr = jumpAddr();
        if (addr < 0) return badAddress();
        ok = false;
        if (code === 0x57) ok = (ST.X !== 0);
        else if (code === 0x59) ok = (ST.X >= 0);
        else if (code === 0x5C) ok = (ST.X < 0);
        else ok = (ST.X === 0);
        ST.ip = ok ? ((ST.ip + 3) % PROG_LEN) : addr;
        return 'jump';
      }

      /* Циклы L0–L3: регистр уменьшается, пока не ноль — переход по адресу. */
      if (isLoopCmd(code)) {
        addr = jumpAddr();
        if (addr < 0) return badAddress();
        var r = loopRegIndex(code);
        ST.R[r] = norm(ST.R[r] - 1, MAXDIG);
        if (ST.R[r] !== 0) ST.ip = addr;
        else ST.ip = (ST.ip + 3) % PROG_LEN;
        return 'jump';
      }

      /* Косвенные переходы (1 ячейка, адрес берётся из регистра). */
      if (hi === 8) {
        ST.ip = modAddr(ST.R[lo], lo);
        if (ST.ip < 0) return badAddress();
        return 'jump';
      }
      if (hi === 0xA) {
        /* адрес возврата считается ДО смены ST.ip — иначе он указывает не туда */
        var back = (ST.ip + 1) % PROG_LEN;
        var target = modAddr(ST.R[lo], lo);
        if (target < 0) return badAddress();
        if (ST.sub.length >= MAX_RET) { ST.err = true; ST.run = false; emit('error', null); return 'error'; }
        ST.sub.push(back);
        ST.ip = target;
        return 'jump';
      }
      if (hi === 0xB) {
        var tr = modReg(ST.R[lo], lo);
        if (tr < 0) return badAddress();
        ST.R[tr] = norm(ST.X, MAXDIG);
        /* Ревизия 7: косвенная запись тоже завершает набор числа */
        ST.typing = false; ST.input = ''; ST.exp = false;
        ST.ip = (ST.ip + 1) % PROG_LEN;
        return 'cont';
      }
      if (hi === 0xD) {
        var sr = modReg(ST.R[lo], lo);
        if (sr < 0) return badAddress();
        pushValue(ST.R[sr]);
        ST.ip = (ST.ip + 1) % PROG_LEN;
        return 'cont';
      }

      /* Косвенные переходы по условию: по руководству наоборот —
         условие НЕ выполняется -> модификация адреса и переход,
         условие выполняется -> следующая команда. */
      if (hi === 7) { ST.ip = (ST.X !== 0) ? ((ST.ip + 1) % PROG_LEN) : modAddr(ST.R[lo], lo); return 'jump'; }
      if (hi === 9) { ST.ip = (ST.X >= 0) ? ((ST.ip + 1) % PROG_LEN) : modAddr(ST.R[lo], lo); return 'jump'; }
      if (hi === 0xC) { ST.ip = (ST.X < 0) ? ((ST.ip + 1) % PROG_LEN) : modAddr(ST.R[lo], lo); return 'jump'; }
      if (hi === 0xE) { ST.ip = (ST.X === 0) ? ((ST.ip + 1) % PROG_LEN) : modAddr(ST.R[lo], lo); return 'jump'; }

      exec(code);
      if (ST.err) { ST.run = false; return 'error'; }
      ST.ip = (ST.ip + 1) % PROG_LEN;
      return 'cont';
    }

    /* ---------- прогон ---------- */
    function run(limit) {
      var max = limit || 100000;
      var n = 0, res = 'cont';
      ST.err = false;
      ST.steps = 0;
      while (n < max) {
        res = step();
        n++;
        ST.steps = n;
        if (res === 'stop' || res === 'error') break;
      }
      return { result: res, steps: n, err: ST.err, x: ST.X, overflow: (n >= max && res !== 'stop' && res !== 'error') };
    }

    /* ---------- запись программы ---------- */
    function writeStep(code) {
      if (ST.ip < 0 || ST.ip >= PROG_LEN) {
        hint('Программная память заполнена (' + PROG_LEN + ' шагов)');
        return false;
      }
      ST.prog[ST.ip] = code & 255;
      ST.ip = (ST.ip + 1) % PROG_LEN;
      return true;
    }

    function writeJump(code) {
      if (ST.ip > PROG_LEN - 3) {
        hint('Для перехода нужно три ячейки (команда + две цифры адреса). Свободного места не хватает.');
        return false;
      }
      ST.prog[ST.ip] = code & 255;
      ST.ip = (ST.ip + 1) % PROG_LEN;
      ST.await = 'addr';
      ST.addrBuf = '';
      hint('Введи адрес перехода двумя цифрами (десятки, затем единицы)');
      return true;
    }

    function setProgram(arr, keepRegisters) {
      var p = new Array(PROG_LEN).fill(NOP);
      if (Array.isArray(arr)) {
        for (var i = 0; i < PROG_LEN; i++) {
          if (typeof arr[i] === 'number' && isFinite(arr[i])) {
            p[i] = Math.max(0, Math.min(255, Math.round(arr[i])));
          }
        }
      }
      ST.prog = p;
      ST.ip = 0;
      ST.sub = [];
      ST.err = false;
      if (!keepRegisters) ST.R = new Array(REG_COUNT).fill(0);
      changed();
      return ST.prog;
    }

    function getProgram() { return ST.prog.slice(0); }

    function lastStep() {
      var last = -1;
      for (var i = 0; i < PROG_LEN; i++) { if (ST.prog[i] !== NOP) last = i; }
      return last;
    }

    function programHasData() {
      for (var i = 0; i < PROG_LEN; i++) { if (ST.prog[i] !== NOP) return true; }
      return false;
    }

    function clearProgram() { return setProgram(null, true); }

    function reset(soft) {
      ST.X = ST.Y = ST.Z = ST.T = ST.X1 = 0;
      ST.typing = false; ST.input = ''; ST.exp = false;
      ST.err = false; ST.run = false; ST.ip = 0; ST.sub = [];
      ST.layer = 'main'; ST.await = null; ST.kind = null; ST.addrBuf = '';
      if (!soft) ST.R = new Array(REG_COUNT).fill(0);
      /* угол не сбрасывается: это переключатель на корпусе */
      log = [];
      changed();
    }

    /* ---------- снимки состояния ---------- */
    function snapshot() {
      return {
        X: ST.X, Y: ST.Y, Z: ST.Z, T: ST.T, X1: ST.X1,
        R: ST.R.slice(0),
        prog: ST.prog.slice(0),
        ip: ST.ip, mode: ST.mode, err: ST.err,
        angle: ST.angle
      };
    }

    function restore(snap) {
      if (!snap) return false;
      ['X', 'Y', 'Z', 'T', 'X1'].forEach(function (k) {
        if (typeof snap[k] === 'number') ST[k] = snap[k];
      });
      if (Array.isArray(snap.R)) {
        for (var i = 0; i < REG_COUNT; i++) {
          ST.R[i] = typeof snap.R[i] === 'number' ? snap.R[i] : 0;
        }
      }
      if (Array.isArray(snap.prog)) setProgram(snap.prog, true);
      if (typeof snap.ip === 'number') ST.ip = snap.ip;
      if (typeof snap.mode === 'string') ST.mode = snap.mode;
      if (typeof snap.angle === 'string' && ANGLES.indexOf(snap.angle) >= 0) ST.angle = snap.angle;
      ST.err = !!snap.err;
      changed();
      return true;
    }

    /* ---------- нажатия клавиш по описанию профиля ---------- */
    function key(k) {
      if (!k) return;

      /* ввод адреса перехода: каждая цифра — отдельная ячейка программы.
         Адреса 100…104 с клавиатуры вводятся клавишей «•» (код 0x0A)
         как ПЕРВАЯ цифра адреса. */
      if (ST.await === 'addr') {
        var cell = null;
        if (k.a === 'digit') cell = k.d;
        else if (k.a === 'dot') cell = 0x0A;
        if (cell === null) return;
        ST.prog[ST.ip] = cell;
        ST.ip = (ST.ip + 1) % PROG_LEN;
        ST.addrBuf += (cell === 0x0A ? '.' : String(cell));
        if (ST.addrBuf.length >= 2) {
          var full = ST.addrBuf.charAt(0) === '.'
            ? (addrFirst() + parseInt(ST.addrBuf.charAt(1), 10))
            : parseInt(ST.addrBuf, 10);
          hint('Адрес перехода записан: ' + addrShow(full));
          ST.addrBuf = '';
          ST.await = null;
        } else {
          hint('Адрес: ' + ST.addrBuf + '_ (вторая цифра)');
        }
        changed();
        return;
      }

      if (k.a === 'pref-f') { ST.layer = (ST.layer === 'f') ? 'main' : 'f'; changed(); return; }
      if (k.a === 'pref-k') { ST.layer = (ST.layer === 'k') ? 'main' : 'k'; changed(); return; }

      if (k.a === 'digit') {
        if (ST.mode === 'PRG') { writeStep(k.d); hint('Код ' + k.d); }
        else typeDigit(k.d);
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'dot') {
        if (ST.mode === 'PRG') writeStep(0x0A);
        else typeDot();
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'code') {
        if (ST.mode === 'PRG') {
          if (k.jump) writeJump(k.c);
          else { writeStep(k.c); hint('Код ' + codeStr(k.c)); }
        } else {
          exec(k.c);
        }
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'stox' || k.a === 'loadx' || k.a === 'kcmd') {
        ST.await = 'reg';
        ST.kind = (k.a === 'stox') ? 0x40 : (k.a === 'loadx' ? 0x60 : k.k);
        emit('pick-register', { mode: k.a });
        return;
      }

      if (k.a === 'reg') {
        var mode = k.mode;
        if (ST.mode === 'PRG') {
          if (mode === 'sto') writeStep(0x40 | k.r);
          else if (mode === 'ld') writeStep(0x60 | k.r);
          else writeStep(ST.kind | k.r);
          ST.await = null; ST.kind = null;
          changed();
          return;
        }
        if (mode === 'sto') {
          ST.R[k.r] = norm(ST.X, MAXDIG);
          /* Ревизия 7: ручное X→П завершает набор числа */
          ST.typing = false; ST.input = ''; ST.exp = false;
          hint('X → R' + REG_NAMES[k.r] + ' = ' + fmtNum(ST.X, MAXDIG));
        }
        else if (mode === 'ld') { pushValue(ST.R[k.r]); hint('R' + REG_NAMES[k.r] + ' → X = ' + fmtNum(ST.R[k.r], MAXDIG)); }
        ST.await = null; ST.kind = null;
        changed();
        return;
      }

      if (k.a === 'sp') {
        if (ST.mode === 'PRG') { writeStep(0x50); hint('Код 50 (С/П)'); }
        else if (ST.run) { ST.run = false; hint('Остановлено клавишей С/П на адресе ' + ST.ip); }
        else { ST.run = true; }
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'pp') {
        if (ST.mode === 'PRG') writeJump(0x53);
        else { ST.run = false; step(); }
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'bp') {
        if (ST.mode === 'PRG') writeJump(0x51);
        else { ST.await = 'addr'; ST.addrBuf = ''; hint('Введи адрес перехода двумя цифрами'); }
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'vo') {
        if (ST.mode === 'PRG') writeStep(0x52);
        else { ST.ip = 0; ST.sub = []; hint('Адрес 00'); }
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'prg') {
        ST.mode = 'PRG'; ST.typing = false; ST.exp = false; ST.run = false;
        hint('Режим программирования: нажимай клавиши — их коды пишутся в память');
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'aut') {
        ST.mode = 'AUT'; ST.err = false;
        hint('Автоматический режим');
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'cf') {
        ST.layer = 'main'; ST.await = null; ST.kind = null;
        changed();
        return;
      }

      if (k.a === 'layer-cmd') {
        var cmd = k.c;
        if (ST.mode === 'PRG') {
          if (k.jump) writeJump(cmd); else writeStep(cmd);
        } else {
          exec(cmd);
        }
        ST.layer = 'main';
        changed();
        return;
      }
    }

    function addrFirst() { return ADDR_FIRST; }

    function addrShow(n) {
      if (typeof n !== 'number' || n < 0) return '--';
      if (n < 100) return (n < 10 ? '0' : '') + n;
      if (ADDR_HIGH && n >= ADDR_FIRST && n <= ADDR_LAST) return '-' + (n - ADDR_FIRST);
      return '--';
    }

    function getLog() { return log.slice(0); }
    function clearLog() { log = []; }
    function record(msg) { pushLog(msg); }

    function setRegister(i, v) {
      if (i >= 0 && i < REG_COUNT) { ST.R[i] = norm(v, MAXDIG); changed(); }
    }

    function setX(v) { ST.X = norm(v, MAXDIG); ST.typing = false; ST.input = ''; changed(); }

    return {
      ST: ST,
      key: key,
      exec: exec,
      step: step,
      run: run,
      reset: reset,
      setProgram: setProgram,
      getProgram: getProgram,
      clearProgram: clearProgram,
      lastStep: lastStep,
      programHasData: programHasData,
      writeStep: writeStep,
      writeJump: writeJump,
      setRegister: setRegister,
      setX: setX,
      setAngle: setAngle,
      getAngle: getAngle,
      angleName: angleName,
      snapshot: snapshot,
      restore: restore,
      getLog: getLog,
      clearLog: clearLog,
      record: record,
      fmt: function (v) { return fmtNum(v, MAXDIG); },
      addrShow: addrShow,
      /* подписи команд — с учётом числа регистров этого профиля */
      cmdName: function (c) { return cmdName(c, REG_COUNT); },
      jumpAddr: jumpAddr,
      modAddr: modAddr,
      modReg: modReg,
      changed: changed,
      hint: hint,
      /* размеры памяти этого экземпляра — пригодятся интерфейсу и декодеру */
      PROG_LEN: PROG_LEN,
      REG_COUNT: REG_COUNT,
      MAX_ADDR: MAX_ADDR,
      REG_NAMES: REG_NAMES.slice(0),
      MAXDIG: MAXDIG,
      NOP: NOP,
      HAS_K: HAS_K,
      ADDR_HIGH: ADDR_HIGH,
      ADDR_FIRST: ADDR_FIRST,
      ADDR_LAST: ADDR_LAST,
      MAX_RET: MAX_RET
    };
  }

  global.MKCore = {
    create: createCore,
    fmtNum: fmtNum,
    norm: norm,
    cmdName: cmdName,
    codeStr: codeStr,
    hex2: hex2,
    isJumpCmd: isJumpCmd,
    isCondJump: isCondJump,
    isLoopCmd: isLoopCmd,
    REG_NAMES: DEF_REG_NAMES,
    ANGLES: ANGLES,
    NOP: DEF_NOP,
    PROG_LEN: DEF_PROG_LEN,
    REG_COUNT: DEF_REG_COUNT,
    MAXDIG: DEF_MAXDIG,
    MAX_RET: MAX_RET
  };
})(typeof window !== 'undefined' ? window : this);
