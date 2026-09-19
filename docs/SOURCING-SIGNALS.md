# 소싱 신호 진단 엔진 — 관측 정책 v1

## 범위와 기준

`lib/sourcing-signals.mjs`는 taxonomy 결과와 commerce가 이미 계산한 주문 사실을 받는 순수 모듈이다. 시계·시트·네트워크·파일 I/O, UI 연결, 총점, 순위, 소싱 행동, 사입 수량은 없다. commerce, MD, taxonomy를 import하거나 수정하지 않는다.

기준은 2026-09-19 4단계 스냅샷(MD 271개, 주문 사실 286행, 그룹 142개)과 5단계 설계다. 최신 시트를 조회하거나 과거 스냅샷을 현재 데이터로 덮어쓰지 않는다. 내부 상태명 `hit_dependent`는 `concentration_dependent`로 변경했다.

## 입력 계약

```js
import { diagnoseSourcingSignals, createSignalPeriods, SIGNAL_POLICY_VERSION } from '../lib/sourcing-signals.mjs';
const snapshot = {
  asOf: '2026-09-19', timezone: 'Asia/Seoul', taxonomyVersion: '1.0.0',
  policyVersion: SIGNAL_POLICY_VERSION,
  collectionCompleteness: 'unknown', // 'verified' only after external verification
  periods: createSignalPeriods({ asOf: '2026-09-19', timezone: 'Asia/Seoul', start: '2026-04-15' }),
};
const diagnostics = diagnoseSourcingSignals({ snapshot, products, orderFacts });
```

- `products[]`: `sourceKey`, `productNo`, `productName`, `taxonomy`(기존 분류 결과), `orderLinkStatus`. 선택적으로 `registrationDate`, `availability`, `observation`을 받는다.
- `observation`: `exposure`, `testDuration`, `availability`의 값이 외부에서 확인된 경우에만 `'verified'`. 단순 날짜 존재나 숫자 0으로 확인됨을 추정하지 않는다.
- `orderFacts[]`: `productNo`, `productOrder`, `orderNo`, `orderDate`, `qty`, `cancelQty`, `netQty`, `eligibleQty`, `pendingClaim`, 선택적 `issue`.
- 수량은 유한한 0 이상 number여야 한다. 모듈은 Q/C/N/E로 이름만 대응하여 합산한다. netQty나 eligibleQty를 qty에서 다시 계산하지 않는다.
- 날짜는 유효한 YYYY-MM-DD 또는 명시적 UTC/offset이 있는 ISO timestamp. timestamp는 snapshot.timezone으로 변환한다. 로컬 시간만 있는 모호한 timestamp는 추측하지 않는다.
- 최초 주문일은 수집 시작을 증명하지 않는다. 관측 기간 시작은 호출자가 명시한다.
- `policy`로 집중 임계값·표본 구간·강한 상태의 참고 게이트를 변경하려면 기본 버전과 다른 `version` 및 동일한 `snapshot.policyVersion`이 필요하다. 현재 정책에서 strong/weak 상태를 켜는 스위치는 없다.
- `combinations`를 제공하면 명시적으로 승인된 AND 조건만 만든다. 기본값은 4단계의 20개 교집합이다. 가능한 모든 조합을 생성하지 않는다.

## 출력 계약

루트: `snapshot`, `policyVersion`, `policy`, `groups`, `sharedEvidence`, `issues`, `validationStatus`.

각 그룹:

- `id`, `level`, `label`, `definition`, `memberKeys`.
- `periods.all/d30/p30/d14/p14/d7/p7`: R/L/U/A/Q/C/N/E/O/D/DN/DE, rate, eligibleActive, productStats, top.
- `comparisons.d30/d14/d7`: A/Q/C/N/E 각각 previous/current/delta/percent/direction/observation.
- `contributingProductIds`, `repeatedProductIds.O/D/DN/DE`, `recentActiveProductIds.d7/d14/d30`.
- `equivalentGroups`(등록 구성원 동일), `sameResponseGroups`(반응 집합 동일), `sharedEvidence`(루트 공유 근거의 productNo 참조).
- `sample`, `dataFitness`, `issues`, `primaryState`, `flags`, `validationStatus`, `reasonCodes`, `promotion`.

루트 validationStatus는 결과 묶음의 상태이고 개별 그룹의 blocked와 병존할 수 있다. 반드시 그룹 수준도 확인한다.

## 그룹과 모집단

전체(total) 1개를 포함해 primaryCategory, baseType, secondaryCategory, 확정 속성, 승인 교집합을 만든다. 전체 142개는 상호 배타적 집단이 아니므로 그룹별 주문량을 합산하면 안 된다.

번호 있는 상품은 productNo, 번호 없는 상품은 sourceKey로 고유화한다. taxonomy와 입력 모두 linked이고 상품번호가 일치해야 주문을 연결한다. 이름 유사 연결은 없다. 동일 상품번호 중복 행은 등록 수를 늘리지 않고 충돌 필드만 미확인/충돌로 둔다.

R=L+U를 검증한다. 미연결 상품은 R/U에만 포함하고 productStats 자체를 만들지 않는다. L=0이면 rate=null이며 상태 blocked/insufficient_data다. 이 경우 Q 등의 0은 **연결된 사실이 없는 빈 집합 합계**이며 상품의 0판매 측정치가 아니다. no_order_observed도 L>0에서만 붙인다.

옵션·충돌·세트 미귀속 속성은 그 필드에서만 제외한다. 알 수 없는 속성은 속성 없음이 아니다. 관련 issue는 상품·필드 범위를 보존하며 다른 그룹을 전역 중단하지 않는다. 분류 미확인은 기존 4단계처럼 별도 버킷으로 유지한다.

## 기간·반복

모든 경계는 양 끝 포함이며 7/14/30일은 합산하지 않는다. 고정 스냅샷은 당일 포함, 운영의 완결일 선택은 호출자 책임이다. 제공된 기간은 asOf/timezone과 동일한 경계인지 검증한다.

| 기간 | 최근 | 이전 |
|---|---|---|
| 30일 | 08-21~09-19 | 07-22~08-20 |
| 14일 | 09-06~09-19 | 08-23~09-05 |
| 7일 | 09-13~09-19 | 09-06~09-12 |

O는 서로 다른 주문번호 2개 이상, D는 서로 다른 유효 주문일 2일 이상, DN/DE는 각각 N/E가 양수인 날짜 2일 이상인 상품 수다. 같은 날 두 주문과 한 주문의 여러 옵션 행을 날짜 반복으로 세지 않는다.

주문번호 누락은 반복성을 null로 보류하고 수량은 유지한다. 동일 주문번호의 날짜 충돌은 날짜 반복을 null로 격리한다. 주문일 무효는 전체 수량을 유지하되 날짜 배분이 필요한 기간 수량을 null로 둔다. 수량 필드 무효도 그 합계를 null로 보존하며 0으로 대체하지 않는다. 이 경우 productStats의 확인 가능한 날짜/주문 개수와 issues로 범위를 확인할 수 있다.

상품주문 식별자가 같은 완전 동일 사실은 한 번만 합산한다. 충돌하는 두 버전은 하나를 선택하지 않고 해당 상품 수량을 unknown으로 격리한다. productOrder가 없는 행은 같은 주문번호라는 이유만으로 합치지 않는다(옵션 행일 수 있음).

## TOPk와 동률

각 기간 Q 기준 TOP1/2/3의 비중과 제거 후 Q/N/E/A/O/D/DN/DE/L을 반환한다. Q=0 또는 unknown이면 비중은 null이다.

동률 경계의 `productIds`와 `remaining`은 ID 순으로 정한 재현 가능한 표시용 대표값이다. `representativeOnly=true`이면 그 조합을 실제로 확정된 TOPk로 해석하지 않는다. `remainingRanges`는 가능한 제외 조합의 지표별 최소/최대, `tie`는 동률 ID와 선택 슬롯 수다.

판정은 대표 정렬을 사용하지 않는다. D/DE의 네 가지 반복 서명별 선택 개수를 탐색하여 모든 동률 구성에서 규칙이 성립하는지 정확히 평가한다. 큰 동률 집합에서 n-choose-k 상품 조합을 무작정 나열하지 않는다.

- 모든 구성 성립: candidate=certain.
- 일부만 성립: ambiguous. 다른 k가 확정 의존을 증명하지 못하면 insufficient_data + TOPK_TIE_CHANGES_STATE.
- 성립 없음: no.
- 핵심 지표 unknown: unknown.

현재 정책은 k=1,2, share>0.5, 핵심 집합 D>0, 제거 후 DE<2다. 정확히 50%는 초과가 아니며 concentration_boundary로 보존한다. 이 임계값은 임시 운영 정책이며 통계적 진리가 아니다.

## 진단 규칙

1. 연결 불가 또는 핵심 사실 불완전: insufficient_data, validationStatus=blocked.
2. 주문 관측 없음 또는 날짜 반복 없는 단일 반응 상품: insufficient_data.
3. 확정된 집중 의존 검사 성립: concentration_dependent.
4. 동률에 따라 상태가 달라짐: insufficient_data + 경계 사유.
5. 여러 상품 반응: exploration_signal.

현재 버전은 evidence_strong과 weak_observed_signal을 반환하지 않는다. strong의 참고 게이트와 미충족 항목, weak에 필요한 사전 노출 테스트 절차는 promotion에만 출력한다. 다른 데이터가 verified여도 자동 활성화하지 않는다.

확인된 외부 관측 조건을 모두 만족하면 validationStatus=validated가 될 수 있지만, 이것이 strong/weak 활성화를 뜻하지 않는다. 현재 자료 대부분은 observed_provisional이다.

최근성은 A/Q/N/E 방향 벡터로 처리한다. 30일·14일 감소 조건에 cooling_observed, 30일 전체 증가와 14일 비감소에 recent_up_observed, 지표 간 또는 기간 간 반대 방향에 mixed_recent를 붙인다. 7일 0은 no_recent7_observed이며 단독 부정 상태를 만들지 않는다. 이전값 0의 percent는 null이고 양수 관측 시작이면 '0에서 관측 시작'을 출력한다.

주문 반응은 있으나 E=0인 최근 기간은 reaction_without_retained_sales로 표시한다. N=0인지 N>0/E=0인지 원값으로 구분한다. 취소 사유나 상품 경쟁력은 추정하지 않는다.

## 회귀 자료 출처와 검증

- `sourcing-signals-input.json`: 기존 cross-ledger.json에서 필요한 상품/taxonomy/commerce 필드만 추출. 고객 정보·가격·수취정보는 없음. 주문번호와 상품주문번호는 관계를 보존한 가명 토큰이다.
- `sourcing-signals-expected.json`: 기존 cross-metrics.json의 수치를 독립 복사. 새 엔진 출력으로 기대값을 만들지 않았다. 기존 자료에 TOP2 비중 필드가 없어 **기존 TOP3 상품별 수량**에서 TOP2 비중만 계산했다.
- 수동 상태 25개는 5단계 표에서 독립 전사. hit_dependent→concentration_dependent 이름 대응 외에 수정하지 않았다.

142그룹 × 7기간 × 16개 지표 = **15,904개 비교, 차이 0**. 지표는 R/L/U/A/Q/C/N/E/O/D/DN/DE/발생률/TOP1/2/3이다. 25개 수동 주 상태도 차이 0이다. 수동 보고서의 자유 서술을 플래그의 완전한 정답 집합으로 간주하지 않으며 최근 혼재 등 주요 의미는 별도 회귀 테스트로 확인한다.

현재 142그룹의 상태: exploration_signal 12, concentration_dependent 51, insufficient_data 79. 그룹이 겹치므로 상품 수처럼 합산해 해석하지 않는다. validationStatus는 observed_provisional 140, blocked 2이며 blocked는 base/secondary 후드티(L=0)다. 기존 taxonomy의 27개 review issue는 보존한다.

검증 명령 및 결과:

| 명령 | 결과 |
|---|---|
| node --test tests/sourcing-signals.test.mjs | 신규 198/198 통과 |
| node --test tests/sourcing-taxonomy.test.mjs | 기존 309/309 통과 |
| npm test | 전체 595/595 통과, skip 0 |
| npm run build | production build 성공, 정적 페이지 18/18 |

기존 테스트는 397개이며 이번 작업에서 변경하지 않았다. 3단계 당시 396개와의 차이는 이번 시작 기준인 a2cf451에 기존 UI 회귀 1개가 추가돼 있었기 때문이다. app/, commerce, md, taxonomy 및 기존 테스트 파일은 이번 변경에 포함되지 않는다.

## 게시 상태

작업 시작 시 GitHub 조회 결과 PR #17은 2026-09-19 02:22:34 UTC에 이미 병합돼 있었다. head는 a2cf451, merge commit은 864086d였다. 병합된 PR에 새 커밋을 반영할 수 없으므로 해당 head를 기반으로 로컬 `feat/sourcing-signals-stage6` 브랜치에서 구현·검증한다. main 병합, 원격 push, 새 PR, UI 연결 및 배포는 이번 작업에서 하지 않는다. 게시 경로는 사용자 확인이 필요하다.

## PR #18 리뷰 보정: 검증 필드와 잔존 반복 게이트

- taxonomy 검증은 `definition`의 필드만 사용한다. `dataFitness.taxonomyFields`로 의존 필드를 확인할 수 있다. primary/base/secondary는 해당 필드, attribute는 해당 속성, combination은 AND 조건의 필드만 검증한다. total은 taxonomy 필드를 사용하지 않는다.
- 관계없는 conflict/option/unscoped와 review issue는 taxonomyPartial, optionUnallocated, validation/promotion에 전파하지 않는다. 원래 상품/필드 issue는 `issues`에 그대로 남긴다. 버전 불일치는 taxonomy를 사용하는 그룹에 적용한다.
- `promotion.evidence_strong.gates.residualReplication`은 concentration candidate와 독립적으로 TOP1/TOP2 제거 결과를 확인한다. Q 비중이 정책의 과반 경계(기본 50%)를 초과하면 `remainingRanges.DE.min >= 2`(정책 residualDE)가 필요하다. 핵심 상품의 D가 0이어도 생략하지 않는다. 모든 동률 경우에서 보장돼야 하며 unknown은 통과시키지 않는다. 과반 집합이 없는 경우에는 통과 가능하다.
- primaryState 로직 및 strong/weak 비활성화는 유지한다. 실제 142그룹의 모든 기간 출력과 primaryState는 수정 전과 동일하다. taxonomyPartial 25그룹은 불필요한 전파가 해소됐고, residualReplication 29그룹은 true에서 false로 보정됐다.
- 신규 회귀 12개 추가: 넥라인 conflict/option/unscoped, 품목 충돌의 필드 범위, 교집합 필드 범위, 옵션 기장과 secondary, 핵심 D 없는 과반, TOP1만 통과하는 경우, 대표값은 통과하지만 동률 최소값은 미달하는 경우, 동률 전체 통과, 정확히 50%, unknown 잔존 근거.
- 최신 검증: sourcing-signals **210/210**, taxonomy **309/309**, 전체 **607/607**, skip 0. Production build 성공(18/18). 기존 15,904개 수치 및 25개 수동 primaryState 차이 0.
- 이 보정은 PR #18에 추가하며 main merge, UI 연결, 추천 점수/행동은 포함하지 않는다.
