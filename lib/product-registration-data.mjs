const LABELS = [
  ["productName", /^(?:추천\s*)?상품명(?:\s*\d+)?\s*[:：]\s*(.*)$/i],
  ["price", /^(?:카페24\s*)?판매가\s*[:：]\s*(.*)$/i],
  ["supplyPrice", /^공급가\s*[:：]\s*(.*)$/i],
  ["colors", /^(?:색상|컬러|color)\s*[:：]\s*(.*)$/i],
  ["sizes", /^(?:사이즈|size)\s*[:：]\s*(.*)$/i],
  ["hashtags", /^(?:해시태그|태그|hashtags?)\s*[:：]\s*(.*)$/i],
  ["description", /^(?:상세페이지(?:\s*문구)?|상세설명|description)\s*[:：]?\s*(.*)$/i],
];

export function splitRegistrationList(value) {
  return String(value || "")
    .split(/[,\n/|]+/)
    .map((item) => item.trim().replace(/^#+/, ""))
    .filter(Boolean);
}

export function parseRegistrationPaste(text) {
  const result = {
    productName: "",
    price: "",
    supplyPrice: "",
    colors: "",
    sizes: "",
    hashtags: "",
    description: "",
  };
  let active = "";
  for (const raw of String(text || "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line || /^\[?OARS\s*(?:등록용|끝)/i.test(line)) {
      if (active === "description" && result.description) result.description += "\n";
      continue;
    }
    const matched = LABELS.find(([, pattern]) => pattern.test(line));
    if (matched) {
      const [key, pattern] = matched;
      const value = line.match(pattern)?.[1]?.trim() || "";
      active = key;
      if (key === "productName") {
        if (!result.productName && value) result.productName = value;
      } else {
        result[key] = value;
      }
      continue;
    }
    if (active === "description") {
      result.description += (result.description ? "\n" : "") + raw.trimEnd();
    }
  }
  result.hashtags = splitRegistrationList(result.hashtags).join(", ");
  result.colors = splitRegistrationList(result.colors).join(", ");
  result.sizes = splitRegistrationList(result.sizes).join(", ");
  return result;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildCafe24Description(copy, imagePaths = []) {
  const lines = String(copy || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const textHtml = lines.length
    ? `<div class="oars-product-copy" style="text-align:center;line-height:1.8;">${lines
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join("")}</div>`
    : "";
  const imagesHtml = imagePaths
    .map(
      (path) =>
        `<div style="text-align:center;"><img src="${escapeHtml(path)}" alt="" style="max-width:100%;height:auto;display:block;margin:0 auto;" /></div>`,
    )
    .join("");
  return textHtml + imagesHtml;
}

export function makeOptionGroups(colors, sizes) {
  const groups = [];
  const colorValues = splitRegistrationList(colors);
  const sizeValues = splitRegistrationList(sizes);
  if (colorValues.length) groups.push({ name: "색상", values: colorValues });
  if (sizeValues.length) groups.push({ name: "사이즈", values: sizeValues });
  return groups;
}

export function normalizeProductTags(value) {
  return splitRegistrationList(value).slice(0, 100);
}
