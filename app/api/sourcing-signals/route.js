import { secure } from "../../../lib/access.mjs";
import { loadDashboard } from "../../../lib/dashboard.mjs";
import { buildLiveSourcingDiagnostics } from "../../../lib/sourcing-live.mjs";
import { buildSourcingView } from "../../../lib/sourcing-view.mjs";
import { buildSourcingCandidates } from "../../../lib/sourcing-candidates.mjs";
import { buildSourcingCandidateView } from "../../../lib/sourcing-candidate-view.mjs";
import { buildSourcingCandidateEvidence } from "../../../lib/sourcing-evidence.mjs";
import { buildSourcingReviewBriefs } from "../../../lib/sourcing-briefs.mjs";
import { buildSourcingReviewBriefView } from "../../../lib/sourcing-brief-view.mjs";

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
    const briefReport = buildSourcingReviewBriefView(
      buildSourcingReviewBriefs({ candidates, evidence }),
    );
    return Response.json(
      {
        report,
        candidateReport,
        briefReport,
        source: "live-taxonomy-commerce-sourcing-signals-candidates-briefs",
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
