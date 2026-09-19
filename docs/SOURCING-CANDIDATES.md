# 소싱 신호 10단계 — 소싱 검토 후보 엔진 구현

## 목적

9단계에서 설계한 후보 분류 규칙을 독립 순수 모듈로 구현한다.

구현 파일:

- `lib/sourcing-candidates.mjs`

입력:

- 6단계 `sourcing-signals` diagnostics
- 8단계 readiness

출력:

- 품목/세부품목 단위 검토 후보
- 속성 관측 참고
- 품목 아래 combination 힌트
- readiness 요약

이 모듈은 Q/C/N/E를 다시 계산하지 않는다.

## 후보 lane

- `review_candidate`: 여러 상품 반응 + 다른 날짜 반복 + 최근30일 활동
- `emerging_watch`: 반응은 있으나 반복/최근성 근거가 아직 제한적
- `hit_reference`: `concentration_dependent`인 히트 구조 참고
- `data_hold`: 현재 자료로 후보 판단 보류

lane 판정 순서는 9단계 설계 문서와 동일하다.

## 독립 후보 단위

독립 후보가 될 수 있는 그룹은:

- `baseType`
- `secondaryCategory`

뿐이다.

다음은 독립 후보가 아니다.

- `primaryCategory`
- 단일 attribute
- combination

attribute는 `attributeReferences`로 따로 보존하고, combination은 해당 품목 아래 `attributeHints`로만 연결한다.

## combination 힌트

힌트 상태:

- `supported_hint`
- `emerging_hint`
- `concentrated_hint`
- `data_hold_hint`

`data_hold_hint`는 9단계 드라이런에서 사용한 “데이터 보류 조합”을 명시적으로 표현하기 위해 계약에 포함했다.

힌트도 점수화하지 않는다.

## 동일 상품 집합

baseType/secondaryCategory끼리 동일한 member set이면 하나의 item candidate만 만든다.

다른 level의 동일 member set은 `aliases`에 보존한다.

예:

- `롱원피스`
- `원피스 ∩ 롱`

이 동일 구성원이라면 조합을 별도 독립 후보로 추가하지 않는다.

## shared evidence

기존 `sharedEvidence`는 상품번호 배열로 그대로 보존한다.

공유 근거 개수를 점수에 더하거나 독립 성공 사례 수로 환산하지 않는다.

## readiness

readiness가 없거나 일부 미확인이어도 관측 후보를 제거하지 않는다.

현재 10단계 후보의 confidence는 항상:

`provisional`

이다.

readiness가 모두 verified여도 이 단계에서 자동으로 validated 후보로 승격하지 않는다.

## 점수/랭킹/행동

출력에는 다음 필드를 만들지 않는다.

- score
- rank
- 추천 수량
- 자동 발주
- 소싱 확대/축소

후보 엔진은 관측값 기반 분류만 수행한다.

## 현재 회귀 핵심 사례

- 숏·하프팬츠 → `review_candidate`
- 롱원피스 → `hit_reference`
- 스커트 → `hit_reference`
- 팬츠 → `hit_reference`
- 슬랙스 → `hit_reference`
- 나시·슬리브리스 → `hit_reference`
- 티셔츠 → `data_hold`
- 블라우스 → `data_hold`
- 니트 → `data_hold`
- 와이드 → 독립 후보 금지, attribute reference
- A라인 → 독립 후보 금지, attribute reference
- 숏·하프팬츠 ∩ 데님 → `emerging_hint`
- 스커트 ∩ A라인 → `emerging_hint`
- 팬츠 ∩ 와이드 → `concentrated_hint`
- 팬츠 ∩ 와이드 ∩ 데님 → `data_hold_hint`

또한:

- TOP2 정확히 50%인 숏·하프팬츠는 concentration 과반으로 바꾸지 않음
- 7일 0만으로 review candidate에서 탈락시키지 않음
- readiness 미확인을 실패로 바꾸지 않음
- policy override는 버전을 명시해야 함

## 다음 단계

10단계에서는 엔진까지만 구현한다.

후보 API 및 사용자 화면 연결은 별도 단계에서 진행한다.
