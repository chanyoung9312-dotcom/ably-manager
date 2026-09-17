import { secure } from "../../../../lib/access.mjs";
import { withCafeSession } from "../../../../lib/cafe24-session";
import {
  requestCafe24Order,
  prepareCafe24Order,
  normalizeCafe24Orders,
} from "../../../../lib/cafe24";
async function handlePOST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 JSON 요청" }, { status: 400 });
  }
  const { orderId, orderItemCodes: codes } = body;
  if (
    typeof orderId !== "string" ||
    !Array.isArray(codes) ||
    !codes.length ||
    codes.length > 100 ||
    codes.some((c) => typeof c !== "string" || !c) ||
    new Set(codes).size !== codes.length
  )
    return Response.json(
      { error: "주문번호와 중복 없는 품주코드가 필요합니다." },
      { status: 400 },
    );
  return withCafeSession(async (request) => {
    const before = await request((token) => requestCafe24Order(token, orderId));
    if (!before.ok)
      return {
        status: before.status,
        data: { error: "변경 전 주문상태 확인 실패" },
      };
    const rows = normalizeCafe24Orders({ orders: [before.data.order] });
    if (
      codes.some(
        (c) =>
          !rows.some(
            (r) =>
              r.orderId === orderId && r.orderItemCode === c && r.canPrepare,
          ),
      )
    )
      return {
        status: 409,
        data: {
          error:
            "선택 품목이 신규 주문이 아니거나 배송지 확인이 필요합니다. 다시 조회하세요.",
        },
      };
    const changed = await request((token) =>
      prepareCafe24Order(token, orderId, codes),
    );
    if (!changed.ok)
      return {
        status: changed.status,
        data: { error: "배송준비 변경 결과를 확인하세요." },
      };
    const after = await request((token) => requestCafe24Order(token, orderId));
    if (!after.ok)
      return {
        status: 502,
        data: {
          error:
            "변경 후 재조회 실패. 다시 주문을 불러와 처리 결과를 확인하세요.",
        },
      };
    const fresh = normalizeCafe24Orders({ orders: [after.data.order] });
    if (
      codes.some(
        (c) => !fresh.some((r) => r.orderItemCode === c && r.status === "N20"),
      )
    )
      return {
        status: 409,
        data: {
          error:
            "일부 품목의 배송준비 상태가 확인되지 않았습니다. 다시 조회하세요.",
        },
      };
    return { data: { ok: true, orderId, orderItemCodes: codes } };
  });
}

export const POST = secure(handlePOST);
