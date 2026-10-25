---
name: obracore-form-templates
description: Motor de formularios declarativos de ObraCore (forms.js + plantillas.js) usado por Levantamiento técnico y pensado para que Diseño/Procura/Programación/Comisionamiento lo reutilicen. Explica cómo escribir una plantilla nueva, los tipos de campo disponibles, visibleSi, versionado/snapshot, y el bloque de CSS que cada pantalla de etapa debe copiar. Úsala siempre que una etapa necesite un formulario (no solo 3-4 campos sueltos).
---

# ObraCore — motor de plantillas de formulario (`OCForms` + `OCPlantillas`)

ObraCore vende a distintos giros (fotovoltaico, eléctrico, obra civil, mantenimiento,
genérico). Ninguna pantalla de etapa que recolecte datos técnicos debe escribirse a mano
para un solo giro — se construye a partir de una **plantilla declarativa** (`plantillas.js`)
que un **motor genérico** (`forms.js`) convierte en formulario real. `OC_LEVANTAMIENTO.html`
es la referencia completa de cómo se usa; léela junto con `forms.js` y `plantillas.js`
antes de tocar cualquiera de los tres.

## Los dos archivos

- **`plantillas.js`** (`global.OCPlantillas`) — el catálogo. Cada plantilla es datos puros,
  sin lógica: `{ id, version, nombre: {es, en}, secciones: [{ id, titulo: {es, en}, campos: [...] }] }`.
  Solo declara **sus secciones propias** — nunca declares Visita/Sitio/Evidencia/Conclusión
  ahí, esas las agrega el motor (ver "Secciones base" abajo).
  - `OCPlantillas.get(plantillaId)` → la plantilla, o `generico` si el id no existe.
  - `OCPlantillas.resolverId(tipoProyecto)` → busca `tipoProyecto` en `OCStore.TIPOS_PROYECTO`
    y devuelve su `plantillaLevantamiento`, o `'generico'` si el tipo no está en el catálogo.
- **`forms.js`** (`global.OCForms`) — el motor, agnóstico de cualquier giro o etapa.
  - `OCForms.conSeccionesBase(plantillaEspecifica)` → plantilla completa (antepone Visita/
    Sitio, agrega Evidencia/Conclusión al final). Llámala **una sola vez**, al crear un
    registro nuevo, y congela el resultado como `plantillaSnapshot` en la entidad (ver
    "Versionado y snapshot" abajo) — nunca la vuelvas a llamar para re-pintar un registro
    ya existente.
  - `OCForms.render(contenedor, plantillaCompleta, datos, { lang, onChange, fotoKeyPrefix })`
    — dibuja el formulario. `datos` tiene la forma `{ seccionId: { campoId: valor } }`;
    campos ausentes se llenan con su default por tipo. `onChange` se dispara en cada
    edición (úsalo para un indicador de "cambios sin guardar", nunca para autoguardar).
  - `OCForms.collect(contenedor)` → el mismo objeto `datos`, ya actualizado. El motor
    mantiene un estado vivo en `contenedor._ocFormState`; `collect()` nunca lee el DOM.
  - `OCForms.validate(contenedor)` → `[{ seccionId, campoId, mensaje }]`, y marca
    `.oc-input-error` en vivo sobre los campos inválidos. Úsalo antes de cerrar/terminar un
    registro; un simple "Guardar" de borrador no necesita llamarlo.

## Secciones base (las agrega el motor, no tu plantilla)

- Inicio — **Visita**: fecha (requerida), hora inicio/fin, personal, duración, condiciones
  del sitio. La pantalla de etapa es responsable de convertir `datos.visita.fecha` en un
  `Evento` real (`OCStore.crearEvento`/`actualizarEvento`, tipo operativo que corresponda) —
  el motor no sabe nada de eventos ni de calendario, eso es lógica de la pantalla.
- Inicio — **Sitio**: dirección, coordenadas, accesos, restricciones, riesgos de seguridad.
- Final — **Evidencia**: un campo `fotos`.
- Final — **Conclusión**: viabilidad (requerida), hallazgos, recomendaciones.

Si una etapa futura necesita secciones base distintas (por ejemplo, Diseño quizás no
necesita "Visita"), no las fuerces — agrega una variante explícita en `forms.js`
(`conSeccionesBaseDiseno()` o similar) en vez de sobrecargar `conSeccionesBase` con
condicionales ocultos.

## Tipos de campo

| Tipo | Para qué | Valor en `collect()` |
|---|---|---|
| `texto` / `textoLargo` | Texto corto / párrafo | string |
| `numero` | Medición con `unidad`, `min`, `max`, `decimales` (se muestra en mono) | number \| null |
| `opcion` | Selector único, `opciones: [{id, etiqueta:{es,en}}]` | string |
| `opcionMultiple` | Checkboxes, mismo formato de `opciones` | string[] |
| `siNo` | Pregunta booleana (reusa `.oc-toggle`) | boolean |
| `fecha` / `hora` | `input[type=date]` / `[type=time]` | `'YYYY-MM-DD'` / `'HH:MM'` |
| `coordenadas` | Lat/long + botón "Usar mi ubicación" (`navigator.geolocation`) | `{lat, lng}` |
| `tabla` | Filas repetibles; cada `columna` declara su propio `tipo` (`texto`\|`numero`\|`opcion`); una columna con `total: 'suma'\|'promedio'` recalcula en cada edición | `[{columnaId: valor}]` |
| `checklist` | `items: [{id, etiqueta:{es,en}}]`, cada uno con estado `ok`\|`no-ok`\|`n-a` + nota | `[{itemId, estado, nota}]` |
| `fotos` | Comprime en el navegador (canvas, máx. 1600px, JPEG ~0.8), guarda el Blob en `OCPdfStore.guardarPdf(key, blob)` (mismo almacén que los PDFs, otra clave) y solo guarda `{key, categoria, nota}` en los datos; la miniatura se trae con `getPdf(key)`. Clic en la miniatura abre el Blob en pestaña nueva. | `[{key, categoria, nota}]` |

Propiedades comunes a cualquier campo: `id`, `etiqueta: {es, en}`, `ayuda: {es, en}`
(opcional), `requerido`, `visibleSi: {campo, igualA}` — compara contra **otro campo de la
misma sección**; el motor re-evalúa visibilidad en cada cambio y un campo oculto nunca
cuenta como requerido en `validate()`.

**Sin `eval` ni fórmulas libres.** El único cálculo automático son los totales de columna
de tabla (`suma`/`promedio`), declarados, no escritos como expresión.

## Versionado y snapshot

Cada entidad que use una plantilla (ej. `Levantamiento`) guarda `plantillaId`,
`plantillaVersion` y **`plantillaSnapshot`** — una copia completa de
`OCForms.conSeccionesBase(OCPlantillas.get(plantillaId))` tomada **en el momento de crear el
registro**. A partir de ahí:

- `render`/`collect`/`validate` siempre usan `plantillaSnapshot`, **nunca** vuelven a pedir
  la plantilla "viva" a `OCPlantillas.get(...)`. Un registro viejo se sigue viendo y
  comportando exactamente igual aunque la plantilla cambie después.
- Si quieres avisar que hay una versión más nueva: compara
  `OCPlantillas.get(plantillaId).version` contra `plantillaSnapshot.version` (o
  `plantillaVersion`) y muestra un aviso discreto — nunca reemplaces el snapshot
  automáticamente. `OC_LEVANTAMIENTO.html` (`comprobarPlantillaDesactualizada`) es el
  ejemplo.
- Al subir la `version` de una plantilla existente en `plantillas.js`, no toques los
  registros ya creados — el snapshot es precisamente lo que los protege.

## Trampa de CSS a no repetir: `.oc-field[hidden]`

`aplicarVisibilidad()` en `forms.js` oculta un campo con `visibleSi` poniendo la propiedad
nativa `.hidden = true` en su `<div class="oc-field">`. Como `.oc-field` ya define
`display: flex` con la misma especificidad que `[hidden]`, el CSS del autor gana y el campo
se queda visible igual — **toda pantalla que use `OCForms` necesita su propia regla
`.oc-field[hidden] { display: none; }`** (ya está en `OC_LEVANTAMIENTO.html`, cópiala junto
con el resto del bloque de abajo). Mismo bug que puede aparecer con cualquier otro elemento
`hidden` que también tenga un `display` propio — revisa esto antes de dar por buena una
condición de visibilidad que "no se ve cambiar".

## Bloque de CSS a copiar

`forms.js` no trae su propio CSS (es una librería compartida, no una pantalla
autocontenida). Los componentes nuevos que dibuja — tabla editable, checklist, galería de
fotos, número con unidad, fila de coordenadas, checkboxes de opción múltiple — se definen
en el `<style>` de `OC_LEVANTAMIENTO.html`, bajo el comentario
`COMPONENTES NUEVOS DE OCForms`. Cualquier pantalla de etapa nueva que use `OCForms` debe
copiar ese bloque completo a su propio `<style>` (mismo criterio que ya aplica a
`.oc-card`/`.oc-field`/`.oc-input`: cada pantalla autocontenida lleva su copia, no se
comparte vía `styles.css`). Sigue las reglas de `obracore-design-tokens`/`obracore-motion`
para cualquier color o transición nueva que agregues ahí.

## Cómo agregar una plantilla nueva

1. En `store.js`, agrega el tipo de proyecto a `TIPOS_PROYECTO` (si es un giro nuevo) con
   su `plantillaLevantamiento`.
2. En `plantillas.js`, agrega la entrada al objeto `PLANTILLAS` con tus secciones propias
   (nunca las base). Usa ids de campo estables y en minúsculas/camelCase — se vuelven la
   llave de `datos` para siempre, incluidos los registros ya guardados.
3. Si el tipo de proyecto no debe tener plantilla propia, no hagas nada más:
   `resolverId` cae a `'generico'` automáticamente.
4. Agrega 1 registro de ejemplo a `seedData()` (`store.js`) si quieres que se vea con datos
   desde el primer render — el snapshot de la semilla se escribe a mano ahí mismo (store.js
   no depende de `plantillas.js`/`forms.js`, así que la semilla no llama a
   `OCPlantillas.get`, solo imita la forma que produciría).

## Al terminar (si agregas o cambias algo del motor)

Reporta: qué campos/tipos agregaste o cambiaste, si cambiaste la forma de `datos` de algún
tipo existente (eso rompe registros ya guardados — evalúalo con cuidado), y qué pantallas
de etapa quedan pendientes de migrar a este motor.
