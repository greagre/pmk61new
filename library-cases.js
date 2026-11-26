/* =========================================================
   pmk61 / library-cases.js — кейсы для тестов библиотеки

   Здесь только данные: что проверить и какой ответ считается верным.
   Сам прогон и таблица — в tests-library.html. Так правка одного
   кейса не требует трогать страницу.

   Ожидания записаны по договорённостям 34-го проекта:
   - «Перед пуском» перечисляет только регистры, прочитанные раньше записи;
   - TXT содержит адрес, десятичный код и подпись команды;
   - загрузка возвращает программу, регистры, X и угол.

   Ревизия 2: оба прежних долга стали обычными кейсами —
   код 4F/6F адресует R0, X возвращается из TXT. Добавлены проверки
   на разбор числа в формате индикатора («1.5 09» = 1.5·10^9).

   Ревизия 3: исправлен вход кейса numFromText. Раньше там стояло
   «-1.2-04» без пробела перед порядком, а индикатор печатает порядок
   через пробел: «-1.2 -04». Кейс проверял формат, которого ядро не даёт.

   Помощник mk() создаёт новое ядро; library.js перехватывает
   MKCore.create, поэтому PMK61_CORE указывает на последнее созданное.
   ========================================================= */
(function (global) {
  'use strict';

  var MODEL = 'mk-61';

  function mk(prog, regs, x, angle) {
    var c = global.MKCore.create(global.MKProfiles.get(MODEL));
    if (prog) c.setProgram(prog);
    if (regs) Object.keys(regs).forEach(function (k) { c.setRegister(Number(k), regs[k]); });
    if (typeof x === 'number') c.setX(x);
    if (angle) c.setAngle(angle);
    return c;
  }

  function hexLine(arr) {
    return arr.map(function (v) { return (v & 255).toString(16).toUpperCase(); }).join(' ');
  }

  global.LIB_CASES = [

    /* ---------- «Перед пуском» ---------- */
    { g: 'Перед пуском', name: 'Чтение R0 раньше записи — входной', expect: '0',
      run: function () { return global.PMK61Lib.inputRegisters(mk([0x60, 0x50])).join(','); } },
    { g: 'Перед пуском', name: 'Сначала запись R0, потом чтение — не входной', expect: '',
      run: function () { return global.PMK61Lib.inputRegisters(mk([0x40, 0x60, 0x50])).join(','); } },
    { g: 'Перед пуском', name: 'F L0 делает R0 входным', expect: '0',
      run: function () { return global.PMK61Lib.inputRegisters(mk([0x0D, 0x5D, 0x00, 0x01, 0x50])).join(','); } },
    { g: 'Перед пуском', name: 'F L2 делает входным R2', expect: '2',
      run: function () { return global.PMK61Lib.inputRegisters(mk([0x0D, 0x58, 0x00, 0x01, 0x50])).join(','); } },
    { g: 'Перед пуском', name: 'Счётчик R1 читается до записи — входной', expect: '1',
      run: function () { return global.PMK61Lib.inputRegisters(mk([0x61, 0x41, 0x50])).join(','); } },
    { g: 'Перед пуском', name: 'K x→П 1 пишет R1 — не входной', expect: '',
      run: function () { return global.PMK61Lib.inputRegisters(mk([0xB1, 0x61, 0x50])).join(','); } },
    { g: 'Перед пуском', name: 'Факториал: R0 вход, рабочие R1 и R2 не попадают', expect: '0',
      run: function () { return global.PMK61Lib.inputRegisters(mk([0x60, 0x41, 0x61, 0x12, 0x42, 0x50])).join(','); } },
    { g: 'Перед пуском', name: 'Программа без регистров — список пуст', expect: '',
      run: function () { return global.PMK61Lib.inputRegisters(mk([0x02, 0x0E, 0x03, 0x10, 0x50])).join(','); } },

    /* закрытые долги: цифра F в младшей цифре кода — это R0 */
    { g: 'Перед пуском', name: 'Код 4F пишет R0: 4F, затем 60 — не входной', expect: '',
      run: function () { return global.PMK61Lib.inputRegisters(mk([0x4F, 0x60, 0x50])).join(','); } },
    { g: 'Перед пуском', name: 'Код 6F читает R0 — входной', expect: '0',
      run: function () { return global.PMK61Lib.inputRegisters(mk([0x6F, 0x50])).join(','); } },
    { g: 'Перед пуском', name: '4F и 6F в одной программе — R0 входной один раз', expect: '0',
      run: function () { return global.PMK61Lib.inputRegisters(mk([0x6F, 0x4F, 0x60, 0x50])).join(','); } },

    /* ---------- выгрузка TXT ---------- */
    { g: 'Выгрузка TXT', name: 'Строка «Перед пуском» с подставленным значением', expect: 'есть',
      run: function () {
        var t = global.PMK61Lib.toText(mk([0x60, 0x50], { 0: 7 }), { name: 'Т' });
        return /Перед пуском: R0 = 7/.test(t) ? 'есть' : 'нет';
      } },
    { g: 'Выгрузка TXT', name: 'Заголовок таблицы шагов', expect: 'есть',
      run: function () {
        var t = global.PMK61Lib.toText(mk([0x02, 0x50]), { name: 'Т' });
        return /^Адрес\s+Код\s+Команда$/m.test(t) ? 'есть' : 'нет';
      } },
    { g: 'Выгрузка TXT', name: 'Строка «Угол»', expect: 'есть',
      run: function () {
        var t = global.PMK61Lib.toText(mk([0x50], null, 0, 'grad'), { name: 'Т' });
        return /^Угол: \S+/m.test(t) ? 'есть' : 'нет';
      } },
    { g: 'Выгрузка TXT', name: 'Строки кодов hex и dec', expect: 'есть',
      run: function () {
        var t = global.PMK61Lib.toText(mk([0x02, 0x50]), { name: 'Т' });
        return (/^Коды \(hex\): /m.test(t) && /^Коды \(dec\): /m.test(t)) ? 'есть' : 'нет';
      } },
    { g: 'Выгрузка TXT', name: 'Пустая память — честная строка', expect: 'есть',
      run: function () {
        var t = global.PMK61Lib.toText(mk(), { name: 'Т' });
        return /память программ пуста/.test(t) ? 'есть' : 'нет';
      } },
    { g: 'Выгрузка TXT', name: 'Подпись команды 0x40 — «x→П 0»', expect: 'x→П 0',
      run: function () { return global.PMK61Lib.listingRows(mk([0x40, 0x60, 0x50]))[0].name; } },
    { g: 'Выгрузка TXT', name: 'Пустые ячейки в листинг не идут', expect: '2',
      run: function () { return String(global.PMK61Lib.listingRows(mk([0x02, 0x50])).length); } },
    { g: 'Выгрузка TXT', name: 'Номер шага — десятичный код команды', expect: '80',
      run: function () { return String(global.PMK61Lib.listingRows(mk([0x50]))[0].dec); } },
    { g: 'Выгрузка TXT', name: 'X = 0 тоже попадает в TXT', expect: 'есть',
      run: function () {
        var t = global.PMK61Lib.toText(mk([0x50], null, 0), { name: 'Т', x: 0 });
        return /Результат на момент сохранения: X = 0/.test(t) ? 'есть' : 'нет';
      } },

    /* ---------- импорт ---------- */
    { g: 'Импорт', name: 'Круговой: toText → fromText даёт те же коды', expect: '2 E 3 10 50',
      run: function () {
        var c = mk([0x02, 0x0E, 0x03, 0x10, 0x50]);
        var back = global.PMK61Lib.fromText(global.PMK61Lib.toText(c, { name: 'Круг' }), c);
        return back ? hexLine(back.prog.slice(0, 5)) : 'null';
      } },
    { g: 'Импорт', name: 'Разбор строки «Коды (hex)»', expect: '40 60 50',
      run: function () {
        var back = global.PMK61Lib.fromText('Коды (hex): 40 60 50', mk());
        return back ? hexLine(back.prog.slice(0, 3)) : 'null';
      } },
    { g: 'Импорт', name: 'Разбор строк листинга «адрес код подпись»', expect: '40',
      run: function () {
        var back = global.PMK61Lib.fromText('00 64 x→П 0\n01 96 П→X 0\n02 80 С/П', mk());
        return back ? hexLine(back.prog.slice(0, 1)) : 'null';
      } },
    { g: 'Импорт', name: 'Адрес «-0» читается как 100', expect: '40',
      run: function () {
        var back = global.PMK61Lib.fromText('-0 64 x→П 0', mk());
        return back ? hexLine(back.prog.slice(100, 101)) : 'null';
      } },
    { g: 'Импорт', name: 'Пустой текст — null', expect: 'null',
      run: function () { return String(global.PMK61Lib.fromText('', mk())); } },
    { g: 'Импорт', name: 'Мусор без кодов — null', expect: 'null',
      run: function () { return String(global.PMK61Lib.fromText('привет, это не программа', mk())); } },
    { g: 'Импорт', name: 'Имя программы подхватывается из первой строки', expect: 'Моя программа',
      run: function () {
        var back = global.PMK61Lib.fromText('МК-61 · Моя программа\nКоды (hex): 50', mk());
        return back ? back.name : 'null';
      } },

    /* закрытый долг: X переживает выгрузку и загрузку */
    { g: 'Импорт', name: 'X возвращается при импорте TXT', expect: '42',
      run: function () {
        var c = mk([0x05, 0x50]);
        var txt = global.PMK61Lib.toText(c, { name: 'X', x: 42 });
        var back = global.PMK61Lib.fromText(txt, c);
        return back && typeof back.x === 'number' ? String(back.x) : 'нет X';
      } },
    { g: 'Импорт', name: 'X в формате индикатора: «1.5 09» — это 1.5·10^9', expect: '1500000000',
      run: function () {
        var back = global.PMK61Lib.fromText('Коды (hex): 50\nРезультат на момент сохранения: X = 1.5 09', mk());
        return back && typeof back.x === 'number' ? String(Math.round(back.x)) : 'нет X';
      } },
    { g: 'Импорт', name: 'Регистр в формате индикатора: R0 = 1.5 09', expect: '1500000000',
      run: function () {
        var back = global.PMK61Lib.fromText('Коды (hex): 50\nРегистры при сохранении:\n  R0=1.5 09  R1=0', mk());
        return back && back.regs && typeof back.regs[0] === 'number'
          ? String(Math.round(back.regs[0])) : 'нет R0';
      } },
    { g: 'Импорт', name: 'numFromText: обычное число и отрицательный порядок', expect: '7|-0.00012',
      run: function () {
        var lib = global.PMK61Lib;
        return lib.numFromText('7') + '|' + lib.numFromText('-1.2 -04');
      } },

    /* ---------- сохранение и загрузка ---------- */
    { g: 'Загрузка', name: 'applyItem возвращает программу, R0 и X', expect: 'true|7|5',
      run: function () {
        var c = mk();
        var ok = global.PMK61Lib.applyItem({ name: 'Т', prog: [0x05, 0x50], regs: [7], x: 5 });
        return ok + '|' + c.ST.R[0] + '|' + c.ST.X;
      } },
    { g: 'Загрузка', name: 'applyItem возвращает угол', expect: 'deg',
      run: function () {
        var c = mk();
        global.PMK61Lib.applyItem({ name: 'Т', prog: [0x50], regs: [0], angle: 'deg' });
        return c.getAngle();
      } },
    { g: 'Загрузка', name: 'applyItem сбрасывает PC, режим и ошибку', expect: '0|AUT|false',
      run: function () {
        var c = mk([0x51, 0x00, 0x00]);
        c.ST.ip = 5;
        global.PMK61Lib.applyItem({ name: 'Т', prog: [0x05, 0x50], regs: [0], x: 0 });
        return c.ST.ip + '|' + c.ST.mode + '|' + c.ST.err;
      } },
    { g: 'Загрузка', name: 'snapshotCurrent сохраняет имя, R1, X, угол', expect: 'Тест|3|9|rad|number',
      run: function () {
        mk([0x50], { 1: 3 }, 9, 'rad');
        var it = global.PMK61Lib.snapshotCurrent('Тест');
        return it.name + '|' + it.regs[1] + '|' + it.x + '|' + it.angle + '|' + (typeof it.savedAt);
      } },
    { g: 'Загрузка', name: 'snapshotCurrent отдаёт все обязательные поля', expect: 'name,prog,regs,x,angle,savedAt,id',
      run: function () {
        mk([0x05, 0x50], { 1: 3 }, 9, 'rad');
        var it = global.PMK61Lib.snapshotCurrent('Тест');
        return ['name', 'prog', 'regs', 'x', 'angle', 'savedAt', 'id']
          .filter(function (k) { return it && k in it; }).join(',');
      } },
    { g: 'Загрузка', name: 'Хранилище отдаёт массив', expect: 'array',
      run: function () { return Array.isArray(global.PMK61Lib.loadAll()) ? 'array' : 'нет'; } },
    { g: 'Загрузка', name: 'Снимок хранит копию программы, а не ссылку', expect: '5',
      run: function () {
        var c = mk([0x05, 0x50]);
        var it = global.PMK61Lib.snapshotCurrent('Т');
        c.setProgram([0x07, 0x50]);
        return String(it.prog[0] & 255);
      } },
    { g: 'Загрузка', name: 'Круг «снимок → TXT → applyItem» возвращает X', expect: '42',
      run: function () {
        var c = mk([0x05, 0x50], { 0: 7 }, 42);
        var it = global.PMK61Lib.snapshotCurrent('Круг');
        var back = global.PMK61Lib.fromText(global.PMK61Lib.toText(c, it), c);
        c.reset();
        global.PMK61Lib.applyItem(back);
        return String(c.ST.X);
      } }
  ];
})(typeof window !== 'undefined' ? window : this);
