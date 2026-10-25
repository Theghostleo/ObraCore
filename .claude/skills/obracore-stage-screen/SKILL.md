---
name: obracore-stage-screen
description: Receta para construir una nueva pantalla de etapa de ObraCore (Levantamiento técnico, Diseño del sistema, Procura de equipos, Programación de instalación, Comisionamiento y calidad) y conectarla al menú radial, al store y a i18n. Úsala cuando se pida crear, conectar o rehacer cualquiera de las 7 etapas o una pantalla nueva tipo formulario.
---

# ObraCore — nueva pantalla de etapa

Antes de escribir código, lee completos: `OC_SOLICITUD.html` (plantilla de referencia),
`store.js` (entidades `Proyecto`/`Evento`, y `OCStore.STAGE_IDS`/`getEtapasDeProyecto`),
`i18n.js`, `i18n/es.json`, y la sección del menú radial de `OC_MAIN.html` (`openFan`,
`onStageSelected`, el árbol de proyectos). Aplica también las skills `obracore-design-tokens`
y `obracore-motion`. Si tu etapa necesita un formulario de verdad (no solo 3-4 campos
sueltos), lee también `OC_LEVANTAMIENTO.html` como referencia de etapa construida sobre
`OCForms`/`OCPlantillas` y la skill `obracore-form-templates`.

La entidad central de ObraCore es el **Proyecto** (no la fecha ni la solicitud): un
proyecto tiene 7 etapas (`proyecto.etapas[id]`) y cada etapa puede tener uno o más
registros (solicitud, cotizaciones, y lo que agregue tu etapa nueva).

## Las 7 etapas (ids fijos de `OCStore.STAGE_IDS`)

| # | id | Archivo | Estado |
|---|---|---|---|
| 1 | `solicitud-cotizacion` | `OC_SOLICITUD.html` | Hecha |
| 2 | `cotizacion` | `OC_COTIZACION.html` | Hecha |
| 3 | `levantamiento-tecnico` | `OC_LEVANTAMIENTO.html` | Hecha |
| 4 | `diseno-sistema` | `OC_DISENO.html` | Pendiente |
| 5 | `procura-equipos` | `OC_PROCURA.html` | Pendiente |
| 6 | `programacion-instalacion` | `OC_PROGRAMACION.html` | Pendiente |
| 7 | `comisionamiento-calidad` | `OC_COMISIONAMIENTO.html` | Pendiente |

Los ids viven en un solo lugar, `OCStore.STAGE_IDS` (`store.js`) — ni esta pantalla ni
`OC_MAIN.html` deben volver a declarar su propia lista. Actualiza esta tabla cuando
termines una etapa, y agrega su id a `ETAPAS_CON_PANTALLA` en `OC_MAIN.html` (controla
tanto el árbol como el fan: mientras no esté ahí, la etapa se muestra deshabilitada con
"Próximamente" en ambos lugares).

## Estructura del archivo `OC_<ETAPA>.html`

1. **Autocontenido**: HTML + `<style>` + `<script>` inline. No depende de `styles.css`;
   copia el bloque `:root` de tokens **exacto** y el comentario que explica por qué.
2. `<head>`: `lang="es"`, título `ObraCore — <Etapa>`, Google Fonts (Space Grotesk + IBM Plex Mono, con el mismo `family=` que las demás pantallas).
   Incluye también `:focus-visible`, los keyframes `oc-fade-in`/`oc-pop-in` y el bloque
   `prefers-reduced-motion` (ver `obracore-motion`).
3. Navbar igual a la de `OC_SOLICITUD.html` (logo, placeholders). Ninguna pantalla
   autocontenida trae su propio selector ES/EN — el idioma se fija una vez en
   `OC_MAIN.html` y persiste en `localStorage` (`oc-lang`); `OC_I18N.init()` ya lo recoge
   solo con que la pantalla cargue `i18n.js`.
4. `<main>` con `<h1 class="oc-page-title">`, formulario de una columna en
   `<section class="oc-card">` con `<h2 class="oc-card-title">`, campos `.oc-field` + `.oc-input`.
5. Barra `.oc-form-actions`: botón primario Guardar, secundario Cancelar (vuelve a
   `OC_MAIN.html`), y un `<span>` de feedback que hace fade (sin `alert()` ni `confirm()`).
6. Scripts al final, en este orden: librerías de `lib/` si hacen falta → `store.js` →
   (`pdfStore.js`, `pdf.js` si genera PDF) → `i18n.js` → script inline en IIFE con
   `'use strict'`, que termina en `OC_I18N.init();`.
7. Debe funcionar abierta sola (sin pasar por OC_MAIN) y con parámetros.

## Parámetros de URL (convención)

Reutiliza `getQueryParams()` de `OC_SOLICITUD.html`. `?proyecto=` es el parámetro
**principal** — sigue el orden de prioridad que ya usan `OC_SOLICITUD.html` e
`OC_COTIZACION.html`:

- `?id=<ID>` — abrir un registro existente directo (editar, o solo lectura si ya cerró).
- `?proyecto=PRJ-XXXX` — crear/abrir el registro de esta etapa para ese proyecto
  (vía `OCStore.getEtapasDeProyecto(proyectoId)` para saber si ya existe uno).
- `?fecha=YYYY-MM-DD` — **solo prefill**, nunca llave: a lo más rellena un campo de
  fecha si tu formulario tiene uno. No se usa para decidir qué registro abrir.
- Si el id/proyecto no existe, cae al modo creación sin romperse (igual que
  `OC_SOLICITUD.html`: ver `initFromQuery`).

## Datos (`store.js`)

- **Ninguna pantalla toca `localStorage` directamente**: todo pasa por `window.OCStore`.
- Cada etapa nueva agrega su entidad al mismo `state` de `store.js`, con:
  `id` con prefijo (`LEV-0001`, `DIS-`, `PRO-`, `PRG-`, `COM-`), **`proyectoId`**
  (obligatorio — es lo que la liga al árbol y permite que `getEtapasDeProyecto` la
  encuentre), `estado` (`pendiente | en_curso | bloqueada | completada`), `responsable`,
  `datos { …específicos de la etapa… }`, `creadaEn`, `actualizadaEn`. Ya no se usa
  `solicitudId`/`fecha` como llave de búsqueda (sí puedes guardarlos como dato de
  referencia si tu etapa lo necesita).
- API mínima por entidad: `crear<X>`, `actualizar<X>`, `get<X>`, `get<X>sPorProyecto`.
  Expórtalas en `global.OCStore` junto a las existentes.
- En `crear<X>`, actualiza la etapa del proyecto con un helper análogo a
  `marcarEtapaProyecto` (ver `crearSolicitud`/`crearCotizacion` en `store.js`): pasa a
  `en_curso` al crear el primer registro, a `completada` cuando la etapa se da por
  cerrada. Nunca retrocedas una etapa ya `completada`/`bloqueada`.
- Si tu etapa agenda algo en el calendario (una visita, un levantamiento en sitio...),
  créale un `Evento` (`OCStore.crearEvento({ proyectoId, etapa: '<tu-id>', tipo, fecha, ... })`)
  en vez de inventar tu propio mecanismo de fecha.
- Fechas de día: `OCStore.dateToISO()` / `todayISO()` (hora local). **Nunca** `toISOString()`
  para fechas de calendario.
- Agrega 1–2 proyectos/registros de ejemplo a `seedData()` para que la etapa se vea con datos.
- Si la etapa debe afectar `getEstadoDia`, explícalo antes de cambiar esa regla. Hoy
  (`store.js`) es puramente por estado de las actividades operativas del día, sin
  capacidad: alguna `confirmada`/`en_ejecucion` → `'ocupado'`; si no, alguna `tentativa` →
  `'reservado'`; si no, `'libre'`. `config.capacidadInstalacionesPorDia` existe pero no se
  usa en esta función.
- Si tu etapa necesita un formulario (cualquier cosa más allá de 3-4 campos sueltos, o que
  varíe según el giro/tipo de proyecto), **no lo escribas a mano** — usa el motor
  `OCForms`/`OCPlantillas` (`forms.js`/`plantillas.js`) y lee la skill
  `obracore-form-templates` antes de empezar. `OC_LEVANTAMIENTO.html` es la referencia.

## Conexión con `OC_MAIN.html`

La integración ahora es con el **árbol de proyectos** (fuente primaria) y con el **fan**
del calendario (atajo desde un evento/chip) — ambos leen el mismo estado de
`OCStore.getEtapasDeProyecto(proyectoId)`, así que conectar uno bien conecta el otro:

1. Agrega el id de tu etapa a `ETAPAS_CON_PANTALLA` en `OC_MAIN.html`. Esto hace que:
   - en el árbol, la fila de la etapa deje de mostrar la pastilla `PRONTO` y se vuelva
     clickeable (navega a `'OC_<ETAPA>.html?proyecto=' + proyectoId`);
   - en el fan, su pill deje de estar deshabilitado.
   No necesitas tocar la geometría del árbol ni del fan para esto.
2. En `onStageSelected(stageId, proyectoId, cell)`, agrega una rama para tu id que llame
   a `open<Etapa>Flow(proyectoId)`, siguiendo el patrón de `openSolicitudFlow`: si
   `getEtapasDeProyecto` ya trae un registro para tu etapa, navega a `?proyecto=&id=`;
   si no, navega solo a `?proyecto=` (modo creación). No hace falta selector de
   "varios registros": la convención es 1 registro vigente por etapa por proyecto (si tu
   etapa genera varias versiones como Cotización, sigue el patrón de su dropdown en vez
   de inventar uno nuevo).
3. Si quieres que tu etapa también aparezca en `getEtapasDeProyecto` con sus registros
   listados en el árbol (como hace `cotizacion` con sus versiones), agrega la rama
   correspondiente dentro de esa función en `store.js`.
4. No modifiques la geometría del menú radial, el árbol, ni el comportamiento de las
   etapas existentes.

## i18n

- Todo texto visible lleva `data-i18n="clave"` y su entrada en **`i18n/es.json` y `i18n/en.json`**.
- Prefijo de claves por etapa: `levantamiento.*`, `diseno.*`, `procura.*`,
  `programacion.*`, `comisionamiento.*`. Estados: `<etapa>.estado.<valor>`.
- Las etiquetas de las 7 etapas ya están resueltas (`stage.<id>`, agregadas en el
  refactor a Proyecto) — reutilízalas con `OC_I18N.t('stage.' + stageId)`, no declares
  tu propia traducción del nombre de la etapa.
- Texto generado por JS: `OC_I18N.t('clave')` y re-render en el evento `oc:langchange`.

## Criterios de aceptación (verifica antes de terminar)

1. Desde el árbol (etapa habilitada) o desde el fan → se crea/abre el registro ligado al
   proyecto correcto; sobrevive a recargar.
2. Volver a entrar (mismo proyecto) abre el registro existente en vez de crear otro.
3. La página abierta sola, sin parámetros, funciona en modo creación.
4. ES/EN cambia todos los textos, incluidos los generados por JS.
5. Cero errores en consola en OC_MAIN y en la pantalla nueva.

## Al terminar, reporta

Archivos tocados, funciones nuevas de `OCStore`, claves i18n agregadas, supuestos hechos
y lo que quedó pendiente.
