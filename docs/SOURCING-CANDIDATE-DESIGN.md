# 소싱 신호 9단계 — 소싱 검토 후보 규칙 설계

## 1. 목적

8단계까지 OARS는 상품군별 관측 신호와 데이터 준비 상태를 분리해서 보여준다.

9단계의 목적은 이 관측 신호를 이용해 **사람이 먼저 검토할 소싱 후보군을 어떻게 만들지 규칙을 설계하는 것**이다.

이번 단계에서는 실제 운영 추천 기능을 구현하지 않는다.

- 추천 점수 없음
- 추천 순위 없음
- 자동 사입 없음
- 소싱 수량 없음
- 더 소싱/줄이기 명령 없음
- `evidence_strong` / `weak_observed_signal` 활성화 없음

출력의 의미는 **“먼저 살펴볼 가치가 있는 관측 후보”**이며, 구매·사입 결론이 아니다.

---

## 2. 왜 단순 추천 목록으로 만들면 안 되는가

현재 데이터에는 네 가지 서로 다른 상태가 섞여 있다.

1. 여러 상품에서 반응과 반복이 확인되고 최근에도 활동이 있는 유형
2. 누적 수량은 크지만 소수 히트상품에 근거가 몰린 유형
3. 최근 반응은 생겼지만 아직 서로 다른 날짜의 반복이 없는 유형
4. 주문이 없지만 노출·테스트 기간을 몰라 실패라고 할 수 없는 유형

이 네 종류를 한 개 점수로 정렬하면 의미가 섞인다.

예를 들어 현재 snapshot에서:

- 숏·하프팬츠: 27개 연결 상품 중 8개 반응, 다른 날짜 반복 2개, 최근30일 반응 상품 3개
- 롱원피스: 19개 연결 상품 중 4개 반응이지만 TOP2가 176/178 = 98.9%
- A라인: 21개 연결 상품 중 2개 반응, 다른 날짜 반복 0개
- 니트: 13개 연결 상품에서 주문 반응 0개

따라서 “후보”와 “히트 참고”, “관찰 대기”, “데이터 보류”를 분리해야 한다.

---

## 3. 후보 레이어

9단계에서는 다음 4개 레이어를 사용한다.

### A. `review_candidate` — 소싱 검토 후보

여러 상품에서 반응이 관측되고, 한 번성 반응을 넘어 최소한의 반복이 있으며, 최근30일에도 실제 활동이 남아 있는 그룹.

이 상태는 **“소싱해라”가 아니라 “새 상품을 찾을 때 먼저 검토할 수 있다”**는 뜻이다.

기본 조건:

- `primaryState === exploration_signal`
- 전체 `A >= 2`
- 전체 `D >= 1`
- 최근30일 `A >= 1`
- `validationStatus !== blocked`
- `historical_only`가 아님

보조 플래그는 후보를 자동 탈락시키지 않는다.

예:
- `cooling_observed` → 최근 둔화 주의
- `mixed_recent` → 최근 지표 혼재
- `reaction_without_retained_sales` → 잔존 판매 해석 주의
- `sample_small` → 표본 주의
- `coverage_unverified / exposure_unknown / test_duration_unknown` → 관찰 근거 provisional

즉 후보 여부와 주의사항을 분리한다.

---

### B. `emerging_watch` — 추가 관찰

여러 상품에서 반응은 보였지만 반복 또는 최근성이 아직 부족한 그룹.

기본 조건:

- `primaryState === exploration_signal`
- 그러나 `review_candidate` 조건 중
  - `D >= 1`
  - 최근30일 `A >= 1`
  중 하나 이상을 충족하지 못함

또는:

- `primaryState === insufficient_data`
- 최근30일 `A >= 1`
- 그룹 계산 자체는 blocked가 아님

이 레이어는 소싱 후보가 아니다.

화면에서는 **“추가 관찰”**로만 보여준다.

---

### C. `hit_reference` — 히트 구조 참고

누적 반응이 커도 소수 상품에 근거가 집중된 그룹.

기본 조건:

- `primaryState === concentration_dependent`

이 그룹은 카테고리 전체를 소싱 후보로 올리지 않는다.

대신:

- 어떤 상품이 주문을 만들었는지
- 해당 상품이 어떤 속성을 함께 가지고 있는지
- TOP1/TOP2 제거 후 무엇이 남는지

를 보는 **히트 구조 참고 자료**로 사용한다.

즉:

`롱원피스 → 새 롱원피스를 많이 찾아라`

가 아니라,

`롱원피스의 기존 히트 2개에서 반복되는 구체적 요소를 확인하라`

에 가깝다.

---

### D. `data_hold` — 데이터 보류

현재 데이터로 소싱 후보 여부를 판단할 수 없는 그룹.

기본 조건:

- `primaryState === insufficient_data`
- 최근30일 반응도 없거나
- 계산이 blocked이거나
- 주문 연결 가능한 상품이 없거나
- 0주문인데 노출/테스트 기간을 모름

주문 0은 실패가 아니다.

`니트 주문 0 → 니트 비추천`

같은 결과를 만들면 안 된다.

---

## 4. 후보로 사용할 그룹 레벨

모든 142개 그룹을 동일한 후보로 취급하지 않는다.

### 실제 후보의 기본 단위

우선 다음만 독립적인 `review_candidate` 후보가 될 수 있다.

- `baseType`
- `secondaryCategory`

예:
- 숏·하프팬츠
- 스커트
- 롱원피스

### primaryCategory

`상의 / 하의 / 원피스` 같은 대분류는 너무 넓기 때문에 독립 소싱 후보로 사용하지 않는다.

화면의 상위 문맥/요약으로만 사용한다.

### 단일 attribute

`와이드 / 셔링 / 스트라이프` 같은 속성은 여러 품목에 걸쳐 있으므로 단독 소싱 후보로 만들지 않는다.

속성은 반드시:

- 관련 품목
- 승인된 combination
- 실제 기여 상품

과 같이 보여준다.

### combination

승인된 combination은 독립 추천이 아니라 **품목 후보를 구체화하는 근거**로 사용한다.

예:

`숏·하프팬츠` 후보 안에서
`숏·하프팬츠 ∩ 데님`

을 확인할 수는 있지만, 해당 조합 자체가 최근성과·반복성을 충족하지 못하면 긍정 속성으로 승격하지 않는다.

---

## 5. 속성 힌트 규칙

후보 품목 아래에 붙는 속성은 다음 3가지 상태로 구분한다.

### `supported_hint`

품목×속성 combination에서:

- `A >= 2`
- `D >= 1`
- 최근30일 `A >= 1`
- concentration dependent가 아님

일 때만 “반복 관측 속성”으로 표시할 수 있다.

### `emerging_hint`

- `A >= 2`
- 그러나 `D === 0` 또는 최근30일 `A === 0`

이면 “초기 관측”으로만 표시한다.

### `concentrated_hint`

combination 자체가 `concentration_dependent`이면:

**“특정 상품 근거”**

로 표시한다.

이를 품목 전체의 재현 가능한 속성으로 승격하지 않는다.

---

## 6. 공유 근거 중복 방지

한 상품이 여러 속성을 동시에 만들 수 있다.

예:

- 상품 A → 롱 + 오버핏 + 스트라이프
- 상품 B → 롱 + 핀턱 + 셔링 + 퍼프

따라서 후보 설명에 속성 5개가 있어도 독립 성공 사례 5개로 세면 안 된다.

후보 데이터 계약에는 반드시 다음을 유지한다.

- `contributingProductIds`
- `repeatedProductIds`
- `sharedEvidence`
- `equivalentGroups`

속성 힌트끼리 기여 상품 집합이 같거나 대부분 겹치면 UI에서 **근거 상품 공유**를 표시한다.

후보 개수 계산에도 중복 성공 건수로 합산하지 않는다.

---

## 7. 최근성 사용법

최근7/14/30일은 합산하지 않는다.

역할은 다음처럼 나눈다.

- 30일 → 현재 활동 여부를 판단하는 기본 창
- 14일 → 방향 변화 확인
- 7일 → 급격한 변화 참고

`review_candidate`의 최근성 게이트는 최근30일 `A >= 1`만 사용한다.

7일 0만으로 후보를 탈락시키지 않는다.

최근 방향은 보조 경고로만 사용한다.

- `recent_up_observed` → 최근 증가 관측
- `cooling_observed` → 최근 둔화 관측
- `mixed_recent` → 지표 혼재
- `no_recent7_observed` → 최근7일 반응 없음

---

## 8. Q/N/E 처리

후보 생성에서도 의미를 분리한다.

- Q = 주문 반응
- N = 확정 취소·반품 차감 후 관측 수량
- E = 기존 판단 로직에서 반영 가능한 수량

후보 진입의 주 게이트는 상품 단위 확산/반복과 최근 활동이다.

취소·반품 사유가 상품 경쟁력과 무관할 수 있으므로 E가 낮다는 이유만으로 자동 탈락시키지 않는다.

대신:

- 최근 Q > 0, E = 0
- `reaction_without_retained_sales`

이면 경고를 붙인다.

---

## 9. 데이터 준비 상태와 후보의 관계

8단계 readiness는 후보를 없애기 위한 장치가 아니다.

현재처럼 노출수·실제 테스트 기간·현재 판매 가능 여부가 없는 경우에도 `review_candidate`를 만들 수는 있다.

대신 모든 후보에:

`confidence = provisional`

을 붙인다.

향후 다음 네 항목이 모두 검증되면 별도 validated 후보 정책을 검토할 수 있다.

- 주문 수집 범위
- 상품 노출
- 실제 테스트 기간
- 현재 판매 가능 여부

하지만 9단계에서는 validated 후보를 만들지 않는다.

`evidence_strong`도 계속 비활성화한다.

---

## 10. 정렬

후보를 점수화하거나 1위/2위로 랭킹하지 않는다.

화면 편의를 위한 정렬만 허용한다.

기본 정렬:

1. 최근30일 반응 상품 수
2. 전체 다른 날짜 반복 상품 수
3. 전체 반응 상품 수
4. 이름

이는 추천 점수가 아니라 **관측값 정렬**이다.

BEST, TOP 추천, 추천점수 같은 표현은 사용하지 않는다.

---

## 11. 후보 출력 계약 초안

```js
{
  candidateId,
  groupId,
  groupLevel,
  label,

  lane:
    "review_candidate" |
    "emerging_watch" |
    "hit_reference" |
    "data_hold",

  confidence: "provisional",

  observations: {
    linkedProducts,
    reactingProducts,
    repeatedDateProducts,
    retainedRepeatedProducts,
    recent30ActiveProducts,
    Q,
    N,
    E,
    top1Share,
    top2Share
  },

  cautionFlags: [],
  reasonCodes: [],

  contributors: {
    reactingProductIds: [],
    repeatedProductIds: [],
    sharedEvidenceProductIds: []
  },

  attributeHints: [
    {
      groupId,
      label,
      state:
        "supported_hint" |
        "emerging_hint" |
        "concentrated_hint",
      contributingProductIds: []
    }
  ],

  readiness: {
    coverage,
    exposure,
    testDuration,
    availability
  }
}
```

추천 점수 필드는 두지 않는다.

---

## 12. 현재 snapshot 드라이런

현재 6단계 회귀 fixture와 4~7단계 검증값을 기준으로 규칙을 대입하면 다음처럼 해석된다.

| 그룹 | 관측값 | 9단계 레이어 | 이유 |
|---|---|---|---|
| 숏·하프팬츠 | L27 / A8 / D2 / DE2 / 최근30일 A3 / TOP1 28.6% / TOP2 50.0% | `review_candidate` | 여러 상품 반응 + 다른 날짜 반복 + 최근 활동, concentration 과반 기준 미충족 |
| 롱원피스 | L19 / A4 / D2 / DE2 / 최근30일 A2 / TOP2 98.9% | `hit_reference` | 누적 반응 대부분이 상위 2개 상품에 집중 |
| 와이드 | L41 / A8 / D3 / DE2 / 최근30일 A4 / TOP2 61.1% | `hit_reference` | 여러 상품 반응은 있으나 기존 엔진에서 상위 상품 집중 의존 확인 |
| A라인 | L21 / A2 / D0 / 최근30일 A1 | `emerging_watch` | 최근 신호는 있으나 서로 다른 날짜 반복 없음 |
| 스커트 ∩ A라인 | L14 / A2 / D0 / 최근30일 A1 | `emerging_hint` | 조합 반응은 있으나 반복성 미확인 |
| 팬츠 ∩ 와이드 | L24 / A3 / D2 / DE1 / 최근30일 A1 / TOP1 72.7% | `concentrated_hint` | 조합 주문이 특정 상품에 크게 집중 |
| 숏·하프팬츠 ∩ 데님 | L13 / A3 / D0 / 최근30일 A0 | `emerging_hint` | 과거 반응은 있으나 반복·최근성이 없음 |
| 니트 | L13 / A0 / 최근30일 A0 | `data_hold` | 주문 미관측이지만 노출·테스트 기간을 모르므로 실패 판정 불가 |

### 이 드라이런에서 중요한 점

현재 데이터만 사용하면 **숏·하프팬츠처럼 실제 review candidate가 많지 않을 수 있다.**

이는 문제로 보지 않는다.

후보 개수를 늘리기 위해 기준을 낮추거나 집중 상품을 일반화하면 안 된다.

---

## 13. 대표 후보와 세부 힌트

최종 UI에서 후보 한 장은 다음 구조를 권장한다.

### 소싱 검토 후보
**숏·하프팬츠**

근거:
- 27개 중 8개 상품 반응
- 서로 다른 날짜 반복 2개
- 최근30일 반응 상품 3개
- TOP1 28.6%, TOP2 정확히 50.0%

주의:
- 최근14일 Q/N/E 방향 혼재
- 노출·테스트 기간 미확인

속성 참고:
- 데님 → 초기 관측, 최근30일 반응 없음

이 화면에서 “추천 1위”나 “사입 추천”으로 바꾸지 않는다.

---

## 14. 히트 참고 화면

`hit_reference`는 후보 카드와 다른 섹션으로 분리한다.

예:

### 히트 구조 참고
**롱원피스**

- 연결 19개 / 반응 4개
- TOP2 주문 비중 98.9%
- 최근30일 반응 2개
- 최근7일 반응 0개

설명:

“누적 판매량은 크지만 대부분의 근거가 두 상품에 집중돼 있습니다. 카테고리 전체 성과로 일반화하지 않고 기존 히트상품의 공통 요소를 확인합니다.”

여기서 관련 속성의 `sharedEvidence`를 함께 보여준다.

---

## 15. 9단계에서 하지 않는 것

이번 단계에서는 다음을 구현하지 않는다.

- 소싱 후보 API
- 후보 UI
- 후보 자동 저장
- 추천 점수
- 추천 순위
- 소싱 수량
- 자동 발주
- strong/weak 활성화
- 노출수 추정
- 등록일로 테스트 기간 추정
- 계절성 자동 추론
- 취소율을 상품성 패널티로 직접 변환

---

## 16. 10단계 구현 기준

9단계 설계가 승인되면 10단계에서 별도 순수 모듈을 만든다.

권장:

`lib/sourcing-candidates.mjs`

입력:

- `sourcing-signals` diagnostics
- 8단계 readiness

출력:

- `review_candidate`
- `emerging_watch`
- `hit_reference`
- `data_hold`
- 품목별 attribute hints

구현 후 기존 142개 그룹 fixture로 회귀하고, 특히 다음을 고정 사례로 둔다.

1. 숏·하프팬츠 → review candidate
2. 롱원피스 → hit reference
3. 와이드 단독 → 독립 소싱 후보 금지
4. A라인 → emerging watch
5. 스커트∩A라인 → emerging hint
6. 팬츠∩와이드 → concentrated hint
7. 숏·하프팬츠∩데님 → emerging/historical hint
8. 니트 → data hold
9. 7일 0만으로 후보 탈락 금지
10. TOP2 정확히 50%는 concentration 과반으로 보지 않음
11. shared evidence를 독립 성공 수로 가산 금지
12. readiness 미확인을 실패로 변환 금지

---

## 17. 완료 기준

9단계는 다음 질문에 명확히 답할 수 있으면 완료다.

> “현재 관측 데이터에서 무엇을 소싱 검토 후보로 올리고, 무엇을 히트 참고·추가 관찰·데이터 보류로 분리할 것인가?”

그리고 그 답이:

- 누적 주문량만 보지 않고
- 집중도를 구분하고
- 다른 날짜 반복을 확인하고
- 최근 활동을 보며
- 속성을 품목 문맥 안에서만 해석하고
- 데이터 부족을 실패로 바꾸지 않는

구조여야 한다.
