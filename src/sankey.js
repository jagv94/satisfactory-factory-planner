// Diagrama de flujo (Sankey) sin dependencias: materias primas a la izquierda, objetivos a la derecha.
const Sankey = (() => {
  const POWER = "Power_MW";  // la energía no se dibuja como flujo hacia cada máquina: solo combustible -> generadores
  function build(A, name, color, unit) {
    const nodes = {}, links = [];
    const node = i => nodes[i] = nodes[i] || {id: i, inV: 0, outV: 0, lvl: 0};
    for (const r of A.rows) {
      const p = r.p, main = p.item; node(main);
      for (const [j, q] of Object.entries(p.in)) { if (j === POWER) continue; const v = r.x * q; if (v > 1e-6) links.push({s: j, t: main, v}); node(j); }
      for (const [k, q] of Object.entries(p.out)) if (k !== main && k !== POWER) { const v = r.x * q; if (v > 1e-6) { links.push({s: main, t: k, v, by: true}); node(k); } }
    }
    for (const l of links) { nodes[l.s].outV += l.v; nodes[l.t].inV += l.v; }
    for (const [i, b] of Object.entries(A.balance)) if (nodes[i] && i !== POWER) { nodes[i].prod = b.prod; nodes[i].target = b.target; nodes[i].net = b.net; }
    // niveles: camino más largo desde las materias primas (calculado por el motor, seguro ante ciclos)
    for (const n of Object.values(nodes)) n.lvl = A.depth[n.id] ?? 0;
    for (const l of links) if (l.by && !(l.t in A.depth)) nodes[l.t].lvl = Math.max(nodes[l.t].lvl, nodes[l.s].lvl + 1);
    // los objetivos y sobrantes, al final
    const maxL = Math.max(0, ...Object.values(nodes).map(n => n.lvl));
    for (const n of Object.values(nodes)) if (n.outV < 1e-6 && n.lvl < maxL && (n.target > 0 || n.net > 1e-6 || n.id === POWER)) n.lvl = maxL;
    for (const n of Object.values(nodes)) n.v = Math.max(n.inV, n.outV + (n.target || 0) + Math.max(0, n.net || 0), n.prod || 0, 1e-6);
    // el nodo de energía mide lo que recibe (combustible y agua) pero se rotula con los MW generados
    if (nodes[POWER]) nodes[POWER].label = (A.balance[POWER] || {}).prod || 0;
    return {nodes: Object.values(nodes), links, maxL};
  }
  function draw(svg, A, o) {
    const g = build(A);
    const W = Math.max(svg.parentNode.clientWidth || 800, (g.maxL + 1) * 190), cols = g.maxL + 1;
    const byL = Array.from({length: cols}, () => []);
    for (const n of g.nodes) byL[n.lvl].push(n);
    const pad = 6, labelW = 170, top = 8, minH = 17;
    const maxCount = Math.max(1, ...byL.map(c => c.length));
    const sumMax = Math.max(...byL.map(c => c.reduce((a, n) => a + n.v, 0)));
    const H = Math.max(420, maxCount * (minH + pad) + 160);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.style.width = W + "px"; svg.style.height = H + "px";
    const ky = Math.min(...byL.filter(c => c.length).map(c => Math.max(1e-6, H - top * 2 - c.length * (minH + pad)) / c.reduce((a, n) => a + n.v, 0)), (H - top * 2) / sumMax);
    const nodeW = 12, x0 = 6, dx = cols > 1 ? (W - labelW - x0 - nodeW) / (cols - 1) : 0;
    byL.forEach((c, l) => {
      c.sort((a, b) => b.v - a.v);
      let y = top;
      for (const n of c) { n.x = x0 + l * dx; n.y = y; n.h = Math.max(3, n.v * ky); n.so = 0; n.to = 0; y += Math.max(n.h, minH) + pad; }
    });
    const M = {}; g.nodes.forEach(n => M[n.id] = n);
    g.links.sort((a, b) => M[a.t].y - M[b.t].y || M[a.s].y - M[b.s].y);
    let s = "";
    for (const l of g.links) {
      const a = M[l.s], b = M[l.t], w = Math.max(1, l.v * ky);
      const y1 = a.y + a.so + w / 2, y2 = b.y + b.to + w / 2; a.so += w; b.to += w;
      const xa = a.x + nodeW, xb = b.x, mx = (xa + xb) / 2;
      s += `<path d="M${xa} ${y1}C${mx} ${y1} ${mx} ${y2} ${xb} ${y2}" fill="none" stroke="${o.color(l.s)}" stroke-opacity="${l.by ? .22 : .38}" stroke-width="${w}"${l.by ? ' stroke-dasharray="6 3"' : ""}><title>${o.esc(o.name(l.s))} → ${o.esc(o.name(l.t))}: ${o.fmt(l.v)} ${o.unit(l.s)}${l.by ? " (subproducto)" : ""}</title></path>`;
    }
    for (const n of g.nodes) {
      const last = n.lvl === g.maxL && cols > 1, tx = last ? n.x - 6 : n.x + nodeW + 6;
      const nv = n.label ?? n.v;
      s += `<rect x="${n.x}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="2" fill="${o.color(n.id)}" stroke="var(--ink)" stroke-opacity=".35"><title>${o.esc(o.name(n.id))}: ${o.fmt(nv)} ${o.unit(n.id)}</title></rect>`;
      s += `<text x="${tx}" y="${n.y + n.h / 2}" dy=".35em" text-anchor="${last ? "end" : "start"}" class="sk">${o.esc(o.name(n.id))} <tspan class="skv">${o.fmt(nv)}</tspan></text>`;
    }
    svg.innerHTML = s;
    return g;
  }
  return {build, draw};
})();
if (typeof module !== "undefined") module.exports = Sankey;
