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
  await page.route("**/api/sourcing-signals", (r) => r.fulfill({ json: { report: sourcingReport, candidateReport } }));
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
    for (const path of ["/", "/dashboard", "/products", "/product-reaction", "/analysis", "/sourcing", "/today", "/reactions", "/product-match"]) {
      await page.goto(base + path); await applyFont(); await page.waitForLoadState("networkidle");
      assert.ok((await page.locator("body").innerText()).length > 60, path);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${path} ${size.width}`);
      assert.equal(await page.locator("[data-nextjs-dialog]").count(), 0);
      if (path === "/sourcing") {
        await page.getByText("판정 준비 상태", { exact: true }).waitFor();
        await page.getByText("판정 준비 상태", { exact: true }).click();
        await page.getByText("상품 노출", { exact: true }).waitFor();
        await page.getByRole("heading", { name: "소싱 검토 분류", exact: true }).waitFor();
        await page.getByText("소싱 검토 후보", { exact: true }).first().waitFor();
        const evidenceToggle = page.getByText(/근거 상품 보기 · \d+개/, { exact: false }).first();
        if (await evidenceToggle.count()) {
          await evidenceToggle.click();
          await page.getByText(/상품번호 p1/, { exact: false }).first().waitFor();
        }
        assert.equal(await page.getByText("추천순", { exact: true }).count(), 0);
      }
    }
  }
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