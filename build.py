"""Construye Planificador.html (un solo archivo, funciona sin conexión) a partir de src/ y data/.
Uso: python build.py   (opcional: python tools/docs_to_db.py "<Satisfactory>/CommunityResources/Docs" data/satisfactory_db.json antes)
"""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
rd = lambda *p: open(os.path.join(H, *p), encoding="utf-8").read()
db = json.load(open(os.path.join(H, "data", "satisfactory_db.json"), encoding="utf-8"))
js = "\n".join(rd("src", f) for f in ("engine.js", "glyphs.js", "sankey.js", "report.js", "advisor.js", "app.js")).replace("</script", "<\\/script")
html = (rd("src", "index.template.html")
        .replace("/*__CSS__*/", rd("src", "styles.css"))
        .replace("/*__DB__*/", json.dumps(db, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"))
        .replace("/*__JS__*/", js))
open(os.path.join(H, "Planificador.html"), "w", encoding="utf-8", newline="\n").write(html)  # LF siempre (ver .gitattributes)
print("Planificador.html", round(len(html.encode()) / 1024), "KB")
