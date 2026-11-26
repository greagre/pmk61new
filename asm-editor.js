/* =========================================================
   pmk61 / asm-editor.js
   Панель ассемблера на вкладке «Код».

   ЗАЧЕМ

   asm61.js умеет превратить текст в ячейки, но в интерфейсе это было
   недоступно: программу можно было набрать только клавишами, команда
   за командой. Панель даёт поле текста, кнопку сборки и список ошибок
   с номерами строк, а по успеху кладёт готовую память через
   MKUI.loadProgram.

   ГДЕ ЖИВЁТ

   Панель вставляется ПЕРЕД #prog, а не внутрь него: renderProgram()
   из ui.js чистит #prog через innerHTML = '', и всё, что положено внутрь,
   исчезло бы при первой же перерисовке. Тот же приём, что у панели банков
   в ext61-ui.js.

   ЧИСТАЯ ЧАСТЬ

   buildProgram, trimTrailingNop, memoryLength, memoryUsed, errorLines
   и matchExample не трогают DOM и проверяются страницей tests-editor.html —
   без калькулятора и без клавиатуры. Порядок работы у нас такой:
   сначала тесты, потом интерфейс.

   ДЛИНА ПАМЯТИ

   Берётся у ядра: core.PROG_LEN умножить на число страниц расширения.
   У обычной МК-61 это 105, у ext61 — 420. Своё «420» здесь не живёт:
   иначе редактор и ядро разойдутся ровно так же, как когда-то разошёлся
   адрес перехода.

   ЧЕГО ПАНЕЛЬ НЕ ДЕЛАЕТ

   Не исполняет программу и не проверяет её логику: собрала, положила
   в память, дальше «Пуск» и «Шаг» из ui.js. И не хранит ничего, кроме
   текста: сам текст в localStorage, программы — в библиотеке.

   ПРАВКА v2 (25.11.2026)

   Пример был несамодостаточным: первая команда X→П 0 брала счётчик
   из текущего X, а там после прошлых опытов оставалось что угодно
   (например −3999) — цикл F L0 уходил в 20 000 шагов и «ЕГГОГ» вместо
   ответа. Теперь пример сам кладёт 7 в X первой строкой, поэтому
   «Собрать и загрузить» → «Пуск» даёт 5040 без всякой подготовки.

   ПРАВКА v3 (25.11.2026)

   Один пример стал списком: факториал, номер страницы, следующий адрес,
   раздельность банков и межбанковый доступ. Каждый пример несёт строку
   «ожидается …» — она видна под кнопками, чтобы результат было с чем
   сравнить, а не гадать, что должно было выйти. Пример сразу грузится
   в память: от выбора до «Пуск» одно нажатие. Программы с F0 работают
   только в режиме расширения; на обычной МК-61 ядро справедливо ругнётся
   на префикс, и панель заранее пишет «нужен режим расширения».

   ПРАВКА v4 (25.11.2026)

   Две поправки в примерах, обе вылезли на живых прогонах.

   Первая: межбанковый пример писал «42» одной строкой, а ассемблер
   той версии понимал только одиночные цифры — сборка падала с
   «Неизвестная команда: 42». В asm61 v4 такая строка разворачивается
   в две команды-цифры, но пример всё равно переписан на «4» и «2»
   отдельными строками: так он собирается и на старой версии ассемблера,
   и адреса видно глазами — две ячейки на число.

   Вторая: у примера «следующий адрес» ожидание было «X = 2» — неверно.
   F0 11 кладёт адрес, идущий ЗА командой, а команда стоит на 02 и
   занимает две ячейки (02 и 03). Значит ответ 4, а Y = 0 — это адрес
   самой F0 10 на 00. Прогон дал именно X = 4, Y = 0, то есть эмулятор
   был прав, а строка «ожидается» врала.

   ПРАВКА v5 (25.11.2026)

   Примеры страниц. Ассемблер v5 понимает «.page N», и стало можно
   проверить главное, что до сих пор не проверялось: что код, собранный
   на страницу 1, реально оттуда исполняется. Прежние пять примеров
   оставлены как есть — набор только дополняется, чтобы в конце прогнать
   всё подряд и не потерять уже закрытые случаи.

   Панель теперь передаёт ассемблеру размер страницы и их число от ядра,
   а не свои числа: у обычной МК-61 страница одна, у ext61 — четыре,
   и расходиться этим значениям нельзя.

   ПРАВКА v6 (25.11.2026) — как считать «занято» при нескольких страницах

   Прогон примера «Страница 1» показал «занято 109 из 420», хотя в двух
   страницах лежало 6 и 4 ячейки. Причина: trimTrailingNop считался по
   всему массиву, а между страницами лежит хвост НОП первой страницы —
   он и попадал в счёт.

   Теперь «занято» считается постранично, а страницы задействованные
   считаются отдельно: до последней страницы, где есть хоть одна
   непустая ячейка. При одной странице оба числа совпадают с прежними,
   поэтому уже закрытые примеры и тесты не меняются.

   Сама загрузка в память осталась прежней: панель отдаёт 420 ячеек
   в MKUI.loadProgram, а ext61 сам режет их по страницам. Знать
   про страницы редактору не нужно — это забота расширения.

   ПРАВКА v7 (25.11.2026) — название кнопки и строка «ожидается»

   Две вещи, обе всплыли на вопросе «а что вообще делает «Проверить»?».

   Первая: кнопка называется «Проверить сборку». Прежнее «Проверить»
   читалось как «проверить, правильно ли считает программа», хотя панель
   не исполняет код и результатов не сверяет — она только собирает текст
   и показывает ошибки, не трогая память. Однозначное имя снимает
   недоразумение: рядом есть «Собрать и загрузить», а разница между
   кнопками ровно в загрузке.

   Вторая: строка «Ожидается» больше не врёт на старте. Раньше текст
   восстанавливался из localStorage (последняя программа), а список
   стоял на первом примере — и над программой страницы 1 висело
   «Ожидается: X = 5040» от факториала. Теперь список сам встаёт
   на тот пример, чей текст лежит в поле, а для своего текста есть
   отдельный пункт «— свой текст —» и честная строка «Ожидается: —».
   Сравнение текста вынесено в чистую функцию matchExample и покрыто
   тестами.

   ПРАВКА v8 (25.11.2026) — «Занято» не живёт отдельно от текста

   На живом экране вышло так: в поле четыре строки, которые заведомо
   собираются в четыре ячейки, а под кнопками висит «Занято 0 из 420» —
   остаток от прошлой сборки или от очистки поля. Число было честным
   для прошлого текста и ложным для нынешнего, но прочитать это было
   нельзя: строка выглядела как «программа пустая».

   Теперь любое изменение текста гасит прошлый результат: вместо числа
   пишется «Занято — текст изменён, нажми «Проверить сборку»», а список
   ошибок прошлой сборки убирается — он тоже относился к другому тексту.
   Число и ошибки снова появляются после сборки, то есть всегда
   относятся к тому, что сейчас в поле.

   Пустое поле — пустая строка, без подсказки: там и правда нечего
   считать.

   ПРАВКА v9 (25.11.2026) — «Очистить всё» и видимая память

   Живой экран показал путаницу, которая кнопкой не лечилась: поле
   пустое, а два листинга ниже («Программа · Из текста» и «Листинг
   расширения») показывают прежнюю программу на 13 ячеек. Кнопка
   «Очистить поле» чистила ТОЛЬКО текст — так она и была написана,
   и в v7/v8 её поведение не менялось, — а листинги читают ПАМЯТЬ
   калькулятора. Отсюда «нажимаю очистить, а надписи не пропадают»
   и «меняется только после «Собрать и загрузить»».

   Две поправки:

   1. Кнопка называется «Очистить всё» и после очистки поля сразу
      собирает пустой текст и грузит его в память. Пустой текст — это
      420 НОП, то есть честная очистка памяти: оба листинга пустеют,
      и ожидание «нажал — стало пусто» выполняется.
   2. Строка состояния теперь говорит, что лежит в памяти: «в памяти
      N яч.». Без этого пустое поле рядом с непустым листингом читается
      как поломка, хотя это разные места — текст и память.

   Кому нужна очистка ТОЛЬКО текста, с сохранением программы в памяти:
   выделить всё в поле и стереть клавишей — память при этом не трогается.

   ПРАВКА v10 (25.11.2026) — «Пример» больше не грузит, кнопка не «залипает»

   Два наблюдения с живого экрана, оба верны.

   Первое: кнопка «Пример» сразу клала программу в память (так было
   с v3). Из-за этого «Собрать и загрузить» после примера уже ничего
   не меняла — код калькулятора появлялся ещё до неё, и кнопка выглядела
   бесполезной. Порядок возвращён к прежнему, понятному: пример только
   вставляет текст и показывает, что он собирается и сколько займёт
   ячеек; в память программа попадает ровно по нажатию «Собрать
   и загрузить».

   Второе: у главной кнопки была постоянная синяя заливка (класс main),
   и она читалась как «всегда нажата» — тем более что телефон после тапа
   оставляет рамку фокуса. Заливка убрана: акцент остался в цвете рамки
   и весе шрифта, а фокус после нажатия снимается.

   Ни одна строка сборки и подсчёта при этом не изменилась: правка
   целиком в поведении кнопок, чистая часть та же, и её тесты не тронуты.

   ПРАВКА v11 (25.11.2026) — «Очистить текст» вместо «Очистить всё»

   Кнопка снова трогает только поле — как и называлась до v9. Причина
   разворота простая: очистка памяти одним нажатием без подтверждения
   стирает программу, которую человек только что набрал и ещё не сохранил
   в библиотеку. Один случайный тап по кнопке рядом с «Пример» — и работа
   пропала.

   Память и так чистится штатной кнопкой «Очистить память» на самом
   калькуляторе, рядом со «Сброс», — дублировать её в панели незачем.
   Так каждая кнопка делает ровно то, что написано на ней, и подпись
   не расходится с делом.

   После очистки поля строка состояния честно говорит, что память
   не тронута («в памяти N яч.»), а в подсказке внизу написано, где
   стирать память. Чистая часть не менялась, тесты те же — 33.

   ПРАВКА v12 (26.11.2026) — «Загрузить и сохранить» в список файлов

   Программа собиралась и попадала только в память калькулятора.
   Чтобы сохранить её в список на вкладке «Файлы», нужно было идти
   в окно «Программы» и жать «Сохранить текущую» — а он брал программу
   из core.ST.prog и НЕ знал исходного текста ассемблера. То есть
   вернуться к правке через месяц было нельзя: в библиотеке лежали
   только коды.

   Теперь рядом с «Собрать и загрузить» есть «Загрузить и сохранить»:
   собирает текст, кладёт программу в память И записывает её в список
   на вкладке «Файлы» вместе с исходным текстом (поле src). Такая запись
   в списке помечена «из ассемблера» и отличается от выгрузок МК-Алго.

   Имя записи берётся так: первая метка вида «имя:» в тексте, иначе
   «Из текста · ДД.ММ ЧЧ:ММ». Спрашивать окно на каждый тап не нужно —
   у метки в программе и так осмысленное имя, а если его нет, дата
   в имени не даст записям слипнуться в одну.

   Пишет она через MKSHELF.addProgram — ту же функцию, что и
   «Сохранить текущую», поэтому правила про занятое имя и замену
   одинаковой программы у обеих кнопок общие.

   Чистая часть не менялась: разбор имени в guessTitle — новая чистая
   функция, остальные тесты те же.
   ========================================================= */
(function (global) {
  'use strict';

  var TEXT_KEY = 'pmk61/asmsrc';
  var NOP = 0x54;
  var DEFAULT_LEN = 105;
  var CUSTOM = 'custom';

  /* ---------- чистая часть (проверяется tests-editor.html) ---------- */

  /* Настоящий объём программы: длина массива без хвоста пустых шагов.
     В памяти хвост забит NOP, и core.lastStep() его не различает,
     поэтому «занято» считаем здесь, по коду, а не по прогону. */
  function trimTrailingNop(prog, nop) {
    var empty = (typeof nop === 'number') ? (nop & 0xFF) : NOP;
    var n = Array.isArray(prog) ? prog.length : 0;
    while (n > 0 && ((prog[n - 1] & 0xFF) === empty)) n--;
    return n;
  }

  /* Сколько ячеек занято во всём массиве, если считать постранично.
     Одним trimTrailingNop по всему массиву считать нельзя: хвост НОП
     первой страницы попадёт в счёт, и выйдет «занято 109» там, где
     реально лежит 10 ячеек. */
  function usedPerPages(prog, pageSize) {
    var size = (pageSize > 0) ? Math.round(pageSize) : DEFAULT_LEN;
    if (!Array.isArray(prog)) return 0;
    var total = 0;
    for (var i = 0; i < prog.length; i += size) {
      total += trimTrailingNop(prog.slice(i, i + size));
    }
    return total;
  }

  /* Сколько страниц реально задействовано: номер последней непустой
     плюс один. Нужно для строки «страниц задействовано N». */
  function pagesUsed(prog, pageSize) {
    var size = (pageSize > 0) ? Math.round(pageSize) : DEFAULT_LEN;
    if (!Array.isArray(prog) || !prog.length) return 1;
    var last = 0;
    for (var i = 0; i < prog.length; i += size) {
      if (trimTrailingNop(prog.slice(i, i + size)) > 0) {
        last = Math.floor(i / size);
      }
    }
    return last + 1;
  }

  /* Ошибки из asm61 → строки для человека. Номер строки впереди,
     чтобы его можно было узнать в списке и перейти к тексту. */
  function errorLines(errors) {
    var out = [];
    if (!errors || !errors.length) return out;
    for (var i = 0; i < errors.length; i++) {
      var e = errors[i] || {};
      var head = (typeof e.line === 'number' && e.line > 0) ? ('строка ' + e.line + ': ') : '';
      out.push(head + (e.msg || 'ошибка'));
    }
    return out;
  }

  /* Сколько ячеек в памяти: PROG_LEN на число страниц расширения. */
  function memoryLength(core) {
    var len = (core && core.PROG_LEN > 0) ? core.PROG_LEN : DEFAULT_LEN;
    var pages = 1;
    if (core && core.ext && typeof core.ext.pagesCount === 'function') {
      var p = core.ext.pagesCount();
      if (p > 0) pages = p;
    }
    return len * pages;
  }

  /* Размер одной страницы и их число — тоже от ядра, а не свои. */
  function pageInfo(core) {
    var size = (core && core.PROG_LEN > 0) ? core.PROG_LEN : DEFAULT_LEN;
    var len = memoryLength(core);
    var pages = Math.max(1, Math.round(len / size));
    return { size: size, pages: pages, len: len };
  }

  /* Сколько ячеек лежит в ПАМЯТИ ядра прямо сейчас (null — если памяти
     ещё нет). Нужно строке состояния: она должна говорить, что листинги
     ниже показывают память, а не текст поля. Без этого пустое поле
     рядом с непустым листингом читается как «кнопка очистки сломалась». */
  function memoryUsed(core) {
    if (!core || !core.ST || !Array.isArray(core.ST.prog)) return null;
    var info = pageInfo(core);
    return usedPerPages(core.ST.prog, info.size);
  }

  /* Есть ли у текущего ядра расширение: по нему выбираются примеры с F0. */
  function hasExt(core) {
    return !!(core && core.ext);
  }

  /* Текст для сравнения: единые переводы строк, без хвостовых пробелов
     и без пустых строк по краям. Нужно, чтобы вставленный пример
     узнавался и после того, как браузер чуть иначе сохранил переводы
     строк, и чтобы случайный пробел в конце не сбивал список. */
  function normSrc(s) {
    return String(s == null ? '' : s)
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .trim();
  }

  /* Чей текст сейчас в поле: id примера или null, если текст свой.
     До v7 список стоял на первом примере всегда, и строка «Ожидается»
     показывала чужие числа. Сравнение вынесено сюда, в чистую часть,
     чтобы его можно было проверить тестом, а не глазами. */
  function matchExample(text, examples) {
    var list = (examples && examples.length) ? examples : EXAMPLES;
    var t = normSrc(text);
    if (!t) return null;
    for (var i = 0; i < list.length; i++) {
      if (normSrc(list[i].src) === t) return list[i].id;
    }
    return null;
  }

  /* Имя для записи в библиотеку (v12). Берём первую метку вида «имя:»
     из текста — это осмысленное название, которое человек и так написал
     в программе. Если метки нет, даём «Из текста · ДД.ММ ЧЧ:ММ»:
     без даты все безымянные сохранения слиплись бы в «Из текста (2)»,
     «Из текста (3)» и различить их было бы нельзя.

     Время передаётся аргументом, а не берётся из Date здесь: чистая
     функция должна давать одинаковый ответ на одинаковый вход — иначе
     её нельзя проверить тестом. */
  function guessTitle(text, now) {
    var src = String(text == null ? '' : text);
    var lines = src.replace(/\r\n?/g, '\n').split('\n');

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      /* Комментарий и пустая строка названием быть не могут. */
      var t = raw.replace(/;.*$/, '').replace(/#.*$/, '').trim();
      if (!t) continue;
      var cut = t.indexOf(':');
      if (cut <= 0) continue;
      var name = t.slice(0, cut).trim();
      /* Метка не может содержать пробел — иначе это просто строка
         с двоеточием, а не имя программы. */
      if (!name || /\s/.test(name)) continue;
      return name.length > 40 ? name.slice(0, 40) + '…' : name;
    }

    var d = (now instanceof Date) ? now : new Date();
    if (isNaN(d.getTime())) return 'Из текста';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'Из текста · ' + p(d.getDate()) + '.' + p(d.getMonth() + 1) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* Текст → программа, готовая для core.setProgram.
     Возвращает {ok, errors, cells, program, count, used, labels, pages}.
     При ошибке program пустой: загружать его нельзя — адреса в cells
     съехали, потому что длина неверной строки неизвестна. */
  function buildProgram(text, opts) {
    var o = opts || {};
    var asm = global.MKAsm;
    var info = pageInfo(o.core);
    var len = (o.len > 0) ? Math.round(o.len) : info.len;
    var pageSize = (o.pageSize > 0) ? Math.round(o.pageSize) : info.size;
    var pages = (o.pages > 0) ? Math.round(o.pages) : Math.max(1, Math.round(len / pageSize));

    var fail = {
      ok: false, errors: [], cells: [], program: [],
      count: 0, used: 0, pagesUsed: 0, labels: {}, pages: pages, pageSize: pageSize
    };

    if (!asm || typeof asm.assemble !== 'function') {
      fail.errors = ['Ассемблер asm61.js не подключён'];
      return fail;
    }

    var r = asm.assemble(text, {
      model: o.model,
      maxCells: len,
      pageSize: pageSize,
      pages: pages
    });
    if (!r.ok) {
      fail.errors = errorLines(r.errors);
      fail.cells = r.cells || [];
      fail.labels = r.labels || {};
      fail.count = r.count || 0;
      return fail;
    }

    var program = asm.toProgram(r.cells, { len: len });
    return {
      ok: true,
      errors: [],
      cells: r.cells,
      program: program,
      count: r.count,
      used: usedPerPages(program, pageSize),
      pagesUsed: pagesUsed(program, pageSize),
      labels: r.labels || {},
      pages: pages,
      pageSize: pageSize
    };
  }

  /* ---------- примеры ---------- */

  /* Первый пример — факториал: он проверяет ассемблер, память, переход
     F L0 и стек сразу, без всякого расширения. Остальные — по одной
     возможности ext61, чтобы сбой сразу показывал, что именно не так.
     Комментарии ассемблер вырезает, поэтому строка «ожидается» в тексте
     ни на сборку, ни на адреса не влияет.

     Набор только дополняется: пять нижних примеров уже проверены живыми
     прогонами, их не трогаем — чтобы в конце прогнать всё подряд. */
  var EXAMPLES = [
    {
      id: 'fact',
      name: '7! — факториал',
      expect: 'X = 5040',
      ext: false,
      src: [
        '; 7! — программа сама кладёт 7 в счётчик R0',
        '; ожидается X = 5040 после С/П',
        '7',
        'X→П 0',
        '1',
        'X→П 1',
        'loop:',
        'П→X 1',
        'П→X 0',
        '×',
        'X→П 1',
        'F L0 loop',
        'П→X 1',
        'С/П'
      ].join('\n')
    },
    {
      id: 'page',
      name: 'F0 24 — номер страницы',
      expect: 'X = 0',
      ext: true,
      src: [
        '; «страница → X»: доказательство, что ядро исполняет F0,',
        '; а не проглатывает префикс как НОП',
        '; ожидается X = 0 (текущая страница — нулевая)',
        'F0 24',
        'С/П'
      ].join('\n')
    },
    {
      id: 'addr',
      name: 'F0 11 — следующий адрес',
      expect: 'X = 4, Y = 0',
      ext: true,
      src: [
        '; F0 10 — «адрес этой команды → X», F0 11 — «адрес следующей»',
        '; F0 10 стоит на 00 и даёт 0; F0 11 стоит на 02 и занимает 02-03,',
        '; поэтому следующий адрес — 04',
        '; ожидается X = 4, Y = 0',
        'F0 10',
        'F0 11',
        'С/П'
      ].join('\n')
    },
    {
      id: 'banks',
      name: 'Банки — раздельность',
      expect: 'X = 7',
      ext: true,
      src: [
        '; банк 0: R0 = 7, банк 1: R0 = 8, потом назад в банк 0',
        '; если банки не раздельны, выйдет 8',
        '; ожидается X = 7',
        '7',
        'X→П 0',
        'F0 01',
        '8',
        'X→П 0',
        'F0 00',
        'П→X 0',
        'С/П'
      ].join('\n')
    },
    {
      id: 'target',
      name: 'Межбанк — F0 40 / F0 60',
      expect: 'X = 42, R0 = 0',
      ext: true,
      src: [
        '; F0 05 берёт банк-адресат ИЗ X, поэтому 1 кладём первой',
        '; F0 40 — X→П R0 в банк-адресат, текущий банк не меняется',
        '; 42 набирается двумя строками, как двумя клавишами: 4 и 2',
        '; ожидается X = 42, R0 текущего банка = 0',
        '1',
        'F0 05',
        '4',
        '2',
        'F0 40',
        '0',
        'X→П 0',
        'F0 60',
        'С/П'
      ].join('\n')
    },
    {
      id: 'page1',
      name: 'Страница 1 — код оттуда исполняется',
      expect: 'X = 33',
      ext: true,
      src: [
        '; страница 0: 11 в R0, затем F0 21 — переход на страницу 1',
        '; страница 1: 33 в R0 и останов',
        '; если F0 21 не переключит страницу, исполнится С/П на 04',
        '; и в X останется 11 — поэтому ответ 33 однозначен',
        '; ожидается X = 33 (и R0 = 33)',
        '11',
        'X→П 0',
        'F0 21',
        'С/П',
        '.page 1',
        '33',
        'X→П 0',
        'С/П'
      ].join('\n')
    },
    {
      id: 'page2',
      name: 'Страница 2 — номер страницы в X',
      expect: 'X = 2',
      ext: true,
      src: [
        '; F0 22 уводит исполнение на страницу 2, где стоит только F0 24',
        '; F0 24 читает номер ТЕКУЩЕЙ страницы: должно выйти 2, не 0',
        '; ожидается X = 2',
        'F0 22',
        'С/П',
        '.page 2',
        'F0 24',
        'С/П'
      ].join('\n')
    }
  ];

  /* Совместимость: старое имя осталось, тесты и внешний код его знают. */
  var EXAMPLE = EXAMPLES[0].src;

  function findExample(id) {
    for (var i = 0; i < EXAMPLES.length; i++) {
      if (EXAMPLES[i].id === id) return EXAMPLES[i];
    }
    return EXAMPLES[0];
  }

  /* ---------- панель ---------- */

  var panel = null;
  var area = null;
  var out = null;
  var stat = null;
  var picker = null;
  var expectEl = null;

  function mk(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }

  function styleOnce() {
    if (document.getElementById('asmPanelStyle')) return;
    var s = document.createElement('style');
    s.id = 'asmPanelStyle';
    s.textContent = [
      '.asm-panel{margin:10px 0;padding:10px;border:1px solid rgba(127,127,127,.35);border-radius:10px;background:rgba(127,127,127,.07)}',
      '.asm-panel h3{margin:0 0 8px;font-size:14px;font-weight:600}',
      '.asm-panel textarea{width:100%;min-height:120px;box-sizing:border-box;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.45;padding:8px;border-radius:8px;border:1px solid rgba(127,127,127,.4);background:rgba(0,0,0,.06);color:inherit;resize:vertical}',
      '.asm-panel select{width:100%;box-sizing:border-box;margin-bottom:8px;padding:8px;border-radius:8px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font-size:13px}',
      '.asm-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}',
      '.asm-row button{padding:8px 12px;border-radius:8px;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit;font-size:13px;-webkit-tap-highlight-color:transparent}',
      '.asm-row button.main{font-weight:600;border-color:rgba(70,140,255,.6)}',
      '.asm-row button:focus:not(:focus-visible){outline:none}',
      '.asm-stat{margin-top:8px;font-size:12px;opacity:.85}',
      '.asm-stat.ok{color:#1a8c4a}',
      '.asm-stat.err{color:#c0392b}',
      '.asm-expect{margin-top:6px;font-size:12px;font-weight:600}',
      '.asm-err{font-size:12px;padding:4px 6px;margin-top:4px;border-left:3px solid #c0392b;background:rgba(192,57,43,.08);cursor:pointer}',
      '.asm-tip{font-size:11px;opacity:.6;margin-top:6px}'
    ].join('');
    document.head.appendChild(s);
  }

  function loadText() {
    try {
      var t = localStorage.getItem(TEXT_KEY);
      if (t && area) area.value = t;
    } catch (e) { /* приватный режим — просто пустое поле */ }
  }

  function saveText() {
    try {
      if (area) localStorage.setItem(TEXT_KEY, area.value);
    } catch (e) { /* не сохранилось — не беда, текст остался на экране */ }
  }

  /* Перевести курсор на строку с ошибкой: список ошибок бесполезен,
     если по нему нельзя попасть в нужное место текста. */
  function focusLine(n) {
    if (!area || !(n > 0)) return;
    var lines = area.value.split('\n');
    var start = 0;
    for (var i = 0; i < n - 1 && i < lines.length; i++) start += lines[i].length + 1;
    var end = start + (lines[n - 1] ? lines[n - 1].length : 0);
    area.focus();
    try { area.setSelectionRange(start, end); } catch (e) {}
  }

  function renderResult(res) {
    if (!out || !stat) return;
    out.innerHTML = '';

    if (res.ok) {
      var labels = Object.keys(res.labels).length;
      stat.className = 'asm-stat ok';
      stat.textContent = 'Занято ' + res.used + ' из ' + res.program.length +
        (res.pagesUsed > 1 ? ' · страниц ' + res.pagesUsed : '') +
        (labels ? ' · меток ' + labels : '');
      return;
    }

    stat.className = 'asm-stat err';
    stat.textContent = 'Не собрано · ошибок: ' + res.errors.length;
    res.errors.forEach(function (msg) {
      var d = mk('div', 'asm-err', msg);
      var m = /^строка (\d+)/.exec(msg);
      if (m) d.addEventListener('click', function () { focusLine(parseInt(m[1], 10)); });
      out.appendChild(d);
    });
  }

  /* Текст изменился после последней сборки — прежнее «Занято N» относилось
     к другому тексту. Держать его на экране нельзя: «Занято 0 из 420»
     над программой из четырёх ячеек читается как «программа пустая»,
     хотя это число от прошлой сборки или от очистки поля.

     Поэтому при любом вводе число убирается, а вместе с ним и список
     ошибок прошлой сборки — он тоже был про другой текст. Настоящие
     число и ошибки появятся после сборки и всегда будут относиться
     к тому, что лежит в поле.

     Вторая половина строки (v9) говорит, что лежит В ПАМЯТИ: листинги
     ниже читают память, а не поле, и без этой подсказки пустое поле
     рядом с непустым листингом выглядит как поломка. */
  function renderDirty() {
    if (!stat) return;
    stat.className = 'asm-stat';
    var core = (global.MKUI && typeof global.MKUI.getCore === 'function') ? global.MKUI.getCore() : null;
    var mem = memoryUsed(core);
    var parts = [];
    if (area && area.value.trim()) parts.push('Занято — текст изменён, нажми «Проверить сборку»');
    if (mem !== null) parts.push('в памяти ' + mem + ' яч.');
    stat.textContent = parts.join(' · ');
    if (out) out.innerHTML = '';
  }

  /* Список следует за текстом: если в поле лежит текст одного из
     примеров — выбираем его, иначе «— свой текст —». Без этого на старте
     список стоял на первом пункте, а в поле был текст прошлого сеанса,
     и «Ожидается» показывало числа чужой программы. */
  function syncPickerToText() {
    if (!picker || !area) return;
    picker.value = matchExample(area.value) || CUSTOM;
  }

  /* Строка «ожидается» под кнопками: без неё прогон превращается
     в угадывание — сошлось или нет. Для своего текста честно пишем,
     что готового эталона нет. */
  function updateExpect() {
    if (!expectEl || !picker) return;
    if (picker.value === CUSTOM) {
      expectEl.textContent = 'Ожидается: — свой текст (сверься с комментариями в коде)';
      return;
    }
    var ex = findExample(picker.value);
    var core = (global.MKUI && typeof global.MKUI.getCore === 'function') ? global.MKUI.getCore() : null;
    var text = 'Ожидается: ' + ex.expect;
    if (ex.ext && core && !hasExt(core)) text += ' · нужен режим расширения';
    expectEl.textContent = text;
  }

  function hintText(msg) {
    if (global.MKUI && typeof global.MKUI.hint === 'function') global.MKUI.hint(msg);
  }

  function compile(andLoad) {
    if (!area) return null;
    var core = (global.MKUI && typeof global.MKUI.getCore === 'function') ? global.MKUI.getCore() : null;
    var info = pageInfo(core);
    var res = buildProgram(area.value, {
      len: info.len,
      pageSize: info.size,
      pages: info.pages
    });
    renderResult(res);
    saveText();
    syncPickerToText();
    updateExpect();

    if (res.ok && andLoad && global.MKUI && typeof global.MKUI.loadProgram === 'function') {
      /* Отдаём все 420 ячеек: ext61 сам режет их по страницам (v10). */
      global.MKUI.loadProgram(res.program, null, { title: 'Из текста' });
      if (res.used === 0) {
        /* Пустая программа — это и есть очистка памяти: 420 НОП. */
        hintText('Память очищена: все ' + res.program.length + ' ячеек пусты.');
      } else {
        var where = (res.pagesUsed > 1)
          ? 'страниц задействовано ' + res.pagesUsed
          : 'адрес 00';
        hintText('Занято ' + res.used + ' яч. · программа в памяти, ' + where + '. Жми «Пуск».');
      }
    }
    return res;
  }

  /* v12: собрать, загрузить в память И записать в список «Файлы».

     От «Собрать и загрузить» отличается ровно одним: после загрузки
     запись с исходным текстом попадает в библиотеку (pmk61/library),
     а значит появляется на вкладке «Файлы» вместе с исходником.
     Имя берётся из метки программы или из даты — см. guessTitle.

     Если сборка не удалась, сохранять нечего: в память ушёл бы мусор,
     а в библиотеке появилась бы запись с неверными адресами.
     Поэтому при ошибках кнопка просто показывает их, как «Проверить
     сборку», и пишет в подсказке, что сохранять не стала. */
  function compileAndSave() {
    if (!area) return null;
    var core = (global.MKUI && typeof global.MKUI.getCore === 'function') ? global.MKUI.getCore() : null;
    var info = pageInfo(core);
    var res = buildProgram(area.value, {
      len: info.len,
      pageSize: info.size,
      pages: info.pages
    });
    renderResult(res);
    saveText();
    syncPickerToText();
    updateExpect();

    if (!res.ok) {
      hintText('Не сохранено: в тексте ' + res.errors.length + ' ошибк(и) сборки — сначала исправь их.');
      return res;
    }
    if (res.used === 0) {
      hintText('Не сохранено: программа пустая.');
      return res;
    }

    /* Регистры в запись кладём текущие, если ядро их даёт: без них
       загруженная из списка программа запустится с пустыми регистрами,
       а многие программы ждут данных именно там. */
    var regs = {};
    try {
      if (core && core.ST && Array.isArray(core.ST.R) && global.MKCore && global.MKCore.REG_COUNT) {
        for (var i = 0; i < global.MKCore.REG_COUNT; i++) {
          if (core.ST.R[i]) regs[i] = core.ST.R[i];
        }
      }
    } catch (e) { regs = {}; }

    /* Загрузка в память — как у «Собрать и загрузить». */
    if (global.MKUI && typeof global.MKUI.loadProgram === 'function') {
      global.MKUI.loadProgram(res.program, null, { title: 'Из текста' });
    }

    var title = guessTitle(area.value, new Date());
    var put = null;
    if (global.MKSHELF && typeof global.MKSHELF.addProgram === 'function') {
      put = global.MKSHELF.addProgram({
        name: title,
        prog: res.program,
        data: regs,
        src: area.value,
        savedAt: Date.now()
      });
    }

    if (!put || !put.ok) {
      hintText('Программа в памяти, но в список не попала: библиотека недоступна.');
      return res;
    }

    if (global.MKUI && typeof global.MKUI.setProgMeta === 'function') {
      global.MKUI.setProgMeta({ num: put.num, title: put.name });
    }
    if (global.MKSHELF && typeof global.MKSHELF.render === 'function') {
      global.MKSHELF.render();
    }
    if (typeof global.MKSHELF.toast === 'function') {
      global.MKSHELF.toast(
        'Сохранено в список: «' + put.name + '» · ' +
        (global.MKSHELF.pad2 ? global.MKSHELF.pad2(put.num) : put.num) + '\n' +
        res.used + ' ячеек · открывается на вкладке «Файлы»' +
        (put.note ? '\n' + put.note : ''),
        'ok', 8000
      );
    }

    hintText('Собрано и сохранено: «' + put.name + '», ' + res.used +
      ' яч. Программа в памяти и в списке «Файлы».');
    return res;
  }

  /* Вставить выбранный пример в поле. В память он НЕ попадает: до v10
     эта кнопка сразу грузила программу, и «Собрать и загрузить» после
     неё уже ничего не меняла — код калькулятора появлялся внизу ещё
     до нажатия, и кнопка выглядела бесполезной. Порядок снова прежний:
     пример вставляет текст, память меняет только «Собрать и загрузить». */
  function insertExample() {
    if (!area || !picker) return null;
    var ex = findExample(picker.value === CUSTOM ? EXAMPLES[0].id : picker.value);
    area.value = ex.src;
    saveText();
    syncPickerToText();
    updateExpect();
    /* Собираем только для проверки: строка «Занято N из 420» говорит,
       что пример чистый и сколько займёт, а листинги ниже не меняются. */
    var res = compile(false);
    hintText('Пример «' + ex.name + '» вставлен в поле. Нажми «Собрать и загрузить», чтобы он попал в память.');
    return res;
  }

  function mount() {
    if (panel && panel.parentNode) return true;
    if (document.getElementById('asmPanel')) return true;

    var host = document.getElementById('prog');
    if (!host || !host.parentNode) return false;

    styleOnce();

    panel = mk('div', 'asm-panel');
    panel.id = 'asmPanel';
    panel.appendChild(mk('h3', null, 'Ассемблер: текст → память'));

    picker = document.createElement('select');
    picker.id = 'asmExample';
    for (var i = 0; i < EXAMPLES.length; i++) {
      var op = document.createElement('option');
      op.value = EXAMPLES[i].id;
      op.textContent = EXAMPLES[i].name;
      picker.appendChild(op);
    }
    var opCustom = document.createElement('option');
    opCustom.value = CUSTOM;
    opCustom.textContent = '— свой текст —';
    picker.appendChild(opCustom);

    picker.addEventListener('change', updateExpect);
    panel.appendChild(picker);

    area = document.createElement('textarea');
    area.id = 'asmSrc';
    area.spellcheck = false;
    area.placeholder = '7\nX→П 0\nБП 00\nС/П';
    area.addEventListener('input', function () {
      saveText();
      syncPickerToText();
      updateExpect();
      renderDirty();
    });
    panel.appendChild(area);

    var row = mk('div', 'asm-row');

    var bLoad = mk('button', 'main', 'Собрать и загрузить');
    bLoad.type = 'button';
    bLoad.title = 'Собрать текст и положить программу в память калькулятора';
    bLoad.addEventListener('click', function () {
      compile(true);
      this.blur();
    });
    row.appendChild(bLoad);

    /* v12: главная новая кнопка. Раньше, чтобы сохранить собранную
       программу в список «Файлы», надо было открыть окно «Программы»
       и нажать там «Сохранить текущую» — а она не знала исходного
       текста. Здесь и собираем, и грузим, и записываем вместе с текстом. */
    var bSave = mk('button', null, 'Загрузить и сохранить');
    bSave.type = 'button';
    bSave.title = 'Собрать текст, загрузить программу в память и сохранить её вместе с исходником в список «Файлы»';
    bSave.addEventListener('click', function () {
      compileAndSave();
      this.blur();
    });
    row.appendChild(bSave);

    /* Название говорит ровно то, что делает кнопка: собрать и проверить
       текст, НЕ загружая его в память. Прежнее «Проверить» читалось как
       «проверить результат программы», которого здесь нет. */
    var bCheck = mk('button', null, 'Проверить сборку');
    bCheck.type = 'button';
    bCheck.title = 'Собрать текст и показать ошибки, не трогая память калькулятора';
    bCheck.addEventListener('click', function () {
      compile(false);
      this.blur();
    });
    row.appendChild(bCheck);

    /* v10: только вставляет текст. Программа попадает в память
       по кнопке «Собрать и загрузить» — иначе та теряет смысл. */
    var bExample = mk('button', null, 'Пример');
    bExample.type = 'button';
    bExample.title = 'Вставить выбранный пример в поле (в память — по кнопке «Собрать и загрузить»)';
    bExample.addEventListener('click', function () {
      insertExample();
      this.blur();
    });
    row.appendChild(bExample);

    /* v11: чистит ТОЛЬКО текст — как и написано на кнопке.
       В v9 здесь стояло «Очистить всё»: кнопка стирала и память, причём
       одним нажатием без подтверждения. Случайный тап рядом с «Пример»
       уносил только что набранную программу, которой ещё нет в библиотеке.
       Память чистит штатная кнопка «Очистить память» на калькуляторе,
       поэтому дублировать её здесь незачем. */
    var bClear = mk('button', null, 'Очистить текст');
    bClear.type = 'button';
    bClear.title = 'Очистить только поле ввода; программа в памяти останется';
    bClear.addEventListener('click', function () {
      if (!area) return;
      area.value = '';
      saveText();
      syncPickerToText();
      updateExpect();
      renderDirty();
      area.focus();
      hintText('Поле очищено. Программа в памяти не тронута — стереть её можно кнопкой «Очистить память» на калькуляторе.');
      this.blur();
    });
    row.appendChild(bClear);

    panel.appendChild(row);

    expectEl = mk('div', 'asm-expect');
    panel.appendChild(expectEl);

    stat = mk('div', 'asm-stat');
    panel.appendChild(stat);

    out = mk('div', 'asm-errs');
    panel.appendChild(out);

    panel.appendChild(mk('div', 'asm-tip',
      'Одна строка — одна команда (число из цифр можно писать слитно: 42). ' +
      'Страница: .page 1. Метка: имя:. Адреса: 05, 100, -3. Комментарий: ; или #. ' +
      'Ошибки в списке кликабельны — курсор встанет на нужную строку. ' +
      '«Проверить сборку» память не трогает: текущая программа останется на месте. ' +
      '«Загрузить и сохранить» кладёт программу в память и в список «Файлы» ' +
      'вместе с исходным текстом — имя берётся из метки вида «имя:». ' +
      '«Пример» только вставляет текст — в память программа попадает по кнопке ' +
      '«Собрать и загрузить». «Очистить текст» трогает только поле; память стирает ' +
      'кнопка «Очистить память» на калькуляторе. Листинги ниже показывают ПАМЯТЬ ' +
      'калькулятора, а не текст поля.'));

    host.parentNode.insertBefore(panel, host);
    loadText();
    syncPickerToText();
    updateExpect();
    /* Текст восстановлен из прошлого сеанса, но собрали мы его не сейчас:
       показывать объём от чужой сборки нельзя, поэтому честная строка. */
    renderDirty();
    return true;
  }

  /* ui.js строит интерфейс при загрузке, поэтому ждём появления #prog.
     Если его нет вовсе (страница тестов, другое приложение) — молчим. */
  function auto() {
    if (mount()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (mount() || ++tries > 40) clearInterval(t);
    }, 100);
  }

  global.MKAsmEditor = {
    buildProgram: buildProgram,
    trimTrailingNop: trimTrailingNop,
    usedPerPages: usedPerPages,
    pagesUsed: pagesUsed,
    memoryLength: memoryLength,
    memoryUsed: memoryUsed,
    pageInfo: pageInfo,
    errorLines: errorLines,
    hasExt: hasExt,
    normSrc: normSrc,
    matchExample: matchExample,
    guessTitle: guessTitle,
    mount: mount,
    compile: compile,
    compileAndSave: compileAndSave,
    insertExample: insertExample,
    example: EXAMPLE,
    examples: EXAMPLES,
    NOP: NOP,
    CUSTOM: CUSTOM
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
    else auto();
  }
})(typeof window !== 'undefined' ? window : this);
