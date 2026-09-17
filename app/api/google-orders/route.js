import { secure } from "../../../lib/access.mjs";
import { sheetHeaders, readSheet } from "../../../lib/sheets.mjs";
import { postalRows, claimIds } from "../../../lib/shipping.mjs";
async function handleGET() {
  try {
    const headers = await sheetHeaders();
    const [orders, claims] = await Promise.all([
      readSheet("에이블리 주문", "A:AS", headers),
      readSheet("취소 반품", "A:BA", headers),
    ]);
    const rows = postalRows(orders, { blocked: claimIds(claims) });
    return Response.json(
      { rows, count: rows.length, updatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e.message || "발송 주문 조회 실패" },
      { status: 502 },
    );
  }
}

export const GET = secure(handleGET);
