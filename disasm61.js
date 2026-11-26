/* =========================================================
   pmk61 / disasm61.js
   Декодер листинга: массив шагов программы → строки для экрана.

   ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ

   ui.js уже умеет показывать листинг, но про префикс 0xF0 он не знает:
   для него любая ячейка — одна команда. Из-за этого двухбайтные команды
   расширения разъезжаются: второй байт показывается как самостоятельная
   команда, а все адреса после него сдвигаются на единицу.

   Декодер решает только эту задачу и ничего не исполняет. Ему не нужен
   ни DOM, ни ext61.js: если расширения на странице нет, F0 всё равно
   остаётся двухбайтной строкой, просто без человеческого названия.

   ГЛАВНОЕ ПРАВИЛО

   Размер строки определяется ПЕРВЫМ байтом:
     0xF0                     → 2 ячейки (префикс + второй байт)
     переход (isJumpCmd)      → 3 ячейки (команда + десятки + единицы)
     всё остальное            → 1 ячейка
   Адрес следующей строки = адрес текущей + размер. Поэтому нумерация
   никогда не сдвигается и команда не может «разорваться».

   Список переходов берётся у MKCore.isJumpCmd — это ЕДИНСТВЕННЫЙ
   источник истины, тот же, по которому исполняет ядро. Локальная копия
   ниже нужна только на случай, если core.js на странице не подключён.

   ПУСТОЙ ШАГ

   Пустой шаг — это NOP профиля (0x54 «К НОП» у МК-61), а НЕ 0x00:
   0x00 — обычная цифра 0 и в листинге должна выглядеть как команда «0».
   Именно на этом ломались прежние тесты: они заполняли память нулями
   и ждали, что декодер сочтёт её пустой.

   АДРЕС ПЕРЕХОДА

   Обычный адрес 00…99: десятки, затем единицы.
   Адрес 100…104 записывается как 0x0A («•») и цифра 0…4; на бумаге
   и на индикаторе он пишется «-0»…«-4», так его и показываем.

   ХВОСТ

   Если 0xF0 стоит в последней ячейке, второго байта в памяти нет —
   ядро берёт его по кругу с нулевого адреса (см. stepExt в ext61.js).
   Декодер делает так же, чтобы листинг не расходился с исполнением.
   ========================================================= */
(function (global) {
  'use strict';

  var PREFIX = 0xF0;

  /* Запасной список переходов: ровно те же коды, что в core.js,
     в функции isJumpCmd. Используется, только если ядра нет. */
  var JUMP_FALLBACK = {
    0x51: true, 0x53: true,
    0x57: true, 0x59: true, 0x5C: true, 0x5E: true,
    0x5D: true, 0x5B: true, 0x58: true, 0x5A: true
  };

  function hex2(n) {
    var s = (n & 0xFF).toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function core() {
    return global.MKCore || null;
  }

  function cmdName(code) {
    var MK = core();
    if (MK && typeof MK.cmdName === 'function') return MK.cmdName(code);
    return 'команда ' + hex2(code);
  }

  function codeStr(code) {
    var MK = core();
    if (MK && typeof MK.codeStr === 'function') return MK.codeStr(code);
    return hex2(code);
  }

  /* Двухбайтные команды расширения. Название берём у ext61.js,
     если он подключён; без него строка остаётся целой, просто без имени. */
  function extDescribe(second) {
    if (global.MKExt61 && typeof global.MKExt61.extName === 'function') {
      return global.MKExt61.extName(second);
    }
    return 'EXT ' + hex2(second);
  }

  function nopCode(opts) {
    if (opts && opts.nop !== undefined) return opts.nop & 0xFF;
    var MK = core();
    if (MK && MK.NOP !== undefined) return MK.NOP & 0xFF;
    return 0x54;
  }

  /* Переход занимает три ячейки: команда, десятки, единицы. */
  function isJump(code) {
    var MK = core();
    if (MK && typeof MK.isJumpCmd === 'function') return !!MK.isJumpCmd(code);
    return !!JUMP_FALLBACK[code & 0xFF];
  }

  /* 0x0A в первой ячейке адреса — «•», значит адрес выше 99: -0…-4. */
  function addrText(a, b) {
    if (a === 0x0A) return '-' + (b & 0x0F);
    if (a > 9 || b > 9) return '--';
    return pad2(a * 10 + b);
  }

  function limit(prog, opts) {
    if (!prog || typeof prog.length !== 'number') return -1;
    var len = prog.length;
    if (opts && typeof opts.length === 'number' && opts.length >= 0 && opts.length <= len) {
      len = opts.length | 0;
    }
    return len;
  }

  /* rows(prog, {length, nop}) → [{addr, len, bytes, code, text, kind, empty}]
     kind: 'ext' | 'jump' | 'cmd' | 'nop' */
  function rows(prog, opts) {
    var o = opts || {};
    var len = limit(prog, o);
    if (len < 0) return [];

    var nop = nopCode(o);
    var out = [];
    var i = 0;

    while (i < len) {
      var code = prog[i] & 0xFF;

      if (code === PREFIX) {
        var second = (len > 1) ? (prog[(i + 1) % len] & 0xFF) : 0;
        out.push({
          addr: i,
          len: 2,
          bytes: [PREFIX, second],
          code: 'F0 ' + hex2(second),
          text: extDescribe(second),
          kind: 'ext',
          empty: false
        });
        i += 2;
        continue;
      }

      if (isJump(code)) {
        var a = (len > 1) ? (prog[(i + 1) % len] & 0xFF) : nop;
        var b = (len > 2) ? (prog[(i + 2) % len] & 0xFF) : nop;
        out.push({
          addr: i,
          len: 3,
          bytes: [code, a, b],
          code: codeStr(code) + ' ' + hex2(a) + ' ' + hex2(b),
          text: cmdName(code) + ' → ' + addrText(a, b),
          kind: 'jump',
          empty: false
        });
        i += 3;
        continue;
      }

      if (code === nop) {
        out.push({
          addr: i,
          len: 1,
          bytes: [code],
          code: '',
          text: '—',
          kind: 'nop',
          empty: true
        });
        i += 1;
        continue;
      }

      out.push({
        addr: i,
        len: 1,
        bytes: [code],
        code: codeStr(code),
        text: cmdName(code),
        kind: 'cmd',
        empty: false
      });
      i += 1;
    }

    return out;
  }

  /* Сколько ячеек занимает программа по факту: конец последней непустой
     строки. Пустая программа даёт 0, а не 105. */
  function used(prog, opts) {
    var len = limit(prog, opts);
    if (len <= 0) return 0;
    var o = opts || {};
    var nop = nopCode(o);
    var end = 0;
    var i = 0;
    while (i < len) {
      var code = prog[i] & 0xFF;
      var size = (code === PREFIX) ? 2 : (isJump(code) ? 3 : 1);
      if (code !== nop) end = i + size;
      i += size;
    }
    return Math.min(end, len);
  }

  /* Текстовый вид всего листинга — для тестов и для копирования. */
  function text(prog, opts) {
    var list = rows(prog, opts);
    var lines = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      lines.push(pad2(r.addr) + '  ' + (r.code ? r.code + '  ' : '    ') + r.text);
    }
    return lines.join('\n');
  }

  global.MKDasm = {
    rows: rows,
    used: used,
    text: text,
    hex2: hex2,
    isJump: isJump,
    PREFIX: PREFIX
  };
})(typeof window !== 'undefined' ? window : this);
