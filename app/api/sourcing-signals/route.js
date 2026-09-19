import { secure } from "../../../lib/access.mjs";
import { loadDashboard } from "../../../lib/dashboard.mjs";
import { buildLiveSourcingDiagnostics } from "../../../lib/sourcing-live.mjs";
import { buildSourcingView } from "../../../lib/sourcing-view.mjs";
import { buildSourcingCandidates } from "../../../lib/sourcing-candidates.mjs";
import { buildSourcingCandidateView } from "../../../lib/sourcing-candidate-view.mjs";
import { buildSourcingCandidateEvidence } from "../../../lib/sourcing-evidence.mjs";

export const dynamic = "force-dynamic";

async function handleGET() {
  try {
    const dashboard = await loadDashboard();
    const diagnostics = buildLiveSourcingDiagnostics(dashboard);
    const report = buildSourcingView(diagnostics);
    const candidates = buildSourcingCandidates({ diagnostics });
    const evidence = buildSourcingCandidateEvidence({
      diagnostics,
      candidates,
      products: dashboard.mdProducts || [],
    });
    const candidateReport = buildSourcingCandidateView(candidates, evidence);
    return Response.json(
      {
        report,
        candidateReport,
        source: "live-taxonomy-commerce-sourcing-signals-candidates",
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
