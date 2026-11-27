// Exporta problemas lineales del optimizador para compararlos con HiGHS (tests/compare_highs.py).
const fs = require("fs"), path = require("path");
const db = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/satisfactory_db.json"), "utf8"));
const src = fs.readFileSync(path.join(__dirname, "../src/engine.js"), "utf8")
  .replace("const res = simplex(n, c, rows);", "const res = simplex(n, c, rows); globalThis.LPS.push({n, c: [...c], rows, val: res.value, status: res.status});");
const E = new Function("module", src + ";return Engine;")({}); E.init(db);
const cfg = {clock: 1, ext: {}, locked: {}, limits: {}}, out = [];
const targ = Object.keys(db.items).filter(i => !db.items[i].raw && !db.items[i].manual && !db.items[i].synthetic);
const f5 = db.presets["Fase 5 del Space Elevator"].map(i => ({item: i, rate: 1}));
// [objetivos, criterio, opciones del plan, cfg]
const cases = [...targ.map(i => [[{item: i, rate: 1}], "weighted"]), [f5, "weighted"], [f5, "power"], [f5, "machines"],
  ...targ.filter((_, k) => k % 5 === 0).map(i => [[{item: i, rate: 3}], "power"]), ...targ.filter((_, k) => k % 7 === 0).map(i => [[{item: i, rate: 2}], "machines"])];
// energía generada en la fábrica: criterios, energía externa, Pressurizers y planta de energía como objetivo
const gen = {energy: "gen"}, cfgW = Object.assign({}, cfg, {ext: {Desc_NitrogenGas_C: {wells: 2}, Desc_LiquidOil_C: {wells: 1, clock: 2}}});
const nitric = [{item: "Desc_NitricAcid_C", rate: 30}];
cases.push([f5, "weighted", gen], [f5, "power", gen], [f5, "machines", gen], [f5, "weighted", {energy: "gen", gridMW: 3000}],
  [f5, "machines", {energy: "gen", ban: {Gen_Desc_NuclearFuelRod_C: true, Gen_Desc_PlutoniumFuelRod_C: true, Gen_Desc_FicsoniumFuelRod_C: true}}],
  [nitric, "weighted", gen, cfgW], [nitric, "power", gen, cfgW], [f5, "weighted", gen, cfgW],
  [[{item: E.POWER, rate: 5000}], "weighted"], [[{item: E.POWER, rate: 5000}], "machines"], [[{item: E.POWER, rate: 2000}], "weighted", {allowManual: true}],
  ...targ.filter((_, k) => k % 9 === 0).map(i => [[{item: i, rate: 2}], "weighted", gen]),
  ...targ.filter((_, k) => k % 11 === 0).map(i => [[{item: i, rate: 2}], "power", gen]));
// filtro de progreso (cfg.progress): cada fase del Space Elevator en su tier, con y sin el MAM, y con energía generada
const trees = db.progress.trees, mamOf = ks => Object.fromEntries(ks.flatMap(k => trees[k].nodes).map(n => [n, true]));
const cfgP = (tier, mam) => Object.assign({}, cfg, {progress: {tier, add: {}, rm: {}, mam}});
const ph = n => ({2: [1, 2, 3], 3: [2, 4, 5], 4: [6, 7, 8, 9]})[n].map(i => ({item: `Desc_SpaceElevatorPart_${i}_C`, rate: 1}));
cases.push([ph(2), "weighted", null, cfgP(4, {})], [ph(3), "weighted", null, cfgP(6, {})], [ph(3), "power", gen, cfgP(6, mamOf(["Sulfur_RS"]))],
  [ph(4), "weighted", null, cfgP(8, mamOf(["Caterium_RS", "Quartz_RS"]))], [ph(4), "machines", gen, cfgP(8, mamOf(["Caterium_RS", "Quartz_RS", "Sulfur_RS"]))],
  [f5, "weighted", null, cfgP(9, mamOf(Object.keys(trees)))], [f5, "power", gen, cfgP(9, {})]);
for (const [t, o, extra, c] of cases) {
  // con Pressurizers, el optimizador resuelve varias veces (punto fijo): se exporta cada problema
  globalThis.LPS = [];
  E.solveOpt(c || cfg, Object.assign({targets: t, sel: {}, rc: {}, mode: "opt", objective: o}, extra || {}));
  const name = t.map(x => db.items[x.item].en).join("+") + "/" + o + (extra ? " " + JSON.stringify(extra) : "") + (c ? (c.progress ? ` +progreso tier ${c.progress.tier}` : " +pozos") : "");
  globalThis.LPS.forEach((lp, k) => out.push({name: name + (globalThis.LPS.length > 1 ? ` #${k + 1}` : ""), ...lp}));
}
fs.writeFileSync(path.join(__dirname, "lp_cases.json"), JSON.stringify(out));
console.log(out.length, "casos exportados");
