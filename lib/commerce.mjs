import { text, dateKey, numberOrNull, identifier } from "./dates.mjs";
// Keep human-readable warnings separate from machine-readable decision blockers.
// Missing order/claim identity leaves the affected ledger population unknown.
function issue(warnings, issues, message, productNos = [], localKey = null) {
  warnings.push(message);
  const ids = [...new Set(productNos.filter(Boolean))];
  issues.push({
    scope: ids.length || localKey ? "product" : "ledger",
    productNos: ids,
    productKey: localKey,
    message,
  });
}
const compact = (s) => text(s).replace(/\s+/g, "");
export function columns(rows, required = []) {
  const h = (rows[0] || []).map(compact);
  const index = (...names) => {
    for (const name of names) {
      const i = h.lastIndexOf(compact(name));
      if (i >= 0) return i;
    }
    return -1;
  };
  for (const name of required)
    if (index(name) < 0)
      throw new Error(
        `필수 열 '${name}'을 찾지 못했습니다. 시트 헤더를 확인하세요.`,
      );
  return index;
}
const get = (row, index, ...names) => text(row[index(...names)]);
export function orderState(status) {
  const s = compact(status);
  if (/^(취소완료|취소|C40|C41|C42|C43|C47|C48|C49)$/.test(s))
    return "cancelled";
  if (/^(반품완료|반품처리완료|R40)$/.test(s)) return "returned";
  if (/취소|반품|교환|환불|^[CRE]\d\d$/.test(s)) return "claim";
  if (/미입금|입금전|결제대기|^N00$|^N02$/.test(s)) return "unpaid";
  if (/^(상품준비중|배송준비중|결제완료|주문확인|신규주문|N10|N20)$/.test(s))
    return "ready";
  if (/^(배송중|배송완료|구매확정|배송대기|N21|N30|N40|N50)$/.test(s))
    return "sold";
  return "unknown";
}
function parseOrder(row, ix, rowNumber, mode, warnings, issues) {
  const po = identifier(get(row, ix, "상품주문번호"));
  if (!po) return null;
  const ids = [identifier(get(row, ix, "상품번호"))];
  const qty = numberOrNull(get(row, ix, "수량"));
  if (!Number.isInteger(qty) || qty <= 0) {
    issue(warnings, issues, `주문 ${rowNumber}행: 수량 오류로 집계 제외`, ids);
    return null;
  }
  const salePrice = numberOrNull(get(row, ix, "판매가"));
  const status = get(row, ix, "주문상태");
  const date = dateKey(get(row, ix, "결제일", "결제일시"));
  if (!date)
    issue(warnings, issues, `주문 ${rowNumber}행: 결제일 확인 필요`, ids);
  if (salePrice === null || salePrice < 0)
    issue(warnings, issues, `주문 ${rowNumber}행: 판매가 확인 필요`, ids);
  const state = orderState(status);
  if (state === "unknown")
    issue(warnings, issues, `주문 ${rowNumber}행: 주문상태 확인 필요`, ids);
  return {
    row: rowNumber,
    productOrder: po,
    orderNo: identifier(get(row, ix, "주문번호")),
    productNo: identifier(get(row, ix, "상품번호")),
    product: get(row, ix, "상품명"),
    option: get(row, ix, "옵션", "옵션정보"),
    date,
    qty,
    salePrice,
    paid: numberOrNull(get(row, ix, "결제액")),
    sales:
      salePrice !== null && salePrice >= 0
        ? salePrice * (mode === "unit" ? qty : 1)
        : null,
    status,
    state,
  };
}
export function parseSalesRows(rows, mode = "line") {
  const ix = columns(rows, ["상품주문번호", "상품번호", "상품명", "수량", "판매가"]);
  return rows.slice(1).map((row, i) => {
    const qty = numberOrNull(get(row, ix, "수량"));
    const salePrice = numberOrNull(get(row, ix, "판매가"));
    if (!Number.isInteger(qty) || qty <= 0 || salePrice === null || salePrice < 0) return null;
    return {
      row: i + 2,
      productOrder: identifier(get(row, ix, "상품주문번호")),
      productNo: identifier(get(row, ix, "상품번호")),
      product: get(row, ix, "상품명"),
      date: dateKey(get(row, ix, "결제일", "결제일시")),
      qty,
      salePrice,
      sales: salePrice * (mode === "unit" ? qty : 1),
      status: get(row, ix, "주문상태"),
    };
  }).filter(Boolean);
}
export function parseOrders(rows, warnings = [], mode = "line", issues = []) {
  const ix = columns(rows, [
    "상품주문번호",
    "상품번호",
    "상품명",
    "수량",
    "판매가",
    "주문상태",
  ]);
  const byId = new Map(),
    conflicts = new Set();
  rows.slice(1).forEach((row, i) => {
    const o = parseOrder(row, ix, i + 2, mode, warnings, issues);
    if (!o) return;
    const old = byId.get(o.productOrder);
    if (old) {
      const same = [
        "orderNo",
        "productNo",
        "product",
        "option",
        "date",
        "qty",
        "salePrice",
        "status",
      ].every((k) => old[k] === o[k]);
      if (!same) {
        conflicts.add(o.productOrder);
        issue(
          warnings,
          issues,
          `주문 ${i + 2}행: 같은 상품주문번호의 값이 달라 집계 보류`,
          old.productNo && o.productNo ? [old.productNo, o.productNo] : [],
        );
      } else warnings.push(`주문 ${i + 2}행: 동일 상품주문번호 중복 제거`);
    } else byId.set(o.productOrder, o);
  });
  return [...byId.values()].filter((x) => !conflicts.has(x.productOrder));
}
export function parseClaims(
  rows,
  orders,
  warnings = [],
  issues = [],
  sourceProducts = new Map(),
) {
  const ix = columns(rows, ["상품주문번호"]);
  const byId = new Map(orders.map((o) => [o.productOrder, o])),
    grouped = new Map();
  rows.slice(1).forEach((row, i) => {
    const id = identifier(get(row, ix, "상품주문번호"));
    if (!id) return;
    const original = byId.get(id);
    if (!original) {
      issue(
        warnings,
        issues,
        `취소 반품 ${i + 2}행: 원주문 미매칭, 차감 보류`,
        sourceProducts.has(id)
          ? sourceProducts.get(id)
          : [identifier(get(row, ix, "상품번호"))],
      );
      return;
    }
    const status = get(row, ix, "주문상태"),
      reason = get(row, ix, "취소사유", "반품사유", "취소/반품사유", "사유");
    const state = orderState(status);
    const isDate = (v) =>
      !!dateKey(v) || /^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$/.test(text(v));
    const requestDate = get(
        row,
        ix,
        "반품요청",
        "반품신청일",
        "반품접수일",
        "반품요청일",
      ),
      doneValue = get(
        row,
        ix,
        "반품처리완료",
        "반품완료일",
        "반품처리",
        "반품처리일",
      );
    const returnDone =
      isDate(requestDate) &&
      (isDate(doneValue) || ["완료", "처리완료"].includes(doneValue));
    const isReturn =
      state === "returned" ||
      /반품/.test(status) ||
      returnDone ||
      isDate(requestDate);
    const procurement = get(
      row,
      ix,
      "발주",
      "발주일",
      "사입",
      "주문",
      "구매",
      "구매일",
      "발주여부",
    );
    const type = isReturn
      ? "return"
      : procurement && !["-", "취소", "미발주", "발주전"].includes(procurement)
        ? "after"
        : procurement
          ? "before"
          : "unknown";
    const complete = isReturn
      ? state === "returned" || returnDone
      : state === "cancelled";
    const quantityValue = get(row, ix, "취소수량", "반품수량", "수량");
    const q = numberOrNull(quantityValue);
    const valid = Number.isInteger(q) && q > 0 && q <= original.qty;
    const qty = valid
      ? q
      : (!quantityValue || quantityValue === "-") && original.qty === 1
        ? 1
        : null;
    if (qty === null)
      issue(
        warnings,
        issues,
        `취소 반품 ${i + 2}행: 부분 취소 수량 확인 필요`,
        [original.productNo],
      );
    const c = {
      ...original,
      type,
      reason: reason || "사유 미확인",
      claimStatus: status,
      complete,
      qty,
      sales:
        qty !== null && original.sales !== null
          ? (original.sales / original.qty) * qty
          : null,
      claimRow: i + 2,
    };
    const old = grouped.get(id);
    if (
      old &&
      ["type", "complete", "qty", "claimStatus"].some((k) => old[k] !== c[k])
    ) {
      grouped.set(id, {
        ...c,
        complete: false,
        qty: null,
        sales: null,
        conflict: true,
      });
      issue(
        warnings,
        issues,
        `취소 반품 ${i + 2}행: 중복 클레임 충돌, 차감 보류`,
        [original.productNo],
      );
    } else if (!old) grouped.set(id, c);
  });
  // Completed whole-line status is sufficient only for one-piece orders.
  for (const o of orders)
    if (
      !grouped.has(o.productOrder) &&
      ["cancelled", "returned"].includes(o.state)
    ) {
      const complete = o.qty === 1;
      if (!complete)
        issue(
          warnings,
          issues,
          `주문 ${o.row}행: 취소·반품 수량이 없어 차감 보류`,
          [o.productNo],
        );
      grouped.set(o.productOrder, {
        ...o,
        type: o.state === "returned" ? "return" : "unknown",
        complete,
        qty: complete ? 1 : null,
        sales: complete ? o.sales : null,
        reason: "주문상태 기준 · 사유 미확인",
      });
    }
  return [...grouped.values()];
}
export function parseInventory(rows, warnings = [], issues = []) {
  if (!rows.length) return [];
  const ix = columns(rows, ["상품번호", "상품명", "색상", "사이즈"]);
  const qi = ix("수량", "재고", "재고수량", "현재재고");
  if (qi < 0) throw new Error("재고 수량 헤더 확인 필요");
  rows = [
    rows[0],
    ...rows
      .slice(1)
      .map((r) => [
        r[ix("상품번호")],
        r[ix("상품명")],
        r[ix("색상")],
        r[ix("사이즈")],
        r[qi],
      ]),
  ];
  const out = [],
    seen = new Set();
  let productNo = "",
    product = "",
    color = "";
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r.some((v) => text(v))) {
      productNo = "";
      product = "";
      color = "";
      continue;
    }
    if (text(r[0])) {
      if (identifier(r[0]) !== productNo) {
        product = "";
        color = "";
      }
      productNo = identifier(r[0]);
    }
    if (text(r[1])) product = text(r[1]);
    if (text(r[2])) color = text(r[2]);
    const size = text(r[3]),
      qty = numberOrNull(r[4]);
    if (!productNo || (!size && qty === null)) continue;
    const invalid = qty === null || !Number.isInteger(qty) || qty < 0;
    const key = JSON.stringify([productNo, color, size]),
      duplicate = seen.has(key);
    seen.add(key);
    if (invalid || duplicate)
      issue(
        warnings,
        issues,
        `재고 ${i + 1}행: ${duplicate ? "동일 옵션 중복" : "수량 오류"}, 해당 상품 재고 판단 보류`,
        [productNo],
      );
    out.push({
      productNo,
      product,
      color,
      size,
      qty: invalid ? null : qty,
      invalid: invalid || duplicate,
      row: i + 1,
    });
  }
  return out;
}
export function parseMd(rows, warnings = [], issues = []) {
  // Support vertical cards. Bound each card by both row AND column to avoid borrowing a neighbour's ID.
  const starts = [];
  rows.forEach((r, ri) =>
    r.forEach((v, ci) => {
      if (compact(v) === "상품명") starts.push({ ri, ci });
    }),
  );
  const out = [];
  for (const { ri, ci } of starts) {
    const nextRow = Math.min(
      ...starts.filter((p) => p.ri > ri && p.ci === ci).map((p) => p.ri),
      rows.length,
    );
    let endRow = nextRow;
    for (let r = Math.max(ri + 2, nextRow - 3); r < nextRow; r++)
      if ((rows[r] || []).some((v) => compact(v) === "업로드날짜")) {
        endRow = r;
        break;
      }
    const nextCol = Math.min(
      ...starts.filter((p) => p.ri === ri && p.ci > ci).map((p) => p.ci),
      26,
    );
    const product = text(rows[ri + 1]?.[ci]);
    if (!product || product === "상품명") continue;
    const p = { product, productNo: "", date: "", row: ri + 2 };
    const cardErrors = [],
      cardIds = new Set();
    const fields = {
      업로드날짜: "date",
      상품등록일: "registeredAt",
      상품번호: "productNo",
      판매가격: "salePrice",
      md: "uploader",
      MD: "uploader",
      공급처배송기간: "leadDays",
      입고예정수량: "incoming",
      예약재고: "reserved",
      판매종료일: "seasonEnd",
    };
    for (let r = Math.max(0, ri - 3); r < endRow; r++)
      for (let c = ci; c < nextCol; c++) {
        const field = fields[compact(rows[r]?.[c])];
        if (!field) continue;
        const v = text(rows[r + 1]?.[c]);
        if (field === "productNo") {
          if (identifier(v)) cardIds.add(identifier(v));
          p.productNoRow = r + 2;
          p.productNoCol = c;
        }
        const value = ["date", "registeredAt", "seasonEnd"].includes(field)
          ? dateKey(v)
          : field === "productNo"
            ? identifier(v)
            : field === "uploader"
              ? text(v)
              : numberOrNull(v);
        if (p[field] !== undefined && p[field] !== "" && p[field] !== value)
          cardErrors.push(`MD ${ri + 2}행: ${field} 중복 라벨 확인 필요`);
        p[field] = value;
      }
    for (const message of cardErrors)
      issue(warnings, issues, message, [...cardIds], `unlinked:${p.row}`);
    out.push(p);
  }
  return out;
}
export function buildCommerce(ov, cv, iv, mv, options = {}) {
  const warnings = [],
    issues = [];
  const mode = options.salesMode || "line";
  if (!["line", "unit"].includes(mode))
    throw new Error("판매가 모드는 line 또는 unit이어야 합니다.");
  if (!options.salesMode)
    warnings.push(
      "판매가 기준 미확인: 기존 대시보드와 같은 행 합계로 표시합니다. 단가/행 합계 확인 후 설정이 필요합니다.",
    );
  const salesRows = parseSalesRows(ov, mode);
  const orders = parseOrders(ov, warnings, mode, issues);
  // Some workflows move cancelled rows out of the order sheet. Recover only complete original-order records.
  const ch = (cv[0] || []).map(compact);
  if (
    ["상품주문번호", "상품번호", "상품명", "수량", "판매가", "주문상태"].every(
      (h) => ch.includes(h),
    )
  ) {
    const known = new Set(orders.map((o) => o.productOrder));
    const sourceIds = new Set(
      ov.slice(1).map((r) => identifier(r[columns(ov)("상품주문번호")])),
    );
    for (const o of parseOrders(cv, warnings, mode, issues))
      if (
        !known.has(o.productOrder) &&
        !sourceIds.has(o.productOrder) &&
        o.date
      ) {
        orders.push({ ...o, source: "claim-sheet" });
        known.add(o.productOrder);
      }
  }
  // Preserve ownership even when malformed/conflicting original rows were
  // quarantined. Their claims must not turn a known product error into a
  // ledger-wide blocker merely because the canonical order is absent.
  const sourceProducts = new Map(),
    orderColumns = columns(ov);
  for (const row of ov.slice(1)) {
    const id = identifier(get(row, orderColumns, "상품주문번호"));
    if (!id) continue;
    const ids = sourceProducts.get(id) || [];
    ids.push(identifier(get(row, orderColumns, "상품번호")));
    sourceProducts.set(id, ids);
  }
  for (const [id, ids] of sourceProducts)
    sourceProducts.set(id, ids.every(Boolean) ? [...new Set(ids)] : []);
  const claims = parseClaims(cv, orders, warnings, issues, sourceProducts),
    inventory = parseInventory(iv, warnings, issues),
    mdProducts = parseMd(mv, warnings, issues);
  const cm = new Map(claims.map((c) => [c.productOrder, c]));
  for (const o of orders) {
    const c = cm.get(o.productOrder);
    o.cancelQty = c?.complete && c.qty !== null ? c.qty : 0;
    o.netQty = o.state === "unpaid" ? 0 : Math.max(0, o.qty - o.cancelQty);
    o.pendingClaim =
      (!!c && (!c.complete || c.qty === null)) || o.state === "claim";
    o.eligibleQty =
      o.pendingClaim || o.state === "unknown" || o.state === "unpaid"
        ? 0
        : o.netQty;
    o.netSales =
      o.sales === null
        ? null
        : o.state === "unpaid"
          ? 0
          : o.sales - (c?.complete ? c.sales || 0 : 0);
    if (o.state === "unpaid") o.sales = 0;
  }
  return {
    orders,
    claims,
    cancels: claims.filter((c) => c.complete && c.qty !== null),
    inventory,
    mdProducts,
    mdUploads: mdProducts.filter((x) => x.date),
    warnings: [...new Set(warnings)],
    issues,
    salesMode: mode,
    updatedAt: new Date().toISOString(),
  };
}
