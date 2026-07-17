"use client";
import { useState } from "react";

const money = (n) => `$${n.toFixed(2)}`;

export default function Home() {
  const [status, setStatus] = useState("");
  const [stores, setStores] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [zip, setZip] = useState("");
  const [menu, setMenu] = useState(null);
  const [demand, setDemand] = useState({}); // code -> qty
  const [names, setNames] = useState({}); // code -> name, for result display
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadStores(lat, lng) {
    setStatus("Finding nearby Taco Bells…");
    try {
      const res = await fetch(`/api/stores?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!data.length) return setStatus("No Taco Bells found near there.");
      setStores(data);
      setSelected(new Set(data.slice(0, 5).map((s) => s.storeNumber)));
      setStatus("");
      loadMenu(data[0].storeNumber);
    } catch (e) {
      setStatus(`Store lookup failed: ${e.message}`);
    }
  }

  function useGeolocation() {
    if (!navigator.geolocation) return setStatus("Geolocation unavailable — enter a ZIP.");
    setStatus("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => loadStores(pos.coords.latitude, pos.coords.longitude),
      () => setStatus("Location denied — enter a ZIP code instead.")
    );
  }

  async function useZip(e) {
    e.preventDefault();
    if (!/^\d{5}$/.test(zip)) return setStatus("Enter a 5-digit ZIP code.");
    setStatus("Looking up ZIP…");
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (!res.ok) throw new Error("ZIP not found");
      const data = await res.json();
      const place = data.places[0];
      loadStores(place.latitude, place.longitude);
    } catch (e2) {
      setStatus(`ZIP lookup failed: ${e2.message}`);
    }
  }

  async function loadMenu(storeId) {
    setStatus("Loading menu…");
    try {
      const res = await fetch(`/api/menu?storeId=${storeId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMenu(data);
      setNames(Object.fromEntries(data.singles.map((s) => [s.code, s.name])));
      setStatus("");
    } catch (e) {
      setStatus(`Menu load failed: ${e.message}`);
    }
  }

  function bump(code, delta) {
    setDemand((d) => {
      const next = { ...d, [code]: Math.max(0, (d[code] || 0) + delta) };
      if (!next[code]) delete next[code];
      return next;
    });
    setResults(null);
  }

  async function runOptimize() {
    const chosen = stores.filter((s) => selected.has(s.storeNumber));
    if (!chosen.length) return setStatus("Select at least one store.");
    setBusy(true);
    setResults(null);
    setStatus("Optimizing… first run per store fetches box details, give it ~15s.");
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stores: chosen, demand }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data);
      setStatus("");
    } catch (e) {
      setStatus(`Optimization failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const categories = menu
    ? [...new Set(menu.singles.map((s) => s.category))]
    : [];
  const cartCount = Object.values(demand).reduce((a, b) => a + b, 0);

  return (
    <main>
      <header>
        <h1>🌮 Taco Bell Order Optimizer</h1>
        <p>Pick what you want — we find the cheapest boxes, combos, and swaps to get it.</p>
      </header>

      <section>
        <h2>1. Where are you?</h2>
        <div className="row">
          <button onClick={useGeolocation}>📍 Use my location</button>
          <form onSubmit={useZip} className="row">
            <input
              placeholder="or ZIP code"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              maxLength={5}
              inputMode="numeric"
            />
            <button type="submit">Go</button>
          </form>
        </div>
        {stores.length > 0 && (
          <ul className="stores">
            {stores.map((s) => (
              <li key={s.storeNumber}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(s.storeNumber)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      e.target.checked ? next.add(s.storeNumber) : next.delete(s.storeNumber);
                      setSelected(next);
                    }}
                  />
                  <strong>{s.address}</strong> · {s.distance} ·{" "}
                  <span className={s.status === "openNow" ? "open" : "closed"}>
                    {s.status === "openNow" ? "open" : s.status}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {menu && (
        <section>
          <h2>2. What do you want? <small>(drinks excluded)</small></h2>
          {categories.map((cat) => (
            <details key={cat} open={cat === "Tacos" || cat === "Burritos"}>
              <summary>{cat}</summary>
              <ul className="items">
                {menu.singles
                  .filter((s) => s.category === cat)
                  .map((s) => (
                    <li key={s.code}>
                      <span className="item-name">
                        {s.name} <small>{money(s.price)}{s.calories ? ` · ${s.calories} cal` : ""}</small>
                      </span>
                      <span className="stepper">
                        <button onClick={() => bump(s.code, -1)} disabled={!demand[s.code]}>−</button>
                        <b>{demand[s.code] || 0}</b>
                        <button onClick={() => bump(s.code, 1)}>+</button>
                      </span>
                    </li>
                  ))}
              </ul>
            </details>
          ))}
        </section>
      )}

      {cartCount > 0 && (
        <section className="cart">
          <h2>3. Optimize</h2>
          <p>
            {Object.entries(demand)
              .map(([c, q]) => `${q}× ${names[c] || c}`)
              .join(", ")}
          </p>
          <button className="primary" onClick={runOptimize} disabled={busy}>
            {busy ? "Optimizing…" : `Find cheapest order (${cartCount} item${cartCount > 1 ? "s" : ""})`}
          </button>
        </section>
      )}

      {status && <p className="status">{status}</p>}

      {results && (
        <section>
          <h2>Results <small>(cheapest store first)</small></h2>
          {results.map((r, i) => (
            <div className={`result ${i === 0 && !r.error ? "best" : ""}`} key={r.store.storeNumber}>
              <div className="result-head">
                <strong>{r.store.address}</strong> <small>· {r.store.distance}</small>
                {!r.error && <span className="total">{money(r.total)}</span>}
              </div>
              {r.error ? (
                <p className="status">Couldn’t price this store: {r.error}</p>
              ) : (
                <>
                  {r.naive != null && r.naive > r.total + 0.001 && (
                    <p className="savings">
                      You save {money(r.naive - r.total)} vs. ordering à la carte ({money(r.naive)})
                    </p>
                  )}
                  <ul className="picks">
                    {r.picks.map((p, j) => (
                      <li key={j}>
                        <b>{p.count > 1 ? `${p.count}× ` : ""}{p.label}</b> — {money(p.price * p.count)}
                        {p.swaps?.map((sw, k) => (
                          <div className="swap" key={k}>
                            ↳ swap {sw.from} → {sw.to}
                            {sw.upcharge > 0 ? ` (+${money(sw.upcharge)})` : " (free)"}
                          </div>
                        ))}
                      </li>
                    ))}
                  </ul>
                  {r.unavailable?.length > 0 && (
                    <p className="status">
                      Not available at this store: {r.unavailable.map((c) => names[c] || c).join(", ")}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </section>
      )}

      <footer>
        Prices and swaps come live from tacobell.com for each store. Not affiliated with Taco Bell.
      </footer>
    </main>
  );
}
