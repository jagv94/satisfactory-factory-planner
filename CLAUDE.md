# CLAUDE.md: contexto de desarrollo del Planificador FICSIT

Documento de continuidad para Claude Code. `LEEME.md` es para quien **usa** la herramienta; este archivo es para quien la **desarrolla**. Léelo entero antes de tocar nada.

## Qué es

Planificador de fábricas para **Satisfactory 1.x**: dado un conjunto de piezas objetivo (por minuto), calcula recetas, máquinas, extractores, energía, subproductos y flujo de materiales. Funciona en modo manual (una receta por objeto) o con un optimizador lineal (mezcla recetas según un criterio).

- **Entregable:** `Planificador.html`. Un único archivo autocontenido (datos, CSS y JS dentro) que funciona abriéndolo con doble clic (`file://`), sin servidor ni conexión. Es lo que se reparte a otros jugadores.
- **Objetivo del repositorio:** herramienta comunitaria, de código abierto. Solo puede contener archivos que se puedan compartir (ver «Reglas»).
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
node tests/test_engine.js            # debe terminar en «Todo correcto»
node tests/export_lp_cases.js && python tests/compare_highs.py   # 0 discrepancias esperadas (requiere numpy+scipy)
```

Flujo obligatorio tras cambiar código: `python build.py` → `node tests/test_engine.js` → abrir `Planificador.html` en el navegador y revisar la consola (0 errores) a ~1400 px, ~720 px y ~400 px de ancho, en claro y oscuro.

## Datos (data/satisfactory_db.json)

- **Fuente única:** los Docs del juego. No se transcriben recetas a mano (la primera versión se transcribió desde la wiki y tenía errores).
- **IDs:** `ClassName` del juego (`Desc_IronPlate_C`, `Recipe_IronPlate_C`). Nombres en `en` / `es`.
- **Unidades:** todo por minuto a reloj 100 %; los fluidos se dividen entre 1000 (Docs usa litros) → m³/min.
- **Alternativa:** una receta es alternativa si la desbloquea un esquema `EST_Alternate`. Ojo: algunas clases se llaman `Recipe_Alternate_*` pero se desbloquean por MAM (p. ej. Compacted Coal) y no cuentan como alternativas.
- **Exclusiones:** recetas de edificios, equipo del taller y FICSMAS (filtro por `EV_Christmas` y por nombres Xmas/Gift/Snow/Candy/Firework).
- **Central nuclear:** se añade como receta `Gen_<combustible>` (barra + agua → residuo, potencia −2500 MW).
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
- **`analyze`:** filas por proceso (máquinas exactas, a construir, reloj uniforme, potencia, fragmentos), balance por objeto, materias primas y puntuación de uso del mapa.

## Interfaz (src/app.js)

- **Estado `S`** (v2, `localStorage` clave `ficsit-planner-v2`):
  - `{lang, icons, group, tab, cur, preset, cfg: {clock, belt, pipe, ext, locked, limits}, plans: [{name, targets, sel, rc, mode, objective, maximize, allowManual, ban}]}`.
  - `cfg` es global (mundo, desbloqueos); `plans` son las fábricas.
- **Cambios:** todo pasa por `set(mut)` (historial para deshacer, guardar, render diferido con `setTimeout(0)` para no perder el foco al tabular). El render restaura el foco por `data-fk`.
- **Seguridad:** todo texto que venga de datos se escapa con `esc()` antes de entrar en HTML.
- **Iconos:** si existe `icons/Desc_IronPlate_C.png`, se usan PNG del juego; cada `<img>` que falle se sustituye por su glifo (listener de `error` en captura).
- **Sankey:** niveles = `Engine.depths()` (camino más largo, seguro ante ciclos). Iterar sobre los enlaces disparaba el ancho a más de 11.000 px con bucles de reciclaje.

## Flujo de git (gitflow)

- `main`: solo versiones publicadas; cada una con etiqueta `vX.Y.Z` (la primera: `v2.0.0`). `develop`: integración.
- Trabajo nuevo en `feature/<nombre-corto>` creada desde `develop`; correcciones urgentes en `hotfix/*` desde `main`; versiones en `release/X.Y.Z`.
- El usuario gestiona git con Fork (tiene la integración de Git Flow). Claude Code puede crear ramas `feature/*` y preparar commits, pero **no hace commit, merge ni push sin permiso explícito**.
- Mensajes de commit en español, en imperativo y concretos (p. ej. «Añade planificación de generadores»).
- `Planificador.html` y `data/satisfactory_db.json` se versionan (son el entregable), pero se regeneran siempre con `build.py` y `docs_to_db.py` antes de cada commit.

## Reglas del proyecto

1. **Nada con copyright en el repo:** ni iconos del juego (están en `.gitignore`), ni Docs.json completos, ni capturas del juego. Los glifos son propios.
2. **Datos derivados de Docs.json:** `data/satisfactory_db.json` contiene datos derivados de los Docs del juego (© Coffee Stain Studios, sin licencia explícita). Es práctica habitual en herramientas comunitarias, pero hay que indicarlo en el README y en la licencia (la licencia del código no cubre esos datos).
3. **Sin dependencias en tiempo de ejecución** salvo Google Fonts (con *fallback*). Debe funcionar por `file://` y sin conexión.
4. **No editar `Planificador.html` ni `data/*.json` a mano:** se regeneran.
5. **Cualquier cambio en el simplex** debe pasar `compare_highs.py` con 0 discrepancias.

## Pendiente (por prioridad)

1. **Repositorio:** lo crea el usuario con Fork (público). Claude Code no hace commits ni push sin permiso. Antes del primer commit: renombrar `LEEME.md` a `README.md` (GitHub lo muestra en portada), añadir `LICENSE` (MIT recomendada; confirmar con el usuario) y una sección «Licencia y avisos»: código bajo la licencia elegida; datos del juego © Coffee Stain Studios, no cubiertos; herramienta no oficial ni afiliada.
2. **Publicación:** NO usar GitHub Pages (el usuario ya lo usa para otra cosa). Se integrará en una web suya alojada en Cloudflare: basta con servir `Planificador.html` como estático (opcional: despliegue automático desde el repositorio). También se reparte como descarga.
3. **Energía:** planificar la generación (generadores de carbón/combustible/nuclear) y sumar los Pressurizers de los Resource Well (150 MW por pozo; ahora solo se avisa).
4. **Sankey:** más legible en fábricas grandes (agrupar nodos pequeños, zoom/arrastre, resaltar un objeto al pasar el ratón).
5. **Iconos:** probar una extracción automática por línea de comandos (p. ej. herramientas .NET basadas en CUE4Parse) como alternativa a FModel.
6. **Otros:** filtro de recetas por tier/hito desbloqueado; exportar la lista de construcción (CSV/Markdown); comparar dos fábricas.

## Historia breve

- **Excel «Fabricación de piezas»:** matriz de fórmulas con errores sistemáticos; aparcado.
- **v1 HTML:** datos de la wiki transcritos, solver manual.
- **v2 (actual):** datos de los Docs del juego, optimizador lineal validado con HiGHS (177 casos, error relativo máximo 3e-14), Somersloops, varias fábricas, alternativas desbloqueables, Sankey, glifos, ES/EN.
- **Versión publicada en claude.ai:** existió como página privada de pruebas y se eliminó el 25/11/2026. La referencia es este repositorio.
