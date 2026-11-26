/* =========================================================
   pmk61 / asm61.js
   Ассемблер: текст → ячейки программной памяти МК-61.

   ЗАЧЕМ

   disasm61.js умеет обратное: ячейки → строки листинга. Вместе они
   образуют замкнутый круг «собрал → разобрал → сравнил», и это главный
   способ проверки: если собранная строка после декодера выглядит так же,
   как исходная, значит команда описана верно.

   Никакого DOM, никакого исполнения. Только текст и числа — поэтому файл
   проверяется обычной страницей тестов, без калькулятора.

   СИНТАКСИС

     ; комментарий        до конца строки, # работает так же
     metka:               метка на текущий адрес (можно несколько подряд)
     +                    простая команда, один байт
     x→П 4                команда с номером регистра, один байт
     БП metka             переход: три ячейки — команда, десятки, единицы
     F0 41                расширение, два байта (префикс + второй байт)
     .3C                  байт напрямую по шестнадцатеричному коду
     42                   число из нескольких цифр — это несколько
                          команд-цифр подряд: 4 и 2 (правка v4)
     .page 1              дальше собирать на страницу 1 (правка v5)
     БП 100               адрес выше 99: первая ячейка «·», вторая цифра
     БП -3                то же самое, как адрес пишут на бумаге и на индикаторе

   ВАЖНО: одна строка — одна команда. «+ С/П» в одной строке не соберётся,
   это две команды и две строки. Исключение — многозначное число: «42»
   это ровно то же, что две строки «4» и «2».

   Имена команд — ровно те, что отдаёт MKCore.cmdName: язык ассемблера
   и язык листинга не могут разойтись. Тест «покрытие» перебирает все
   коды, которые ядро умеет называть, собирает каждое имя и проверяет,
   что получился тот же код.

   РЕГИСТР БУКВ

   Латиница и кириллица приводятся к верхнему регистру, кроме греческой π
   (иначе она стала бы Π). Буква К и латинская K считаются одной и той же:
   ядро называет команды то так, то так, а человек набирает как удобно.

   АДРЕСА — ИЗ ПРОФИЛЯ, А НЕ СВОИ

   Правка v3 (25.11.2026): разбор адреса и его границы берутся из
   MKProfiles (parseAddr, addrHigh, addrHighFirst, addrHighLast), если
   профили подключены. Раньше здесь жило своё «n >= 100 → 0x0A, n - 100»
   и свой предел 104 — то же самое, но ОТДЕЛЬНОЙ копией. Копии расходятся:
   стоит профилю поменять формат «-0»…«-4», и листинг с ассемблером начнут
   понимать адрес по-разному. Теперь правило одно.

   Файл работает и БЕЗ profiles.js — тогда остаются прежние значения
   (104, сто первым адресом, 0x0A первой ячейкой), чтобы тесты и
   отдельное подключение не падали.

   ЧИСЛА ИЗ НЕСКОЛЬКИХ ЦИФР

   Правка v4 (25.11.2026): строка «42» раньше падала с «Неизвестная
   команда», потому что в таблице простых команд есть только одиночные
   цифры. А двузначные значения встречаются постоянно — 42 в X, 10, 25.
   Теперь такая строка разворачивается в столько команд-цифр, сколько
   в числе знаков, и адреса считаются по ним. Ввод руками на МК-61
   работает так же: две цифры — две ячейки.

   СТРАНИЦЫ

   Правка v5 (25.11.2026): директива «.page N» переключает, куда пишется
   дальнейший текст. Раньше любая собранная программа ложилась с нулевой
   ячейки, поэтому команда F0 21 (перейти на страницу 1) вела в пустоту —
   проверить страницы было нечем.

   Как считается адрес. Внутри страницы адрес снова начинается с 00, и
   ровно он записывается в ячейки перехода: на МК-61 адрес — это две
   цифры, 00…104, других не бывает. У страницы свой номер, а не общий
   адрес. Поэтому переход на метку с ДРУГОЙ страницы — ошибка сборки,
   а не тихо неверный код: попасть туда можно только командой F0 2n,
   и ассемблер об этом прямо и пишет.

   Метки по-прежнему числа, но теперь абсолютные (страница × pageSize +
   адрес). При одной странице это ровно прежние значения, поэтому старые
   тесты и примеры не меняются.

   Размер страницы и их число приходят опциями (pageSize, pages): сам
   ассемблер про ядро не знает и по умолчанию считает одну страницу
   в 105 ячеек. Промежутки между страницами заполняются НОП, чтобы
   исполнение не проваливалось в мусор.

   ДВА ПРОХОДА

   Первый: посчитать адреса и запомнить метки. Длина команды известна
   заранее — один байт, два у F0, три у перехода, поэтому считать можно,
   не зная адресов. Второй: подставить вместо имён чисел.

   Один проход тут не работает: метка может стоять НИЖЕ ссылки на неё,
   а в МК-61 переход вперёд — обычное дело (циклы, ветвления).

   ЧЕГО ФАЙЛ НЕ ДЕЛАЕТ

   Не загружает программу в ядро: это дело интерфейса, он берёт готовый
   массив cells и отдаёт core.setProgram(). И не решает, какая страница
   видна на экране, — это делает команда F0 2n во время исполнения.
   ========================================================= */
(function (global) {
  'use strict';

  var PREFIX = 0xF0;
  var MAX_ADDR = 104;

  /* Код клавиши «•» (0x0A) — первая ячейка адреса выше 99.
     Значение совпадает с таблицей кодов profiles.js. */
  var HIGH_CELL = 0x0A;

  /* Модель по умолчанию: её профиль задаёт формат адреса. */
  var DEFAULT_MODEL = 'mk-61';

  /* Размер страницы, если интерфейс не сказал свой. */
  var DEFAULT_PAGE_SIZE = 105;

  /* НОП — им заполняются промежутки между страницами. */
  var NOP = 0x54;

  /* Латиница и кириллица — в верхний регистр, греческая π не трогается:
     иначе она превратилась бы в Π. Минусы разных начертаний — к обычному. */
  function norm(s) {
    var t = String(s == null ? '' : s);
    t = t.replace(/[\u2212\u2013\u2014]/g, '-');
    t = t.replace(/[a-zа-яё]/g, function (ch) { return ch.toUpperCase(); });
    t = t.replace(/\s+/g, ' ');
    return t.replace(/^\s+|\s+$/g, '');
  }

  /* Ключ с латинской K и с кириллической К — одно и то же. */
  function lookup(table, key) {
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    var alt = key.replace(/^К/, 'K');
    if (alt !== key && Object.prototype.hasOwnProperty.call(table, alt)) return table[alt];
    alt = key.replace(/^K/, 'К');
    if (alt !== key && Object.prototype.hasOwnProperty.call(table, alt)) return table[alt];
    if (Object.prototype.hasOwnProperty.call(table, key.toUpperCase())) {
      return table[key.toUpperCase()];
    }
    return undefined;
  }

  /* ---------- профиль (если подключён) ---------- */

  function profileOf(model) {
    var P = global.MKProfiles;
    if (!P || typeof P.get !== 'function') return null;
    return P.get(model || DEFAULT_MODEL) || null;
  }

  /* Последний допустимый адрес: у профиля свой, иначе 104. */
  function maxAddrOf(p, o) {
    if (typeof o.maxAddr === 'number') return o.maxAddr;
    if (p && typeof p.addrHighLast === 'number') return p.addrHighLast;
    return MAX_ADDR;
  }

  /* Разбор адреса из текста: «05», «100», «-3». Сначала — профиль,
     он же решает, разрешены ли адреса выше 99 у этой модели. */
  function parseAddress(t, p, model) {
    var P = global.MKProfiles;
    if (P && typeof P.parseAddr === 'function') {
      var v = P.parseAddr(t, model || DEFAULT_MODEL);
      if (typeof v === 'number' && v >= 0) return v;
    }
    if (/^\d+$/.test(t)) {
      var n = parseInt(t, 10);
      return isFinite(n) ? n : -1;
    }
    /* профилей нет — понимаем только «-0»…«-4» по прежним правилам */
    if (/^-\d$/.test(t)) {
      var hi = 100 + parseInt(t.charAt(1), 10);
      return hi <= MAX_ADDR ? hi : -1;
    }
    return -1;
  }

  /* Адрес → две ячейки. У МК-61 адрес 100…104 пишется «•» + цифра,
     обычный 00…99 — десятки и единицы. Границы берутся у профиля. */
  function addrCells(n, p) {
    var first = (p && typeof p.addrHighFirst === 'number') ? p.addrHighFirst : 100;
    var high = p ? !!p.addrHigh : true;
    if (high && n >= first) {
      var d = n - first;
      if (d > 9) return null;
      return [HIGH_CELL, d];
    }
    return [Math.floor(n / 10), n % 10];
  }

  function stripComment(s) {
    var i = s.indexOf(';');
    var j = s.indexOf('#');
    var k = -1;
    if (i >= 0) k = i;
    if (j >= 0 && (k < 0 || j < k)) k = j;
    return k < 0 ? s : s.slice(0, k);
  }

  /* ---------- таблицы ----------
     Простые команды: ровно по одному байту, аргумента нет.
     Ключи записаны уже нормализованными (буквы в верхнем регистре). */
  var SIMPLE = {
    '0': 0x00, '1': 0x01, '2': 0x02, '3': 0x03, '4': 0x04,
    '5': 0x05, '6': 0x06, '7': 0x07, '8': 0x08, '9': 0x09,
    '·': 0x0A, '•': 0x0A, '.': 0x0A,
    '/-/': 0x0B, 'ВП': 0x0C, 'CX': 0x0D, 'В↑': 0x0E, 'ВX': 0x0F, 'ВХ': 0x0F,
    '+': 0x10, '-': 0x11, '*': 0x12, '×': 0x12, '/': 0x13, '÷': 0x13, '↔': 0x14,
    '10^X': 0x15, 'E^X': 0x16, 'LG': 0x17, 'LN': 0x18,
    'ARCSIN': 0x19, 'ARCCOS': 0x1A, 'ARCTG': 0x1B,
    'SIN': 0x1C, 'COS': 0x1D, 'TG': 0x1E,
    'π': 0x20, '√': 0x21, 'X²': 0x22, 'X^2': 0x22, '1/X': 0x23, 'X^Y': 0x24,
    'F◯': 0x25,
    'K °→′': 0x26,
    /* К-арифметика: те же операции, но с аргументом из памяти */
    'K -': 0x27, 'K *': 0x28, 'K ×': 0x28, 'K /': 0x29, 'K ÷': 0x29,
    'K °→′″': 0x2A, 'K °←′″': 0x30, 'K °←′': 0x33,
    'K ЗН': 0x32, 'K |X|': 0x31, 'K [X]': 0x34, 'K {X}': 0x35, 'K MAX': 0x36,
    'K AND': 0x37, 'K OR': 0x38, 'K XOR': 0x39, 'K ИНВ': 0x3A,
    'K СЧ': 0x3B, 'ОШИБКА': 0x3C, 'K °→"': 0x3D, 'K °→′″ (ДУБЛЬ)': 0x3D,
    'Y→X': 0x3E,
    'С/П': 0x50, 'В/О': 0x52, 'К НОП': 0x54, 'НОП': 0x54,
    'К 1': 0x55, 'К 2': 0x56
  };

  /* Команды с номером регистра в младшей цифре кода. */
  var RANGE = {
    'X→П': 0x40, 'П→X': 0x60,
    'K X≠0': 0x70, 'K БП': 0x80, 'K X≥0': 0x90, 'K ПП': 0xA0,
    'K X→П': 0xB0, 'K X<0': 0xC0, 'K П→X': 0xD0, 'K X=0': 0xE0
  };

  /* Переходы: три ячейки, после кода идут десятки и единицы адреса. */
  var JUMPS = {
    'БП': 0x51, 'ПП': 0x53,
    'F X≠0': 0x57, 'F X≥0': 0x59, 'F X<0': 0x5C, 'F X=0': 0x5E,
    'F L0': 0x5D, 'F L1': 0x5B, 'F L2': 0x58, 'F L3': 0x5A
  };

  /* Номера регистров: цифры и буквы a…e. Цифра F в коде тоже означает R0,
     но в тексте её писать не нужно — «x→П 0» собирается в 0x40. */
  var REGS = {
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
    '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'A': 10, 'B': 11, 'C': 12, 'D': 13, 'E': 14
  };

  function regIndex(tok) {
    if (tok === undefined || tok === null) return -1;
    var t = norm(tok);
    if (Object.prototype.hasOwnProperty.call(REGS, t)) return REGS[t];
    return -1;
  }

  function itemLen(it) {
    if (it.type === 'ext') return 2;
    if (it.type === 'jump') return 3;
    return 1;
  }

  /* Разбор одной команды (без меток и комментариев). */
  function parseCmd(text) {
    var t = norm(text);
    if (!t) return null;

    /* Правка v5: «F0» без второго байта раньше молча превращался
       в две нулевые ячейки, то есть в две команды «0». Программа
       собиралась «успешно» и делала совсем не то. Теперь это ошибка. */
    if (t === 'F0') {
      return { type: 'err', msg: 'F0 без второго байта — нужна строка вида «F0 01»' };
    }

    var m = /^F0 ([0-9A-F]{2})$/.exec(t);
    if (m) return { type: 'ext', bytes: [PREFIX, parseInt(m[1], 16)] };

    m = /^\.([0-9A-F]{2})$/.exec(t);
    if (m) return { type: 'byte', bytes: [parseInt(m[1], 16)] };

    var simple = lookup(SIMPLE, t);
    if (typeof simple === 'number') {
      return { type: 'byte', bytes: [simple] };
    }

    var sp = t.lastIndexOf(' ');
    if (sp > 0) {
      var name = t.slice(0, sp);
      var arg = t.slice(sp + 1);

      var rangeBase = lookup(RANGE, name);
      if (typeof rangeBase === 'number') {
        var r = regIndex(arg);
        if (r < 0) return { type: 'err', msg: 'Неверный номер регистра: ' + arg };
        return { type: 'byte', bytes: [rangeBase | r] };
      }

      var jumpCode = lookup(JUMPS, name);
      if (typeof jumpCode === 'number') {
        return { type: 'jump', code: jumpCode, target: norm(arg) };
      }
    }

    return { type: 'err', msg: 'Неизвестная команда: ' + text.trim() };
  }

  /* ---------- сборка ----------
     assemble(src, {model, maxAddr, maxCells, pageSize, pages}) →
       {ok, cells, labels, errors, count}

     model    — модель из profiles.js: от неё зависят формат и границы адреса.
     pageSize — ячеек на страницу (по умолчанию 105);
     pages    — сколько страниц разрешено (по умолчанию 1, страницы — ext61).

     errors — массив {line, msg}; строка приведена, чтобы человек нашёл её
     в своём тексте. При ошибке cells всё равно отдаётся, но доверять
     адресам в нём нельзя: длина неверной строки неизвестна. */
  function assemble(src, opts) {
    var o = opts || {};
    var model = o.model || DEFAULT_MODEL;
    var p = profileOf(model);
    var maxAddr = maxAddrOf(p, o);
    var maxCells = typeof o.maxCells === 'number' ? o.maxCells : 0;
    var pageSize = (o.pageSize > 0) ? Math.round(o.pageSize) : DEFAULT_PAGE_SIZE;
    var pages = (o.pages > 0) ? Math.round(o.pages) : 1;

    var lines = String(src == null ? '' : src).split(/\r?\n/);
    var items = [];
    var labels = {};
    var errors = [];
    var page = 0;            /* текущая страница сборки */
    var addr = 0;            /* адрес ВНУТРИ страницы, снова с нуля */
    var overflowLine = 0;    /* первая строка, вылезшая за память */

    function absAt(pg, a) { return pg * pageSize + a; }

    for (var li = 0; li < lines.length; li++) {
      var raw = lines[li];
      var body = stripComment(raw);
      if (!body || !body.replace(/\s+/g, '')) continue;

      /* метки: их может быть несколько подряд перед командой */
      var guard = 0;
      var m;
      while (guard++ < 20 && (m = /^\s*([^\s:]+)\s*:\s*([\s\S]*)$/.exec(body))) {
        var name = norm(m[1]);
        if (!name) {
          errors.push({ line: li + 1, msg: 'Пустое имя метки' });
        } else if (/^\d+$/.test(name)) {
          errors.push({ line: li + 1, msg: 'Метка не может быть числом: ' + m[1] });
        } else if (Object.prototype.hasOwnProperty.call(labels, name)) {
          errors.push({ line: li + 1, msg: 'Метка уже определена: ' + name });
        } else {
          /* абсолютный адрес: страница + адрес внутри неё */
          labels[name] = absAt(page, addr);
        }
        body = m[2];
      }

      if (!body || !body.trim()) continue;

      var normBody = norm(body);

      /* СТРАНИЦА (правка v5): «.page 1» — дальше собирать на страницу 1.
         Адрес внутри страницы начинается заново с 00, потому что именно
         его пишут в ячейки перехода: у МК-61 адрес — две цифры, 00…104. */
      var pageDir = /^\.PAGE (\d+)$/.exec(normBody);
      if (pageDir) {
        var pn = parseInt(pageDir[1], 10);
        if (pages <= 1) {
          errors.push({ line: li + 1, msg: 'Страницы доступны только в режиме расширения (нужен ext61)' });
        } else if (!(pn >= 0 && pn < pages)) {
          errors.push({ line: li + 1, msg: 'Страница ' + pn + ' вне предела 0…' + (pages - 1) });
        } else {
          page = pn;
          addr = 0;
        }
        continue;
      }

      /* ЧИСЛО ИЗ НЕСКОЛЬКИХ ЦИФР (правка v4): «42» — это две команды,
         4 и 2, ровно как если бы их набрали клавишами. Раньше строка
         падала с «Неизвестная команда: 42», хотя двузначные значения
         в программах — обычное дело. */
      var digitRun = /^\d+$/.exec(normBody);
      if (digitRun && digitRun[0].length > 1) {
        var run = digitRun[0];
        for (var di = 0; di < run.length; di++) {
          items.push({
            type: 'byte',
            bytes: [parseInt(run.charAt(di), 10)],
            line: li + 1,
            page: page,
            addr: addr
          });
          addr += 1;
        }
        continue;
      }

      var item = parseCmd(body);
      if (!item) continue;
      if (item.type === 'err') {
        errors.push({ line: li + 1, msg: item.msg });
        continue;
      }
      item.line = li + 1;
      item.page = page;
      item.addr = addr;
      addr += itemLen(item);
      items.push(item);
    }

    /* Ячейки пишутся по АБСОЛЮТНОМУ адресу: между страницами остаются
       промежутки, и заполняются они НОП, а не мусором. */
    var cells = [];

    function put(n, byte, ln) {
      if (maxCells && n >= maxCells && !overflowLine) overflowLine = ln;
      if (n < cells.length && cells[n] !== undefined) {
        errors.push({ line: ln, msg: 'Адрес ' + n + ' уже занят — страницы перекрываются' });
        return;
      }
      cells[n] = byte;
    }

    function putAt(it, off, byte) {
      put(absAt(it.page, it.addr + off), byte, it.line);
    }

    for (var i = 0; i < items.length; i++) {
      var it = items[i];

      if (it.type === 'byte' || it.type === 'ext') {
        for (var b = 0; b < it.bytes.length; b++) putAt(it, b, it.bytes[b]);
        continue;
      }

      /* переход: метка или адрес числом («05», «100», «-3») */
      var target = it.target;
      var n = null;   /* ЛОКАЛЬНЫЙ адрес на странице команды */

      if (Object.prototype.hasOwnProperty.call(labels, target)) {
        var abs = labels[target];
        var tpage = Math.floor(abs / pageSize);
        if (tpage !== it.page) {
          errors.push({
            line: it.line,
            msg: 'Переход между страницами: метка «' + target + '» на странице ' + tpage +
                 ', а команда — на ' + it.page + '. Нужна команда F0 2' + tpage
          });
        } else {
          n = abs - tpage * pageSize;
        }
      } else {
        var parsed = parseAddress(target, p, model);
        if (parsed >= 0) {
          n = parsed;
        } else {
          errors.push({ line: it.line, msg: 'Неизвестная метка или адрес: ' + target });
        }
      }

      if (n !== null && (n < 0 || n > maxAddr)) {
        errors.push({ line: it.line, msg: 'Адрес ' + n + ' вне предела 0…' + maxAddr });
        n = null;
      }

      var pair = null;
      if (n !== null) {
        pair = addrCells(n, p);
        if (!pair) {
          errors.push({ line: it.line, msg: 'Адрес ' + n + ' не записывается двумя ячейками' });
          n = null;
        }
      }

      putAt(it, 0, it.code);
      if (!pair) {
        putAt(it, 1, 0x00);
        putAt(it, 2, 0x00);
      } else {
        putAt(it, 1, pair[0]);
        putAt(it, 2, pair[1]);
      }
    }

    /* промежутки между страницами — НОП: исполнение не должно
       проваливаться в неинициализированную память */
    var count = cells.length;
    var out = new Array(count);
    for (var k = 0; k < count; k++) {
      out[k] = (cells[k] === undefined) ? NOP : (cells[k] & 0xFF);
    }

    if (maxCells && count > maxCells) {
      errors.push({
        line: overflowLine || 0,
        msg: 'Программа занимает ' + count + ' ячеек, а помещается ' + maxCells
      });
    }

    return {
      ok: errors.length === 0,
      cells: out,
      labels: labels,
      errors: errors,
      count: count,
      pages: pages,
      pageSize: pageSize
    };
  }

  /* Одна строка без меток — для быстрых проверок и подсказок. */
  function line(text, opts) {
    var r = assemble(text, opts || {});
    if (!r.ok) return { ok: false, cells: [], error: r.errors[0] ? r.errors[0].msg : 'ошибка' };
    return { ok: true, cells: r.cells, error: '' };
  }

  /* Готовый массив для core.setProgram: длина памяти, пустые шаги — NOP. */
  function toProgram(cells, opts) {
    var o = opts || {};
    var len = o.len > 0 ? Math.round(o.len) : DEFAULT_PAGE_SIZE;
    var nop = typeof o.nop === 'number' ? (o.nop & 0xFF) : NOP;
    var out = new Array(len);
    for (var i = 0; i < len; i++) out[i] = nop;
    if (Array.isArray(cells)) {
      for (var j = 0; j < cells.length && j < len; j++) {
        var c = cells[j];
        if (typeof c === 'number' && isFinite(c)) out[j] = Math.max(0, Math.min(255, Math.round(c)));
      }
    }
    return out;
  }

  global.MKAsm = {
    assemble: assemble,
    line: line,
    toProgram: toProgram,
    norm: norm,
    regIndex: regIndex,
    parseAddress: parseAddress,
    profileOf: profileOf,
    tables: { simple: SIMPLE, range: RANGE, jumps: JUMPS },
    PREFIX: PREFIX,
    MAX_ADDR: MAX_ADDR,
    DEFAULT_MODEL: DEFAULT_MODEL,
    DEFAULT_PAGE_SIZE: DEFAULT_PAGE_SIZE,
    NOP: NOP
  };
})(typeof window !== 'undefined' ? window : this);
