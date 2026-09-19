import test from "node:test";
import assert from "node:assert/strict";
process.env.CAFE24_MALL_ID = "testmall";
process.env.CAFE24_CLIENT_ID = "fixture";
process.env.CAFE24_CLIENT_SECRET = "fixture-secret";
const {
  CAFE24_SCOPES,
  requestCafe24Orders,
  normalizeCafe24Orders,
  prepareCafe24Order,
  uploadCafe24ProductImage,
  cafe24UploadedImagePath,
  createCafe24Product,
  createCafe24ProductOptions,
  requestCafe24Product,
} = await import("../lib/cafe24.js");
const order = (id, status = "N10", paid = "T") => ({
  order_id: id,
  paid,
  items: [
    {
      order_item_code: id + "-01",
      order_status: status,
      product_name: "테스트",
      quantity: 1,
    },
  ],
  receivers: [{ name: "테스트", cellphone: "01000000000" }],
});
test("Cafe24 fetches every page; does not silently truncate at 100", async () => {
  const old = global.fetch,
    offsets = [];
  global.fetch = async (url) => {
    const offset = Number(new URL(url).searchParams.get("offset"));
    offsets.push(offset);
    return Response.json({
      orders:
        offset === 0
          ? Array.from({ length: 100 }, (_, i) => order("o" + i))
          : [order("last")],
    });
  };
  try {
    const r = await requestCafe24Orders("test");
    assert.equal(r.data.orders.length, 101);
    assert.deepEqual(offsets, [0, 100]);
  } finally {
    global.fetch = old;
  }
});
test("second page failure never returns successful partial orders", async () => {
  const old = global.fetch;
  global.fetch = async (url) =>
    Number(new URL(url).searchParams.get("offset")) === 0
      ? Response.json({
          orders: Array.from({ length: 100 }, (_, i) => order("o" + i)),
        })
      : Response.json({ error: "failed" }, { status: 400 });
  try {
    const r = await requestCafe24Orders("test");
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
    assert.equal(r.data.orders, undefined);
  } finally {
    global.fetch = old;
  }
});
test("paid marketplace N02 is retained; unpaid/unknown N02 cannot be prepared", () => {
  const rows = normalizeCafe24Orders({
    orders: [
      order("paid", "N02", "T"),
      order("unpaid", "N02", "F"),
      order("delivered", "N40"),
    ],
  });
  assert.equal(rows[0].canPrepare, true);
  assert.equal(rows[1].canPrepare, false);
  assert.equal(rows[1].status, "N02");
  assert.equal(rows[2].canPrepare, false);
});
test("missing items fail; multiple receivers cannot inherit first recipient", () => {
  assert.throws(() => normalizeCafe24Orders({ orders: [{ order_id: "bad" }] }));
  const o = order("multi");
  o.receivers.push({ name: "other" });
  const r = normalizeCafe24Orders({ orders: [o] })[0];
  assert.equal(r.phone, "");
  assert.equal(r.canPrepare, false);
});
test("nested marketplace option objects preserve readable names", () => {
  const o = order("nested");
  o.items[0].option = [
    { option_name: "색상", option_value: { value: "블랙" } },
  ];
  assert.equal(normalizeCafe24Orders({ orders: [o] })[0].option, "색상: 블랙");
});
test("prepare request contains only supplied item codes", async () => {
  const old = global.fetch;
  let body;
  global.fetch = async (url, opts) => {
    body = JSON.parse(opts.body);
    return Response.json({ order: {} });
  };
  try {
    await prepareCafe24Order("test", "o1", ["o1-01"]);
    assert.deepEqual(body.request.order_item_code, ["o1-01"]);
  } finally {
    global.fetch = old;
  }
});


test("Cafe24 OAuth includes product write permission", () => {
  assert.match(CAFE24_SCOPES, /(?:^|\s)mall\.write_product(?:\s|$)/);
});

test("Cafe24 product image upload sends browser image data", async () => {
  const old = global.fetch;
  let requestUrl, body;
  global.fetch = async (url, opts) => {
    requestUrl = String(url);
    body = JSON.parse(opts.body);
    return Response.json({ images: [{ path: "/web/product/oars.jpg" }] });
  };
  try {
    const image = "data:image/jpeg;base64,YWJj";
    const result = await uploadCafe24ProductImage("token", image);
    assert.equal(result.ok, true);
    assert.match(requestUrl, /\/admin\/products\/images$/);
    assert.equal(body.request.image, image);
    assert.equal(
      cafe24UploadedImagePath(result.data),
      "/web/product/oars.jpg",
    );
    assert.equal(
      cafe24UploadedImagePath({ resource: { path: "/web/product/current.jpg" } }),
      "/web/product/current.jpg",
    );
  } finally {
    global.fetch = old;
  }
});

test("Cafe24 product create always forces hidden and not selling", async () => {
  const old = global.fetch;
  let body;
  global.fetch = async (url, opts) => {
    body = JSON.parse(opts.body);
    return Response.json({
      product: { product_no: 1234, display: "F", selling: "F" },
    });
  };
  try {
    await createCafe24Product("token", {
      product_name: "테스트 상품",
      price: 29900,
      supply_price: 12000,
      display: "T",
      selling: "T",
    });
    assert.equal(body.request.product_name, "테스트 상품");
    assert.equal(body.request.display, "F");
    assert.equal(body.request.selling, "F");
  } finally {
    global.fetch = old;
  }
});

test("Cafe24 options preserve color and size values", async () => {
  const old = global.fetch;
  let requestUrl, body;
  global.fetch = async (url, opts) => {
    requestUrl = String(url);
    body = JSON.parse(opts.body);
    return Response.json({ options: [] });
  };
  try {
    await createCafe24ProductOptions("token", "1234", [
      { name: "색상", values: ["블랙", "크림"] },
      { name: "사이즈", values: ["S", "M"] },
    ]);
    assert.match(requestUrl, /\/admin\/products\/1234\/options$/);
    assert.equal(body.request.has_option, "T");
    assert.deepEqual(
      body.request.options[0].option_value.map((item) => item.option_text),
      ["블랙", "크림"],
    );
    assert.deepEqual(
      body.request.options[1].option_value.map((item) => item.option_text),
      ["S", "M"],
    );
  } finally {
    global.fetch = old;
  }
});

test("Cafe24 product verification embeds options", async () => {
  const old = global.fetch;
  let requestUrl;
  global.fetch = async (url) => {
    requestUrl = String(url);
    return Response.json({
      product: { product_no: 1234, display: "F", selling: "F" },
    });
  };
  try {
    await requestCafe24Product("token", "1234");
    assert.match(requestUrl, /\/admin\/products\/1234\?embed=options$/);
  } finally {
    global.fetch = old;
  }
});
