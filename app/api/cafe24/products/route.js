import { secure } from "../../../../lib/access.mjs";
import { withCafeSession } from "../../../../lib/cafe24-session";
import {
  createCafe24Product,
  createCafe24ProductOptions,
  requestCafe24Product,
} from "../../../../lib/cafe24";
import {
  buildCafe24Description,
  makeOptionGroups,
  normalizeProductTags,
} from "../../../../lib/product-registration-data.mjs";

const IMAGE_PATH = /^(?:https?:\/\/|\/)/i;

function text(value, max = 1000) {
  const next = typeof value === "string" ? value.trim() : "";
  return next.length <= max ? next : "";
}

function money(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 2_147_483_647
    ? number
    : null;
}

function imagePaths(value, max) {
  if (!Array.isArray(value) || !value.length || value.length > max) return null;
  const paths = value.map((item) => text(item, 2000));
  if (paths.some((item) => !item || !IMAGE_PATH.test(item))) return null;
  return paths;
}

function optionGroups(value) {
  if (!Array.isArray(value)) return null;
  if (value.length > 2) return null;
  const groups = value.map((group) => ({
    name: text(group?.name, 20),
    values: Array.isArray(group?.values)
      ? group.values.map((item) => text(item, 50)).filter(Boolean)
      : [],
  }));
  if (
    groups.some(
      (group) =>
        !group.name ||
        !group.values.length ||
        group.values.length > 50 ||
        new Set(group.values).size !== group.values.length,
    )
  )
    return null;
  return groups;
}

function productNoFrom(payload) {
  const value = payload?.product?.product_no ?? payload?.product_no;
  return value == null || value === "" ? "" : String(value);
}

async function handlePOST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 상품 등록 요청입니다." }, { status: 400 });
  }

  const productName = text(body?.productName, 250);
  const price = money(body?.price);
  const supplyPrice = money(body?.supplyPrice);
  const description = text(body?.description, 50_000);
  const mainImagePaths = imagePaths(body?.mainImagePaths, 21);
  const detailImagePaths = imagePaths(body?.detailImagePaths, 80);
  const tags = normalizeProductTags(body?.tags || "");
  const groups =
    body?.optionGroups == null ? makeOptionGroups(body?.colors, body?.sizes) : optionGroups(body.optionGroups);

  if (!productName)
    return Response.json({ error: "상품명을 확인해주세요." }, { status: 400 });
  if (price == null)
    return Response.json({ error: "판매가는 0원 이상의 정수로 입력해주세요." }, { status: 400 });
  if (supplyPrice == null)
    return Response.json({ error: "공급가는 0원 이상의 정수로 입력해주세요." }, { status: 400 });
  if (!mainImagePaths)
    return Response.json(
      { error: "메인 이미지는 1장 이상, 대표 포함 최대 21장까지 등록할 수 있습니다." },
      { status: 400 },
    );
  if (!detailImagePaths)
    return Response.json(
      { error: "상세이미지 목록을 확인해주세요." },
      { status: 400 },
    );
  if (groups == null)
    return Response.json(
      { error: "색상·사이즈 옵션 값을 확인해주세요." },
      { status: 400 },
    );

  const descriptionHtml = buildCafe24Description(description, detailImagePaths);

  return withCafeSession(async (request) => {
    const created = await request((token) =>
      createCafe24Product(token, {
        product_name: productName,
        price,
        supply_price: supplyPrice,
        description: descriptionHtml,
        mobile_description: descriptionHtml,
        product_tag: tags,
        detail_image: mainImagePaths[0],
        image_upload_type: "A",
        additional_image: mainImagePaths.slice(1),
        has_option: "F",
      }),
    );

    if (!created.ok)
      return {
        status: created.status,
        data: {
          error: "카페24 상품 생성에 실패했습니다.",
          cafe24: created.data?.error || created.data?.error_description || "",
          ...(created.status === 401 || created.status === 403
            ? { connectUrl: "/api/cafe24/connect" }
            : {}),
        },
      };

    const productNo = productNoFrom(created.data);
    if (!productNo)
      return {
        status: 502,
        data: {
          error:
            "카페24에서 상품 생성 응답을 받았지만 상품번호를 확인하지 못했습니다. 카페24 관리자에서 신규 상품을 먼저 확인해주세요.",
          productCreated: true,
        },
      };

    if (groups.length) {
      const options = await request((token) =>
        createCafe24ProductOptions(token, productNo, groups),
      );
      if (!options.ok)
        return {
          status: 207,
          data: {
            ok: false,
            productCreated: true,
            productNo,
            stage: "options",
            error:
              "상품은 생성됐지만 옵션 등록에 실패했습니다. 다시 등록하지 말고 이 상품번호를 카페24에서 확인해주세요.",
            cafe24: options.data?.error || options.data?.error_description || "",
          },
        };
    }

    const verified = await request((token) =>
      requestCafe24Product(token, productNo),
    );
    if (!verified.ok)
      return {
        status: 207,
        data: {
          ok: false,
          productCreated: true,
          productNo,
          stage: "verify",
          error:
            "상품은 생성됐지만 최종 재확인에 실패했습니다. 다시 등록하지 말고 이 상품번호를 카페24에서 확인해주세요.",
        },
      };

    const product = verified.data?.product || {};
    if (product.display !== "F" || product.selling !== "F")
      return {
        status: 207,
        data: {
          ok: false,
          productCreated: true,
          productNo,
          stage: "safety",
          error:
            "상품은 생성됐지만 진열안함·판매안함 상태를 확인하지 못했습니다. 카페24 관리자에서 즉시 상태를 확인해주세요.",
          display: product.display,
          selling: product.selling,
        },
      };

    return {
      data: {
        ok: true,
        productCreated: true,
        productNo,
        productName: product.product_name || productName,
        display: product.display,
        selling: product.selling,
        optionGroupCount: groups.length,
      },
    };
  });
}

export const POST = secure(handlePOST);
