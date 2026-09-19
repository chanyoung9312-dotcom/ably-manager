import { secure } from "../../../lib/access.mjs";
import { loadDashboard } from "../../../lib/dashboard.mjs";
import { buildLiveSourcingDiagnostics } from "../../../lib/sourcing-live.mjs";
import { buildSourcingView } from "../../../lib/sourcing-view.mjs";

export const dynamic = "force-dynamic";

async function handleGET() {
  try {
    const dashboard = await loadDashboard();
    const diagnostics = buildLiveSourcingDiagnostics(dashboard);
    const report = buildSourcingView(diagnostics);
    return Response.json(
      {
        report,
        source: "live-taxonomy-commerce-sourcing-signals",
        ai: false,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error.message || "소싱 진단 데이터를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}

export const GET = secure(handleGET);
