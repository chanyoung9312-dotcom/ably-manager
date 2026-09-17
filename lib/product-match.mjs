import { text } from "./dates.mjs";
import { parseMd } from "./commerce.mjs";
import { columnLetter } from "./shipping.mjs";
const normalized = (v) =>
  text(v).normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
export function matchProducts(values, goods) {
  const warnings = [],
    cards = parseMd(values, warnings);
  if (warnings.length)
    throw new Error("MD 카드 라벨이 중복됩니다. 카드 경계를 확인하세요.");
  if (
    !Array.isArray(goods) ||
    !goods.length ||
    goods.length > 20000 ||
    goods.some(
      (g) =>
        !g ||
        typeof g.productNo !== "string" ||
        !text(g.productNo) ||
        typeof g.name !== "string",
    )
  )
    throw new Error("유효한 상품목록이 필요합니다.");
  const unique = new Map();
  for (const g of goods) {
    const no = text(g.productNo);
    if (
      unique.has(no) &&
      normalized(unique.get(no).name) !== normalized(g.name)
    )
      throw new Error("동일 상품번호의 상품명이 다릅니다. 목록을 확인하세요.");
    unique.set(no, g);
  }
  return cards
    .filter((p) => p.productNoRow)
    .map((p) => {
      const matches = [...unique.values()].filter(
        (g) => normalized(g.name) === normalized(p.product),
      );
      const base = {
        ...p,
        cell: `${columnLetter(p.productNoCol)}${p.productNoRow}`,
        existing: p.productNo,
      };
      if (p.productNo) return { ...base, status: "기존값 유지" };
      return matches.length === 1
        ? {
            ...base,
            productNo: text(matches[0].productNo),
            ablyName: matches[0].name,
            status: "확정",
            reason: "전체 상품명 일치 (옵션·괄호 보존)",
          }
        : {
            ...base,
            status: "확인 필요",
            reason: "상품명 또는 상품번호 모호 — 자동 입력 안 함",
          };
    });
}
