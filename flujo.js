/* ============================================================
   OCFlujo — vista "Flujo de trabajo" de ObraCore: dibuja el recorrido
   de un proyecto por sus 7 etapas como un diagrama de nodos y cables
   (estilo Node-RED). Expone un único punto de entrada:

     OCFlujo.render(contenedor, ruta)
       ruta   -> { vista: 'flujo', proyectoId: 'PRJ-XXXX' | null }

   Es la única forma de llegar a las etapas de un proyecto: la vista
   general (buscador, filtro por estado, "+ Nuevo proyecto", proyectos
   agrupados por mes de alta) y el detalle con nodos. Todo el estado
   sale de OCStore; localStorage solo guarda la posición arrastrada de
   cada nodo ('obracore.flujoPosiciones.<proyectoId>') y los meses
   abiertos/cerrados ('obracore.flujoMeses').

   Las ventanas flotantes que viven en OC_MAIN.html (desplegable de
   Cotización, menú ⋯ del proyecto, modal de "Nuevo proyecto") se usan
   por el puente window.OCUi, que OC_MAIN.html registra al cargar.

   ETAPAS_CON_PANTALLA / URL_POR_ETAPA son la única fuente: al agregar
   una pantalla de etapa nueva, basta con registrarla aquí.
   ============================================================ */
(function (global) {
  'use strict';

  var ETAPAS_CON_PANTALLA = ['solicitud-cotizacion', 'cotizacion', 'levantamiento-tecnico'];
  var URL_POR_ETAPA = {
    'solicitud-cotizacion': 'OC_SOLICITUD.html',
    'cotizacion': 'OC_COTIZACION.html',
    'levantamiento-tecnico': 'OC_LEVANTAMIENTO.html'
  };

  var COL_W = 230;
  var ROW_H = 96;
  var NODE_W = 196;
  var NODE_H = 60;

  var MESES_KEY = 'obracore.flujoMeses';
  var ESTADOS_MANUALES = ['pausado', 'perdido', 'cancelado'];
  var ESTADOS_PROYECTO = ['prospecto', 'cotizado', 'ganado', 'en_ejecucion', 'terminado', 'pausado', 'perdido', 'cancelado'];

  var arrastreOcurrido = false;
  // Filtro de la vista general: vive aquí para sobrevivir a los
  // re-renders (oc:dataChange, cambio de idioma) sin perder lo escrito.
  var filtro = { texto: '', estado: '' };

  function t(clave) {
    return (global.OC_I18N && global.OC_I18N.t) ? global.OC_I18N.t(clave) : clave;
  }
  function lang() {
    return (global.OC_I18N && global.OC_I18N.getLang) ? global.OC_I18N.getLang() : 'es';
  }

  /* ============================================================
     NAVEGACIÓN A PANTALLAS DE ETAPA — todas las URLs llevan
     desde=flujo para que la pantalla de la etapa sepa que "Volver"
     regresa al detalle del proyecto (#/flujo/PRJ-XXXX) y no al calendario.
     ============================================================ */
  function irADetalle(proyectoId) {
    location.hash = '#/flujo/' + proyectoId;
  }

  function urlEtapa(url, proyectoId, registroId) {
    var q = [];
    if (proyectoId) { q.push('proyecto=' + encodeURIComponent(proyectoId)); }
    if (registroId) { q.push('id=' + encodeURIComponent(registroId)); }
    q.push('desde=flujo');
    return url + '?' + q.join('&');
  }

  function abrirEtapaSinRegistro(proyectoId, etapaId) {
    var url = URL_POR_ETAPA[etapaId];
    if (url) {
      window.location.href = urlEtapa(url, proyectoId, null);
    }
  }

  function abrirRegistro(proyectoId, etapaId, registro) {
    if (registro.tipo === 'solicitud') {
      window.location.href = urlEtapa('OC_SOLICITUD.html', proyectoId, registro.id);
    } else if (registro.tipo === 'levantamiento') {
      window.location.href = urlEtapa('OC_LEVANTAMIENTO.html', proyectoId, registro.id);
    } else if (registro.tipo === 'cotizacion') {
      if (registro.estado === 'borrador') {
        window.location.href = urlEtapa('OC_COTIZACION.html', proyectoId, registro.id);
      } else if (global.OCPdfStore) {
        var cot = global.OCStore.getCotizacion(registro.id);
        if (cot) { global.OCPdfStore.abrirPdf(cot.pdfKey); }
      }
    }
  }

  /* ============================================================
     COLOR POR ESTADO — tabla 1:1 con obracore-design-tokens, sin
     tokens nuevos. El rojo solo aparece por etapa bloqueada o un
     evento vencido ligado a esa etapa.
     ============================================================ */
  function colorDeEtapaToken(etapaInfo, eventosEtapa) {
    if (etapaInfo.estado === 'bloqueada') { return '--oc-alert'; }
    if ((eventosEtapa || []).some(function (e) { return global.OCStore.eventoVencido(e); })) { return '--oc-alert'; }
    if (etapaInfo.estado === 'completada') { return '--oc-ok'; }
    if (etapaInfo.estado === 'en_curso') { return '--oc-accent-gold'; }
    return '--oc-text-muted';
  }

  function colorPorEstadoRegistro(registro) {
    if (registro.estado === 'aceptada' || registro.estado === 'emitida' || registro.estado === 'en_curso') { return '--oc-accent-gold'; }
    if (registro.estado === 'completada') { return '--oc-ok'; }
    if (registro.estado === 'cancelada' || registro.estado === 'rechazada' || registro.estado === 'sustituida') { return '--oc-text-muted'; }
    return '--oc-text-muted';
  }

  function tituloRegistro(registro) {
    if (registro.tipo === 'cotizacion') {
      return registro.id + ' · v' + registro.version + (registro.esAdicional ? ' (' + t('cotizacion.tipo.adicional') + ')' : '');
    }
    return registro.id;
  }

  function subtituloRegistro(registro) {
    if (registro.tipo === 'cotizacion') { return t('cotizacion.estado.' + registro.estado); }
    if (registro.tipo === 'solicitud') { return t('solicitud.estado.' + registro.estado); }
    if (registro.tipo === 'levantamiento') { return t('levantamiento.estado.' + registro.estado) !== 'levantamiento.estado.' + registro.estado ? t('levantamiento.estado.' + registro.estado) : registro.estado; }
    return registro.estado;
  }

  function nombreTipoProyecto(tipoId) {
    var catalogo = (global.OCStore && global.OCStore.TIPOS_PROYECTO) || [];
    var encontrado = null;
    catalogo.forEach(function (tp) { if (tp.id === tipoId) { encontrado = tp; } });
    if (!encontrado) { return tipoId || '—'; }
    return encontrado.nombre[lang()] || encontrado.nombre.es;
  }

  /* ============================================================
     FILTRO — texto (proyecto, cliente o id) y estado.
     ============================================================ */
  function coincideFiltro(proyecto, f) {
    f = f || {};
    if (f.estado && proyecto.estado !== f.estado) { return false; }
    if (f.texto) {
      var clienteNombre = (proyecto.cliente && proyecto.cliente.nombre) || '';
      var hay = (proyecto.nombre + ' ' + proyecto.id + ' ' + clienteNombre).toLowerCase();
      if (hay.indexOf(f.texto) === -1) { return false; }
    }
    return true;
  }

  /* ============================================================
     MESES (localStorage) — { 'YYYY-MM': true|false }. Sin entrada, el
     mes actual está abierto y los demás cerrados.
     ============================================================ */
  function cargarMeses() {
    try {
      var raw = localStorage.getItem(MESES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function guardarMes(clave, abierto) {
    try {
      var todos = cargarMeses();
      todos[clave] = !!abierto;
      localStorage.setItem(MESES_KEY, JSON.stringify(todos));
    } catch (e) { /* sin localStorage: el estado no sobrevive al reload, no rompe nada */ }
  }

  function mesAbierto(clave, guardados) {
    if (Object.prototype.hasOwnProperty.call(guardados, clave)) { return !!guardados[clave]; }
    return clave === global.OCStore.todayISO().slice(0, 7);
  }

  function capitalizar(str) {
    str = str || '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function tituloMes(clave) {
    var partes = clave.split('-');
    var meses = t('cal.months');
    var nombre = Array.isArray(meses) ? meses[parseInt(partes[1], 10) - 1] : partes[1];
    return capitalizar(nombre) + ' ' + partes[0];
  }

  /* ============================================================
     ACCIONES DEL PROYECTO — aviso ⚠ ("todas las cotizaciones quedaron
     rechazadas") y menú ⋯ (Pausar / Marcar como perdido / Cancelar /
     Reactivar). Se usan en cada fila de la vista general y en la barra
     del detalle; las ventanas viven en OC_MAIN.html (window.OCUi).
     ============================================================ */
  function buildAccionesProyecto(proyecto) {
    var wrap = document.createElement('span');
    wrap.className = 'oc-flujo-acciones-proyecto';
    var ui = global.OCUi;
    if (!ui) { return wrap; }

    if (ESTADOS_MANUALES.indexOf(proyecto.estado) === -1
      && global.OCStore.todasCotizacionesRechazadas(proyecto.id)) {
      var aviso = document.createElement('button');
      aviso.type = 'button';
      aviso.className = 'oc-proyecto-aviso-perdido';
      aviso.textContent = '⚠';
      aviso.title = t('proyecto.sugerenciaPerdido.texto');
      aviso.setAttribute('aria-label', t('proyecto.sugerenciaPerdido.texto'));
      aviso.addEventListener('click', function (e) {
        e.stopPropagation();
        ui.mostrarSugerenciaPerdido(proyecto.id);
      });
      wrap.appendChild(aviso);
    }

    var btnMenu = document.createElement('button');
    btnMenu.type = 'button';
    btnMenu.className = 'oc-proyecto-menu-btn';
    btnMenu.textContent = '⋯';
    btnMenu.title = t('flujo.proyecto.acciones');
    btnMenu.setAttribute('aria-label', t('flujo.proyecto.acciones'));
    btnMenu.addEventListener('click', function (e) {
      e.stopPropagation();
      ui.openProyectoMenuDropdown(btnMenu.getBoundingClientRect(), proyecto.id);
    });
    wrap.appendChild(btnMenu);
    return wrap;
  }

  /* ============================================================
     POSICIONES ARRASTRADAS (localStorage, por proyecto)
     ============================================================ */
  function posicionesKey(proyectoId) { return 'obracore.flujoPosiciones.' + proyectoId; }

  function cargarPosiciones(proyectoId) {
    try {
      var raw = localStorage.getItem(posicionesKey(proyectoId));
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function guardarPosicion(proyectoId, key, pos) {
    try {
      var todas = cargarPosiciones(proyectoId);
      todas[key] = { x: Math.round(pos.x), y: Math.round(pos.y) };
      localStorage.setItem(posicionesKey(proyectoId), JSON.stringify(todas));
    } catch (e) { /* sin localStorage: la posición no sobrevive al reload, no rompe nada */ }
  }

  function borrarPosiciones(proyectoId) {
    try { localStorage.removeItem(posicionesKey(proyectoId)); } catch (e) { /* ... */ }
  }

  /* ============================================================
     VISTA GENERAL — una fila compacta por proyecto
     ============================================================ */
  function buildOverviewHead() {
    var head = document.createElement('div');
    head.className = 'oc-flujo-overview-head';

    var colProyecto = document.createElement('div');
    colProyecto.className = 'oc-flujo-overview-col-proyecto';
    colProyecto.textContent = t('flujo.overview.proyecto');
    head.appendChild(colProyecto);

    var todos = global.OCStore.getProyectos();
    global.OCStore.STAGE_IDS.forEach(function (stageId) {
      var col = document.createElement('div');
      col.className = 'oc-flujo-overview-col-etapa oc-flujo-overview-col-etapa--head';
      var nombre = document.createElement('span');
      nombre.className = 'oc-flujo-overview-col-nombre';
      nombre.textContent = t('stage.' + stageId);
      var count = todos.filter(function (p) { return p.etapas[stageId] === 'en_curso'; }).length;
      var contador = document.createElement('span');
      contador.className = 'oc-flujo-overview-col-contador';
      contador.textContent = String(count);
      col.appendChild(nombre);
      col.appendChild(contador);
      head.appendChild(col);
    });
    return head;
  }

  function buildNodoCompacto(etapaInfo, eventosEtapa) {
    var tieneApantalla = ETAPAS_CON_PANTALLA.indexOf(etapaInfo.etapaId) !== -1;
    var colorVar = colorDeEtapaToken(etapaInfo, eventosEtapa);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'oc-flujo-nodo-compacto' + (tieneApantalla ? '' : ' oc-flujo-nodo-compacto--proximamente');
    btn.style.setProperty('--nodo-color', 'var(' + colorVar + ')');
    var titulo = t('stage.' + etapaInfo.etapaId) + ' — ' + t('stage.estado.' + etapaInfo.estado);
    btn.title = titulo;
    btn.setAttribute('aria-label', titulo);
    if (etapaInfo.registros.length > 1) {
      var badge = document.createElement('span');
      badge.className = 'oc-flujo-nodo-compacto-badge';
      badge.textContent = String(etapaInfo.registros.length);
      btn.appendChild(badge);
    }
    if (!tieneApantalla) {
      btn.disabled = true;
    }
    return btn;
  }

  function clickNodoCompacto(proyecto, etapaInfo, anchor) {
    var tieneApantalla = ETAPAS_CON_PANTALLA.indexOf(etapaInfo.etapaId) !== -1;
    if (etapaInfo.etapaId === 'cotizacion' && global.OCUi) {
      // Cotizar / Ir a cotización / Ver lista: desplegable anclado a la celda.
      global.OCUi.openCotizacionDropdown(anchor.getBoundingClientRect(), proyecto.id);
    } else if (tieneApantalla && etapaInfo.registros.length > 0) {
      abrirRegistro(proyecto.id, etapaInfo.etapaId, etapaInfo.registros[0]);
    } else if (tieneApantalla) {
      abrirEtapaSinRegistro(proyecto.id, etapaInfo.etapaId);
    } else {
      irADetalle(proyecto.id);
    }
  }

  function buildOverviewRow(p) {
    var row = document.createElement('div');
    row.className = 'oc-flujo-overview-row oc-flujo-fila-entrando';
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');
    row.addEventListener('click', function () { irADetalle(p.id); });
    row.addEventListener('keydown', function (e) {
      // Enter/Espacio sobre un botón interno (⋯, ⚠, nodo) lo resuelve el propio botón.
      if ((e.key === 'Enter' || e.key === ' ') && e.target === row) {
        e.preventDefault(); // el espacio no debe desplazar la lista
        irADetalle(p.id);
      }
    });

    var colProyecto = document.createElement('div');
    colProyecto.className = 'oc-flujo-overview-col-proyecto';
    var nombre = document.createElement('div');
    nombre.className = 'oc-flujo-overview-nombre';
    nombre.textContent = p.nombre;
    var meta = document.createElement('div');
    meta.className = 'oc-flujo-overview-meta';
    meta.textContent = ((p.cliente && p.cliente.nombre) || '') + ' · ' + p.id;
    var estadoPill = document.createElement('span');
    estadoPill.className = 'oc-proyecto-estado oc-proyecto-estado--' + p.estado;
    estadoPill.textContent = t('proyecto.estado.' + p.estado);
    colProyecto.appendChild(nombre);
    colProyecto.appendChild(meta);
    colProyecto.appendChild(estadoPill);
    colProyecto.appendChild(buildAccionesProyecto(p));
    row.appendChild(colProyecto);

    var eventos = global.OCStore.getEventosDeProyecto(p.id);
    var etapas = global.OCStore.getEtapasDeProyecto(p.id);
    etapas.forEach(function (et, idx) {
      var eventosEtapa = eventos.filter(function (e) { return e.etapa === et.etapaId; });
      var celda = document.createElement('div');
      celda.className = 'oc-flujo-overview-col-etapa';
      if (idx < etapas.length - 1) {
        celda.style.setProperty('--etapa-color', 'var(' + colorDeEtapaToken(et, eventosEtapa) + ')');
      }
      var pill = buildNodoCompacto(et, eventosEtapa);
      pill.addEventListener('click', function (e) {
        e.stopPropagation();
        clickNodoCompacto(p, et, pill);
      });
      celda.appendChild(pill);
      row.appendChild(celda);
    });

    return row;
  }

  function buildOverviewToolbar(onFiltro) {
    var bar = document.createElement('div');
    bar.className = 'oc-flujo-overview-toolbar';

    var inputTexto = document.createElement('input');
    inputTexto.type = 'text';
    inputTexto.className = 'oc-input oc-flujo-filtro-texto';
    inputTexto.value = filtro.texto;
    inputTexto.placeholder = t('flujo.filtro.texto');
    inputTexto.setAttribute('aria-label', t('flujo.filtro.texto'));
    inputTexto.addEventListener('input', function () {
      filtro.texto = inputTexto.value.trim().toLowerCase();
      onFiltro();
    });
    bar.appendChild(inputTexto);

    var selectEstado = document.createElement('select');
    selectEstado.className = 'oc-input oc-flujo-filtro-estado';
    selectEstado.setAttribute('aria-label', t('flujo.filtro.estadoAria'));
    var optTodos = document.createElement('option');
    optTodos.value = '';
    optTodos.textContent = t('flujo.filtro.estadoTodos');
    selectEstado.appendChild(optTodos);
    ESTADOS_PROYECTO.forEach(function (estado) {
      var opt = document.createElement('option');
      opt.value = estado;
      opt.textContent = t('proyecto.estado.' + estado);
      selectEstado.appendChild(opt);
    });
    selectEstado.value = filtro.estado;
    selectEstado.addEventListener('change', function () {
      filtro.estado = selectEstado.value;
      onFiltro();
    });
    bar.appendChild(selectEstado);

    var btnNuevo = document.createElement('button');
    btnNuevo.type = 'button';
    btnNuevo.className = 'oc-btn oc-btn-primary oc-flujo-btn-nuevo';
    btnNuevo.textContent = t('flujo.nuevoProyecto');
    btnNuevo.addEventListener('click', function () {
      if (global.OCUi) { global.OCUi.openNuevoProyectoModal(null, { desde: 'flujo' }); }
    });
    bar.appendChild(btnNuevo);

    return bar;
  }

  function buildMesGrupo(clave, proyectos, abierto, persistir) {
    var grupo = document.createElement('section');
    grupo.className = 'oc-flujo-mes' + (abierto ? ' oc-flujo-mes--abierto' : '');

    var cabecera = document.createElement('button');
    cabecera.type = 'button';
    cabecera.className = 'oc-flujo-mes-cabecera';
    cabecera.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    var caret = document.createElement('span');
    caret.className = 'oc-flujo-mes-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '▸';
    var titulo = document.createElement('span');
    titulo.className = 'oc-flujo-mes-titulo';
    titulo.textContent = tituloMes(clave);
    var contador = document.createElement('span');
    contador.className = 'oc-flujo-mes-contador';
    contador.textContent = '· ' + proyectos.length;
    cabecera.appendChild(caret);
    cabecera.appendChild(titulo);
    cabecera.appendChild(contador);
    grupo.appendChild(cabecera);

    var filas = document.createElement('div');
    filas.className = 'oc-flujo-mes-filas';
    proyectos.forEach(function (p, i) {
      var row = buildOverviewRow(p);
      row.style.animationDelay = Math.min(i * 15, 280) + 'ms';
      filas.appendChild(row);
    });
    grupo.appendChild(filas);

    cabecera.addEventListener('click', function () {
      var ahoraAbierto = !grupo.classList.contains('oc-flujo-mes--abierto');
      grupo.classList.toggle('oc-flujo-mes--abierto', ahoraAbierto);
      cabecera.setAttribute('aria-expanded', ahoraAbierto ? 'true' : 'false');
      // Con búsqueda activa el mes se muestra abierto a la fuerza: no se persiste.
      if (persistir) { guardarMes(clave, ahoraAbierto); }
    });
    return grupo;
  }

  function renderOverview(container) {
    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'oc-flujo-overview';

    var body = document.createElement('div');
    body.className = 'oc-flujo-overview-body';

    // Solo se redibuja el cuerpo al filtrar: así el input no pierde el foco.
    function renderCuerpo() {
      body.innerHTML = '';
      var proyectos = global.OCStore.getProyectos().filter(function (p) { return coincideFiltro(p, filtro); });
      if (proyectos.length === 0) {
        var vacio = document.createElement('div');
        vacio.className = 'oc-flujo-vacio';
        vacio.textContent = t('flujo.sinResultados');
        body.appendChild(vacio);
        return;
      }
      var porMes = {};
      proyectos.forEach(function (p) {
        var clave = (p.fechaAlta || '').slice(0, 7);
        (porMes[clave] = porMes[clave] || []).push(p);
      });
      var guardados = cargarMeses();
      var forzarAbierto = !!filtro.texto;
      Object.keys(porMes).sort().reverse().forEach(function (clave) {
        porMes[clave].sort(function (a, b) {
          if (a.fechaAlta !== b.fechaAlta) { return a.fechaAlta < b.fechaAlta ? 1 : -1; }
          return (a.creadoEn || '') < (b.creadoEn || '') ? 1 : -1;
        });
        body.appendChild(buildMesGrupo(clave, porMes[clave], forzarAbierto || mesAbierto(clave, guardados), !forzarAbierto));
      });
    }

    wrap.appendChild(buildOverviewToolbar(renderCuerpo));
    wrap.appendChild(buildOverviewHead());
    wrap.appendChild(body);
    renderCuerpo();
    container.appendChild(wrap);
  }

  /* ============================================================
     DETALLE — lienzo tipo Node-RED
     ============================================================ */
  function construirGrafo(proyectoId) {
    var proyecto = global.OCStore.getProyecto(proyectoId);
    if (!proyecto) { return null; }
    var etapas = global.OCStore.getEtapasDeProyecto(proyectoId);
    var eventos = global.OCStore.getEventosDeProyecto(proyectoId);
    var cotizaciones = global.OCStore.getCotizacionesPorProyecto(proyectoId);
    var posicionesGuardadas = cargarPosiciones(proyectoId);

    function obtenerPos(key, colX, yBase) {
      if (posicionesGuardadas[key]) { return posicionesGuardadas[key]; }
      return { x: colX, y: yBase };
    }

    var nodos = [];
    var cables = [];

    var sol = global.OCStore.getSolicitudPorProyecto(proyectoId);
    // fuenteLead es texto libre/opciones sin i18n propio (ver OC_SOLICITUD.html
    // #dg-fuente): se muestra tal cual se guardó, sin traducir.
    var origenTexto = proyecto.fechaAlta;
    if (sol && sol.generales && sol.generales.fuenteLead) {
      origenTexto += ' · ' + sol.generales.fuenteLead;
    }
    nodos.push({
      key: 'entrada', tipo: 'entrada', col: 0,
      pos: obtenerPos('entrada', 0, 0),
      titulo: t('flujo.nodo.entrada'),
      subtitulo: origenTexto,
      colorVar: '--oc-ok', navegable: false
    });

    var nodoAnteriorTroncoKey = 'entrada';
    global.OCStore.STAGE_IDS.forEach(function (stageId, i) {
      var col = (i + 1) * COL_W;
      var etapaInfo = etapas[i];
      var eventosEtapa = eventos.filter(function (e) { return e.etapa === stageId; });
      var colorVar = colorDeEtapaToken(etapaInfo, eventosEtapa);
      var tieneApantalla = ETAPAS_CON_PANTALLA.indexOf(stageId) !== -1;
      var troncoKey = 'etapa:' + stageId;

      var subtitulo = t('stage.estado.' + etapaInfo.estado);
      if (eventosEtapa.length) {
        subtitulo += ' · 📅 ' + eventosEtapa[0].fecha;
      }

      nodos.push({
        key: troncoKey, tipo: 'tronco', col: col, etapaId: stageId,
        pos: obtenerPos(troncoKey, col, 0),
        titulo: t('stage.' + stageId),
        subtitulo: subtitulo,
        colorVar: colorVar,
        navegable: tieneApantalla,
        proximamente: !tieneApantalla,
        eventos: eventosEtapa
      });
      cables.push({
        de: nodoAnteriorTroncoKey, a: troncoKey, tipo: 'spine', colorVar: colorVar,
        activo: etapaInfo.estado === 'en_curso'
      });
      nodoAnteriorTroncoKey = troncoKey;

      etapaInfo.registros.forEach(function (registro, idx) {
        var regKey = 'registro:' + registro.id;
        var cotFull = registro.tipo === 'cotizacion'
          ? cotizaciones.filter(function (c) { return c.id === registro.id; })[0]
          : null;
        var atenuado = registro.estado === 'sustituida' || registro.estado === 'rechazada';
        nodos.push({
          key: regKey, tipo: 'registro', col: col, etapaId: stageId, registro: registro,
          pos: obtenerPos(regKey, col, ROW_H * (idx + 1)),
          titulo: tituloRegistro(registro),
          subtitulo: subtituloRegistro(registro),
          colorVar: atenuado ? '--oc-text-muted' : colorPorEstadoRegistro(registro),
          atenuado: atenuado, navegable: true
        });
        cables.push({ de: troncoKey, a: regKey, tipo: 'rama', colorVar: '--oc-border' });

        if (cotFull && cotFull.tipo === 'actualizacion' && cotFull.basadaEn) {
          var anterior = cotizaciones.filter(function (c) { return c.id === cotFull.basadaEn; })[0];
          if (anterior && anterior.estado === 'sustituida') {
            cables.push({
              de: 'registro:' + anterior.id, a: regKey, tipo: 'recotizar',
              colorVar: '--oc-accent-gold', etiqueta: t('flujo.cable.recotizar')
            });
          }
        }
      });
    });

    var entregadoColor = proyecto.etapas['comisionamiento-calidad'] === 'completada' ? '--oc-ok' : '--oc-text-muted';
    nodos.push({
      key: 'entregado', tipo: 'entregado', col: (global.OCStore.STAGE_IDS.length + 1) * COL_W,
      pos: obtenerPos('entregado', (global.OCStore.STAGE_IDS.length + 1) * COL_W, 0),
      titulo: t('flujo.nodo.entregado'), subtitulo: '',
      colorVar: entregadoColor, navegable: false
    });
    cables.push({ de: nodoAnteriorTroncoKey, a: 'entregado', tipo: 'spine', colorVar: entregadoColor, activo: false });

    return { proyecto: proyecto, nodos: nodos, cables: cables };
  }

  function construirTooltip(n) {
    var partes = [n.titulo];
    if (n.subtitulo) { partes.push(n.subtitulo); }
    if (n.eventos && n.eventos.length > 1) {
      n.eventos.forEach(function (e) {
        partes.push('📅 ' + e.fecha + ' · ' + t('evento.estado.' + e.estado));
      });
    }
    return partes.join('\n');
  }

  // Se usa la propiedad `translate` (no `transform`) para la posición:
  // así `transform` queda libre para el hover/arrastre en CSS (lift +
  // glow) sin pisar la posición del nodo en el lienzo.
  function posicionarNodo(btn, pos) {
    btn.style.translate = pos.x + 'px ' + pos.y + 'px';
  }

  function abrirNodo(n, proyectoId, anchor) {
    if (!n.navegable) { return; }
    if (n.tipo === 'registro') {
      abrirRegistro(proyectoId, n.etapaId, n.registro);
      return;
    }
    if (n.tipo === 'tronco') {
      if (n.etapaId === 'cotizacion' && global.OCUi) {
        // Cotizar / Ir a cotización / Ver lista: desplegable anclado al nodo.
        global.OCUi.openCotizacionDropdown(anchor.getBoundingClientRect(), proyectoId);
        return;
      }
      var etapas = global.OCStore.getEtapasDeProyecto(proyectoId);
      var et = etapas.filter(function (e) { return e.etapaId === n.etapaId; })[0];
      if (et && et.registros.length > 0) {
        abrirRegistro(proyectoId, n.etapaId, et.registros[0]);
      } else {
        abrirEtapaSinRegistro(proyectoId, n.etapaId);
      }
    }
  }

  function buildNodoBoton(n, proyectoId) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'oc-flujo-nodo oc-flujo-nodo--' + n.tipo +
      (n.proximamente ? ' oc-flujo-nodo--proximamente' : '') +
      (n.atenuado ? ' oc-flujo-nodo--atenuado' : '');
    btn.style.setProperty('--nodo-color', 'var(' + n.colorVar + ')');
    btn.dataset.nodeKey = n.key;

    var titulo = document.createElement('span');
    titulo.className = 'oc-flujo-nodo-titulo';
    titulo.textContent = n.titulo;
    btn.appendChild(titulo);

    if (n.subtitulo) {
      var sub = document.createElement('span');
      sub.className = 'oc-flujo-nodo-subtitulo';
      sub.textContent = n.subtitulo;
      btn.appendChild(sub);
    }

    var tooltip = construirTooltip(n);
    btn.title = tooltip;
    btn.setAttribute('aria-label', tooltip.replace(/\n/g, ', '));

    if (!n.navegable) {
      btn.disabled = true;
    }
    btn.addEventListener('click', function () {
      if (arrastreOcurrido) { return; }
      abrirNodo(n, proyectoId, btn);
    });

    return btn;
  }

  function puntoSalida(n) { return { x: n.pos.x + NODE_W, y: n.pos.y + NODE_H / 2 }; }
  function puntoEntrada(n) { return { x: n.pos.x, y: n.pos.y + NODE_H / 2 }; }
  function puntoAbajo(n) { return { x: n.pos.x + NODE_W / 2, y: n.pos.y + NODE_H }; }
  function puntoArriba(n) { return { x: n.pos.x + NODE_W / 2, y: n.pos.y }; }

  function calcularD(c, origen, destino) {
    if (c.tipo === 'rama') {
      var p1 = puntoAbajo(origen);
      var p2 = puntoArriba(destino);
      var dy = Math.max(20, (p2.y - p1.y) * 0.5);
      return 'M ' + p1.x + ',' + p1.y + ' C ' + p1.x + ',' + (p1.y + dy) + ' ' + p2.x + ',' + (p2.y - dy) + ' ' + p2.x + ',' + p2.y;
    }
    if (c.tipo === 'recotizar') {
      var o = puntoSalida(origen), d = puntoEntrada(destino);
      var arriba = Math.min(o.y, d.y) - 70;
      return 'M ' + o.x + ',' + o.y + ' C ' + o.x + ',' + arriba + ' ' + d.x + ',' + arriba + ' ' + d.x + ',' + d.y;
    }
    var o2 = puntoSalida(origen), d2 = puntoEntrada(destino);
    var dx = Math.max(40, (d2.x - o2.x) * 0.5);
    return 'M ' + o2.x + ',' + o2.y + ' C ' + (o2.x + dx) + ',' + o2.y + ' ' + (d2.x - dx) + ',' + d2.y + ' ' + d2.x + ',' + d2.y;
  }

  function actualizarCablePath(c, nodosPorKey) {
    var origen = nodosPorKey[c.de];
    var destino = nodosPorKey[c.a];
    if (!origen || !destino || !c.el) { return; }
    c.el.setAttribute('d', calcularD(c, origen, destino));
  }

  function buildCablePath(c, nodosPorKey, svgNS) {
    var path = document.createElementNS(svgNS, 'path');
    path.setAttribute('class', 'oc-flujo-cable oc-flujo-cable--' + c.tipo);
    path.style.stroke = 'var(' + c.colorVar + ')';
    c.el = path;
    actualizarCablePath(c, nodosPorKey);
    return path;
  }

  function dibujarCable(c) {
    if (c.activo) {
      c.el.classList.add('oc-flujo-cable--activo');
      return;
    }
    try {
      var length = c.el.getTotalLength();
      c.el.style.strokeDasharray = String(length);
      c.el.style.strokeDashoffset = String(length);
      c.el.getBoundingClientRect();
      c.el.style.transition = 'stroke-dashoffset 0.4s var(--oc-ease-out)';
      c.el.style.strokeDashoffset = '0';
    } catch (e) { /* path sin longitud calculable (navegador raro): se omite el dibujado */ }
  }

  function animarEntradaGrafo(grafo) {
    var porColumna = {};
    grafo.nodos.forEach(function (n) {
      (porColumna[n.col] = porColumna[n.col] || []).push(n);
    });
    var columnas = Object.keys(porColumna).map(Number).sort(function (a, b) { return a - b; });
    columnas.forEach(function (col, i) {
      porColumna[col].forEach(function (n) {
        n.el.style.animationDelay = (i * 40) + 'ms';
        n.el.classList.add('oc-flujo-nodo-entrando');
      });
    });
    requestAnimationFrame(function () {
      grafo.cables.forEach(function (c) { dibujarCable(c); });
    });
  }

  function calcularAjuste(canvasWrap, grafo) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    grafo.nodos.forEach(function (n) {
      minX = Math.min(minX, n.pos.x);
      minY = Math.min(minY, n.pos.y);
      maxX = Math.max(maxX, n.pos.x + NODE_W);
      maxY = Math.max(maxY, n.pos.y + NODE_H);
    });
    var pad = 60;
    var anchoContenido = Math.max(1, maxX - minX + pad * 2);
    var altoContenido = Math.max(1, maxY - minY + pad * 2);
    var rect = canvasWrap.getBoundingClientRect();
    var zoom = Math.min(2, Math.max(0.5, Math.min(rect.width / anchoContenido, rect.height / altoContenido)));
    return {
      zoom: zoom,
      pan: {
        x: (rect.width - (maxX - minX) * zoom) / 2 - minX * zoom,
        y: (rect.height - (maxY - minY) * zoom) / 2 - minY * zoom
      }
    };
  }

  function configurarInteraccion(container, canvasWrap, world, grafo, proyectoId, nodosPorKey) {
    var pan = { x: 70, y: 170 };
    var zoom = 1;

    function aplicarTransform() {
      world.style.transform = 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + zoom + ')';
    }

    function irA(nuevoPan, nuevoZoom, animar) {
      pan = nuevoPan;
      zoom = Math.min(2, Math.max(0.5, nuevoZoom));
      if (animar) {
        world.classList.add('oc-flujo-world--animando');
        setTimeout(function () { world.classList.remove('oc-flujo-world--animando'); }, 320);
      }
      aplicarTransform();
    }

    var inicial = calcularAjuste(canvasWrap, grafo);
    irA(inicial.pan, inicial.zoom, false);

    // Pan del fondo (clic fuera de cualquier nodo)
    var panActivo = false, panInicio = null;
    canvasWrap.addEventListener('mousedown', function (e) {
      if (e.target.closest('.oc-flujo-nodo, .oc-flujo-nodo-compacto')) { return; }
      panActivo = true;
      panInicio = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    });
    window.addEventListener('mousemove', function (e) {
      if (!panActivo) { return; }
      pan = { x: e.clientX - panInicio.x, y: e.clientY - panInicio.y };
      aplicarTransform();
    });
    window.addEventListener('mouseup', function () { panActivo = false; });

    // Zoom con rueda, centrado en el cursor
    canvasWrap.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = canvasWrap.getBoundingClientRect();
      var cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      var factor = e.deltaY < 0 ? 1.08 : 0.92;
      var nuevoZoom = Math.min(2, Math.max(0.5, zoom * factor));
      var nuevoPan = {
        x: cursor.x - (cursor.x - pan.x) * (nuevoZoom / zoom),
        y: cursor.y - (cursor.y - pan.y) * (nuevoZoom / zoom)
      };
      irA(nuevoPan, nuevoZoom, false);
    }, { passive: false });

    // Arrastre libre de nodos
    grafo.nodos.forEach(function (n) {
      var btn = n.el;
      var arrastrando = false, offset = null;
      btn.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        arrastrando = true;
        offset = { x: e.clientX, y: e.clientY, origX: n.pos.x, origY: n.pos.y };
        btn.classList.add('oc-flujo-nodo--arrastrando');
      });
      window.addEventListener('mousemove', function (e) {
        if (!arrastrando) { return; }
        var dx = (e.clientX - offset.x) / zoom;
        var dy = (e.clientY - offset.y) / zoom;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { arrastreOcurrido = true; }
        n.pos = { x: offset.origX + dx, y: offset.origY + dy };
        requestAnimationFrame(function () {
          posicionarNodo(btn, n.pos);
          grafo.cables.forEach(function (c) {
            if (c.de === n.key || c.a === n.key) { actualizarCablePath(c, nodosPorKey); }
          });
        });
      });
      window.addEventListener('mouseup', function () {
        if (!arrastrando) { return; }
        arrastrando = false;
        btn.classList.remove('oc-flujo-nodo--arrastrando');
        if (arrastreOcurrido) {
          guardarPosicion(proyectoId, n.key, n.pos);
        }
        setTimeout(function () { arrastreOcurrido = false; }, 0);
      });
    });

    // Barra de herramientas
    var toolbar = container.querySelector('.oc-flujo-toolbar');
    function zoomCentrado(factor) {
      var rect = canvasWrap.getBoundingClientRect();
      var centro = { x: rect.width / 2, y: rect.height / 2 };
      var nuevoZoom = zoom * factor;
      var nuevoPan = {
        x: centro.x - (centro.x - pan.x) * (nuevoZoom / zoom),
        y: centro.y - (centro.y - pan.y) * (nuevoZoom / zoom)
      };
      irA(nuevoPan, nuevoZoom, true);
    }
    toolbar.querySelector('[data-accion=acercar]').addEventListener('click', function () { zoomCentrado(1.25); });
    toolbar.querySelector('[data-accion=alejar]').addEventListener('click', function () { zoomCentrado(0.8); });
    toolbar.querySelector('[data-accion=ajustar]').addEventListener('click', function () {
      var objetivo = calcularAjuste(canvasWrap, grafo);
      irA(objetivo.pan, objetivo.zoom, true);
    });
    toolbar.querySelector('[data-accion=restablecer]').addEventListener('click', function () {
      borrarPosiciones(proyectoId);
      render(container, { vista: 'flujo', proyectoId: proyectoId });
    });
  }

  function calcularSiguientePaso(proyectoId) {
    var sol = global.OCStore.getSolicitudPorProyecto(proyectoId);
    if (!sol) { return t('flujo.siguientePaso.capturarSolicitud'); }

    var cots = global.OCStore.getCotizacionesPorProyecto(proyectoId);
    var vigentes = cots.filter(function (c) { return c.estado !== 'sustituida' && c.estado !== 'borrador'; });
    var hayAceptada = vigentes.some(function (c) { return c.estado === 'aceptada'; });
    var hayEmitidaSinResponder = vigentes.length > 0 && vigentes.every(function (c) { return c.estado === 'emitida'; });

    if (cots.length === 0) { return t('flujo.siguientePaso.emitirCotizacion'); }
    if (hayEmitidaSinResponder) { return t('flujo.siguientePaso.esperarRespuesta'); }

    var lev = global.OCStore.getLevantamientoPorProyecto(proyectoId);
    if (hayAceptada && !lev) { return t('flujo.siguientePaso.agendarLevantamiento'); }

    var proyecto = global.OCStore.getProyecto(proyectoId);
    if (proyecto.etapas['comisionamiento-calidad'] === 'completada') { return t('flujo.siguientePaso.entregado'); }
    if (lev && lev.estado === 'completada') { return t('flujo.siguientePaso.continuarSiguienteEtapa'); }

    return t('flujo.siguientePaso.enProgreso');
  }

  function buildPanelLateral(proyecto, proyectoId) {
    var aside = document.createElement('aside');
    aside.className = 'oc-flujo-panel-lateral';

    var btnToggle = document.createElement('button');
    btnToggle.type = 'button';
    btnToggle.className = 'oc-flujo-panel-toggle';
    btnToggle.textContent = '›';
    var etiquetaToggle = t('flujo.panel.alternar');
    btnToggle.title = etiquetaToggle;
    btnToggle.setAttribute('aria-label', etiquetaToggle);
    btnToggle.addEventListener('click', function () {
      aside.classList.toggle('oc-flujo-panel-lateral--cerrado');
    });
    aside.appendChild(btnToggle);

    var contenido = document.createElement('div');
    contenido.className = 'oc-flujo-panel-contenido';

    var h1 = document.createElement('h3');
    h1.textContent = t('flujo.panel.resumen');
    contenido.appendChild(h1);

    [
      [t('proyecto.nuevo.campo.clienteNombre'), (proyecto.cliente && proyecto.cliente.nombre) || '—'],
      [t('proyecto.nuevo.campo.tipo'), nombreTipoProyecto(proyecto.tipo)],
      [t('proyecto.nuevo.campo.fechaAlta'), proyecto.fechaAlta],
      [t('proyecto.nuevo.campo.ubicacion'), proyecto.ubicacion || '—']
    ].forEach(function (par) {
      var fila = document.createElement('div');
      fila.className = 'oc-flujo-panel-dato';
      var label = document.createElement('span');
      label.className = 'oc-flujo-panel-dato-label';
      label.textContent = par[0];
      var valor = document.createElement('span');
      valor.textContent = par[1];
      fila.appendChild(label);
      fila.appendChild(valor);
      contenido.appendChild(fila);
    });

    var estadoPill = document.createElement('span');
    estadoPill.className = 'oc-proyecto-estado oc-proyecto-estado--' + proyecto.estado;
    estadoPill.textContent = t('proyecto.estado.' + proyecto.estado);
    contenido.appendChild(estadoPill);

    var h2 = document.createElement('h3');
    h2.textContent = t('flujo.panel.siguientePaso');
    contenido.appendChild(h2);

    var siguiente = document.createElement('p');
    siguiente.className = 'oc-flujo-siguiente-paso';
    siguiente.textContent = calcularSiguientePaso(proyectoId);
    contenido.appendChild(siguiente);

    aside.appendChild(contenido);
    return aside;
  }

  function buildToolbar(proyecto) {
    var bar = document.createElement('div');
    bar.className = 'oc-flujo-toolbar';

    var btnVolver = document.createElement('button');
    btnVolver.type = 'button';
    btnVolver.className = 'oc-btn oc-btn-secondary';
    btnVolver.textContent = t('flujo.volver');
    btnVolver.addEventListener('click', function () { location.hash = '#/flujo'; });
    bar.appendChild(btnVolver);

    var titulo = document.createElement('div');
    titulo.className = 'oc-flujo-toolbar-titulo';
    titulo.textContent = proyecto.nombre + ' · ' + proyecto.id;
    bar.appendChild(titulo);
    bar.appendChild(buildAccionesProyecto(proyecto));

    var controles = document.createElement('div');
    controles.className = 'oc-flujo-toolbar-controles';
    [
      ['alejar', '−', 'flujo.zoom.alejar'],
      ['acercar', '+', 'flujo.zoom.acercar'],
      ['ajustar', '⤢', 'flujo.zoom.ajustar'],
      ['restablecer', '↺', 'flujo.zoom.restablecer']
    ].forEach(function (def) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'oc-flujo-zoom-btn';
      btn.dataset.accion = def[0];
      btn.textContent = def[1];
      var etiqueta = t(def[2]);
      btn.title = etiqueta;
      btn.setAttribute('aria-label', etiqueta);
      controles.appendChild(btn);
    });
    bar.appendChild(controles);

    return bar;
  }

  function renderDetail(container, proyectoId) {
    var grafo = construirGrafo(proyectoId);
    container.innerHTML = '';
    if (!grafo) {
      var vacio = document.createElement('div');
      vacio.className = 'oc-flujo-vacio';
      vacio.textContent = t('flujo.detalle.noEncontrado');
      container.appendChild(vacio);
      return;
    }

    var wrap = document.createElement('div');
    wrap.className = 'oc-flujo-detail';

    wrap.appendChild(buildToolbar(grafo.proyecto));

    var canvasWrap = document.createElement('div');
    canvasWrap.className = 'oc-flujo-canvas-wrap';

    var world = document.createElement('div');
    world.className = 'oc-flujo-world';

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'oc-flujo-cables');
    world.appendChild(svg);

    var nodosPorKey = {};
    grafo.nodos.forEach(function (n) { nodosPorKey[n.key] = n; });

    grafo.cables.forEach(function (c) {
      svg.appendChild(buildCablePath(c, nodosPorKey, svgNS));
    });
    grafo.nodos.forEach(function (n) {
      var btn = buildNodoBoton(n, proyectoId);
      posicionarNodo(btn, n.pos);
      world.appendChild(btn);
      n.el = btn;
    });
    // Las rutas se construyeron antes que los nodos tuvieran su
    // elemento final en el DOM; se recalculan una vez que todo existe.
    grafo.cables.forEach(function (c) { actualizarCablePath(c, nodosPorKey); });

    canvasWrap.appendChild(world);
    var body = document.createElement('div');
    body.className = 'oc-flujo-body';
    body.appendChild(canvasWrap);
    body.appendChild(buildPanelLateral(grafo.proyecto, proyectoId));
    wrap.appendChild(body);

    container.appendChild(wrap);

    configurarInteraccion(container, canvasWrap, world, grafo, proyectoId, nodosPorKey);
    animarEntradaGrafo(grafo);
  }

  /* ============================================================
     API PÚBLICA
     ============================================================ */
  function render(container, ruta) {
    if (ruta && ruta.proyectoId) {
      renderDetail(container, ruta.proyectoId);
    } else {
      renderOverview(container);
    }
  }

  // El cable "activo" (etapa en_curso) se pausa si la pestaña no está
  // visible — única excepción de loop permitida junto con oc-pulse,
  // documentada en la skill obracore-motion.
  document.addEventListener('visibilitychange', function () {
    document.documentElement.classList.toggle('oc-flujo-pausado', document.hidden);
  });

  global.OCFlujo = { render: render };
})(window);
