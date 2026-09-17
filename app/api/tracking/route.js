import { secure } from "../../../lib/access.mjs";
import { sheetHeaders, readSheet, writeCells } from "../../../lib/sheets.mjs";
import {
  postalRows,
  claimIds,
  planTracking,
  columnLetter,
} from "../../../lib/shipping.mjs";
async function handlePOST(req) {
  try {
    const { updates } = await req.json(),
      headers = await sheetHeaders(true);
    const [orders, claims] = await Promise.all([
      readSheet("에이블리 주문", "A:AS", headers),
      readSheet("취소 반품", "A:BA", headers),
    ]);
    const plan = planTracking(
      updates,
      postalRows(orders, { includeWritten: true, blocked: claimIds(claims) }),
    );
    const changed = plan.filter((x) => !x.unchanged);
    if (changed.length)
      await writeCells(
        changed.flatMap((x) => [
          {
            range: `'에이블리 주문'!${columnLetter(x.carrierCol)}${x.rowNumber}`,
            values: [["우체국"]],
          },
          {
            range: `'에이블리 주문'!${columnLetter(x.shippingCol)}${x.rowNumber}`,
            values: [[x.tracking]],
          },
        ]),
        headers,
      );
    const fresh = postalRows(
      await readSheet("에이블리 주문", "A:AS", headers),
      { includeWritten: true },
    );
    if (
      plan.some(
        (p) =>
          !fresh.some(
            (r) =>
              r.productOrderNo === p.productOrderNo &&
              r.shipping === p.tracking,
          ),
      )
    )
      return Response.json(
        {
          error:
            "저장 후 주문·송장 검증 실패. 시트 변경 여부를 직접 확인하세요.",
        },
        { status: 409 },
      );
    return Response.json({
      ok: true,
      count: changed.length,
      unchanged: plan.length - changed.length,
    });
  } catch (e) {
    return Response.json(
      { error: e.message || "송장 저장 결과를 확인하세요." },
      { status: 409 },
    );
  }
}

export const POST = secure(handlePOST);
