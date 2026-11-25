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
console.log(fails ? `\n${fails} fallo(s)` : "\nTodo correcto");
process.exit(fails ? 1 : 0);
