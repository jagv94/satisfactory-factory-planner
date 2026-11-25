# Planificador FICSIT (Satisfactory)

Herramienta para calcular fábricas de Satisfactory: qué recetas usar, cuántas máquinas construir, qué materias primas y cuánta energía hacen falta. Cubre sólidos, fluidos, subproductos, recetas alternativas, overclock, Somersloops y la cadena nuclear.

**Para usarla basta con abrir `Planificador.html`** en cualquier navegador. Es un solo archivo, funciona sin conexión y puedes enviárselo a tus amigos tal cual.

## Qué hay en la carpeta

| Ruta | Para qué |
|---|---|
| `Planificador.html` | La herramienta completa (datos incluidos). Es lo único necesario para usarla. |
| `data/satisfactory_db.json` | Base de datos generada desde los archivos oficiales del juego. |
| `icons/` | Opcional: iconos reales del juego. Si está vacía, se usan glifos propios. |
| `src/` | Código fuente: `engine.js` (cálculo y optimizador), `glyphs.js`, `sankey.js`, `app.js`, `styles.css`, `index.template.html`. |
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
6. **Diagrama**: flujo de materias primas a objetivos. **Árbol**: desglose recursivo. **Excedentes**: lo que sobra.

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
- **Resource Well:** el Pressurizer (150 MW por pozo) no se suma; se avisa en la pestaña *Máquinas*.
- **Generación de energía:** no se planifica, salvo los residuos de la central nuclear.
- **Máximo del mapa:** corresponde al mapa por defecto (wiki, nodos de la 1.x). Si usas nodos aleatorios de la 1.2, cambia los límites a mano.
- **Desglose del árbol:** es bruto, no descuenta subproductos; los totales netos están en *Producción*.
