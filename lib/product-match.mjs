import { text, dateKey } from "./dates.mjs";
import { parseMd } from "./commerce.mjs";
import { columnLetter } from "./shipping.mjs";

const normalized = (v) =>
  text(v).normalize("NFKC").replace(/\s+/g, " ").toLowerCase();

const dateOrEmpty = (value) => dateKey(value) || "";

function registrationMatch(card, goodsById, nameMatches) {
  const byId = card.productNo ? goodsById.get(card.productNo) : null;
  const trusted =
    byId && normalized(byId.name) === normalized(card.product)
      ? byId
      : !card.productNo && nameMatches.length === 1
        ? nameMatches[0]
        : null;

  if (!card.registeredAtRow)
    return {
      status: "라벨 없음",
      value: "",
      reason: "MD 카드에 상품등록일 라벨이 없습니다.",
      cell: null,
    };

  const cell = `${columnLetter(card.registeredAtCol)}${card.registeredAtRow}`;
  if (card.registeredAt)
    return {
      status: "기존값 유지",
      value: card.registeredAt,
      reason: "MD에 상품등록일이 이미 있습니다.",
      cell,
    };

  if (!trusted)
    return {
      status: "확인 필요",
      value: "",
      reason: card.productNo && byId
        ? "상품번호는 일치하지만 상품명이 달라 등록일을 자동 입력하지 않습니다."
        : "상품번호 또는 상품명으로 등록일 출처를 하나로 확정할 수 없습니다.",
      cell,
    };

  const sourceDate = dateOrEmpty(trusted.registeredAt);
  if (!sourceDate)
    return {
      status: "확인 필요",
      value: "",
      reason: text(trusted.registeredAt)
        ? "에이블리 상품목록의 상품등록일 형식을 확인해야 합니다."
        : "에이블리 상품목록에 상품등록일이 없습니다.",
      cell,
    };

  return {
    status: "확정",
    value: sourceDate,
    reason: "에이블리 상품목록의 동일 상품 등록일",
    cell,
  };
}

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
    const previous = unique.get(no);
    if (previous && normalized(previous.name) !== normalized(g.name))
      throw new Error("동일 상품번호의 상품명이 다릅니다. 목록을 확인하세요.");

    const previousDate = previous ? dateOrEmpty(previous.registeredAt) : "";
    const nextDate = dateOrEmpty(g.registeredAt);
    if (previousDate && nextDate && previousDate !== nextDate)
      throw new Error("동일 상품번호의 상품등록일이 다릅니다. 목록을 확인하세요.");

    unique.set(no, {
      ...previous,
      ...g,
      productNo: no,
      name: previous?.name || g.name,
      registeredAt: previousDate || nextDate || text(g.registeredAt),
    });
  }

  const goodsList = [...unique.values()];
  return cards
    .filter((p) => p.productNoRow)
    .map((p) => {
      const matches = goodsList.filter(
        (g) => normalized(g.name) === normalized(p.product),
      );
      const base = {
        ...p,
        cell: `${columnLetter(p.productNoCol)}${p.productNoRow}`,
        existing: p.productNo,
      };

      let result;
      if (p.productNo) result = { ...base, status: "기존값 유지" };
      else if (matches.length === 1)
        result = {
          ...base,
          productNo: text(matches[0].productNo),
          ablyName: matches[0].name,
          status: "확정",
          reason: "전체 상품명 일치 (옵션·괄호 보존)",
        };
      else
        result = {
          ...base,
          status: "확인 필요",
          reason: "상품명 또는 상품번호 모호 — 자동 입력 안 함",
        };

      return {
        ...result,
        registration: registrationMatch(result, unique, matches),
      };
    });
}
