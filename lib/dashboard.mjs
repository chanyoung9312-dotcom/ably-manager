import { readSheet, sheetHeaders } from "./sheets.mjs";
import { buildCommerce, columns } from "./commerce.mjs";
import { identifier } from "./dates.mjs";

function removeClaimCopyNoise(result, orders, claims) {
  if (!orders.length || !claims.length) return result;
  const orderIx = columns(orders);
  const claimIx = columns(claims);
  const orderProductOrder = orderIx("상품주문번호");
  const claimProductOrder = claimIx("상품주문번호");
  if (orderProductOrder < 0 || claimProductOrder < 0) return result;

  const sourceIds = new Set(
    orders
      .slice(1)
      .map((row) => identifier(row[orderProductOrder]))
      .filter(Boolean),
  );
  const duplicateClaimRows = new Set();
  claims.slice(1).forEach((row, index) => {
    const id = identifier(row[claimProductOrder]);
    if (id && sourceIds.has(id)) duplicateClaimRows.add(index + 2);
  });

  // buildCommerce also parses the claim sheet as a fallback source for orders
  // that were physically moved out of the order sheet. Validation warnings
  // produced while parsing copies that still exist in the authoritative order
  // sheet are not real order-ledger errors and must not block MD decisions.
  const isDuplicateClaimOrderMessage = (message) => {
    const match = /^주문 (\d+)행:/.exec(message || "");
    return !!match && duplicateClaimRows.has(Number(match[1]));
  };

  result.warnings = result.warnings.filter(
    (message) => !isDuplicateClaimOrderMessage(message),
  );
  result.issues = result.issues.filter(
    (entry) => !isDuplicateClaimOrderMessage(entry?.message),
  );
  return result;
}

export async function loadDashboard() {
  const headers = await sheetHeaders();
  const [orders, claims, inventory, md] = await Promise.all([
    readSheet("에이블리 주문", "A:AS", headers),
    readSheet("취소 반품", "A:BA", headers),
    readSheet("재고 현황", "A:E", headers),
    readSheet("MD", "A:Z", headers),
  ]);
  const result = removeClaimCopyNoise(
    buildCommerce(orders, claims, inventory, md, {
      salesMode: process.env.OARS_SALES_PRICE_MODE,
    }),
    orders,
    claims,
  );
  result.coverageStart = process.env.OARS_ORDER_COVERAGE_START || null;
  return result;
}
