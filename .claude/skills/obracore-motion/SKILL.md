---
name: obracore-motion
description: Sistema de animación y microinteracciones de ObraCore (duraciones, curvas, efectos HUD permitidos, reduced-motion). Úsala siempre que se agregue o modifique una animación, transición, hover, apertura de menú/modal o efecto visual en ObraCore.
---

# ObraCore — animación y movimiento

La estética es "HUD de ingeniería": el movimiento debe sentirse **preciso, rápido y
mecánico**, no juguetón. Nada rebota, nada gira por decoración. Cada animación comunica
algo: aparición, foco, cambio de estado o progreso.

## Duraciones (las que ya usa el código)

| Nombre | Valor | Uso |
|---|---|---|
| rápida | `0.15s ease` | Hover/foco: color, fondo, borde, glow. **Default para cualquier hover.** |
| media | `0.2s–0.25s` | Celdas del calendario, aparición de líneas/pastillas del menú radial, desplegables |
| lenta | `0.3s ease` | Fades de feedback (ej. "Guardado") |

Curva "despliegue": `cubic-bezier(0.2, 0.8, 0.2, 1)` — entrada rápida que frena suave.
Úsala para todo lo que **aparece desde un origen** (pastillas del abanico, menús, modales).

Límite: ninguna transición de interfaz supera **400 ms**. Animaciones en bucle están
permitidas solo como indicador de "esto sigue en curso ahora mismo" (nunca decorativas, nunca
para loading/spinners genéricos) y deben poder detenerse. Hoy hay exactamente **dos** en todo
el sistema — ver "Loops permitidos" más abajo.

Tokens de movimiento (ya en `:root` de `styles.css` y en las copias de las pantallas).
Úsalos en las reglas nuevas; los literales antiguos (`0.15s`, `0.3s`) se reemplazan poco a poco:

```css
--oc-dur-fast: 150ms;
--oc-dur-med: 240ms;
--oc-dur-slow: 300ms;
--oc-ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
```

Keyframes existentes (definidos al final de cada CSS):
- `oc-cell-in`: celdas del calendario al renderizar (cambio de mes). Solo `opacity` + `translateY(3px)`.
- `oc-pop-in`: desplegables, picker y modal (`scale(.97)` + `translateY(4px)`).
- `oc-fade-in`: overlay del modal y tarjetas de las pantallas de formulario.

Como cada render recrea los nodos, estas animaciones corren solas al crearse; no requieren JS.

## Patrones permitidos

1. **Despliegue radial** (referencia: `.oc-fan-pill` en `styles.css`): el elemento parte de
   su origen con `translate(var(--fan-dx), var(--fan-dy)) scale(0.75)` y `opacity: 0`, y
   llega a `translate(0,0) scale(1)`. Para varios elementos, escalona 20–30 ms entre cada uno.
2. **Glow de foco**: aparece un `box-shadow` con `--oc-accent-*-glow` en 0.15s.
   No pulses el glow en bucle.
3. **Aparición de flotantes** (desplegables, picker, modales): `opacity 0→1` +
   `translateY(4px)→0` (o `scale(.97)→1`) en 0.2s con la curva de despliegue.
   El overlay del modal solo hace fade.
4. **Línea / escaneo**: líneas que se dibujan (`opacity` o `scaleX` desde `transform-origin: left`),
   como las `.oc-fan-line`. Un barrido de escaneo sutil es válido para estados de carga.
5. **Cambio de estado de datos** (ej. un día pasa de Libre a En proceso): transición de
   color/fondo/borde en 0.25s; opcionalmente un único destello de glow. Nunca shake.

## Loops permitidos (excepción explícita — son solo estos dos)

1. **`oc-pulse`** (`styles.css`): el punto "en vivo" de una actividad `en_ejecucion`
   (`.oc-evt-chip--en_ejecucion::before`). `1.6s ease-in-out infinite`, solo `opacity`.
2. **Cable activo del Flujo de trabajo** (`flujo.js`/`styles.css`, `.oc-flujo-cable--activo`,
   `@keyframes oc-flujo-avance`): el cable que entra a la etapa `en_curso` de un proyecto
   anima `stroke-dashoffset` (`1.1s linear infinite`) para dar sensación de avance continuo
   hacia la derecha — señala "el trabajo está aquí ahora", igual criterio que `oc-pulse`.
   Se pausa con `document.visibilityState !== 'visible'` (clase
   `html.oc-flujo-pausado`) y queda cubierto por `prefers-reduced-motion` como todo lo demás.

Cualquier loop nuevo necesita la misma justificación ("algo sigue en curso ahora mismo", no
decorativo) y debe agregarse a esta lista — si no calza en ese criterio, no es un loop: es un
one-shot con el patrón 3 o 5 de arriba.

## Reglas técnicas

- Anima solo `opacity`, `transform`, `color`, `background-color`, `border-color`, `box-shadow`.
  **Nunca** `width`, `height`, `top`, `left` ni `margin` (provocan reflow).
- Escribe las transiciones listando propiedades, igual que el código existente:
  `transition: color 0.15s ease, border-color 0.15s ease;` — no `transition: all`.
- Animaciones de entrada controladas con una clase de estado (`.oc-fan-in`, `.oc-visible`)
  que se agrega en el siguiente frame (`requestAnimationFrame`), no con `setTimeout(…, 0)`.
- Elementos que salen: quita la clase, espera `transitionend` (con un timeout de respaldo)
  y luego elimina el nodo.
- Sin librerías de animación. CSS primero; JS solo para coordinar clases y escalonados.

## Accesibilidad (obligatorio)

Los archivos con CSS (`styles.css`, `OC_SOLICITUD.html`, `OC_COTIZACION.html`,
`OC_LEVANTAMIENTO.html`) ya incluyen este bloque al final. Toda animación nueva debe quedar
cubierta por él; si creas un archivo nuevo con CSS, agrégalo también:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Con reduced-motion los elementos aparecen en su estado final; la información nunca
debe depender de ver la animación.

## Verificación

Después de cambiar animaciones, revisa en el navegador (o con la skill `webapp-testing`):
abrir/cerrar el menú radial varias veces seguidas, cambiar de mes, abrir desplegables y
modales, y confirmar que no quedan nodos huérfanos ni errores en consola.
