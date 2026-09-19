import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import * as XLSX from "xlsx";
import { buildCommerce } from "../lib/commerce.mjs";
import { analyze } from "../lib/md.mjs";
import { shippingSnapshot } from "../lib/shipping.mjs";
import { buildLiveSourcingDiagnostics } from "../lib/sourcing-live.mjs";
import { buildSourcingView } from "../lib/sourcing-view.mjs";
import { buildSourcingCandidates } from "../lib/sourcing-candidates.mjs";
import { buildSourcingCandidateView } from "../lib/sourcing-candidate-view.mjs";
import { buildSourcingCandidateEvidence } from "../lib/sourcing-evidence.mjs";
import { buildStoredZip, parseZipEntries } from "../lib/local-zip.mjs";
const port = 3123,
  base = `http://127.0.0.1:${port}`,
  user = "test",
  password = "test-password-long-enough";
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    env: {
      ...process.env,
      OARS_ADMIN_USER: user,
      OARS_ADMIN_PASSWORD: password,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
server.stdout.on("data", (b) => (logs += b));
server.stderr.on("data", (b) => (logs += b));
let browser;
const evidence = process.env.BROWSER_EVIDENCE_DIR || "/tmp/oars-browser-evidence";
await mkdir(evidence, { recursive: true });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base);
      if (r.status === 401) { ready = true; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, logs);
  const auth = "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
  assert.equal((await fetch(base + "/api/dashboard-data")).status, 401);
  assert.equal((await fetch(base + "/api/tracking", { method: "POST", headers: { authorization: auth, origin: "https://untrusted.test", "content-type": "application/json" }, body: "{}" })).status, 403);
  const h = ["결제일","상품주문번호","주문번호","상품번호","상품명","수량","판매가","주문상태"];
  const d = buildCommerce([
    h,
    ...["2026-09-17", "2026-09-15", "2026-09-13"].map((date, i) => [date, `po${i}`, "order1", "p1", "테스트 원피스", 1, 20000, "배송중"]),
  ], [h], [["상품번호", "상품명", "색상", "사이즈", "수량"], ["p1", "테스트 원피스", "블랙", "S", 1]], [], { salesMode: "unit" });
  d.coverageStart = "2026-01-01";
  d.mdProducts = [{ productNo: "p1", product: "테스트 원피스", registeredAt: "2026-08-01", leadDays: 7, incoming: 0, reserved: 0 }];
  const report = analyze(d, { today: "2026-09-17" });
  const sourcingDiagnostics = buildLiveSourcingDiagnostics(d, { today: "2026-09-17" });
  const sourcingReport = buildSourcingView(sourcingDiagnostics);
  const candidateResult = buildSourcingCandidates({ diagnostics: sourcingDiagnostics });
  const candidateEvidence = buildSourcingCandidateEvidence({ diagnostics: sourcingDiagnostics, candidates: candidateResult, products: d.mdProducts });
  const candidateReport = buildSourcingCandidateView(candidateResult, candidateEvidence);
  const briefReport = {
    count: 1,
    confidenceLabel: "현재 관측 기준",
    title: "이번 소싱 검토 브리프",
    description: "브라우저 회귀용 검토 브리프",
    notice: "추천 점수·추천 순위·사입 수량이 아니라 현재 관측 데이터의 검토 요약입니다.",
    briefs: [{
      id: "brief:test",
      label: "숏·하프팬츠",
      headline: "소싱 검토 브리프",
      confidenceLabel: "현재 관측 기준",
      facts: {
        linkedProducts: 27,
        reactingProducts: 8,
        repeatedDateProducts: 2,
        recent30ActiveProducts: 3,
        top2ShareLabel: "50.0%",
      },
      summary: "27개 연결 상품 중 8개에서 반응이 확인됐습니다.",
      combinationSummary: "반복 근거가 확인된 조합은 아직 없습니다.",
      concentrationNote: null,
      evidenceProducts: [{ productNo: "p1", productName: "테스트 원피스", Q: 3, recent30Q: 3 }],
      cautions: [],
      sharedEvidence: false,
      note: "자동 소싱 결정이 아닙니다.",
    }],
  };
  const researchPlan = {
    title: "다음 소싱 검색 키워드",
    description: "브라우저 회귀용 키워드 중심 조사 화면",
    notice: "키워드는 외부 인기 검색어가 아니라 우리 판매 데이터에서 나온 소싱 방향입니다.",
    count: 1,
    tasks: [{
      id: "research:test",
      label: "숏·하프팬츠",
      confidenceLabel: "우리 판매 데이터 기준",
      purpose: "신규 소싱 상품 조사",
      keywordTitle: "추천 검색 키워드",
      keywordGuide: "반복 근거는 아직 부족합니다. 초기 반응 조합부터 가볍게 탐색해보세요.",
      searchKeywords: [
        { keyword: "숏·하프팬츠 데님", evidence: "emerging", evidenceLabel: "초기 반응" },
        { keyword: "숏·하프팬츠", evidence: "item", evidenceLabel: "품목 기본" },
      ],
      cautionKeywords: [],
      copyKeywords: "숏·하프팬츠 데님\n숏·하프팬츠",
      facts: { reactingProducts: 8, repeatedDateProducts: 2, recent30ActiveProducts: 3 },
      combinationLines: [{ key: "supported", label: "반복 근거 확인", value: "현재 확인된 조합 없음" }],
      referenceProducts: [],
      captureFields: [
        { key: "sourceUrl", label: "공급처 링크", requirementLabel: "필수" },
        { key: "supplyPrice", label: "공급가", requirementLabel: "필수" },
      ],
      guardrails: ["초기 관측 조합을 반복 근거로 승격하지 않음"],
      copyTemplate: "[소싱 조사] 숏·하프팬츠\n추천 검색 키워드: 숏·하프팬츠 데님, 숏·하프팬츠\n공급처 링크: \n공급가: ",
    }],
  };
  if (process.env.AGENT_BROWSER_CLI) {
    const cli = (...args) => execFileSync(process.execPath, [process.env.AGENT_BROWSER_CLI, ...args], { env: { ...process.env, AGENT_BROWSER_EXECUTABLE_PATH: process.env.BROWSER_EXECUTABLE_PATH }, encoding: "utf8", timeout: 30000 });
    try {
      cli("set", "credentials", user, password);
      cli("set", "viewport", "375", "812");
      cli("network", "route", "**/api/oars-analysis", "--body", JSON.stringify({ report }));
      console.log(cli("open", base));
      console.log(cli("snapshot", "-i"));
      cli("screenshot", evidence + "/agent-mobile.png");
      assert.match(cli("eval", "document.querySelector('[data-nextjs-dialog]')?'ERROR':'OK'"), /OK/);
    } finally { cli("close"); }
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  const context = await browser.newContext({ httpCredentials: { username: user, password }, viewport: { width: 375, height: 812 }, acceptDownloads: true });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let fontCss = "";
  if (process.env.BROWSER_FONT_DIR) {
    const root = process.env.BROWSER_FONT_DIR;
    fontCss = (await readFile(root + "/400.css", "utf8")).replaceAll("./files/", "/__test_fonts/") + '\nbody,button,input,select,textarea{font-family:"Noto Sans KR",sans-serif!important}';
    await page.route("**/__test_fonts/*", async (r) => r.fulfill({ body: await readFile(root + "/files/" + new URL(r.request().url()).pathname.split("/").at(-1)), contentType: "font/woff2" }));
  }
  async function applyFont() { if (fontCss) { await page.addStyleTag({ content: fontCss }); await page.evaluate(() => document.fonts.ready); } }
  await page.route("**/api/oars-analysis", (r) => r.fulfill({ json: { report } }));
  await page.route("**/api/dashboard-data", (r) => r.fulfill({ json: d }));
  await page.route("**/api/sourcing-signals", (r) => r.fulfill({ json: { report: sourcingReport, candidateReport, briefReport, researchPlan } }));
  const ship = { productOrderNo: "po0", orderNo: "order1", name: "테스트고객", phone: "01000000000", zip: "01234", address: "서울시 테스트로 10", detail: ".", rowNumber: 2, shipping: "우체국 배송" };
  ship.snapshot = shippingSnapshot(ship);
  await page.route("**/api/google-orders", (r) => r.fulfill({ json: { rows: [ship] } }));
  await page.route("**/api/cafe24/orders", (r) => r.fulfill({ json: { rows: [
    { id: "item1", orderId: "order1", orderItemCode: "item1", status: "N10", canPrepare: true, name: "테스트고객", phone: "01000000000", product: "테스트 원피스", qty: "1" },
    { id: "item2", orderId: "order1", orderItemCode: "item2", status: "N10", canPrepare: true, name: "테스트고객", phone: "01000000000", product: "테스트 가디건", qty: "1" },
  ] } }));
  let prepareBody;
  await page.route("**/api/cafe24/prepare", async (r) => { prepareBody = r.request().postDataJSON(); await r.fulfill({ json: { ok: true } }); });
  for (const size of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(size);
    for (const path of ["/", "/dashboard", "/products", "/product-reaction", "/analysis", "/sourcing", "/today", "/reactions", "/product-match", "/product-registration"]) {
      await page.goto(base + path); await applyFont(); await page.waitForLoadState("networkidle");
      assert.ok((await page.locator("body").innerText()).length > 60, path);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${path} ${size.width}`);
      assert.equal(await page.locator("[data-nextjs-dialog]").count(), 0);
      if (path === "/product-registration") {
        await page.getByRole("heading", { name: "VVIC 상품 이미지 정리 도우미", exact: true }).waitFor();
        await page.getByText("추가 비용 0원 · 외부 업로드 없음", { exact: true }).waitFor();
      }
      if (path === "/sourcing") {
        await page.getByText("판정 준비 상태", { exact: true }).waitFor();
        await page.getByText("판정 준비 상태", { exact: true }).click();
        await page.getByText("상품 노출", { exact: true }).waitFor();
        await page.getByRole("heading", { name: "이번 소싱 검토 브리프", exact: true }).waitFor();
        await page.getByText("품목 수준 근거", { exact: true }).first().waitFor();
        await page.getByRole("heading", { name: "다음 소싱 검색 키워드", exact: true }).waitFor();
        await page.getByText("숏·하프팬츠 데님", { exact: true }).first().waitFor();
        await page.getByText("찾은 상품에서 확인할 것", { exact: true }).first().waitFor();
        await page.getByRole("heading", { name: "소싱 검토 분류", exact: true }).waitFor();
        await page.getByText("소싱 검토 후보", { exact: true }).first().waitFor();
        const allEvidence = page.locator(".candidate-evidence > summary");
        assert.ok((await allEvidence.count()) > 0);
        let evidenceToggle = page.locator(".candidate-evidence > summary:visible").first();
        if ((await evidenceToggle.count()) === 0) {
          const holdToggle = page.locator(".candidate-lane-collapsed > summary").first();
          if (await holdToggle.count()) await holdToggle.click();
          evidenceToggle = page.locator(".candidate-evidence > summary:visible").first();
        }
        await evidenceToggle.click();
        await page.getByText(/상품번호 p1/, { exact: false }).first().waitFor();
        assert.equal(await page.getByText("추천순", { exact: true }).count(), 0);
      }
    }
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(base + "/product-registration"); await applyFont();
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0iUAAAAASUVORK5CYII=", "base64");
  const registrationZip = buildStoredZip([
    { path: "商品主图/商品主图_1.png", data: tinyPng },
    { path: "商品详情图/商品详情图_1.png", data: tinyPng },
    { path: "颜色属性图/颜色属性图_1.png", data: tinyPng },
    { path: "尺码图/尺码图_1.png", data: tinyPng },
  ]);
  await page.locator("#vvic-zip").setInputFiles({
    name: "fixture-vvic.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(registrationZip),
  });
  await page.getByText("4장의 이미지를 찾았습니다.", { exact: false }).waitFor();
  assert.equal(await page.getByLabel("商品主图 분류").inputValue(), "main");
  assert.equal(await page.getByLabel("商品详情图 분류").inputValue(), "detail");
  assert.equal(await page.getByLabel("颜色属性图 분류").inputValue(), "ignore");
  assert.equal(await page.getByLabel("尺码图 분류").inputValue(), "size");
  await page.getByRole("button", { name: "이 분류로 이미지 정리 시작", exact: true }).click();
  await page.getByRole("heading", { name: "메인 썸네일 / GIF 이미지", exact: true }).waitFor();
  await page.getByRole("heading", { name: "상세페이지에 넣을 이미지", exact: true }).waitFor();
  const registrationDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "ZIP 저장", exact: true }).first().click();
  const registrationFile = await registrationDownload;
  const registrationEntries = parseZipEntries(new Uint8Array(await readFile(await registrationFile.path())));
  assert.equal(registrationEntries.length, 2);
  assert.ok(registrationEntries.some((entry) => entry.name.startsWith("01_메인_GIF용/")));
  assert.ok(registrationEntries.some((entry) => entry.name.startsWith("02_상세이미지/")));
  assert.equal(registrationEntries.some((entry) => entry.name.includes("颜色属性图")), false);
  assert.equal(registrationEntries.some((entry) => entry.name.includes("尺码图")), false);

  await page.getByRole("button", { name: "상품정보 생성 준비 →", exact: true }).first().click();
  await page.getByRole("heading", { name: "ChatGPT에서 상품정보 만들기", exact: true }).waitFor();
  await page.getByLabel("ChatGPT 상품정보 결과").fill(JSON.stringify({
    productNames: ["테스트 원피스 1", "테스트 원피스 2", "테스트 원피스 3"],
    detailText: "테스트 상세페이지 문구",
    hashtags: Array.from({ length: 30 }, (_, index) => `키워드${index + 1}`),
    colors: ["블랙"],
    sizeRows: [{ size: "FREE", values: { "총길이": "80" } }],
    notes: "실상품 확인",
  }));
  await page.getByRole("button", { name: "상품정보 불러오기", exact: true }).click();
  await page.getByRole("heading", { name: "카페24 등록용 상품정보", exact: true }).waitFor();
  await page.locator(".copy-row").filter({ hasText: "테스트 원피스 1" }).waitFor();
  assert.equal(await page.getByText("해시태그", { exact: false }).count() > 0, true);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(base); await applyFont();
  await page.getByRole("heading", { name: "오늘 할 일", exact: true }).waitFor();
  await page.getByRole("heading", { name: "오늘 확인할 상품", exact: true }).waitFor();
  await page.screenshot({ path: evidence + "/md-mobile.png", fullPage: true });
  await Promise.all([
    page.waitForURL(base + "/?tool=sms"),
    page.getByRole("button", { name: "주문·배송", exact: true }).click(),
  ]);
  await page.getByRole("button", { name: "카페24 주문 불러오기", exact: true }).click();
  await page.getByRole("button", { name: "배송준비", exact: true }).first().click();
  assert.deepEqual(prepareBody.orderItemCodes, ["item1"]);
  assert.equal(await page.getByRole("button", { name: "배송준비", exact: true }).count(), 1);
  await Promise.all([
    page.waitForURL(base + "/?tool=tracking"),
    page.getByRole("button", { name: "송장 매칭", exact: true }).click(),
  ]);
  await page.getByRole("button", { name: "우체국 배송 주문 불러오기", exact: true }).click();
  await page.locator("textarea").fill("1234567890123 테스트고객");
  await page.getByRole("button", { name: "등기번호 자동 매칭" }).click();
  assert.equal(await page.getByRole("button", { name: "주문시트 송장번호 자동 기입" }).count(), 0);
  await page.locator("textarea").fill("1234567890123 테스트고객 01000000000");
  await page.getByRole("button", { name: "등기번호 자동 매칭" }).click();
  await page.route("**/api/tracking", (r) => r.fulfill({ status: 409, json: { error: "주문 정보가 변경되었습니다." } }));
  await page.getByRole("button", { name: "주문시트 송장번호 자동 기입" }).click();
  await page.getByText("주문 정보가 변경되었습니다.", { exact: false }).waitFor();
  await page.unroute("**/api/tracking");
  let trackingBody;
  await page.route("**/api/tracking", (r) => { trackingBody = r.request().postDataJSON(); return r.fulfill({ json: { ok: true, count: 1, unchanged: 0 } }); });
  await page.getByRole("button", { name: "주문시트 송장번호 자동 기입" }).click();
  await page.getByText("송장 1건 저장·재확인 완료", { exact: false }).waitFor();
  assert.equal(trackingBody.updates[0].productOrderNo, "po0"); assert.ok(trackingBody.updates[0].snapshot);
  const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet([["상품주문번호", "택배사", "택배사 코드", "송장번호", "보존필드"], ["po0", "기존택배", 1, "", "원본"], ["other", "기존택배", 1, "9999999999999", "다른 주문"]]);
  ws.E2 = { t: "n", f: "1+1", v: 2 }; XLSX.utils.book_append_sheet(wb, ws, "배송 중 관리");
  await page.locator("input[type=file]").setInputFiles({ name: "fixture.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "에이블리 원본 엑셀 송장 변경 다운로드" }).click();
  const download = await downloadPromise;
  const exported = XLSX.read(await readFile(await download.path()), { type: "buffer" }).Sheets["배송 중 관리"];
  assert.equal(exported.D2.v, "1234567890123"); assert.equal(exported.E2.f, "1+1"); assert.equal(exported.D3.v, "9999999999999");
  await Promise.all([
    page.waitForURL(base + "/"),
    page.getByRole("button", { name: "홈으로 돌아가기", exact: true }).click(),
  ]);
  await page.unroute("**/api/oars-analysis");
  await page.route("**/api/oars-analysis", (r) => r.fulfill({ status: 502, json: { error: "모의 API 실패" } }));
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "모의 API 실패" }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: 9 routes × 2 viewports, operator-first home, auth/CSRF, query navigation, single-item prepare, ambiguous matching, failed/successful tracking, Excel preservation, API error UX; no page errors.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}