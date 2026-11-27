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
build.py                   ← une src/*.js + styles.css + template + data → Planificador.html (orden: engine, glyphs, sankey, report, advisor, app)
data/satisfactory_db.json  ← GENERADO por tools/docs_to_db.py desde los Docs del juego
src/
  engine.js                ← motor: procesos, solver manual, simplex, análisis (sin DOM; corre en Node)
  glyphs.js                ← glifos SVG propios por familia de objeto + color por materias primas
  sankey.js                ← diagrama de flujo sin dependencias
  report.js                ← desglose de máquinas por edificio y receta + exportación Markdown/CSV (sin DOM; corre en Node)
  advisor.js               ← asesor de alternativas: evalúa desbloquear/bloquear cada una con el optimizador (sin DOM; corre en Node)
  app.js                   ← estado, render, eventos (depende de Engine, Glyphs, Sankey, Report, Advisor)
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
  - El script arranca en un DOM mínimo (`vm` + objetos comodín): define `Engine`, `Glyphs`, `Sankey`, `Report` y `Advisor`, rellena el subtítulo, las cifras y la tabla de producción. Así salen también los errores de ejecución al arrancar (p. ej. una función que no existe).
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
- **Coste de construcción (`buildCosts`):** `{Build_X_C: {Desc_...: n}}`, de la receta de la Build Gun (`mProducedIn` = `BP_BuildGun_C`, producto `Desc_X_C`) de los 22 edificios que usa el planificador: máquinas, generadores, Miner Mk.1-3 (`extractors.miner.tiers[*].id`), extractores de agua, petróleo y pozo (`extractors.<tipo>.id`) y Pressurizer (`extractors.well.pressurizerId`). El parser falla si falta alguno. Sus materiales se conservan en `items` aunque ninguna receta los use.
- **`specials`:** nombres de Power Shard, Somersloop (no es objeto de receta, no está en `items`) y Equipment Workshop.
- **`items[i].workshop`:** material de construcción cuya receta estándar es del Equipment Workshop (`BP_WorkshopComponent_C`). Hoy solo el Taladro portátil (`BP_ItemDescriptorPortableMiner_C`, 1-3 por Miner). Las recetas del Workshop no entran en el planificador; su alternativa «Taladro automatizado» (Ensambladora) sí.
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
  - **Búsqueda de procesos (`collect`)**: desde la demanda, por las recetas permitidas y no excluidas; una receta entra si alguna de sus salidas (subproductos incluidos) está entre los objetos alcanzados. `Engine.reach(cfg, plan)` devuelve ese conjunto (lo usa el atajo «no entra» del asesor).
  - `res.obj`: valor del criterio en el LP (`res.value` del simplex = c·x; con maximizar incluye −1e6 · escala). Lo usa el asesor.
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
  - `res.pressIter`: número de re-resoluciones que hicieron falta. `Engine.pressAll(cfg)`: potencia de los Pressurizers por fluido con pozos indicados.
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
- **Pestaña Máquinas (desglose):** `Report.breakdown(A, {db, lang, cfg, engine})` agrupa las filas de `analyze` con máquinas en tres secciones: Producción (recetas), Extracción (extractores + Pressurizers como un edificio más, una línea por fluido, unidades = pozos) y Energía (generadores; producto = combustible, «→ Energía», MW en negativo = generan). Una línea por proceso: si el optimizador mezcla recetas para un producto, salen varias. Edificios y líneas, de más a menos unidades. En los extractores, la «receta» es la pureza configurada en Extracción (no un recuento de nodos; tooltip y nota en la pestaña). Total MW = consumo real (`energy.cons`).
  - Una sola tabla (columnas alineadas): fila de edificio con botón `.tgl` (`aria-expanded`) y filas `.ml` con `hidden`. El estado desplegado vive en `machOpen` (memoria, no se guarda ni pasa por `set()`): desplegar no repinta.
  - **Exportación** (`Report.markdown` / `Report.csv`): el texto va siempre al cuadro `#mOut` (respaldo si el navegador bloquea portapapeles o descarga; dentro de un marco, el botón lo advierte porque la descarga puede fallar sin aviso). Markdown: una tabla por edificio + resumen; números como en la interfaz (es-ES). CSV en formato español: `;`, coma decimal, sin miles, `\r\n`, una fila por línea sin totales; el BOM solo se añade a la descarga (para Excel), no al copiar. Nombre de archivo: `Report.fileName()` quita `/ \ : * ? " < > |` y caracteres de control y recorta; vacío → «fabrica».
  - `machinesBy()` sigue alimentando la tabla de consumo de la pestaña Energía.
- **Coste de construcción** (bloque al final de Máquinas; `Report.cost(rep, {db, lang})`): unidades enteras del desglose (`r.build` = `ceil(x − 1e-6)` por fila, también con reloj reducido) × `buildCosts`. Solo la fábrica activa (título «Coste de construcción · fábrica «X»», capítulo del Markdown y columna «Fábrica» del CSV).
  - Tres tablas: materiales totales (cantidad y puntos del Sink; orden por cantidad o puntos en `costSort`, en memoria), por tipo de edificio (coste unitario, total, puntos y %, ordenada por puntos) y especiales (Power Shards y Somersloops colocados = totales del desglose; no suman puntos).
  - **Valor = puntos del AWESOME Sink** (`items[i].sink`): medida aproximada para comparar qué parte sale más cara. Mide complejidad y crece mucho con el tier, no el mineral necesario (la nota lo dice; ver «Pendiente»).
  - Notas (`Report.NOTE`, iguales en la interfaz y en el Markdown): unidades enteras, puntos, especiales y exclusiones (cintas, tuberías, elevadores, divisores, bombas, postes y cables, cimientos, paredes, almacenes, Sink, transporte). Material del Workshop: «¹» con «se fabrica en el Equipment Workshop (o con la alternativa…)».
  - Exportación: el Markdown añade el capítulo; *CSV: materiales* (`Report.costCsv`, archivo `<fábrica>_materiales.csv`) lleva una fila por edificio y material, más Power Shards y Somersloops («Especiales»). Mismo formato español; BOM solo en la descarga, escrito como escape `\ufeff` (nunca el carácter literal en el código).
- **Asesor de alternativas** (`src/advisor.js` + panel arriba de la pestaña Alternativas): para la fábrica activa, recalcula con `solveOpt` cada alternativa por separado.
  - *Candidatas* (bloqueadas; todas o «Mi lista», en memoria): cambio al desbloquearla. *Activas* (desbloqueadas): cambio al bloquearla.
  - **Criterio:** `res.obj` (con maximizar, la escala). Cambio relativo `rel = (nuevo − base) / |base|`; **umbral único** `Advisor.TOL` = 1e-4 (0,01 %) para todos los estados. Estados: candidatas «Mejora», «Empeora» (solo con pozos), «No aporta» (no la usaría / sin ganancia / no entra / excluida), «Hace posible el plan» (base sin solución); activas «Importa», «Mejor sin ella» (solo con pozos), «Prescindible» (se usa pero hay otra igual de buena), «No se usa», «Imprescindible» (sin ella no hay solución). En los dos modos, **«Sin límite»** (`sinlimite`): al maximizar, con (o sin) ella el plan queda no acotado; la fila lo explica y va arriba. Nunca se excluyen recetas en silencio. Si la propia base ya no tiene techo (p. ej. maximizar con solo el hierro limitado: el Converter hace mineral de hierro con caliza), no se evalúa nada (`job.blocked`) y el panel avisa de que no hay con qué comparar.
  - **Columnas:** Δ de `analyze` y `Report.cost` (uso del mapa, consumo real, máquinas de producción enteras, puntos del Sink). Usan máquinas enteras, así que pueden ir un poco en contra aunque mejore el criterio.
  - **Atajos exactos** (sin resolver): una alternativa sin ninguna salida en `Engine.reach` no entra en el LP (incluye subproductos y, con «generar», los combustibles); una activa que la base no usa no cambia el óptimo al quitarla. Este segundo atajo **no se aplica con pozos**: el punto fijo de los Pressurizers depende del camino. Las pruebas comparan los atajos con resolverlas una a una.
  - **Monotonía:** sin pozos, desbloquear nunca empeora el criterio ni bloquear lo mejora (LP: añadir o quitar una columna). **Con pozos no se mantiene**: el reparto proporcional de los Pressurizers puede caer en otro punto fijo. Caso medido: Fase 5, «mínima potencia», energía generada y 2 pozos de nitrógeno, la mitad de las alternativas desbloqueadas: bloquear una activa mejora el criterio un 0,40 %. La prueba usa un margen del 1 % y el panel, con pozos, no afirma la monotonía.
  - **Manual:** la base es el optimizador con el criterio de la fábrica y sin maximizar (`Advisor.basePlan`); el panel lo avisa.
  - **Por partes:** `Advisor.step(job, 40)` evalúa durante ~40 ms y la interfaz cede con `setTimeout(0)`; barra de progreso y Cancelar. Firma (`advSig`: fábrica, `cfg` sin cinta ni tubería y plan sin nombre): si cambia durante la evaluación, se cancela; si cambia después, los resultados se marcan como desactualizados. Tiempos: Fase 5 sin energía ~0,4 s; con energía generada y pozos ~4 s.
  - **Acción por fila:** `Advisor.setUnlocked(cfg, id, on)` es la única forma de cambiar un desbloqueo (la usa también la casilla de la lista), dentro de `set()`, así que se deshace con Ctrl+Z.
  - Estado del panel (`adv`: modo, alcance, lista, trabajo) en memoria: no se guarda ni pasa por `set()`.
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
7. **Ficha de pieza con buscador:** buscar por nombre ES/EN sin distinguir tildes; panel con recetas que la producen, recetas que la consumen, uso en la fábrica actual y acciones (añadir como objetivo, importar). Cada pieza enlaza a su ficha. Será la base del futuro diagrama relacional en modo foco.
8. **Coste de construcción en materias primas equivalentes** (mineral bruto con las recetas elegidas): complementa los puntos del Sink, que miden complejidad y no recursos.
9. **Pressurizers:** la iteración de punto fijo puede quedarse en un equilibrio no óptimo (el asesor encontró un caso en que bloquear una alternativa mejora el criterio un 0,40 %). Estudiar integrarlos en el optimizador (potencia no lineal con overclock: aproximación por tramos o similar).
10. **Otros:** filtro de recetas por tier/hito desbloqueado (también para que el asesor no recomiende alternativas aún inalcanzables); comparar dos fábricas.

## Historia breve

- **Excel «Fabricación de piezas»:** matriz de fórmulas con errores sistemáticos; aparcado.
- **v1 HTML:** datos de la wiki transcritos, solver manual.
- **Preparación del repositorio público (v2.1.0, 11/2026):** `README.md`, `LICENSE` MIT, avisos, créditos, nombre visible nuevo y finales de línea LF.
- **Energía (11/2026, `feature/energia`):** generadores con combustible como recetas, `Power_MW`, modo «generar», energía externa, Pressurizers por pozos con reparto proporcional, pestaña Energía. Límite del punto fijo con error `"press"` y comprobación automática del HTML generado. HiGHS: 227 casos, 0 discrepancias.
- **Desglose de máquinas (11/2026, `feature/desglose-maquinas`):** pestaña Máquinas por edificio y receta, desplegable, con exportación a Markdown y CSV (`src/report.js`).
- **Asesor de alternativas (11/2026, `feature/asesor-alternativas`):** candidatas y activas evaluadas con el optimizador, atajos exactos, cálculo por partes con Cancelar, acción por fila con deshacer (`src/advisor.js`). El motor devuelve `obj` y expone `reach`/`pressAll`. HiGHS: 227 casos, 0 discrepancias.
- **Coste de construcción (11/2026, `feature/coste-construccion`):** materiales de construcción de la fábrica activa desde los Docs (`buildCosts`), por material y por tipo de edificio, con puntos del Sink y exportación Markdown/CSV.
- **v2 (actual):** datos de los Docs del juego, optimizador lineal validado con HiGHS (177 casos, error relativo máximo 3e-14), Somersloops, varias fábricas, alternativas desbloqueables, Sankey, glifos, ES/EN.
- **Versión publicada en claude.ai:** existió como página privada de pruebas y se eliminó el 25/11/2026. La referencia es este repositorio.
