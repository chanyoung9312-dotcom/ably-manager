"use client";

import { useMemo, useState } from "react";
import {
  makeOptionGroups,
  normalizeProductTags,
  parseRegistrationPaste,
} from "../../lib/product-registration-data.mjs";
import { mimeFromName } from "../../lib/local-zip.mjs";

const MAX_DIRECT_BYTES = 2_450_000;

function loadBrowserImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = url;
  });
}

function toBase64(data) {
  let binary = "";
  const step = 0x8000;
  for (let offset = 0; offset < data.length; offset += step) {
    binary += String.fromCharCode(...data.subarray(offset, offset + step));
  }
  return btoa(binary);
}

function dataUri(data, mime) {
  return `data:${mime};base64,${toBase64(data)}`;
}

async function canvasBlob(canvas, quality) {
  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
}

async function imageForCafe24(file) {
  const mime = mimeFromName(file.path);
  if (file.data.byteLength <= MAX_DIRECT_BYTES) {
    return dataUri(file.data, mime);
  }
  if (mime === "image/gif") {
    throw new Error(
      `${file.path} GIF 용량이 너무 큽니다. GIF 원본은 나중 단계에서 만들고, 카페24 상품등록에는 정지 이미지를 사용해주세요.`,
    );
  }

  const objectUrl = URL.createObjectURL(new Blob([file.data], { type: mime }));
  try {
    const image = await loadBrowserImage(objectUrl);
    for (const maxWidth of [2000, 1700, 1400, 1100]) {
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("브라우저 이미지 축소 기능을 사용할 수 없습니다.");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.9, 0.82, 0.74, 0.66]) {
        const blob = await canvasBlob(canvas, quality);
        if (blob && blob.size <= MAX_DIRECT_BYTES) {
          return dataUri(
            new Uint8Array(await blob.arrayBuffer()),
            "image/jpeg",
          );
        }
      }
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  throw new Error(
    `${file.path} 이미지 용량을 자동으로 줄이지 못했습니다. 원본 크기를 확인해주세요.`,
  );
}

function numberText(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

export default function Cafe24RegistrationPanel({ buildOutputFiles, sourceName }) {
  const [pasteText, setPasteText] = useState("");
  const [productNames, setProductNames] = useState([]);
  const [form, setForm] = useState({
    productName: "",
    price: "",
    supplyPrice: "",
    colors: "",
    sizes: "",
    hashtags: "",
    description: "",
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const [connectUrl, setConnectUrl] = useState("");

  const optionGroups = useMemo(
    () => makeOptionGroups(form.colors, form.sizes),
    [form.colors, form.sizes],
  );
  const tags = useMemo(() => normalizeProductTags(form.hashtags), [form.hashtags]);

  function patch(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  function applyPaste() {
    const parsed = parseRegistrationPaste(pasteText);
    setProductNames(parsed.productNames || []);
    setForm({
      productName: parsed.productName || "",
      price: numberText(parsed.price),
      supplyPrice: numberText(parsed.supplyPrice),
      colors: parsed.colors || "",
      sizes: parsed.sizes || "",
      hashtags: parsed.hashtags || "",
      description: parsed.description || "",
    });
    setResult(null);
    setConnectUrl("");
    setStatus(
      parsed.productName
        ? "상품정보를 채웠습니다. 아래 내용과 가격을 확인한 뒤 임시등록하세요."
        : "상품명을 찾지 못했습니다. 등록용 블록 형식을 확인해주세요.",
    );
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && data.connectUrl) {
      setConnectUrl(data.connectUrl);
      const error = new Error("카페24 다시 연결이 필요합니다.");
      error.connectRequired = true;
      throw error;
    }
    return { response, data };
  }

  async function uploadImage(file, index, total) {
    setStatus(`카페24 이미지 업로드 ${index}/${total} · ${file.path}`);
    const image = await imageForCafe24(file);
    const { response, data } = await postJson("/api/cafe24/product-image", {
      image,
    });
    if (!response.ok) throw new Error(data.error || "카페24 이미지 업로드 실패");
    if (!data.path) throw new Error("카페24 이미지 경로를 확인하지 못했습니다.");
    return data.path;
  }

  async function registerProduct() {
    if (result?.productCreated) {
      setStatus(
        `이미 상품번호 ${result.productNo || "(확인 필요)"}가 생성되었습니다. 중복 등록 방지를 위해 다시 등록할 수 없습니다.`,
      );
      return;
    }
    if (!form.productName.trim()) {
      setStatus("상품명을 확인해주세요.");
      return;
    }
    if (!numberText(form.price)) {
      setStatus("판매가를 입력해주세요.");
      return;
    }
    if (!numberText(form.supplyPrice)) {
      setStatus("공급가를 입력해주세요.");
      return;
    }

    setBusy(true);
    setConnectUrl("");
    setStatus("정리 이미지를 등록용으로 준비하는 중...");
    try {
      const output = await buildOutputFiles();
      const main = output.files.filter((file) =>
        file.path.startsWith("01_메인_GIF용/"),
      );
      const detail = output.files.filter((file) =>
        file.path.startsWith("02_상세이미지/"),
      );
      if (!main.length || !detail.length)
        throw new Error("메인 이미지와 상세이미지가 각각 한 장 이상 필요합니다.");
      if (main.length > 21)
        throw new Error(
          "메인·GIF용 이미지는 대표 1장 + 추가 20장까지 등록할 수 있습니다. 사용할 이미지를 21장 이하로 줄여주세요.",
        );

      const all = [...main, ...detail];
      const uploaded = [];
      for (let index = 0; index < all.length; index += 1) {
        uploaded.push(await uploadImage(all[index], index + 1, all.length));
      }
      const mainImagePaths = uploaded.slice(0, main.length);
      const detailImagePaths = uploaded.slice(main.length);

      setStatus("이미지 업로드 완료 · 카페24에 진열안함/판매안함 상품을 생성하는 중...");
      const { response, data } = await postJson("/api/cafe24/products", {
        productName: form.productName.trim(),
        price: Number(numberText(form.price)),
        supplyPrice: Number(numberText(form.supplyPrice)),
        description: form.description,
        tags,
        optionGroups,
        mainImagePaths,
        detailImagePaths,
      });

      if (data.productCreated) {
        setResult(data);
      }
      if (!response.ok) {
        throw new Error(data.error || "카페24 상품 등록 결과를 확인하지 못했습니다.");
      }
      if (!data.ok) {
        throw new Error(data.error || "카페24 상품 등록이 일부만 완료됐습니다.");
      }
      setResult(data);
      setStatus(
        `카페24 임시등록 완료 · 상품번호 ${data.productNo} · 진열안함 / 판매안함`,
      );
    } catch (error) {
      setStatus(error.message || "카페24 임시등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cafe24-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">4. 한 번 붙여넣고 등록</span>
          <h2>카페24 임시등록</h2>
          <p>
            ChatGPT 답변의 OARS 등록용 블록을 한 번 붙여넣고 최종 확인합니다.
            앞에서 정리한 이미지는 다시 고르지 않습니다.
          </p>
        </div>
        <span className="safe">항상 진열안함 · 판매안함</span>
      </div>

      <label className="paste-box">
        <span>ChatGPT 상품정보 붙여넣기</span>
        <textarea
          aria-label="ChatGPT 상품정보 붙여넣기"
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          placeholder={"[OARS 등록용]\n상품명 1: ...\n상품명 2: ...\n상품명 3: ...\n판매가: ...\n공급가: ...\n색상: ...\n사이즈: ...\n해시태그: ...\n상세페이지 문구:\n..."}
          rows={10}
        />
      </label>
      <button className="apply" type="button" onClick={applyPaste}>
        내용 채우기
      </button>

      <div className="form-grid">
        <label className="wide">
          <span>카페24 상품명</span>
          {productNames.length > 1 && (
            <select
              aria-label="추천 상품명 선택"
              value={form.productName}
              onChange={(event) => patch("productName", event.target.value)}
            >
              {productNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
          <input
            aria-label="카페24 상품명"
            value={form.productName}
            onChange={(event) => patch("productName", event.target.value)}
          />
        </label>
        <label>
          <span>판매가</span>
          <input
            aria-label="카페24 판매가"
            inputMode="numeric"
            value={form.price}
            onChange={(event) => patch("price", numberText(event.target.value))}
            placeholder="29900"
          />
        </label>
        <label>
          <span>공급가</span>
          <input
            aria-label="카페24 공급가"
            inputMode="numeric"
            value={form.supplyPrice}
            onChange={(event) => patch("supplyPrice", numberText(event.target.value))}
            placeholder="12000"
          />
        </label>
        <label>
          <span>색상 옵션</span>
          <input
            aria-label="카페24 색상 옵션"
            value={form.colors}
            onChange={(event) => patch("colors", event.target.value)}
            placeholder="블랙, 크림"
          />
        </label>
        <label>
          <span>사이즈 옵션</span>
          <input
            aria-label="카페24 사이즈 옵션"
            value={form.sizes}
            onChange={(event) => patch("sizes", event.target.value)}
            placeholder="FREE 또는 S, M"
          />
        </label>
        <label className="wide">
          <span>해시태그</span>
          <textarea
            aria-label="카페24 해시태그"
            rows={3}
            value={form.hashtags}
            onChange={(event) => patch("hashtags", event.target.value)}
          />
          <small>{tags.length}개 · 최대 100개</small>
        </label>
        <label className="wide">
          <span>상세페이지 문구</span>
          <textarea
            aria-label="카페24 상세페이지 문구"
            rows={10}
            value={form.description}
            onChange={(event) => patch("description", event.target.value)}
          />
        </label>
      </div>

      <div className="review">
        <div>
          <span>옵션 그룹</span>
          <b>
            {optionGroups.length
              ? optionGroups.map((group) => `${group.name} ${group.values.length}개`).join(" · ")
              : "옵션 없음"}
          </b>
        </div>
        <div>
          <span>원본 폴더</span>
          <b>{sourceName || "현재 상품"}</b>
        </div>
        <div>
          <span>등록 상태</span>
          <b>진열안함 · 판매안함</b>
        </div>
      </div>

      {status && (
        <p className={result?.productCreated && !result?.ok ? "status warn" : "status"} role="status">
          {status}
        </p>
      )}

      {connectUrl && (
        <button
          className="reconnect"
          type="button"
          onClick={() => {
            location.href = connectUrl;
          }}
        >
          카페24 다시 연결
        </button>
      )}

      {result?.productCreated && (
        <div className={result.ok ? "result success" : "result partial"}>
          <b>카페24 상품번호 {result.productNo || "확인 필요"}</b>
          <span>
            {result.ok
              ? "임시등록이 끝났습니다. 카페24 관리자에서 확인한 뒤 다음 단계로 진행하세요."
              : "상품은 이미 생성됐습니다. 중복 방지를 위해 등록 버튼을 다시 누르지 마세요."}
          </span>
        </div>
      )}

      <button
        className="register"
        type="button"
        disabled={busy || Boolean(result?.productCreated)}
        onClick={registerProduct}
      >
        {busy ? "카페24 등록 중..." : "카페24 임시등록"}
      </button>

      <p className="footnote">
        등록 버튼을 눌러도 바로 판매되지 않습니다. OARS는 상품 생성 요청에 진열안함·판매안함을 강제로 적용하고,
        생성 후 상태를 다시 확인합니다.
      </p>

      <style jsx>{`
        .cafe24-panel{margin-top:28px;padding:20px;border:1px solid #465257;border-radius:16px;background:#171d1f}
        .panel-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:16px}
        .panel-head h2{margin:4px 0 6px}.panel-head p{margin:0;color:#aeb8bc;line-height:1.6;max-width:720px}
        .eyebrow{font-size:13px;color:#aeb7bb;font-weight:800}.safe{white-space:nowrap;padding:8px 10px;border:1px solid #536166;border-radius:999px;font-size:12px;font-weight:900}
        label{display:flex;flex-direction:column;gap:7px}label>span{font-size:13px;font-weight:800;color:#dfe5e7}
        textarea,input,select{width:100%;box-sizing:border-box;border:1px solid #414d51;background:#101516;color:#f4f7f8;border-radius:10px;padding:11px;font:inherit}
        textarea{resize:vertical;line-height:1.55}.paste-box textarea{min-height:190px}
        .apply{margin:10px 0 18px;background:#293235;font-weight:900}
        .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.wide{grid-column:1/-1}.wide select{margin-bottom:2px}.wide small{color:#879397}
        .review{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px}.review>div{padding:12px;border:1px solid #354044;border-radius:11px;background:#121719}.review span{display:block;font-size:12px;color:#8f9b9f}.review b{display:block;margin-top:4px;font-size:13px}
        .status{padding:11px 12px;border-radius:10px;background:#20282b;color:#e4eaec}.status.warn{border:1px solid #8a7546}
        .reconnect{width:100%;margin:0 0 10px;background:#3a3030;font-weight:900}.result{display:flex;flex-direction:column;gap:4px;padding:14px;border-radius:12px;margin:10px 0}.result.success{border:1px solid #52675d;background:#18221e}.result.partial{border:1px solid #8a7546;background:#282216}.result span{font-size:13px;color:#c2cbce}
        .register{width:100%;margin-top:14px;padding:14px;background:#edf1f2;color:#111719;font-weight:900;font-size:15px}.register:disabled{opacity:.55;cursor:not-allowed}
        .footnote{font-size:12px;color:#8e999d;line-height:1.55;margin:10px 2px 0}
        @media(max-width:680px){.panel-head{display:block}.safe{display:inline-block;margin-top:10px}.form-grid,.review{grid-template-columns:1fr}.wide{grid-column:auto}}
      `}</style>
    </section>
  );
}
