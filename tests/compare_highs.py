"""Compara el simplex propio con HiGHS (scipy).  Uso: node tests/export_lp_cases.js && python tests/compare_highs.py"""
import json, os, numpy as np
from scipy.optimize import linprog
cases = json.load(open(os.path.join(os.path.dirname(__file__), "lp_cases.json"))); bad = 0; worst = 0
for d in cases:
    n = d["n"]; A = []; b = []
    for r in d["rows"]:
        row = np.zeros(n)
        for k, v in r["a"].items(): row[int(k)] = v
        A.append(-row if r["op"] == ">=" else row); b.append(-r["b"] if r["op"] == ">=" else r["b"])
    res = linprog(d["c"], A_ub=np.array(A), b_ub=b, bounds=[(0, None)] * n, method="highs")
    hs = {0: "ok", 2: "infeasible", 3: "unbounded"}.get(res.status, str(res.status))
    if hs != d["status"]: bad += 1; print("ESTADO", d["name"], d["status"], hs); continue
    if hs == "ok":
        rel = abs(d["val"] - res.fun) / max(1e-9, abs(res.fun)); worst = max(worst, rel)
        if rel > 1e-6: bad += 1; print("VALOR", d["name"], d["val"], res.fun)
print(f"{len(cases)} casos · {bad} discrepancias · error relativo máximo {worst:.1e}")
