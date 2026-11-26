/* profiles.js — модели линии МК-61 и таблица кодов команд.
   Проект pmk61, 23.11.2026.

   Линия этого проекта: МК-61 → ext61 (наша импровизация).
   Модели линии Б3-34 (Б3-34, МК-54, МК-52, ext52) живут отдельно,
   в проекте greagre/pmk52. Не добавлять их сюда.

   Источник таблицы кодов: руководство по эксплуатации Б3-34 / МК-52 / МК-54 / МК-61
   и документ «Недокументированные возможности», приложение «Все команды»
   (Анваров С.Р., greagre/pmk-android/instruction).

   В таблицу входят ТОЛЬКО документированные команды.
   Недокументированное (адреса-«циклы», регистр X2, «плохой ЕГГ0Г»,
   шестнадцатеричная арифметика) в профили не включено и включаться не должно:
   иначе эмулятор перестанет быть точным.

   Ревизия 2 (23.11.2026): адреса 100…104 записываются и печатаются
   как «-0»…«-4» — так они обозначены в руководстве и на индикаторе.
   Клавиша «•» даёт код 0x0A и стоит ПЕРВОЙ ячейкой адреса.
   Разбор (parseAddr) принимает и старое обозначение «A0»…«A4» — на случай
   файлов, сохранённых прежней версией.
*/
(function (global) {
  'use strict';

  var NOP = 0x54; // К НОП — документированный пустой оператор

  // Регистры кодируются одной шестнадцатеричной цифрой: 0…9, A…E = Ra…Re.
  // Цифра F в командах 4F/6F и т.п. означает R0.
  var REG_CHARS = '0123456789ABCDE';

  /* ------------------------------------------------------------------ */
  /* Таблица кодов                                                       */
  /* ------------------------------------------------------------------ */

  var CMD = [];

  function put(code, name, extra) {
    var o = extra || {};
    o.code = code;
    o.name = name;
    o.arg = o.arg || null;   // 'digit' | 'reg' | 'addr' | null
    o.double = !!o.double;   // команда занимает две ячейки (команда + адрес)
    o.hidden = !!o.hidden;   // обычным образом с клавиатуры не вводится
    o.error = !!o.error;     // на ПМК даёт ЕГГ0Г
    CMD[code] = o;
    return o;
  }

  // 00…09 — цифры
  for (var d = 0; d < 10; d++) {
    put(d, 'цифра ' + d, { arg: 'digit', digit: d });
  }

  put(0x0A, '.', { arg: 'digit' });          // разделитель целой и дробной части
  put(0x0B, '/-/');                          // смена знака
  put(0x0C, 'ВП');                           // ввод порядка
  put(0x0D, 'Cx', { hint: 'сброс X, стек не двигается' });
  put(0x0E, 'В↑', { hint: 'сдвиг стека, T теряется' });
  put(0x0F, 'F Вx', { hint: 'полный сдвиг, включая X1' });

  put(0x10, '+');
  put(0x11, '−');
  put(0x12, '×');
  put(0x13, '÷');
  put(0x14, '↔', { hint: 'обмен X и Y' });
  put(0x15, 'F 10^x');
  put(0x16, 'F e^x');
  put(0x17, 'F lg');
  put(0x18, 'F ln');
  put(0x19, 'F sin⁻¹');
  put(0x1A, 'F cos⁻¹');
  put(0x1B, 'F tg⁻¹');
  put(0x1C, 'F sin');
  put(0x1D, 'F cos');
  put(0x1E, 'F tg');
  put(0x1F, 'пустой оператор', { hidden: true });

  put(0x20, 'F π', { hint: 'сдвигает стек и копирует X в X1' });
  put(0x21, 'F √');
  put(0x22, 'F x²', { hint: 'в приложении «Все команды» код 21 указан дважды — верно 22' });
  put(0x23, 'F 1/x');
  put(0x24, 'F x^y', { hint: 'стек НЕ сокращается: Y остаётся на месте' });
  put(0x25, 'F ↔', { hint: 'подтягивание стека' });
  put(0x26, 'K °→′');
  put(0x27, 'K −', { error: true });
  put(0x28, 'K ×', { error: true });
  put(0x29, 'K ÷', { error: true });
  put(0x2A, 'K °→′″');
  put(0x2B, 'ошибка', { error: true });
  put(0x2C, 'ошибка', { error: true });
  put(0x2D, 'ошибка', { error: true });
  put(0x2E, 'ошибка', { error: true });
  put(0x2F, 'пустой оператор', { hidden: true });

  put(0x30, 'K °←′″');
  put(0x31, 'K |x|');
  put(0x32, 'K ЗН');
  put(0x33, 'K °←′');
  put(0x34, 'K [x]', { hint: 'отбрасывание дробной части: [-1,2] = -1' });
  put(0x35, 'K {x}', { hint: 'отбрасывание целой части: {-1,2} = -0,2' });
  put(0x36, 'K max', { hint: 'ноль считается самым большим числом' });
  put(0x37, 'K AND', { hint: 'в руководстве только смысл, формат операции не описан' });
  put(0x38, 'K OR');
  put(0x39, 'K XOR');
  put(0x3A, 'K ИНВ');
  put(0x3B, 'K СЧ', { hint: 'датчик случайных чисел: 0 и 1 не выпадают' });
  put(0x3C, 'ошибка', { error: true });
  put(0x3D, 'то же, что K °→′″ (2A)');
  put(0x3E, 'Y→X', { hint: 'копирование Y в X, при этом X→X1' });
  put(0x3F, 'пустой оператор', { hidden: true });

  put(0x50, 'С/П', { hint: 'стоп/пуск' });
  put(0x51, 'БП', { arg: 'addr', double: true });
  put(0x52, 'В/О', { hint: 'возврат: адрес = верхняя ячейка стека + 1' });
  put(0x53, 'ПП', { arg: 'addr', double: true });
  put(0x54, 'К НОП');
  put(0x55, 'К 1', { hint: 'назначение по руководству не установлено' });
  put(0x56, 'К 2', { hint: 'назначение по руководству не установлено' });
  put(0x57, 'F x≠0', { arg: 'addr', double: true, hint: 'условие выполнено → пропуск адреса' });
  put(0x58, 'F L2', { arg: 'addr', double: true });
  put(0x59, 'F x≥0', { arg: 'addr', double: true, hint: 'условие выполнено → пропуск адреса' });
  put(0x5A, 'F L3', { arg: 'addr', double: true });
  put(0x5B, 'F L1', { arg: 'addr', double: true });
  put(0x5C, 'F x<0', { arg: 'addr', double: true, hint: 'условие выполнено → пропуск адреса' });
  put(0x5D, 'F L0', { arg: 'addr', double: true });
  put(0x5E, 'F x=0', { arg: 'addr', double: true, hint: 'условие выполнено → пропуск адреса' });
  put(0x5F, 'зависание', { hidden: true });

  // Регистровые и адресные диапазоны. Низкая цифра — номер регистра,
  // F означает R0 (команды с F обычным образом не вводятся).
  var RANGES = [
    { hi: 0x40, name: 'x→П',  arg: 'reg',  kind: 'store' },
    { hi: 0x60, name: 'П→x',  arg: 'reg',  kind: 'load' },
    { hi: 0x70, name: 'K x≠0', arg: 'reg', kind: 'condIndirect' },
    { hi: 0x80, name: 'K БП', arg: 'reg',  kind: 'jumpIndirect' },
    { hi: 0x90, name: 'K x≥0', arg: 'reg', kind: 'condIndirect' },
    { hi: 0xA0, name: 'K ПП', arg: 'reg',  kind: 'callIndirect' },
    { hi: 0xB0, name: 'K x→П', arg: 'reg', kind: 'storeIndirect' },
    { hi: 0xC0, name: 'K x<0', arg: 'reg', kind: 'condIndirect' },
    { hi: 0xD0, name: 'K П→x', arg: 'reg', kind: 'loadIndirect' },
    { hi: 0xE0, name: 'K x=0', arg: 'reg', kind: 'condIndirect' }
  ];

  for (var r = 0; r < RANGES.length; r++) {
    var rg = RANGES[r];
    for (var lo = 0; lo < 16; lo++) {
      var code = rg.hi + lo;
      var isF = (lo === 0x0F);
      var regChar = isF ? '0' : REG_CHARS.charAt(lo);
      put(code, rg.name + ' R' + regChar, {
        arg: rg.arg,
        kind: rg.kind,
        reg: isF ? 0 : lo,
        indirect: (rg.hi >= 0x70),
        hidden: isF
      });
    }
  }

  // F0…FF — пустой оператор, обычным образом не вводятся.
  // В ext61 этот диапазон планируется занять под двухбайтовые команды
  // расширения: F как префикс + второй байт.
  for (var f = 0xF0; f <= 0xFF; f++) {
    put(f, 'пустой оператор', { hidden: true });
  }

  /* ------------------------------------------------------------------ */
  /* Модели линии МК-61                                                  */
  /* ------------------------------------------------------------------ */

  var PROFILES = {
    'mk-61': {
      id: 'mk-61',
      title: 'МК-61',
      family: 'МК-61',
      progLen: 105,
      regCount: 15,
      maxDig: 8,
      nop: NOP,
      indirect: true,
      addrHigh: true,
      addrHighFirst: 100,
      addrHighLast: 104,
      notes: 'Надмножество Б3-34: те же коды плюс косвенная адресация и Re. ' +
             'Адреса 100…104 пишутся «-0»…«-4»: клавиша «•» (0x0A) стоит первой ' +
             'ячейкой адреса, вторая ячейка — цифра 0…4.'
    },
    'ext61': {
      id: 'ext61',
      title: 'EXT61 (наш профиль)',
      family: 'EXT',
      experimental: true,
      progLen: 105,
      regCount: 15,
      regBanks: 4,
      maxDig: 8,
      nop: NOP,
      indirect: true,
      addrHigh: true,
      addrHighFirst: 100,
      addrHighLast: 104,
      extPrefix: 0xF0,
      extDoubleByte: true,
      notes: 'Наша импровизация поверх МК-61: расширенной заводской версии у 61-го ' +
             'не существовало, поэтому это собственная конструкция. ' +
             'Планируется: банки регистров, страницы программной памяти, ' +
             'двухбайтовые команды расширения с префиксом F. ' +
             'Формат новых команд не утверждён — в интерфейс пока не выводить.'
    }
  };

  /* ------------------------------------------------------------------ */
  /* Вспомогательные функции                                             */
  /* ------------------------------------------------------------------ */

  var DEFAULT_MODEL = 'mk-61';

  function cmd(code) {
    return CMD[code & 0xFF] || null;
  }

  function name(code) {
    var c = cmd(code);
    return c ? c.name : 'неизвестная команда';
  }

  function isDouble(code) {
    var c = cmd(code);
    return !!(c && c.double);
  }

  function isIndirect(code) {
    var c = cmd(code);
    return !!(c && c.indirect);
  }

  function isHidden(code) {
    var c = cmd(code);
    return !!(c && c.hidden);
  }

  function isError(code) {
    var c = cmd(code);
    return !!(c && c.error);
  }

  // Для 4r/6r и косвенных: номер регистра из младшей цифры кода
  function registerIndex(code) {
    var c = cmd(code);
    return (c && typeof c.reg === 'number') ? c.reg : null;
  }

  // Адрес: 0…99 → «00»…«99»; 100…104 у МК-61 → «-0»…«-4»
  function formatAddr(n, model) {
    var p = PROFILES[model] || PROFILES[DEFAULT_MODEL];
    if (typeof n !== 'number' || n < 0) return '--';
    if (n < 100) return (n < 10 ? '0' : '') + n;
    if (p.addrHigh && typeof p.addrHighFirst === 'number' &&
        n >= p.addrHighFirst && n <= p.addrHighLast) {
      return '-' + (n - p.addrHighFirst);
    }
    return '--';
  }

  // Разбор адреса. «-0»…«-4» — обозначение из руководства.
  // «A0»…«A4» принимается для совместимости с файлами прежней версии.
  function parseAddr(text, model) {
    var s = String(text).replace(/\s+/g, '').toUpperCase();
    var p = PROFILES[model] || PROFILES[DEFAULT_MODEL];
    if (/^\d{1,2}$/.test(s)) return parseInt(s, 10);
    if (!p.addrHigh || typeof p.addrHighFirst !== 'number') return null;
    if (/^-\d$/.test(s) || /^A\d$/.test(s)) {
      var n = p.addrHighFirst + parseInt(s.charAt(1), 10);
      return n <= p.addrHighLast ? n : null;
    }
    return null;
  }

  function get(id) {
    return PROFILES[id] || null;
  }

  function list() {
    var out = [];
    for (var k in PROFILES) {
      if (Object.prototype.hasOwnProperty.call(PROFILES, k)) out.push(PROFILES[k]);
    }
    return out;
  }

  // Модели для вывода в интерфейсе (без экспериментальных)
  function listStable() {
    return list().filter(function (p) { return !p.experimental; });
  }

  // Проверка «команда допустима в этой модели»
  function allowed(code, model) {
    var p = get(model);
    if (!p) return true;
    if (!p.indirect && isIndirect(code)) return false;
    return true;
  }

  var MKProfiles = {
    NOP: NOP,
    REG_CHARS: REG_CHARS,
    DEFAULT_MODEL: DEFAULT_MODEL,
    PROFILES: PROFILES,
    get: get,
    list: list,
    listStable: listStable,
    cmd: cmd,
    name: name,
    isDouble: isDouble,
    isIndirect: isIndirect,
    isHidden: isHidden,
    isError: isError,
    registerIndex: registerIndex,
    formatAddr: formatAddr,
    parseAddr: parseAddr,
    allowed: allowed
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MKProfiles;
  } else {
    global.MKProfiles = MKProfiles;
  }
}(typeof window !== 'undefined' ? window : this));
