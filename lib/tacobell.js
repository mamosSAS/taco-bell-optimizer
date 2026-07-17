// Taco Bell API client: store lookup, per-store menus, and box/combo
// contents with per-store swap pricing (parsed from PDP __NEXT_DATA__).

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const BASE = "https://www.tacobell.com";

// ponytail: in-memory cache, per-process. Fine for a single local server;
// swap for Redis if this ever runs serverless/multi-instance.
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const data = await fn();
  cache.set(key, { exp: Date.now() + ttlMs, data });
  return data;
}

// tacobell.com intermittently 403s (Akamai); one retry usually clears it
async function fetchOk(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res;
    last = res.status;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  throw new Error(`${last} from ${url}`);
}

const fetchJson = (url) => fetchOk(url).then((r) => r.json());

export async function findStores(lat, lng) {
  return cached(`stores:${lat},${lng}`, 10 * 60_000, async () => {
    const data = await fetchJson(
      `${BASE}/tacobellwebservices/v2/tacobell/stores?latitude=${lat}&longitude=${lng}&numberOfStores=10`
    );
    return (data.nearByStores || []).map((s) => ({
      storeNumber: s.storeNumber,
      name: s.name,
      address: [
        s.address?.line1,
        s.address?.town,
        s.address?.region?.isocodeShort || s.address?.region?.isocode,
      ].filter(Boolean).join(", "),
      distance: s.formattedDistance,
      status: s.storeStatus,
    }));
  });
}

const isDrinkCategory = (code) => code === "drinks";

export async function getMenu(storeId) {
  return cached(`menu:${storeId}`, 60 * 60_000, async () => {
    const data = await fetchJson(
      `${BASE}/tacobellwebservices/v2/tacobell/products/menu/${storeId}`
    );
    // ponytail: sauce cups/packets and add-on portions in Sides & sweets are
    // all ≤$1.00 while the cheapest real side is ~$1.89; a price threshold
    // beats a name list. Collected up front because the same packet can also
    // appear in other categories (e.g. New) and should vanish there too.
    const addOnCodes = new Set(
      (data.menuProductCategories || [])
        .filter((c) => c.code === "sides-sweets")
        .flatMap((c) => c.products || [])
        .filter((p) => (p.price?.value ?? 0) < 1.5)
        .map((p) => p.code)
    );

    const byCode = new Map();
    const bundleCodes = new Set();
    const cats = [];
    for (const cat of data.menuProductCategories || []) {
      if (isDrinkCategory(cat.code)) continue;
      cats.push({ code: cat.code, name: cat.name });
      for (const p of cat.products || []) {
        if (addOnCodes.has(p.code)) continue;
        const price = p.price?.value;
        // an item can appear in several categories (e.g. Best sellers AND
        // Burritos) — keep one record, list every category it belongs to
        const existing = byCode.get(p.code);
        if (existing) {
          if (!existing.categories.includes(cat.name)) existing.categories.push(cat.name);
          continue;
        }
        // drinks also leak into other categories (freezes/dirty sodas under
        // "New") — foodType is the reliable marker, isFountain alone is not
        if (!p.purchasable || !p.isAvailableInStore || !price || p.isFountain) continue;
        if (p.foodType === "Sellable_drink") continue;
        byCode.set(p.code, {
          code: p.code,
          name: p.name,
          price,
          categories: [cat.name],
          calories: p.calories,
          image: p.images?.[0]?.url || null,
          url: p.url || null,
        });
        if (p.productGroups?.length) bundleCodes.add(p.code);
      }
    }
    // Luxe value menu sells the tool's premise — surface it right after New
    const li = cats.findIndex((c) => c.code === "luxe-value-menu");
    const ni = cats.findIndex((c) => c.code === "new");
    if (li >= 0 && ni >= 0) {
      const [luxe] = cats.splice(li, 1);
      cats.splice(cats.findIndex((c) => c.code === "new") + 1, 0, luxe);
    }

    const all = [...byCode.values()];
    return {
      categories: cats.map((c) => c.name),
      singles: all.filter((i) => !bundleCodes.has(i.code)),
      bundles: all.filter((i) => bundleCodes.has(i.code)),
    };
  });
}

// Parse a bundle's product-detail page for its slots and swap options.
// `?store=` scopes prices to the store (verified: upcharges differ by store).
export async function getBundle(storeId, urlPath, code, price) {
  return cached(`bundle:${storeId}:${code}`, 60 * 60_000, async () => {
    const res = await fetchOk(`${BASE}${urlPath}?store=${storeId}`);
    const html = await res.text();
    const m = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s
    );
    if (!m) throw new Error(`no __NEXT_DATA__ in ${urlPath}`);
    const product = JSON.parse(m[1])?.props?.pageProps?.product;
    if (!product?.productGroups) return null;

    const slots = [];
    for (const g of product.productGroups) {
      if (g.drinkSwap) continue; // drinks are ignored per spec
      const def = g.defaultBaseProduct || g.defaultVariantProduct || {};
      const qty = g.defaultQuantity || 1;
      const options = [];
      const seen = new Set();
      for (const s of g.swapList || []) {
        const upcharge = s.price?.value;
        if (s.code == null || upcharge == null || s.isFountain) continue;
        if (seen.has(s.code)) continue;
        seen.add(s.code);
        options.push({ code: s.code, name: s.name, upcharge });
      }
      if (def.code && !seen.has(def.code)) {
        options.unshift({ code: def.code, name: def.name, upcharge: 0 });
      }
      if (!options.length) continue;
      // ponytail: a multi-quantity slot swaps as one block (all N units take
      // the same option). Per-unit choice would need per-unit groups from the API.
      slots.push({ defaultCode: def.code, defaultName: def.name, qty, options });
    }
    return { code, name: product.name, price, slots };
  });
}
