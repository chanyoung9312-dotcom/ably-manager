import { upstreamFetch } from "./http.mjs";
import { seoulDate, shiftDay } from "./dates.mjs";
import crypto from "crypto";

export const CAFE24_MALL_ID = process.env.CAFE24_MALL_ID || "";
export const CAFE24_CLIENT_ID = process.env.CAFE24_CLIENT_ID || "";
export const CAFE24_CLIENT_SECRET = process.env.CAFE24_CLIENT_SECRET || "";
export const CAFE24_REDIRECT_URI =
  process.env.CAFE24_REDIRECT_URI ||
  "https://ably-manager-app.vercel.app/api/cafe24/callback";
export const CAFE24_SESSION_COOKIE = "oars_cafe24_session";
export const CAFE24_STATE_COOKIE = "oars_cafe24_state";
export const CAFE24_SCOPES =
  "mall.read_product mall.write_product mall.read_order mall.write_order";

export function ensureCafe24Config() {
  if (
    !/^[a-z0-9-]+$/i.test(CAFE24_MALL_ID) ||
    !CAFE24_CLIENT_ID ||
    !CAFE24_CLIENT_SECRET
  )
    throw new Error("카페24 환경변수가 설정되지 않았습니다.");
}
function key() {
  ensureCafe24Config();
  return crypto
    .createHash("sha256")
    .update(`${CAFE24_CLIENT_SECRET}:${CAFE24_MALL_ID}:oars-cafe24-session`)
    .digest();
}
export function sealCafe24Session(value) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]),
    tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}
export function openCafe24Session(value) {
  try {
    if (!value) return null;
    const raw = Buffer.from(value, "base64url");
    if (raw.length < 29) return null;
    const iv = raw.subarray(0, 12),
      tag = raw.subarray(12, 28),
      encrypted = raw.subarray(28),
      decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
        "utf8",
      ),
    );
  } catch {
    return null;
  }
}
export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 13,
};
export const stateCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 10,
};
export function cafe24AuthorizeUrl(state) {
  ensureCafe24Config();
  const u = new URL(
    `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/oauth/authorize`,
  );
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", CAFE24_CLIENT_ID);
  u.searchParams.set("state", state);
  u.searchParams.set("redirect_uri", CAFE24_REDIRECT_URI);
  u.searchParams.set("scope", CAFE24_SCOPES);
  return u;
}
async function tokenRequest(params) {
  ensureCafe24Config();
  const auth = Buffer.from(
    `${CAFE24_CLIENT_ID}:${CAFE24_CLIENT_SECRET}`,
  ).toString("base64");
  const r = await upstreamFetch(
    `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/oauth/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
      cache: "no-store",
    },
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      data.error_description ||
        data.error ||
        "카페24 토큰 발급에 실패했습니다.",
    );
  return data;
}
export const exchangeCafe24Code = (code) =>
  tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: CAFE24_REDIRECT_URI,
  });
export const refreshCafe24Token = (refreshToken) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

async function cafe24Fetch(url, accessToken, options = {}) {
  const r = await upstreamFetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}
export async function requestCafe24Orders(accessToken) {
  ensureCafe24Config();
  const end = seoulDate(),
    start = shiftDay(end, -89),
    orders = [],
    seen = new Set();
  for (let offset = 0; offset < 10000; offset += 100) {
    const u = new URL(
      `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/admin/orders`,
    );
    for (const [k, v] of Object.entries({
      start_date: start,
      end_date: end,
      limit: "100",
      offset: String(offset),
      embed: "items,receivers,buyer",
    }))
      u.searchParams.set(k, v);
    const result = await cafe24Fetch(u, accessToken);
    if (!result.ok) return result;
    if (!Array.isArray(result.data.orders))
      return {
        ok: false,
        status: 502,
        data: { error: "카페24 주문 응답 형식 오류" },
      };
    for (const o of result.data.orders) {
      if (!o.order_id || seen.has(o.order_id))
        throw new Error(
          "카페24 페이지 중복 또는 주문번호 누락. 다시 조회하세요.",
        );
      seen.add(o.order_id);
      orders.push(o);
    }
    if (result.data.orders.length < 100)
      return { ok: true, status: 200, data: { orders, range: { start, end } } };
  }
  return {
    ok: false,
    status: 502,
    data: {
      error: "주문 조회 한도에 도달했습니다. 기간 분할 조회가 필요합니다.",
    },
  };
}
export async function requestCafe24Order(accessToken, orderId) {
  ensureCafe24Config();
  return cafe24Fetch(
    `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/admin/orders/${encodeURIComponent(orderId)}?embed=items,receivers,buyer`,
    accessToken,
  );
}
export async function prepareCafe24Order(
  accessToken,
  orderId,
  orderItemCodes = [],
) {
  ensureCafe24Config();
  const u = `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/admin/orders/${encodeURIComponent(orderId)}`;
  const body = { shop_no: 1, request: { process_status: "prepare" } };
  if (orderItemCodes.length) body.request.order_item_code = orderItemCodes;
  return cafe24Fetch(u, accessToken, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function uploadCafe24ProductImage(accessToken, image) {
  ensureCafe24Config();
  return cafe24Fetch(
    `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/admin/products/images`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ shop_no: 1, request: { image } }),
    },
  );
}

export function cafe24UploadedImagePath(payload) {
  const candidates = [
    payload?.path,
    payload?.resource?.path,
    payload?.image?.path,
    payload?.images?.path,
    ...(Array.isArray(payload?.resource)
      ? payload.resource.map((item) => item?.path)
      : []),
    ...(Array.isArray(payload?.images)
      ? payload.images.map((item) => item?.path)
      : []),
  ];
  return candidates.find((value) => typeof value === "string" && value.trim()) || "";
}

export async function createCafe24Product(accessToken, product) {
  ensureCafe24Config();
  return cafe24Fetch(
    `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/admin/products`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        shop_no: 1,
        request: {
          ...product,
          display: "F",
          selling: "F",
        },
      }),
    },
  );
}

export async function createCafe24ProductOptions(
  accessToken,
  productNo,
  groups = [],
) {
  ensureCafe24Config();
  const options = groups.map((group) => ({
    option_name: group.name,
    option_value: group.values.map((optionText) => ({
      option_text: optionText,
      option_display_type: "S",
    })),
  }));
  return cafe24Fetch(
    `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/admin/products/${encodeURIComponent(productNo)}/options`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        shop_no: 1,
        request: {
          has_option: "T",
          option_type: "T",
          option_list_type: "S",
          options,
        },
      }),
    },
  );
}

export async function requestCafe24Product(accessToken, productNo) {
  ensureCafe24Config();
  return cafe24Fetch(
    `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/admin/products/${encodeURIComponent(productNo)}?embed=options`,
    accessToken,
  );
}

const txt = (v) => String(v ?? "").trim();
function optionValue(v) {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return txt(v);
  if (Array.isArray(v)) return v.map(optionValue).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const direct =
      v.value ?? v.option_value ?? v.name ?? v.option_name ?? v.text ?? v.label;
    if (direct != null && direct !== v) return optionValue(direct);
    return Object.values(v).map(optionValue).filter(Boolean).join(", ");
  }
  return "";
}
function optionText(v) {
  if (Array.isArray(v))
    return v
      .map((o) => {
        if (typeof o === "string") return o;
        if (!o || typeof o !== "object") return optionValue(o);
        const n = optionValue(o.option_name ?? o.name ?? o.label);
        const x = optionValue(o.option_value ?? o.value ?? o.text);
        if (n && x && n !== x) return `${n}: ${x}`;
        return x || n || optionValue(o);
      })
      .filter(Boolean)
      .join(" / ");
  if (v && typeof v === "object")
    return Object.entries(v)
      .map(([k, x]) => {
        const value = optionValue(x);
        return value ? `${k}: ${value}` : "";
      })
      .filter(Boolean)
      .join(" / ");
  return optionValue(v);
}
function channelName(order) {
  const id = txt(order.market_id || order.order_place_id || order.inflow_path);
  const map = {
    cafe24: "카페24",
    shopn: "스마트스토어",
    NCHECKOUT: "네이버페이",
    mobile: "모바일",
    mobile_d: "모바일앱",
  };
  return map[id] || id || "카페24 주문";
}
export function normalizeCafe24Orders(payload) {
  const orders = payload?.orders;
  if (!Array.isArray(orders)) throw new Error("카페24 주문 배열 누락");
  const rows = [];
  for (const o of orders) {
    if (!Array.isArray(o.items) || !o.items.length)
      throw new Error(
        "품목 데이터가 없는 주문이 있습니다. 부분 결과를 표시하지 않습니다.",
      );
    const receivers = Array.isArray(o.receivers) ? o.receivers : [],
      ambiguous = receivers.length > 1 || o.multiple_addresses === "T";
    const receiver = ambiguous ? {} : receivers[0] || o.receiver || {},
      buyer = o.buyer || {};
    for (const item of o.items) {
      const code = txt(item.order_item_code),
        status = txt(item.order_status);
      if (!code) throw new Error("품주코드 누락. 상태 변경을 중단합니다.");
      rows.push({
        id: code,
        orderId: txt(o.order_id),
        orderItemCode: code,
        marketOrderNo: txt(o.market_order_no),
        marketId: txt(o.market_id || o.order_place_id),
        channel: channelName(o),
        date: txt(o.order_date || o.payment_date),
        name: ambiguous
          ? "다중 배송지 확인 필요"
          : txt(receiver.name || o.receiver_name || buyer.name || "고객"),
        phone: ambiguous
          ? ""
          : txt(
              receiver.cellphone ||
                receiver.phone ||
                buyer.cellphone ||
                buyer.phone,
            ),
        product: txt(item.product_name),
        productNo: txt(item.product_no),
        option: optionText(item.option || item.options || item.variant_code),
        qty: txt(item.quantity ?? item.qty ?? ""),
        status,
        paid: o.paid === "T",
        canPrepare:
          (status === "N10" || (status === "N02" && o.paid === "T")) &&
          !ambiguous,
        warning: ambiguous
          ? "다중 배송지 주문은 카페24에서 품목별 수령인을 확인하세요."
          : !status
            ? "품목 주문상태 누락"
            : status === "N02" && o.paid !== "T"
              ? "접수중 주문: 결제 여부를 카페24에서 확인하세요."
              : "",
      });
    }
  }
  return rows;
}
