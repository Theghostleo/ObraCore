/* ============================================================
   OCForms — motor de formularios declarativos, compartido por las
   pantallas de etapa que necesiten un formulario (Levantamiento,
   y más adelante Diseño/Procura/Programación/Comisionamiento).

   No es autocontenido: lo carga la pantalla de etapa vía <script src>,
   igual que ya carga store.js/i18n.js. El CSS de sus componentes nuevos
   (tabla editable, checklist, galería de fotos, número+unidad,
   coordenadas) NO vive aquí — vive en el <style> de cada pantalla
   autocontenida que lo use, siguiendo la convención ya establecida por
   .oc-card/.oc-field/.oc-input (ver skill obracore-form-templates).

   Modelo de datos: en vez de leer el DOM al vuelo, el motor mantiene un
   objeto de estado vivo por contenedor (container._ocFormState), que
   cada control de UI lee y escribe directamente. collect() devuelve un
   clon profundo de ese estado — nunca hace scraping del DOM. Esto hace
   que tablas/checklists/fotos (que mutan de forma asíncrona o por
   filas repetibles) sean tan confiables como un <input> simple.

   Uso:
     OCForms.conSeccionesBase(plantillaEspecifica) -> plantilla completa
       (antepone Visita/Sitio y agrega Evidencia/Conclusión — llamar UNA
       vez al crear un registro, y congelar el resultado como snapshot;
       nunca volver a llamar para re-pintar un registro ya existente).
     OCForms.render(contenedor, plantillaCompleta, datos, {lang, onChange, fotoKeyPrefix})
     OCForms.collect(contenedor)  -> { seccionId: { campoId: valor } }
     OCForms.validate(contenedor) -> [{ seccionId, campoId, mensaje }] (y marca .oc-input-error en vivo)

   Sin eval ni fórmulas libres: los únicos cálculos automáticos son los
   totales de columna de tabla ('suma'|'promedio') declarados en la
   plantilla.
   ============================================================ */
(function (global) {
  'use strict';

  function etiquetaDe(obj, lang) {
    if (!obj) { return ''; }
    return obj[lang] || obj.es || '';
  }

  function t(clave) {
    return (global.OC_I18N && global.OC_I18N.t) ? global.OC_I18N.t(clave) : clave;
  }

  function getVal(ctx, seccionId, campoId) {
    return ctx.state[seccionId] ? ctx.state[seccionId][campoId] : undefined;
  }

  function setVal(ctx, seccionId, campoId, val) {
    if (!ctx.state[seccionId]) { ctx.state[seccionId] = {}; }
    ctx.state[seccionId][campoId] = val;
  }

  function onFieldChange(ctx) {
    aplicarVisibilidad(ctx.container);
    ctx.onChange();
  }

  /* ============================================================
     SECCIONES BASE — las agrega siempre el motor, no cada plantilla.
     ============================================================ */
  var SECCION_VISITA = {
    id: 'visita',
    titulo: { es: 'Visita', en: 'Visit' },
    campos: [
      { id: 'fecha', tipo: 'fecha', etiqueta: { es: 'Fecha', en: 'Date' }, requerido: true },
      { id: 'horaInicio', tipo: 'hora', etiqueta: { es: 'Hora de inicio', en: 'Start time' } },
      { id: 'horaFin', tipo: 'hora', etiqueta: { es: 'Hora de fin', en: 'End time' } },
      { id: 'personal', tipo: 'texto', etiqueta: { es: 'Personal que asistió', en: 'Staff present' } },
      { id: 'duracionHoras', tipo: 'numero', etiqueta: { es: 'Duración', en: 'Duration' }, unidad: 'h', min: 0 },
      { id: 'condicionesSitio', tipo: 'textoLargo', etiqueta: { es: 'Condiciones del sitio', en: 'Site conditions' } }
    ]
  };
  var SECCION_SITIO = {
    id: 'sitio',
    titulo: { es: 'Sitio', en: 'Site' },
    campos: [
      { id: 'direccion', tipo: 'texto', etiqueta: { es: 'Dirección', en: 'Address' } },
      { id: 'coordenadas', tipo: 'coordenadas', etiqueta: { es: 'Coordenadas', en: 'Coordinates' } },
      { id: 'accesos', tipo: 'textoLargo', etiqueta: { es: 'Accesos', en: 'Access' } },
      { id: 'restricciones', tipo: 'textoLargo', etiqueta: { es: 'Restricciones', en: 'Restrictions' } },
      { id: 'riesgosSeguridad', tipo: 'textoLargo', etiqueta: { es: 'Riesgos de seguridad', en: 'Safety risks' } }
    ]
  };
  var SECCION_EVIDENCIA = {
    id: 'evidencia',
    titulo: { es: 'Evidencia', en: 'Evidence' },
    campos: [
      {
        id: 'fotos', tipo: 'fotos', etiqueta: { es: 'Fotos', en: 'Photos' },
        categorias: [
          { id: 'general', etiqueta: { es: 'General', en: 'General' } },
          { id: 'sitio', etiqueta: { es: 'Sitio', en: 'Site' } },
          { id: 'instalacion', etiqueta: { es: 'Instalación existente', en: 'Existing installation' } },
          { id: 'hallazgo', etiqueta: { es: 'Hallazgo', en: 'Finding' } }
        ]
      }
    ]
  };
  var SECCION_CONCLUSION = {
    id: 'conclusion',
    titulo: { es: 'Conclusión', en: 'Conclusion' },
    campos: [
      {
        id: 'viabilidad', tipo: 'opcion', etiqueta: { es: 'Viabilidad', en: 'Feasibility' }, requerido: true,
        opciones: [
          { id: 'viable', etiqueta: { es: 'Viable', en: 'Feasible' } },
          { id: 'viable-con-adecuaciones', etiqueta: { es: 'Viable con adecuaciones', en: 'Feasible with adjustments' } },
          { id: 'no-viable', etiqueta: { es: 'No viable', en: 'Not feasible' } }
        ]
      },
      { id: 'hallazgos', tipo: 'textoLargo', etiqueta: { es: 'Hallazgos', en: 'Findings' } },
      { id: 'recomendaciones', tipo: 'textoLargo', etiqueta: { es: 'Recomendaciones', en: 'Recommendations' } }
    ]
  };

  function conSeccionesBase(plantillaEspecifica) {
    return {
      id: plantillaEspecifica.id,
      version: plantillaEspecifica.version,
      nombre: plantillaEspecifica.nombre,
      secciones: [SECCION_VISITA, SECCION_SITIO]
        .concat(plantillaEspecifica.secciones || [])
        .concat([SECCION_EVIDENCIA, SECCION_CONCLUSION])
    };
  }

  /* ============================================================
     ESTADO INICIAL — defaults por tipo de campo, luego overlay de los
     datos existentes campo por campo (nunca reemplaza la sección
     entera, así un campo agregado a la plantilla después de crear el
     registro siempre aparece con su default).
     ============================================================ */
  function defaultValor(campo) {
    switch (campo.tipo) {
      case 'numero': return null;
      case 'opcionMultiple': return [];
      case 'siNo': return false;
      case 'coordenadas': return { lat: null, lng: null };
      case 'tabla': return [];
      case 'checklist':
        return (campo.items || []).map(function (it) { return { itemId: it.id, estado: 'n-a', nota: '' }; });
      case 'fotos': return [];
      default: return '';
    }
  }

  function construirEstadoInicial(plantilla, datos) {
    var state = {};
    (plantilla.secciones || []).forEach(function (seccion) {
      state[seccion.id] = {};
      (seccion.campos || []).forEach(function (campo) {
        state[seccion.id][campo.id] = defaultValor(campo);
      });
    });
    Object.keys(datos || {}).forEach(function (seccionId) {
      if (!state[seccionId]) { state[seccionId] = {}; }
      Object.keys(datos[seccionId] || {}).forEach(function (campoId) {
        state[seccionId][campoId] = datos[seccionId][campoId];
      });
    });
    return state;
  }

  /* ============================================================
     VISIBILIDAD CONDICIONAL (visibleSi) — se re-evalúa en cada cambio
     de campo; solo compara contra un campo de la MISMA sección.
     ============================================================ */
  function aplicarVisibilidad(container) {
    (container._ocFormFields || []).forEach(function (f) {
      if (!f.campo.visibleSi) { return; }
      var controlador = f.campo.visibleSi.campo;
      var valorControlador = container._ocFormState[f.seccionId] ? container._ocFormState[f.seccionId][controlador] : undefined;
      f.wrap.hidden = valorControlador !== f.campo.visibleSi.igualA;
    });
  }

  /* ============================================================
     WRAPPER COMÚN DE CAMPO
     ============================================================ */
  function fieldWrap(ctx, campo) {
    var wrap = document.createElement('div');
    wrap.className = 'oc-field';
    var label = document.createElement('label');
    label.textContent = etiquetaDe(campo.etiqueta, ctx.lang) + (campo.requerido ? ' *' : '');
    wrap.appendChild(label);
    if (campo.ayuda) {
      var hint = document.createElement('div');
      hint.className = 'oc-field-hint';
      hint.textContent = etiquetaDe(campo.ayuda, ctx.lang);
      wrap.appendChild(hint);
    }
    return wrap;
  }

  /* ============================================================
     TIPOS DE CAMPO SIMPLES
     ============================================================ */
  function campoTexto(ctx, seccionId, campo, multilinea) {
    var wrap = fieldWrap(ctx, campo);
    var input = document.createElement(multilinea ? 'textarea' : 'input');
    if (!multilinea) { input.type = 'text'; }
    input.className = 'oc-input';
    input.value = getVal(ctx, seccionId, campo.id) || '';
    input.addEventListener('input', function () {
      setVal(ctx, seccionId, campo.id, input.value);
      onFieldChange(ctx);
    });
    wrap.appendChild(input);
    return wrap;
  }

  function campoNumero(ctx, seccionId, campo) {
    var wrap = fieldWrap(ctx, campo);
    var row = document.createElement('div');
    row.className = 'oc-input-numero-unidad';
    var input = document.createElement('input');
    input.type = 'number';
    if (campo.min !== undefined) { input.min = campo.min; }
    if (campo.max !== undefined) { input.max = campo.max; }
    if (campo.decimales !== undefined) { input.step = Math.pow(10, -campo.decimales); }
    input.className = 'oc-input';
    var val = getVal(ctx, seccionId, campo.id);
    input.value = (val === null || val === undefined) ? '' : val;
    input.addEventListener('input', function () {
      setVal(ctx, seccionId, campo.id, input.value === '' ? null : Number(input.value));
      onFieldChange(ctx);
    });
    row.appendChild(input);
    if (campo.unidad) {
      var unidad = document.createElement('span');
      unidad.className = 'oc-input-unidad';
      unidad.textContent = campo.unidad;
      row.appendChild(unidad);
    }
    wrap.appendChild(row);
    return wrap;
  }

  function campoOpcion(ctx, seccionId, campo) {
    var wrap = fieldWrap(ctx, campo);
    var select = document.createElement('select');
    select.className = 'oc-input';
    var optVacia = document.createElement('option');
    optVacia.value = '';
    optVacia.textContent = '—';
    select.appendChild(optVacia);
    (campo.opciones || []).forEach(function (op) {
      var o = document.createElement('option');
      o.value = op.id;
      o.textContent = etiquetaDe(op.etiqueta, ctx.lang);
      select.appendChild(o);
    });
    select.value = getVal(ctx, seccionId, campo.id) || '';
    select.addEventListener('change', function () {
      setVal(ctx, seccionId, campo.id, select.value);
      onFieldChange(ctx);
    });
    wrap.appendChild(select);
    return wrap;
  }

  function campoOpcionMultiple(ctx, seccionId, campo) {
    var wrap = fieldWrap(ctx, campo);
    var grupo = document.createElement('div');
    grupo.className = 'oc-opcion-multiple';
    var actual = getVal(ctx, seccionId, campo.id) || [];
    (campo.opciones || []).forEach(function (op) {
      var label = document.createElement('label');
      label.className = 'oc-checkbox-label';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = actual.indexOf(op.id) !== -1;
      cb.addEventListener('change', function () {
        var arr = (getVal(ctx, seccionId, campo.id) || []).slice();
        var i = arr.indexOf(op.id);
        if (cb.checked && i === -1) { arr.push(op.id); }
        if (!cb.checked && i !== -1) { arr.splice(i, 1); }
        setVal(ctx, seccionId, campo.id, arr);
        onFieldChange(ctx);
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + etiquetaDe(op.etiqueta, ctx.lang)));
      grupo.appendChild(label);
    });
    wrap.appendChild(grupo);
    return wrap;
  }

  function campoSiNo(ctx, seccionId, campo) {
    var wrap = fieldWrap(ctx, campo);
    var toggle = document.createElement('div');
    toggle.className = 'oc-toggle';
    var nombreGrupo = 'ocf-' + seccionId + '-' + campo.id;
    var val = !!getVal(ctx, seccionId, campo.id);
    [{ v: true, key: 'forms.siNo.si' }, { v: false, key: 'forms.siNo.no' }].forEach(function (opt, i) {
      var id = nombreGrupo + '-' + i;
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = nombreGrupo;
      input.id = id;
      input.checked = val === opt.v;
      input.addEventListener('change', function () {
        setVal(ctx, seccionId, campo.id, opt.v);
        onFieldChange(ctx);
      });
      var label = document.createElement('label');
      label.setAttribute('for', id);
      label.textContent = t(opt.key);
      toggle.appendChild(input);
      toggle.appendChild(label);
    });
    wrap.appendChild(toggle);
    return wrap;
  }

  function campoFechaHora(ctx, seccionId, campo, tipoInput) {
    var wrap = fieldWrap(ctx, campo);
    var input = document.createElement('input');
    input.type = tipoInput;
    input.className = 'oc-input';
    input.value = getVal(ctx, seccionId, campo.id) || '';
    input.addEventListener('change', function () {
      setVal(ctx, seccionId, campo.id, input.value);
      onFieldChange(ctx);
    });
    wrap.appendChild(input);
    return wrap;
  }

  function campoCoordenadas(ctx, seccionId, campo) {
    var wrap = fieldWrap(ctx, campo);
    var row = document.createElement('div');
    row.className = 'oc-coordenadas-row';
    var val = getVal(ctx, seccionId, campo.id) || { lat: null, lng: null };
    var inputLat = document.createElement('input');
    inputLat.type = 'number';
    inputLat.step = 'any';
    inputLat.className = 'oc-input';
    inputLat.placeholder = t('forms.coordenadas.lat');
    inputLat.value = (val.lat === null || val.lat === undefined) ? '' : val.lat;
    var inputLng = document.createElement('input');
    inputLng.type = 'number';
    inputLng.step = 'any';
    inputLng.className = 'oc-input';
    inputLng.placeholder = t('forms.coordenadas.lng');
    inputLng.value = (val.lng === null || val.lng === undefined) ? '' : val.lng;

    function actualizar() {
      setVal(ctx, seccionId, campo.id, {
        lat: inputLat.value === '' ? null : Number(inputLat.value),
        lng: inputLng.value === '' ? null : Number(inputLng.value)
      });
      onFieldChange(ctx);
    }
    inputLat.addEventListener('input', actualizar);
    inputLng.addEventListener('input', actualizar);

    var btnUbicacion = document.createElement('button');
    btnUbicacion.type = 'button';
    btnUbicacion.className = 'oc-btn oc-btn-secondary oc-btn-ubicacion';
    btnUbicacion.textContent = t('forms.coordenadas.usarMiUbicacion');
    btnUbicacion.addEventListener('click', function () {
      if (!navigator.geolocation) { return; }
      btnUbicacion.disabled = true;
      navigator.geolocation.getCurrentPosition(function (pos) {
        inputLat.value = pos.coords.latitude.toFixed(6);
        inputLng.value = pos.coords.longitude.toFixed(6);
        actualizar();
        btnUbicacion.disabled = false;
      }, function () { btnUbicacion.disabled = false; }, { timeout: 8000 });
    });

    row.appendChild(inputLat);
    row.appendChild(inputLng);
    row.appendChild(btnUbicacion);
    wrap.appendChild(row);
    return wrap;
  }

  /* ============================================================
     TABLA — filas repetibles, cada columna declara su propio tipo;
     columnas con `total: 'suma'|'promedio'` recalculan en cada edición.
     ============================================================ */
  function redondear(n) {
    return Math.round(n * 100) / 100;
  }

  function buildFilaTabla(ctx, seccionId, campo, fila, idx, rerender, actualizarTotales) {
    var filaEl = document.createElement('div');
    filaEl.className = 'oc-tabla-fila';
    campo.columnas.forEach(function (col) {
      var input;
      if (col.tipo === 'opcion') {
        input = document.createElement('select');
        input.className = 'oc-input';
        (col.opciones || []).forEach(function (op) {
          var o = document.createElement('option');
          o.value = op.id;
          o.textContent = etiquetaDe(op.etiqueta, ctx.lang);
          input.appendChild(o);
        });
        input.value = fila[col.id] || '';
      } else if (col.tipo === 'numero') {
        input = document.createElement('input');
        input.type = 'number';
        input.className = 'oc-input oc-input-mono';
        input.value = (fila[col.id] === null || fila[col.id] === undefined) ? '' : fila[col.id];
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'oc-input';
        input.value = fila[col.id] || '';
      }
      input.addEventListener('input', function () {
        fila[col.id] = col.tipo === 'numero' ? (input.value === '' ? null : Number(input.value)) : input.value;
        actualizarTotales();
        onFieldChange(ctx);
      });
      input.addEventListener('change', function () {
        if (col.tipo === 'opcion') {
          fila[col.id] = input.value;
          onFieldChange(ctx);
        }
      });
      filaEl.appendChild(input);
    });
    var btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'oc-btn-remove';
    btnDel.textContent = '×';
    btnDel.addEventListener('click', function () {
      var arr = getVal(ctx, seccionId, campo.id) || [];
      arr.splice(idx, 1);
      setVal(ctx, seccionId, campo.id, arr);
      rerender();
      onFieldChange(ctx);
    });
    filaEl.appendChild(btnDel);
    return filaEl;
  }

  function campoTabla(ctx, seccionId, campo) {
    var wrap = fieldWrap(ctx, campo);
    wrap.classList.add('oc-field-tabla');
    var tabla = document.createElement('div');
    tabla.className = 'oc-tabla-editable';

    var head = document.createElement('div');
    head.className = 'oc-tabla-fila oc-tabla-head';
    campo.columnas.forEach(function (col) {
      var h = document.createElement('span');
      h.textContent = etiquetaDe(col.etiqueta, ctx.lang) + (col.unidad ? ' (' + col.unidad + ')' : '');
      head.appendChild(h);
    });
    head.appendChild(document.createElement('span'));
    tabla.appendChild(head);

    var filasWrap = document.createElement('div');
    filasWrap.className = 'oc-tabla-filas';
    tabla.appendChild(filasWrap);

    var totalesRow = document.createElement('div');
    totalesRow.className = 'oc-tabla-fila oc-tabla-totales';
    tabla.appendChild(totalesRow);

    function filas() { return getVal(ctx, seccionId, campo.id) || []; }

    function actualizarTotales() {
      totalesRow.innerHTML = '';
      var hayTotales = campo.columnas.some(function (c) { return c.total; });
      if (!hayTotales) { totalesRow.hidden = true; return; }
      totalesRow.hidden = false;
      campo.columnas.forEach(function (col) {
        var cell = document.createElement('span');
        if (col.total) {
          var valores = filas().map(function (f) { return Number(f[col.id]) || 0; });
          var total = valores.reduce(function (a, b) { return a + b; }, 0);
          var valor = col.total === 'promedio' && valores.length ? (total / valores.length) : total;
          cell.textContent = redondear(valor) + (col.unidad ? ' ' + col.unidad : '');
        }
        totalesRow.appendChild(cell);
      });
      totalesRow.appendChild(document.createElement('span'));
    }

    function renderFilas() {
      filasWrap.innerHTML = '';
      filas().forEach(function (fila, idx) {
        filasWrap.appendChild(buildFilaTabla(ctx, seccionId, campo, fila, idx, renderFilas, actualizarTotales));
      });
      actualizarTotales();
    }

    var btnAdd = document.createElement('button');
    btnAdd.type = 'button';
    btnAdd.className = 'oc-btn-add';
    btnAdd.textContent = t('forms.tabla.agregarFila');
    btnAdd.addEventListener('click', function () {
      var nueva = {};
      campo.columnas.forEach(function (c) { nueva[c.id] = c.tipo === 'numero' ? null : ''; });
      var arr = filas();
      arr.push(nueva);
      setVal(ctx, seccionId, campo.id, arr);
      renderFilas();
      onFieldChange(ctx);
    });

    wrap.appendChild(tabla);
    wrap.appendChild(btnAdd);
    renderFilas();
    return wrap;
  }

  /* ============================================================
     CHECKLIST — ok / no-ok / n-a + nota por ítem.
     ============================================================ */
  function campoChecklist(ctx, seccionId, campo) {
    var wrap = fieldWrap(ctx, campo);
    wrap.classList.add('oc-field-checklist');
    var actual = getVal(ctx, seccionId, campo.id);
    if (!actual || !actual.length) {
      actual = defaultValor(campo);
      setVal(ctx, seccionId, campo.id, actual);
    }
    campo.items.forEach(function (item, idx) {
      var fila = document.createElement('div');
      fila.className = 'oc-checklist-item';

      var label = document.createElement('span');
      label.className = 'oc-checklist-item-label';
      label.textContent = etiquetaDe(item.etiqueta, ctx.lang);
      fila.appendChild(label);

      var grupo = document.createElement('div');
      grupo.className = 'oc-checklist-estados';
      ['ok', 'no-ok', 'n-a'].forEach(function (valorEstado) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'oc-checklist-btn oc-checklist-btn--' + valorEstado;
        btn.textContent = t('forms.checklist.' + valorEstado.replace('-', ''));
        if (actual[idx].estado === valorEstado) { btn.classList.add('oc-activo'); }
        btn.addEventListener('click', function () {
          actual[idx].estado = valorEstado;
          Array.prototype.forEach.call(grupo.querySelectorAll('.oc-checklist-btn'), function (b) {
            b.classList.remove('oc-activo');
          });
          btn.classList.add('oc-activo');
          onFieldChange(ctx);
        });
        grupo.appendChild(btn);
      });
      fila.appendChild(grupo);

      var nota = document.createElement('input');
      nota.type = 'text';
      nota.className = 'oc-input oc-checklist-nota';
      nota.placeholder = t('forms.checklist.nota');
      nota.value = actual[idx].nota || '';
      nota.addEventListener('input', function () {
        actual[idx].nota = nota.value;
        onFieldChange(ctx);
      });
      fila.appendChild(nota);

      wrap.appendChild(fila);
    });
    return wrap;
  }

  /* ============================================================
     FOTOS — compresión en el navegador (canvas, máx. 1600px, JPEG 0.8),
     guardadas como Blob en OCPdfStore (mismo almacén que las
     cotizaciones, con otro prefijo de clave). El campo solo guarda
     {key, categoria, nota}; la miniatura se trae con getPdf(key).
     ============================================================ */
  function comprimirFoto(file, maxLado) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.width, h = img.height;
        var escala = Math.min(1, maxLado / Math.max(w, h));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * escala));
        canvas.height = Math.max(1, Math.round(h * escala));
        var cx = canvas.getContext('2d');
        cx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (blob) { resolve(blob); } else { reject(new Error('No se pudo comprimir la foto.')); }
        }, 'image/jpeg', 0.8);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer la imagen.'));
      };
      img.src = url;
    });
  }

  function buildFotoThumb(ctx, seccionId, campo, foto, idx, rerender) {
    var box = document.createElement('div');
    box.className = 'oc-foto-thumb';
    var img = document.createElement('img');
    img.src = foto._blobUrl || '';
    img.alt = foto.categoria || '';
    img.addEventListener('click', function () {
      if (foto._blobUrl) { window.open(foto._blobUrl, '_blank'); }
    });
    box.appendChild(img);

    if (campo.categorias && campo.categorias.length) {
      var selCat = document.createElement('select');
      selCat.className = 'oc-input oc-foto-categoria';
      campo.categorias.forEach(function (cat) {
        var o = document.createElement('option');
        o.value = cat.id;
        o.textContent = etiquetaDe(cat.etiqueta, ctx.lang);
        selCat.appendChild(o);
      });
      selCat.value = foto.categoria || '';
      selCat.addEventListener('change', function () {
        foto.categoria = selCat.value;
        onFieldChange(ctx);
      });
      box.appendChild(selCat);
    }

    var nota = document.createElement('input');
    nota.type = 'text';
    nota.className = 'oc-input oc-foto-nota';
    nota.placeholder = t('forms.fotos.nota');
    nota.value = foto.nota || '';
    nota.addEventListener('input', function () {
      foto.nota = nota.value;
      onFieldChange(ctx);
    });
    box.appendChild(nota);

    var btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'oc-btn-remove';
    btnDel.textContent = '×';
    btnDel.addEventListener('click', function () {
      var arr = getVal(ctx, seccionId, campo.id) || [];
      arr.splice(idx, 1);
      setVal(ctx, seccionId, campo.id, arr);
      rerender();
      onFieldChange(ctx);
    });
    box.appendChild(btnDel);
    return box;
  }

  function campoFotos(ctx, seccionId, campo) {
    var wrap = fieldWrap(ctx, campo);
    wrap.classList.add('oc-field-fotos');
    var galeria = document.createElement('div');
    galeria.className = 'oc-fotos-galeria';
    wrap.appendChild(galeria);

    function fotos() { return getVal(ctx, seccionId, campo.id) || []; }

    function renderGaleria() {
      galeria.innerHTML = '';
      fotos().forEach(function (foto, idx) {
        galeria.appendChild(buildFotoThumb(ctx, seccionId, campo, foto, idx, renderGaleria));
      });
    }

    var inputFile = document.createElement('input');
    inputFile.type = 'file';
    inputFile.accept = 'image/*';
    inputFile.multiple = true;
    inputFile.className = 'oc-input-file';
    inputFile.addEventListener('change', function () {
      var archivos = Array.prototype.slice.call(inputFile.files || []);
      inputFile.value = '';
      archivos.forEach(function (file) {
        comprimirFoto(file, 1600).then(function (blob) {
          var key = ctx.fotoKeyPrefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
          var guardar = global.OCPdfStore ? global.OCPdfStore.guardarPdf(key, blob) : Promise.resolve();
          return guardar.then(function () {
            var arr = fotos();
            arr.push({
              key: key,
              categoria: (campo.categorias && campo.categorias[0]) ? campo.categorias[0].id : '',
              nota: '',
              _blobUrl: URL.createObjectURL(blob)
            });
            setVal(ctx, seccionId, campo.id, arr);
            renderGaleria();
            onFieldChange(ctx);
          });
        }).catch(function (e) {
          console.error('[ObraCore] Error procesando foto:', e);
        });
      });
    });
    var btnAgregar = document.createElement('label');
    btnAgregar.className = 'oc-btn-add oc-btn-add-foto';
    btnAgregar.textContent = t('forms.fotos.agregar');
    btnAgregar.appendChild(inputFile);
    wrap.appendChild(btnAgregar);

    renderGaleria();
    // Fotos que ya existían (vienen solo con `key`): trae su Blob de
    // OCPdfStore para la miniatura, sin bloquear el primer render.
    fotos().forEach(function (foto) {
      if (!foto._blobUrl && global.OCPdfStore) {
        global.OCPdfStore.getPdf(foto.key).then(function (blob) {
          if (blob) {
            foto._blobUrl = URL.createObjectURL(blob);
            renderGaleria();
          }
        });
      }
    });
    return wrap;
  }

  /* ============================================================
     DESPACHO POR TIPO
     ============================================================ */
  function buildCampo(ctx, seccionId, campo) {
    switch (campo.tipo) {
      case 'texto': return campoTexto(ctx, seccionId, campo, false);
      case 'textoLargo': return campoTexto(ctx, seccionId, campo, true);
      case 'numero': return campoNumero(ctx, seccionId, campo);
      case 'opcion': return campoOpcion(ctx, seccionId, campo);
      case 'opcionMultiple': return campoOpcionMultiple(ctx, seccionId, campo);
      case 'siNo': return campoSiNo(ctx, seccionId, campo);
      case 'fecha': return campoFechaHora(ctx, seccionId, campo, 'date');
      case 'hora': return campoFechaHora(ctx, seccionId, campo, 'time');
      case 'coordenadas': return campoCoordenadas(ctx, seccionId, campo);
      case 'tabla': return campoTabla(ctx, seccionId, campo);
      case 'checklist': return campoChecklist(ctx, seccionId, campo);
      case 'fotos': return campoFotos(ctx, seccionId, campo);
      default: return fieldWrap(ctx, campo);
    }
  }

  function buildSeccionCard(ctx, seccion) {
    var card = document.createElement('section');
    card.className = 'oc-card';
    var titulo = document.createElement('h2');
    titulo.className = 'oc-card-title';
    titulo.textContent = etiquetaDe(seccion.titulo, ctx.lang);
    card.appendChild(titulo);

    (seccion.campos || []).forEach(function (campo) {
      var wrap = buildCampo(ctx, seccion.id, campo);
      wrap.setAttribute('data-seccion', seccion.id);
      wrap.setAttribute('data-campo', campo.id);
      card.appendChild(wrap);
      ctx.container._ocFormFields.push({ wrap: wrap, campo: campo, seccionId: seccion.id });
    });
    return card;
  }

  /* ============================================================
     API PÚBLICA
     ============================================================ */
  function render(container, plantilla, datos, opts) {
    opts = opts || {};
    var ctx = {
      container: container,
      lang: opts.lang || ((global.OC_I18N && global.OC_I18N.getLang) ? global.OC_I18N.getLang() : 'es'),
      onChange: opts.onChange || function () {},
      fotoKeyPrefix: opts.fotoKeyPrefix || 'FOTO'
    };
    container._ocFormState = construirEstadoInicial(plantilla, datos);
    container._ocFormPlantilla = plantilla;
    container._ocFormFields = [];
    ctx.state = container._ocFormState;
    container.innerHTML = '';
    (plantilla.secciones || []).forEach(function (seccion) {
      container.appendChild(buildSeccionCard(ctx, seccion));
    });
    aplicarVisibilidad(container);
  }

  function collect(container) {
    return JSON.parse(JSON.stringify(container._ocFormState || {}));
  }

  function esVacio(tipo, val) {
    switch (tipo) {
      case 'numero': return val === null || val === undefined || val === '';
      case 'opcionMultiple': return !val || val.length === 0;
      case 'coordenadas': return !val || val.lat === null || val.lat === undefined;
      case 'tabla': return !val || val.length === 0;
      case 'fotos': return !val || val.length === 0;
      case 'checklist': return false;
      case 'siNo': return false;
      default: return !val;
    }
  }

  function marcarError(wrap, activo, mensaje) {
    var input = wrap.querySelector('.oc-input, select, textarea');
    if (input) { input.classList.toggle('oc-input-error', activo); }
    var err = wrap.querySelector('.oc-form-error');
    if (activo) {
      if (!err) {
        err = document.createElement('div');
        err.className = 'oc-form-error';
        wrap.appendChild(err);
      }
      err.textContent = mensaje;
      err.hidden = false;
    } else if (err) {
      err.hidden = true;
    }
  }

  function validate(container) {
    var errores = [];
    (container._ocFormFields || []).forEach(function (f) {
      if (f.wrap.hidden) { marcarError(f.wrap, false); return; }
      var val = container._ocFormState[f.seccionId][f.campo.id];
      if (f.campo.requerido && esVacio(f.campo.tipo, val)) {
        marcarError(f.wrap, true, t('forms.validacion.requerido'));
        errores.push({ seccionId: f.seccionId, campoId: f.campo.id, mensaje: 'requerido' });
        return;
      }
      if (f.campo.tipo === 'numero' && val !== null && val !== undefined && val !== '') {
        if (f.campo.min !== undefined && val < f.campo.min) {
          marcarError(f.wrap, true, t('forms.validacion.minimo'));
          errores.push({ seccionId: f.seccionId, campoId: f.campo.id, mensaje: 'minimo' });
          return;
        }
        if (f.campo.max !== undefined && val > f.campo.max) {
          marcarError(f.wrap, true, t('forms.validacion.maximo'));
          errores.push({ seccionId: f.seccionId, campoId: f.campo.id, mensaje: 'maximo' });
          return;
        }
      }
      marcarError(f.wrap, false);
    });
    return errores;
  }

  global.OCForms = {
    conSeccionesBase: conSeccionesBase,
    render: render,
    collect: collect,
    validate: validate
  };
})(window);
