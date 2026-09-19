function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanList(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map((item) => cleanText(item)).filter(Boolean);
}

export function buildProductInfoPrompt({
  zipName = "정리완료.zip",
  mainCount = 0,
  detailCount = 0,
  hasSizeReference = false,
} = {}) {
  return `에이블리 여성의류 상품 등록용 정보를 만들어줘.

대상 고객: 20대 초반~중반 여성
판매 채널: 에이블리
입력 파일: ${zipName}
메인·GIF용 이미지: ${mainCount}장
상세 이미지: ${detailCount}장
사이즈 참고 이미지: ${hasSizeReference ? "있음" : "없음"}

작성 원칙:
- 이미지에서 실제로 확인되는 특징만 사용하고, 보이지 않는 소재·두께·신축성·안감·핏은 추측하지 않는다.
- 상품명은 검색 키워드만 나열하지 말고 에이블리에서 자연스럽게 보이는 클릭형 이름으로 3개 제안한다.
- 상세페이지 문구는 여러 조각으로 나누지 말고 한 번에 복사할 수 있는 하나의 연속된 문구로 작성한다.
- 해시태그는 상품과 직접 관련된 키워드 30개를 만들고 # 없이 작성한다.
- 색상/옵션은 이미지나 제공 자료에서 확인 가능한 것만 적는다.
- 사이즈 수치가 둘레로 제공되면 가슴/허리/힙은 단면으로 변환하고, 단위를 임의로 만들지 않는다.
- 사이즈 정보가 확인되지 않으면 sizeRows는 빈 배열로 둔다.
- 중국어 원문을 한국어 상품명에 그대로 섞지 않는다.

반드시 아래 JSON 형식 하나로만 답해줘. 설명 문장이나 마크다운 코드블록은 넣지 마.
{
  "productNames": ["상품명1", "상품명2", "상품명3"],
  "detailText": "한 번에 복사할 수 있는 상세페이지 문구",
  "hashtags": ["키워드1", "키워드2"],
  "colors": ["색상1", "색상2"],
  "sizeRows": [
    {
      "size": "FREE",
      "values": {
        "가슴단면": "00",
        "허리단면": "00",
        "총길이": "00"
      }
    }
  ],
  "notes": "확실하지 않거나 사람이 확인해야 할 정보"
}`;
}

export function parseProductInfoDraft(raw) {
  let text = cleanText(raw);
  if (!text) throw new Error("ChatGPT 결과를 붙여넣어주세요.");

  text = text
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/i, "")
    .trim();

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) text = text.slice(first, last + 1);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON 형식을 읽지 못했습니다. ChatGPT 결과 전체를 다시 붙여넣어주세요.");
  }

  const productNames = cleanList(parsed.productNames).slice(0, 3);
  const hashtags = cleanList(parsed.hashtags)
    .map((item) => item.replace(/^#+/, "").trim())
    .filter(Boolean);
  const colors = cleanList(parsed.colors);
  const sizeRows = Array.isArray(parsed.sizeRows)
    ? parsed.sizeRows
        .map((row) => ({
          size: cleanText(row?.size),
          values:
            row?.values && typeof row.values === "object" && !Array.isArray(row.values)
              ? Object.fromEntries(
                  Object.entries(row.values)
                    .map(([key, value]) => [cleanText(key), cleanText(value)])
                    .filter(([key, value]) => key && value),
                )
              : {},
        }))
        .filter((row) => row.size || Object.keys(row.values).length)
    : [];

  if (!productNames.length) throw new Error("추천 상품명이 없습니다.");
  if (!cleanText(parsed.detailText)) throw new Error("상세페이지 문구가 없습니다.");

  return {
    productNames,
    detailText: cleanText(parsed.detailText),
    hashtags,
    colors,
    sizeRows,
    notes: cleanText(parsed.notes),
  };
}

export function formatHashtags(items) {
  return cleanList(items)
    .map((item) => item.replace(/^#+/, "").trim())
    .filter(Boolean)
    .join(", ");
}

export function formatSizeRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return "사이즈 정보 없음";
  return rows
    .map((row) => {
      const values = Object.entries(row.values || {})
        .map(([key, value]) => `${key} ${value}`)
        .join(" | ");
      return [row.size, values].filter(Boolean).join(" | ");
    })
    .join("\n");
}
