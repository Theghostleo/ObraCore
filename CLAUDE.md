# ObraCore — instrucciones para Claude Code

## Protocolo de colaboración Claude + Codex

Claude es el desarrollador principal. OpenAI Codex es el revisor independiente.

### Cuándo aplica
Al terminar cualquier tarea que modifique código (JS, HTML, CSS). No aplica a respuestas, consultas ni cambios solo de documentación.

**Se omite la revisión de Codex** cuando los cambios son exclusivamente de formato (espacios, sangrías, orden), comentarios o textos que no afectan la lógica (p. ej. una traducción en `i18n/*.js` o texto del README). Renombrar o quitar una clave i18n, o cambiar cualquier cosa que el código lea, **sí** cuenta como lógica. En duda, revisa. Aunque se omita la revisión, ejecuta las pruebas y dilo en el resumen final ("revisión de Codex omitida: solo formato/comentarios/textos").

### Alcance: solo los cambios de la tarea actual
El repositorio puede tener cambios previos sin commit. Antes de empezar cada tarea:
1. Registra el estado inicial: `git status --short` y, para cada archivo ya modificado o sin seguimiento, una copia de su contenido en el scratchpad de la sesión (nunca dentro del proyecto).
2. Al terminar, envía a Codex **solo lo que cambió durante la tarea**: para archivos que estaban limpios, `git diff -- <archivo>`; para archivos que ya estaban modificados, compara contra la copia inicial (`git diff --no-index <copia> <archivo>`); para archivos nuevos creados en la tarea, su contenido completo.
3. No mezcles modificaciones anteriores en el payload. Si no puedes separarlas con fiabilidad, díselo al usuario en vez de enviar todo, y explica qué se mezcló.

### Flujo
1. **Pruebas primero.** Ejecuta las pruebas disponibles. El repo no tiene suite propia: la verificación se hace con la skill `webapp-testing` (Playwright) abriendo las pantallas con `file://`. Revisa que la consola quede limpia y que no haya claves i18n sin traducir.
2. **Revisión de Codex** antes de dar la tarea por terminada, con el método de abajo.
3. **Si Codex reporta errores:** compruébalos tú (léelos contra el código real; no asumas que son ciertos), corrige solo los confirmados y pide una **segunda revisión**.
4. **Máximo dos rondas de revisión por tarea.** Si después de la segunda persisten problemas, detente e informa al usuario con lo que quedó abierto.

### Cómo invocar a Codex
Usa siempre `codex exec -s read-only --ephemeral --color never -C . -` y envía el material por **stdin**:

- Construye el payload en el directorio scratchpad de la sesión (nunca dentro del proyecto).
- Contenido: un prompt de rol con contexto (qué hace la app, qué cambió y por qué, qué buscar) + el diff de la tarea (ver "Alcance") + el contenido completo de los **archivos nuevos relevantes**.
- Incluye contexto suficiente para que Codex evalúe bien: la intención del cambio, los invariantes que deben cumplirse y, si el diff toca código que depende de otro archivo, las partes relevantes de ese archivo.
- Pídele: errores funcionales, problemas de integración, vulnerabilidades y regresiones, con archivo, línea y gravedad (Crítico/Alto/Medio/Bajo). Dile que opere en solo lectura, que no ejecute comandos y que no invente hallazgos.
- En Bash usa redirección (`codex exec ... - < payload.txt`); no uses el pipe de PowerShell 5.1, que corrompe los acentos.
- **No uses `codex review --uncommitted`**: el sandbox actual de Codex en Windows bloquea sus comandos de lectura (`CreateProcess ... blocked by policy`).
- Si `node`, `git` o `codex` no se reconocen, añade al PATH del proceso `C:\Program Files\nodejs`, `C:\Program Files\Git\cmd` y `C:\Users\josel\AppData\Roaming\npm` (solo la sesión, nada permanente).

### Qué no enviar nunca
Secretos y archivos sensibles: `.env*`, `auth.json`, claves/tokens/contraseñas, `*.pem`, `*.key`, credenciales. Antes de enviar, busca patrones de secretos en el payload (api key, secret, password, bearer, `sk-`, `AKIA`, `BEGIN ... PRIVATE KEY`) y descarta falsos positivos a mano (p. ej. la palabra "tokens" de los tokens de diseño). Si hay un secreto real, no envíes y avisa.

### Cuándo no declarar éxito
- No digas que la revisión fue exitosa si Codex no pudo ejecutarse, devolvió error, intentó usar herramientas y fueron bloqueadas, o no recibió el código necesario. Informa el error exacto.
- Si Codex no reporta hallazgos, dilo tal cual y aclara sus limitaciones (p. ej. que solo vio el diff y no pudo verificar código que no se le envió).
- Presenta solo hallazgos que Codex realmente produjo. No los sustituyas por una revisión propia sin decirlo.

### Restricciones
- Sin commits, eliminación de archivos ni cambios destructivos sin autorización explícita del usuario.
- Codex nunca modifica archivos ni ejecuta comandos sobre el proyecto: sandbox `read-only`, sin `danger-full-access` ni `--dangerously-bypass-approvals-and-sandbox`.

### Resumen final de cada tarea
Presenta: (1) cambios realizados, (2) pruebas ejecutadas y resultado, (3) hallazgos de Codex (por gravedad, o "ninguno" con sus limitaciones; o "revisión omitida" con el motivo), (4) correcciones aplicadas, y cuántas rondas de revisión se usaron.
