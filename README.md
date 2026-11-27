# Planificador de fábricas para Satisfactory

*Factory Planner for Satisfactory*

Herramienta para calcular fábricas de Satisfactory: qué recetas usar, cuántas máquinas construir, qué materias primas y cuánta energía hacen falta. Cubre sólidos, fluidos, subproductos, recetas alternativas, overclock, Somersloops y la cadena nuclear.

**Para usarla basta con abrir `Planificador.html`** en cualquier navegador. Es un solo archivo, funciona sin conexión y puedes enviárselo a tus amigos tal cual.

## Qué hay en la carpeta

| Ruta | Para qué |
|---|---|
| `Planificador.html` | La herramienta completa (datos incluidos). Es lo único necesario para usarla. |
| `data/satisfactory_db.json` | Base de datos generada desde los archivos oficiales del juego. |
| `icons/` | Opcional: iconos reales del juego. Si está vacía, se usan glifos propios. |
| `src/` | Código fuente: `engine.js` (cálculo y optimizador), `glyphs.js`, `sankey.js`, `report.js` (desglose de máquinas y exportación), `app.js`, `styles.css`, `index.template.html`. |
| `tools/docs_to_db.py` | Regenera la base de datos desde `CommunityResources/Docs` del juego. |
| `tools/copiar_iconos.ps1` | Copia a `icons/` los iconos exportados con FModel. |
| `build.py` | Vuelve a montar `Planificador.html` a partir de `src/` y `data/`. |
| `tests/` | Pruebas del motor (`node tests/test_engine.js`) y comparación del optimizador con HiGHS. |

## Cómo se usa

1. **Fábrica**: puedes tener varias (Nueva / Duplicar / Borrar) y renombrarlas. Todo se guarda en el navegador. Para pasar la configuración a otro equipo, usa *Datos → Copiar / Descargar configuración*.
2. **Objetivos**: elige un preset (fases del Space Elevator, o todas las piezas finales) y la cantidad por minuto. Después ajusta o añade piezas una a una. El coste de cada pieza es la suma, para cada materia prima, del % que usa del máximo del mapa por cada 1/min. Sirve para ver cuáles son las más exigentes.
3. **Cálculo**:
   - *Manual*: eliges una receta por objeto en la tabla de Producción.
   - *Optimizar*: el motor elige y mezcla recetas según un criterio (mínimo de recursos ponderado por escasez, mínima potencia o mínimo de máquinas).
   - Con *Maximizar* calcula cuánto puedes producir dentro de los límites que pongas en *Extracción* (o el máximo del mapa).
4. **Alternativas**: marca las que tienes desbloqueadas. Las bloqueadas no aparecen en los desplegables ni las usa el optimizador.
5. **Producción**: cada fila tiene su reloj (%) y sus Somersloops. La tabla calcula los Power Shards necesarios, el reloj uniforme ("real") y la potencia.
6. **Energía**: en *Cálculo → Energía* eliges entre *Solo informar del consumo* y *Generarla en la fábrica*. Con la segunda, la fábrica produce su propia energía: en manual eliges el generador y su combustible en la fila *Energía* de Producción; al optimizar, el motor los elige según el criterio. Puedes indicar *energía externa disponible* (MW de otra red) para que solo genere el resto. La pestaña *Energía* muestra generadores, combustible, agua, residuos y el consumo por máquina. También puedes poner *Energía* como objetivo para diseñar una central.
   - Generadores: Biomass Burner, carbón, combustible y central nuclear (uranio, plutonio y ficsonio), con overclock.
   - *Mínima potencia* minimiza el consumo total de la fábrica (incluidas las cadenas de combustible), sin contar lo que producen los generadores.
   - Los residuos nucleares se permiten como excedente, con aviso: no se pueden destruir en el AWESOME Sink. Para evitarlos, excluye las recetas nucleares en el optimizador.
7. **Máquinas**: cuántos edificios de cada tipo necesitas, por secciones (Producción, Extracción y Energía). Despliega un edificio (o pulsa *Desplegar todo*) para ver para qué se usa: una línea por receta con su producto, producción, unidades, reloj real, Power Shards, Somersloops y MW. Así ves, por ejemplo, cuántos Constructors hacen placas y cuántos cable.
   - En los extractores, la pureza que aparece es la configurada en *Extracción* para ese recurso, no un recuento de nodos reales.
   - *Copiar* o *Descargar* exporta el desglose como lista de construcción, en **Markdown** (una tabla por edificio) o en **CSV**. El texto queda también en el cuadro de debajo, por si el navegador bloquea el portapapeles o la descarga.
   - El **CSV usa formato español**: punto y coma como separador y coma decimal, pensado para abrirlo en Excel o LibreOffice en español. Lleva una fila por receta, sin filas de total, para poder filtrar y sumar.
8. **Diagrama**: flujo de materias primas a objetivos. **Árbol**: desglose recursivo. **Excedentes**: lo que sobra.

Atajo: `Ctrl+Z` deshace (fuera de los campos de texto).

## Actualizar los datos tras un parche del juego

```
python tools/docs_to_db.py "C:\Program Files (x86)\Steam\steamapps\common\Satisfactory\CommunityResources\Docs" data/satisfactory_db.json
python build.py
```

## Iconos del juego (opcional)

Los iconos no están sueltos en la instalación: van dentro de `FactoryGame/Content/Paks/*.ucas`.

1. Instala FModel y configúralo para Satisfactory. Sigue la guía de modding: <https://docs.ficsit.app/satisfactory-modding/latest/Development/ExtractGameFiles.html> (usa `FactoryGame.usmap` y `CustomVersions.json` de `CommunityResources`).
2. Exporta como PNG la carpeta `FactoryGame/Content/FactoryGame/Resource` (y `Equipment` si quieres).
3. En PowerShell: `.\tools\copiar_iconos.ps1 -Exports "C:\ruta\FModel\Output\Exports"`.
4. Abre `Planificador.html`: verás los iconos reales. En *Ajustes → Iconos* puedes volver a los glifos.

Los iconos son material con copyright de Coffee Stain Studios. Úsalos en tu copia y, como mucho, con amigos que tengan el juego. No los publiques en una web. Los glifos propios no tienen esa limitación.

## Desarrollo

El contexto técnico (arquitectura, decisiones, reglas y pendientes) está en `CLAUDE.md`.

## Límites conocidos

- **Potencia de máquinas variables:** para el Particle Accelerator, el Converter y el Quantum Encoder se usa la media del rango de cada receta.
- **Resource Well:** indica en *Extracción → Pozos (Pressurizers)* cuántos pozos usas por fluido. Si lo dejas vacío, sus Pressurizers (150 MW cada uno) no se suman y se avisa.
- **Generación de energía:** no incluye la geotérmica ni el Alien Power Augmenter.
- **Consumo real:** se calcula con máquinas enteras y reloj uniforme, igual o menor que el planificado; puede sobrar algo de generación.
- **Máximo del mapa:** corresponde al mapa por defecto (wiki, nodos de la 1.x). Si usas nodos aleatorios de la 1.2, cambia los límites a mano.
- **Desglose del árbol:** es bruto, no descuenta subproductos; los totales netos están en *Producción*.

## Licencia y avisos

- **Código:** bajo licencia MIT (ver [`LICENSE`](LICENSE)).
- **Datos del juego:** los nombres de objetos, recetas, edificios y sus cifras (`data/satisfactory_db.json`, también incluidos dentro de `Planificador.html`) proceden de `CommunityResources/Docs` del juego y son propiedad de Coffee Stain Studios. No están cubiertos por la licencia MIT.
- **Máximo del mapa:** las cifras de máximo por recurso se han tomado de la [wiki de Satisfactory](https://satisfactory.wiki.gg/).
- **Iconos:** el repositorio no incluye iconos ni capturas del juego; los glifos que usa la herramienta son propios.
- **Herramienta no oficial:** es un proyecto gratuito y de aficionado, no oficial y no afiliado a Coffee Stain Studios ni respaldado por ella. Satisfactory es una marca de Coffee Stain Studios.

## Créditos

Creado por Adrián Guerra (Shirosaki Ōkami).
