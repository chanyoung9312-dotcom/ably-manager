const text = (value) => String(value ?? "").trim();

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function catalogIndex(products = []) {
  const byId = new Map();
  for (const product of products) {
    const productNo = text(product?.productNo);
    if (!productNo) continue;
    const name = text(product?.product);
    if (!byId.has(productNo)) {
      byId.set(productNo, { names: new Set(), rows: [] });
    }
    if (name) byId.get(productNo).names.add(name);
    if (product?.row !== undefined && product?.row !== null) {
      byId.get(productNo).rows.push(product.row);
    }
  }
  return byId;
}

function catalogMeta(index, productNo) {
  const entry = index.get(productNo);
  if (!entry) {
    return {
      productName: null,
      catalogStatus: "missing",
      catalogRows: [],
    };
  }
  const names = [...entry.names];
  return {
    productName: names.length === 1 ? names[0] : null,
    catalogStatus: names.length === 0 ? "missing" : names.length === 1 ? "matched" : "conflict",
    catalogRows: [...entry.rows],
  };
}

function statsByProduct(group, periodKey) {
  const stats = group?.periods?.[periodKey]?.productStats || [];
  return new Map(stats.map((item) => [text(item.productNo), item]));
}

function idSet(values) {
  return new Set((values || []).map((value) => text(value)).filter(Boolean));
}

function rolesFor(productNo, group) {
  const roles = [];
  const top1 = idSet(group?.periods?.all?.top?.[1]?.productIds);
  const top2 = idSet(group?.periods?.all?.top?.[2]?.productIds);
  const repeated = idSet(group?.repeatedProductIds?.D);
  const retained = idSet(group?.repeatedProductIds?.DE);
  const recent30 = idSet(group?.recentActiveProductIds?.d30);
  const shared = idSet(group?.sharedEvidence);

  if (top1.has(productNo)) roles.push("top1_contributor");
  else if (top2.has(productNo)) roles.push("top2_contributor");
  if (repeated.has(productNo)) roles.push("date_repeat");
  if (retained.has(productNo)) roles.push("retained_repeat");
  if (recent30.has(productNo)) roles.push("recent30_active");
  if (shared.has(productNo)) roles.push("shared_evidence");
  return roles;
}

function evidenceForCandidate(candidate, group, catalog) {
  if (!group) {
    return {
      groupId: candidate.groupId,
      products: [],
      issue: "GROUP_NOT_FOUND",
    };
  }

  const allStats = statsByProduct(group, "all");
  const recent30Stats = statsByProduct(group, "d30");
  const contributorIds = idSet(candidate?.contributors?.reactingProductIds);

  const products = [...contributorIds].map((productNo) => {
    const all = allStats.get(productNo) || {};
    const recent30 = recent30Stats.get(productNo) || {};
    return {
      productNo,
      ...catalogMeta(catalog, productNo),
      roles: rolesFor(productNo, group),
      all: {
        Q: finite(all.Q),
        N: finite(all.N),
        E: finite(all.E),
        orderCount: finite(all.orderCount),
        dateCount: finite(all.dateCount),
        netDateCount: finite(all.netDateCount),
        eligibleDateCount: finite(all.eligibleDateCount),
      },
      recent30: {
        Q: finite(recent30.Q),
        N: finite(recent30.N),
        E: finite(recent30.E),
        orderCount: finite(recent30.orderCount),
        dateCount: finite(recent30.dateCount),
      },
    };
  });

  products.sort(
    (a, b) =>
      (b.all.Q ?? -1) - (a.all.Q ?? -1) ||
      (b.recent30.Q ?? -1) - (a.recent30.Q ?? -1) ||
      a.productNo.localeCompare(b.productNo),
  );

  return {
    groupId: candidate.groupId,
    products,
    issue: null,
  };
}

/**
 * Build product-level evidence for existing sourcing candidates.
 *
 * This module only projects existing sourcing-signal productStats and MD catalog
 * metadata. It does not recalculate Q/N/E, candidate lanes, or sourcing scores.
 */
export function buildSourcingCandidateEvidence({
  diagnostics,
  candidates,
  products = [],
} = {}) {
  if (!diagnostics || !Array.isArray(diagnostics.groups)) {
    throw new TypeError("INVALID_EVIDENCE_DIAGNOSTICS");
  }
  if (!candidates || !Array.isArray(candidates.items)) {
    throw new TypeError("INVALID_EVIDENCE_CANDIDATES");
  }

  const groups = new Map(diagnostics.groups.map((group) => [group.id, group]));
  const catalog = catalogIndex(products);
  const items = candidates.items.map((candidate) =>
    evidenceForCandidate(candidate, groups.get(candidate.groupId), catalog),
  );

  return {
    items,
    rules: {
      usesExistingProductStats: true,
      recalculatesQuantities: false,
      exposesCustomerData: false,
      changesCandidateLane: false,
    },
  };
}
