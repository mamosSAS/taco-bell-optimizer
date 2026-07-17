import { NextResponse } from "next/server";
import { getMenu, getBundle } from "../../../lib/tacobell";
import { optimize } from "../../../lib/optimize";

// POST {stores: [{storeNumber, name, address, distance}], demand: {code: qty}}
// Optimizes the order independently at each store using that store's own
// prices, menu availability, and swap upcharges.
export async function POST(request) {
  const { stores, demand } = await request.json();
  if (!stores?.length || !demand || !Object.keys(demand).length)
    return NextResponse.json({ error: "stores and demand required" }, { status: 400 });

  const results = await Promise.all(
    stores.map(async (store) => {
      try {
        const menu = await getMenu(store.storeNumber);
        const bundles = (
          await Promise.all(
            menu.bundles
              .filter((b) => b.url)
              .map((b) =>
                getBundle(store.storeNumber, b.url, b.code, b.price).catch(() => null)
              )
          )
        ).filter((b) => b && b.slots.length);
        return { store, ...optimize(demand, menu.singles, bundles) };
      } catch (e) {
        return { store, error: String(e.message || e) };
      }
    })
  );

  results.sort((a, b) => (a.error ? 1 : 0) - (b.error ? 1 : 0) || (a.total ?? 1e9) - (b.total ?? 1e9));
  return NextResponse.json(results);
}
