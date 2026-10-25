---
name: obracore-design-tokens
description: Paleta, tipografía, espaciados y significado de colores de ObraCore (dirección "Plano de ingeniería": oscuro high-tech, cian + ámbar + verde de éxito, Space Grotesk + IBM Plex Mono). Úsala SIEMPRE que se cree o modifique CSS, una pantalla, un componente, un PDF o cualquier elemento visual de ObraCore, y antes de aplicar un tema de theme-factory u otra skill de diseño a este proyecto.
---

# ObraCore — tokens de diseño

La fuente de verdad es el bloque `:root` de `styles.css`. Las pantallas autocontenidas
(`OC_SOLICITUD.html`, `OC_COTIZACION.html`) llevan una **copia exacta** de esos tokens
en su propio `<style>`; si cambias un token, cámbialo en todas las copias.

Dirección vigente: **Plano de ingeniería** (aprobada por el usuario). Si otra skill o
una propuesta futura cambia la dirección, actualiza esta skill en el mismo cambio.

## Reglas

1. **Nunca escribas un color en duro** en reglas de componentes. Usa `var(--oc-*)`.
   Si necesitas un tono nuevo, créalo como token en `:root` (en `styles.css` y en las copias)
   con un comentario que explique para qué existe.
2. Las transparencias de un acento van como token derivado (`--oc-accent-*-glow`, `-border`),
   no como `rgba()` suelto. Excepciones establecidas: blancos muy tenues para hover/fondos
   neutros (`rgba(255,255,255,0.03)` / `0.05`), sombras negras y la rejilla de fondo
   (`--oc-grid-line`).
3. Si otra skill (theme-factory, frontend-design, canvas-design) propone otra paleta o
   tipografía, **no la apliques sobre la app** salvo que el usuario lo pida explícitamente;
   úsala como propuesta y tradúcela a estos tokens.
4. **Un solo nombre para la alerta**: `--oc-alert*`. El antiguo `--oc-error*` ya no existe.
5. **El rojo (`--oc-alert`) se reserva para problemas reales** — una actividad confirmada
   con fecha vencida (`OCStore.eventoVencido()`), una etapa bloqueada — nunca para "ocupado"
   ni para cualquier estado normal de alta actividad. Si estás por pintar algo de rojo y no
   es un problema que alguien deba resolver, no es rojo: es ámbar o verde.

## Paleta base

| Token | Valor | Uso |
|---|---|---|
| `--oc-bg` | `#0c1016` | Fondo de página (con rejilla de plano) |
| `--oc-surface` | `#141b24` | Paneles, navbar, sidebar, tarjetas, pastillas, modales |
| `--oc-border` | `#24313f` | Bordes, separadores, scrollbar |
| `--oc-text` | `#e8edf3` | Texto principal |
| `--oc-text-muted` | `#7d8a99` | Texto secundario, labels, iconos en reposo |
| `--oc-accent-cyan` | `#4dd8ff` | **Interacción**: hover, foco, activo, enlaces, líneas del menú radial |
| `--oc-accent-gold` | `#f2b84b` | **Hoy / en curso / selección / alta actividad**: día actual, logo, ítem seleccionado del árbol, día reservado/ocupado, actividad confirmada o en ejecución, proyecto ganado/en ejecución |
| `--oc-alert` | `#ff6b5b` | **Problema real, nunca "ocupado"**: actividad confirmada con fecha vencida, etapa bloqueada, error de validación |
| `--oc-ok` | `#3ddc84` | **Completado / resultado positivo**: proyecto terminado, actividad terminada |

Derivados: `--oc-accent-cyan-glow` (0.16), `--oc-accent-cyan-glow-strong` (0.32),
`--oc-accent-cyan-border` (0.32), `--oc-accent-gold-glow` (0.22), `--oc-accent-gold-border` (0.45),
`--oc-alert-glow` (0.16), `--oc-alert-border` (0.42), `--oc-ok-glow` (0.18), `--oc-ok-border` (0.42).

Rejilla de fondo: `--oc-grid-line` (rgba cian 0.035), aplicada como `background-image`
de 32px en `#oc-main` (styles.css) y en `html, body` de las pantallas autocontenidas.

### Semántica de color (no la mezcles)

- **Cian = "puedes interactuar con esto"**. Nunca para estados de datos (ver regla 5 más abajo).
- **Dorado = "esto está pasando / es lo actual / alta actividad"**. En curso, hoy, selección,
  reservado/ocupado, ganado/en ejecución.
- **Verde `--oc-ok` = "esto ya terminó bien"**. Proyecto terminado, actividad terminada.
- **Rojo alerta = "alguien tiene que resolver esto"**. Nunca "ocupado" ni actividad normal —
  solo una confirmada vencida o una etapa bloqueada.
- **Neutro (muted + border)** = libre, prospecto/cotizado, inactivo, deshabilitado. Variantes:
  borde punteado = pausado/tentativo; atenuado + tachado = perdido/cancelado.
- **El tipo nunca define el color** (de una actividad, de un chip) — solo su *estado* o
  *clase* (operativa/hito) lo hace; el tipo se distingue por texto o ícono.

| Elemento | Estilo |
|---|---|
| Proyecto `prospecto`, `cotizado` | Neutro (muted + borde) |
| Proyecto `ganado`, `en_ejecucion` | Ámbar |
| Proyecto `terminado` | Verde `--oc-ok` |
| Proyecto `pausado` | Neutro con borde punteado |
| Proyecto `perdido`, `cancelado` | Neutro atenuado (`opacity: .6`) con texto tachado |
| Día `reservado` | Ámbar con borde punteado |
| Día `ocupado` | Ámbar sólido |
| Día `libre` | Sin pastilla (un día vacío ya significa libre) |
| Actividad `tentativa` | Borde punteado neutro |
| Actividad `confirmada` | Ámbar sólido |
| Actividad `en_ejecucion` | Ámbar sólido + punto indicador pulsante (único loop de animación del sistema) |
| Actividad `terminada` | Verde `--oc-ok`, atenuado |
| Hito (cualquier tipo) | Texto muted, sin fondo, ícono pequeño |
| Chip/etapa con `eventoVencido()`/`bloqueada` | Rojo `--oc-alert` |

## Tipografía

| Token | Fuente | Para qué |
|---|---|---|
| `--oc-font-ui` | Space Grotesk | Todo texto de interfaz, botones, formularios |
| `--oc-font-mono` | IBM Plex Mono | Números, fechas, folios, IDs, importes, logo, títulos de panel, encabezados en mayúsculas, pastillas de estado |

Se cargan solo de Google Fonts (Space Grotesk 400/500/600/700, IBM Plex Mono 400/500/600).
No agregues otras familias.

Escala en uso (px): 10 (pastillas de estado) · 11 (encabezados mono en mayúsculas,
`letter-spacing: 1px`) · 12–13 (cuerpo denso, árbol, menús) · 14 (botones) · 15 (navbar) ·
16 (títulos de panel/modal, mono) · 19 (logo, mono).
Pesos: 500 normal de UI, 600 énfasis/títulos, 700 solo para el número del día actual.

## Forma y espaciado

- `--oc-radius: 3px` para botones, inputs y filas; `--oc-radius-panel: 4px` para paneles,
  tarjetas, menús flotantes y modales; `999px` pastillas.
- Layout raíz: `--oc-navbar-h: 61px`, `--oc-sidebar-w: 280px`. **Sin scroll de `body`**;
  solo scrollean los sub-paneles.
- Sombras de elementos flotantes: `0 4px 12px rgba(0,0,0,.35)` (pastillas),
  `0 8px 28px rgba(0,0,0,.45)` (menús), `0 20px 60px rgba(0,0,0,.5)` (modales).
- Glow de hover: `box-shadow: 0 0 8px var(--oc-accent-cyan-glow)` (o 10–14px en elementos grandes).
- z-index: menú radial 500–501 · desplegables 600 · modales 700.
- Foco visible por teclado: `:focus-visible { outline: 2px solid var(--oc-accent-cyan); outline-offset: 2px; }`.
  Los inputs no usan outline: su foco es borde cian + glow (`.oc-input:focus`).

## Movimiento

Duraciones y curvas en `:root` (`--oc-dur-fast`, `--oc-dur-med`, `--oc-dur-slow`,
`--oc-ease-out`). Ver la skill `obracore-motion`.

## PDFs (cotizaciones y reportes)

Los PDFs **no** usan el tema oscuro: fondo blanco, texto casi negro, y cian/dorado solo
como acentos (línea de encabezado, folio). Deben imprimirse bien en blanco y negro.
Los acentos de los PDFs deben seguir la paleta nueva (cian `#4dd8ff`, ámbar `#f2b84b`),
pero el fondo sigue siendo blanco.

## Componentes existentes que debes reutilizar

`.oc-btn` + `.oc-btn-primary` / `.oc-btn-secondary`, `.oc-icon-btn`, `.oc-nav-btn`,
`.oc-card` / `.oc-card-title`, `.oc-field` / `.oc-input`, `.oc-day-status--*`,
`.oc-proyecto-estado--*`, `.oc-evt-chip--*` (color por estado/clase, nunca por tipo),
`.oc-tree-menu-btn` (botón "⋯" de menú contextual), `.oc-evt-accion-btn`,
`.oc-modal-overlay` / `.oc-modal`, `.oc-dropdown-*`. Antes de crear un componente nuevo,
busca uno parecido en `styles.css` o en la pantalla autocontenida más cercana.
