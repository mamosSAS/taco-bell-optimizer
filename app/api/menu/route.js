import { NextResponse } from "next/server";
import { getMenu } from "../../../lib/tacobell";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");
  if (!storeId)
    return NextResponse.json({ error: "storeId required" }, { status: 400 });
  try {
    return NextResponse.json(await getMenu(storeId));
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
