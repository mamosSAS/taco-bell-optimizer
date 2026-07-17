// Exact cost minimizer: find the cheapest set of purchases (à la carte items
// and/or box/combo configurations with swaps) covering AT LEAST the demanded
// items. Extras are free bonuses; ties prefer fewer purchases.

// Enumerate the useful configurations of one bundle against the demand.
// Per slot the only meaningful choices are: a demanded item from its swap
// list (cheapest upcharge per code), or "leave the default" (covers the
// default code, which may itself be demanded).
function bundleOffers(bundle, demand) {
  let configs = [{ cost: bundle.price, covers: {}, swaps: [] }];
  for (const slot of bundle.slots) {
    const choices = [];
    const perCode = new Map();
    for (const opt of slot.options) {
      if (!(opt.code in demand)) continue;
      const prev = perCode.get(opt.code);
      if (!prev || opt.upcharge < prev.upcharge) perCode.set(opt.code, opt);
    }
    for (const opt of perCode.values()) choices.push(opt);
    // keep-default choice, only useful when the default isn't demanded
    if (!perCode.has(slot.defaultCode)) choices.push(null);

    const next = [];
    for (const cfg of configs) {
      for (const opt of choices) {
        if (!opt) {
          next.push(cfg);
          continue;
        }
        const covers = { ...cfg.covers };
        covers[opt.code] = (covers[opt.code] || 0) + slot.qty;
        const swaps = [...cfg.swaps];
        if (opt.code !== slot.defaultCode)
          swaps.push({ from: slot.defaultName, to: opt.name, upcharge: opt.upcharge * slot.qty });
        next.push({ cost: cfg.cost + opt.upcharge * slot.qty, covers, swaps });
      }
    }
    configs = next;
    if (configs.length > 20000) throw new Error("bundle config explosion"); // never in practice
  }
  // dedupe: cheapest config per coverage signature; drop configs covering nothing
  const best = new Map();
  for (const cfg of configs) {
    const codes = Object.keys(cfg.covers).sort();
    if (!codes.length) continue;
    const key = codes.map((c) => `${c}:${cfg.covers[c]}`).join(",");
    const prev = best.get(key);
    if (!prev || cfg.cost < prev.cost) best.set(key, cfg);
  }
  return [...best.values()].map((cfg) => ({
    kind: "bundle",
    label: bundle.name,
    price: cfg.cost,
    covers: cfg.covers,
    swaps: cfg.swaps,
  }));
}

// demand: {code: qty}; singles: [{code,name,price}]; bundles: [{name,price,slots}]
// Returns {total, picks, naive, unavailable} — picks aggregated with counts.
export function optimize(demand, singles, bundles) {
  const singleByCode = new Map(singles.map((s) => [s.code, s]));
  const offers = [];
  for (const code of Object.keys(demand)) {
    const s = singleByCode.get(code);
    if (s) offers.push({ kind: "single", label: s.name, price: s.price, covers: { [code]: 1 } });
  }
  for (const b of bundles) offers.push(...bundleOffers(b, demand));

  const codes = Object.keys(demand).sort();
  const coverable = new Set();
  for (const o of offers) for (const c of Object.keys(o.covers)) coverable.add(c);
  const unavailable = codes.filter((c) => !coverable.has(c));
  const activeCodes = codes.filter((c) => coverable.has(c));
  if (!activeCodes.length) return { total: 0, picks: [], naive: 0, unavailable };

  const offersByCode = new Map(activeCodes.map((c) => [c, offers.filter((o) => o.covers[c])]));

  // Branch on the first unmet item; any optimal solution's purchases each
  // cover ≥1 unmet unit, so this search is exhaustive. Memo on remaining state.
  const memo = new Map();
  function solve(remaining) {
    const key = activeCodes.map((c) => remaining[c]).join(",");
    const hit = memo.get(key);
    if (hit) return hit;
    const target = activeCodes.find((c) => remaining[c] > 0);
    if (!target) return { total: 0, picks: [] };
    let best = null;
    for (const offer of offersByCode.get(target)) {
      const next = { ...remaining };
      for (const [c, n] of Object.entries(offer.covers))
        if (c in next) next[c] = Math.max(0, next[c] - n);
      const sub = solve(next);
      const total = offer.price + sub.total;
      if (!best || total < best.total - 1e-9 ||
          (Math.abs(total - best.total) < 1e-9 && sub.picks.length + 1 < best.picks.length)) {
        best = { total, picks: [offer, ...sub.picks] };
      }
    }
    memo.set(key, best);
    return best;
  }

  const initial = {};
  for (const c of activeCodes) initial[c] = demand[c];
  const result = solve(initial);

  let naive = 0;
  let naiveComplete = true;
  for (const c of activeCodes) {
    const s = singleByCode.get(c);
    if (s) naive += s.price * demand[c];
    else naiveComplete = false;
  }

  // aggregate identical picks for display
  const agg = new Map();
  for (const p of result.picks) {
    const key = JSON.stringify([p.label, p.price, p.covers, p.swaps || null]);
    const e = agg.get(key);
    if (e) e.count++;
    else agg.set(key, { ...p, count: 1 });
  }

  return {
    total: Math.round(result.total * 100) / 100,
    picks: [...agg.values()],
    naive: naiveComplete ? Math.round(naive * 100) / 100 : null,
    unavailable,
  };
}
