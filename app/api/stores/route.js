import { NextResponse } from "next/server";
import { findStores } from "../../../lib/tacobell";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  if (!lat || !lng)
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  try {
    return NextResponse.json(await findStores(lat, lng));
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
