import test from "node:test";
import assert from "node:assert/strict";
import { dateKey, seoulDate, inWindow } from "../lib/dates.mjs";
import {
  buildCommerce,
  parseOrders,
  parseClaims,
  parseInventory,
  parseMd,
} from "../lib/commerce.mjs";
import { analyze } from "../lib/md.mjs";
import {
  postalRows,
  planTracking,
  shippingSnapshot,
  matchTracking,
} from "../lib/shipping.mjs";
import { matchProducts } from "../lib/product-match.mjs";
import { accessError } from "../lib/access.mjs";
const h = [
  "결제일",
  "상품주문번호",
  "주문번호",
  "상품번호",
  "상품명",
  "수량",
  "판매가",
  "주문상태",
];
const row = (id = "po1", q = 1, status = "배송준비중", date = "2026-09-17") => [
  date,
  id,
  "o1",
  "p1",
  "원피스",
  q,
  20000,
  status,
];
const ih = ["상품번호", "상품명", "색상", "사이즈", "수량"];
const ledger = (rows, claims = [h], iv = [ih], md = []) =>
  buildCommerce([h, ...rows], claims, iv, md, { salesMode: "unit" });
const today = "2026-09-17";
test("KST midnight, leap dates, compact dates, strict calendar validation", () => {
  assert.equal(seoulDate(new Date("2026-09-16T15:01:00Z")), today);
  assert.equal(dateKey("2026-09-16T16:00:00Z"), today);
  assert.equal(dateKey("20260917"), today);
  assert.equal(dateKey("260917"), today);
  assert.equal(dateKey("2026. 9. 17"), today);
  assert.equal(dateKey("2026-02-30"), "");
  assert.equal(dateKey("2024-02-29"), "2024-02-29");
});
test("7/14/30-day boundaries include the full oldest day, no overlap", () => {
  for (const n of [7, 14, 30]) {
    const start = new Date(Date.parse(today) - 86400000 * (n - 1))
      .toISOString()
      .slice(0, 10);
    assert.equal(inWindow(start, today, n), true);
    assert.equal(inWindow(start, today, n, n), false);
  }
  assert.equal(inWindow("2026-09-10", today, 7), false);
  assert.equal(inWindow("2026-09-10", today, 7, 7), true);
  assert.equal(inWindow("2026-09-18", today, 30), false);
});
test("one canonical amount; quantity >1 is multiplied exactly once", () => {
  const d = ledger([row("p", 3)]);
  assert.equal(d.orders[0].sales, 60000);
  assert.equal(d.orders[0].netSales, 60000);
  const line = buildCommerce([h, row("p", 3)], [h], [ih], [], {
    salesMode: "line",
  });
  assert.equal(line.orders[0].sales, 20000);
});
test("exact duplicates collapse; conflicting duplicates are quarantined", () => {
  assert.equal(parseOrders([h, row(), row()]).length, 1);
  assert.equal(parseOrders([h, row(), row("po1", 2)]).length, 0);
});
test("zero/negative quantity is not replaced by one", () => {
  assert.equal(parseOrders([h, row("a", 0), row("b", -2)]).length, 0);
});
test("partial completed cancellation deducts only confirmed quantity", () => {
  const d = ledger([row("po1", 3)], [h, row("po1", 1, "취소완료")]);
  assert.equal(d.orders[0].netQty, 2);
  assert.equal(d.orders[0].netSales, 40000);
  assert.equal(d.cancels[0].sales, 20000);
});
test("cancel request is pending; not confirmed loss or forecast demand", () => {
  const d = ledger([row()], [h, row("po1", 1, "취소요청")]);
  assert.equal(d.cancels.length, 0);
  assert.equal(d.orders[0].netQty, 1);
  assert.equal(d.orders[0].eligibleQty, 0);
});
test("a cancellation reason does not by itself make a return", () => {
  const orders = parseOrders([h, row()]);
  const c = parseClaims(
    [
      ["상품주문번호", "주문상태", "사유"],
      ["po1", "취소완료", "배송지연 안내 후 취소"],
    ],
    orders,
  );
  assert.equal(c[0].type, "unknown");
  assert.equal(c[0].complete, true);
});
test("return received is not return completed and does not increase stock", () => {
  const d = ledger(
    [row()],
    [
      ["상품주문번호", "주문상태", "반품수령"],
      ["po1", "반품요청", "완료"],
    ],
    [ih, ["p1", "원피스", "흰색", "S", 2]],
  );
  assert.equal(d.cancels.length, 0);
  assert.equal(d.inventory[0].qty, 2);
});
test("completed status with unknown multi-unit claim quantity blocks demand", () => {
  const d = ledger([row("po1", 3, "취소완료")]);
  assert.equal(d.orders[0].eligibleQty, 0);
  assert.equal(d.orders[0].pendingClaim, true);
});
test("conflicting claim snapshots are not summed or resolved by rank", () => {
  const d = ledger(
    [row("po1", 3)],
    [h, row("po1", 1, "취소완료"), row("po1", 2, "반품완료")],
  );
  assert.equal(d.cancels.length, 0);
  assert.equal(d.orders[0].eligibleQty, 0);
});
test("single moved cancelled line retains gross reaction then deducts net", () => {
  const d = ledger([], [h, row("po1", 1, "취소완료")]);
  assert.equal(d.orders.length, 1);
  assert.equal(d.orders[0].netQty, 0);
});
test("orphan claim without original fields produces a warning, no fabricated amount", () => {
  const d = ledger(
    [],
    [
      ["상품주문번호", "주문상태"],
      ["missing", "취소완료"],
    ],
  );
  assert.equal(d.cancels.length, 0);
  assert.ok(d.warnings.some((w) => w.includes("원주문 미매칭")));
});
test("unpaid and unknown state do not create procurement demand", () => {
  const d = ledger([row("a", 1, "입금전"), row("b", 1, "새 상태")]);
  assert.equal(d.orders[0].sales, 0);
  assert.equal(d.orders[1].eligibleQty, 0);
});
test("missing required header fails instead of silently returning zero", () =>
  assert.throws(() => parseOrders([["이상한 헤더"]])));
test("new product resets inherited inventory color; blank rows reset all", () => {
  const iv = parseInventory([
    ih,
    ["p1", "one", "red", "S", 2],
    ["p2", "two", "", "M", 3],
    [],
    ["", "", "", "L", 5],
  ]);
  assert.equal(iv.length, 2);
  assert.equal(iv[1].color, "");
});
test("duplicate stock option makes stock unknown in MD", () => {
  const d = ledger(
    [row()],
    [h],
    [ih, ["p1", "one", "red", "S", 2], ["p1", "one", "red", "S", 2]],
  );
  assert.equal(analyze(d, { today }).rows[0].stock, null);
});
test("adjacent MD cards do not borrow product identifiers", () => {
  const cards = [
    ["상품명", "", "상품명"],
    ["원피스", "", "가디건"],
    ["상품번호", "", "상품번호"],
    ["p1", "", "p2"],
  ];
  assert.deepEqual(
    parseMd(cards).map((p) => [p.product, p.productNo]),
    [
      ["원피스", "p1"],
      ["가디건", "p2"],
    ],
  );
});
test("no product number is unlinked, not unregistered or merged by name", () => {
  const d = ledger([row("a"), row("b")]);
  d.orders.forEach((o) => (o.productNo = ""));
  const report = analyze(d, { today });
  assert.equal(report.rows.length, 2);
  assert.ok(report.rows.every((p) => p.decision === "관찰"));
});
test("single-day spike and one order cannot trigger procurement", () => {
  const d = ledger([row("a", 10)]);
  d.coverageStart = "2026-01-01";
  const p = analyze(d, { today }).rows[0];
  assert.equal(p.decision, "관찰");
  assert.equal(p.days30, 1);
  assert.equal(p.grade, "B");
});
const repeated = () => {
  const rows = [
    "2026-08-25",
    "2026-09-03",
    "2026-09-07",
    "2026-09-10",
    "2026-09-12",
    "2026-09-14",
    "2026-09-16",
    "2026-09-17",
  ].map((day, i) => row(`po${i}`, 1, "배송완료", day));
  const d = ledger(rows, [h], [ih, ["p1", "원피스", "red", "S", 0]]);
  d.coverageStart = "2026-01-01";
  d.mdProducts = [
    {
      productNo: "p1",
      product: "원피스",
      registeredAt: "2026-08-01",
      leadDays: 7,
      incoming: 0,
      reserved: 0,
    },
  ];
  return d;
};
test("sustained dispersed net sales can qualify; inventory reduces quantity", () => {
  const d = repeated();
  let p = analyze(d, { today }).rows[0];
  assert.equal(p.grade, "S");
  assert.equal(p.decision, "사입 검토");
  assert.ok(p.quantities.recommended > 0);
  d.inventory[0].qty = 30;
  p = analyze(d, { today }).rows[0];
  assert.equal(p.decision, "추가 사입 중단");
  assert.equal(p.quantities.recommended, 0);
});
test("unknown coverage, unknown stock, or proxy registration prevents strong buy", () => {
  for (const mutate of [
    (d) => (d.coverageStart = null),
    (d) => (d.inventory = []),
    (d) => {
      d.mdProducts[0].date = "2026-08-01";
      delete d.mdProducts[0].registeredAt;
    },
  ]) {
    const d = repeated();
    mutate(d);
    assert.equal(analyze(d, { today }).rows[0].decision, "관찰");
  }
});
test("missing supplier values never invents a purchase quantity", () => {
  const d = repeated();
  delete d.mdProducts[0].leadDays;
  assert.equal(analyze(d, { today }).rows[0].quantities, null);
});
test("unlisted zero-sales product remains B, not D", () => {
  const d = ledger([]);
  d.mdProducts = [
    { row: 2, product: "신상품", date: "2026-08-01", productNo: "p2" },
  ];
  const p = analyze(d, { today }).rows[0];
  assert.equal(p.grade, "B");
  assert.equal(p.decision, "관찰");
});
test("future dates never affect daily orders or active-day dispersion", () => {
  const d = ledger([row("a", 10, "배송완료", "2026-09-18"), row("b", 1)]);
  assert.equal(analyze(d, { today }).rows[0].total, 1);
});
const ship = {
  productOrderNo: "po",
  orderNo: "o",
  name: "테스트",
  phone: "01000000000",
  zip: "01234",
  address: "서울시 테스트로 10",
  detail: ".",
  rowNumber: 2,
  shipping: "우체국 배송",
  shippingCol: 7,
  carrierCol: 6,
};
const update = {
  productOrderNo: "po",
  snapshot: shippingSnapshot(ship),
  tracking: "1234567890123",
};
test("tracking resolves stable product-order ID after row insertion", () =>
  assert.equal(
    planTracking([update], [{ ...ship, rowNumber: 99 }])[0].rowNumber,
    99,
  ));
test("changed recipient, conflicting tracking, duplicates all reject", () => {
  assert.throws(() => planTracking([update], [{ ...ship, name: "다른 고객" }]));
  assert.throws(() =>
    planTracking([update], [{ ...ship, shipping: "9999999999999" }]),
  );
  assert.throws(() => planTracking([update, update], [ship]));
  assert.throws(() =>
    planTracking([{ ...update, tracking: "1234567890" }], [ship]),
  );
});
test("retrying the identical tracking is idempotent", () =>
  assert.equal(
    planTracking([update], [{ ...ship, shipping: update.tracking }])[0]
      .unchanged,
    true,
  ));
test("name-only match and duplicate parcel match are blocked", () => {
  assert.equal(
    matchTracking([{ tracking: "1", line: "테스트" }], [ship])[0].match,
    null,
  );
  const p = { tracking: "1234567890123", line: "테스트 01000000000" };
  assert.equal(matchTracking([p], [ship])[0].match.productOrderNo, "po");
  assert.ok(matchTracking([p, p], [ship]).every((x) => !x.match));
});
test("shipment excludes returned/cancelled/completed and missing shipping headers fails", () => {
  const sh = [
    "상품주문번호",
    "주문번호",
    "주문상태",
    "수취인명",
    "수취인연락처",
    "우편번호",
    "주소",
    "배송관리",
    "택배사",
  ];
  const line = (s) => [
    "po",
    "o",
    s,
    "테스트",
    "01000000000",
    "01234",
    "서울시 테스트로 10",
    "우체국 배송",
    "",
  ];
  assert.equal(postalRows([sh, line("반품완료")]).length, 0);
  assert.equal(postalRows([sh, line("배송완료")]).length, 0);
  assert.equal(postalRows([sh, line("배송중")]).length, 1);
  assert.throws(() => postalRows([["상품주문번호", "주문번호", "주문상태"]]));
});
test("product matching preserves bracket variants, refuses fuzzy and duplicate names", () => {
  const md = [["상품명"], ["[벨트포함] 원피스"], ["상품번호"], [""]];
  assert.equal(
    matchProducts(md, [{ productNo: "p1", name: "원피스" }])[0].status,
    "확인 필요",
  );
  assert.equal(
    matchProducts(md, [{ productNo: "p1", name: "[벨트포함] 원피스" }])[0]
      .status,
    "확정",
  );
  assert.equal(
    matchProducts(md, [
      { productNo: "p1", name: "[벨트포함] 원피스" },
      { productNo: "p2", name: "[벨트포함] 원피스" },
    ])[0].status,
    "확인 필요",
  );
});
test("authentication fails closed; cross-origin mutation rejected", () => {
  const saved = {
    user: process.env.OARS_ADMIN_USER,
    password: process.env.OARS_ADMIN_PASSWORD,
  };
  delete process.env.OARS_ADMIN_USER;
  delete process.env.OARS_ADMIN_PASSWORD;
  assert.equal(
    accessError(new Request("https://example.test/api/dashboard-data")).status,
    503,
  );
  process.env.OARS_ADMIN_USER = "test";
  process.env.OARS_ADMIN_PASSWORD = "test-password-long-enough";
  const auth =
    "Basic " + Buffer.from("test:test-password-long-enough").toString("base64");
  assert.equal(
    accessError(new Request("https://example.test/api/dashboard-data")).status,
    401,
  );
  assert.equal(
    accessError(
      new Request("https://example.test/api/dashboard-data", {
        headers: { authorization: auth },
      }),
    ),
    null,
  );
  assert.equal(
    accessError(
      new Request("https://example.test/api/tracking", {
        method: "POST",
        headers: {
          authorization: auth,
          origin: "https://evil.test",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    ).status,
    403,
  );
  if (saved.user === undefined) delete process.env.OARS_ADMIN_USER;
  else process.env.OARS_ADMIN_USER = saved.user;
  if (saved.password === undefined) delete process.env.OARS_ADMIN_PASSWORD;
  else process.env.OARS_ADMIN_PASSWORD = saved.password;
});
test("duplicate 주문번호 headers choose marketplace ID, not procurement ID", () => {
  const hh = ["주문번호", ...h];
  const o = parseOrders([hh, ["supplier-order", ...row()]])[0];
  assert.equal(o.orderNo, "o1");
});
test("next MD card upload date cannot overwrite preceding card", () => {
  const md = [
    ["상품명", "", "", "", "업로드날짜"],
    ["one", "", "", "", "260901"],
    ["상품번호"],
    ["p1"],
    [],
    ["링크", "", "", "", "업로드날짜"],
    ["", "", "", "", "260915"],
    ["상품명"],
    ["two"],
    ["상품번호"],
    ["p2"],
  ];
  const p = parseMd(md);
  assert.equal(p[0].date, "2026-09-01");
  assert.equal(p[1].date, "2026-09-15");
});
test("formatted product IDs join the same inventory and MD product", () => {
  const r = row();
  r[3] = "12,345";
  const d = ledger([r], [h], [ih, ["12345", "one", "red", "S", 1]]);
  assert.equal(d.orders[0].productNo, "12345");
  assert.equal(analyze(d, { today }).rows[0].stock, 1);
});
test("misplaced monetary value is not accepted as completed return date", () => {
  const o = parseOrders([h, row()]);
  const c = parseClaims(
    [
      ["상품주문번호", "주문상태", "반품요청일", "반품처리일"],
      ["po1", "일반배송", "0505", "46146"],
    ],
    o,
  );
  assert.equal(c[0].complete, false);
});
test("explicit partial claim quantity wins over copied original 수량 column", () => {
  const d = ledger(
    [row("po1", 3)],
    [
      ["상품주문번호", "주문상태", "취소수량", "수량"],
      ["po1", "취소완료", 1, 3],
    ],
  );
  assert.equal(d.orders[0].netQty, 2);
});
test("malformed explicit claim quantity is not defaulted to one", () => {
  const d = ledger(
    [row()],
    [
      ["상품주문번호", "주문상태", "취소수량"],
      ["po1", "취소완료", "오류"],
    ],
  );
  assert.equal(d.orders[0].eligibleQty, 0);
  assert.equal(d.cancels.length, 0);
});

// Both products independently satisfy every procurement requirement.
const scopedLedger = ({
  extra = [],
  claims = [["상품주문번호"]],
  inventory = [],
  md = [],
} = {}) => {
  const source = repeated();
  const orders = ["p1", "p2"].flatMap((id) =>
    source.orders.map((o) => {
      const r = row(`${id}-${o.productOrder}`, 1, "배송완료", o.date);
      r[3] = id;
      return r;
    }),
  );
  const d = ledger(
    [...orders, ...extra],
    claims,
    [
      ih,
      ["p1", "원피스", "red", "S", 0],
      ["p2", "원피스", "red", "S", 0],
      ...inventory,
    ],
    md,
  );
  d.coverageStart = source.coverageStart;
  if (!md.length)
    d.mdProducts = ["p1", "p2"].map((productNo) => ({
      ...source.mdProducts[0],
      productNo,
    }));
  return d;
};
const scopedResult = (d) =>
  Object.fromEntries(analyze(d, { today }).rows.map((p) => [p.productNo, p]));
const onlyP1Blocked = (d) => {
  const result = scopedResult(d);
  assert.equal(result.p1.decision, "관찰");
  assert.equal(result.p1.quantities, null);
  assert.ok(
    result.p1.missing.some((m) => m.startsWith("해당 상품 오류 해소:")),
  );
  assert.equal(result.p2.decision, "사입 검토");
  assert.ok(result.p2.quantities.recommended > 0);
  assert.deepEqual(result.p2.issues, []);
};
for (const [name, mutate] of [
  [
    "invalid quantity excluded from ledger",
    (r) => {
      r[5] = 0;
    },
  ],
  [
    "invalid date excluded from analysis",
    (r) => {
      r[0] = "bad-date";
    },
  ],
  [
    "invalid sale price",
    (r) => {
      r[6] = "bad-price";
    },
  ],
  [
    "unknown order state",
    (r) => {
      r[7] = "unknown";
    },
  ],
])
  test(`MD scopes ${name} to its product`, () => {
    const r = row("bad");
    mutate(r);
    onlyP1Blocked(scopedLedger({ extra: [r] }));
  });
test("MD scopes quarantined conflicting orders, including every disputed product ID", () => {
  const a = row("conflict"),
    b = [...a];
  b[7] = "배송완료";
  onlyP1Blocked(scopedLedger({ extra: [a, b] }));
  b[3] = "p2";
  const d = scopedLedger({ extra: [a, b] });
  assert.deepEqual(d.issues[0].productNos, ["p1", "p2"]);
  for (const p of Object.values(scopedResult(d))) {
    assert.equal(p.decision, "관찰");
    assert.equal(p.quantities, null);
  }
});
test("MD scopes invalid and duplicate inventory to its product", () => {
  for (const quantity of ["bad", 0])
    onlyP1Blocked(
      scopedLedger({ inventory: [["p1", "원피스", "red", "S", quantity]] }),
    );
});
test("MD scopes invalid and conflicting claims to the original product", () => {
  const header = ["상품주문번호", "주문상태", "취소수량"];
  for (const claims of [
    [header, ["p1-po0", "취소완료", "bad"]],
    [header, ["p1-po0", "취소완료", 1], ["p1-po0", "반품완료", 1]],
  ])
    onlyP1Blocked(scopedLedger({ claims }));
});
test("MD scopes unmatched claims with a product ID; unknown ownership blocks the ledger", () => {
  onlyP1Blocked(
    scopedLedger({
      claims: [
        ["상품주문번호", "상품번호"],
        ["orphan", "p1"],
      ],
    }),
  );
  const d = scopedLedger({ claims: [["상품주문번호"], ["orphan"]] });
  assert.equal(d.issues[0].scope, "ledger");
  for (const p of Object.values(scopedResult(d))) {
    assert.equal(p.decision, "관찰");
    assert.equal(p.quantities, null);
    assert.ok(p.missing.some((m) => m.startsWith("원장 전체 오류 해소:")));
  }
});
test("MD cannot localize a malformed order without a product identity", () => {
  const r = row("unidentified", 0);
  r[3] = "";
  for (const p of Object.values(scopedResult(scopedLedger({ extra: [r] })))) {
    assert.equal(p.decision, "관찰");
    assert.equal(p.quantities, null);
  }
});
test("MD scopes conflicting card fields to the card's product", () => {
  const fields = [
    "상품명",
    "상품번호",
    "상품등록일",
    "공급처배송기간",
    "입고예정수량",
    "예약재고",
    "공급처배송기간",
  ];
  const md = [
    [...fields, ...fields],
    [
      "원피스",
      "p1",
      "2026-08-01",
      7,
      0,
      0,
      9,
      "원피스",
      "p2",
      "2026-08-01",
      7,
      0,
      0,
      7,
    ],
  ];
  onlyP1Blocked(scopedLedger({ md }));
});
test("MD informational warnings and exact duplicate removal never block procurement", () => {
  const r = row("duplicate", 1, "배송완료");
  const d = scopedLedger({ extra: [r, [...r]] });
  d.warnings.push("과거 오류 해소 완료: 추가 확인 필요 없음");
  assert.deepEqual(d.issues, []);
  for (const p of Object.values(scopedResult(d)))
    assert.equal(p.decision, "사입 검토");
});

test("MD retains product ownership for claims of quarantined original orders", () => {
  const malformed = row("bad-original", 0);
  onlyP1Blocked(
    scopedLedger({
      extra: [malformed],
      claims: [["상품주문번호"], ["bad-original"]],
    }),
  );
  const a = row("conflicted-original"),
    b = [...a];
  b[7] = "배송완료";
  onlyP1Blocked(
    scopedLedger({
      extra: [a, b],
      claims: [["상품주문번호"], ["conflicted-original"]],
    }),
  );
});
