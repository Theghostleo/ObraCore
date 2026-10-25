# ObraCore

Aplicación interna para gestionar proyectos de **instalación fotovoltaica y eléctrica** de
principio a fin: desde que llega la solicitud del cliente hasta el comisionamiento de la obra.

> **Estado:** prototipo front-end. Todavía no hay backend: los datos viven en el navegador
> (`localStorage` + IndexedDB) y se pierden si se borra la caché. No usar con datos reales de
> clientes hasta que exista la base de datos (ver [Hoja de ruta](#hoja-de-ruta)).

## Qué hace hoy

- **Calendario** de actividades: distingue actividades operativas (instalación, fabricación,
  mantenimiento…) de hitos (seguimientos, llamadas). Un día se marca *Reservado* con
  actividades tentativas y *Ocupado* con actividades confirmadas.
- **Explorador** de proyectos agrupado por mes de alta.
- **Flujo de trabajo**: vista de las 7 etapas de cada proyecto como nodos conectados.
- **Etapas del proyecto:**

| # | Etapa | Pantalla | Estado |
|---|---|---|---|
| 1 | Solicitud de cotización | `OC_SOLICITUD.html` | ✅ |
| 2 | Cotización (con versiones y PDF) | `OC_COTIZACION.html` | ✅ |
| 3 | Levantamiento técnico (por plantillas) | `OC_LEVANTAMIENTO.html` | ✅ |
| 4 | Diseño del sistema | — | Pendiente |
| 5 | Procura de equipos | — | Pendiente |
| 6 | Programación de instalación | — | Pendiente |
| 7 | Comisionamiento y calidad | — | Pendiente |

- Interfaz en **español e inglés**.

## Cómo ejecutarlo

Requiere un servidor local (abrir los HTML con doble clic bloquea la carga de los
diccionarios de idioma). Con Python instalado, desde la carpeta del proyecto:

```bash
python -m http.server 8080
```

y abrir <http://localhost:8080/OC_MAIN.html>.

## Estructura

| Archivo | Para qué |
|---|---|
| `OC_MAIN.html` | Pantalla principal: navbar, explorador, calendario y flujo |
| `OC_*.html` | Una pantalla por etapa (autocontenidas) |
| `store.js` | Única capa de datos (`window.OCStore`). Ninguna pantalla toca el almacenamiento directo |
| `pdfStore.js` / `pdf.js` | Guardado y generación de PDFs (jsPDF) |
| `forms.js` / `plantillas.js` | Motor de formularios por plantillas (levantamiento y futuras etapas) |
| `flujo.js` | Vista de flujo de trabajo |
| `i18n.js` + `i18n/` | Idiomas ES/EN |
| `styles.css` | Estilos y tokens de diseño |
| `lib/` | Librerías locales (jsPDF), sin CDN para funcionar sin internet |
| `.claude/skills/` | Convenciones del proyecto para Claude Code (diseño, animación, pantallas de etapa, plantillas) |

Tecnología: HTML + CSS + JavaScript plano, sin frameworks ni proceso de build.

## Hoja de ruta

1. **Higiene del código:** idiomas sin servidor, base CSS/JS compartida entre pantallas.
2. **Backend con PostgreSQL** (usuarios, roles y almacenamiento de archivos) y **aviso de
   privacidad** conforme a la LFPDPPP para los datos personales de clientes.
3. Piloto con obras reales.
4. Clientes como entidad (CRM), recordatorios y tablero de reportes.
5. Etapas 4–7, levantamiento en campo sin conexión, cobranza.

Enfoque inicial: sector **fotovoltaico y eléctrico** en México. La arquitectura de
plantillas permite extenderlo después a otros giros (obra civil, mantenimiento).

---

Proyecto privado. Todos los derechos reservados.
