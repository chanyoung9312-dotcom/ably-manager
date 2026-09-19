import { readSheet, sheetHeaders } from "./sheets.mjs";
import { buildCommerce } from "./commerce.mjs";

export async function loadDashboard() {
  const headers = await sheetHeaders();
  const [orders, claims, inventory, md] = await Promise.all([
    readSheet("에이블리 주문", "A:AS", headers),
    readSheet("취소 반품", "A:BA", headers),
    readSheet("재고 현황", "A:E", headers),
    readSheet("MD", "A:Z", headers),
  ]);
  const result = buildCommerce(orders, claims, inventory, md, {
    salesMode: process.env.OARS_SALES_PRICE_MODE,
  });
  result.coverageStart = process.env.OARS_ORDER_COVERAGE_START || null;
  result.coverageThrough = process.env.OARS_ORDER_COVERAGE_THROUGH || null;
  return result;
}
