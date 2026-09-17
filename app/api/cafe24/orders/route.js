import { secure } from "../../../../lib/access.mjs";
import { withCafeSession } from "../../../../lib/cafe24-session";
import {
  requestCafe24Orders,
  normalizeCafe24Orders,
} from "../../../../lib/cafe24";
async function handleGET() {
  return withCafeSession(async (request) => {
    const result = await request(requestCafe24Orders);
    if (!result.ok)
      return {
        status: result.status,
        data: {
          error: "카페24 전체 주문 조회 실패. 부분 데이터는 표시하지 않습니다.",
        },
      };
    const rows = normalizeCafe24Orders(result.data);
    return {
      data: {
        rows,
        count: rows.length,
        range: result.data.range,
        connected: true,
      },
    };
  });
}

export const GET = secure(handleGET);
