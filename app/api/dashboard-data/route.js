import { secure } from "../../../lib/access.mjs";
import { loadDashboard } from "../../../lib/dashboard.mjs";
export const dynamic = "force-dynamic";
async function handleGET() {
  try {
    return Response.json(await loadDashboard(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: e.message || "데이터 조회 실패" },
      { status: 502 },
    );
  }
}

export const GET = secure(handleGET);
