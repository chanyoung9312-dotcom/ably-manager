import { secure } from "../../../lib/access.mjs";
import { loadDashboard } from "../../../lib/dashboard.mjs";
import { analyze } from "../../../lib/md.mjs";
export const dynamic = "force-dynamic";
async function handleGET() {
  try {
    const report = analyze(await loadDashboard());
    return Response.json(
      {
        report,
        source: "rule-based-shared-ledger",
        ai: false,
        observation: report.trends
          .map(
            (t) =>
              `${t.days}일 주문 ${t.current.qty}개 / 순판매 ${t.current.net}개`,
          )
          .join("\n"),
        direction:
          report.rows
            .filter((p) => p.decision === "사입 검토")
            .map((p) => `${p.name}: ${p.buy}`)
            .join("\n") || "사입 근거 확인 전 관찰",
        caution: report.warnings.join("\n"),
        weather: "날씨는 이 분석의 판단 근거에 사용하지 않습니다.",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e.message || "MD 분석 실패" },
      { status: 502 },
    );
  }
}
// Ignore client-supplied totals and dates: always compute from one authoritative snapshot.
async function handlePOST() {
  return handleGET();
}

export const GET = secure(handleGET);

export const POST = secure(handlePOST);
