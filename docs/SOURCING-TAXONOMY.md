# 상품명 taxonomy 1.0.0 — 독립 모듈 검증

## 범위

`lib/sourcing-taxonomy.mjs`는 상품명과 명시적인 식별정보만 받는 순수 함수다.
외부 의존성, 시트 I/O, 주문 조회, 매출/취소 계산, MD 판단, 추천 점수는 없다.
기존 화면·API에서는 import하지 않는다. UI·추천 판정 연결은 후속 작업이다.

```js
import { classifyProductName } from "../lib/sourcing-taxonomy.mjs";

const taxonomy = classifyProductName("[미니&롱/벨트세트] 브이넥 셔링 원피스", {
  productNo: "69382270",
  sourceKey: "MD:D1569", // 호출자가 제공하는 스냅샷 위치. 영구 ID로 간주하지 않음.
});
```

## 반환 계약

| 필드 | 의미 |
| --- | --- |
| originalName | 공백·이모지를 포함한 원문. 문자열 아닌 입력은 null과 product issue 반환 |
| productNo / sourceKey | 명시된 식별정보만 보존. 이름으로 다른 상품에 연결하지 않음 |
| primaryCategory | 원피스/상의/하의/아우터/세트/가방/기타/미확인 중 하나 |
| baseType | 배타적인 기본 품목 하나. 충돌 시 미확인 |
| secondaryCategory | 원피스 기장 등 집계용 표시 분류. 기본 팬츠·탑은 세부미확인 표시 |
| attributes | length, fitEase, silhouette, widthShape, design, neckline, pattern, materialExpression, garmentForm |
| saleComposition | single / clothingSet / mixedSingleSet / unconfirmed |
| accessoryBundle | 벨트세트가 명시된 경우 [벨트]. 벨티드만으로 구성품 포함을 추정하지 않음 |
| optionAttributes.length | {status, choices}. 미니&롱이면 choices=[미니,롱], 기장선택만 있으면 null |
| evidence | {field, value, keyword, start, end, ruleId, scope, basis} 배열 |
| review | {scope, field, code, candidates} 배열. product 또는 field 범위의 issue |
| orderLinkStatus | 명시 상품번호가 있으면 linked, 없으면 unlinked |
| taxonomyVersion | 1.0.0 |

`linked`는 **주문 연결용 키가 존재한다**는 뜻이다. 주문 존재·매칭 성공·판매 수량을
검증했다는 뜻이 아니다. 주문 여부나 판매 0을 나타내는 필드는 반환하지 않는다.
번호 없는 10개도 동일하게 분류되며 이름 유사도 매칭은 없다.

각 attributes 필드는 `{status, values, candidates}` 형태다.

| status | values | candidates / 해석 |
| --- | --- | --- |
| confirmed | 확정 태그 배열 | 빈 배열 |
| unknown | 빈 배열 | 정보 없음. 예: 패턴 미기재는 무지 아님 |
| conflict | 빈 배열 | 서로 충돌하는 명시 후보 |
| option | 빈 배열 | 명시 선택지가 있으면 후보 보존; optionAttributes에도 표시 |
| not_applicable | 빈 배열 | 해당 축 비적용. 예: 가방의 의류 기장 |
| unscoped | 빈 배열 | 세트 구성품 또는 품목 미확정으로 귀속할 수 없는 표현 |

속성 집계는 confirmed의 values만 사용한다. 후보·옵션·세트의 미귀속 표현은
상품 공통 속성에 더하지 않는다. 상품 수 집계는 식별키로 중복 제거해야 한다.
맥시와 롱이 함께 기재된 상품도 한 상품이다.

evidence의 start/end는 원문 UTF-16 오프셋 [start,end)이며
`originalName.slice(start,end) === keyword`다. 원문을 별칭으로 덮어쓰지 않는다.
basis는 explicit 또는 normalized이며 추론된 속성은 생성하지 않는다.
scope는 product, candidate, component_unassigned, option, not_applicable 중 하나다.
품목 근거는 baseType에 기록하고 포함 관계로 제거한 후보도 candidate로 보존한다.

## 분류 규칙

- 의류 세트와 벨트 부속품을 먼저 구분한다. 단품/세트 혼합 판매는 보류한다.
- 구체적인 명사와 승인된 포함 관계를 사용한다. 키워드 등장 순서나 상품번호별
  예외 규칙을 사용하지 않는다.
- 셔츠원피스는 원피스+셔츠형, 니트가디건/니트티셔츠/니트나시/니트스커트는
  각각의 기본 품목+소재표현 니트다. 니트 하나만 명시됐을 때는 상의 니트다.
- 치마바지 우선. 속바지내장만으로 치마바지를 생성하지 않는다.
- 셔츠/블라우스는 상의까지만 확정한다. 셔츠/자켓과 가디건/티셔츠는
  1차부터 보류한다. 후보 표현은 유지한다.
- 미니&롱은 옵션이다. 기장선택만 명시되면 선택지는 미확인이다.
- 핏을 여유도·실루엣·통/선으로 분리한다. 슬림/루즈는 충돌하지만
  A라인/플레어, 와이드/일자는 공존할 수 있다.
- 세트는 본 버전에서 구성품 귀속을 자동 확정하지 않는다. 니트+체크 롱스커트의
  체크를 니트 패턴으로, 니트를 스커트 소재로 옮기지 않는다.
- 백포켓, 스트랩/플랩, 셔츠묶음/셔츠형, 와이드카라/와이드 라운드 유넥,
  노카라, 롱슬리브, 가방의 미니/미디 크기를 각각 제외/범위 규칙으로 처리한다.
- 여리핏·인생핏·체형커버·주문폭주 등의 마케팅 표현은 객관 태그가 아니다.
  골지→니트, 실키→실크, 바스락→나일론 추론은 하지 않는다.
- 알려진 어휘만 인식한다. 누락된 속성을 완성하거나 상품 사진의 특징을 추정하지 않는다.

## 전체 271개 재검증

기준: 2026-09-18 완료된 `OARS_taxonomy_validation(1).md` 부록 A.
`tests/fixtures/sourcing-taxonomy-md-271.json`은 이 보고서의 **독립 기대값**을
그대로 옮긴 고정 회귀 자료다. 모듈 출력으로 기대값을 생성하지 않았다.
상품명·상품번호·MD 행과 분류 근거만 포함하며 고객/주문 개인정보는 포함하지 않는다.

이번 작업에서 MD A1:Z3367을 다시 읽고 기존 parseMd로 파싱한 271개 모두를
기준 자료와 대조했다. 상품명·상품번호·행이 일치했으며 추가/삭제/변경은 0개였다.
따라서 고정 자료 전체 재분류가 현재 MD 전체의 재분류와 동일함을 확인했다.

| 지표 | 이전 검증 | 모듈 결과 |
| --- | --- | --- |
| 전체 상품 | 271 | 271 |
| 1차 분류 가능 | 268 | 268 |
| 기본 또는 보수적 상위 품목 분류 가능 | 263 | 263 |
| 품목 보류 | 8 | 8 |
| 일부 속성 충돌 | 4 | 4 |
| 기장 선택형 | 3 | 3 |
| 상품번호 없음/unlinked | 10 | 10 |

1차 수: 하의 122, 상의 89, 원피스 30, 세트 13, 아우터 8, 가방 5, 기타 1, 미확인 3.
원피스 2차: 롱 20, 미니 6, 기장선택 3, 기장미확인 1.

271개 각각의 1차·기본 품목·2차 및 9개 속성 축의 확정 태그를 대조했다.
차이가 있는 상품은 **0개**다. 명시 속성의 추출 가능 비율이며 실물 정확도는 아니다.

품목 보류 전체 8개:
76538098, 76537982, 75409731, 75319577, 68914084 (셔츠/블라우스),
68460262 (단품/세트), 68311174 (셔츠/자켓), 67225964 (카디건/티셔츠).

속성 충돌 전체 4개:
70339350·70240590 (넥라인), 69357544 (미디/롱), 67431067 (슬림/루즈).
기장 선택형 전체 3개: 70339341, 69382270, 69357543.

## 테스트와 기존 기능 보존

- 신규 taxonomy: `node --test tests/sourcing-taxonomy.test.mjs` — 309/309 통과.
  전체 271개 개별 검증과 전체 집계, 실제 오분류 사례, 구성품 범위, 후보/옵션,
  원문 근거와 오프셋, 별칭, 누락 ID, 불량 입력 격리, 순수성 검증을 포함한다.
- 전체: `npm test` — 396/396 통과 (기존 87 + 신규 309).
- `npm run build` — 성공, 18/18 페이지 생성.
- 기존 baseline e784a01은 87개 중 84 통과, 3 실패를 재현했다.
  실패는 삭제된 중복 버튼의 location.href 검사, 변경 전 메뉴명,
  변경 전 ‘최근 주문’ 문구 검사였다. tests/home-nav.test.mjs와
  tests/ui-roles.test.mjs만 현재 전역 메뉴/경로, 마지막 주문 값 및 액션 표시 검사로
  갱신했다. 화면을 수정하거나 실패를 skip하지 않았다.
- lib/commerce.mjs, lib/md.mjs, 기존 주문·MD·매출 테스트, app/, package/lock은
  이 단계에서 변경하지 않았다. 화면 연결·추천 판단·main 병합·수동 배포 없음.
