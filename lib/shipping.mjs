import { columns, orderState } from "./commerce.mjs";
import { text } from "./dates.mjs";
const digits = (s) => text(s).replace(/\D/g, "");
const normalized = (s) =>
  text(s)
    .replace(/[\s,().-]/g, "")
    .toLowerCase();
export const shippingSnapshot = (o) =>
  JSON.stringify([
    o.productOrderNo,
    o.orderNo,
    o.name,
    o.phone,
    o.zip,
    o.address,
    o.detail,
  ]);
export function postalRows(
  values,
  { includeWritten = false, blocked = new Set() } = {},
) {
  const ix = columns(values, ["상품주문번호", "주문번호", "주문상태"]);
  const field = (r, ...names) => text(r[ix(...names)]);
  const required = [
    ["수취인명", "수령인명", "수령자명", "받는분"],
    [
      "수취인연락처",
      "수취인전화번호",
      "수령인연락처",
      "수령인휴대폰",
      "수령자휴대폰번호",
      "수령자연락처",
    ],
    ["우편번호", "수취인우편번호", "수령인우편번호"],
    ["주소", "배송지", "수취인주소", "수령인주소", "배송주소", "배송지주소"],
    ["배송관리"],
    ["택배사"],
  ];
  if (required.some((names) => ix(...names) < 0))
    throw new Error(
      "발송 필수 열을 찾지 못했습니다. 수취인·연락처·우편번호·주소·택배사·배송관리 헤더를 확인하세요.",
    );
  const rows = [],
    seen = new Set();
  for (let i = 1; i < values.length; i++) {
    const r = values[i],
      po = field(r, "상품주문번호");
    if (!po) continue;
    const status = field(r, "주문상태"),
      shipping = field(r, "배송관리");
    if (
      blocked.has(po) ||
      !["ready", "sold"].includes(orderState(status)) ||
      /배송완료|구매확정|N40|N50/.test(status)
    )
      continue;
    if (
      shipping !== "우체국 배송" &&
      !(includeWritten && /^\d{13}$/.test(shipping))
    )
      continue;
    if (seen.has(po))
      throw new Error(
        "발송 대상에 중복 상품주문번호가 있습니다. 시트 중복을 먼저 정리하세요.",
      );
    seen.add(po);
    const [name, phone, zip, address] = required
      .slice(0, 4)
      .map((names) => field(r, ...names));
    if (!name || !phone || !address || !/^\d{5}$/.test(zip))
      throw new Error(
        `발송 대상 ${i + 1}행의 수취인·연락처·주소·우편번호를 확인하세요.`,
      );
    const o = {
      id: po,
      rowNumber: i + 1,
      productOrderNo: po,
      orderNo: field(r, "주문번호"),
      name,
      phone: digits(phone),
      zip,
      address,
      detail: ".",
      memo: field(r, "배송메모", "배송시요청사항", "배송요청사항"),
      productName: field(r, "상품명"),
      optionInfo: field(r, "옵션", "옵션정보"),
      qty: field(r, "수량"),
      orderStatus: status,
      shipping,
      shippingCol: ix("배송관리"),
      carrierCol: ix("택배사"),
    };
    o.snapshot = shippingSnapshot(o);
    rows.push(o);
  }
  return rows;
}
export function claimIds(values) {
  const ix = columns(values, ["상품주문번호"]);
  return new Set(
    values
      .slice(1)
      .map((r) => text(r[ix("상품주문번호")]))
      .filter(Boolean),
  );
}
export function planTracking(updates, rows) {
  if (!Array.isArray(updates) || !updates.length || updates.length > 500)
    throw new Error("송장 요청은 1~500건이어야 합니다.");
  const byId = new Map(rows.map((r) => [r.productOrderNo, r])),
    seenOrders = new Set(),
    seenTracking = new Set();
  return updates.map((u) => {
    const po = text(u.productOrderNo),
      tracking = text(u.tracking),
      o = byId.get(po);
    if (!o || !po || !/^\d{13}$/.test(tracking))
      throw new Error("발송 대상 또는 13자리 송장번호를 확인하세요.");
    if (u.snapshot !== shippingSnapshot(o))
      throw new Error(
        "주문 또는 수취인 정보가 변경되었습니다. 다시 불러와 매칭하세요.",
      );
    if (seenOrders.has(po) || seenTracking.has(tracking))
      throw new Error(
        "주문 또는 송장 중복입니다. 합배송은 별도 확인이 필요합니다.",
      );
    seenOrders.add(po);
    seenTracking.add(tracking);
    if (o.shipping !== "우체국 배송" && o.shipping !== tracking)
      throw new Error(
        "이미 다른 송장이 등록되어 있습니다. 덮어쓰기를 중단했습니다.",
      );
    return { ...o, tracking, unchanged: o.shipping === tracking };
  });
}
export function parsePostalPaste(raw) {
  const lines = text(raw).split(/\r?\n/).map(text).filter(Boolean),
    out = [];
  for (let i = 0; i < lines.length; i++) {
    const tracking = lines[i].match(/\b\d{13}\b/)?.[0];
    if (!tracking) continue;
    let line = lines[i];
    for (
      let j = i + 1;
      j < lines.length && j <= i + 3 && !/\b\d{13}\b/.test(lines[j]);
      j++
    )
      line += " " + lines[j];
    out.push({ id: `${tracking}-${i}`, tracking, line });
  }
  return out;
}
export function matchTracking(pasted, orders) {
  const matches = pasted.map((p) => {
    const line = normalized(p.line);
    const candidates = orders.filter((o) => {
      if (!text(o.name) || !line.includes(normalized(o.name))) return false;
      const phone = digits(o.phone),
        address = normalized(o.address);
      return (
        (phone.length >= 9 && digits(p.line).includes(phone)) ||
        (address.length >= 8 && line.includes(address))
      );
    });
    return {
      ...p,
      match: candidates.length === 1 ? candidates[0] : null,
      status:
        candidates.length === 1
          ? "이름 + 연락처/주소 일치"
          : "추가 확인 필요 (이름만으로 매칭하지 않음)",
    };
  });
  for (const m of matches)
    if (
      matches.filter((x) => x.tracking === m.tracking).length > 1 ||
      (m.match &&
        matches.filter(
          (x) => x.match?.productOrderNo === m.match.productOrderNo,
        ).length > 1)
    ) {
      m.status = "중복 매칭 확인 필요";
      m.conflict = true;
    }
  return matches.map((m) => (m.conflict ? { ...m, match: null } : m));
}
export const columnLetter = (i) => {
  let s = "";
  for (i++; i; i = Math.floor((i - 1) / 26))
    s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};
