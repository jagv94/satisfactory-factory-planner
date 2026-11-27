// node tests/test_engine.js  — pruebas del motor
const fs = require("fs"), path = require("path");
const E = require("../src/engine.js");
const db = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/satisfactory_db.json"), "utf8"));
E.init(db);
let fails = 0; const ok = (c, m) => { console.log((c ? "  ok  " : "  FALLO ") + m); if (!c) fails++; };
const cfg = {clock: 1, ext: {}, locked: {}, limits: {}};
const plan = (o = {}) => Object.assign({targets: [], sel: {}, rc: {}, mode: "manual"}, o);
const byEn = {}; for (const [k, v] of Object.entries(db.items)) byEn[v.en] = k;
const id = n => byEn[n] || byEn[n + "s"];
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));

// 1) simplex básico: min x+y s.a. x+2y>=4, 3x+y>=6 -> x=1.6,y=1.2
let r = E.simplex(2, [1, 1], [{a: {0: 1, 1: 2}, op: ">=", b: 4}, {a: {0: 3, 1: 1}, op: ">=", b: 6}]);
ok(r.status === "ok" && near(r.x[0], 1.6) && near(r.x[1], 1.2), "simplex pequeño");
r = E.simplex(1, [-1], [{a: {0: 1}, op: ">=", b: 1}]); ok(r.status === "unbounded", "simplex detecta no acotado");
r = E.simplex(1, [1], [{a: {0: 1}, op: "<=", b: 1}, {a: {0: 1}, op: ">=", b: 2}]); ok(r.status === "infeasible", "simplex detecta infactible");

// 2) manual vs Excel v2 (mismos objetivos y recetas por defecto)
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, "excel_ref.json"), "utf8"));
const tg = Object.entries(ref).filter(([k, v]) => v[0] > 0).map(([k, v]) => ({item: id(k), rate: v[0]}));
ok(tg.every(t => t.item), "todos los objetos del Excel existen en la BD del juego");
let a = E.analyze(cfg, E.solveManual(cfg, plan(), tg)), bad = 0;
for (const [k, v] of Object.entries(ref)) { const b = a.balance[id(k)]; const p = b ? b.prod : 0; if (!near(p, v[1], 1e-6)) { bad++; console.log("     dif", k, p, v[1]); } }
ok(bad === 0, "manual = Excel v2 en los 71 objetos");

// 3) fase 5 manual sin déficits; Non-Fissile Uranium ahora da agua
const f5 = db.presets["Fase 5 del Space Elevator"].map(item => ({item, rate: 1}));
const am = E.analyze(cfg, E.solveManual(cfg, plan(), f5));
ok(!am.error && Object.values(am.balance).every(b => b.net > -1e-6), "fase 5 manual sin déficits");
// 4) optimizador: con todas las recetas nunca peor que manual en recursos ponderados
const ao = E.analyze(cfg, E.solveOpt(cfg, plan({mode: "opt"}), f5));
ok(!ao.error && Object.values(ao.balance).every(b => b.net > -1e-6), "fase 5 optimizada factible");
ok(ao.score <= am.score + 1e-9, `optimizado (${ao.score.toFixed(4)}) <= manual (${am.score.toFixed(4)})`);
// 5) optimizador restringido a las recetas por defecto = manual (caso sin subproductos)
const st = [{item: id("Heavy Modular Frame"), rate: 3}, {item: id("Computer"), rate: 0}];
const man = E.solveManual(cfg, plan(), st);
const ban = {}; for (const rr of db.recipes) ban[rr.id] = true;
for (const s of man.steps) if (s.p.kind === "recipe") delete ban[s.p.id];
const ar = E.analyze(cfg, E.solveOpt(cfg, plan({mode: "opt", ban}), st)), am2 = E.analyze(cfg, man);
ok(Object.keys(am2.balance).every(k => near(am2.balance[k].prod, ar.balance[k].prod, 1e-6)), "optimizador limitado a recetas por defecto = manual");
// 6) máximo con límites: 480 hierro/min -> placas
const cfg2 = Object.assign({}, cfg, {limits: {Desc_OreIron_C: 480}});
const am3 = E.analyze(cfg2, E.solveOpt(cfg2, plan({mode: "opt", maximize: true, ban: Object.fromEntries(db.recipes.filter(x => !["Recipe_IronPlate_C", "Recipe_IngotIron_C"].includes(x.id)).map(x => [x.id, true]))}), [{item: id("Iron Plate"), rate: 1}]));
ok(near(am3.d[id("Iron Plate")], 320, 1e-6), `máximo: 480 mineral -> ${am3.d[id("Iron Plate")]} placas (esperado 320)`);
// 7) Somersloops y reloj: Assembler con 2 sloops dobla salida y x4 potencia
const pr = E.proc(cfg, plan({rc: {Recipe_IronPlateReinforced_C: {clock: 1, sloops: 2}}}), "Recipe_IronPlateReinforced_C");
ok(near(pr.out[id("Reinforced Iron Plate")], 10) && near(pr.power, 60), "Somersloop: x2 salida, x4 potencia");
const pr2 = E.proc(cfg, plan({rc: {Recipe_IronPlateReinforced_C: {clock: 2.5}}}), "Recipe_IronPlateReinforced_C");
ok(near(pr2.power, 15 * Math.pow(2.5, 1.321929)) && E.shards(2.5) === 3, "overclock 250 %: potencia y 3 fragmentos");
// 8) bucle de empaquetado detectado
const ac = E.solveManual(cfg, plan({sel: {Desc_Water_C: db.recipes.find(x => x.en === "Unpackage Water").id}}), [{item: id("Packaged Water"), rate: 10}]);
ok(ac.error === "cycle", "bucle empaquetar/desempaquetar detectado");
// 9) todos los objetos producibles resuelven por defecto
let probs = [];
for (const k of Object.keys(db.items)) { const s = E.analyze(cfg, E.solveManual(cfg, plan(), [{item: k, rate: 1}])); if (s.error || Object.values(s.balance).some(b => b.net < -1e-6)) probs.push(db.items[k].en); }
// 10) sin baneos, el Converter permite superar el límite de hierro (mineral desde caliza)
const am4 = E.analyze(cfg2, E.solveOpt(cfg2, plan({mode: "opt", maximize: true}), [{item: id("Iron Plate"), rate: 1}]));
ok(am4.error === "unbounded", "máximo sin límite en caliza -> no acotado (Converter)");
ok(probs.length === 0, "todos los objetos se resuelven por defecto" + (probs.length ? ": " + probs.join(", ") : ""));

// ---------- energía
const PW = E.POWER, R = Object.fromEntries(db.recipes.map(x => [x.id, x]));
// 11) consumo de combustible por generador (al 100 %), calculado desde los Docs
const GEN = {Gen_Desc_Coal_C: [75, {Desc_Coal_C: 15, Desc_Water_C: 45}, {}], Gen_Desc_CompactedCoal_C: [75, {Desc_CompactedCoal_C: 7.142857, Desc_Water_C: 45}, {}],
  Gen_Desc_PetroleumCoke_C: [75, {Desc_PetroleumCoke_C: 25, Desc_Water_C: 45}, {}], Gen_Desc_LiquidFuel_C: [250, {Desc_LiquidFuel_C: 20}, {}],
  Gen_Desc_LiquidTurboFuel_C: [250, {Desc_LiquidTurboFuel_C: 7.5}, {}], Gen_Desc_LiquidBiofuel_C: [250, {Desc_LiquidBiofuel_C: 20}, {}],
  Gen_Desc_RocketFuel_C: [250, {Desc_RocketFuel_C: 4.166667}, {}], Gen_Desc_IonizedFuel_C: [250, {Desc_IonizedFuel_C: 3}, {}],
  Gen_Desc_GenericBiomass_C: [30, {Desc_GenericBiomass_C: 10}, {}], Gen_Desc_Biofuel_C: [30, {Desc_Biofuel_C: 4}, {}], Gen_Desc_Wood_C: [30, {Desc_Wood_C: 18}, {}],
  Gen_Desc_Leaves_C: [30, {Desc_Leaves_C: 120}, {}], Gen_Desc_Mycelia_C: [30, {Desc_Mycelia_C: 90}, {}], Gen_Desc_PackagedBiofuel_C: [30, {Desc_PackagedBiofuel_C: 2.4}, {}],
  Gen_Desc_NuclearFuelRod_C: [2500, {Desc_NuclearFuelRod_C: 0.2, Desc_Water_C: 240}, {Desc_NuclearWaste_C: 10}],
  Gen_Desc_PlutoniumFuelRod_C: [2500, {Desc_PlutoniumFuelRod_C: 0.1, Desc_Water_C: 240}, {Desc_PlutoniumWaste_C: 1}],
  Gen_Desc_FicsoniumFuelRod_C: [2500, {Desc_FicsoniumFuelRod_C: 1, Desc_Water_C: 240}, {}]};
let genBad = [];
for (const [gid, [mw, ins, waste]] of Object.entries(GEN)) {
  const g = R[gid];
  const good = g && near(g.out[PW], mw) && Object.keys(g.in).length === Object.keys(ins).length && Object.entries(ins).every(([k, v]) => near(g.in[k], v, 1e-6))
    && Object.keys(g.out).length === 1 + Object.keys(waste).length && Object.entries(waste).every(([k, v]) => near(g.out[k], v, 1e-6));
  if (!good) genBad.push(gid);
}
ok(!genBad.length && db.recipes.filter(x => E.isGen(x)).length === Object.keys(GEN).length, "consumo de combustible de los 17 generadores (incluida la barra de ficsonio)" + (genBad.length ? ": " + genBad.join(", ") : ""));
// 12) generador con overclock: potencia y combustible lineales, 3 fragmentos
const pg = E.proc(cfg, plan({rc: {Gen_Desc_Coal_C: {clock: 2.5}}}), "Gen_Desc_Coal_C");
ok(near(pg.out[PW], 187.5) && near(pg.in.Desc_Coal_C, 37.5) && near(pg.power, -187.5), "generador al 250 %: 187,5 MW y 37,5 carbón/min");
// 13) «solo informar»: ninguna máquina consume Power_MW (resultados como antes)
const offR = E.solveOpt(cfg, plan({mode: "opt"}), f5);
ok(offR.steps.every(s => !(PW in s.p.in)) && !offR.steps.some(s => E.isGen(s.p.recipe || {building: ""})), "solo informar: sin consumo de energía ni generadores");
// cuadre de energía: la generación del plan cubre el consumo del plan (LP) y el consumo real (máquinas enteras) no lo supera
const closes = A => near(A.balance[PW].net, 0, 1e-6) && A.energy.balance >= -1e-6 && A.energy.cons <= A.balance[PW].cons + 1e-6;
// 14) circular: placas con generadores de carbón que alimentan sus propios mineros y extractores de agua
const pc = E.solveManual(cfg, plan({energy: "gen"}), [{item: id("Iron Plate"), rate: 60}]), apc = E.analyze(cfg, pc);
const gx = pc.steps.find(s => s.p.id === "Gen_Desc_Coal_C");
const consLP = pc.steps.reduce((a, s) => a + s.x * (s.p.in[PW] || 0), 0);
ok(gx && near(gx.x * 75, consLP, 1e-9) && near(apc.balance.Desc_Coal_C.prod, gx.x * 15, 1e-9) && closes(apc), `manual con carbón: ${gx ? gx.x.toFixed(3) : "?"} generadores cubren su propia cadena`);
// 15) manual y optimizador cuadran en los tres criterios; «mínima potencia» no consume más que «recursos»
const am5 = E.analyze(cfg, E.solveManual(cfg, plan({energy: "gen"}), f5));
ok(!am5.error && closes(am5) && Object.values(am5.balance).every(b => b.net > -1e-6), "fase 5 manual con energía: cuadra y sin déficits");
const eo = {};
for (const o of ["weighted", "power", "machines"]) { eo[o] = E.analyze(cfg, E.solveOpt(cfg, plan({mode: "opt", energy: "gen", objective: o}), f5)); }
ok(Object.values(eo).every(A => !A.error && closes(A) && Object.values(A.balance).every(b => b.net > -1e-6)), "fase 5 optimizada con energía: cuadra en los tres criterios");
ok(eo.power.balance[PW].cons <= eo.weighted.balance[PW].cons + 1e-6 && eo.power.balance[PW].cons <= eo.machines.balance[PW].cons + 1e-6,
  `mínima potencia consume menos (${eo.power.balance[PW].cons.toFixed(0)} MW) que recursos (${eo.weighted.balance[PW].cons.toFixed(0)}) y máquinas (${eo.machines.balance[PW].cons.toFixed(0)})`);
// 16) energía externa: se descuenta de lo que hay que generar
const eg = E.analyze(cfg, E.solveOpt(cfg, plan({mode: "opt", energy: "gen", gridMW: 3000}), f5));
ok(!eg.error && near(eg.balance[PW].prod + 3000, eg.balance[PW].cons, 1e-6) && eg.energy.grid === 3000 && eg.energy.balance >= -1e-6, "energía externa (3000 MW) descontada de la generación");
const egM = E.analyze(cfg, E.solveManual(cfg, plan({energy: "gen", gridMW: 1e6}), f5));
ok(!egM.error && egM.energy.gen === 0 && egM.energy.balance > 0, "manual: si la energía externa lo cubre todo, no hay generadores");
// 17) excluir las recetas nucleares evita los residuos
const banN = {Gen_Desc_NuclearFuelRod_C: true, Gen_Desc_PlutoniumFuelRod_C: true, Gen_Desc_FicsoniumFuelRod_C: true};
const en = E.analyze(cfg, E.solveOpt(cfg, plan({mode: "opt", energy: "gen", objective: "machines", ban: banN}), f5));
ok(!en.error && closes(en) && !en.rows.some(r => r.p.id in banN) && !((en.balance.Desc_NuclearWaste_C || {}).prod > 0), "sin recetas nucleares: sin residuos y cuadra");
// 18) planta de energía como objetivo (con «solo informar»): 1000 MW de carbón = 13,33 generadores
const pp = E.solveManual(cfg, plan(), [{item: PW, rate: 1000}]);
ok(near(pp.steps.find(s => s.p.id === "Gen_Desc_Coal_C").x, 1000 / 75), "objetivo 1000 MW: 13,33 generadores de carbón");
// 19) Pressurizers: vacíos -> aviso y sin coste; con pozos -> 150 MW cada uno y reparto proporcional exacto en el cálculo
const nitric = [{item: "Desc_NitricAcid_C", rate: 30}];
const w0 = E.analyze(cfg, E.solveOpt(cfg, plan({mode: "opt", energy: "gen"}), nitric));
ok(w0.energy.missingWells.includes("Desc_NitrogenGas_C") && w0.energy.pressMW === 0 && w0.rows.every(r => !r.p.pshare), "pozos sin indicar: aviso y sin Pressurizers");
const cfgW = Object.assign({}, cfg, {ext: {Desc_NitrogenGas_C: {wells: 2, clock: 1.5}}});
const pz = 2 * 150 * Math.pow(1.5, db.extractors.well.pressurizerExp);
for (const [lbl, res] of [["optimizador", E.solveOpt(cfgW, plan({mode: "opt", energy: "gen"}), nitric)], ["manual", E.solveManual(cfgW, plan({energy: "gen"}), nitric)]]) {
  const A = E.analyze(cfgW, res), lp = res.steps.filter(s => s.p.ext === "well").reduce((a, s) => a + s.x * s.p.pshare, 0);
  ok(!A.error && near(A.energy.pressMW, pz) && near(lp, pz, 1e-6) && closes(A), `Pressurizers (${lbl}): 2 pozos al 150 % = ${pz.toFixed(1)} MW, repartidos entre los extractores`);
}
// 20) con «solo informar», los Pressurizers indicados también suman al consumo
const wOff = E.analyze(cfgW, E.solveManual(cfgW, plan(), nitric));
ok(near(wOff.energy.pressMW, pz) && wOff.energy.cons >= pz, "solo informar: los Pressurizers indicados suman al consumo");
// 21) punto fijo de los Pressurizers: acotado; si no cuadra en el límite, error "press" sin pasos (nunca un resultado a medias)
for (const [lbl, solve, pl] of [["optimizador", E.solveOpt, plan({mode: "opt", energy: "gen"})], ["manual", E.solveManual, plan({energy: "gen"})]]) {
  const okR = solve(cfgW, pl, nitric), bad = solve(cfgW, Object.assign({}, pl, {_pressMax: 0}), nitric), Ab = E.analyze(cfgW, bad);
  ok(okR.pressIter >= 1 && okR.pressIter <= 12 && bad.error === "press" && !bad.steps.length && Ab.error === "press" && !Ab.rows.length,
    `Pressurizers (${lbl}): cuadra en ${okR.pressIter} vuelta(s); forzando el límite a 0 da el error «press» sin resultado`);
}
// regresión: con «mínima potencia» el optimizador dejaba de usar los pozos y el criterio antiguo oscilaba 12 vueltas
// y devolvía un reparto incoherente (balance de −293 MW). Un fluido sin extractores de pozo ya es coherente.
const cfgW2 = Object.assign({}, cfg, {ext: {Desc_NitrogenGas_C: {wells: 2}, Desc_LiquidOil_C: {wells: 1, clock: 2}}});
const rP = E.solveOpt(cfgW2, plan({mode: "opt", energy: "gen", objective: "power"}), nitric), AP = E.analyze(cfgW2, rP);
const cohP = ["Desc_NitrogenGas_C", "Desc_LiquidOil_C"].every(i => { const st = rP.steps.filter(s => s.p.ext === "well" && s.p.item === i), x = st.reduce((a, s) => a + s.x, 0);
  return x <= 1e-9 || near(st.reduce((a, s) => a + s.x * (s.p.pshare || 0), 0), E.pressPower(cfgW2, i), 1e-6); });
ok(!rP.error && rP.pressIter <= 12 && cohP && closes(AP), `Pressurizers: nítrico con «mínima potencia» converge (${rP.pressIter} vuelta(s)) y cuadra`);

// ---------- desglose de máquinas (src/report.js)
let csvParse, numCol;
{
  const Rep = require("../src/report.js");
  const cfgN = Object.assign({}, cfg, {ext: {Desc_NitrogenGas_C: {wells: 2}}});
  const cases = [["fase 5 optimizada con energía y pozos", cfgN, E.solveOpt(cfgN, plan({mode: "opt", energy: "gen"}), f5)],
    ["fase 5 manual con energía y pozos", cfgN, E.solveManual(cfgN, plan({energy: "gen"}), f5)], ["fase 5 manual sin energía", cfg, E.solveManual(cfg, plan(), f5)]];
  csvParse = s => s.replace(/\r\n$/, "").split("\r\n").map(line => { const f = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ";") { f.push(cur); cur = ""; } else cur += c; }
    f.push(cur); return f; });
  numCol = v => v === "" || /^-?\d+(,\d+)?$/.test(v);
  for (const [lbl, c, res] of cases) {
    const A = E.analyze(c, res), rep = Rep.breakdown(A, {db, lang: "es", cfg: c, engine: E});
    const B = rep.sections.flatMap(s => s.buildings), L = B.flatMap(b => b.lines);
    // 24) una línea por proceso con máquinas (+ una por fluido con Pressurizers); unidades del edificio = suma de sus líneas = recuento directo
    const procs = A.rows.filter(r => r.build && r.p.building), press = A.energy.press.filter(p => p.wells);
    const direct = {}; for (const r of procs) { const k = r.p.kind === "extract" ? r.p.bname.es : r.p.b.es; direct[k] = (direct[k] || 0) + r.build; }
    for (const p of press) { const k = db.extractors.well.pressurizerName.es; direct[k] = (direct[k] || 0) + p.wells; }
    ok(L.length === procs.length + press.length && B.every(b => b.units === b.lines.reduce((a, l) => a + l.units, 0) && b.units === direct[b.name]) && B.length === Object.keys(direct).length,
      `desglose (${lbl}): una línea por receta y las unidades de cada edificio cuadran (${B.length} edificios, ${L.length} líneas)`);
    // 25) totales: unidades, y MW de producción + extracción = consumo real de la pestaña Energía
    const consB = rep.sections.filter(s => s.key !== "gen").flatMap(s => s.buildings).reduce((a, b) => a + b.mw, 0);
    ok(rep.total.units === B.reduce((a, b) => a + b.units, 0) && near(consB, A.energy.cons, 1e-9) && near(rep.total.cons, A.energy.cons) && near(rep.total.gen, A.energy.gen),
      `desglose (${lbl}): ${rep.total.units} máquinas; MW de producción y extracción = consumo (${A.energy.cons.toFixed(1)} MW)`);
    // 26) secciones y orden: cada línea en su sección; edificios y líneas de más a menos unidades
    const kinds = {prod: ["recipe"], ext: ["extract", "press"], gen: ["gen"]};
    ok(rep.sections.every(s => s.buildings.every(b => b.lines.every(l => kinds[s.key].includes(l.kind)))) && rep.sections.every(s => s.buildings.every((b, i, a) => !i || a[i - 1].units >= b.units))
      && B.every(b => b.lines.every((l, i, a) => !i || a[i - 1].units >= l.units)) && rep.sections.map(s => s.key).join() === ["prod", "ext", "gen"].filter(k => rep.sections.some(s => s.key === k)).join(),
      `desglose (${lbl}): secciones ${rep.sections.map(s => s.title).join(", ")}; edificios y líneas ordenados por unidades`);
    // 27) CSV: cabecera, una fila por línea, 13 columnas, números con coma decimal y sin BOM (el BOM solo va en la descarga)
    const csv = Rep.csv(rep), rows = csvParse(csv);
    ok(csv[0] !== "\ufeff" && rows[0].join() === Rep.CSV_COLS.join() && rows.length === L.length + 1 && rows.every(r => r.length === 13) && rows.slice(1).every(r => [5, 7, 8, 9, 10, 11, 12].every(k => numCol(r[k]))),
      `CSV (${lbl}): ${rows.length - 1} filas de 13 columnas en formato español`);
    // 28) Markdown: una sección por grupo, una tabla por edificio, 8 celdas por fila
    const md = Rep.markdown(rep, "Fase 5"), mdRows = md.split("\n").filter(x => x.startsWith("| ") && !x.startsWith("| Sección") && !x.startsWith("| Producto"));
    const cells = x => x.replace(/\\\\/g, "").split(/(?<!\\)\|/).length - 2;
    ok((md.match(/^### /gm) || []).length === B.length && rep.sections.every(s => md.includes(`\n## ${s.title}\n`)) && (md.match(/^\| Producto \|/gm) || []).length === B.length
      && mdRows.filter(x => cells(x) === 8).length === L.length + B.filter(b => b.lines.length > 1).length,
      `Markdown (${lbl}): ${B.length} tablas, una por edificio`);
  }
  // 29) contenido: mezcla de recetas, generadores, Pressurizers y pureza de los extractores
  const Ao = E.analyze(cfgN, cases[0][2]), ro = Rep.breakdown(Ao, {db, lang: "es", cfg: cfgN, engine: E}), Lo = ro.sections.flatMap(s => s.buildings.flatMap(b => b.lines));
  const cnt = {}; for (const l of Lo) if (l.kind === "recipe") cnt[l.item] = (cnt[l.item] || 0) + 1;
  const mixed = Object.keys(cnt).filter(i => cnt[i] > 1);
  ok(mixed.length > 0, `optimizador: un producto con dos recetas sale en dos líneas (${mixed.map(i => db.items[i].es).join(", ")})`);
  const Am = E.analyze(cfgN, cases[1][2]), rm = Rep.breakdown(Am, {db, lang: "es", cfg: cfgN, engine: E}), Lm = rm.sections.flatMap(s => s.buildings.flatMap(b => b.lines));
  const pl = Lm.find(l => l.kind === "press"), gl = Lm.filter(l => l.kind === "gen"), wl = Lm.find(l => l.kind === "extract" && l.item === "Desc_Water_C"), ml = Lm.find(l => l.kind === "extract" && l.item === "Desc_OreIron_C");
  ok(pl && pl.item === "Desc_NitrogenGas_C" && pl.recipe === "2 pozos" && pl.units === 2 && near(pl.mw, 300) && gl.length && gl.every(l => l.recipe === "→ Energía" && l.mw < 0 && l.item === "Desc_Coal_C")
    && wl && wl.recipe === "–" && ml && ml.recipe === "Pureza normal", "líneas especiales: Pressurizers (2 pozos, 300 MW), generadores de carbón (+MW), agua sin pureza y mineral con la pureza configurada");
  // 30) escapes y nombre de archivo
  ok(Rep.mdCell("a|b\\c\nd") === "a\\|b\\\\c d" && Rep.csvCell("a;b") === '"a;b"' && Rep.csvCell('di "x"') === '"di ""x"""' && Rep.csvCell("ok") === "ok" && Rep.csvCell("1\n2") === '"1\n2"',
    "escapes de Markdown (| y \\) y CSV (; comillas y saltos de línea)");
  ok(Rep.fileName('  Fase 5: <hierro>/"acero"?*|\\  ', "md") === "Fase 5 hierroacero_maquinas.md" && Rep.fileName(" :/*?  ", "csv") === "fabrica_maquinas.csv" && Rep.fileName("", "md") === "fabrica_maquinas.md" && Rep.fileName(null, "csv") === "fabrica_maquinas.csv",
    "nombre de archivo sin / \\ : * ? \" < > | ni espacios sobrantes; vacío -> «fabrica»");
}

// ---------- coste de construcción (src/report.js + db.buildCosts)
{
  const Rep = require("../src/report.js"), BC = db.buildCosts, X = db.extractors;
  // 32) datos: una receta de la Build Gun por edificio que usa el planificador
  const classes = [...Object.keys(db.buildings), ...Object.values(X.miner.tiers).map(t => t.id), X.water.id, X.oil.id, X.well.id, X.well.pressurizerId];
  const same = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b).sort());
  ok(classes.length === 22 && classes.every(c => BC[c] && Object.keys(BC[c]).length && Object.keys(BC[c]).every(i => db.items[i] && Number.isInteger(BC[c][i])))
    && same(BC.Build_ConstructorMk1_C, {Desc_IronPlateReinforced_C: 2, Desc_Cable_C: 8}) && BC.Build_MinerMk3_C.BP_ItemDescriptorPortableMiner_C === 3
    && same(BC.Build_FrackingSmasher_C, {Desc_ModularFrameLightweight_C: 10, Desc_ModularFrameHeavy_C: 25, Desc_Motor_C: 50, Desc_AluminumPlate_C: 50, Desc_Rubber_C: 100}),
    "costes de construcción de los 22 edificios (Constructor, Miner Mk.3, Pressurizer comprobados)");
  // 33) Taladro portátil: su receta estándar es del Equipment Workshop (no entra en el planificador); la alternativa de la Ensambladora sí
  const pm = "BP_ItemDescriptorPortableMiner_C", pmR = db.recipes.filter(r => r.out[pm]);
  ok(db.items[pm].workshop === true && !db.recipes.some(r => r.id === "Recipe_PortableMiner_C") && pmR.length === 1 && pmR[0].id === "Recipe_Alternate_AutomatedMiner_C" && pmR[0].building === "Build_AssemblerMk1_C" && pmR[0].alt
    && Object.keys(db.items).filter(i => db.items[i].workshop).join() === pm,
    "Taladro portátil: marcado como del Equipment Workshop; en el planificador solo su alternativa de la Ensambladora");
  // 34) unidades enteras: cada fila se redondea hacia arriba, también con reloj reducido
  const frac = (rate, clock) => { const res = E.solveManual(cfg, plan({rc: {Recipe_IronPlate_C: {clock}}}), [{item: "Desc_IronPlate_C", rate}]), A = E.analyze(cfg, res);
    const rep = Rep.breakdown(A, {db, lang: "es", cfg, engine: E}), c = Rep.cost(rep, {db, lang: "es"}), row = A.rows.find(r => r.p.id === "Recipe_IronPlate_C");
    const b = c.buildings.find(x => x.cls === "Build_ConstructorMk1_C"); return {x: row.x, build: row.build, units: b.units, rip: b.total.find(t => t.item === "Desc_IronPlateReinforced_C").qty, cable: b.total.find(t => t.item === "Desc_Cable_C").qty, A, c}; };
  const f1 = frac(15, 0.5), f2 = frac(10, 0.5), f3 = frac(10, 1);
  ok(near(f1.x, 1.5) && f1.build === 2 && f1.units === 2 && f1.rip === 4 && f1.cable === 16 && near(f2.x, 1) && f2.units === 1 && near(f3.x, 0.5) && f3.units === 1 && f3.rip === 2
    && [f1, f2, f3].every(f => f.A.rows.every(r => !r.build || r.build === Math.ceil(r.x - 1e-6))),
    "unidades enteras: 1,5 Constructors al 50 % → 2 (4 planchas reforzadas, 16 cables); 0,5 → 1; 1,0 exacto → 1");
  // 35) coherencia: materiales = suma por edificio = unidades × coste unitario; puntos y %; especiales = desglose
  const cfgN = Object.assign({}, cfg, {ext: {Desc_NitrogenGas_C: {wells: 2}}});
  const sloopP = plan({energy: "gen", rc: {Recipe_IronPlateReinforced_C: {clock: 2.5, sloops: 1}}});
  for (const [lbl, c0, res] of [["fase 5 optimizada con energía y pozos", cfgN, E.solveOpt(cfgN, plan({mode: "opt", energy: "gen"}), f5)],
    ["fase 5 manual con overclock y Somersloops", cfgN, E.solveManual(cfgN, sloopP, f5)]]) {
    const rep = Rep.breakdown(E.analyze(c0, res), {db, lang: "es", cfg: c0, engine: E}), c = Rep.cost(rep, {db, lang: "es"});
    const sum = {}; for (const b of c.buildings) for (const t of b.total) sum[t.item] = (sum[t.item] || 0) + t.qty;
    const units = rep.sections.flatMap(s => s.buildings).reduce((a, b) => a + b.units, 0);
    ok(!c.missing.length && c.buildings.length === rep.sections.flatMap(s => s.buildings).length && c.buildings.reduce((a, b) => a + b.units, 0) === units
      && c.buildings.every(b => b.unit.every((u, k) => b.total[k].item === u.item && b.total[k].qty === u.qty * b.units))
      && c.materials.length === Object.keys(sum).length && c.materials.every(m => m.qty === sum[m.item] && near(m.points, m.qty * db.items[m.item].sink))
      && near(c.points, c.materials.reduce((a, m) => a + m.points, 0)) && near(c.buildings.reduce((a, b) => a + b.pct, 0), 100, 1e-9)
      && c.specials[0].qty === rep.total.shards && c.specials[1].qty === rep.total.sloops,
      `coste (${lbl}): ${c.buildings.length} tipos de edificio, ${c.materials.length} materiales; suma, puntos, % y especiales (${rep.total.shards} fragmentos, ${rep.total.sloops} Somersloops) cuadran`);
    if (lbl.includes("Somersloops")) ok(rep.total.shards > 0 && rep.total.sloops > 0 && c.specials.map(x => x.name).join() === [db.specials.shard.es, db.specials.sloop.es].join(), "materiales especiales con overclock y Somersloops");
    // 36) exportación: capítulo de Markdown y CSV de materiales
    const md = Rep.markdown(rep, "Fase 5", c), ch = md.slice(md.indexOf("## Coste de construcción"));
    const matRows = ch.split("### Por tipo de edificio")[0].split("\n").filter(x => x.startsWith("| ") && !x.startsWith("| Material") && !x.startsWith("| **Total"));
    ok(md.includes("\n## Coste de construcción de la fábrica «Fase 5»\n") && [Rep.NOTE.units, Rep.NOTE.points, Rep.NOTE.specials, Rep.NOTE.excluded].every(n => ch.includes(n))
      && matRows.length === c.materials.length && ch.includes("| Taladro portátil¹ |") && ch.includes("¹ Taladro portátil: se fabrica en el Taller de equipamiento"),
      `Markdown con el coste (${lbl}): capítulo de la fábrica, ${matRows.length} materiales, notas y marca del Equipment Workshop`);
    const rows = csvParse(Rep.costCsv(c, "Fase 5"));
    ok(rows[0].join() === Rep.COST_COLS.join() && rows.length === 1 + c.buildings.reduce((a, b) => a + b.unit.length, 0) + 2 && rows.every(r => r.length === 9) && rows.slice(1).every(r => r[0] === "Fase 5")
      && rows.slice(1).every(r => [3, 5, 6, 7].every(k => numCol(r[k]))) && rows.filter(r => r[4] === "Taladro portátil").every(r => r[8].startsWith("se fabrica en el Taller de equipamiento"))
      && rows.slice(-2).every(r => r[1] === "Especiales"),
      `CSV de materiales (${lbl}): ${rows.length - 1} filas de 9 columnas con la fábrica, observación del Workshop y especiales`);
  }
  // 37) orden de materiales y nombre de archivo
  const cs = Rep.cost(Rep.breakdown(E.analyze(cfg, E.solveManual(cfg, plan(), f5)), {db, lang: "es", cfg, engine: E}), {db, lang: "es"});
  const byP = Rep.sortMaterials(cs.materials, "points"), byQ = Rep.sortMaterials(cs.materials, "qty");
  ok(byP.every((m, i) => !i || byP[i - 1].points >= m.points) && byQ.every((m, i) => !i || byQ[i - 1].qty >= m.qty) && byP[0].item !== byQ[0].item
    && Rep.pctTxt(0.01) === "< 0,1 %" && Rep.pctTxt(0) === "0 %" && Rep.pctTxt(27.34) === "27,3 %"
    && Rep.fileName("Fase 5: x", "csv", "materiales") === "Fase 5 x_materiales.csv" && Rep.fileName("", "csv", "materiales") === "fabrica_materiales.csv",
    `orden por cantidad (${cs.materials.length ? byQ[0].name : "?"}) o por puntos (${cs.materials.length ? byP[0].name : "?"}); % «< 0,1 %» para edificios baratos; archivo <fábrica>_materiales.csv`);
}

// ---------- asesor de alternativas (src/advisor.js)
{
  const Rep = require("../src/report.js"), Adv = require("../src/advisor.js"), o = {db, engine: E, report: Rep};
  const alts = db.recipes.filter(r => r.alt).map(r => r.id), lockAll = () => Object.fromEntries(alts.map(a => [a, true]));
  const half = () => Object.fromEntries(alts.filter((a, i) => i % 2).map(a => [a, true]));
  const C = (locked, x) => Object.assign({clock: 1, ext: {}, limits: {}, locked}, x || {});
  const P = (targets, x) => Object.assign({targets, sel: {}, rc: {}, mode: "opt", objective: "weighted", ban: {}}, x || {});
  const plates = [{item: "Desc_IronPlate_C", rate: 60}], resin = [{item: "Desc_PolymerResin_C", rate: 100}];
  const rowOf = (j, rid) => j.rows.find(r => r.id === rid);
  const PURE = "Recipe_Alternate_PureIronIngot_C", COMP = "Recipe_Alternate_Computer_1_C", HOR = "Recipe_Alternate_HeavyOilResidue_C", DIL = "Recipe_Alternate_DilutedFuel_C";
  const cResin = C(lockAll()); delete cResin.locked.Recipe_Alternate_PolymerResin_C;
  // sin el Converter (convierte unas materias primas en otras): con un solo límite, maximizar no tendría techo
  const noConv = Object.fromEntries(db.recipes.filter(r => db.buildings[r.building].en === "Converter").map(r => [r.id, true]));

  // 38) el optimizador devuelve el valor del criterio (obj): coincide con el coste recalculado desde la solución (c·x)
  const cx = (objective, res) => res.steps.reduce((v, {p: q, x}) => { const raw = q.kind === "extract" || q.kind === "manual" ? q.out[q.item] * E.rawWeight(q.item) : 0, pw = Math.max(0, q.power), m = q.kind === "recipe" ? 1 : 0;
    return v + x * (q.kind === "import" ? 1e-6 : objective === "power" ? pw + 1e-3 * raw + 1e-4 * m : objective === "machines" ? m + 1e-3 * raw + 1e-5 * pw : raw + 1e-4 * pw + 1e-3 * m); }, 0);
  const objOk = [["weighted", {}, {}], ["power", {energy: "gen"}, {}], ["machines", {energy: "gen"}, {ext: {Desc_NitrogenGas_C: {wells: 2}}}]].every(([ob, px, cx2]) => {
    const r = E.solveOpt(C({}, cx2), P(f5, Object.assign({objective: ob}, px))); return !r.error && near(r.obj, cx(ob, r), 1e-9); });
  ok(objOk, "motor: el valor del criterio devuelto (obj) = coste recalculado desde la solución, en los tres criterios (con energía y pozos)");
  // 39) caso claramente mejor: Lingote de hierro puro para placas con todo bloqueado
  const jp = Adv.run(Adv.prepare(o, C(lockAll()), P(plates), {mode: "cand"})), rp = rowOf(jp, PURE);
  ok(rp.state === "mejora" && rp.rel < -0.3 && rp.delta.score < 0 && rp.res.steps.some(s => s.p.id === PURE) && Adv.groups(jp).main[0].id === PURE,
    `asesor: Lingote de hierro puro mejora las placas (${(rp.rel * 100).toFixed(1)} % del criterio, ${rp.delta.score.toFixed(3)} puntos de % del mapa) y encabeza la lista`);
  // 40) no entra: una alternativa de Ordenador para placas se descarta sin resolver
  const rc = rowOf(jp, COMP);
  ok(rc.state === "noentra" && rc.why === "noentra" && rc.fast && !jp.queue.includes(rc) && !rc.res, "asesor: una alternativa de Ordenador no entra en una fábrica de placas (sin resolver)");
  // 41) subproducto: con todo bloqueado, la Sílice disuelta no tiene receta; «Cuarzo purificado» (alt) da Cristal de cuarzo
  // y Sílice disuelta como subproducto. Su producto principal no se alcanza, pero entra por el subproducto y hace posible el plan
  const QP = "Recipe_Alternate_Quartz_Purified_C", pSil = P([{item: "Desc_DissolvedSilica_C", rate: 100}]);
  const jsil = Adv.run(Adv.prepare(o, C(lockAll()), pSil, {mode: "cand"})), rq = rowOf(jsil, QP);
  ok(!E.reach(C(lockAll()), pSil).has(Object.keys(E.R[QP].out)[0]) && jsil.base.error === "infeasible" && jsil.queue.includes(rq) && rq.state === "viable" && rq.usedNew,
    "asesor: una alternativa que solo llega por su subproducto entra en el cálculo (y aquí hace posible el plan)");
  // entra pero no la usaría: «Residuo de petróleo pesado» (alt) en una fábrica de resina con «Resina de polímero» (alt)
  const jr = Adv.run(Adv.prepare(o, cResin, P(resin), {mode: "cand"})), rh = rowOf(jr, HOR);
  ok(jr.queue.includes(rh) && rh.state === "noaporta" && rh.why === "nolausa" && !rh.usedNew && Math.abs(rh.rel) <= Adv.TOL,
    "asesor: una alternativa que entra en el cálculo pero no se usaría sale «No aporta: no la usaría»");
  // 42) energía: «Combustible diluido» solo entra en una fábrica de placas si la energía se genera (generadores de combustible)
  const joff = Adv.run(Adv.prepare(o, C(lockAll()), P(plates), {mode: "cand"})), jgen = Adv.run(Adv.prepare(o, C(lockAll()), P(plates, {energy: "gen"}), {mode: "cand"}));
  ok(rowOf(joff, DIL).state === "noentra" && jgen.queue.includes(rowOf(jgen, DIL)) && rowOf(jgen, DIL).state !== "noentra",
    "asesor: con «generar», una alternativa de combustible entra por los generadores; con «solo informar», no entra");
  // 43) atajos frente a resolverlo todo: las descartadas sin resolver dan exactamente el mismo criterio al resolverlas
  // (incluye el caso con subproducto, el de energía generada y las activas sin uso de la Fase 5)
  const jact = Adv.run(Adv.prepare(o, C(half()), P(f5), {mode: "act"})), jf5 = Adv.run(Adv.prepare(o, C(half()), P(f5), {mode: "cand"}));
  let nFast = 0, badFast = [];
  for (const j of [jp, jsil, jr, jgen, jf5, jact]) for (const r of j.rows.filter(r => r.fast)) {
    nFast++;
    const res = E.solveOpt(Adv.setUnlocked(JSON.parse(JSON.stringify(j.cfg)), r.id, j.mode === "cand"), j.plan), v = Adv.crit(res, j.plan);
    // con la base sin solución, la descartada debe seguir sin solución (mismo error)
    if (j.base.error ? res.error !== j.base.error : res.error || !near(v, j.base.crit, 1e-9)) badFast.push(r.id + " " + (res.error || (v - j.base.crit)));
  }
  ok(nFast > 100 && !badFast.length, `asesor: los ${nFast} atajos dan el mismo criterio que resolverlas una a una` + (badFast.length ? " — " + badFast.slice(0, 3).join("; ") : ""));
  // 44) monotonía sin pozos: desbloquear nunca empeora el criterio, bloquear nunca lo mejora
  const evd = [jp, jr, joff, jgen, jf5].flatMap(j => j.rows.filter(r => r.rel != null));
  ok(evd.length > 200 && evd.every(r => r.rel <= 1e-9) && jact.rows.every(r => r.rel == null || r.rel >= -1e-9) && jact.rows.some(r => r.state === "importa") && jact.rows.some(r => r.state === "nouso"),
    "asesor: sin pozos, desbloquear nunca empeora y bloquear nunca mejora el criterio");
  // 45) con pozos (Pressurizers) no se mantiene: el punto fijo puede caer en otro reparto. Caso conocido: Fase 5, mínima potencia,
  // energía generada y 2 pozos de nitrógeno: bloquear alguna activa mejora un 0,4 %. La prueba admite un margen del 1 %
  // y comprueba que el asesor lo etiqueta como «Mejor sin ella» (con pozos, el atajo «no se usa» no se aplica)
  const cW = C(half(), {ext: {Desc_NitrogenGas_C: {wells: 2}}}), pW = P(f5, {energy: "gen", objective: "power"});
  const jw = Adv.run(Adv.prepare(o, cW, pW, {mode: "act"})), mw = Math.min(...jw.rows.filter(r => r.rel != null).map(r => r.rel));
  ok(jw.wells && !jw.rows.some(r => r.why === "sinuso" && r.fast) && mw < -Adv.TOL && mw > -0.01 && jw.rows.filter(r => r.rel < -Adv.TOL).every(r => r.state === "mejorsin"),
    `asesor: con pozos, bloquear puede mejorar algo el criterio (mínimo ${(mw * 100).toFixed(2)} %, margen 1 %) y se marca «Mejor sin ella»`);
  // 46) desbloquear desde el asesor = desbloquear a mano: misma configuración y mismo plan optimizado
  const hand = JSON.parse(JSON.stringify(jp.cfg)); delete hand.locked[PURE];
  const viaAdv = Adv.setUnlocked(JSON.parse(JSON.stringify(jp.cfg)), PURE, true), resH = E.solveOpt(hand, jp.plan);
  const same = (a, b) => a.steps.length === b.steps.length && a.steps.every((s, i) => s.p.id === b.steps[i].p.id && s.x === b.steps[i].x);
  const ra = rowOf(jact, jact.queue[0].id), handL = JSON.parse(JSON.stringify(jact.cfg)); handL.locked[ra.id] = true;
  ok(JSON.stringify(viaAdv) === JSON.stringify(hand) && same(rp.res, resH) && same(rp.res, E.solveOpt(viaAdv, jp.plan))
    && JSON.stringify(Adv.setUnlocked(JSON.parse(JSON.stringify(jact.cfg)), ra.id, false)) === JSON.stringify(handL) && same(ra.res, E.solveOpt(handL, jact.plan)),
    "asesor: desbloquear (o bloquear) desde el asesor da la misma configuración y el mismo plan que hacerlo a mano");
  // 47) por partes: con presupuesto 0 (una por paso) acaba igual que de una vez; cancelar detiene la evaluación
  const jc = Adv.prepare(o, C(half()), P(f5), {mode: "cand"}); let steps = 0;
  while (!Adv.step(jc, 0)) steps++;
  const sig = j => j.rows.map(r => r.id + r.state + (r.rel ?? "").toString()).join();
  const jx = Adv.prepare(o, C(half()), P(f5), {mode: "cand"}); Adv.step(jx, 0); Adv.cancel(jx); const doneX = jx.done;
  ok(steps === jc.queue.length - 1 && sig(jc) === sig(jf5) && Adv.finished(jx) && Adv.step(jx, 0) && jx.done === doneX && doneX === 1 && Adv.groups(jx).pending === jx.queue.length - 1,
    `asesor: por partes (${jc.queue.length} pasos) da lo mismo que de una vez; cancelar lo detiene y deja las pendientes sin evaluar`);
  // 48) umbral relativo único (0,01 % del criterio) para todos los estados
  const all = [jp, jr, joff, jgen, jf5, jact, jw].flatMap(j => j.rows.map(r => Object.assign({mode: j.mode}, r))).filter(r => r.rel != null);
  ok(all.every(r => Math.abs(r.rel) <= Adv.TOL ? ["noaporta", "noentra", "prescindible", "nouso"].includes(r.state) : ["mejora", "empeora", "importa", "mejorsin"].includes(r.state)),
    "asesor: cambios de menos del 0,01 % del criterio cuentan como «sin cambio» en todos los estados");
  // 49) Manual: la base es el optimizador sin maximizar; con maximizar (en Optimizar), el criterio es la escala
  const jm = Adv.prepare(o, C(lockAll()), P(plates, {mode: "manual", maximize: true}), {mode: "cand"});
  const lim = C(lockAll(), {limits: {Desc_OreIron_C: 480}}), jmax = Adv.run(Adv.prepare(o, lim, P(plates, {maximize: true, ban: noConv}), {mode: "cand"})), rmx = rowOf(jmax, PURE);
  ok(jm.plan.mode === "opt" && !jm.plan.maximize && near(jm.base.crit, E.solveOpt(C(lockAll()), P(plates)).obj) && jmax.base.crit === -jmax.base.res.scale
    && rmx.state === "mejora" && rmx.res.scale > jmax.base.res.scale * 1.5,
    `asesor: en Manual usa el optimizador sin maximizar; al maximizar compara la escala (×${jmax.base.res.scale.toFixed(2)} → ×${rmx.res.scale.toFixed(2)} con Lingote de hierro puro)`);
  // 50) base sin solución: las candidatas que la hacen posible salen «Hace posible el plan»; las activas no se evalúan
  const cImp = C(lockAll(), {limits: {Desc_OreIron_C: 50}}), pImp = P(plates, {ban: noConv}), jv = Adv.run(Adv.prepare(o, cImp, pImp, {mode: "cand"})), jb = Adv.prepare(o, cImp, pImp, {mode: "act"});
  ok(jv.base.error === "infeasible" && rowOf(jv, PURE).state === "viable" && Adv.groups(jv).main[0].state === "viable" && jb.blocked && !jb.queue.length,
    "asesor: si la fábrica no tiene solución, marca las candidatas que la hacen posible; las activas no se evalúan");
  // 51) Converter: maximizar con solo el hierro limitado no tiene techo (el Converter hace mineral de hierro con caliza, que no
  // está limitada). Sus recetas no son alternativas, así que la base ya no tiene techo: no hay con qué comparar y no se evalúa nada
  const cIron = C(lockAll(), {limits: {Desc_OreIron_C: 480}}), pIron = P(plates, {maximize: true});
  const ju = Adv.prepare(o, cIron, pIron, {mode: "cand"}), jua = Adv.prepare(o, cIron, pIron, {mode: "act"});
  ok(ju.base.error === "unbounded" && ju.blocked && jua.blocked && !ju.queue.length && ju.rows.every(r => r.state === "sinbase") && !Adv.groups(ju).main.length,
    "asesor: con el Converter y solo el hierro limitado, la base ya no tiene techo al maximizar: no se evalúa ninguna (ni candidatas ni activas)");
  // 52) «Sin límite» en una fila: Barras de hierro con solo el hierro limitado y sin la receta del Converter que hace mineral de hierro
  // (la base sí tiene techo). «Barra de aluminio» hace barras sin hierro y la bauxita no está limitada: con ella, la escala no tiene techo
  const AROD = "Recipe_Alternate_AluminumRod_C", banIronOre = Object.fromEntries(db.recipes.filter(r => db.buildings[r.building].en === "Converter" && r.out.Desc_OreIron_C).map(r => [r.id, true]));
  const pRod = P([{item: "Desc_IronRod_C", rate: 60}], {maximize: true, ban: banIronOre}), jrod = Adv.run(Adv.prepare(o, cIron, pRod, {mode: "cand"})), rrod = rowOf(jrod, AROD);
  ok(!jrod.base.error && jrod.base.res.scale > 1 && rrod.state === "sinlimite" && rrod.error === "unbounded" && rrod.rel == null && Adv.groups(jrod).main[0].state === "sinlimite"
    && jrod.rows.filter(r => r.state === "sinlimite").length === 1 && rowOf(jrod, PURE).state === "mejora",
    `asesor: una alternativa que deja la escala sin techo sale «Sin límite», arriba de la lista, no «Sin solución» (base ×${jrod.base.res.scale.toFixed(2)})`);
  // 53) en Activas, igual: si al bloquear una el plan quedara sin techo, sale «Sin límite». Sin pozos no puede pasar (quitar una receta
  // no quita techo), así que se simula con un motor que devuelve «unbounded» al bloquear Lingote de hierro puro
  const oU = Object.assign({}, o, {engine: Object.assign({}, E, {solveOpt: (c, p) => c.locked && c.locked[PURE] ? {steps: [], error: "unbounded", scale: 1e6} : E.solveOpt(c, p)})});
  const cP = C(lockAll()); delete cP.locked[PURE];
  const jsu = Adv.run(Adv.prepare(oU, cP, P(plates), {mode: "act"})), rsu = rowOf(jsu, PURE);
  ok(rsu.state === "sinlimite" && Adv.groups(jsu).main[0] === rsu, "asesor: en Activas, si al bloquear una el plan queda sin techo, sale «Sin límite» (caso simulado)");
}

// ---------- HTML generado
// 22) Planificador.html al día con src/ y data/, sin errores de sintaxis (node --check) y arrancando en un DOM mínimo
{
  const vm = require("vm"), os = require("os"), {spawnSync} = require("child_process");
  // PLANIFICADOR_HTML: otra ruta, para comprobar que la prueba detecta un HTML roto sin tocar el del repositorio
  const H = path.join(__dirname, ".."), html = fs.readFileSync(process.env.PLANIFICADOR_HTML || path.join(H, "Planificador.html"), "utf8");
  const dbM = html.match(/<script type="application\/json" id="db">([\s\S]*?)<\/script>/), jsM = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const js = jsM.map(m => m[1]).join("\n");
  const src = ["engine.js", "glyphs.js", "sankey.js", "report.js", "advisor.js", "app.js"].map(f => fs.readFileSync(path.join(H, "src", f), "utf8")).join("\n").replace(/<\/script/g, "<\\/script");
  ok(dbM && jsM.length === 1 && js === src && JSON.stringify(JSON.parse(dbM[1])) === JSON.stringify(db), "Planificador.html está al día (ejecuta python build.py si falla)");
  const tmp = path.join(os.tmpdir(), `planificador_check_${process.pid}.js`);
  fs.writeFileSync(tmp, js);
  const chk = spawnSync(process.execPath, ["--check", tmp], {encoding: "utf8"});
  fs.unlinkSync(tmp);
  ok(chk.status === 0, "node --check del JS de Planificador.html" + (chk.status ? "\n" + chk.stderr.trim().split("\n").slice(0, 6).join("\n") : ""));
  // DOM mínimo: cualquier propiedad o llamada desconocida devuelve otro objeto vacío; así el script corre entero y se ve si arranca
  const stub = base => { const t = function () {}; Object.assign(t, base || {}); return new Proxy(t, {
    get(o, k) { if (k in o && k !== "name" && k !== "length") return o[k]; if (k === Symbol.toPrimitive) return () => ""; if (k === Symbol.iterator) return function* () {}; if (k === "length") return 0; if (k === "then" || typeof k === "symbol") return undefined; return (o[k] = stub()); },
    set(o, k, v) { o[k] = v; return true; }, apply: () => stub()}); };
  // saved: configuración guardada en localStorage (null = primera visita)
  const boot = saved => {
    // L: escuchadores de document; T: llamadas a setTimeout (no se ejecutan solas: una prueba puede vaciarlas)
    const els = {}, el = id => els[id] || (els[id] = stub({id, textContent: "", innerHTML: "", value: "", dataset: {}, hidden: false})), L = {}, T = [];
    const ctx = vm.createContext({console, Intl, setTimeout: f => T.push(f), clearTimeout() {}, requestAnimationFrame: () => 0, CSS: {escape: s => s}, Image: function () {},
      localStorage: {getItem: () => saved, setItem() {}}, location: {protocol: "https:"}, matchMedia: () => ({matches: false, addEventListener() {}}), getComputedStyle: () => stub(),
      window: stub({scrollY: 0, scrollTo() {}, addEventListener() {}}),
      document: stub({getElementById: id => id === "db" ? {textContent: dbM ? dbM[1] : "{}"} : el(id), querySelector: () => null, querySelectorAll: () => [], addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); }, activeElement: null, body: stub(), documentElement: stub()})});
    let err = null;
    try { vm.runInContext(js, ctx, {filename: "Planificador.html"}); } catch (e) { err = e; }
    return {els, ctx, err, L, T};
  };
  const {els, ctx, err: bootErr} = boot(null);
  const sub = els.sub ? String(els.sub.textContent) : "";
  ok(!bootErr && ["Engine", "Glyphs", "Sankey", "Report", "Advisor"].every(g => vm.runInContext(`typeof ${g}`, ctx) === "object") && sub.includes(`${Object.keys(db.items).length} objetos, ${db.recipes.length} recetas`)
    && String(els.kpis && els.kpis.innerHTML).includes("Consumo") && String(els.prod && els.prod.innerHTML).length > 1000,
    "la app arranca: define Engine, Glyphs, Sankey, Report y Advisor, rellena el subtítulo, las cifras y la tabla de producción" + (bootErr ? ` — ${bootErr.name}: ${bootErr.message} (${(bootErr.stack.match(/Planificador\.html:\d+/) || ["?"])[0]})` : ""));
  // 23) los campos internos de plan («_», p. ej. _pressMax) no se pueden fijar desde una configuración guardada o importada
  // (las dos rutas usan restore()). Con _pressMax: 0 aplicado, este plan daría el error «press».
  const savedP = JSON.stringify({v: 2, cur: 0, cfg: {clock: 1, ext: {Desc_NitrogenGas_C: {wells: 2}}},
    plans: [{name: "p", targets: [{item: "Desc_NitricAcid_C", rate: 30}], sel: {}, rc: {}, mode: "opt", objective: "weighted", ban: {}, energy: "gen", gridMW: 0, _pressMax: 0}]});
  const b2 = boot(savedP), w2 = String(b2.els.warns && b2.els.warns.innerHTML);
  ok(!b2.err && !w2.includes("Pressurizers") && String(b2.els.kpis && b2.els.kpis.innerHTML).includes("Balance de energía") && String(b2.els.prod && b2.els.prod.innerHTML).length > 1000,
    "configuración guardada con _pressMax: se descarta y el plan se calcula" + (b2.err ? ` — ${b2.err.name}: ${b2.err.message}` : ""));
  // 31) la pestaña Máquinas se pinta al arrancar en ella: edificios plegados, líneas ocultas, Pressurizers y total
  const savedM = JSON.stringify({v: 2, cur: 0, tab: "mach", cfg: {clock: 1, ext: {Desc_NitrogenGas_C: {wells: 2}}},
    plans: [{name: "m", targets: f5, sel: {}, rc: {}, mode: "manual", objective: "weighted", ban: {}, energy: "gen", gridMW: 0}]});
  const b3 = boot(savedM), mh = String(b3.els.mach && b3.els.mach.innerHTML);
  ok(!b3.err && (mh.match(/class="mb"/g) || []).length > 5 && (mh.match(/class="ml"[^>]* hidden/g) || []).length === (mh.match(/class="ml"/g) || []).length
    && mh.includes(db.extractors.well.pressurizerName.es) && mh.includes("→ Energía") && mh.includes('class="tot"')
    && String(b3.els.cmat && b3.els.cmat.innerHTML).includes("Puntos del Sink") && String(b3.els.cbld && b3.els.cbld.innerHTML).includes("Coste unitario")
    && String(b3.els.cspec && b3.els.cspec.innerHTML).includes(db.specials.sloop.es) && String(b3.els.costName && b3.els.costName.textContent) === "m"
    && String(b3.els.cnotes && b3.els.cnotes.innerHTML).includes("cimientos"),
    "la pestaña Máquinas se pinta: edificios plegados con sus líneas, Pressurizers, generadores, total y coste de construcción" + (b3.err ? ` — ${b3.err.name}: ${b3.err.message}` : ""));
  // 54) la pestaña Alternativas pinta el asesor: fábrica en el título y avisos fijos (cada una por separado, sin filtro por tier,
  // umbral del 0,01 %). Sin pozos afirma que desbloquear nunca empeora; con pozos, no. En Manual, avisa de que la base es el plan óptimo
  const savedA = (ext, mode) => JSON.stringify({v: 2, cur: 0, tab: "alts", cfg: {clock: 1, ext, locked: {}},
    plans: [{name: "a", targets: [{item: "Desc_IronPlate_C", rate: 60}], sel: {}, rc: {}, mode, objective: "weighted", ban: {}, energy: "off", gridMW: 0}]});
  const b4 = boot(savedA({}, "opt")), n4 = String(b4.els.advNote && b4.els.advNote.innerHTML);
  const b5 = boot(savedA({Desc_NitrogenGas_C: {wells: 2}}, "manual")), n5 = String(b5.els.advNote && b5.els.advNote.innerHTML);
  const nAlt = db.recipes.filter(r => r.alt).length;
  ok(!b4.err && !b5.err && vm.runInContext("typeof Advisor", b4.ctx) === "object" && String(b4.els.advName.textContent) === "a" && String(b4.els.altCount.textContent).startsWith(`${nAlt} de ${nAlt}`)
    && [n4, n5].every(n => n.includes("Cada alternativa se evalúa por separado") && n.includes("aún no hay filtro por tier") && n.includes("0,01 %"))
    && n4.includes("nunca empeora") && !n4.includes("Tu fábrica está en Manual") && !n5.includes("nunca empeora") && n5.includes("Pressurizers") && n5.includes("Tu fábrica está en Manual")
    && String(b5.els.advCrit.textContent).includes("Manual"),
    "la pestaña Alternativas pinta el asesor con sus avisos (con pozos no afirma la monotonía; en Manual, base óptima)" + ((b4.err || b5.err) ? ` — ${(b4.err || b5.err).message}` : ""));
  // 55) el panel pinta «Sin límite» con su nota (caso de la prueba 52) y, con la base sin techo, el aviso de que no hay con qué comparar
  const banJ = JSON.stringify(Object.fromEntries(db.recipes.filter(r => db.buildings[r.building].en === "Converter" && r.out.Desc_OreIron_C).map(r => [r.id, true])));
  const savedU = (item, ban) => JSON.stringify({v: 2, cur: 0, tab: "alts", cfg: {clock: 1, ext: {}, limits: {Desc_OreIron_C: 480}, locked: Object.fromEntries(db.recipes.filter(r => r.alt).map(r => [r.id, true]))},
    plans: [{name: "u", targets: [{item, rate: 60}], sel: {}, rc: {}, mode: "opt", objective: "weighted", maximize: true, ban: JSON.parse(ban), energy: "off", gridMW: 0}]});
  // pulsa «Evaluar» como la interfaz (clic en #advRun) y deja correr el cálculo por partes
  const evalIn = b => { const btn = {id: "advRun", dataset: {}}, ev = {target: {closest: q => q === "button" ? btn : null}, preventDefault() {}};
    for (const f of b.L.click || []) f(ev);
    for (let k = 0; k < 500 && b.T.length; k++) b.T.shift()(); };
  const b6 = boot(savedU("Desc_IronRod_C", banJ)), b7 = boot(savedU("Desc_IronPlate_C", "{}"));
  let e67 = null; try { evalIn(b6); evalIn(b7); } catch (e) { e67 = e; }
  const o6 = String(b6.els.advOut && b6.els.advOut.innerHTML), o7 = String(b7.els.advOut && b7.els.advOut.innerHTML);
  ok(!e67 && !b6.err && !b7.err && o6.includes(">Sin límite<small>Con esta alternativa la escala no tiene techo: algún recurso no está limitado.</small>") && !o6.includes("Sin solución")
    && o7.includes("no tiene techo, así que no hay con qué comparar") && !o7.includes("<table"),
    "el panel pinta «Sin límite» con su nota y, con la base sin techo, avisa de que no hay con qué comparar" + (e67 ? ` — ${e67.message}` : ""));
}
console.log(fails ? `\n${fails} fallo(s)` : "\nTodo correcto");
process.exitCode = fails ? 1 : 0;
process.exit(fails ? 1 : 0);
