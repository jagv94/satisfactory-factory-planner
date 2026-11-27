// Desglose de máquinas por edificio y receta, y su exportación a Markdown y CSV.
// Sin DOM: se ejecuta igual en el navegador y en Node (tests). Trabaja sobre el resultado de Engine.analyze().
const Report = (() => {
  const POWER = "Power_MW";
  const PURITY = {Impure: "impura", Normal: "normal", Pure: "pura"};
  const SECTIONS = [["prod", "Producción"], ["ext", "Extracción"], ["gen", "Energía"]];

  // o = {db, lang, cfg, engine}
  function breakdown(A, o) {
    const {db, lang, cfg, engine} = o;
    const nm = id => (db.items[id] || {})[lang] || (db.items[id] || {}).en || id;
    const unit = id => id === POWER ? "MW" : db.items[id] && (db.items[id].form === "liquid" || db.items[id].form === "gas") ? "m³/min" : "/min";
    const B = {prod: {}, ext: {}, gen: {}};
    // cls: clase del edificio en los Docs (Build_X_C), para su coste de construcción
    const add = (sec, name, cls, line) => {
      const b = B[sec][name] || (B[sec][name] = {name, cls, units: 0, mw: 0, shards: 0, sloops: 0, lines: []});
      b.units += line.units; b.mw += line.mw; b.shards += line.shards; b.sloops += line.sloops; b.lines.push(line);
    };
    for (const r of A.rows) {
      if (!r.build || !r.p.building) continue;
      const p = r.p, base = {item: p.item, rate: r.rate, unit: unit(p.item), x: r.x, units: r.build, uclock: r.uclock, shards: r.shards, sloops: r.sloops, mw: r.power, alt: false};
      if (p.kind === "extract") {
        const ex = db.extractors[p.ext] || {}, pur = ex.purity === false ? null : engine.extCfg(cfg, p.item).purity;
        const cls = p.ext === "miner" ? (ex.tiers[p.building.split(":")[2]] || {}).id : ex.id;
        add("ext", p.bname[lang] || p.bname.en, cls, Object.assign(base, {kind: "extract", product: nm(p.item), recipe: pur ? "Pureza " + (PURITY[pur] || pur) : "–", purity: pur}));
      } else if (p.b.generator) {
        // generador: el producto es el combustible; produce MW
        const fuel = Object.keys(p.recipe.in).find(k => k !== "Desc_Water_C") || Object.keys(p.recipe.in)[0];
        add("gen", p.b[lang] || p.b.en, p.building, Object.assign(base, {kind: "gen", item: fuel, product: nm(fuel), recipe: "→ Energía", unit: "MW"}));
      } else {
        add("prod", p.b[lang] || p.b.en, p.building, Object.assign(base, {kind: "recipe", product: nm(p.item), recipe: p.recipe[lang] || p.recipe.en, alt: !!p.recipe.alt}));
      }
    }
    // Pressurizers: un «edificio» más en Extracción, una línea por fluido; las unidades son los pozos
    const pn = (db.extractors.well || {}).pressurizerName || {en: "Resource Well Pressurizer"};
    for (const pz of (A.energy || {}).press || []) if (pz.wells)
      add("ext", pn[lang] || pn.en, (db.extractors.well || {}).pressurizerId, {kind: "press", item: pz.item, product: nm(pz.item), recipe: pz.wells + (pz.wells === 1 ? " pozo" : " pozos"), alt: false,
        rate: null, unit: "", x: pz.wells, units: pz.wells, uclock: pz.clock, shards: pz.wells * engine.shards(pz.clock), sloops: 0, mw: pz.power});
    const byUnits = (a, b) => b.units - a.units || a.name.localeCompare(b.name);
    const sections = SECTIONS.map(([key, title]) => ({key, title, buildings: Object.values(B[key]).sort(byUnits)})).filter(s => s.buildings.length);
    for (const s of sections) for (const b of s.buildings) b.lines.sort((x, y) => y.units - x.units || x.product.localeCompare(y.product) || x.recipe.localeCompare(y.recipe));
    const all = sections.flatMap(s => s.buildings), sum = k => all.reduce((a, b) => a + b[k], 0);
    const E = A.energy || {};
    return {sections, total: {units: sum("units"), shards: sum("shards"), sloops: sum("sloops"), cons: E.cons || 0, gen: E.gen || 0}};
  }

  // ---------- formato
  const NF = {};
  const nf = (v, d = 2) => {
    if (!NF[d]) { try { NF[d] = new Intl.NumberFormat("es-ES", {maximumFractionDigits: d, useGrouping: "always"}); } catch (e) { NF[d] = new Intl.NumberFormat("es-ES", {maximumFractionDigits: d}); } }
    return NF[d].format(Math.abs(v) < 5e-7 ? 0 : v);
  };
  // CSV en formato español: coma decimal, sin separador de miles
  const num = (v, d = 4) => { if (v === null || v === undefined || !isFinite(v)) return ""; const r = Math.round(v * 10 ** d) / 10 ** d; return String(Object.is(r, -0) ? 0 : r).replace(".", ","); };
  const mdCell = s => String(s ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const csvCell = s => { s = String(s ?? ""); return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const mwTxt = v => v < 0 ? "+" + nf(-v, 1) : nf(v, 1);
  const rateTxt = l => l.rate === null ? "–" : nf(l.rate) + " " + l.unit;
  const recTxt = l => (l.alt ? "Alt: " : "") + l.recipe;

  // c: coste de construcción (opcional), se añade como capítulo final
  function markdown(rep, title, c) {
    const H = "| Producto | Receta | Producción | Unidades | Reloj real | Fragm. | Somersloops | MW |\n|---|---|--:|--:|--:|--:|--:|--:|";
    const t = rep.total, out = [`# Desglose de máquinas: ${mdCell(title)}`, "",
      `${nf(t.units, 0)} máquinas · consumo ${nf(t.cons, 1)} MW` + (t.gen ? ` · generación ${nf(t.gen, 1)} MW` : "") + ` · ${nf(t.shards, 0)} fragmentos · ${nf(t.sloops, 0)} Somersloops`];
    for (const s of rep.sections) {
      out.push("", `## ${s.title}`);
      for (const b of s.buildings) {
        out.push("", `### ${mdCell(b.name)}: ${nf(b.units, 0)} unidades · ${mwTxt(b.mw)} MW`, "", H);
        for (const l of b.lines) out.push(`| ${mdCell(l.product)} | ${mdCell(recTxt(l))} | ${rateTxt(l)} | ${nf(l.units, 0)} | ${nf(l.uclock * 100, 1)} % | ${nf(l.shards, 0)} | ${nf(l.sloops, 0)} | ${mwTxt(l.mw)} |`);
        if (b.lines.length > 1) out.push(`| **Total** | | | **${nf(b.units, 0)}** | | ${nf(b.shards, 0)} | ${nf(b.sloops, 0)} | ${mwTxt(b.mw)} |`);
      }
    }
    out.push("", "## Resumen", "", "| Sección | Edificio | Unidades | MW | Fragm. | Somersloops |", "|---|---|--:|--:|--:|--:|");
    for (const s of rep.sections) for (const b of s.buildings) out.push(`| ${s.title} | ${mdCell(b.name)} | ${nf(b.units, 0)} | ${mwTxt(b.mw)} | ${nf(b.shards, 0)} | ${nf(b.sloops, 0)} |`);
    out.push(`| **Total** | | **${nf(t.units, 0)}** | ${nf(t.cons, 1)} | ${nf(t.shards, 0)} | ${nf(t.sloops, 0)} |`, "",
      "MW: consumo; los generadores llevan «+» (producen). El MW total es el consumo de la fábrica.");
    if (rep.sections.some(s => s.buildings.some(b => b.lines.some(l => l.kind === "extract" && l.purity))))
      out.push("Pureza de los extractores: la configurada en Extracción para cada recurso, no un recuento de nodos reales.");
    return out.join("\n") + "\n" + (c ? costMarkdown(c, title) : "");
  }

  // ---------- coste de construcción: unidades enteras del desglose × receta de la Build Gun de cada edificio (db.buildCosts)
  const NOTE = {
    units: "Edificios enteros: cada línea del desglose se redondea hacia arriba, también las que van con reloj reducido.",
    points: "Puntos del Sink: los que da el AWESOME Sink por cada material. Sirven para comparar qué parte de la fábrica sale más cara, pero miden la complejidad de la pieza y crecen mucho con el tier: no equivalen al mineral necesario para fabricarla.",
    specials: "Power Shards y Somersloops: los colocados en las máquinas (incluidos los Pressurizers). No forman parte de la receta de construcción y no suman puntos.",
    excluded: "No incluye cintas, tuberías, elevadores, divisores y fusionadores, bombas, postes y cables de energía, cimientos ni paredes: dependen del diseño físico de la fábrica. Tampoco almacenes, el AWESOME Sink ni transporte (trenes, camiones, drones)."};
  // o = {db, lang}
  function cost(rep, o) {
    const {db, lang} = o, nm = id => (db.items[id] || {})[lang] || (db.items[id] || {}).en || id, sink = id => (db.items[id] || {}).sink || 0;
    const list = c => Object.entries(c).map(([item, qty]) => ({item, name: nm(item), qty, points: qty * sink(item)}));
    const buildings = [], mats = {}, missing = [];
    for (const s of rep.sections) for (const b of s.buildings) {
      const unit = (db.buildCosts || {})[b.cls];
      if (!unit) { missing.push(b.name); continue; }
      const total = {}; let points = 0;
      for (const [i, n] of Object.entries(unit)) {
        total[i] = n * b.units; points += total[i] * sink(i);
        const m = mats[i] || (mats[i] = {item: i, name: nm(i), qty: 0, points: 0, workshop: !!(db.items[i] || {}).workshop});
        m.qty += total[i]; m.points += total[i] * sink(i);
      }
      buildings.push({section: s.title, name: b.name, cls: b.cls, units: b.units, unit: list(unit), total: list(total), points});
    }
    const points = buildings.reduce((a, b) => a + b.points, 0);
    for (const b of buildings) b.pct = points ? b.points / points * 100 : 0;
    buildings.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    const sp = db.specials || {}, sn = k => (sp[k] || {})[lang] || (sp[k] || {}).en || k;
    const specials = [{key: "shard", item: (sp.shard || {}).id, name: sn("shard"), qty: rep.total.shards}, {key: "sloop", item: (sp.sloop || {}).id, name: sn("sloop"), qty: rep.total.sloops}];
    // materiales del Equipment Workshop: otras recetas del planificador que también los fabrican
    const alts = i => db.recipes.filter(r => r.out[i]).map(r => ({recipe: r[lang] || r.en, alt: !!r.alt, building: (db.buildings[r.building] || {})[lang] || r.building}));
    const workshop = Object.values(mats).filter(m => m.workshop).map(m => ({item: m.item, name: m.name, alts: alts(m.item)}));
    return {buildings, materials: sortMaterials(Object.values(mats), "qty"), specials, points, missing, workshop, workshopName: sn("workshop")};
  }
  const sortMaterials = (m, by) => [...m].sort(by === "points" ? (a, b) => b.points - a.points || b.qty - a.qty || a.name.localeCompare(b.name) : (a, b) => b.qty - a.qty || b.points - a.points || a.name.localeCompare(b.name));
  // «se fabrica en el Equipment Workshop (o con la alternativa «X» en Y)»
  const workshopText = (c, w) => `se fabrica en el ${c.workshopName}` + (w.alts.length ? ` (o con ${w.alts.map(a => `${a.alt ? "la alternativa " : "la receta "}«${a.recipe}» en ${a.building}`).join(" o ")})` : "");
  const pctTxt = p => p > 0 && p < 0.05 ? "< 0,1 %" : nf(p, 1) + " %";  // sin «0 %» engañoso para edificios baratos
  const listTxt = l =>l.map(x => `${nf(x.qty, 0)} ${x.name}`).join(" · ");

  function costMarkdown(c, factory) {
    const W = new Set(c.workshop.map(w => w.item)), mk = m => mdCell(m.name) + (W.has(m.item) ? "¹" : "");
    const out = ["", `## Coste de construcción de la fábrica «${mdCell(factory)}»`, "", NOTE.units, "", "### Materiales totales", "",
      "| Material | Cantidad | Puntos del Sink |", "|---|--:|--:|"];
    for (const m of c.materials) out.push(`| ${mk(m)} | ${nf(m.qty, 0)} | ${nf(m.points, 0)} |`);
    out.push(`| **Total** | | **${nf(c.points, 0)}** |`, "", "### Por tipo de edificio", "",
      "| Sección | Edificio | Unidades | Coste unitario | Coste total | Puntos del Sink | % |", "|---|---|--:|---|---|--:|--:|");
    for (const b of c.buildings) out.push(`| ${b.section} | ${mdCell(b.name)} | ${nf(b.units, 0)} | ${mdCell(listTxt(b.unit))} | ${mdCell(listTxt(b.total))} | ${nf(b.points, 0)} | ${pctTxt(b.pct)} |`);
    out.push("", "### Materiales especiales", "", "| Material | Cantidad |", "|---|--:|");
    for (const s of c.specials) out.push(`| ${mdCell(s.name)} | ${nf(s.qty, 0)} |`);
    out.push("");
    for (const w of c.workshop) out.push(`¹ ${mdCell(w.name)}: ${mdCell(workshopText(c, w))}.`);
    out.push(NOTE.points, NOTE.specials, NOTE.excluded);
    return out.join("\n") + "\n";
  }
  const COST_COLS = ["Fábrica", "Sección", "Edificio", "Unidades", "Material", "Por edificio", "Total", "Puntos del Sink", "Observación"];
  function costCsv(c, factory) {
    const W = new Map(c.workshop.map(w => [w.item, workshopText(c, w)])), rows = [COST_COLS];
    for (const b of c.buildings) b.unit.forEach((u, k) => { const t = b.total[k]; rows.push([factory, b.section, b.name, b.units, u.name, u.qty, t.qty, t.points, W.get(u.item) || ""]); });
    for (const s of c.specials) rows.push([factory, "Especiales", "", "", s.name, "", s.qty, "", "colocados en las máquinas"]);
    return rows.map(r => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
  }

  const CSV_COLS = ["Sección", "Edificio", "Producto", "Receta", "Alternativa", "Producción", "Unidad", "Máquinas exactas", "Unidades", "Reloj real %", "Fragmentos", "Somersloops", "MW"];
  function csv(rep) {
    const rows = [CSV_COLS];
    for (const s of rep.sections) for (const b of s.buildings) for (const l of b.lines)
      rows.push([s.title, b.name, l.product, l.recipe, l.alt ? "sí" : "no", num(l.rate), l.unit, num(l.x), l.units, num(l.uclock * 100, 2), l.shards, l.sloops, num(l.mw, 2)]);
    return rows.map(r => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
  }

  // nombre de archivo: sin / \ : * ? " < > | ni caracteres de control; vacío -> «fabrica»
  const fileName = (name, ext, kind = "maquinas") => (String(name ?? "").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "").trim() || "fabrica") + "_" + kind + "." + ext;

  return {breakdown, markdown, csv, fileName, mdCell, csvCell, CSV_COLS, cost, costCsv, COST_COLS, sortMaterials, workshopText, pctTxt, NOTE};
})();
if (typeof module !== "undefined") module.exports = Report;
