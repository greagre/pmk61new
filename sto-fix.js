/* =========================================================
   pmk61 / sto-fix.js
   Закрытие третьего долга: «X→П не завершает набор числа».

   Что не так в ядре (core.js, ревизия 6):
     ветка key -> {a:'reg', mode:'sto'} пишет число в регистр, но
     оставляет ST.typing = true и ST.input как есть. Поэтому следующая
     цифра дописывается к уже набранному числу:
       5, X→П, R1, 7  ->  на индикаторе 57 (у настоящего ПМК было бы 7).

   Что делает этот файл:
     оборачивает core.key и после успешной записи в регистр закрывает
     набор — ST.typing = false, ST.input = '', ST.exp = false.
     Ровно так ведёт себя настоящий ПМК: запись в регистр завершает
     ввод числа, и следующая цифра начинает новое.

   Чего этот файл НЕ делает:
     не переписывает ядро и не меняет его логику. Подключать его нужно
     ПОСЛЕ core.js — он только дополняет клавишу.

   Режим ПРГ не затрагивается: там нажатие пишет код в память команд,
   а не число в регистр.
   ========================================================= */
(function (global) {
  'use strict';

  var MK = global.MKCore;
  if (!MK || typeof MK.create !== 'function') return;

  var origCreate = MK.create;

  function endTyping(ST) {
    if (!ST) return;
    ST.typing = false;
    ST.input = '';
    ST.exp = false;
  }

  MK.create = function (options) {
    var core = origCreate(options);
    var key0 = core.key;

    core.key = function (k) {
      /* запись именно в регистр: клавиша X→П + выбранный регистр */
      var isSto = !!(k && k.a === 'reg' && k.mode === 'sto');
      var res = key0(k);
      if (isSto && core.ST && core.ST.mode !== 'PRG') {
        endTyping(core.ST);
        core.changed();
      }
      return res;
    };

    return core;
  };
})(typeof window !== 'undefined' ? window : this);
