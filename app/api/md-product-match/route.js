import { secure } from "../../../lib/access.mjs";
import { createHash } from "node:crypto";
import { sheetHeaders, readSheet, writeCells } from "../../../lib/sheets.mjs";
import { matchProducts } from "../../../lib/product-match.mjs";
import { dateKey } from "../../../lib/dates.mjs";

const digest = (v) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");

async function handlePOST(req) {
  try {
    const {
      goods,
      mode = "preview",
      approved = [],
      approvedRegistration = [],
      snapshot,
    } = await req.json();
    if (
      !["preview", "write"].includes(mode) ||
      !Array.isArray(approved) ||
      !Array.isArray(approvedRegistration)
    )
      return Response.json({ error: "잘못된 요청" }, { status: 400 });

    const headers = await sheetHeaders(mode === "write"),
      values = await readSheet("MD", "A:Z", headers),
      results = matchProducts(values, goods);

    let written = 0,
      registrationWritten = 0;

    if (mode === "write") {
      if (!snapshot || snapshot !== digest(values))
        return Response.json(
          { error: "미리보기 후 MD 시트가 변경되었습니다. 다시 확인하세요." },
          { status: 409 },
        );

      const productUpdates = approved.map((a) => {
        const p = results.find(
          (r) =>
            r.cell === a.cell &&
            r.productNo === a.productNo &&
            r.product === a.product &&
            r.status === "확정",
        );
        if (!p) throw new Error("승인 상품과 최신 매칭 결과가 다릅니다.");
        return {
          kind: "productNo",
          range: `'MD'!${p.cell}`,
          values: [[p.productNo]],
          result: p,
        };
      });

      const registrationUpdates = approvedRegistration.map((a) => {
        const p = results.find(
          (r) =>
            r.product === a.product &&
            r.productNo === a.productNo &&
            r.registration?.cell === a.cell &&
            r.registration?.value === a.registeredAt &&
            r.registration?.status === "확정",
        );
        if (!p)
          throw new Error("승인 상품등록일과 최신 매칭 결과가 다릅니다.");
        return {
          kind: "registeredAt",
          range: `'MD'!${p.registration.cell}`,
          values: [[p.registration.value]],
          result: p,
        };
      });

      const updates = [...productUpdates, ...registrationUpdates];
      if (new Set(updates.map((u) => u.range)).size !== updates.length)
        throw new Error("중복 승인 셀");

      if (updates.length) {
        await writeCells(
          updates.map(({ range, values }) => ({ range, values })),
          headers,
        );
        written = productUpdates.length;
        registrationWritten = registrationUpdates.length;

        const fresh = await readSheet("MD", "A:Z", headers);
        for (const update of updates) {
          const p = update.result;
          if (update.kind === "productNo") {
            if (
              String(
                fresh[p.productNoRow - 1]?.[p.productNoCol] || "",
              ).trim() !== p.productNo
            )
              throw new Error("저장 후 상품번호 재확인 실패. 시트를 확인하세요.");
          } else if (
            dateKey(
              fresh[p.registeredAtRow - 1]?.[p.registeredAtCol],
            ) !== p.registration.value
          )
            throw new Error("저장 후 상품등록일 재확인 실패. 시트를 확인하세요.");
        }
      }
    }

    return Response.json({
      snapshot: digest(values),
      mode,
      total: results.length,
      matched: results.filter((x) => x.status === "확정").length,
      written,
      existing: results.filter((x) => x.status === "기존값 유지").length,
      needsReview: results.filter((x) => x.status === "확인 필요").length,
      registrationMatched: results.filter(
        (x) => x.registration?.status === "확정",
      ).length,
      registrationWritten,
      registrationExisting: results.filter(
        (x) => x.registration?.status === "기존값 유지",
      ).length,
      registrationNeedsReview: results.filter(
        (x) => x.registration?.status === "확인 필요",
      ).length,
      registrationMissingLabel: results.filter(
        (x) => x.registration?.status === "라벨 없음",
      ).length,
      results,
    });
  } catch (e) {
    return Response.json(
      { error: e.message || "상품번호·등록일 매칭 실패" },
      { status: 409 },
    );
  }
}

export const POST = secure(handlePOST);
