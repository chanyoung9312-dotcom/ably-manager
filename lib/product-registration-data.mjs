const LABELS = [
  ["productName", /^(?:추천\s*)?상품명(?:\s*\d+)?\s*[:：]\s*(.*)$/i],
  ["yuanCost", /^(?:중국\s*원가|원가\s*\(\s*위안\s*\)|위안\s*원가)\s*[:：]\s*(.*)$/i],
  ["targetMargin", /^(?:목표\s*)?(?:순\s*마진|마진)\s*[:：]\s*(.*)$/i],
  ["price", /^(?:카페24\s*)?판매가\s*[:：]\s*(.*)$/i],
  ["supplyPrice", /^공급가\s*[:：]\s*(.*)$/i],
  ["colors", /^(?:색상|컬러|color)\s*[:：]\s*(.*)$/i],
  ["sizes", /^(?:사이즈|size)\s*[:：]\s*(.*)$/i],
  ["hashtags", /^(?:해시태그|태그|hashtags?)\s*[:：]\s*(.*)$/i],
  ["description", /^(?:상세페이지(?:\s*문구)?|상세설명|description)\s*[:：]?\s*(.*)$/i],
];

export const FIXED_SUPPLY_PRICE = 10000;
export const YUAN_TO_KRW = 230;
const SALE_PRICE_KEEP_RATE = 1 - 0.085 - 0.1 - 0.1;

function numericValue(value) {
  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function calculateSalePrice(yuanCost, targetMargin, roundTo = 100) {
  const yuan = numericValue(yuanCost);
  const margin = numericValue(targetMargin);
  if (!(yuan > 0) || !(margin >= 0)) return null;

  const wonCost = yuan * YUAN_TO_KRW;
  const rawPrice =
    (margin + wonCost + wonCost * 0.05 + 5000) / SALE_PRICE_KEEP_RATE;
  const unit = Number(roundTo) > 0 ? Number(roundTo) : 1;
  return Math.ceil(rawPrice / unit) * unit;
}

export function calculateNetMargin(yuanCost, salePrice) {
  const yuan = numericValue(yuanCost);
  const price = numericValue(salePrice);
  if (!(yuan > 0) || !(price > 0)) return null;

  const wonCost = yuan * YUAN_TO_KRW;
  const costs =
    wonCost +
    price * 0.085 +
    price * 0.1 +
    price * 0.1 +
    wonCost * 0.05 +
    5000;
  return Math.round(price - costs);
}

export function splitRegistrationList(value) {
  return String(value || "")
    .split(/[,\n/|]+/)
    .map((item) => item.trim().replace(/^#+/, ""))
    .filter(Boolean);
}

function registrationBlock(text) {
  const normalized = String(text || "").replace(/\r/g, "");
  const lines = normalized.split("\n");
  const startIndex = lines.findIndex((line) =>
    /^\s*\[?OARS\s*등록용\]?\s*$/i.test(line.trim()),
  );
  if (startIndex < 0) return lines;

  const endOffset = lines
    .slice(startIndex + 1)
    .findIndex((line) => /^\s*\[?OARS\s*끝\]?\s*$/i.test(line.trim()));
  const endIndex = endOffset < 0 ? lines.length : startIndex + 1 + endOffset;
  return lines.slice(startIndex + 1, endIndex);
}

export function parseRegistrationPaste(text) {
  const result = {
    productName: "",
    productNames: [],
    yuanCost: "",
    targetMargin: "",
    price: "",
    supplyPrice: "",
    colors: "",
    sizes: "",
    hashtags: "",
    description: "",
  };
  let active = "";
  for (const raw of registrationBlock(text)) {
    const line = raw
      .trim()
      .replace(/\*\*/g, "")
      .replace(/^[-*•]\s*/, "");
    if (!line) {
      if (active === "description" && result.description) result.description += "\n";
      continue;
    }
    const matched = LABELS.find(([, pattern]) => pattern.test(line));
    if (matched) {
      const [key, pattern] = matched;
      const value = line.match(pattern)?.[1]?.trim() || "";
      active = key;
      if (key === "productName") {
        if (value && !result.productNames.includes(value)) result.productNames.push(value);
        if (!result.productName && value) result.productName = value;
      } else {
        result[key] = value;
      }
      continue;
    }
    if (active === "description") {
      result.description += (result.description ? "\n" : "") + raw.trimEnd();
    } else if (active === "hashtags") {
      result.hashtags += (result.hashtags ? ", " : "") + line;
    } else {
      active = "";
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
