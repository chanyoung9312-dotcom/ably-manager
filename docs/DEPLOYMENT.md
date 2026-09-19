# 배포 및 운영 확인

## 설정

Node 22 이상. `npm ci`, `npm test`, `npm run build` 순서로 확인한다. 의존성은 lockfile 기준으로 설치한다.

`.env.example`의 다음 값을 Vercel Production/Preview에 각각 설정한다. 비밀값을 Git 또는 `NEXT_PUBLIC_` 변수에 넣지 않는다.

- `OARS_ADMIN_USER`, `OARS_ADMIN_PASSWORD`: 관리자 Basic 인증. 무작위 20자 이상 비밀번호. 인증 미설정/잘못된 설정은 503. HTTPS에서 사용한다. 인원별 권한이 필요한 경우 별도 계정 인증으로 확장한다.
- 기존 `GOOGLE_SERVICE_ACCOUNT_JSON`, `CAFE24_MALL_ID`, `CAFE24_CLIENT_ID`, `CAFE24_CLIENT_SECRET` 유지.
- `GOOGLE_SHEET_ID`: 실제 운영 시트 ID. 미설정은 기존 프로젝트의 시트 ID 사용.
- `CAFE24_REDIRECT_URI`: 배포 도메인의 `/api/cafe24/callback`. Cafe24 앱 등록값과 정확히 일치해야 한다.
- `OARS_SALES_PRICE_MODE`: 판매가의 정의를 검수한 후 `line` 또는 `unit`. 미설정은 기존 행 합계를 유지하고 경고.
- `OARS_ORDER_COVERAGE_START`: 해당 날짜부터 주문이 전부 수집되었다고 확인한 시작일. 단순 최소 결제일을 넣지 않는다.
- `OARS_ORDER_COVERAGE_THROUGH`: 주문 수집 완전성이 확인된 마지막 날짜. 당일 주문 수집이 아직 진행 중이면 오늘 날짜를 넣지 않는다. START와 THROUGH가 최근 비교 전체를 덮을 때만 수집 범위를 확인된 것으로 본다.

## 배포 전 읽기 검수

1. Preview를 배포하고 관리자 인증 확인. 비로그인 `/api/dashboard-data`는 401, 외부 출처 쓰기는 403.
2. 실제 시트 헤더 및 `데이터 점검` 메시지 확인. 주문 중복·옛 클레임 행·부분 취소 수량을 원본과 대조한다.
3. 수량 2개 이상 주문으로 판매가 모드 확인. 대시보드와 MD 동일 기간 금액이 일치하는지 확인한다.
4. Cafe24 OAuth 연결 후 조회만 먼저 검증. N02 결제여부, N10/N20, 옵션, 다중 배송지 표시 확인.
5. 송장/상품번호 미리보기를 확인한다. 실제 쓰기는 대상과 결과를 확인할 수 있을 때 한 건씩 검수한다. 시트 정렬과 동시 저장은 피한다.
6. 우체국 접수 파일과 에이블리 원본 템플릿을 실제 플랫폼 업로드 전 미리보기로 확인한다. 합배송은 자동 추정하지 않는다.

## 테스트

`npm test`는 운영 자격증명이 필요 없다. `npm run test:browser`는 빌드 완료 후 Chromium이 필요하다. `npx playwright-core install chromium` 또는 `BROWSER_EXECUTABLE_PATH`로 설치된 실행파일을 지정한다. 테스트 서버는 127.0.0.1:3123에 뜨고 종료된다. 테스트 자격증명은 로컬 모의 서버에만 사용한다. Google/Cafe24 쓰기 테스트는 모의 API이며 실제 주문을 변경하지 않는다.

## 롤백

코드 롤백은 이전 배포 선택으로 가능하지만 이전 버전에는 인증 보호가 없다. 보호된 배포를 유지하면서 문제 수정 브랜치를 반영하는 편이 안전하다. 이번 작업은 운영 시트나 주문을 변경하지 않았으므로 데이터 마이그레이션 롤백은 없다.
