/**
 * Name-only taxonomy. No I/O, clocks, order data, scores or MD decisions.
 * classifyProductName(name, { productNo?, sourceKey? }) never guesses missing facts.
 * Evidence offsets are UTF-16 [start, end) into the untouched originalName.
 */
export const TAXONOMY_VERSION = "1.0.0";

const UNKNOWN = "미확인";
const TYPES = [
  ["원피스", "원피스", /원피스/gu],
  ["상의", "블라우스", /블라우스/gu],
  ["상의", "셔츠", /(?<!티\s*)셔츠(?!\s*(?:형|묶음))/gu],
  ["상의", "티셔츠", /티\s*셔츠|(?:반팔|긴팔|크롭)\s*티|티(?=\s*(?:$|\())/gu],
  ["상의", "나시·슬리브리스", /나시|슬리브리스/gu],
  ["상의", "니트", /니트/gu],
  ["상의", "맨투맨", /맨투맨/gu],
  ["상의", "후드티", /후드\s*티/gu],
  ["상의", "탑", /탑/gu],
  ["하의", "스커트", /스커트|치마(?!바지)/gu],
  ["하의", "치마바지", /치마\s*바지/gu],
  ["하의", "숏·하프팬츠", /숏\s*팬츠|반바지|하프\s*팬츠|버뮤다\s*팬츠|핫팬츠|5부\s*(?:트레이닝\s*)?팬츠/gu],
  ["하의", "슬랙스", /슬랙스/gu],
  ["하의", "팬츠", /팬츠|(?<!속)바지/gu],
  ["아우터", "가디건", /가디건|카디건/gu],
  ["아우터", "자켓", /자켓|재킷/gu],
  ["아우터", "베스트", /베스트/gu],
  ["가방", "가방", /가방|(?:숄더|토트|크로스|미니|바디|호보)\s*백/gu],
  ["기타", "점프수트", /점프수트/gu],
];

// Approved semantic containment, not an ordering of competing keywords.
const CONTAINS = {
  원피스: ["셔츠", "나시·슬리브리스", "니트"],
  스커트: ["니트"],
  팬츠: ["니트"],
  점프수트: ["팬츠"],
  치마바지: ["스커트", "숏·하프팬츠", "팬츠", "니트"],
  "숏·하프팬츠": ["슬랙스", "팬츠", "니트"],
  슬랙스: ["팬츠", "니트"],
  가디건: ["니트"],
  블라우스: ["나시·슬리브리스", "탑", "니트"],
  셔츠: ["니트"],
  자켓: ["니트"],
  베스트: ["니트"],
  "나시·슬리브리스": ["티셔츠", "니트", "탑"],
  티셔츠: ["니트", "탑"],
  후드티: ["티셔츠"],
};

// Canonical values and their explicitly permitted lexical variants.
const ATTRIBUTES = {
  length: [
    ["미니", /미니(?!멀|백)/gu], ["미디", /미디(?!엄)/gu],
    ["롱", /롱(?!\s*슬리브)/gu], ["맥시", /맥시/gu],
    ["크롭", /크롭/gu], ["숏", /숏/gu],
  ],
  fitEase: [
    ["슬림", /슬림(?:핏)?/gu], ["루즈", /루즈핏/gu],
    ["오버핏", /오버핏/gu], ["박시", /박시(?:핏)?/gu],
  ],
  silhouette: [
    ["A라인", /A\s*라인/giu], ["H라인", /H\s*라인/giu],
    ["벌룬", /벌룬(?:핏)?/gu], ["플레어", /플레어/gu], ["머메이드", /머메이드/gu],
  ],
  widthShape: [
    ["와이드", /(?<!인생)와이드(?!\s*(?:카라|라운드|넥))/gu], ["일자", /일자/gu],
  ],
  design: [
    ["셔링", /셔링/gu], ["리본", /리본/gu], ["퍼프", /퍼프/gu],
    ["플리츠", /플리츠/gu], ["핀턱", /핀턱/gu], ["프릴", /프릴/gu],
    ["캉캉", /캉캉/gu], ["티어드", /티어드/gu], ["펀칭", /펀칭/gu],
    ["자수", /자수/gu], ["벨트", /벨트|벨티드/gu],
    ["랩", /(?<!스트)(?<!플)랩/gu], ["트임", /트임|슬릿/gu], ["레이스", /레이스/gu],
  ],
  neckline: [
    ["브이넥", /브이넥|V\s*넥/giu], ["카라", /(?<!노)카라/gu],
    ["노카라", /노카라/gu], ["라운드", /라운드(?:넥)?/gu],
    ["오프숄더", /오프숄더/gu], ["원숄더", /원숄더/gu],
    ["스퀘어넥", /스퀘어넥/gu], ["유넥", /유넥|U\s*넥|스쿱넥/giu],
    ["보트넥", /보트넥/gu], ["입술넥", /입술넥/gu],
    ["홀터넥", /홀터넥/gu], ["헨리넥", /헨리넥/gu],
    ["하이넥", /하이넥/gu], ["폴라·반목", /폴라|반목/gu],
    ["드레이프넥", /드레이프넥/gu],
  ],
  pattern: [
    ["스트라이프", /스트라이프|단가라|줄무늬/gu], ["체크", /체크/gu],
    ["도트", /도트|땡땡이/gu], ["플라워", /플라워|꽃무늬|잔꽃|플로럴/gu],
    ["아가일", /아가일/gu], ["레오파드", /레오파드/gu], ["무지", /무지/gu],
  ],
  materialExpression: [
    ["니트", /니트/gu], ["데님", /데님|청바지|청반바지/gu],
    ["코듀로이", /코듀로이/gu], ["레더", /레더/gu], ["스웨이드", /스웨이드/gu],
    ["모직", /모직/gu], ["벨벳", /벨벳/gu], ["린넨", /린넨/gu],
    ["텐셀", /텐셀/gu], ["코튼", /코튼/gu], ["나일론", /나일론/gu],
    ["쉬폰", /쉬폰/gu], ["시어서커", /시어서커/gu], ["메쉬", /메쉬/gu],
  ],
  garmentForm: [["셔츠형", /셔츠(?:형)?/gu]],
};

const emptyField = (status = "unknown") => ({ status, values: [], candidates: [] });
const unique = (values) => [...new Set(values)];
const has = (values, value) => values.some((v) => v === value);

export function classifyProductName(productName, identity = {}) {
  const validName = typeof productName === "string" && productName.trim().length > 0;
  const originalName = typeof productName === "string" ? productName : null;
  const metadata = identity && typeof identity === "object" && !Array.isArray(identity) ? identity : {};
  const rawId = metadata.productNo;
  const validId = typeof rawId === "string" || (typeof rawId === "number" && Number.isSafeInteger(rawId) && rawId > 0);
  const productNo = validId ? String(rawId).trim() || null : null;
  const result = {
    originalName,
    productNo,
    sourceKey: typeof metadata.sourceKey === "string" ? metadata.sourceKey : null,
    primaryCategory: UNKNOWN,
    baseType: UNKNOWN,
    secondaryCategory: UNKNOWN,
    attributes: Object.fromEntries(Object.keys(ATTRIBUTES).map((key) => [key, emptyField()])),
    saleComposition: "unconfirmed",
    accessoryBundle: [],
    optionAttributes: { length: { status: "not_applicable", choices: null } },
    evidence: [],
    review: [],
    // Means an explicit joining key exists, NOT that an order was observed.
    orderLinkStatus: productNo ? "linked" : "unlinked",
    taxonomyVersion: TAXONOMY_VERSION,
  };
  const issue = (field, code, candidates = []) => {
    result.review.push({ scope: field === "productName" ? "product" : "field", field, code, candidates });
  };
  if (rawId != null && rawId !== "" && !validId) issue("productNo", "INVALID_IDENTIFIER");
  if (!validName) {
    issue("productName", "INVALID_PRODUCT_NAME");
    return result;
  }

  const matches = (pattern) => [...originalName.matchAll(new RegExp(pattern.source, pattern.flags))];
  const record = (field, value, found, ruleId, scope = "product") => {
    for (const match of found) {
      result.evidence.push({
        field, value, keyword: match[0], start: match.index, end: match.index + match[0].length,
        ruleId, scope, basis: match[0] === value ? "explicit" : "normalized",
      });
    }
  };
  const belt = matches(/벨트\s*(?:세트|셋트|SET)/giu);
  if (belt.length) {
    result.accessoryBundle = ["벨트"];
    record("accessoryBundle", "벨트", belt, "composition.belt-accessory");
  }
  const mixed = matches(/단품\s*[/&·]\s*세트/gu);
  const clothingSet = matches(/세트|셋업|투피스|\bSET\b/giu).filter(
    (m) => !belt.some((b) => m.index >= b.index && m.index < b.index + b[0].length),
  );
  const candidates = TYPES.flatMap(([primary, base, pattern]) => {
    const found = matches(pattern);
    return found.length ? [{ primary, base, found }] : [];
  });
  // Subsumed tokens remain evidence, even when not counted as a second product.
  for (const candidate of candidates) {
    record("baseType", candidate.base, candidate.found, `type.${candidate.base}`, "candidate");
  }
  const remaining = candidates.filter((candidate) => !candidates.some(
    (other) => other !== candidate && has(CONTAINS[other.base] || [], candidate.base),
  ));
  if (mixed.length) {
    result.saleComposition = "mixedSingleSet";
    record("saleComposition", "mixedSingleSet", mixed, "composition.mixed", "option");
    issue("baseType", "MIXED_SALE_COMPOSITION", unique([...remaining.map((c) => c.base), "의류세트"]));
  } else if (clothingSet.length) {
    result.saleComposition = "clothingSet";
    result.primaryCategory = "세트";
    result.baseType = matches(/파자마/gu).length ? "파자마세트" : "의류세트";
    record("baseType", result.baseType, clothingSet, "composition.clothing-set");
  } else if (remaining.length === 1) {
    result.saleComposition = "single";
    result.primaryCategory = remaining[0].primary;
    result.baseType = remaining[0].base;
    for (const item of result.evidence) {
      if (item.field === "baseType" && item.value === result.baseType) item.scope = "product";
    }
  } else if (remaining.length > 1) {
    const primary = unique(remaining.map((c) => c.primary));
    if (primary.length === 1) result.primaryCategory = primary[0];
    issue("baseType", "CATEGORY_CONFLICT", remaining.map((c) => c.base));
  } else {
    issue("baseType", "UNKNOWN_CATEGORY");
  }

  // A top-level set name cannot say which component owns an attribute.
  const unscoped = result.primaryCategory === "세트" || result.primaryCategory === UNKNOWN;
  const bag = result.primaryCategory === "가방";
  for (const [field, rules] of Object.entries(ATTRIBUTES)) {
    const foundValues = [];
    // In this version garmentForm is the approved dress/shirt compound only.
    if (field === "garmentForm" && result.baseType !== "원피스") continue;
    for (const [value, pattern] of rules) {
      const found = matches(pattern);
      if (!found.length) continue;
      foundValues.push(value);
      const scope = unscoped ? "component_unassigned" : bag && field === "length" ? "not_applicable" : "product";
      record(`attributes.${field}`, value, found, `attribute.${field}.${value}`, scope);
    }
    result.attributes[field] = bag && field === "length"
      ? emptyField("not_applicable")
      : unscoped && foundValues.length
        ? { status: "unscoped", values: [], candidates: foundValues }
        : { status: foundValues.length ? "confirmed" : "unknown", values: foundValues, candidates: [] };
  }
  if (unscoped && Object.values(result.attributes).some((f) => f.status === "unscoped")) {
    issue("attributes", "ATTRIBUTE_SCOPE_UNRESOLVED");
  }

  const markScope = (field, scope) => {
    for (const item of result.evidence) if (item.field === `attributes.${field}`) item.scope = scope;
  };
  const conflict = (field) => {
    const candidates = result.attributes[field].values;
    result.attributes[field] = { status: "conflict", values: [], candidates };
    markScope(field, "candidate");
    issue(`attributes.${field}`, "ATTRIBUTE_CONFLICT", candidates);
  };
  const lengthChoice = matches(/미니\s*&\s*롱|기장\s*선택/gu);
  if (lengthChoice.length && !bag) {
    const explicitChoices = matches(/미니\s*&\s*롱/gu).length ? ["미니", "롱"] : null;
    result.optionAttributes.length = { status: "option", choices: explicitChoices };
    result.attributes.length = { status: "option", values: [], candidates: explicitChoices || [] };
    markScope("length", "option");
    record("optionAttributes.length", "option", lengthChoice, "length.option", "option");
  }
  if (!unscoped) {
    const length = result.attributes.length;
    // 롱/맥시 are compatible. No other different lengths imply selectable options.
    const lengthFamilies = unique(length.values.map((v) => v === "맥시" ? "롱" : v));
    if (length.status === "confirmed" && lengthFamilies.length > 1) conflict("length");
    const ease = result.attributes.fitEase.values;
    if (has(ease, "슬림") && ease.some((v) => v === "루즈" || v === "오버핏" || v === "박시")) conflict("fitEase");
    const neck = result.attributes.neckline.values;
    if ((has(neck, "라운드") && (has(neck, "유넥") || has(neck, "스퀘어넥"))) ||
        (has(neck, "카라") && has(neck, "노카라"))) conflict("neckline");
  }

  result.secondaryCategory = result.baseType;
  if (result.baseType === "팬츠" || result.baseType === "탑") result.secondaryCategory += "(세부미확인)";
  if (result.baseType === "원피스") {
    const length = result.attributes.length;
    result.secondaryCategory = length.status === "option" ? "원피스(기장선택)"
      : length.status === "confirmed" && has(length.values, "미니") ? "미니원피스"
      : length.status === "confirmed" && (has(length.values, "롱") || has(length.values, "맥시")) ? "롱원피스"
      : "원피스(기장미확인)";
  }
  return result;
}
