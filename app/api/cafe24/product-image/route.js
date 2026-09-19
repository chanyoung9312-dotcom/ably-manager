import { secure } from "../../../../lib/access.mjs";
import { withCafeSession } from "../../../../lib/cafe24-session";
import {
  uploadCafe24ProductImage,
  cafe24UploadedImagePath,
} from "../../../../lib/cafe24";

const DATA_IMAGE = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;

async function handlePOST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 이미지 요청입니다." }, { status: 400 });
  }

  const image = typeof body?.image === "string" ? body.image.trim() : "";
  if (!image || !DATA_IMAGE.test(image))
    return Response.json(
      { error: "JPEG, PNG, WEBP, GIF 이미지만 등록할 수 있습니다." },
      { status: 400 },
    );

  if (image.length > 4_000_000)
    return Response.json(
      { error: "이미지가 너무 큽니다. OARS에서 자동 축소 후 다시 시도해주세요." },
      { status: 413 },
    );

  return withCafeSession(async (request) => {
    const uploaded = await request((token) =>
      uploadCafe24ProductImage(token, image),
    );
    if (!uploaded.ok)
      return {
        status: uploaded.status,
        data: {
          error: "카페24 이미지 업로드에 실패했습니다.",
          cafe24: uploaded.data?.error || uploaded.data?.error_description || "",
          ...(uploaded.status === 401 || uploaded.status === 403
            ? { connectUrl: "/api/cafe24/connect" }
            : {}),
        },
      };

    const path = cafe24UploadedImagePath(uploaded.data);
    if (!path)
      return {
        status: 502,
        data: {
          error: "이미지는 업로드됐지만 카페24 이미지 경로를 확인하지 못했습니다.",
        },
      };

    return { data: { ok: true, path } };
  });
}

export const POST = secure(handlePOST);
