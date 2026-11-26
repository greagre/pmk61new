/* =========================================================
   pmk61 / profiles-ui.js
   Раскладка клавиш МК-61 для интерфейса — то, чего нет в profiles.js.

   profiles.js остаётся таблицей КОДОВ команд (его читают ядро и декодер,
   он проверен тестами) и НЕ ТРОГАЕТСЯ. Здесь только данные для корпуса:
   какие кнопки в каком слое и какой код они дают.

   Формат кнопки — точно как в mk-emulator/profiles.js:
     { t: подпись, a: действие, c: код, d: цифра, k: база, jump: 1, cls: класс }
   Все эти действия понимает key() в core.js ревизии 6 — проверено.

   Слои:
     main — цифры и всё, что на корпусе видно без F/K;
     f    — второй слой (синусы, логарифмы, ПРГ/АВТ, условия, L0…L3);
     k    — слой К: K-функции 0x26…0x3E и косвенные команды 0x70…0xE0.

   МОДЕЛИ

   mk-61      — обычный МК-61.
   mk-61-ext  — тот же корпус и те же слои, но с флагом ext: true:
                ядро создаётся расширенным (см. ext61-boot.js), а панель
                ввода F0 становится рабочей. Это выбор в списке моделей,
                а не подмена для всех — обычный МК-61 остаётся чистым.
   ========================================================= */
(function (global) {
  'use strict';

  /* ---------- основной слой ---------- */
  var MAIN = [
    { t: 'f',    a: 'pref-f', cls: 'pref' },
    { t: 'k',    a: 'pref-k', cls: 'pref' },
    { t: 'x→П',  a: 'stox' },
    { t: 'П→X',  a: 'loadx' },
    { t: '↔',    a: 'code', c: 0x14, cls: 'dark' },
    { t: 'В↑',   a: 'code', c: 0x0E, cls: 'dark' },

    { t: 'С/П',  a: 'sp', cls: 'red' },
    { t: 'ПП',   a: 'pp', cls: 'dark' },
    { t: 'БП',   a: 'bp', cls: 'dark' },
    { t: 'В/О',  a: 'vo', cls: 'dark' },
    { t: 'Cx',   a: 'code', c: 0x0D, cls: 'red' },
    { t: '/-/',  a: 'code', c: 0x0B, cls: 'dark' },

    { t: '7',    a: 'digit', d: 7, cls: 'dark' },
    { t: '8',    a: 'digit', d: 8, cls: 'dark' },
    { t: '9',    a: 'digit', d: 9, cls: 'dark' },
    { t: '÷',    a: 'code', c: 0x13, cls: 'blue' },
    { t: 'ВП',   a: 'code', c: 0x0C },
    { t: 'F◯',   a: 'code', c: 0x25 },

    { t: '4',    a: 'digit', d: 4, cls: 'dark' },
    { t: '5',    a: 'digit', d: 5, cls: 'dark' },
    { t: '6',    a: 'digit', d: 6, cls: 'dark' },
    { t: '×',    a: 'code', c: 0x12, cls: 'blue' },
    { t: 'π',    a: 'code', c: 0x20 },
    { t: '√',    a: 'code', c: 0x21 },

    { t: '1',    a: 'digit', d: 1, cls: 'dark' },
    { t: '2',    a: 'digit', d: 2, cls: 'dark' },
    { t: '3',    a: 'digit', d: 3, cls: 'dark' },
    { t: '−',    a: 'code', c: 0x11, cls: 'blue' },
    { t: 'x²',   a: 'code', c: 0x22 },
    { t: '1/x',  a: 'code', c: 0x23 },

    { t: '0',    a: 'digit', d: 0, cls: 'dark' },
    { t: '•',    a: 'dot', cls: 'dark' },
    { t: '+',    a: 'code', c: 0x10, cls: 'blue' },
    { t: 'x^y',  a: 'code', c: 0x24 },
    { t: 'e^x',  a: 'code', c: 0x16 },
    { t: 'ln',   a: 'code', c: 0x18 }
  ];

  /* ---------- слой F ---------- */
  var F = [
    { t: 'sin',    a: 'layer-cmd', c: 0x1C, cls: 'dark' },
    { t: 'cos',    a: 'layer-cmd', c: 0x1D, cls: 'dark' },
    { t: 'tg',     a: 'layer-cmd', c: 0x1E, cls: 'dark' },
    { t: 'arcsin', a: 'layer-cmd', c: 0x19, cls: 'dark' },
    { t: 'arccos', a: 'layer-cmd', c: 0x1A, cls: 'dark' },
    { t: 'arctg',  a: 'layer-cmd', c: 0x1B, cls: 'dark' },

    { t: 'lg',     a: 'layer-cmd', c: 0x17, cls: 'dark' },
    { t: '10^x',   a: 'layer-cmd', c: 0x15, cls: 'dark' },
    { t: 'e^x',    a: 'layer-cmd', c: 0x16, cls: 'dark' },
    { t: 'x^y',    a: 'layer-cmd', c: 0x24, cls: 'dark' },
    { t: 'π',      a: 'layer-cmd', c: 0x20, cls: 'dark' },
    { t: '√',      a: 'layer-cmd', c: 0x21, cls: 'dark' },

    { t: 'x²',     a: 'layer-cmd', c: 0x22, cls: 'dark' },
    { t: '1/x',    a: 'layer-cmd', c: 0x23, cls: 'dark' },
    { t: 'F◯',     a: 'layer-cmd', c: 0x25, cls: 'dark' },
    { t: 'Вx',     a: 'layer-cmd', c: 0x0F, cls: 'dark' },
    { t: 'Cx',     a: 'layer-cmd', c: 0x0D, cls: 'dark' },
    { t: 'CF',     a: 'cf', cls: 'dark' },

    { t: 'ПРГ',    a: 'prg', cls: 'blue' },
    { t: 'АВТ',    a: 'aut', cls: 'blue' },
    { t: 'x<0',    a: 'layer-cmd', c: 0x5C, jump: 1, cls: 'dark' },
    { t: 'x=0',    a: 'layer-cmd', c: 0x5E, jump: 1, cls: 'dark' },
    { t: 'x≥0',    a: 'layer-cmd', c: 0x59, jump: 1, cls: 'dark' },
    { t: 'x≠0',    a: 'layer-cmd', c: 0x57, jump: 1, cls: 'dark' },

    { t: 'L0',     a: 'layer-cmd', c: 0x5D, jump: 1, cls: 'dark' },
    { t: 'L1',     a: 'layer-cmd', c: 0x5B, jump: 1, cls: 'dark' },
    { t: 'L2',     a: 'layer-cmd', c: 0x58, jump: 1, cls: 'dark' },
    { t: 'L3',     a: 'layer-cmd', c: 0x5A, jump: 1, cls: 'dark' },
    { t: 'В↑',     a: 'layer-cmd', c: 0x0E, cls: 'dark' },
    { t: 'F0',     a: 'ext0', cls: 'blue' }
  ];

  /* ---------- слой K ----------
     Сначала К-функции блока 0x26…0x3E (их у Б3-34 нет вовсе),
     затем косвенные команды с номером регистра. */
  var K = [
    { t: 'НОП',     a: 'layer-cmd', c: 0x54, cls: 'dark' },
    { t: '°→′',     a: 'layer-cmd', c: 0x26, cls: 'dark' },
    { t: '°→′″',    a: 'layer-cmd', c: 0x2A, cls: 'dark' },
    { t: '°←′',     a: 'layer-cmd', c: 0x33, cls: 'dark' },
    { t: '°←′″',    a: 'layer-cmd', c: 0x30, cls: 'dark' },
    { t: '|x|',     a: 'layer-cmd', c: 0x31, cls: 'dark' },

    { t: 'ЗН',      a: 'layer-cmd', c: 0x32, cls: 'dark' },
    { t: '[x]',     a: 'layer-cmd', c: 0x34, cls: 'dark' },
    { t: '{x}',     a: 'layer-cmd', c: 0x35, cls: 'dark' },
    { t: 'max',     a: 'layer-cmd', c: 0x36, cls: 'dark' },
    { t: 'AND',     a: 'layer-cmd', c: 0x37, cls: 'dark' },
    { t: 'OR',      a: 'layer-cmd', c: 0x38, cls: 'dark' },

    { t: 'XOR',     a: 'layer-cmd', c: 0x39, cls: 'dark' },
    { t: 'ИНВ',     a: 'layer-cmd', c: 0x3A, cls: 'dark' },
    { t: 'СЧ',      a: 'layer-cmd', c: 0x3B, cls: 'dark' },
    { t: 'Y→X',     a: 'layer-cmd', c: 0x3E, cls: 'dark' },
    { t: 'K −',     a: 'layer-cmd', c: 0x27, cls: 'dark' },
    { t: 'K ×',     a: 'layer-cmd', c: 0x28, cls: 'dark' },

    { t: 'БП R',    a: 'kcmd', k: 0x80, cls: 'dark' },
    { t: 'ПП R',    a: 'kcmd', k: 0xA0, cls: 'dark' },
    { t: 'x≠0 R',   a: 'kcmd', k: 0x70, cls: 'dark' },
    { t: 'x≥0 R',   a: 'kcmd', k: 0x90, cls: 'dark' },
    { t: 'x<0 R',   a: 'kcmd', k: 0xC0, cls: 'dark' },
    { t: 'x=0 R',   a: 'kcmd', k: 0xE0, cls: 'dark' },

    { t: 'x→П R',   a: 'kcmd', k: 0xB0, cls: 'dark' },
    { t: 'П→x R',   a: 'kcmd', k: 0xD0, cls: 'dark' }
  ];

  /* ---------- модели ---------- */
  global.MKUI_MODELS = global.MKUI_MODELS || {};

  global.MKUI_MODELS['mk-61'] = {
    id: 'mk-61',
    title: 'МК-61',
    model: 'МК-61',
    registers: 15,
    progLen: 105,
    hasK: true,
    addrHigh: true,
    addrHighFirst: 100,
    addrHighLast: 104,
    angle: 'deg',
    layers: { main: MAIN, f: F, k: K }
  };

  /* Та же машина, но с расширением памяти: 4 банка регистров,
     4 страницы программы, межбанковый доступ F0 40…4F / F0 60…6F.
     Раскладка и слои — ровно те же; отличается только ядро. */
  global.MKUI_MODELS['mk-61-ext'] = {
    id: 'mk-61-ext',
    title: 'МК-61 (расширенный)',
    model: 'МК-61 · расширенный',
    registers: 15,
    progLen: 105,
    hasK: true,
    addrHigh: true,
    addrHighFirst: 100,
    addrHighLast: 104,
    angle: 'deg',
    ext: true,
    layers: { main: MAIN, f: F, k: K }
  };

  /* ---------- параметры ядра из профиля ----------
     ui.js из mk-emulator создаёт ядро без параметров и потому получил бы
     умолчания без адресов выше 99. Здесь подставляем то, что описано
     в раскладке: 105 шагов, 15 регистров, K-функции, адреса -0…-4.
     Правка внешняя: сам ui.js остаётся дословной копией интерфейса 34-й. */
  if (global.MKCore && typeof global.MKCore.create === 'function') {
    var origCreate = global.MKCore.create;
    var wrap = function (opts) {
      var p = global.MKUI_MODELS['mk-61'];
      var o = {};
      var k;
      if (opts) { for (k in opts) { if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k]; } }
      if (p) {
        if (o.progLen === undefined) o.progLen = p.progLen;
        if (o.regCount === undefined) o.regCount = p.registers;
        if (o.hasK === undefined) o.hasK = p.hasK;
        if (o.addrHigh === undefined) o.addrHigh = p.addrHigh;
        if (o.addrHighFirst === undefined) o.addrHighFirst = p.addrHighFirst;
        if (o.addrHighLast === undefined) o.addrHighLast = p.addrHighLast;
        if (o.angle === undefined) o.angle = p.angle;
      }
      return origCreate.call(global.MKCore, o);
    };
    global.MKCore.create = wrap;
  }
}(typeof window !== 'undefined' ? window : this));
