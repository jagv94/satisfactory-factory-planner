// Exporta problemas lineales del optimizador para compararlos con HiGHS (tests/compare_highs.py).
const fs = require("fs"), path = require("path");
const db = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/satisfactory_db.json"), "utf8"));
const src = fs.readFileSync(path.join(__dirname, "../src/engine.js"), "utf8")
  .replace("const res = simplex(n, c, rows);", "const res = simplex(n, c, rows); globalThis.LAST = {n, c: [...c], rows, val: res.value, status: res.status};");
const E = new Function("module", src + ";return Engine;")({}); E.init(db);
const cfg = {clock: 1, ext: {}, locked: {}, limits: {}}, out = [];
const targ = Object.keys(db.items).filter(i => !db.items[i].raw && !db.items[i].manual);
const f5 = db.presets["Fase 5 del Space Elevator"].map(i => ({item: i, rate: 1}));
const cases = [...targ.map(i => [[{item: i, rate: 1}], "weighted"]), [f5, "weighted"], [f5, "power"], [f5, "machines"],
  ...targ.filter((_, k) => k % 5 === 0).map(i => [[{item: i, rate: 3}], "power"]), ...targ.filter((_, k) => k % 7 === 0).map(i => [[{item: i, rate: 2}], "machines"])];
for (const [t, o] of cases) { E.solveOpt(cfg, {targets: t, sel: {}, rc: {}, mode: "opt", objective: o}); out.push({name: t.map(x => db.items[x.item].en).join("+") + "/" + o, ...globalThis.LAST}); }
fs.writeFileSync(path.join(__dirname, "lp_cases.json"), JSON.stringify(out));
console.log(out.length, "casos exportados");
