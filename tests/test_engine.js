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

// ---------- HTML generado
// 22) Planificador.html al día con src/ y data/, sin errores de sintaxis (node --check) y arrancando en un DOM mínimo
{
  const vm = require("vm"), os = require("os"), {spawnSync} = require("child_process");
  // PLANIFICADOR_HTML: otra ruta, para comprobar que la prueba detecta un HTML roto sin tocar el del repositorio
  const H = path.join(__dirname, ".."), html = fs.readFileSync(process.env.PLANIFICADOR_HTML || path.join(H, "Planificador.html"), "utf8");
  const dbM = html.match(/<script type="application\/json" id="db">([\s\S]*?)<\/script>/), jsM = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const js = jsM.map(m => m[1]).join("\n");
  const src = ["engine.js", "glyphs.js", "sankey.js", "app.js"].map(f => fs.readFileSync(path.join(H, "src", f), "utf8")).join("\n").replace(/<\/script/g, "<\\/script");
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
  const els = {}, el = id => els[id] || (els[id] = stub({id, textContent: "", innerHTML: "", value: "", dataset: {}, hidden: false}));
  const ctx = vm.createContext({console, Intl, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0, CSS: {escape: s => s}, Image: function () {},
    localStorage: {getItem: () => null, setItem() {}}, location: {protocol: "https:"}, matchMedia: () => ({matches: false, addEventListener() {}}), getComputedStyle: () => stub(),
    window: stub({scrollY: 0, scrollTo() {}, addEventListener() {}}),
    document: stub({getElementById: id => id === "db" ? {textContent: dbM ? dbM[1] : "{}"} : el(id), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, activeElement: null, body: stub(), documentElement: stub()})});
  let bootErr = null;
  try { vm.runInContext(js, ctx, {filename: "Planificador.html"}); } catch (e) { bootErr = e; }
  const sub = els.sub ? String(els.sub.textContent) : "";
  ok(!bootErr && ["Engine", "Glyphs", "Sankey"].every(g => vm.runInContext(`typeof ${g}`, ctx) === "object") && sub.includes(`${Object.keys(db.items).length} objetos, ${db.recipes.length} recetas`)
    && String(els.kpis && els.kpis.innerHTML).includes("Consumo") && String(els.prod && els.prod.innerHTML).length > 1000,
    "la app arranca: define Engine, Glyphs y Sankey, rellena el subtítulo, las cifras y la tabla de producción" + (bootErr ? ` — ${bootErr.name}: ${bootErr.message} (${(bootErr.stack.match(/Planificador\.html:\d+/) || ["?"])[0]})` : ""));
}
console.log(fails ? `\n${fails} fallo(s)` : "\nTodo correcto");
process.exitCode = fails ? 1 : 0;
process.exit(fails ? 1 : 0);
