import { secure } from "../../../lib/access.mjs";
import { loadDashboard } from "../../../lib/dashboard.mjs";
import { buildLiveSourcingDiagnostics } from "../../../lib/sourcing-live.mjs";
import { buildSourcingView } from "../../../lib/sourcing-view.mjs";
import { buildSourcingCandidates } from "../../../lib/sourcing-candidates.mjs";
import { buildSourcingCandidateView } from "../../../lib/sourcing-candidate-view.mjs";
import { buildSourcingCandidateEvidence } from "../../../lib/sourcing-evidence.mjs";
import { buildSourcingReviewBriefs } from "../../../lib/sourcing-briefs.mjs";
import { buildSourcingReviewBriefView } from "../../../lib/sourcing-brief-view.mjs";
import { resolveSourcingValidation } from "../../../lib/sourcing-validation.mjs";
import { buildSourcingResearchPlan } from "../../../lib/sourcing-research-plan.mjs";
import { buildSourcingResearchPlanView } from "../../../lib/sourcing-research-view.mjs";

export const dynamic = "force-dynamic";

async function handleGET() {
  try {
    const dashboard = await loadDashboard();
    const diagnostics = buildLiveSourcingDiagnostics(dashboard);
    const validationReport = resolveSourcingValidation({ diagnostics });
    const report = buildSourcingView(diagnostics, validationReport);
    const candidates = buildSourcingCandidates({ diagnostics });
    const evidence = buildSourcingCandidateEvidence({
      diagnostics,
      candidates,
      products: dashboard.mdProducts || [],
    });
    const candidateReport = buildSourcingCandidateView(candidates, evidence);
    const briefResult = buildSourcingReviewBriefs({ candidates, evidence });
    const briefReport = buildSourcingReviewBriefView(briefResult);
    const researchPlan = buildSourcingResearchPlanView(
      buildSourcingResearchPlan({ briefResult }),
    );
    return Response.json(
      {
        report,
        validationReport,
        candidateReport,
        briefReport,
        researchPlan,
        source: "live-taxonomy-commerce-sourcing-signals-candidates-briefs-research",
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
