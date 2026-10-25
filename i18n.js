/* ============================================================
   OC_I18N — selector de idioma compartido entre todas las páginas.
   Uso en una página:
     1. <script src="i18n.js"></script> antes del script de la página.
     2. Marcar textos con data-i18n="clave", aria-labels con
        data-i18n-aria="clave", y listas (ej. meses) con
        data-i18n-list="clave" + data-i18n-index="0".
     3. Poner el selector ES/EN con botones .oc-lang-btn[data-lang].
     4. Llamar OC_I18N.init() al final del script de la página.
     5. Si hay contenido generado por JS que depende del idioma
        (ej. el calendario), escuchar document 'oc:langchange' y
        usar OC_I18N.t('clave') para leer el string actual.
   ============================================================ */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'oc-lang';
  var DEFAULT_LANG = 'es';
  var SUPPORTED_LANGS = ['es', 'en'];

  var dictionaries = {};
  var currentLang = DEFAULT_LANG;

  function loadDictionary(lang) {
    if (dictionaries[lang]) {
      return Promise.resolve(dictionaries[lang]);
    }
    return fetch('i18n/' + lang + '.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        dictionaries[lang] = data;
        return data;
      });
  }

  function t(key) {
    var dict = dictionaries[currentLang] || {};
    return key in dict ? dict[key] : key;
  }

  function applyStatic() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });

    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });

    document.querySelectorAll('[data-i18n-list]').forEach(function (el) {
      var list = t(el.getAttribute('data-i18n-list'));
      var index = parseInt(el.getAttribute('data-i18n-index'), 10);
      if (Array.isArray(list) && !isNaN(index) && list[index] !== undefined) {
        el.textContent = list[index];
      }
    });

    document.querySelectorAll('.oc-lang-btn').forEach(function (btn) {
      btn.classList.toggle('oc-active', btn.getAttribute('data-lang') === currentLang);
    });

    document.documentElement.setAttribute('lang', currentLang);
  }

  function setLang(lang) {
    if (SUPPORTED_LANGS.indexOf(lang) === -1) {
      lang = DEFAULT_LANG;
    }
    return loadDictionary(lang).then(function () {
      currentLang = lang;
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* almacenamiento no disponible */ }
      applyStatic();
      document.dispatchEvent(new CustomEvent('oc:langchange', { detail: { lang: lang } }));
    });
  }

  function init() {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* almacenamiento no disponible */ }

    document.querySelectorAll('.oc-lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setLang(btn.getAttribute('data-lang'));
      });
    });

    setLang(saved || DEFAULT_LANG);
  }

  global.OC_I18N = {
    init: init,
    setLang: setLang,
    t: t,
    getLang: function () { return currentLang; }
  };
})(window);
