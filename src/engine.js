// Motor de cálculo: procesos, solver manual (una receta por objeto) y optimizador lineal (simplex en dos fases).
// Se ejecuta igual en el navegador y en Node (tests).
const Engine = (() => {
  let DB, R, PRIM, PROD, OPTS;
  const POWER = "Power_MW";  // objeto sintético: MW que producen los generadores y consumen las máquinas
  const DEF = {Desc_GenericBiomass_C: "Recipe_Biomass_Wood_C", Desc_AlienProtein_C: "Recipe_Protein_Hog_C",
    Desc_CrystalShard_C: "Recipe_PowerCrystalShard_1_C", Desc_FicsiteIngot_C: "Recipe_FicsiteIngot_Iron_C", [POWER]: "Gen_Desc_Coal_C"};
  const EXP = 1.321929;
  const isGen = r => !!(DB.buildings[r.building] || {}).generator;
  const energyOn = plan => !!plan && plan.energy === "gen";

  function init(db) {
    DB = db; R = {}; PRIM = {}; PROD = {}; OPTS = {};
    for (const r of DB.recipes) {
      R[r.id] = r;
      // un generador es receta principal de la energía y también de su residuo (la central nuclear produce residuos)
      for (const p of isGen(r) ? Object.keys(r.out) : [Object.keys(r.out)[0]]) (PRIM[p] = PRIM[p] || []).push(r.id);
      for (const o in r.out) (PROD[o] = PROD[o] || []).push(r.id);
    }
    for (const [k, e] of Object.entries(DB.extractors)) for (const i of e.items) (OPTS[i] = OPTS[i] || []).push("x:" + k);
    for (const k in PRIM) PRIM[k].sort((a, b) => rank(a) - rank(b) || R[a].en.localeCompare(R[b].en));
    // generadores: de menor a mayor potencia (biomasa, carbón, combustible, nuclear) y, dentro, por nombre
    if (PRIM[POWER]) PRIM[POWER].sort((a, b) => DB.buildings[R[b].building].power - DB.buildings[R[a].building].power || R[a].en.localeCompare(R[b].en));
    return {R, PRIM};
  }
  const rank = id => { const r = R[id], it = DB.items[Object.keys(r.out)[0]];
    return (r.alt ? 4 : 0) + (DB.buildings[r.building].en === "Packager" ? 8 : 0) + (r.unlock.type === "Custom" ? 2 : 0) + (it && r.en === it.en ? 0 : 1); };
  const allowed = (cfg, id) => !R[id].alt || !(cfg.locked || {})[id];

  // opciones de producción de un objeto
  function options(cfg, item, keep) {
    const it = DB.items[item] || {};
    const o = [...(OPTS[item] || [])];
    if (it.manual) o.push("manual");
    for (const id of PRIM[item] || []) if (allowed(cfg, id) || id === keep) o.push(id);
    o.push("import");
    return o;
  }
  function defaultSel(cfg, item) {
    const it = DB.items[item] || {};
    if (OPTS[item]) return item === "Desc_NitrogenGas_C" ? "x:well" : OPTS[item].find(x => x !== "x:well") || OPTS[item][0];
    if (it.manual) return "manual";
    if (DEF[item] && R[DEF[item]]) return DEF[item];
    const p = (PRIM[item] || []).filter(id => allowed(cfg, id));
    return p[0] || "import";
  }
  function selOf(cfg, plan, item) {
    const s = (plan.sel || {})[item];
    if (s && options(cfg, item).includes(s)) return s;
    return defaultSel(cfg, item);
  }
  const shards = c => c > 1 + 1e-9 ? Math.min(3, Math.ceil((c - 1) / 0.5 - 1e-9)) : 0;
  function extCfg(cfg, item) { return Object.assign({tier: "Mk.3", purity: "Normal", clock: 1}, (cfg.ext || {})[item] || {}); }
  function recCfg(cfg, plan, id) { const r = (plan.rc || {})[id] || {}; return {clock: r.clock ?? cfg.clock ?? 1, sloops: r.sloops || 0}; }

  // proceso = una máquina funcionando con su configuración: entradas/salidas por minuto
  // proceso con energía: con «generar», cada máquina consume Power_MW (su potencia y, en pozos, su parte de los Pressurizers)
  function proc(cfg, plan, sel, item) {
    const p = proc0(cfg, plan, sel, item);
    if (p.kind === "extract" && p.ext === "well") { const s = ((plan || {})._ps || {})[item] || 0; if (s) { p.pshare = s; p.power += s; } }
    if (energyOn(plan) && p.power > 0) p.in[POWER] = p.power;
    return p;
  }
  function proc0(cfg, plan, sel, item) {
    if (sel === "import" || sel === "manual") return {id: sel + ":" + item, kind: sel, item, in: {}, out: {[item]: 1}, power: 0, clock: 1, sloops: 0, building: null};
    if (sel.startsWith("x:")) {
      const k = sel.slice(2), e = DB.extractors[k], c = extCfg(cfg, item);
      let rate = e.rate, power = e.power, name = e;
      if (k === "miner") { const t = e.tiers[c.tier] || e.tiers["Mk.3"]; rate = t.rate; power = t.power; name = {en: "Miner " + c.tier, es: e.es + " " + c.tier}; }
      const pm = e.purity === false ? 1 : DB.purity[c.purity] ?? 1;
      return {id: sel + ":" + item, kind: "extract", item, ext: k, in: {}, out: {[item]: rate * pm * c.clock}, base: power, power: power * Math.pow(c.clock, EXP),
        clock: c.clock, sloops: 0, building: "x:" + k + (k === "miner" ? ":" + c.tier : ""), bname: name};
    }
    const r = R[sel], b = DB.buildings[r.building], rc = recCfg(cfg, plan, sel);
    const s = Math.min(rc.sloops, b.slots), boost = 1 + s * b.boost, c = rc.clock;
    const ins = {}, outs = {};
    for (const k in r.in) ins[k] = r.in[k] * c;
    for (const k in r.out) outs[k] = r.out[k] * c * boost;
    const base = r.power ?? b.power;
    return {id: sel, kind: "recipe", recipe: r, item: Object.keys(r.out)[0], in: ins, out: outs, base, clock: c, sloops: s, boost, b,
      power: b.generator ? b.power * c : base * Math.pow(c, b.exp) * Math.pow(boost, b.boostExp), building: r.building, bname: b};
  }

  function demand(targets) {
    const d = {};
    for (const t of targets || []) if (t.rate > 0 && DB.items[t.item]) d[t.item] = (d[t.item] || 0) + t.rate;
    return d;
  }

  function gauss(A, n) {
    for (let c = 0; c < n; c++) {
      let p = c, best = Math.abs(A[c][c]);
      for (let r = c + 1; r < n; r++) { const v = Math.abs(A[r][c]); if (v > best) { best = v; p = r; } }
      if (best < 1e-12) return null;
      if (p !== c) { const t = A[p]; A[p] = A[c]; A[c] = t; }
      const pv = A[c][c];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c] / pv; if (!f) continue;
        const Ar = A[r], Ac = A[c];
        for (let k = c; k <= n; k++) Ar[k] -= f * Ac[k];
      }
    }
    const x = new Float64Array(n);
    for (let c = 0; c < n; c++) x[c] = A[c][n] / A[c][c];
    return x;
  }

  // ---------- modo manual: una receta por objeto, sistema lineal cuadrado; los negativos pasan a excedente
  // energía externa disponible: se descuenta de la fila de Power_MW (no escala con «maximizar»)
  const supply = plan => energyOn(plan) && plan.gridMW > 0 ? {[POWER]: +plan.gridMW} : {};
  function solveManual0(cfg, plan, targets) {
    const d = demand(targets ?? plan.targets), sup = supply(plan);
    const act = [], seen = new Set(), P = {}, q = Object.keys(d);
    while (q.length) {
      const i = q.shift(); if (seen.has(i)) continue;
      seen.add(i); act.push(i);
      const p = P[i] = proc(cfg, plan, selOf(cfg, plan, i), i);
      for (const j in p.in) if (!seen.has(j)) q.push(j);
    }
    const off = new Set(); let x = {}, error = null;
    for (let it = 0; it < 100; it++) {
      const v = act.filter(i => !off.has(i)), n = v.length, ix = {};
      v.forEach((i, k) => ix[i] = k);
      const A = v.map(() => new Float64Array(n + 1));
      v.forEach((k, c) => {
        const p = P[k];
        for (const i in p.out) if (i in ix) A[ix[i]][c] += p.out[i];
        for (const i in p.in) if (i in ix) A[ix[i]][c] -= p.in[i];
      });
      v.forEach((i, r) => A[r][n] = (d[i] || 0) - (sup[i] || 0));
      const sol = n ? gauss(A, n) : new Float64Array(0);
      if (!sol) { error = "cycle"; x = {}; break; }
      x = {}; v.forEach((k, c) => x[k] = Math.abs(sol[c]) < 1e-10 ? 0 : sol[c]);
      let worst = null, wv = -1e-9;
      for (const k of v) if (x[k] < wv) { wv = x[k]; worst = k; }
      if (worst === null) break;
      off.add(worst);
    }
    const plan2 = act.filter(i => (x[i] || 0) > 1e-10).map(i => ({p: P[i], x: x[i]}));
    return {steps: plan2, d, error, byproductOnly: [...off], P, supply: sup, energy: energyOn(plan)};
  }

  // ---------- simplex de dos fases: min c·x, filas {a:{col:val}, op:'>='|'<='|'=', b}, x>=0
  function simplex(n, c0, rows0, maxIt = 60000) {
    // equilibrado: columnas y filas a escala 1 para estabilidad numérica
    const cs = new Float64Array(n).fill(0);
    for (const r of rows0) for (const k in r.a) cs[+k] = Math.max(cs[+k], Math.abs(r.a[k]));
    for (let j = 0; j < n; j++) if (!cs[j]) cs[j] = 1;
    const c = Array.from(c0, (v, j) => v / cs[j]);
    const rows = rows0.map(r => { const a = {}; let mx = 0; for (const k in r.a) { a[k] = r.a[k] / cs[+k]; mx = Math.max(mx, Math.abs(a[k])); } mx = mx || 1; for (const k in a) a[k] /= mx; return {a, op: r.op, b: r.b / mx}; });
    const res = simplexCore(n, c, rows, maxIt);
    if (res.x) for (let j = 0; j < n; j++) res.x[j] /= cs[j];
    return res;
  }
  function simplexCore(n, c, rows, maxIt) {
    const m = rows.length;
    let nS = 0, nA = 0;
    const R2 = rows.map(r => { let {a, op, b} = r; if (op === ">=" && b === 0) { const a2 = {}; for (const k in a) a2[k] = -a[k]; a = a2; op = "<="; } if (b < 0) { const a2 = {}; for (const k in a) a2[k] = -a[k]; a = a2; b = -b; op = op === ">=" ? "<=" : op === "<=" ? ">=" : "="; } if (op !== "=") nS++; if (op !== "<=") nA++; return {a, op, b}; });
    const N = n + nS + nA, T = R2.map(() => new Float64Array(N + 1)), basis = new Int32Array(m), art = new Uint8Array(N);
    let s = n, a = n + nS;
    R2.forEach((r, i) => {
      for (const k in r.a) T[i][+k] = r.a[k];
      T[i][N] = r.b;
      if (r.op === "<=") { T[i][s] = 1; basis[i] = s++; }
      else if (r.op === ">=") { T[i][s++] = -1; T[i][a] = 1; art[a] = 1; basis[i] = a++; }
      else { T[i][a] = 1; art[a] = 1; basis[i] = a++; }
    });
    const Z = new Float64Array(N + 1);
    const pivot = (pr, pc) => {
      const P = T[pr], pv = P[pc];
      for (let j = 0; j <= N; j++) P[j] /= pv;
      for (let i = 0; i < m; i++) { if (i === pr) continue; const f = T[i][pc]; if (Math.abs(f) < 1e-15) continue; const Ti = T[i]; for (let j = 0; j <= N; j++) { Ti[j] -= f * P[j]; if (Math.abs(Ti[j]) < 1e-11) Ti[j] = 0; } }
      const f = Z[pc]; if (Math.abs(f) > 1e-15) for (let j = 0; j <= N; j++) Z[j] -= f * P[j];
      basis[pr] = pc;
    };
    const run = (forbid) => {
      const skip = new Uint8Array(N);
      for (let it = 0; it < maxIt; it++) {
        let pc = -1, best = -1e-8;
        const bland = it > 3000;
        for (let j = 0; j < N; j++) { if (skip[j] || forbid(j)) continue; if (Z[j] < best) { if (bland) { pc = j; break; } best = Z[j]; pc = j; } }
        if (pc < 0) return "ok";
        // test de razón de Harris en dos pasadas: entre las filas casi empatadas, el pivote más grande
        let pr = -1, bound = Infinity;
        for (let i = 0; i < m; i++) { const v = T[i][pc]; if (v > 1e-7) { const q = (Math.max(0, T[i][N]) + 1e-9) / v; if (q < bound) bound = q; } }
        if (bound < Infinity) { let bv = 0; for (let i = 0; i < m; i++) { const v = T[i][pc]; if (v > 1e-7 && Math.max(0, T[i][N]) / v <= bound && v > bv) { bv = v; pr = i; } } }
        if (pr < 0) { if (Z[pc] > -1e-5) { skip[pc] = 1; continue; } return "unbounded"; }
        pivot(pr, pc); skip.fill(0);
      }
      return "iterations";
    };
    // fase 1
    for (let j = 0; j <= N; j++) Z[j] = 0;
    for (let j = 0; j < N; j++) if (art[j]) Z[j] = 1;
    for (let i = 0; i < m; i++) if (art[basis[i]]) for (let j = 0; j <= N; j++) Z[j] -= T[i][j];
    let st = run(() => false);
    if (st !== "ok") return {status: st};
    if (-Z[N] > 1e-6 * Math.max(1, ...R2.map(r => r.b))) return {status: "infeasible"};
    for (let i = 0; i < m; i++) if (art[basis[i]]) { for (let j = 0; j < n + nS; j++) if (Math.abs(T[i][j]) > 1e-9) { pivot(i, j); break; } }
    // fase 2
    for (let j = 0; j <= N; j++) Z[j] = j < n ? c[j] : 0;
    for (let i = 0; i < m; i++) { const cb = basis[i] < n ? c[basis[i]] : 0; if (cb) for (let j = 0; j <= N; j++) Z[j] -= cb * T[i][j]; }
    st = run(j => art[j] === 1);
    if (st !== "ok") return {status: st};
    const x = new Float64Array(n);
    for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = T[i][N];
    return {status: "ok", x, value: -Z[N]};
  }

  // peso de escasez por materia prima (fracción del máximo del mapa)
  function rawWeight(item) {
    const w = DB.world[item];
    if (w) return 1e4 / w;
    if (item === "Desc_Water_C") return 0.01;
    return DB.items[item] && DB.items[item].manual ? 1 : 0;
  }

  // ---------- optimizador: varias recetas por objeto, límites de recursos, objetivos alternativos
  // procesos que entran en el LP: búsqueda desde la demanda por las recetas permitidas y no excluidas.
  // reach = objetos demandados por algún proceso (o por los objetivos); una receta entra si alguna de sus salidas,
  // subproductos incluidos, está en reach. Con «generar», Power_MW entra por las máquinas que consumen.
  function collect(cfg, plan, d) {
    const procs = [], seenP = new Set(), seenI = new Set(), q = Object.keys(d);
    const add = p => { if (!seenP.has(p.id)) { seenP.add(p.id); procs.push(p); for (const j in p.in) q.push(j); } };
    while (q.length) {
      const i = q.shift(); if (seenI.has(i)) continue; seenI.add(i);
      const it = DB.items[i] || {}, sel = selOf(cfg, plan, i);
      if ((plan.sel || {})[i] === "import") add(proc(cfg, plan, "import", i));
      if (it.raw) { if (sel.startsWith("x:")) add(proc(cfg, plan, sel, i)); else if (sel !== "import" && OPTS[i]) add(proc(cfg, plan, defaultSel(cfg, i), i)); }
      if (it.manual && (plan.allowManual || (plan.sel || {})[i] === "manual")) add(proc(cfg, plan, "manual", i));
      for (const id of PROD[i] || []) if (allowed(cfg, id) && !(plan.ban || {})[id]) add(proc(cfg, plan, id, i));
    }
    return {procs, reach: seenI};
  }
  const reach = (cfg, plan, targets) => collect(cfg, plan, demand(targets ?? plan.targets)).reach;
  function solveOpt0(cfg, plan, targets, mode) {
    const d = demand(targets ?? plan.targets), sup = supply(plan);
    const objective = mode || plan.objective || "weighted";
    const {procs, reach: seenI} = collect(cfg, plan, d);
    const items = [...seenI];
    for (const p of procs) for (const o in p.out) if (!seenI.has(o)) { seenI.add(o); items.push(o); }
    const ix = {}; items.forEach((k, i) => ix[k] = i);
    const maxMode = !!plan.maximize;
    const n = procs.length + (maxMode ? 1 : 0), tcol = procs.length;
    const c = new Float64Array(n);
    procs.forEach((p, j) => {
      let raw = 0;
      if (p.kind === "extract" || p.kind === "manual") raw = p.out[p.item] * rawWeight(p.item);
      const pw = Math.max(0, p.power), mach = p.kind === "recipe" ? 1 : 0;
      c[j] = objective === "power" ? pw + 1e-3 * raw + 1e-4 * mach : objective === "machines" ? mach + 1e-3 * raw + 1e-5 * pw : raw + 1e-4 * pw + 1e-3 * mach;
      if (p.kind === "import") c[j] = 1e-6;
    });
    if (maxMode) c[tcol] = -1e6;
    const rows = items.map(i => ({a: {}, op: ">=", b: (maxMode ? 0 : d[i] || 0) - (sup[i] || 0)}));
    procs.forEach((p, j) => {
      for (const k in p.out) rows[ix[k]].a[j] = (rows[ix[k]].a[j] || 0) + p.out[k];
      for (const k in p.in) rows[ix[k]].a[j] = (rows[ix[k]].a[j] || 0) - p.in[k];
    });
    if (maxMode) for (const i in d) rows[ix[i]].a[tcol] = -d[i];
    for (const [item, L] of Object.entries(cfg.limits || {})) {
      if (L === null || L === "" || !(item in ix)) continue;
      const a = {};
      procs.forEach((p, j) => { if ((p.kind === "extract" || p.kind === "manual") && p.item === item) a[j] = p.out[item]; });
      if (Object.keys(a).length) rows.push({a, op: "<=", b: +L});
    }
    if (maxMode) rows.push({a: {[tcol]: 1}, op: "<=", b: 1e6});
    const res = simplex(n, c, rows);
    if (res.status !== "ok") return {steps: [], d, error: res.status, procs, supply: sup, energy: energyOn(plan)};
    const steps = procs.map((p, j) => ({p, x: res.x[j]})).filter(s => s.x > 1e-9);
    const scale = maxMode ? res.x[tcol] : 1;
    const d2 = {}; for (const i in d) d2[i] = d[i] * scale;
    // obj: valor del criterio en el LP (con maximizar incluye −1e6 · escala); lo usa el asesor de alternativas
    return {steps, d: d2, error: maxMode && scale > 9.99e5 ? "unbounded" : null, scale: maxMode ? scale : null, supply: sup, energy: energyOn(plan), obj: res.value};
  }

  // ---------- Pressurizers de los Resource Well: el usuario indica cuántos pozos usa por fluido (cfg.ext[item].wells).
  // Su potencia es fija, pero en el cálculo cada extractor de pozo carga con la parte proporcional
  // (potencia de los Pressurizers / extractores de ese fluido). Como el número de extractores sale del propio cálculo,
  // se itera hasta que el reparto coincide con la solución (punto fijo; suele bastar con pocas vueltas).
  // Como mucho PRESS_MAX vueltas: si no cuadra, se devuelve el error "press" (sin pasos), nunca un resultado a medias.
  const PRESS_MAX = 12;
  function pressPower(cfg, item) {
    const w = DB.extractors.well, c = extCfg(cfg, item), n = +c.wells || 0;
    return n > 0 ? n * w.pressurizer * Math.pow(c.clock, w.pressurizerExp ?? EXP) : 0;
  }
  // potencia de los Pressurizers por fluido de pozo (solo los fluidos con pozos indicados)
  function pressAll(cfg) { const W = {}; for (const i of (DB.extractors.well || {}).items || []) { const pw = pressPower(cfg, i); if (pw > 0) W[i] = pw; } return W; }
  function withPress(fn) {
    return (cfg, plan, ...rest) => {
      const W = pressAll(cfg);
      if (!Object.keys(W).length) return fn(cfg, plan, ...rest);
      const wellX = res => { const x = {}; for (const s of res.steps) if (s.p.kind === "extract" && s.p.ext === "well") x[s.p.item] = (x[s.p.item] || 0) + s.x; return x; };
      // coherente: cada fluido o no usa pozos, o su reparto cubre exactamente la potencia de sus Pressurizers
      const ok = (x, ps) => Object.keys(W).every(i => (x[i] || 0) <= 1e-9 || Math.abs((ps[i] || 0) * x[i] - W[i]) <= 1e-9 * Math.max(1, W[i]));
      const max = (plan || {})._pressMax ?? PRESS_MAX;   // _pressMax: solo para pruebas
      let ps = {}, res = fn(cfg, plan, ...rest);
      for (let it = 0; !res.error; it++) {
        const x = wellX(res);
        if (ok(x, ps)) return Object.assign(res, {pressIter: it});
        if (it >= max) return {steps: [], d: res.d, error: "press", supply: res.supply, energy: res.energy};
        const ps2 = {};
        for (const i in W) ps2[i] = (x[i] || 0) > 1e-9 ? W[i] / x[i] : ps[i] || 0;
        ps = ps2; res = fn(cfg, Object.assign({}, plan, {_ps: ps}), ...rest);
      }
      return res;
    };
  }
  const solveManual = withPress(solveManual0), solveOpt = withPress(solveOpt0);

  // ---------- análisis común de un plan
  function analyze(cfg, res) {
    const prod = {}, cons = {};
    const rows = res.steps.map(({p, x}) => {
      for (const k in p.out) prod[k] = (prod[k] || 0) + x * p.out[k];
      for (const k in p.in) cons[k] = (cons[k] || 0) + x * p.in[k];
      let build = null, uclock = null, power = 0, sh = 0, sl = 0;
      if (p.kind === "recipe" || p.kind === "extract") {
        build = Math.ceil(x - 1e-6);
        uclock = build ? x / build * p.clock : 0;
        if (p.kind === "recipe" && p.b.generator) power = p.b.power * uclock * build;
        else if (p.kind === "recipe") power = build * p.base * Math.pow(uclock, p.b.exp) * Math.pow(p.boost, p.b.boostExp);
        else power = build * p.base * Math.pow(uclock, EXP);
        sh = build * shards(uclock); sl = build * (p.sloops || 0);
      }
      return {p, x, rate: x * (p.out[p.item] || 0), build, uclock, power, shards: sh, sloops: sl};
    });
    const all = new Set([...Object.keys(prod), ...Object.keys(cons), ...Object.keys(res.d)]);
    const balance = {};
    const sup = res.supply || {};
    for (const i of all) balance[i] = {prod: prod[i] || 0, cons: cons[i] || 0, target: res.d[i] || 0, supply: sup[i] || 0, net: (prod[i] || 0) + (sup[i] || 0) - (cons[i] || 0) - (res.d[i] || 0)};
    const raw = {};
    for (const r of rows) if (r.p.kind === "extract" || r.p.kind === "manual" || r.p.kind === "import") {
      const k = r.p.item; raw[k] = raw[k] || {item: k, rate: 0, build: 0, kinds: new Set(), names: new Set()};
      raw[k].rate += r.rate; raw[k].build += r.build || 0; raw[k].kinds.add(r.p.kind);
    }
    let score = 0; for (const k in raw) if (raw[k].kinds.has("extract") || raw[k].kinds.has("manual")) score += raw[k].rate * rawWeight(k) / 1e4;
    // energía: consumo real (máquinas enteras con reloj uniforme) + Pressurizers; generación de los generadores
    const wellX = {}; for (const r of rows) if (r.p.kind === "extract" && r.p.ext === "well" && r.build) wellX[r.p.item] = (wellX[r.p.item] || 0) + r.build;
    const press = Object.keys(wellX).map(item => { const c = extCfg(cfg, item), n = +c.wells || 0; return {item, wells: n, extractors: wellX[item], clock: c.clock, power: pressPower(cfg, item)}; });
    const pressMW = press.reduce((a, p) => a + p.power, 0);
    const consMW = rows.reduce((a, r) => a + (r.power > 0 ? r.power : 0), 0) + pressMW, genMW = -rows.reduce((a, r) => a + (r.power < 0 ? r.power : 0), 0);
    const grid = sup[POWER] || 0;
    const energy = {on: !!res.energy, cons: consMW, gen: genMW, grid, press, pressMW, balance: genMW + grid - consMW, missingWells: press.filter(p => !p.wells).map(p => p.item)};
    return {rows, balance, raw: Object.values(raw), score, d: res.d, error: res.error, scale: res.scale, energy};
  }

  // profundidad (consumidores arriba) sobre el grafo del plan
  function depths(res) {
    const by = {}; for (const s of res.steps) (by[s.p.item] = by[s.p.item] || []).push(s.p);
    const memo = {}, st = new Set();
    const dep = i => {
      if (i in memo) return memo[i];
      if (st.has(i)) return 0;
      st.add(i); let m = 0;
      for (const p of by[i] || []) for (const j in p.in) if (j !== POWER) m = Math.max(m, 1 + dep(j));
      st.delete(i); return memo[i] = m;
    };
    const o = {}; for (const i in by) o[i] = dep(i); return o;
  }

  function solve(cfg, plan, targets) { return (plan.mode === "opt" ? solveOpt : solveManual)(cfg, plan, targets); }
  function costPerUnit(cfg, plan, item) {
    const p2 = Object.assign({}, plan, {maximize: false});
    const a = analyze(cfg, solve(cfg, p2, [{item, rate: 1}]));
    return {score: a.score, error: a.error};
  }
  return {POWER, init, options, defaultSel, selOf, proc, solveManual, solveOpt, solve, reach, pressAll, analyze, depths, simplex, costPerUnit, rawWeight, shards, extCfg, recCfg, allowed, pressPower, isGen, get R() { return R; }, get PRIM() { return PRIM; }, get OPTS() { return OPTS; }};
})();
if (typeof module !== "undefined") module.exports = Engine;
