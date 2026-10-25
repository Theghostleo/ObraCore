/* ============================================================
   OCStore — capa de datos compartida entre OC_MAIN.html,
   OC_SOLICITUD.html y OC_COTIZACION.html. Persiste en localStorage
   bajo una sola clave; si el navegador no lo permite (modo privado,
   cuotas, etc.) sigue funcionando en memoria para no romper la UI,
   solo que sin sobrevivir a un refresh.

   Ninguna pantalla toca localStorage directamente: todo pasa por
   las funciones expuestas en window.OCStore. El PDF en sí NO vive
   aquí (eso es OCPdfStore, sobre IndexedDB): este archivo solo
   guarda los datos de la cotización y la clave (pdfKey) con la que
   se busca su PDF.

   Entidad central: PROYECTO (no la fecha). Una solicitud y sus
   cotizaciones cuelgan de un proyectoId; el calendario muestra
   EVENTOS (visitas, levantamientos, instalaciones, entregas,
   seguimientos) que también apuntan a un proyectoId. Esto permite
   varias instalaciones el mismo día sin que se pisen entre sí.

   Uso — proyectos:
     OCStore.crearProyecto(datos)                 -> proyecto (fechaAlta: hoy si no se especifica)
     OCStore.actualizarProyecto(id, cambios)       -> proyecto | null
     OCStore.getProyecto(id)                       -> proyecto | null
     OCStore.getProyectos()                        -> [proyecto]
     OCStore.getArbolProyectos()                   -> [{clienteId, clienteNombre, proyectos:[...]}] (agrupado por cliente; sin uso en la UI actual, se conserva por si hace falta)
     OCStore.getEtapasDeProyecto(proyectoId)        -> [{etapaId, estado, registros:[...]}]
     OCStore.getSolicitudPorProyecto(proyectoId)    -> solicitud | null
     OCStore.getCotizacionesPorProyecto(proyectoId) -> [cotización]
     OCStore.STAGE_IDS                             -> [idEtapa] (las 7 etapas, fuente única)

   Uso — eventos (calendario):
     OCStore.crearEvento(datos)              -> evento (estado inicial: tentativa si es
                                                 operativa, pendiente si es hito)
     OCStore.actualizarEvento(id, cambios)   -> evento | null (así se avanza su estado:
                                                 actualizarEvento(id, {estado:'confirmada'}))
     OCStore.getEvento(id)                   -> evento | null
     OCStore.getEventosDeProyecto(proyectoId) -> [evento]
     OCStore.getEventosPorFecha('YYYY-MM-DD') -> [evento] (incluye actividades multi-día
                                                 cuyo rango [fecha,fechaFin] toque esa fecha)
     OCStore.getEventosDelMes(anio, mes0a11)  -> { 'YYYY-MM-DD': [evento] }
     OCStore.getEstadoDia('YYYY-MM-DD')      -> 'libre' | 'reservado' | 'ocupado'
     OCStore.diaDeActividad(evento, 'YYYY-MM-DD') -> {dia, total} | null (si es multi-día)
     OCStore.eventoVencido(evento)           -> bool (operativa confirmada/en_ejecucion
                                                 cuya fecha ya pasó — único disparador del rojo)
     OCStore.TIPOS_EVENTO                    -> mapa { tipo: {clase: 'operativa'|'hito'} }
     OCStore.claseDeEvento(tipo)             -> 'operativa' | 'hito'

   Uso — recordatorios (tareas del menú del día; sin proyecto, no afectan getEstadoDia):
     OCStore.crearRecordatorio({fecha, hora?, titulo, nota?}) -> recordatorio (id 'REC-0001', hecho:false)
     OCStore.actualizarRecordatorio(id, cambios)  -> recordatorio | null
     OCStore.eliminarRecordatorio(id)             -> bool
     OCStore.getRecordatoriosPorFecha('YYYY-MM-DD') -> [recordatorio] (pendientes primero, luego por hora)

   Uso — estado de proyecto (automático):
     OCStore.recalcularEstadoProyecto(id)    -> recalcula salvo que el estado sea manual
                                                 (pausado/perdido/cancelado); se llama solo
     OCStore.reactivarProyecto(id)           -> fuerza el recálculo ignorando el estado
                                                 manual (usado por "Reactivar" en el menú ⋯)

   Uso — solicitudes:
     OCStore.crearSolicitud(datos)              -> solicitud (crea el proyecto si falta proyectoId)
     OCStore.actualizarSolicitud(id, cambios)   -> solicitud | null
     OCStore.getSolicitud(id)                   -> solicitud | null
     OCStore.getSolicitudesPorFecha('YYYY-MM-DD') -> [solicitud]
     OCStore.getSolicitudesDelMes(anio, mes0a11)  -> { 'YYYY-MM-DD': [solicitud] }

   Uso — levantamientos (1 vigente por proyecto, como solicitud):
     OCStore.crearLevantamiento(datos)              -> levantamiento
     OCStore.actualizarLevantamiento(id, cambios)   -> levantamiento | null
     OCStore.getLevantamiento(id)                   -> levantamiento | null
     OCStore.getLevantamientoPorProyecto(proyectoId) -> levantamiento | null
     OCStore.TIPOS_PROYECTO                         -> [{id, nombre:{es,en}, plantillaLevantamiento}]

   Uso — cotizaciones:
     OCStore.crearCotizacion(datos)                  -> cotización (borrador)
     OCStore.actualizarCotizacion(id, cambios)       -> cotización | null (solo si es borrador)
     OCStore.getCotizacion(id)                       -> cotización | null
     OCStore.getCotizacionesPorSolicitud(solicitudId) -> [cotización]
     OCStore.getCotizacionesPorFecha('YYYY-MM-DD')    -> [cotización]
     OCStore.calcularTotales(cotizacion)             -> { subtotal, descuento, iva, total }
     OCStore.emitirCotizacion(id, pdfBlob)           -> Promise<cotización>
     OCStore.nuevaVersion(id)                        -> cotización (borrador v+1)
     OCStore.copiarComoAdicional(id)                 -> cotización (borrador, folio nuevo)
     OCStore.aceptarCotizacion(id, {fecha, nota})    -> cotización (estado 'aceptada'; solo
                                                         sobre 'emitida', si no, lanza error)
     OCStore.rechazarCotizacion(id, {fecha, motivo, nota}) -> cotización (estado 'rechazada';
                                                         motivo es uno de MOTIVOS_RECHAZO_COTIZACION)
     OCStore.revertirRespuesta(id)                   -> cotización (vuelve a 'emitida')
     OCStore.todasCotizacionesRechazadas(proyectoId) -> bool (sugerencia de "marcar perdido",
                                                         nunca lo hace automáticamente)
     OCStore.getConfig()                             -> datos de la empresa emisora

   Cada persist() dispara un evento 'oc:dataChange' en document (envuelto
   en try/catch) para que las pantallas re-rendericen Flujo/calendario sin
   tener que acordarse de hacerlo a mano en cada mutación.
   ============================================================ */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'obracore.solicitudes';
  var CONFIG_KEY = 'obracore.config';
  var SEED_PDFS_FLAG_KEY = 'obracore.pdfsSemillaGeneradas';
  var SEED_LEVANTAMIENTOS_FLAG_KEY = 'obracore.levantamientosSemillaGenerados';
  var CURRENT_SCHEMA_VERSION = 4;

  // Único punto de verdad para las 7 etapas (ids). OC_MAIN.html ya no
  // declara su propia copia: lee OCStore.STAGE_IDS y traduce cada id
  // vía OC_I18N.t('stage.' + id).
  var OC_STAGE_IDS = [
    'solicitud-cotizacion',
    'cotizacion',
    'levantamiento-tecnico',
    'diseno-sistema',
    'procura-equipos',
    'programacion-instalacion',
    'comisionamiento-calidad'
  ];

  // Clasificación de tipos de evento — único lugar donde se agregan tipos
  // nuevos. 'operativa' consume al equipo y puede ocupar el día (tiene
  // ciclo de vida tentativa->confirmada->en_ejecucion->terminada, o
  // cancelada); 'hito' es solo un recordatorio (pendiente->hecho) y
  // nunca afecta getEstadoDia.
  var TIPOS_EVENTO = {
    'instalacion': { clase: 'operativa' },
    'fabricacion': { clase: 'operativa' },
    'mantenimiento': { clase: 'operativa' },
    'preparacion-materiales': { clase: 'operativa' },
    'obra-civil': { clase: 'operativa' },
    'levantamiento': { clase: 'operativa' },
    'comisionamiento': { clase: 'operativa' },
    'seguimiento': { clase: 'hito' },
    'visita-comercial': { clase: 'hito' },
    'entrega-cotizacion': { clase: 'hito' },
    'llamada': { clase: 'hito' }
  };

  function claseDeEvento(tipo) {
    return (TIPOS_EVENTO[tipo] && TIPOS_EVENTO[tipo].clase) || 'hito';
  }

  function esOperativa(tipo) {
    return claseDeEvento(tipo) === 'operativa';
  }

  // Catálogo de tipos de proyecto: de dónde salen las opciones del
  // selector "Tipo de proyecto" (modal Nuevo proyecto, Solicitud) y qué
  // plantilla de levantamiento usa cada uno (ver plantillas.js). Un tipo
  // fuera de este catálogo (dato viejo/libre) no rompe nada: quien
  // resuelve la plantilla cae a 'generico' si no encuentra el tipo aquí.
  var TIPOS_PROYECTO = [
    { id: 'instalacion-fotovoltaica', nombre: { es: 'Instalación fotovoltaica', en: 'Photovoltaic installation' }, plantillaLevantamiento: 'fotovoltaico' },
    { id: 'ampliacion-sistema', nombre: { es: 'Ampliación de sistema existente', en: 'Existing system expansion' }, plantillaLevantamiento: 'fotovoltaico' },
    { id: 'levantamiento-electrico', nombre: { es: 'Levantamiento eléctrico', en: 'Electrical survey' }, plantillaLevantamiento: 'electrico' },
    { id: 'mantenimiento', nombre: { es: 'Mantenimiento', en: 'Maintenance' }, plantillaLevantamiento: 'mantenimiento' },
    { id: 'obra-civil', nombre: { es: 'Obra civil', en: 'Civil works' }, plantillaLevantamiento: 'obra-civil' },
    { id: 'general', nombre: { es: 'General', en: 'General' }, plantillaLevantamiento: 'generico' }
  ];

  // Estados de solicitud que, al emitirse una cotización sobre ella,
  // avanzan automáticamente a 'cotizada'.
  var ESTADOS_PRE_COTIZADA = ['pendiente', 'en_cotizacion'];

  // Estados de proyecto fijados a mano: recalcularEstadoProyecto nunca
  // los toca (solo "Reactivar" los saca de aquí, recalculando de verdad).
  var ESTADOS_MANUALES = ['pausado', 'perdido', 'cancelado'];

  // Cache en memoria: evita releer/parsear localStorage en cada llamada
  // y es el fallback si localStorage no está disponible.
  var state = null;
  var configCache = null;

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function pad4(n) {
    var s = '' + n;
    while (s.length < 4) { s = '0' + s; }
    return s;
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  // Fecha local YYYY-MM-DD. Nunca toISOString() para fechas de
  // calendario: toISOString() convierte a UTC y puede desfasar el día
  // según la zona horaria del usuario.
  function dateToISO(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function todayISO() {
    return dateToISO(new Date());
  }

  // Parsea 'YYYY-MM-DD' a un Date en hora LOCAL (nunca new Date(iso), que
  // Chrome/V8 interpreta como UTC medianoche y puede desfasar el día).
  function parseLocalISO(iso) {
    var p = iso.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function diasEntreISO(aISO, bISO) {
    var MS_DIA = 24 * 60 * 60 * 1000;
    return Math.round((parseLocalISO(bISO) - parseLocalISO(aISO)) / MS_DIA);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  // Id determinístico de cliente a partir de su nombre, para que el
  // árbol agrupe siempre el mismo cliente bajo el mismo nodo aunque
  // cambie el orden de iteración de los proyectos.
  function slugify(str) {
    var s = (str || '').toString();
    try {
      s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    } catch (e) {
      // normalize no disponible: seguimos con acentos, solo afecta el id interno
    }
    s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'cliente';
  }

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      // localStorage no disponible o corrupto: seguimos en memoria.
    }
    return null;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Sin persistencia real disponible; el store sigue funcionando
      // en memoria para el resto de la sesión.
    }
    // Diferido a un microtask: si persist() se llama desde dentro de un
    // render en curso (por ejemplo, la migración de ensureState()
    // disparándose a mitad de renderTree() al evaluar su primer
    // OCStore.xxx()), despachar el evento de inmediato reentraría en el
    // mismo render y duplicaría nodos. Esperar a que el stack síncrono
    // actual termine garantiza que nunca hay dos renders solapados.
    try {
      if (typeof document !== 'undefined' && document.dispatchEvent) {
        Promise.resolve().then(function () {
          document.dispatchEvent(new CustomEvent('oc:dataChange'));
        });
      }
    } catch (e2) {
      // Entorno sin CustomEvent/Promise (no debería pasar en un navegador real).
    }
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  /* ============================================================
     CONFIGURACIÓN DE LA EMPRESA EMISORA — datos de ejemplo para el
     encabezado del PDF, más parámetros operativos (capacidad diaria
     de instalaciones). Vive en su propia clave de localStorage
     (independiente de solicitudes/cotizaciones) porque no cambia con
     el uso normal de la app.
     ============================================================ */
  function defaultConfig() {
    return {
      nombre: 'ObraCore Energía S.A. de C.V.',
      rfc: 'OCE250101AB1',
      direccion: 'Av. Insurgentes Sur 1234, Col. Del Valle, Ciudad de México, C.P. 03100',
      telefono: '+52 55 5500 1122',
      email: 'contacto@obracore.example.com',
      logoDataUrl: null,
      capacidadInstalacionesPorDia: 2
    };
  }

  function getConfig() {
    if (configCache) {
      return configCache;
    }
    try {
      var raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        configCache = JSON.parse(raw);
        // Migración defensiva: configs guardadas antes de que existiera
        // este parámetro no lo tienen.
        if (configCache.capacidadInstalacionesPorDia == null) {
          configCache.capacidadInstalacionesPorDia = 2;
          try { localStorage.setItem(CONFIG_KEY, JSON.stringify(configCache)); } catch (e3) { /* memoria */ }
        }
        return configCache;
      }
    } catch (e) {
      // sin persistencia; usamos el default en memoria
    }
    configCache = defaultConfig();
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(configCache)); } catch (e2) { /* memoria */ }
    return configCache;
  }

  /* ============================================================
     SEMILLA — solo se genera la primera vez (store vacío). Ya en
     forma de esquema v4 (proyectos/eventos con clasificación
     operativa/hito y estado de proyecto automático), sin pasar por
     ninguna migración. 2 clientes, 6 proyectos; el día 9 del mes
     actual tiene 2 instalaciones confirmadas de proyectos distintos
     (el caso que motivó pasar de "fecha" a "proyecto" como entidad
     central), y un proyecto nuevo trae una fabricación de 3 días en
     en_ejecucion para demostrar el indicador "día n/3" desde el
     primer render.
     Los PDFs de las cotizaciones ya emitidas de la semilla NO se
     generan aquí (este archivo no depende de jsPDF): los genera
     OCPdf.asegurarPdfsSemilla() la primera vez que corre OC_MAIN.html.
     ============================================================ */
  function seedData() {
    var today = new Date();
    var y = today.getFullYear();
    var m = today.getMonth();
    var lastDay = new Date(y, m + 1, 0).getDate();

    function dayInMonth(n) {
      return new Date(y, m, Math.min(n, lastDay));
    }

    // Para demostrar el agrupado por mes de alta: un mes atrás, día 20
    // (o el último día de ese mes si tiene menos de 20).
    var prevMonthDate = new Date(y, m - 1, 1);
    var prevY = prevMonthDate.getFullYear();
    var prevM = prevMonthDate.getMonth();
    var prevLastDay = new Date(prevY, prevM + 1, 0).getDate();
    function dayInPrevMonth(n) {
      return new Date(prevY, prevM, Math.min(n, prevLastDay));
    }

    var solicitudes = {};
    var cotizaciones = {};
    var proyectos = {};
    var eventos = {};
    var levantamientos = {};
    var nextId = 1;
    var nextCotId = 1;
    var nextProyectoId = 1;
    var nextEventoId = 1;
    var nextLevantamientoId = 1;

    function nuevasEtapas(overrides) {
      var etapas = {};
      OC_STAGE_IDS.forEach(function (sid) { etapas[sid] = 'pendiente'; });
      if (overrides) {
        Object.keys(overrides).forEach(function (k) { etapas[k] = overrides[k]; });
      }
      return etapas;
    }

    function addProyecto(nombre, cliente, tipo, ubicacion, estado, etapasOverrides, fechaAltaDate) {
      var id = 'PRJ-' + pad4(nextProyectoId++);
      var ts = nowISO();
      proyectos[id] = {
        id: id,
        nombre: nombre,
        cliente: cliente,
        tipo: tipo,
        ubicacion: ubicacion,
        estado: estado,
        fechaAlta: dateToISO(fechaAltaDate || today),
        etapas: nuevasEtapas(etapasOverrides),
        creadoEn: ts,
        actualizadoEn: ts
      };
      return proyectos[id];
    }

    function addSolicitud(proyectoId, dateObj, estado, generales, detalleProyecto) {
      var id = 'SOL-' + pad4(nextId++);
      var ts = nowISO();
      solicitudes[id] = {
        id: id,
        proyectoId: proyectoId,
        fechaSolicitud: dateToISO(dateObj),
        estado: estado,
        obraId: null,
        generales: generales,
        detalleProyecto: detalleProyecto,
        documentos: [],
        seguimiento: { notasInternas: '', proximaFechaSeguimiento: '' },
        creadaEn: ts,
        actualizadaEn: ts
      };
      return solicitudes[id];
    }

    function addEvento(proyectoId, etapa, tipo, dateObj, extras) {
      extras = extras || {};
      var id = 'EVT-' + pad4(nextEventoId++);
      var ts = nowISO();
      var clase = claseDeEvento(tipo);
      eventos[id] = {
        id: id,
        proyectoId: proyectoId,
        etapa: etapa,
        tipo: tipo,
        fecha: dateToISO(dateObj),
        fechaFin: extras.fechaFinDate ? dateToISO(extras.fechaFinDate) : null,
        estado: extras.estado || (clase === 'operativa' ? 'tentativa' : 'pendiente'),
        horaInicio: extras.horaInicio || null,
        horaFin: extras.horaFin || null,
        cuadrilla: extras.cuadrilla || null,
        notas: extras.notas || '',
        creadoEn: ts,
        actualizadoEn: ts
      };
      return eventos[id];
    }

    // addLevantamiento: construye un levantamiento de semilla ya
    // 'completada', con su plantillaSnapshot escrito a mano (store.js
    // no depende de plantillas.js/forms.js, así que la semilla no llama
    // a OCPlantillas.get — solo imita la forma que produciría). Las
    // fotos quedan referenciadas por clave; el Blob real y el PDF los
    // genera OCPdf.asegurarLevantamientosSemilla() de forma asíncrona.
    function addLevantamiento(proyectoId, plantillaId, nombrePlantilla, seccionesEspecificas, datosVisitaSitio, datosEspecificos, fotos, conclusion, responsable, eventoVisitaId) {
      var id = 'LEV-' + pad4(nextLevantamientoId++);
      var ts = nowISO();
      var snapshot = {
        id: plantillaId,
        version: 1,
        nombre: nombrePlantilla,
        secciones: [
          {
            id: 'visita', titulo: { es: 'Visita', en: 'Visit' },
            campos: [
              { id: 'fecha', tipo: 'fecha', etiqueta: { es: 'Fecha', en: 'Date' }, requerido: true },
              { id: 'horaInicio', tipo: 'hora', etiqueta: { es: 'Hora de inicio', en: 'Start time' } },
              { id: 'horaFin', tipo: 'hora', etiqueta: { es: 'Hora de fin', en: 'End time' } },
              { id: 'personal', tipo: 'texto', etiqueta: { es: 'Personal que asistió', en: 'Staff present' } },
              { id: 'duracionHoras', tipo: 'numero', etiqueta: { es: 'Duración', en: 'Duration' }, unidad: 'h', min: 0 },
              { id: 'condicionesSitio', tipo: 'textoLargo', etiqueta: { es: 'Condiciones del sitio', en: 'Site conditions' } }
            ]
          },
          {
            id: 'sitio', titulo: { es: 'Sitio', en: 'Site' },
            campos: [
              { id: 'direccion', tipo: 'texto', etiqueta: { es: 'Dirección', en: 'Address' } },
              { id: 'coordenadas', tipo: 'coordenadas', etiqueta: { es: 'Coordenadas', en: 'Coordinates' } },
              { id: 'accesos', tipo: 'textoLargo', etiqueta: { es: 'Accesos', en: 'Access' } },
              { id: 'restricciones', tipo: 'textoLargo', etiqueta: { es: 'Restricciones', en: 'Restrictions' } },
              { id: 'riesgosSeguridad', tipo: 'textoLargo', etiqueta: { es: 'Riesgos de seguridad', en: 'Safety risks' } }
            ]
          }
        ].concat(seccionesEspecificas, [
          {
            id: 'evidencia', titulo: { es: 'Evidencia', en: 'Evidence' },
            campos: [{
              id: 'fotos', tipo: 'fotos', etiqueta: { es: 'Fotos', en: 'Photos' },
              categorias: [
                { id: 'general', etiqueta: { es: 'General', en: 'General' } },
                { id: 'sitio', etiqueta: { es: 'Sitio', en: 'Site' } },
                { id: 'instalacion', etiqueta: { es: 'Instalación existente', en: 'Existing installation' } },
                { id: 'hallazgo', etiqueta: { es: 'Hallazgo', en: 'Finding' } }
              ]
            }]
          },
          {
            id: 'conclusion', titulo: { es: 'Conclusión', en: 'Conclusion' },
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
          }
        ])
      };
      var datos = Object.assign({ visita: datosVisitaSitio.visita, sitio: datosVisitaSitio.sitio }, datosEspecificos);
      datos.evidencia = { fotos: fotos };
      datos.conclusion = conclusion;
      levantamientos[id] = {
        id: id,
        proyectoId: proyectoId,
        plantillaId: plantillaId,
        plantillaVersion: 1,
        plantillaSnapshot: snapshot,
        estado: 'completada',
        responsable: responsable,
        eventoVisitaId: eventoVisitaId || null,
        datos: datos,
        pdfKey: null,
        creadoEn: ts,
        actualizadoEn: ts
      };
      return levantamientos[id];
    }

    function partidasEjemplo() {
      return [
        { cantidad: 12, unidad: 'pieza', descripcion: 'Panel solar monocristalino 550W', precioUnitario: 3200, descuentoPct: 0 },
        { cantidad: 1, unidad: 'lote', descripcion: 'Inversor híbrido 8kW + estructura de montaje', precioUnitario: 28000, descuentoPct: 5 },
        { cantidad: 1, unidad: 'servicio', descripcion: 'Mano de obra e instalación', precioUnitario: 18000, descuentoPct: 0 }
      ];
    }

    function condicionesEjemplo() {
      return {
        formaPago: '50% anticipo, 50% contra entrega',
        tiempoEntrega: '15 días hábiles después del anticipo',
        garantia: '25 años en paneles, 10 años en inversor, 1 año en instalación',
        notas: 'Precios en pesos mexicanos, no incluyen trámite de interconexión CFE.',
        exclusiones: 'No incluye obra civil ni adecuaciones eléctricas previas.'
      };
    }

    // addCot: construye una cotización de semilla ya "emitida" (o
    // 'sustituida'), con sus totales ya calculados con la misma
    // fórmula que usa calcularTotales, para no duplicar la lógica.
    function addCot(solicitud, proyectoId, opts) {
      opts = opts || {};
      var id = 'COT-' + pad4(nextCotId++);
      var ts = nowISO();
      var year = solicitud.fechaSolicitud.split('-')[0];
      var version = opts.version || 1;
      var folioBase = opts.folioBase || pad4(nextCotId - 1);
      var folio = 'COT-' + year + '-' + folioBase + '-v' + version;
      var partidas = opts.partidas || partidasEjemplo();

      var cot = {
        id: id,
        folio: folio,
        solicitudId: solicitud.id,
        proyectoId: proyectoId,
        fecha: solicitud.fechaSolicitud,
        fechaEmision: opts.fechaEmision || solicitud.fechaSolicitud,
        version: version,
        tipo: opts.tipo || 'original',
        basadaEn: opts.basadaEn || null,
        estado: opts.estado || 'emitida',
        moneda: 'MXN',
        vigenciaDias: 15,
        cliente: {
          nombre: solicitud.generales.nombreRazonSocial,
          contacto: solicitud.generales.asesorAsignado || '',
          email: solicitud.generales.correo || '',
          telefono: solicitud.generales.telefono || '',
          rfc: '',
          direccion: solicitud.generales.direccionProyecto || ''
        },
        proyecto: {
          nombre: solicitud.detalleProyecto.descripcion || solicitud.detalleProyecto.tipoProyecto,
          ubicacion: solicitud.generales.direccionProyecto || '',
          tipo: solicitud.detalleProyecto.tipoProyecto
        },
        partidas: partidas,
        ivaPct: 16,
        condiciones: condicionesEjemplo(),
        elaboro: solicitud.generales.asesorAsignado || '',
        totales: null,
        pdfKey: null,
        creadaEn: ts,
        actualizadaEn: ts
      };
      cot.totales = calcularTotalesDe(cot);
      // La clave del PDF: se usa el propio id de la cotización, simple
      // y siempre único (ver nota en emitirCotizacion).
      cot.pdfKey = 'PDF-' + id;
      cotizaciones[id] = cot;
      return cot;
    }

    /* ---- Cliente A: Roberto Salinas (persona física, 2 proyectos) ---- */
    var clienteRoberto = {
      nombre: 'Roberto Salinas', contacto: 'Ana Torres',
      email: 'roberto.salinas@example.com', telefono: '5512345601',
      direccion: 'Av. Reforma 100, CDMX'
    };

    var prj1 = addProyecto('Instalación residencial de 6kW', clienteRoberto,
      'instalacion-fotovoltaica', clienteRoberto.direccion, 'en_ejecucion',
      { 'solicitud-cotizacion': 'completada', 'cotizacion': 'completada' });
    var sol1 = addSolicitud(prj1.id, dayInMonth(3), 'cotizada',
      { nombreRazonSocial: 'Roberto Salinas', tipoCliente: 'persona-fisica', telefono: '5512345601', correo: 'roberto.salinas@example.com', direccionProyecto: 'Av. Reforma 100, CDMX', fuenteLead: 'referido', asesorAsignado: 'Ana Torres' },
      { tipoProyecto: 'instalacion-fotovoltaica', descripcion: 'Instalación residencial de 6kW', fechaDeseadaInstalacion: '', presupuestoEstimado: null });
    addCot(sol1, prj1.id, { tipo: 'original', version: 1, estado: 'emitida' });
    addEvento(prj1.id, 'solicitud-cotizacion', 'seguimiento', dayInMonth(3));
    addEvento(prj1.id, 'cotizacion', 'instalacion', dayInMonth(9), { estado: 'confirmada', horaInicio: '09:00', horaFin: '14:00', cuadrilla: 'Cuadrilla 1' });

    var prj2 = addProyecto('Mantenimiento anual de paneles', clienteRoberto,
      'mantenimiento', clienteRoberto.direccion, 'cancelado',
      { 'solicitud-cotizacion': 'completada', 'cotizacion': 'bloqueada' });
    addSolicitud(prj2.id, dayInMonth(19), 'cancelada',
      { nombreRazonSocial: 'Roberto Salinas', tipoCliente: 'persona-fisica', telefono: '5512345601', correo: 'roberto.salinas@example.com', direccionProyecto: 'Av. Reforma 100, CDMX', fuenteLead: 'referido', asesorAsignado: 'Ana Torres' },
      { tipoProyecto: 'mantenimiento', descripcion: 'Mantenimiento anual de paneles', fechaDeseadaInstalacion: '', presupuestoEstimado: null });
    addEvento(prj2.id, 'solicitud-cotizacion', 'seguimiento', dayInMonth(19));

    /* ---- Cliente B: Constructora Altamira S.A. de C.V. (3 proyectos) ---- */
    var clienteAltamira = {
      nombre: 'Constructora Altamira S.A. de C.V.', contacto: 'Diego Ramírez',
      email: 'compras@altamira.example.com', telefono: '5512345608',
      direccion: 'Carretera Federal km 12, Toluca'
    };

    var prj3 = addProyecto('Sistema para oficinas centrales', clienteAltamira,
      'instalacion-fotovoltaica', clienteAltamira.direccion, 'en_ejecucion',
      { 'solicitud-cotizacion': 'completada', 'cotizacion': 'completada' });
    var sol3 = addSolicitud(prj3.id, dayInMonth(11), 'cotizada',
      { nombreRazonSocial: 'Constructora Altamira S.A. de C.V.', tipoCliente: 'empresa', telefono: '5512345608', correo: 'compras@altamira.example.com', direccionProyecto: 'Carretera Federal km 12, Toluca', fuenteLead: 'llamada-directa', asesorAsignado: 'Diego Ramírez' },
      { tipoProyecto: 'instalacion-fotovoltaica', descripcion: 'Sistema para oficinas centrales', fechaDeseadaInstalacion: '', presupuestoEstimado: 600000 });
    // Caso "varias cotizaciones": v1 sustituida, v2 vigente, adicional.
    var altamiraFolioBase = pad4(nextCotId);
    var v1 = addCot(sol3, prj3.id, { tipo: 'original', version: 1, estado: 'sustituida', folioBase: altamiraFolioBase });
    addCot(sol3, prj3.id, { tipo: 'actualizacion', version: 2, estado: 'emitida', basadaEn: v1.id, folioBase: altamiraFolioBase });
    addCot(sol3, prj3.id, { tipo: 'adicional', version: 1, estado: 'emitida', basadaEn: v1.id });
    addEvento(prj3.id, 'solicitud-cotizacion', 'seguimiento', dayInMonth(11));
    // Segunda instalación del mismo día 9 que prj1, pero de otro proyecto:
    // el caso concreto que motivó este cambio de modelo.
    addEvento(prj3.id, 'cotizacion', 'instalacion', dayInMonth(9), { estado: 'confirmada', horaInicio: '10:00', horaFin: '16:00', cuadrilla: 'Cuadrilla 2' });

    var prj4 = addProyecto('Sistema para nave industrial', clienteAltamira,
      'instalacion-fotovoltaica', 'Parque Industrial Vega, Nave 4', 'prospecto',
      { 'solicitud-cotizacion': 'completada' });
    addSolicitud(prj4.id, dayInMonth(7), 'pendiente',
      { nombreRazonSocial: 'Constructora Altamira S.A. de C.V.', tipoCliente: 'empresa', telefono: '5512345608', correo: 'compras@altamira.example.com', direccionProyecto: 'Parque Industrial Vega, Nave 4', fuenteLead: 'pagina-web', asesorAsignado: 'Diego Ramírez' },
      { tipoProyecto: 'instalacion-fotovoltaica', descripcion: 'Sistema para nave industrial', fechaDeseadaInstalacion: '', presupuestoEstimado: 850000 });
    addEvento(prj4.id, 'solicitud-cotizacion', 'visita-comercial', dayInMonth(7));

    var prj5 = addProyecto('Planta solar para autoconsumo industrial', clienteAltamira,
      'instalacion-fotovoltaica', 'Blvd. Industrial 800, Monterrey', 'cotizado',
      { 'solicitud-cotizacion': 'completada', 'cotizacion': 'completada', 'levantamiento-tecnico': 'completada' }, dayInPrevMonth(20));
    var sol5 = addSolicitud(prj5.id, dayInMonth(15), 'aceptada',
      { nombreRazonSocial: 'Constructora Altamira S.A. de C.V.', tipoCliente: 'empresa', telefono: '5512345608', correo: 'compras@altamira.example.com', direccionProyecto: 'Blvd. Industrial 800, Monterrey', fuenteLead: 'llamada-directa', asesorAsignado: 'Diego Ramírez' },
      { tipoProyecto: 'instalacion-fotovoltaica', descripcion: 'Planta solar para autoconsumo industrial', fechaDeseadaInstalacion: '', presupuestoEstimado: 3200000 });
    addCot(sol5, prj5.id, { tipo: 'original', version: 1, estado: 'emitida' });
    addEvento(prj5.id, 'cotizacion', 'entrega-cotizacion', dayInMonth(15));
    var evtLev5 = addEvento(prj5.id, 'levantamiento-tecnico', 'levantamiento', dayInMonth(21), { estado: 'terminada', horaInicio: '09:00', horaFin: '11:00', cuadrilla: 'Diego Ramírez' });
    addLevantamiento(prj5.id, 'fotovoltaico', { es: 'Levantamiento fotovoltaico', en: 'Photovoltaic survey' },
      [
        {
          id: 'consumo', titulo: { es: 'Consumo eléctrico', en: 'Electrical consumption' },
          campos: [
            {
              id: 'tarifaCfe', tipo: 'opcion', etiqueta: { es: 'Tarifa CFE', en: 'CFE rate' },
              opciones: [
                { id: 'pdbt', etiqueta: { es: 'PDBT — Comercial baja tensión', en: 'PDBT — Low-voltage commercial' } },
                { id: 'gdmth', etiqueta: { es: 'GDMTH — Media tensión horaria', en: 'GDMTH — Medium voltage, time-of-use' } }
              ]
            },
            {
              id: 'consumoMensual', tipo: 'tabla', etiqueta: { es: 'Consumo por periodo', en: 'Consumption by period' },
              columnas: [
                { id: 'periodo', etiqueta: { es: 'Periodo', en: 'Period' }, tipo: 'texto' },
                { id: 'kwh', etiqueta: { es: 'Consumo', en: 'Consumption' }, tipo: 'numero', unidad: 'kWh', total: 'suma' }
              ]
            }
          ]
        },
        {
          id: 'superficie', titulo: { es: 'Superficie de instalación', en: 'Installation surface' },
          campos: [
            {
              id: 'tipoSuperficie', tipo: 'opcion', etiqueta: { es: 'Tipo de superficie', en: 'Surface type' },
              opciones: [
                { id: 'techo-lamina', etiqueta: { es: 'Techo de lámina', en: 'Metal sheet roof' } },
                { id: 'terreno', etiqueta: { es: 'Terreno (montaje en piso)', en: 'Ground mount' } }
              ]
            },
            { id: 'areaDisponible', tipo: 'numero', etiqueta: { es: 'Área disponible', en: 'Available area' }, unidad: 'm²', min: 0 }
          ]
        }
      ],
      {
        visita: { fecha: dateToISO(dayInMonth(21)), horaInicio: '09:00', horaFin: '11:00', personal: 'Diego Ramírez', duracionHoras: 2, condicionesSitio: 'Clima despejado, acceso sin restricciones.' },
        sitio: { direccion: 'Blvd. Industrial 800, Monterrey', coordenadas: { lat: 25.6866, lng: -100.3161 }, accesos: 'Acceso directo por vialidad principal.', restricciones: '', riesgosSeguridad: 'Trabajo en altura en techo de nave industrial.' }
      },
      { consumo: { tarifaCfe: 'gdmth', consumoMensual: [{ periodo: 'Ene', kwh: 18500 }, { periodo: 'Feb', kwh: 17200 }] }, superficie: { tipoSuperficie: 'techo-lamina', areaDisponible: 850 } },
      [
        { key: 'FOTO-SEED-' + prj5.id + '-1', categoria: 'sitio', nota: 'Vista general del techo' },
        { key: 'FOTO-SEED-' + prj5.id + '-2', categoria: 'instalacion', nota: 'Tablero eléctrico existente' }
      ],
      { viabilidad: 'viable', hallazgos: 'Superficie amplia y en buen estado, orientación adecuada hacia el sur.', recomendaciones: 'Proceder con el diseño del sistema a 60 kW.' },
      'Diego Ramírez', evtLev5.id);

    /* ---- Proyecto nuevo: demuestra una actividad operativa de varios
       días (fabricación, 3 días) en 'en_ejecucion', con cuadrilla y el
       indicador "día n/3" visible en el calendario desde el primer render. ---- */
    var prj6 = addProyecto('Fabricación de estructura metálica', clienteRoberto,
      'fabricacion-estructura', clienteRoberto.direccion, 'en_ejecucion',
      { 'solicitud-cotizacion': 'completada' });
    addSolicitud(prj6.id, dayInMonth(24), 'cotizada',
      { nombreRazonSocial: 'Roberto Salinas', tipoCliente: 'persona-fisica', telefono: '5512345601', correo: 'roberto.salinas@example.com', direccionProyecto: 'Av. Reforma 100, CDMX', fuenteLead: 'referido', asesorAsignado: 'Ana Torres' },
      { tipoProyecto: 'fabricacion-estructura', descripcion: 'Fabricación de estructura metálica', fechaDeseadaInstalacion: '', presupuestoEstimado: null });
    addEvento(prj6.id, 'cotizacion', 'fabricacion', dayInMonth(24), { estado: 'en_ejecucion', fechaFinDate: dayInMonth(26), cuadrilla: 'Taller' });

    /* ---- Proyecto nuevo: giro 'obra-civil', para que la plantilla de
       levantamiento de ese giro tenga un ejemplo visible desde el
       primer render (antes no existía ningún proyecto de obra civil). ---- */
    var prj7 = addProyecto('Cimentación para subestación eléctrica', clienteAltamira,
      'obra-civil', 'Parque Industrial Vega, Lote 9', 'cotizado',
      { 'solicitud-cotizacion': 'completada', 'cotizacion': 'completada', 'levantamiento-tecnico': 'completada' });
    var sol7 = addSolicitud(prj7.id, dayInMonth(5), 'cotizada',
      { nombreRazonSocial: 'Constructora Altamira S.A. de C.V.', tipoCliente: 'empresa', telefono: '5512345608', correo: 'compras@altamira.example.com', direccionProyecto: 'Parque Industrial Vega, Lote 9', fuenteLead: 'referido', asesorAsignado: 'Diego Ramírez' },
      { tipoProyecto: 'obra-civil', descripcion: 'Cimentación para subestación eléctrica', fechaDeseadaInstalacion: '', presupuestoEstimado: 420000 });
    addCot(sol7, prj7.id, { tipo: 'original', version: 1, estado: 'emitida' });
    addEvento(prj7.id, 'solicitud-cotizacion', 'seguimiento', dayInMonth(5));
    var evtLev7 = addEvento(prj7.id, 'levantamiento-tecnico', 'levantamiento', dayInMonth(6), { estado: 'terminada', horaInicio: '08:00', horaFin: '10:30', cuadrilla: 'Diego Ramírez' });
    addLevantamiento(prj7.id, 'obra-civil', { es: 'Levantamiento de obra civil', en: 'Civil works survey' },
      [
        {
          id: 'terrenoAccesos', titulo: { es: 'Terreno y accesos', en: 'Site and access' },
          campos: [
            {
              id: 'tipoAcceso', tipo: 'opcion', etiqueta: { es: 'Tipo de acceso', en: 'Access type' },
              opciones: [
                { id: 'pavimentado', etiqueta: { es: 'Pavimentado', en: 'Paved' } },
                { id: 'terraceria', etiqueta: { es: 'Terracería', en: 'Unpaved' } }
              ]
            },
            { id: 'restriccionesAcceso', tipo: 'textoLargo', etiqueta: { es: 'Restricciones de acceso', en: 'Access restrictions' } }
          ]
        },
        {
          id: 'tipoSuelo', titulo: { es: 'Tipo de suelo', en: 'Soil type' },
          campos: [
            {
              id: 'tipoSuelo', tipo: 'opcion', etiqueta: { es: 'Tipo de suelo', en: 'Soil type' },
              opciones: [
                { id: 'arcilloso', etiqueta: { es: 'Arcilloso', en: 'Clay' } },
                { id: 'mixto', etiqueta: { es: 'Mixto', en: 'Mixed' } }
              ]
            },
            { id: 'capacidadCarga', tipo: 'numero', etiqueta: { es: 'Capacidad de carga estimada', en: 'Estimated bearing capacity' }, unidad: 'kg/cm²', min: 0 }
          ]
        }
      ],
      {
        visita: { fecha: dateToISO(dayInMonth(6)), horaInicio: '08:00', horaFin: '10:30', personal: 'Diego Ramírez', duracionHoras: 2.5, condicionesSitio: 'Terreno despejado, sin lluvia reciente.' },
        sitio: { direccion: 'Parque Industrial Vega, Lote 9', coordenadas: { lat: 19.2927, lng: -99.6557 }, accesos: 'Entrada por vialidad del parque industrial, apta para maquinaria.', restricciones: 'Horario de acceso restringido de 7am a 6pm.', riesgosSeguridad: 'Excavación abierta cercana; delimitar con cinta de seguridad.' }
      },
      { terrenoAccesos: { tipoAcceso: 'pavimentado', restriccionesAcceso: 'Ninguna adicional.' }, tipoSuelo: { tipoSuelo: 'mixto', capacidadCarga: 1.8 } },
      [{ key: 'FOTO-SEED-' + prj7.id + '-1', categoria: 'sitio', nota: 'Terreno donde se ubicará la cimentación' }],
      { viabilidad: 'viable-con-adecuaciones', hallazgos: 'Suelo mixto requiere compactación previa.', recomendaciones: 'Incluir estudio de mecánica de suelos antes de iniciar obra.' },
      'Diego Ramírez', evtLev7.id);

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      nextId: nextId,
      nextCotId: nextCotId,
      nextProyectoId: nextProyectoId,
      nextEventoId: nextEventoId,
      nextLevantamientoId: nextLevantamientoId,
      solicitudes: solicitudes,
      cotizaciones: cotizaciones,
      proyectos: proyectos,
      eventos: eventos,
      levantamientos: levantamientos,
      recordatorios: {},
      nextRecordatorioId: 1
    };
  }

  /* ============================================================
     MIGRACIÓN v1 -> v2 — sesiones guardadas antes de que existieran
     proyectos/eventos. Cada solicitud existente crea su proyecto
     (prospecto, o activo/cancelado según su propio estado), sus
     cotizaciones heredan proyectoId, y se crea un evento de
     seguimiento en fechaSolicitud para que el calendario no quede
     vacío. No toca pdfKey ni IndexedDB: los PDFs ya emitidos siguen
     intactos (viven en una base de datos aparte, ajena a esta clave
     de localStorage).
     ============================================================ */
  function migrarV1aV2(s) {
    if (!s.proyectos) { s.proyectos = {}; }
    if (!s.eventos) { s.eventos = {}; }
    if (!s.nextProyectoId) { s.nextProyectoId = 1; }
    if (!s.nextEventoId) { s.nextEventoId = 1; }

    var solIds = Object.keys(s.solicitudes).sort();

    solIds.forEach(function (solId) {
      var sol = s.solicitudes[solId];
      if (sol.proyectoId) {
        return; // defensivo: ya migrada
      }

      var detalle = sol.proyecto || sol.detalleProyecto || {};
      var generales = sol.generales || {};
      var proyId = 'PRJ-' + pad4(s.nextProyectoId++);

      var etapas = {};
      OC_STAGE_IDS.forEach(function (sid) { etapas[sid] = 'pendiente'; });
      etapas['solicitud-cotizacion'] = 'completada';

      var estadoProyecto = sol.estado === 'aceptada' ? 'activo'
        : (sol.estado === 'rechazada' || sol.estado === 'cancelada') ? 'cancelado'
        : 'prospecto';

      s.proyectos[proyId] = {
        id: proyId,
        nombre: detalle.descripcion || detalle.tipoProyecto || generales.nombreRazonSocial || proyId,
        cliente: {
          nombre: generales.nombreRazonSocial || '',
          contacto: generales.asesorAsignado || '',
          email: generales.correo || '',
          telefono: generales.telefono || '',
          direccion: generales.direccionProyecto || ''
        },
        tipo: detalle.tipoProyecto || '',
        ubicacion: generales.direccionProyecto || '',
        estado: estadoProyecto,
        etapas: etapas,
        creadoEn: sol.creadaEn,
        actualizadoEn: sol.actualizadaEn
      };

      sol.proyectoId = proyId;
      sol.detalleProyecto = detalle;
      delete sol.proyecto;

      var evtId = 'EVT-' + pad4(s.nextEventoId++);
      s.eventos[evtId] = {
        id: evtId,
        proyectoId: proyId,
        etapa: 'solicitud-cotizacion',
        tipo: 'seguimiento',
        fecha: sol.fechaSolicitud,
        horaInicio: null,
        horaFin: null,
        cuadrilla: null,
        notas: '',
        creadoEn: sol.creadaEn,
        actualizadoEn: sol.creadaEn
      };

      var tieneAlguna = false;
      var algunaEmitida = false;
      Object.keys(s.cotizaciones).forEach(function (cotId) {
        var cot = s.cotizaciones[cotId];
        if (cot.solicitudId === solId) {
          cot.proyectoId = proyId;
          tieneAlguna = true;
          if (cot.estado === 'emitida') { algunaEmitida = true; }
        }
      });
      if (algunaEmitida) {
        s.proyectos[proyId].etapas.cotizacion = 'completada';
      } else if (tieneAlguna) {
        s.proyectos[proyId].etapas.cotizacion = 'en_curso';
      }
    });

    s.schemaVersion = 2;
    return s;
  }

  /* ============================================================
     MIGRACIÓN v2 -> v3 — agrega `fechaAlta` a los proyectos que no
     la tengan (todos los creados antes de este cambio). Se toma de
     la fechaSolicitud de su solicitud (relación 1:1 proyecto<->
     solicitud); si el proyecto no tiene solicitud, se usa la parte
     de fecha de su propio `creadoEn`. No se pierde ningún proyecto:
     todos terminan con una fechaAlta válida.
     ============================================================ */
  function migrarV2aV3(s) {
    Object.keys(s.proyectos).forEach(function (proyId) {
      var proyecto = s.proyectos[proyId];
      if (proyecto.fechaAlta) {
        return; // defensivo: ya migrado
      }
      var solIdDelProyecto = null;
      Object.keys(s.solicitudes).forEach(function (solId) {
        if (s.solicitudes[solId].proyectoId === proyId) {
          solIdDelProyecto = solId;
        }
      });
      var sol = solIdDelProyecto ? s.solicitudes[solIdDelProyecto] : null;
      proyecto.fechaAlta = (sol && sol.fechaSolicitud)
        || (proyecto.creadoEn ? proyecto.creadoEn.slice(0, 10) : todayISO());
    });

    s.schemaVersion = 3;
    return s;
  }

  /* ============================================================
     MIGRACIÓN v3 -> v4 — clasifica cada evento existente como
     operativa u hito y le da un `estado` (antes no existía ese
     campo): `visita`/`entrega` se renombran a `visita-comercial`/
     `entrega-cotizacion`; las operativas (instalacion/levantamiento)
     arrancan `confirmada` si su fecha ya pasó, `tentativa` si es
     futura; el resto (hitos) arranca `pendiente`. `fechaFin` se
     agrega como `null` (ningún evento viejo era multi-día).
     Los proyectos `cancelado`/`pausado` se quedan igual (ya eran
     estados manuales); `cerrado` pasa directo a `terminado`; todo lo
     demás (p.ej. el viejo `activo`) se recalcula de verdad con
     calcularEstadoAutomatico, usando los eventos/cotizaciones ya
     migrados arriba. No se pierde ningún proyecto ni evento.
     ============================================================ */
  function migrarV3aV4(s) {
    var hoy = todayISO();
    Object.keys(s.eventos).forEach(function (id) {
      var e = s.eventos[id];
      if (e.tipo === 'visita') { e.tipo = 'visita-comercial'; }
      if (e.tipo === 'entrega') { e.tipo = 'entrega-cotizacion'; }
      if (e.fechaFin === undefined) { e.fechaFin = null; }
      if (e.estado) { return; } // defensivo: ya migrado
      e.estado = esOperativa(e.tipo) ? (e.fecha < hoy ? 'confirmada' : 'tentativa') : 'pendiente';
    });

    Object.keys(s.proyectos).forEach(function (id) {
      var p = s.proyectos[id];
      if (p.estado === 'cerrado') {
        p.estado = 'terminado';
        return;
      }
      if (p.estado === 'cancelado' || p.estado === 'pausado' || p.estado === 'perdido') {
        return; // ya eran manuales, se quedan igual
      }
      p.estado = calcularEstadoAutomatico(id);
    });

    s.schemaVersion = 4;
    return s;
  }

  function ensureState() {
    if (state) {
      return state;
    }
    state = loadFromStorage();
    if (!state || !state.solicitudes) {
      state = seedData();
      persist();
      return state;
    }
    // Migraciones defensivas: sesiones creadas antes de que existieran
    // ciertos campos no los tienen. Se agregan vacíos en vez de volver a
    // sembrar (no queremos duplicar datos ya reales del usuario).
    var changed = false;
    if (!state.cotizaciones) { state.cotizaciones = {}; changed = true; }
    if (!state.nextCotId) { state.nextCotId = 1; changed = true; }
    if (!state.proyectos) { state.proyectos = {}; changed = true; }
    if (!state.eventos) { state.eventos = {}; changed = true; }
    if (!state.nextProyectoId) { state.nextProyectoId = 1; changed = true; }
    if (!state.nextEventoId) { state.nextEventoId = 1; changed = true; }
    if (!state.levantamientos) { state.levantamientos = {}; changed = true; }
    if (!state.nextLevantamientoId) { state.nextLevantamientoId = 1; changed = true; }
    // Tareas del calendario (recordatorios): entidad aparte, sin migración de esquema.
    if (!state.recordatorios) { state.recordatorios = {}; changed = true; }
    if (!state.nextRecordatorioId) { state.nextRecordatorioId = 1; changed = true; }
    if (!state.schemaVersion || state.schemaVersion < CURRENT_SCHEMA_VERSION) {
      if (!state.schemaVersion || state.schemaVersion < 2) {
        state = migrarV1aV2(state);
      }
      if (state.schemaVersion < 3) {
        state = migrarV2aV3(state);
      }
      if (state.schemaVersion < 4) {
        state = migrarV3aV4(state);
      }
      changed = true;
    }
    if (changed) { persist(); }
    return state;
  }

  /* ============================================================
     PROYECTOS
     ============================================================ */
  function crearProyectoInterno(s, datos) {
    var id = 'PRJ-' + pad4(s.nextProyectoId++);
    var ts = nowISO();
    var etapas = {};
    OC_STAGE_IDS.forEach(function (sid) { etapas[sid] = 'pendiente'; });
    if (datos.etapas) {
      Object.keys(datos.etapas).forEach(function (k) { etapas[k] = datos.etapas[k]; });
    }
    var proyecto = {
      id: id,
      nombre: datos.nombre || id,
      cliente: datos.cliente || {},
      tipo: datos.tipo || '',
      ubicacion: datos.ubicacion || '',
      estado: datos.estado || 'prospecto',
      fechaAlta: datos.fechaAlta || todayISO(),
      etapas: etapas,
      creadoEn: ts,
      actualizadoEn: ts
    };
    s.proyectos[id] = proyecto;
    return proyecto;
  }

  function crearProyecto(datos) {
    var s = ensureState();
    var proyecto = crearProyectoInterno(s, datos || {});
    persist();
    return proyecto;
  }

  function actualizarProyecto(id, cambios) {
    var s = ensureState();
    var existing = s.proyectos[id];
    if (!existing) {
      return null;
    }
    var updated = {
      id: existing.id,
      nombre: cambios.nombre !== undefined ? cambios.nombre : existing.nombre,
      cliente: cambios.cliente !== undefined ? cambios.cliente : existing.cliente,
      tipo: cambios.tipo !== undefined ? cambios.tipo : existing.tipo,
      ubicacion: cambios.ubicacion !== undefined ? cambios.ubicacion : existing.ubicacion,
      estado: cambios.estado !== undefined ? cambios.estado : existing.estado,
      fechaAlta: cambios.fechaAlta !== undefined ? cambios.fechaAlta : existing.fechaAlta,
      etapas: cambios.etapas !== undefined ? cambios.etapas : existing.etapas,
      creadoEn: existing.creadoEn,
      actualizadoEn: nowISO()
    };
    s.proyectos[id] = updated;
    persist();
    return updated;
  }

  function getProyecto(id) {
    var s = ensureState();
    return s.proyectos[id] || null;
  }

  function getProyectos() {
    var s = ensureState();
    var out = Object.keys(s.proyectos).map(function (id) { return s.proyectos[id]; });
    out.sort(function (a, b) { return a.nombre < b.nombre ? -1 : (a.nombre > b.nombre ? 1 : 0); });
    return out;
  }

  // Nunca retrocede una etapa ya 'completada'/'bloqueada': una etapa
  // cerrada no debe volver a 'pendiente'/'en_curso' por una mutación
  // posterior de otra parte del flujo.
  function marcarEtapaProyecto(proyectoId, etapaId, nuevoEstado) {
    if (!proyectoId) {
      return;
    }
    var s = ensureState();
    var proyecto = s.proyectos[proyectoId];
    if (!proyecto) {
      return;
    }
    var actual = proyecto.etapas[etapaId];
    if (actual === 'completada' || actual === 'bloqueada' || actual === nuevoEstado) {
      return;
    }
    proyecto.etapas[etapaId] = nuevoEstado;
    proyecto.actualizadoEn = nowISO();
  }

  function getArbolProyectos() {
    var proyectos = getProyectos();
    var porCliente = {};
    var orden = [];
    proyectos.forEach(function (p) {
      var nombreCliente = (p.cliente && p.cliente.nombre) || p.nombre;
      var clienteId = 'CLI-' + slugify(nombreCliente);
      if (!porCliente[clienteId]) {
        porCliente[clienteId] = { clienteId: clienteId, clienteNombre: nombreCliente, proyectos: [] };
        orden.push(clienteId);
      }
      porCliente[clienteId].proyectos.push({
        proyectoId: p.id,
        nombre: p.nombre,
        estado: p.estado,
        etapas: p.etapas
      });
    });
    return orden.map(function (cid) { return porCliente[cid]; });
  }

  function getSolicitudPorProyecto(proyectoId) {
    var s = ensureState();
    var out = null;
    Object.keys(s.solicitudes).forEach(function (id) {
      var sol = s.solicitudes[id];
      if (sol.proyectoId === proyectoId && (!out || sol.creadaEn > out.creadaEn)) {
        out = sol;
      }
    });
    return out;
  }

  function getCotizacionesPorProyecto(proyectoId) {
    var s = ensureState();
    var out = [];
    Object.keys(s.cotizaciones).forEach(function (id) {
      if (s.cotizaciones[id].proyectoId === proyectoId) {
        out.push(s.cotizaciones[id]);
      }
    });
    out.sort(function (a, b) { return a.creadaEn < b.creadaEn ? 1 : -1; });
    return out;
  }

  function getEtapasDeProyecto(proyectoId) {
    var proyecto = getProyecto(proyectoId);
    if (!proyecto) {
      return [];
    }
    return OC_STAGE_IDS.map(function (etapaId) {
      var registros = [];
      if (etapaId === 'solicitud-cotizacion') {
        var sol = getSolicitudPorProyecto(proyectoId);
        if (sol) {
          registros.push({ tipo: 'solicitud', id: sol.id, estado: sol.estado });
        }
      } else if (etapaId === 'cotizacion') {
        getCotizacionesPorProyecto(proyectoId).forEach(function (cot) {
          registros.push({ tipo: 'cotizacion', id: cot.id, estado: cot.estado, version: cot.version, esAdicional: cot.tipo === 'adicional' });
        });
      } else if (etapaId === 'levantamiento-tecnico') {
        var lev = getLevantamientoPorProyecto(proyectoId);
        if (lev) {
          registros.push({ tipo: 'levantamiento', id: lev.id, estado: lev.estado });
        }
      }
      return { etapaId: etapaId, estado: proyecto.etapas[etapaId] || 'pendiente', registros: registros };
    });
  }

  /* ============================================================
     ESTADO AUTOMÁTICO DEL PROYECTO — se recalcula solo después de
     cualquier cambio en una solicitud, cotización o evento de ese
     proyecto (ver las llamadas a recalcularEstadoProyecto al final
     de cada función de mutación, más abajo en este archivo).
     ============================================================ */
  function calcularEstadoAutomatico(proyectoId) {
    var proyecto = getProyecto(proyectoId);
    if (!proyecto) {
      return 'prospecto';
    }
    if (proyecto.etapas['comisionamiento-calidad'] === 'completada') {
      return 'terminado';
    }
    var operativasActivas = getEventosDeProyecto(proyectoId).some(function (e) {
      return esOperativa(e.tipo) && ['confirmada', 'en_ejecucion', 'terminada'].indexOf(e.estado) !== -1;
    });
    if (operativasActivas) {
      return 'en_ejecucion';
    }
    var cotizaciones = getCotizacionesPorProyecto(proyectoId);
    if (cotizaciones.some(function (c) { return c.estado === 'aceptada'; })) {
      return 'ganado';
    }
    if (cotizaciones.some(function (c) { return c.estado === 'emitida'; })) {
      return 'cotizado';
    }
    return 'prospecto';
  }

  // Nunca toca un estado manual (pausado/perdido/cancelado) — por eso es
  // seguro llamarla automáticamente después de cualquier mutación, sin
  // riesgo de deshacer una decisión manual de alguien.
  function recalcularEstadoProyecto(proyectoId) {
    var s = ensureState();
    var proyecto = s.proyectos[proyectoId];
    if (!proyecto || ESTADOS_MANUALES.indexOf(proyecto.estado) !== -1) {
      return;
    }
    var nuevo = calcularEstadoAutomatico(proyectoId);
    if (nuevo !== proyecto.estado) {
      proyecto.estado = nuevo;
      proyecto.actualizadoEn = nowISO();
    }
  }

  // "Reactivar": a diferencia de recalcularEstadoProyecto, ignora a
  // propósito el estado manual actual — es la única forma de salir de
  // pausado/perdido/cancelado.
  function reactivarProyecto(proyectoId) {
    var s = ensureState();
    var proyecto = s.proyectos[proyectoId];
    if (!proyecto) {
      return null;
    }
    proyecto.estado = calcularEstadoAutomatico(proyectoId);
    proyecto.actualizadoEn = nowISO();
    persist();
    return proyecto;
  }

  /* ============================================================
     EVENTOS (calendario = agenda)
     ============================================================ */
  function compararEventos(a, b) {
    var ha = a.horaInicio || '99:99';
    var hb = b.horaInicio || '99:99';
    if (ha !== hb) {
      return ha < hb ? -1 : 1;
    }
    return a.creadoEn < b.creadoEn ? -1 : 1;
  }

  function crearEvento(datos) {
    var s = ensureState();
    var id = 'EVT-' + pad4(s.nextEventoId++);
    var ts = nowISO();
    var tipo = datos.tipo || 'seguimiento';
    var clase = claseDeEvento(tipo);
    var evento = {
      id: id,
      proyectoId: datos.proyectoId,
      etapa: datos.etapa || null,
      tipo: tipo,
      fecha: datos.fecha,
      fechaFin: datos.fechaFin || null,
      estado: datos.estado || (clase === 'operativa' ? 'tentativa' : 'pendiente'),
      horaInicio: datos.horaInicio || null,
      horaFin: datos.horaFin || null,
      cuadrilla: datos.cuadrilla || null,
      notas: datos.notas || '',
      creadoEn: ts,
      actualizadoEn: ts
    };
    s.eventos[id] = evento;
    recalcularEstadoProyecto(evento.proyectoId);
    persist();
    return evento;
  }

  function actualizarEvento(id, cambios) {
    var s = ensureState();
    var existing = s.eventos[id];
    if (!existing) {
      return null;
    }
    var updated = {
      id: existing.id,
      proyectoId: cambios.proyectoId !== undefined ? cambios.proyectoId : existing.proyectoId,
      etapa: cambios.etapa !== undefined ? cambios.etapa : existing.etapa,
      tipo: cambios.tipo !== undefined ? cambios.tipo : existing.tipo,
      fecha: cambios.fecha !== undefined ? cambios.fecha : existing.fecha,
      fechaFin: cambios.fechaFin !== undefined ? cambios.fechaFin : existing.fechaFin,
      estado: cambios.estado !== undefined ? cambios.estado : existing.estado,
      horaInicio: cambios.horaInicio !== undefined ? cambios.horaInicio : existing.horaInicio,
      horaFin: cambios.horaFin !== undefined ? cambios.horaFin : existing.horaFin,
      cuadrilla: cambios.cuadrilla !== undefined ? cambios.cuadrilla : existing.cuadrilla,
      notas: cambios.notas !== undefined ? cambios.notas : existing.notas,
      creadoEn: existing.creadoEn,
      actualizadoEn: nowISO()
    };
    s.eventos[id] = updated;
    recalcularEstadoProyecto(updated.proyectoId);
    persist();
    return updated;
  }

  /* ============================================================
     RECORDATORIOS ("Tareas" del menú del día) — notas simples ligadas
     solo a una fecha. NO tienen proyecto, NO cuentan en getEstadoDia y
     NO recalculan estados de proyecto: por eso no pasan por eventos.
     ============================================================ */
  function crearRecordatorio(datos) {
    var s = ensureState();
    var id = 'REC-' + pad4(s.nextRecordatorioId++);
    var ts = nowISO();
    var rec = {
      id: id,
      fecha: datos.fecha,
      hora: datos.hora || null,
      titulo: datos.titulo || '',
      nota: datos.nota || '',
      hecho: !!datos.hecho,
      creadoEn: ts,
      actualizadoEn: ts
    };
    s.recordatorios[id] = rec;
    persist();
    return rec;
  }

  function actualizarRecordatorio(id, cambios) {
    var s = ensureState();
    var existing = s.recordatorios[id];
    if (!existing) {
      return null;
    }
    var updated = {
      id: existing.id,
      fecha: cambios.fecha !== undefined ? cambios.fecha : existing.fecha,
      hora: cambios.hora !== undefined ? (cambios.hora || null) : existing.hora,
      titulo: cambios.titulo !== undefined ? cambios.titulo : existing.titulo,
      nota: cambios.nota !== undefined ? cambios.nota : existing.nota,
      hecho: cambios.hecho !== undefined ? !!cambios.hecho : existing.hecho,
      creadoEn: existing.creadoEn,
      actualizadoEn: nowISO()
    };
    s.recordatorios[id] = updated;
    persist();
    return updated;
  }

  function eliminarRecordatorio(id) {
    var s = ensureState();
    if (!s.recordatorios[id]) {
      return false;
    }
    delete s.recordatorios[id];
    persist();
    return true;
  }

  // Pendientes primero; dentro de cada grupo por hora (sin hora al final), luego por creación.
  function getRecordatoriosPorFecha(fechaISO) {
    var s = ensureState();
    var out = [];
    Object.keys(s.recordatorios).forEach(function (id) {
      if (s.recordatorios[id].fecha === fechaISO) {
        out.push(s.recordatorios[id]);
      }
    });
    out.sort(function (a, b) {
      if (a.hecho !== b.hecho) { return a.hecho ? 1 : -1; }
      var ha = a.hora || '99:99';
      var hb = b.hora || '99:99';
      if (ha !== hb) { return ha < hb ? -1 : 1; }
      return a.id < b.id ? -1 : 1;
    });
    return out;
  }

  function getEvento(id) {
    var s = ensureState();
    return s.eventos[id] || null;
  }

  function getEventosDeProyecto(proyectoId) {
    var s = ensureState();
    var out = [];
    Object.keys(s.eventos).forEach(function (id) {
      if (s.eventos[id].proyectoId === proyectoId) {
        out.push(s.eventos[id]);
      }
    });
    out.sort(function (a, b) { return (a.fecha || '') < (b.fecha || '') ? -1 : 1; });
    return out;
  }

  // true si fechaISO cae dentro de [evt.fecha, evt.fechaFin || evt.fecha]
  // — así una actividad multi-día aparece al consultar cualquiera de los
  // días de su rango, no solo el de inicio.
  function eventoTocaFecha(evt, fechaISO) {
    var fin = evt.fechaFin || evt.fecha;
    return fechaISO >= evt.fecha && fechaISO <= fin;
  }

  function getEventosPorFecha(fechaISO) {
    var s = ensureState();
    var out = [];
    Object.keys(s.eventos).forEach(function (id) {
      if (eventoTocaFecha(s.eventos[id], fechaISO)) {
        out.push(s.eventos[id]);
      }
    });
    out.sort(compararEventos);
    return out;
  }

  function getEventosDelMes(anio, mes) {
    var s = ensureState();
    var out = {};
    var inicioMes = new Date(anio, mes, 1);
    var finMes = new Date(anio, mes + 1, 0);
    Object.keys(s.eventos).forEach(function (id) {
      var evt = s.eventos[id];
      var inicioEvt = parseLocalISO(evt.fecha);
      var finEvt = parseLocalISO(evt.fechaFin || evt.fecha);
      var cursor = inicioEvt > inicioMes ? inicioEvt : inicioMes;
      var limite = finEvt < finMes ? finEvt : finMes;
      while (cursor <= limite) {
        var fechaISO = dateToISO(cursor);
        if (!out[fechaISO]) { out[fechaISO] = []; }
        out[fechaISO].push(evt);
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
      }
    });
    Object.keys(out).forEach(function (k) { out[k].sort(compararEventos); });
    return out;
  }

  // {dia, total} de una actividad multi-día en fechaISO, o null si el
  // evento es de un solo día (no se pinta "día n/m" en ese caso).
  function diaDeActividad(evt, fechaISO) {
    var fin = evt.fechaFin || evt.fecha;
    if (fin === evt.fecha) {
      return null;
    }
    return {
      dia: diasEntreISO(evt.fecha, fechaISO) + 1,
      total: diasEntreISO(evt.fecha, fin) + 1
    };
  }

  // Única vía al rojo de alerta para un evento: operativa confirmada/en
  // ejecución cuya fecha (o fecha fin, si es multi-día) ya pasó sin
  // haberse marcado terminada. Las hitos y las ya terminadas/canceladas
  // nunca están "vencidas".
  function eventoVencido(evt) {
    if (!esOperativa(evt.tipo)) {
      return false;
    }
    if (evt.estado !== 'confirmada' && evt.estado !== 'en_ejecucion') {
      return false;
    }
    return (evt.fechaFin || evt.fecha) < todayISO();
  }

  // libre = sin actividades operativas ese día; reservado = alguna
  // operativa tentativa (nada confirmado todavía); ocupado = alguna
  // operativa confirmada o en ejecución. Los hitos nunca cuentan, y una
  // actividad terminada/cancelada tampoco mantiene el día ocupado.
  function getEstadoDia(fechaISO) {
    var operativas = getEventosPorFecha(fechaISO).filter(function (e) { return esOperativa(e.tipo); });
    if (operativas.some(function (e) { return e.estado === 'confirmada' || e.estado === 'en_ejecucion'; })) {
      return 'ocupado';
    }
    if (operativas.some(function (e) { return e.estado === 'tentativa'; })) {
      return 'reservado';
    }
    return 'libre';
  }

  /* ============================================================
     SOLICITUDES
     ============================================================ */
  function crearSolicitud(datos) {
    var s = ensureState();
    var id = 'SOL-' + pad4(s.nextId++);
    var ts = nowISO();

    var proyectoId = datos.proyectoId;
    if (!proyectoId) {
      var generales = datos.generales || {};
      var detalle = datos.detalleProyecto || {};
      var nuevoProyecto = crearProyectoInterno(s, {
        nombre: detalle.descripcion || detalle.tipoProyecto || generales.nombreRazonSocial || id,
        cliente: {
          nombre: generales.nombreRazonSocial || '',
          contacto: generales.asesorAsignado || '',
          email: generales.correo || '',
          telefono: generales.telefono || '',
          direccion: generales.direccionProyecto || ''
        },
        tipo: detalle.tipoProyecto || '',
        ubicacion: generales.direccionProyecto || '',
        estado: 'prospecto'
      });
      proyectoId = nuevoProyecto.id;
    }

    var solicitud = {
      id: id,
      proyectoId: proyectoId,
      fechaSolicitud: datos.fechaSolicitud,
      estado: datos.estado || 'pendiente',
      obraId: datos.obraId || null,
      generales: datos.generales || {},
      detalleProyecto: datos.detalleProyecto || {},
      documentos: datos.documentos || [],
      seguimiento: datos.seguimiento || {},
      creadaEn: ts,
      actualizadaEn: ts
    };
    s.solicitudes[id] = solicitud;
    marcarEtapaProyecto(proyectoId, 'solicitud-cotizacion', 'en_curso');
    recalcularEstadoProyecto(proyectoId);
    persist();
    return solicitud;
  }

  function actualizarSolicitud(id, cambios) {
    var s = ensureState();
    var existing = s.solicitudes[id];
    if (!existing) {
      return null;
    }
    var updated = {
      id: existing.id,
      proyectoId: cambios.proyectoId !== undefined ? cambios.proyectoId : existing.proyectoId,
      fechaSolicitud: cambios.fechaSolicitud !== undefined ? cambios.fechaSolicitud : existing.fechaSolicitud,
      estado: cambios.estado !== undefined ? cambios.estado : existing.estado,
      obraId: cambios.obraId !== undefined ? cambios.obraId : existing.obraId,
      generales: cambios.generales !== undefined ? cambios.generales : existing.generales,
      detalleProyecto: cambios.detalleProyecto !== undefined ? cambios.detalleProyecto : existing.detalleProyecto,
      documentos: cambios.documentos !== undefined ? cambios.documentos : existing.documentos,
      seguimiento: cambios.seguimiento !== undefined ? cambios.seguimiento : existing.seguimiento,
      creadaEn: existing.creadaEn,
      actualizadaEn: nowISO()
    };
    s.solicitudes[id] = updated;
    recalcularEstadoProyecto(updated.proyectoId);
    persist();
    return updated;
  }

  function getSolicitud(id) {
    var s = ensureState();
    return s.solicitudes[id] || null;
  }

  function getSolicitudesPorFecha(fechaISO) {
    var s = ensureState();
    var out = [];
    Object.keys(s.solicitudes).forEach(function (id) {
      var sol = s.solicitudes[id];
      if (sol.fechaSolicitud === fechaISO) {
        out.push(sol);
      }
    });
    // Más reciente primero, para que "la más reciente" (usada al abrir
    // desde el calendario cuando hay una sola) sea siempre out[0].
    out.sort(function (a, b) { return a.creadaEn < b.creadaEn ? 1 : -1; });
    return out;
  }

  function getSolicitudesDelMes(anio, mes) {
    var s = ensureState();
    var out = {};
    Object.keys(s.solicitudes).forEach(function (id) {
      var sol = s.solicitudes[id];
      var parts = sol.fechaSolicitud.split('-');
      var sy = parseInt(parts[0], 10);
      var sm = parseInt(parts[1], 10) - 1;
      if (sy === anio && sm === mes) {
        if (!out[sol.fechaSolicitud]) {
          out[sol.fechaSolicitud] = [];
        }
        out[sol.fechaSolicitud].push(sol);
      }
    });
    return out;
  }

  /* ============================================================
     LEVANTAMIENTOS — un levantamiento vigente por proyecto, igual que
     Solicitud (sin selector de versiones). `plantillaSnapshot` congela
     la plantilla usada al crear: un levantamiento viejo nunca se
     repinta con una plantilla editada después (ver plantillas.js). La
     sección "Visita" la interpreta la pantalla (OC_LEVANTAMIENTO.html),
     no este archivo: aquí solo se guarda el registro ya resuelto.
     ============================================================ */
  function crearLevantamiento(datos) {
    var s = ensureState();
    var id = 'LEV-' + pad4(s.nextLevantamientoId++);
    var ts = nowISO();
    var levantamiento = {
      id: id,
      proyectoId: datos.proyectoId,
      plantillaId: datos.plantillaId,
      plantillaVersion: datos.plantillaVersion,
      plantillaSnapshot: datos.plantillaSnapshot,
      estado: datos.estado || 'en_curso',
      responsable: datos.responsable || '',
      eventoVisitaId: datos.eventoVisitaId || null,
      datos: datos.datos || {},
      pdfKey: null,
      creadoEn: ts,
      actualizadoEn: ts
    };
    s.levantamientos[id] = levantamiento;
    marcarEtapaProyecto(levantamiento.proyectoId, 'levantamiento-tecnico', 'en_curso');
    recalcularEstadoProyecto(levantamiento.proyectoId);
    persist();
    return levantamiento;
  }

  function actualizarLevantamiento(id, cambios) {
    var s = ensureState();
    var existing = s.levantamientos[id];
    if (!existing) {
      return null;
    }
    var updated = {
      id: existing.id,
      proyectoId: existing.proyectoId,
      plantillaId: existing.plantillaId,
      plantillaVersion: existing.plantillaVersion,
      plantillaSnapshot: existing.plantillaSnapshot,
      estado: cambios.estado !== undefined ? cambios.estado : existing.estado,
      responsable: cambios.responsable !== undefined ? cambios.responsable : existing.responsable,
      eventoVisitaId: cambios.eventoVisitaId !== undefined ? cambios.eventoVisitaId : existing.eventoVisitaId,
      datos: cambios.datos !== undefined ? cambios.datos : existing.datos,
      pdfKey: cambios.pdfKey !== undefined ? cambios.pdfKey : existing.pdfKey,
      creadoEn: existing.creadoEn,
      actualizadoEn: nowISO()
    };
    s.levantamientos[id] = updated;
    // Nunca retrocede una etapa ya completada/bloqueada (mismo guard
    // que marcarEtapaProyecto aplica siempre internamente).
    if (cambios.estado === 'completada') {
      marcarEtapaProyecto(updated.proyectoId, 'levantamiento-tecnico', 'completada');
    }
    recalcularEstadoProyecto(updated.proyectoId);
    persist();
    return updated;
  }

  function getLevantamiento(id) {
    var s = ensureState();
    return s.levantamientos[id] || null;
  }

  function getLevantamientoPorProyecto(proyectoId) {
    var s = ensureState();
    var out = null;
    Object.keys(s.levantamientos).forEach(function (id) {
      var lev = s.levantamientos[id];
      if (lev.proyectoId === proyectoId && (!out || lev.creadoEn > out.creadoEn)) {
        out = lev;
      }
    });
    return out;
  }

  /* ============================================================
     COTIZACIONES
     ============================================================ */
  function calcularTotalesDe(cot) {
    var subtotal = 0;
    var descuento = 0;
    (cot.partidas || []).forEach(function (p) {
      var importe = (p.cantidad || 0) * (p.precioUnitario || 0);
      var desc = importe * ((p.descuentoPct || 0) / 100);
      subtotal += importe;
      descuento += desc;
    });
    var base = subtotal - descuento;
    var iva = base * ((cot.ivaPct != null ? cot.ivaPct : 16) / 100);
    var total = base + iva;
    return {
      subtotal: round2(subtotal),
      descuento: round2(descuento),
      iva: round2(iva),
      total: round2(total)
    };
  }

  function bumpFolioVersion(folio, nuevaVersionNum) {
    return folio.replace(/-v\d+$/, '-v' + nuevaVersionNum);
  }

  function crearCotizacion(datos) {
    var s = ensureState();
    var seq = s.nextCotId++;
    var id = 'COT-' + pad4(seq);
    var ts = nowISO();
    var year = (datos.fecha || todayISO()).split('-')[0];
    var proyectoId = datos.proyectoId
      || (s.solicitudes[datos.solicitudId] && s.solicitudes[datos.solicitudId].proyectoId)
      || null;
    var cot = {
      id: id,
      folio: 'COT-' + year + '-' + pad4(seq) + '-v1',
      solicitudId: datos.solicitudId,
      proyectoId: proyectoId,
      fecha: datos.fecha,
      fechaEmision: null,
      version: 1,
      tipo: 'original',
      basadaEn: null,
      estado: 'borrador',
      moneda: datos.moneda || 'MXN',
      vigenciaDias: datos.vigenciaDias != null ? datos.vigenciaDias : 15,
      cliente: datos.cliente || {},
      proyecto: datos.proyecto || {},
      partidas: datos.partidas || [],
      ivaPct: datos.ivaPct != null ? datos.ivaPct : 16,
      condiciones: datos.condiciones || {},
      elaboro: datos.elaboro || '',
      totales: null,
      pdfKey: null,
      creadaEn: ts,
      actualizadaEn: ts
    };
    s.cotizaciones[id] = cot;
    marcarEtapaProyecto(proyectoId, 'cotizacion', 'en_curso');
    recalcularEstadoProyecto(proyectoId);
    persist();
    return cot;
  }

  function actualizarCotizacion(id, cambios) {
    var s = ensureState();
    var existing = s.cotizaciones[id];
    if (!existing || existing.estado !== 'borrador') {
      // Inmutable si ya se emitió; no hay nada que actualizar.
      return null;
    }
    var updated = {
      id: existing.id,
      folio: existing.folio,
      solicitudId: existing.solicitudId,
      proyectoId: cambios.proyectoId !== undefined ? cambios.proyectoId : existing.proyectoId,
      fecha: cambios.fecha !== undefined ? cambios.fecha : existing.fecha,
      fechaEmision: existing.fechaEmision,
      version: existing.version,
      tipo: existing.tipo,
      basadaEn: existing.basadaEn,
      estado: existing.estado,
      moneda: cambios.moneda !== undefined ? cambios.moneda : existing.moneda,
      vigenciaDias: cambios.vigenciaDias !== undefined ? cambios.vigenciaDias : existing.vigenciaDias,
      cliente: cambios.cliente !== undefined ? cambios.cliente : existing.cliente,
      proyecto: cambios.proyecto !== undefined ? cambios.proyecto : existing.proyecto,
      partidas: cambios.partidas !== undefined ? cambios.partidas : existing.partidas,
      ivaPct: cambios.ivaPct !== undefined ? cambios.ivaPct : existing.ivaPct,
      condiciones: cambios.condiciones !== undefined ? cambios.condiciones : existing.condiciones,
      elaboro: cambios.elaboro !== undefined ? cambios.elaboro : existing.elaboro,
      totales: existing.totales,
      pdfKey: existing.pdfKey,
      creadaEn: existing.creadaEn,
      actualizadaEn: nowISO()
    };
    s.cotizaciones[id] = updated;
    recalcularEstadoProyecto(updated.proyectoId);
    persist();
    return updated;
  }

  function getCotizacion(id) {
    var s = ensureState();
    return s.cotizaciones[id] || null;
  }

  function getCotizacionesPorSolicitud(solicitudId) {
    var s = ensureState();
    var out = [];
    Object.keys(s.cotizaciones).forEach(function (id) {
      if (s.cotizaciones[id].solicitudId === solicitudId) {
        out.push(s.cotizaciones[id]);
      }
    });
    out.sort(function (a, b) { return a.creadaEn < b.creadaEn ? 1 : -1; });
    return out;
  }

  function getCotizacionesPorFecha(fechaISO) {
    var s = ensureState();
    var out = [];
    Object.keys(s.cotizaciones).forEach(function (id) {
      if (s.cotizaciones[id].fecha === fechaISO) {
        out.push(s.cotizaciones[id]);
      }
    });
    out.sort(function (a, b) { return a.creadaEn < b.creadaEn ? 1 : -1; });
    return out;
  }

  // emitirCotizacion es la única función async de este archivo: para
  // volverse inmutable necesita primero guardar el PDF en IndexedDB
  // (OCPdfStore, asíncrono por naturaleza) antes de fijar el estado.
  function emitirCotizacion(id, pdfBlob) {
    var s = ensureState();
    var existing = s.cotizaciones[id];
    if (!existing || existing.estado !== 'borrador') {
      return Promise.resolve(null);
    }
    if (!global.OCPdfStore) {
      return Promise.reject(new Error('OCPdfStore no está cargado; agrega <script src="pdfStore.js"> antes de emitir.'));
    }

    var totales = calcularTotalesDe(existing);
    var pdfKey = existing.pdfKey || ('PDF-' + existing.id);

    return global.OCPdfStore.guardarPdf(pdfKey, pdfBlob).then(function () {
      var updated = deepClone(existing);
      updated.estado = 'emitida';
      updated.fechaEmision = todayISO();
      updated.totales = totales;
      updated.pdfKey = pdfKey;
      updated.actualizadaEn = nowISO();
      s.cotizaciones[id] = updated;

      // La versión anterior (si existe y sigue "emitida") queda sustituida.
      if (updated.tipo === 'actualizacion' && updated.basadaEn && s.cotizaciones[updated.basadaEn]) {
        var anterior = s.cotizaciones[updated.basadaEn];
        if (anterior.estado === 'emitida') {
          anterior.estado = 'sustituida';
          anterior.actualizadaEn = nowISO();
        }
      }

      // La solicitud avanza a 'cotizada' si todavía no se había cotizado.
      var sol = s.solicitudes[updated.solicitudId];
      if (sol && ESTADOS_PRE_COTIZADA.indexOf(sol.estado) !== -1) {
        sol.estado = 'cotizada';
        sol.actualizadaEn = nowISO();
      }

      // La etapa "cotización" del proyecto se da por completada.
      var proyecto = s.proyectos[updated.proyectoId];
      if (proyecto) {
        proyecto.etapas.cotizacion = 'completada';
        proyecto.actualizadoEn = nowISO();
      }

      recalcularEstadoProyecto(updated.proyectoId);
      persist();
      return updated;
    });
  }

  function nuevaVersion(id) {
    var s = ensureState();
    var base = s.cotizaciones[id];
    if (!base) {
      return null;
    }
    var seq = s.nextCotId++;
    var newId = 'COT-' + pad4(seq);
    var ts = nowISO();
    var copy = {
      id: newId,
      folio: bumpFolioVersion(base.folio, base.version + 1),
      solicitudId: base.solicitudId,
      proyectoId: base.proyectoId,
      fecha: base.fecha,
      fechaEmision: null,
      version: base.version + 1,
      tipo: 'actualizacion',
      basadaEn: base.id,
      estado: 'borrador',
      moneda: base.moneda,
      vigenciaDias: base.vigenciaDias,
      cliente: deepClone(base.cliente),
      proyecto: deepClone(base.proyecto),
      partidas: deepClone(base.partidas),
      ivaPct: base.ivaPct,
      condiciones: deepClone(base.condiciones),
      elaboro: base.elaboro,
      totales: null,
      pdfKey: null,
      creadaEn: ts,
      actualizadaEn: ts
    };
    s.cotizaciones[newId] = copy;
    recalcularEstadoProyecto(copy.proyectoId);
    persist();
    return copy;
  }

  function copiarComoAdicional(id) {
    var s = ensureState();
    var base = s.cotizaciones[id];
    if (!base) {
      return null;
    }
    var seq = s.nextCotId++;
    var newId = 'COT-' + pad4(seq);
    var ts = nowISO();
    var year = (base.fecha || todayISO()).split('-')[0];
    var copy = {
      id: newId,
      folio: 'COT-' + year + '-' + pad4(seq) + '-v1',
      solicitudId: base.solicitudId,
      proyectoId: base.proyectoId,
      fecha: base.fecha,
      fechaEmision: null,
      version: 1,
      tipo: 'adicional',
      basadaEn: base.id, // referencia informativa: de cuál partió, no a quién sustituye
      estado: 'borrador',
      moneda: base.moneda,
      vigenciaDias: base.vigenciaDias,
      cliente: deepClone(base.cliente),
      proyecto: deepClone(base.proyecto),
      partidas: deepClone(base.partidas),
      ivaPct: base.ivaPct,
      condiciones: deepClone(base.condiciones),
      elaboro: base.elaboro,
      totales: null,
      pdfKey: null,
      creadaEn: ts,
      actualizadaEn: ts
    };
    s.cotizaciones[newId] = copy;
    recalcularEstadoProyecto(copy.proyectoId);
    persist();
    return copy;
  }

  /* ============================================================
     RESPUESTA DEL CLIENTE — aceptar/rechazar una cotización emitida.
     El PDF ya emitido no se toca nunca: la respuesta solo vive en
     `cotizacion.respuesta Cliente` (y en `cotizacion.estado`, que pasa
     a valer directamente 'aceptada'/'rechazada' — así
     calcularEstadoAutomatico no necesita saber nada de esto, solo
     sigue leyendo cot.estado como ya hacía).
     ============================================================ */
  var MOTIVOS_RECHAZO_COTIZACION = ['precio', 'tiempo', 'competencia', 'sin-respuesta', 'otro'];

  function aceptarCotizacion(id, opts) {
    opts = opts || {};
    var s = ensureState();
    var existing = s.cotizaciones[id];
    if (!existing) {
      throw new Error('No existe la cotización ' + id + '.');
    }
    if (existing.estado !== 'emitida') {
      throw new Error('Solo se puede aceptar una cotización emitida (estado actual: ' + existing.estado + ').');
    }
    var ts = nowISO();
    var updated = deepClone(existing);
    updated.estado = 'aceptada';
    updated.respuestaCliente = {
      estado: 'aceptada',
      fecha: opts.fecha || todayISO(),
      motivo: null,
      nota: opts.nota || '',
      registradaEn: ts
    };
    updated.actualizadaEn = ts;
    s.cotizaciones[id] = updated;

    var sol = s.solicitudes[updated.solicitudId];
    if (sol) {
      sol.estado = 'aceptada';
      sol.actualizadaEn = ts;
    }

    recalcularEstadoProyecto(updated.proyectoId);
    persist();
    return updated;
  }

  function rechazarCotizacion(id, opts) {
    opts = opts || {};
    var s = ensureState();
    var existing = s.cotizaciones[id];
    if (!existing) {
      throw new Error('No existe la cotización ' + id + '.');
    }
    if (existing.estado !== 'emitida') {
      throw new Error('Solo se puede rechazar una cotización emitida (estado actual: ' + existing.estado + ').');
    }
    var motivo = MOTIVOS_RECHAZO_COTIZACION.indexOf(opts.motivo) !== -1 ? opts.motivo : 'otro';
    var ts = nowISO();
    var updated = deepClone(existing);
    updated.estado = 'rechazada';
    updated.respuestaCliente = {
      estado: 'rechazada',
      fecha: opts.fecha || todayISO(),
      motivo: motivo,
      nota: opts.nota || '',
      registradaEn: ts
    };
    updated.actualizadaEn = ts;
    s.cotizaciones[id] = updated;

    // No se toca la solicitud ni se marca el proyecto como perdido
    // automáticamente — eso queda a criterio de quien usa la app (ver
    // todasCotizacionesRechazadas, que solo informa la sugerencia).
    recalcularEstadoProyecto(updated.proyectoId);
    persist();
    return updated;
  }

  // Deshace un clic equivocado: la cotización vuelve a 'emitida' y se
  // puede volver a aceptar/rechazar. Si la solicitud había pasado a
  // 'aceptada' por ESTA cotización, regresa a 'cotizada' (ya se había
  // cotizado, solo se deshace la aceptación).
  function revertirRespuesta(id) {
    var s = ensureState();
    var existing = s.cotizaciones[id];
    if (!existing) {
      return null;
    }
    if (existing.estado !== 'aceptada' && existing.estado !== 'rechazada') {
      return existing; // nada que revertir
    }
    var ts = nowISO();
    var updated = deepClone(existing);
    updated.estado = 'emitida';
    delete updated.respuestaCliente;
    updated.actualizadaEn = ts;
    s.cotizaciones[id] = updated;

    var sol = s.solicitudes[updated.solicitudId];
    if (sol && sol.estado === 'aceptada') {
      sol.estado = 'cotizada';
      sol.actualizadaEn = ts;
    }

    recalcularEstadoProyecto(updated.proyectoId);
    persist();
    return updated;
  }

  // true si el proyecto tiene al menos una cotización que llegó a
  // emitirse (no borrador, no sustituida — las sustituidas ya no son
  // una decisión vigente) y TODAS las vigentes quedaron rechazadas. Solo
  // informa una sugerencia; nunca marca el proyecto como perdido solo.
  function todasCotizacionesRechazadas(proyectoId) {
    var vigentes = getCotizacionesPorProyecto(proyectoId).filter(function (c) {
      return c.estado !== 'sustituida' && c.estado !== 'borrador';
    });
    return vigentes.length > 0 && vigentes.every(function (c) { return c.estado === 'rechazada'; });
  }

  global.OCStore = {
    // Proyectos
    STAGE_IDS: OC_STAGE_IDS,
    TIPOS_PROYECTO: TIPOS_PROYECTO,
    crearProyecto: crearProyecto,
    actualizarProyecto: actualizarProyecto,
    getProyecto: getProyecto,
    getProyectos: getProyectos,
    getArbolProyectos: getArbolProyectos,
    getEtapasDeProyecto: getEtapasDeProyecto,
    getSolicitudPorProyecto: getSolicitudPorProyecto,
    getCotizacionesPorProyecto: getCotizacionesPorProyecto,
    recalcularEstadoProyecto: recalcularEstadoProyecto,
    reactivarProyecto: reactivarProyecto,
    // Eventos
    TIPOS_EVENTO: TIPOS_EVENTO,
    claseDeEvento: claseDeEvento,
    crearEvento: crearEvento,
    actualizarEvento: actualizarEvento,
    getEvento: getEvento,
    getEventosDeProyecto: getEventosDeProyecto,
    getEventosPorFecha: getEventosPorFecha,
    getEventosDelMes: getEventosDelMes,
    diaDeActividad: diaDeActividad,
    eventoVencido: eventoVencido,
    // Recordatorios (tareas del día)
    crearRecordatorio: crearRecordatorio,
    actualizarRecordatorio: actualizarRecordatorio,
    eliminarRecordatorio: eliminarRecordatorio,
    getRecordatoriosPorFecha: getRecordatoriosPorFecha,
    // Solicitudes
    crearSolicitud: crearSolicitud,
    actualizarSolicitud: actualizarSolicitud,
    getSolicitud: getSolicitud,
    getSolicitudesPorFecha: getSolicitudesPorFecha,
    getSolicitudesDelMes: getSolicitudesDelMes,
    getEstadoDia: getEstadoDia,
    // Levantamientos
    crearLevantamiento: crearLevantamiento,
    actualizarLevantamiento: actualizarLevantamiento,
    getLevantamiento: getLevantamiento,
    getLevantamientoPorProyecto: getLevantamientoPorProyecto,
    // Cotizaciones
    crearCotizacion: crearCotizacion,
    actualizarCotizacion: actualizarCotizacion,
    getCotizacion: getCotizacion,
    getCotizacionesPorSolicitud: getCotizacionesPorSolicitud,
    getCotizacionesPorFecha: getCotizacionesPorFecha,
    calcularTotales: calcularTotalesDe,
    emitirCotizacion: emitirCotizacion,
    nuevaVersion: nuevaVersion,
    copiarComoAdicional: copiarComoAdicional,
    aceptarCotizacion: aceptarCotizacion,
    rechazarCotizacion: rechazarCotizacion,
    revertirRespuesta: revertirRespuesta,
    todasCotizacionesRechazadas: todasCotizacionesRechazadas,
    MOTIVOS_RECHAZO_COTIZACION: MOTIVOS_RECHAZO_COTIZACION,
    // Config / utilidades
    getConfig: getConfig,
    dateToISO: dateToISO,
    todayISO: todayISO,
    SEED_PDFS_FLAG_KEY: SEED_PDFS_FLAG_KEY,
    SEED_LEVANTAMIENTOS_FLAG_KEY: SEED_LEVANTAMIENTOS_FLAG_KEY
  };
})(window);
