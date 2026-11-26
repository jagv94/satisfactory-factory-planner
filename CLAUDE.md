# CLAUDE.md: contexto de desarrollo del Planificador de fábricas para Satisfactory

Documento de continuidad para Claude Code. `README.md` es para quien **usa** la herramienta; este archivo es para quien la **desarrolla**. Léelo entero antes de tocar nada.

## Qué es

Planificador de fábricas para **Satisfactory 1.x**: dado un conjunto de piezas objetivo (por minuto), calcula recetas, máquinas, extractores, energía, subproductos y flujo de materiales. Funciona en modo manual (una receta por objeto) o con un optimizador lineal (mezcla recetas según un criterio).

- **Entregable:** `Planificador.html`. Un único archivo autocontenido (datos, CSS y JS dentro) que funciona abriéndolo con doble clic (`file://`), sin servidor ni conexión. Es lo que se reparte a otros jugadores.
- **Objetivo del repositorio:** herramienta comunitaria, de código abierto. Solo puede contener archivos que se puedan compartir (ver «Reglas»).
- **Nombre visible:** «Planificador de fábricas para Satisfactory» (en inglés, «Factory Planner for Satisfactory»). Sustituye a «Planificador FICSIT» para que no parezca oficial. La clave de `localStorage` sigue siendo `ficsit-planner-v2` a propósito (cambiarla borraría la configuración guardada).
- **Autoría:** Adrián Guerra (nombre del portfolio; es el que figura en `LICENSE` y en los créditos), alias creativo Shirosaki Ōkami. Créditos en el README: «Creado por Adrián Guerra (Shirosaki Ōkami)».
- **Idioma:** interfaz y documentación en español; nombres de objetos en español o inglés (selector). El usuario responde mejor a explicaciones directas, críticas y contrastadas, en tono informal.

## Estructura

```
Planificador.html          ← GENERADO por build.py (no editar a mano)
build.py                   ← une src/*.js + styles.css + template + data → Planificador.html
data/satisfactory_db.json  ← GENERADO por tools/docs_to_db.py desde los Docs del juego
src/
  engine.js                ← motor: procesos, solver manual, simplex, análisis (sin DOM; corre en Node)
  glyphs.js                ← glifos SVG propios por familia de objeto + color por materias primas
  sankey.js                ← diagrama de flujo sin dependencias
  app.js                   ← estado, render, eventos (depende de Engine, Glyphs, Sankey)
  styles.css, index.template.html
tools/
  docs_to_db.py            ← parser de CommunityResources/Docs/{en-US,es-ES}.json (UTF-16)
  copiar_iconos.ps1        ← copia iconos exportados con FModel a icons/<ClassName>.png
tests/
  test_engine.js           ← pruebas del motor (node tests/test_engine.js)
  excel_ref.json           ← resultados de referencia del Excel original (modo manual debe coincidir)
  export_lp_cases.js + compare_highs.py ← compara el simplex con HiGHS (scipy)
icons/                     ← opcional y NO versionado salvo LEEME.txt (iconos con copyright)
```

## Comandos

```bash
python tools/docs_to_db.py "C:/Program Files (x86)/Steam/steamapps/common/Satisfactory/CommunityResources/Docs" data/satisfactory_db.json
python build.py                      # regenerar Planificador.html tras cualquier cambio en src/ o data/
node tests/test_engine.js            # motor + HTML generado; debe terminar en «Todo correcto» (código de salida 1 si falla)
node tests/export_lp_cases.js && python tests/compare_highs.py   # 0 discrepancias esperadas (requiere numpy+scipy)
```

Flujo obligatorio tras cambiar código: `python build.py` → `node tests/test_engine.js` → abrir `Planificador.html` en el navegador y revisar la consola (0 errores) a ~1400 px, ~720 px y ~400 px de ancho, en claro y oscuro.

- **Comprobación del HTML generado** (sección 22 de `tests/test_engine.js`):
  - `Planificador.html` está al día: su JS coincide con `src/*.js` y sus datos con `data/satisfactory_db.json` (si falla, falta `python build.py`).
  - El JS embebido pasa `node --check`, que detecta errores de sintaxis como una variable declarada dos veces.
  - El script arranca en un DOM mínimo (`vm` + objetos comodín): define `Engine`, `Glyphs` y `Sankey`, rellena el subtítulo, las cifras y la tabla de producción. Así salen también los errores de ejecución al arrancar (p. ej. una función que no existe).
  - `PLANIFICADOR_HTML=<ruta>` prueba otro archivo; sirve para comprobar que la prueba detecta un HTML roto sin tocar el del repositorio.
- **Nota del navegador integrado:** abre `Planificador.html` como copia estática (`data:`); un error de sintaxis o de ejecución al cargar **no aparece en su consola**. Lo cubre la comprobación del HTML generado; en el navegador, mira además que el subtítulo con «N objetos, N recetas» está relleno. Para el tema oscuro, fuerza `data-theme="dark"` en `<html>` (la emulación de `prefers-color-scheme` no se aplica a estas copias).

## Datos (data/satisfactory_db.json)

- **Fuente única:** los Docs del juego. No se transcriben recetas a mano (la primera versión se transcribió desde la wiki y tenía errores).
- **IDs:** `ClassName` del juego (`Desc_IronPlate_C`, `Recipe_IronPlate_C`). Nombres en `en` / `es`.
- **Unidades:** todo por minuto a reloj 100 %; los fluidos se dividen entre 1000 (Docs usa litros) → m³/min.
- **Alternativa:** una receta es alternativa si la desbloquea un esquema `EST_Alternate`. Ojo: algunas clases se llaman `Recipe_Alternate_*` pero se desbloquean por MAM (p. ej. Compacted Coal) y no cuentan como alternativas.
- **Exclusiones:** recetas de edificios, equipo del taller y FICSMAS (filtro por `EV_Christmas` y por nombres Xmas/Gift/Snow/Candy/Firework).
- **Generadores:** cada generador con combustible (`FGBuildableGeneratorFuel` + `FGBuildableGeneratorNuclear`: Biomass Burner, carbón, combustible, nuclear) se añade como receta `Gen_<combustible>` por combustible: combustible (+ agua) → `Power_MW` (+ residuo). Combustible/min = MW · 60 / `mEnergyValue` (en fluidos, `mEnergyValue` va por litro: ×1000). Agua = MW · `mSupplementalToPowerRatio` · 60 / 1000. Incluye la barra de ficsonio (sin residuo). El edificio lleva `generator: true` y potencia negativa.
- **`Power_MW`:** objeto sintético (`form: "power"`, `synthetic: true`, «Energía», MW). No es materia prima ni se recolecta; se excluye del preset «Todas las piezas finales». Puede ser objetivo (planta de energía).
- **Pressurizer:** `extractors.well.pressurizer` (150 MW), `pressurizerExp` (exponente de reloj de los Docs) y `pressurizerName`.
- **Potencia variable** (Particle Accelerator, Converter, Quantum Encoder): `powerRange` por receta; se usa la media.
- **`world`:** máximo del mapa por recurso (Mk.3 al 250 % en todos los nodos, mapa por defecto). Viene de la wiki (Resource_Node, Nitrogen_Gas), no de los Docs. Sirve para ponderar la escasez y como límite opcional.
- **Colores:** los fluidos usan el color del juego; el resto, `RAWCOL` en el parser (paleta propia) y mezcla por composición en `glyphs.js`.

## Motor (src/engine.js)

- **Proceso** = una máquina con su configuración: `{kind: recipe|extract|manual|import, in, out, power, clock, sloops}`. Reloj por receta (`plan.rc[id].clock`, por defecto `cfg.clock`) y Somersloops (`plan.rc[id].sloops`, máx. `building.slots`).
  - Salida × reloj × (1 + sloops·boost); entrada × reloj; potencia = base · reloj^exp · boost^boostExp (boostExp = 2 → x4 con todos los slots).
  - Fragmentos de energía: `ceil((reloj−1)/0.5)`, máx. 3.
- **Manual (`solveManual`):** una receta por objeto. Sistema lineal cuadrado (Gauss con pivotaje parcial). Si un objeto sale negativo (lo cubre un subproducto), se apaga su receta y se repite. Matriz singular = ciclo sin salida → error `cycle`.
- **Optimizador (`solveOpt`):** simplex propio en dos fases.
  - Variables = todos los procesos alcanzables con recetas permitidas.
  - Restricción por objeto: neto ≥ demanda. Límites de extracción opcionales (`cfg.limits`).
  - Criterios: `weighted` (materias primas × 1e4/máximo del mapa), `power`, `machines`, con desempates pequeños.
  - `maximize`: variable de escala t con coste −1e6.
  - **Numérica (no tocar sin probar con HiGHS):** equilibrado de filas y columnas, test de razón de Harris en dos pasadas (umbral de pivote 1e-7), Bland tras 3000 iteraciones, limpieza de |x| < 1e-11, filas `>= 0` convertidas a `<=` para evitar artificiales. Sin esto fallaba en ~40 % de los casos.
  - Solo importa un objeto si el usuario eligió «Externo» explícitamente. Los recursos recolectados a mano solo entran con `plan.allowManual`. Si no, el optimizador los usaba gratis.
- **Receta por defecto:** estándar > alternativa; nunca Packager; penaliza desbloqueo `Custom` y nombre distinto del producto (Distilled Silica se elegía para Silica). Excepciones en `DEF` (biomasa con madera, proteína de cerdo, fragmento azul, ficsita con hierro).
- **`analyze`:** filas por proceso (máquinas exactas, a construir, reloj uniforme, potencia, fragmentos), balance por objeto, materias primas, puntuación de uso del mapa y `energy` (consumo real, generación, externa, balance, Pressurizers, pozos sin indicar).
- **Energía (`plan.energy`):** `"off"` (por defecto, «solo informar») o `"gen"` («generarla en la fábrica»).
  - Con `"gen"`, `proc()` añade `in.Power_MW = potencia` a toda máquina que consume; los generadores dan `out.Power_MW = MW × reloj`. Así los dos solvers tratan la energía como un objeto más y el caso circular (carbón → generadores que alimentan sus mineros) sale solo. Con `"off"` nada consume `Power_MW` y los resultados son los de siempre.
  - Un generador es receta principal (`PRIM`) de `Power_MW` y también de su residuo. Por defecto en manual: carbón (`DEF`). `PRIM[Power_MW]` se ordena de menor a mayor potencia.
  - Generadores: overclock lineal (potencia y combustible × reloj), fragmentos como cualquier máquina, sin Somersloops.
  - **Energía externa** (`plan.gridMW`): se resta del lado derecho de la fila `Power_MW` (`res.supply`); no escala con «maximizar».
  - **Criterio «Mínima potencia» con energía generada:** minimiza el consumo total de la fábrica (suma de la potencia positiva de todas las máquinas, incluidas las de las cadenas de combustible y los Pressurizers), sin contar la producción de los generadores.
  - **Residuos nucleares:** se permiten como excedente, con aviso (no se pueden destruir en el AWESOME Sink; para evitarlos, excluir las recetas nucleares).
  - **Consumo real vs. planificado:** el cálculo usa máquinas fraccionarias al reloj elegido; el análisis, máquinas enteras con reloj uniforme. Como el exponente de potencia es ≥ 1, el consumo real es igual o menor: puede quedar un pequeño excedente de generación (se explica en la pestaña Energía).
- **Pressurizers (`cfg.ext[fluido].wells`):** número de Resource Well usados por fluido (opcional, sin estimación). Vacío → no se suman, aviso y sin coste en el cálculo. Relleno → potencia = pozos · 150 MW · reloj^`pressurizerExp` (reloj del extractor de pozo), sumada al consumo en los dos modos de energía. En el cálculo, cada extractor de pozo carga con la parte proporcional (`pshare` = potencia de los Pressurizers / extractores de ese fluido). Como el número de extractores sale del propio cálculo, `withPress()` itera hasta el punto fijo, de modo que `pshare · x` = potencia de los Pressurizers. `solveManual`/`solveOpt` son ya las versiones envueltas.
  - **Criterio de parada:** el resultado es coherente cuando cada fluido o no usa extractores de pozo, o su reparto cubre exactamente sus Pressurizers. Un fluido que deja de usar pozos ya es coherente (no hay Pressurizers que pagar). El criterio anterior (comparar el reparto entre vueltas) oscilaba en ese caso y devolvía un resultado incoherente.
  - **Límite:** `PRESS_MAX` = 12 re-resoluciones (en las pruebas y los casos de HiGHS bastan 6 como mucho). Si no cuadra, devuelve el error `"press"` sin pasos: la interfaz lo muestra (`ERR.press`) y no enseña un resultado a medias. Cada resolución está acotada (simplex ≤ 60.000 iteraciones), así que nunca se cuelga. `plan._pressMax` cambia el límite, solo para pruebas: la interfaz descarta los campos de plan que empiezan por `_` al cargar o importar una configuración (`restore()` en `app.js`), así que no se puede fijar desde fuera.
  - `res.pressIter`: número de re-resoluciones que hicieron falta.
  - **Es una aproximación:** pagar los Pressurizers es en realidad una decisión binaria por fluido (usar sus pozos y pagar su potencia fija, o no usarlos y no pagar nada). El reparto proporcional la convierte en un coste lineal por extractor, que el simplex puede manejar. El punto fijo da un plan **coherente** (la energía cuadra con los Pressurizers que de verdad se usan), pero **no necesariamente el óptimo global**: según el reparto de partida, puede quedarse en «usar pozos» cuando «no usarlos» saldría mejor, o al revés. Un modelo exacto exigiría programación entera (una variable 0/1 por fluido con coste fijo), que el simplex propio no resuelve.

## Interfaz (src/app.js)

- **Estado `S`** (v2, `localStorage` clave `ficsit-planner-v2`):
  - `{lang, icons, group, tab, cur, preset, cfg: {clock, belt, pipe, ext, locked, limits}, plans: [{name, targets, sel, rc, mode, objective, maximize, allowManual, ban, energy, gridMW}]}`. `cfg.ext[item]` = `{tier, purity, clock, wells}`.
  - Campos nuevos con valor por defecto en el código (`energy` ausente = `"off"`): las configuraciones guardadas siguen valiendo sin migrar.
  - Los campos de plan que empiezan por `_` son internos (motor o pruebas) y `restore()` los descarta al cargar de `localStorage` o al importar.
  - `cfg` es global (mundo, desbloqueos); `plans` son las fábricas.
- **Cambios:** todo pasa por `set(mut)` (historial para deshacer, guardar, render diferido con `setTimeout(0)` para no perder el foco al tabular). El render restaura el foco por `data-fk`.
- **Seguridad:** todo texto que venga de datos se escapa con `esc()` antes de entrar en HTML.
- **Iconos:** si existe `icons/Desc_IronPlate_C.png`, se usan PNG del juego; cada `<img>` que falle se sustituye por su glifo (listener de `error` en captura). La comprobación solo se hace con `location.protocol === "file:"`: en la web no hay iconos (copyright) y daría un 404 en consola.
- **Tema:** sigue al sistema (`color-scheme: light dark` + `light-dark()`). `styles.css` ya tiene reglas `:root[data-theme=light|dark]`, pero nada las activa todavía (ver «Pendiente»).
- **Sankey:** niveles = `Engine.depths()` (camino más largo, seguro ante ciclos). Iterar sobre los enlaces disparaba el ancho a más de 11.000 px con bucles de reciclaje.
- **Energía en la interfaz:** bloque «Energía» en Cálculo (modo y energía externa); en manual, la fila «Energía» de Producción elige generador y combustible. Pestaña **Energía**: resumen, generadores (combustible, agua, residuos) y consumo por máquina con Pressurizers. `Power_MW` no se dibuja como flujo hacia cada máquina (Sankey y Árbol lo omiten, `depths()` lo ignora); en el Sankey, combustible y agua van a un nodo «Energía» rotulado con los MW. No sale en Excedentes.
- **Avisos de energía:** residuos nucleares sin destino (siempre) y pozos sin indicar (en la cabecera solo con «generar»; con «solo informar», en Máquinas y Energía).
- **`[hidden]{display:none!important}`** en `styles.css`: sin ella, un `label` con `hidden` seguía visible (los `label` son `display:grid`).

## Flujo de git (gitflow)

- `main`: solo versiones publicadas; cada una con etiqueta `vX.Y.Z` (la primera: `v2.0.0`). `develop`: integración.
- Trabajo nuevo en `feature/<nombre-corto>` creada desde `develop`; correcciones urgentes en `hotfix/*` desde `main`; versiones en `release/X.Y.Z`.
- El usuario gestiona git con Fork (tiene la integración de Git Flow). Claude Code puede crear ramas `feature/*` y preparar commits, pero **no hace commit, merge ni push sin permiso explícito**.
- Los commits usan el correo noreply de GitHub del autor (`user.email` local del repositorio), nunca el personal.
- Mensajes de commit en español, en imperativo y concretos (p. ej. «Añade planificación de generadores»).
- **Finales de línea:** LF en todo el repositorio (`.gitattributes` con `* text=auto eol=lf`); `build.py` escribe siempre con `newline="\n"`, así que un build sin cambios no deja `Planificador.html` modificado.
- `Planificador.html` y `data/satisfactory_db.json` se versionan (son el entregable), pero se regeneran siempre con `build.py` y `docs_to_db.py` antes de cada commit.

## Reglas del proyecto

1. **Nada con copyright en el repo:** ni iconos del juego (están en `.gitignore`), ni Docs.json completos, ni capturas del juego. Los glifos son propios.
2. **Datos derivados de Docs.json:** `data/satisfactory_db.json` contiene datos derivados de los Docs del juego (© Coffee Stain Studios, sin licencia explícita). Es práctica habitual en herramientas comunitarias; se indica en la sección «Licencia y avisos» del README (la licencia del código no cubre esos datos). `LICENSE` lleva el texto MIT sin añadidos para que GitHub la reconozca; el alcance se explica en el README.
3. **Sin dependencias en tiempo de ejecución** salvo Google Fonts (con *fallback*). Debe funcionar por `file://` y sin conexión.
4. **No editar `Planificador.html` ni `data/*.json` a mano:** se regeneran.
5. **Cualquier cambio en el simplex o en lo que entra en él** (procesos, filas, energía) debe pasar `compare_highs.py` con 0 discrepancias. `export_lp_cases.js` incluye casos con energía, energía externa, Pressurizers (exporta cada vuelta del punto fijo) y planta de energía como objetivo.

## Pendiente (por prioridad)

1. **Enlace a la versión online:** cuando exista una versión publicada (ver punto 2), añadir el enlace al README (créditos) y quizá al pie del HTML. Hasta entonces, ningún enlace.
2. **Publicación (aplazada):** de momento no se publica en ninguna web; solo se comparte el archivo `Planificador.html`. NO usar GitHub Pages. Se tratará desde el proyecto de la web personal de Shirosaki Ōkami (Astro en Cloudflare). Opción candidata: **A**, copiar el HTML de cada versión etiquetada en `main` a `public/<ruta>/index.html` de la web y servirlo bajo esa subruta, siempre con barra final (`/ruta/`) para que las rutas relativas funcionen. Otras opciones valoradas: despliegue propio desde este repositorio (un proyecto de Cloudflare vive en un dominio, no en una ruta; haría falta un Worker) o integrarlo en el repositorio de la web (submódulo o GitHub Action).
3. **Energía, fase 2:**
   - **Geotérmica:** depende de la pureza del géiser (los Docs solo dan `mVariablePowerProductionFactor` = 200 y un ciclo variable) y no consume nada: aporte fijo de MW que indica el usuario (géiseres por pureza).
   - **Alien Power Augmenter:** 500 MW + un porcentaje de la red (Docs: `mBaseBoostPercentage` 0,1; la Alien Power Matrix añade `mBoostPercentage` 0,2 durante `mBoostDuration` 12 s). **Confirmar la regla exacta antes de modelarla** (a qué se aplica el porcentaje, si se acumula entre varios y consumo de matrices). Es lineal si el usuario indica cuántos tiene.
4. **Sankey:** más legible en fábricas grandes (agrupar nodos pequeños, zoom/arrastre, resaltar un objeto al pasar el ratón).
5. **Iconos:** probar una extracción automática por línea de comandos (p. ej. herramientas .NET basadas en CUE4Parse) como alternativa a FModel.
6. **Selector de tema:** claro / oscuro / sistema, guardado en el estado y aplicado con `data-theme` en `<html>` (las reglas CSS ya existen).
7. **Otros:** filtro de recetas por tier/hito desbloqueado; exportar la lista de construcción (CSV/Markdown); comparar dos fábricas.

## Historia breve

- **Excel «Fabricación de piezas»:** matriz de fórmulas con errores sistemáticos; aparcado.
- **v1 HTML:** datos de la wiki transcritos, solver manual.
- **Preparación del repositorio público (v2.1.0, 11/2026):** `README.md`, `LICENSE` MIT, avisos, créditos, nombre visible nuevo y finales de línea LF.
- **Energía (11/2026, `feature/energia`):** generadores con combustible como recetas, `Power_MW`, modo «generar», energía externa, Pressurizers por pozos con reparto proporcional, pestaña Energía. Límite del punto fijo con error `"press"` y comprobación automática del HTML generado. HiGHS: 227 casos, 0 discrepancias.
- **v2 (actual):** datos de los Docs del juego, optimizador lineal validado con HiGHS (177 casos, error relativo máximo 3e-14), Somersloops, varias fábricas, alternativas desbloqueables, Sankey, glifos, ES/EN.
- **Versión publicada en claude.ai:** existió como página privada de pruebas y se eliminó el 25/11/2026. La referencia es este repositorio.
