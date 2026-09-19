/** Pure observations over supplied taxonomy and commerce facts. No I/O or commerce formulas. */
export const SIGNAL_POLICY_VERSION = 'sourcing-signals-observed-v1';
const freeze = x => { Object.values(x).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(x); };
export const DEFAULT_SIGNAL_POLICY = freeze({
  version: SIGNAL_POLICY_VERSION,
  concentration: { ks: [1, 2], share: 0.5, residualDE: 2 },
  explorationMinProducts: 2,
  sample: { tinyMax: 3, smallMax: 9, mediumMax: 24, sparseMax: 2 },
  strong: { minL: 10, minA: 3, minRepeat: 2, minRecentA: 3, minRecentDE: 2, minRecent14EligibleProducts: 2 },
  // These states deliberately have no activation switch in this policy version.
  disabledStates: ['evidence_strong', 'weak_observed_signal'],
});
const attr = (field, value) => ({ field: `attributes.${field}`, value });
const combination = (base, ...attributes) => ({
  label: [base, ...attributes.map(a => a.value)].join(' ∩ '),
  all: [{ field: 'baseType', value: base }, ...attributes],
});
export const APPROVED_SIGNAL_COMBINATIONS = freeze([
  combination('원피스', attr('length', '롱')), combination('원피스', attr('length', '미니')),
  combination('원피스', attr('silhouette', 'A라인')), combination('원피스', attr('length', '롱'), attr('silhouette', 'A라인')),
  combination('원피스', attr('design', '셔링')), combination('원피스', attr('design', '퍼프')), combination('원피스', attr('pattern', '플라워')),
  combination('스커트', attr('length', '롱')), combination('스커트', attr('length', '미니')), combination('스커트', attr('silhouette', 'A라인')),
  combination('스커트', attr('design', '캉캉')), combination('팬츠', attr('widthShape', '와이드')), combination('팬츠', attr('materialExpression', '데님')),
  combination('팬츠', attr('widthShape', '와이드'), attr('materialExpression', '데님')), combination('숏·하프팬츠', attr('materialExpression', '데님')),
  combination('블라우스', attr('design', '셔링')), combination('티셔츠', attr('fitEase', '슬림')), combination('슬랙스', attr('widthShape', '와이드')),
  combination('원피스', attr('length', '롱'), attr('design', '셔링')), combination('스커트', attr('length', '미니'), attr('design', '캉캉')),
]);
const categoryFields = ['primaryCategory', 'baseType', 'secondaryCategory'];
const attributeFields = ['length', 'fitEase', 'silhouette', 'widthShape', 'design', 'neckline', 'pattern', 'materialExpression', 'garmentForm'];
const sums = ['Q', 'C', 'N', 'E'];
const repeats = ['O', 'D', 'DN', 'DE'];
const unique = xs => [...new Set(xs)].sort();
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const validNumber = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const id = x => typeof x === 'string' || typeof x === 'number' ? String(x).trim() : '';
const plainDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
};
function dateAt(value, timezone) {
  if (plainDate(value)) return value;
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)); }
  catch { return null; }
}
const shift = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** Inclusive calendar windows. Caller supplies the observation start; never inferred from first sale. */
export function createSignalPeriods({ asOf, timezone, start }) {
  const end = dateAt(asOf, timezone);
  if (!timezone || !end || !plainDate(start) || start > end) throw new TypeError('INVALID_PERIOD_INPUT');
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw new TypeError('INVALID_TIMEZONE'); }
  const periods = { all: { start, end } };
  for (const n of [30, 14, 7]) {
    periods[`d${n}`] = { start: shift(end, 1 - n), end };
    periods[`p${n}`] = { start: shift(end, 1 - 2 * n), end: shift(end, -n) };
  }
  return periods;
}
function configure(override, version) {
  const p = { ...DEFAULT_SIGNAL_POLICY, ...override,
    concentration: { ...DEFAULT_SIGNAL_POLICY.concentration, ...override?.concentration },
    sample: { ...DEFAULT_SIGNAL_POLICY.sample, ...override?.sample }, strong: { ...DEFAULT_SIGNAL_POLICY.strong, ...override?.strong },
    disabledStates: [...DEFAULT_SIGNAL_POLICY.disabledStates] };
  if (p.version !== version || (override && Object.keys(override).some(k => k !== 'version') && p.version === SIGNAL_POLICY_VERSION)) throw new TypeError('POLICY_VERSION_REQUIRED');
  if (!Array.isArray(p.concentration.ks) || !p.concentration.ks.length || p.concentration.ks.some(k => ![1, 2].includes(k)) ||
      !validNumber(p.concentration.share) || p.concentration.share >= 1 || !Number.isInteger(p.concentration.residualDE) || p.concentration.residualDE < 1 ||
      !Number.isInteger(p.explorationMinProducts) || p.explorationMinProducts < 2 ||
      Object.values(p.sample).some(v => !Number.isInteger(v) || v < 0) || !(p.sample.tinyMax < p.sample.smallMax && p.sample.smallMax < p.sample.mediumMax) ||
      Object.values(p.strong).some(v => !Number.isInteger(v) || v < 1)) throw new TypeError('INVALID_POLICY');
  return p;
}
function prepareProducts(inputs, issues, taxonomyVersion) {
  const map = new Map();
  for (const [index, input] of inputs.entries()) {
    if (!input || typeof input !== 'object') { issues.push({ code: 'INVALID_PRODUCT', index, scope: 'product' }); continue; }
    const tax = record(input.taxonomy) ? structuredClone(input.taxonomy) : {};
    const productNo = id(input.productNo);
    const sourceKey = id(input.sourceKey) || `input:${index}`;
    const key = productNo ? `id:${productNo}` : `source:${sourceKey}`;
    const linked = Boolean(productNo && input.orderLinkStatus === 'linked' && tax.orderLinkStatus === 'linked');
    const local = (code, field) => issues.push({ code, field, productKey: key, productNo, scope: 'field' });
    if (!input.sourceKey) local('SOURCE_KEY_MISSING', 'sourceKey');
    if ((id(tax.productNo) && id(tax.productNo) !== productNo) || (input.orderLinkStatus !== tax.orderLinkStatus)) local('LINK_CONFLICT', 'orderLinkStatus');
    const linkValid = linked && (!id(tax.productNo) || id(tax.productNo) === productNo);
    if (tax.taxonomyVersion !== taxonomyVersion) local('TAXONOMY_VERSION_MISMATCH', 'taxonomyVersion');
    for (const field of categoryFields) if (typeof tax[field] !== 'string' || !tax[field]) { tax[field] = '미확인'; local('CATEGORY_UNKNOWN', field); }
    if (!record(tax.attributes)) tax.attributes = {};
    for (const field of attributeFields) {
      const a = record(tax.attributes[field]) ? tax.attributes[field] : null;
      if (!a || a.status !== 'confirmed' || !Array.isArray(a.values) || a.values.some(v => typeof v !== 'string')) {
        tax.attributes[field] = { status: a?.status || 'unknown', values: [] };
      } else tax.attributes[field] = { ...a, values: unique(a.values) };
    }
    for (const review of Array.isArray(tax.review) ? tax.review.filter(record) : []) {
      local(review.code || 'TAXONOMY_REVIEW', review.field);
      if (review.code === 'CATEGORY_CONFLICT') { tax.baseType = '미확인'; tax.secondaryCategory = '미확인'; }
      if (typeof review.field === 'string' && attributeFields.some(f => review.field === `attributes.${f}`) && /CONFLICT|SCOPE/.test(review.code)) tax.attributes[review.field.slice(11)] = { status: 'conflict', values: [] };
    }
    const p = { key, sourceKey, productNo, productName: input.productName || '', taxonomy: tax, linked: linkValid,
      observation: structuredClone(input.observation || {}), registrationDate: input.registrationDate ?? null, availability: structuredClone(input.availability || null) };
    if (map.has(key)) {
      const old = map.get(key); local('DUPLICATE_PRODUCT', 'identity');
      if (old.linked !== p.linked) { old.linked = false; local('LINK_CONFLICT', 'orderLinkStatus'); }
      for (const field of categoryFields) if (old.taxonomy[field] !== tax[field]) { old.taxonomy[field] = '미확인'; local('DUPLICATE_TAXONOMY_CONFLICT', field); }
      for (const field of attributeFields) if (JSON.stringify(old.taxonomy.attributes[field]) !== JSON.stringify(tax.attributes[field])) {
        old.taxonomy.attributes[field] = { status: 'conflict', values: [] }; local('DUPLICATE_TAXONOMY_CONFLICT', `attributes.${field}`);
      }
    } else map.set(key, p);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}
function prepareFacts(inputs, products, snapshot, issues) {
  const linked = new Map(products.filter(p => p.linked).map(p => [p.productNo, p]));
  const facts = [];
  const productOrders = new Map();
  for (const [index, f] of inputs.entries()) {
    if (!f || typeof f !== 'object') { issues.push({ code: 'INVALID_ORDER_FACT', index, scope: 'order' }); continue; }
    const p = linked.get(id(f.productNo));
    if (!p) { issues.push({ code: 'ORDER_NOT_LINKED', productNo: id(f.productNo), index, scope: 'order' }); continue; }
    const fact = { productKey: p.key, productNo: p.productNo, productOrder: id(f.productOrder), orderNo: id(f.orderNo),
      date: dateAt(f.orderDate, snapshot.timezone), rawDate: f.orderDate, pendingClaim: f.pendingClaim,
      Q: f.qty, C: f.cancelQty, N: f.netQty, E: f.eligibleQty, ordinal: index };
    const issue = (code, field) => issues.push({ code, field, productKey: p.key, productNo: p.productNo, orderNo: fact.orderNo, index, scope: 'field' });
    for (const field of sums) if (!validNumber(fact[field])) { fact[field] = null; issue('INVALID_QUANTITY', field); }
    if (!fact.orderNo) issue('ORDER_NO_MISSING', 'O/D/DN/DE');
    if (!fact.date) issue('ORDER_DATE_INVALID', 'period/D/DN/DE');
    if (fact.date && fact.date > dateAt(snapshot.asOf, snapshot.timezone)) { fact.date = null; issue('ORDER_AFTER_SNAPSHOT', 'period/D/DN/DE'); }
    for (const existing of Array.isArray(f.issue) ? f.issue : f.issue ? [f.issue] : []) issue('UPSTREAM_ISSUE', typeof existing === 'string' ? existing : existing?.code || 'unknown');
    if (fact.productOrder) {
      const signature = JSON.stringify([fact.productNo, fact.orderNo, fact.rawDate, ...sums.map(k => fact[k]), fact.pendingClaim]);
      const prior = productOrders.get(fact.productOrder);
      if (prior) {
        issue(prior.signature === signature ? 'DUPLICATE_ORDER_FACT' : 'PRODUCT_ORDER_CONFLICT', 'identity');
        if (prior.signature !== signature) {
          // Neither conflicting version is an authoritative quantity. Preserve the issue locally.
          sums.forEach(k => { prior.fact[k] = null; fact[k] = null; });
          issues.push({ code: 'PRODUCT_ORDER_CONFLICT', productKey: prior.fact.productKey, scope: 'order' });
          if (prior.fact.productKey !== fact.productKey) facts.push(fact);
        }
        continue;
      }
      productOrders.set(fact.productOrder, { signature, fact });
    }
    facts.push(fact);
  }
  const dates = new Map();
  for (const f of facts) if (f.orderNo) { if (!dates.has(f.orderNo)) dates.set(f.orderNo, new Set()); dates.get(f.orderNo).add(f.date); }
  for (const f of facts) {
    f.dateReliable = Boolean(f.orderNo && f.date && dates.get(f.orderNo)?.size === 1 && !dates.get(f.orderNo)?.has(null));
    if (f.orderNo && dates.get(f.orderNo)?.size > 1) issues.push({ code: 'ORDER_DATE_CONFLICT', productKey: f.productKey, orderNo: f.orderNo, field: 'D/DN/DE', scope: 'field' });
  }
  return facts;
}
function membership(p, term) {
  if (categoryFields.includes(term.field)) return p.taxonomy[term.field] === term.value;
  if (term.field.startsWith('attributes.')) { const a = p.taxonomy.attributes[term.field.slice(11)]; return a?.status === 'confirmed' && a.values.includes(term.value); }
  return false;
}
function makeGroups(products, combinations) {
  const groups = new Map();
  const add = (level, label, p, definition) => {
    const key = `${level}:${label}`;
    if (!groups.has(key)) groups.set(key, { id: key, level, label, definition, members: [] });
    groups.get(key).members.push(p);
  };
  for (const p of products) {
    add('total', '전체', p, []);
    for (const field of categoryFields) add(field, p.taxonomy[field], p, [{ field, value: p.taxonomy[field] }]);
    for (const field of attributeFields) for (const value of p.taxonomy.attributes[field].values) add(`attribute:${field}`, value, p, [attr(field, value)]);
    for (const c of combinations) if (c.all.every(term => membership(p, term))) add('combination', c.label, p, c.all);
  }
  return [...groups.values()];
}
const nullableSum = (xs, field) => xs.some(x => x[field] === null) ? null : xs.reduce((n, x) => n + x[field], 0);
function productMetrics(p, facts, period, isAll) {
  const included = facts.filter(f => f.productKey === p.key && (f.date ? f.date >= period.start && f.date <= period.end : isAll));
  const undated = !isAll && facts.some(f => f.productKey === p.key && !f.date);
  const m = { productNo: p.productNo, productKey: p.key };
  for (const k of sums) m[k] = undated ? null : nullableSum(included, k);
  m.A = included.some(f => f.Q > 0) ? 1 : m.Q === null ? null : 0;
  const positive = included.filter(f => f.Q > 0);
  const missingOrder = positive.some(f => !f.orderNo);
  const unreliable = positive.some(f => !f.dateReliable);
  const count = (field, filter) => new Set(positive.filter(filter).map(f => f[field])).size;
  m.orderCount = count('orderNo', f => Boolean(f.orderNo));
  m.dateCount = count('date', f => f.dateReliable);
  m.netDateCount = count('date', f => f.dateReliable && f.N > 0);
  m.eligibleDateCount = count('date', f => f.dateReliable && f.E > 0);
  m.O = m.Q === null || missingOrder ? null : Number(m.orderCount >= 2);
  m.D = m.Q === null || unreliable ? null : Number(m.dateCount >= 2);
  m.DN = m.D === null || m.N === null ? null : Number(m.netDateCount >= 2);
  m.DE = m.D === null || m.E === null ? null : Number(m.eligibleDateCount >= 2);
  return m;
}
function aggregate(stats) {
  const m = {};
  for (const k of [...sums, 'A', ...repeats]) m[k] = nullableSum(stats, k);
  m.eligibleActive = stats.some(p => p.E === null) ? null : stats.filter(p => p.E > 0).length;
  return m;
}
function topAnalysis(stats, totals, k, policy) {
  const ranked = stats.filter(p => p.Q > 0).sort((a, b) => b.Q - a.Q || a.productNo.localeCompare(b.productNo));
  const selected = ranked.slice(0, k);
  const q = selected.reduce((n, p) => n + p.Q, 0);
  const share = totals.Q ? q / totals.Q : null;
  const selectedIds = new Set(selected.map(p => p.productNo));
  const remaining = stats.filter(p => !selectedIds.has(p.productNo));
  const remainingMetrics = aggregate(remaining);
  const threshold = selected.at(-1)?.Q;
  const fixed = ranked.filter(p => p.Q > threshold);
  const tied = ranked.filter(p => p.Q === threshold);
  const slots = selected.length - fixed.length;
  const boundaryTie = slots > 0 && slots < tied.length;
  const remainingRanges = {};
  for (const key of ['Q', 'N', 'E', 'A', ...repeats]) {
    if (totals[key] === null) { remainingRanges[key] = { min: null, max: null }; continue; }
    const fixedSum = fixed.reduce((n, p) => n + p[key], 0);
    const values = tied.map(p => p[key]).sort((a, b) => a - b);
    remainingRanges[key] = { min: totals[key] - fixedSum - (slots ? values.slice(-slots) : []).reduce((n, v) => n + v, 0),
      max: totals[key] - fixedSum - values.slice(0, slots).reduce((n, v) => n + v, 0) };
  }
  // At most four repetition signatures; enumerate counts, never n-choose-k product subsets.
  const types = new Map();
  for (const p of tied) { const key = `${p.D}:${p.DE}`; if (!types.has(key)) types.set(key, { D: p.D, DE: p.DE, n: 0 }); types.get(key).n++; }
  const outcomes = [];
  const signatures = [...types.values()];
  function visit(i, left, d, de) {
    if (i === signatures.length) {
      if (!left) outcomes.push(d > 0 && totals.DE - de < policy.concentration.residualDE);
      return;
    }
    const t = signatures[i];
    for (let n = 0; n <= Math.min(left, t.n); n++) visit(i + 1, left - n, d + n * t.D, de + n * t.DE);
  }
  const unknown = totals.Q === null || totals.D === null || totals.DE === null;
  if (!unknown) visit(0, slots, fixed.reduce((n, p) => n + p.D, 0), fixed.reduce((n, p) => n + p.DE, 0));
  const majority = share !== null && share > policy.concentration.share && ranked.length >= k;
  const possible = majority && outcomes.some(Boolean);
  const certain = majority && outcomes.length > 0 && outcomes.every(Boolean);
  return { k, productIds: selected.map(p => p.productNo), Q: totals.Q === null ? null : q, share, representativeOnly: boundaryTie || totals.Q === null,
    remaining: { ...remainingMetrics, L: remaining.length }, remainingRanges,
    tie: { boundary: boundaryTie, tiedProductIds: boundaryTie ? tied.map(p => p.productNo) : [], slots: boundaryTie ? slots : 0 },
    candidate: unknown ? 'unknown' : certain ? 'certain' : possible ? 'ambiguous' : 'no',
    reasonCodes: [...(boundaryTie ? ['TOPK_BOUNDARY_TIE'] : []), ...(share === policy.concentration.share ? ['CONCENTRATION_EXACT_BOUNDARY'] : [])] };
}
function metrics(members, facts, period, isAll, policy) {
  const linked = members.filter(p => p.linked);
  const stats = linked.map(p => productMetrics(p, facts, period, isAll));
  const m = { R: members.length, L: linked.length, U: members.length - linked.length, ...aggregate(stats) };
  if (m.R !== m.L + m.U) throw new Error('POPULATION_INVARIANT');
  m.rate = m.L && m.A !== null ? m.A / m.L : null;
  m.productStats = stats;
  m.top = Object.fromEntries([1, 2, 3].map(k => [k, topAnalysis(stats, m, k, policy)]));
  return m;
}
function comparison(previous, current) {
  return Object.fromEntries(['A', ...sums].map(k => {
    const before = previous[k], after = current[k];
    return [k, { previous: before, current: after, delta: before === null || after === null ? null : after - before,
      percent: before > 0 && after !== null ? (after - before) / before : null,
      direction: before === null || after === null ? 'unknown' : after > before ? 'up' : after < before ? 'down' : 'flat',
      observation: before === 0 && after > 0 ? '0에서 관측 시작' : null }];
  }));
}
function assess(g, snapshot, policy) {
  const a = g.periods.all, recent = g.periods.d30, mid = g.periods.d14;
  const flags = [], reasonCodes = [];
  const fit = g.dataFitness;
  if (a.U) flags.push('unlinked_present');
  if (!fit.coverageVerified) flags.push('coverage_unverified');
  if (!fit.exposureKnown) flags.push('exposure_unknown');
  if (!fit.testDurationKnown) flags.push('test_duration_unknown');
  if (!fit.availabilityKnown) flags.push('availability_unknown');
  if (fit.taxonomyPartial) flags.push('taxonomy_partial');
  if (fit.optionUnallocated) flags.push('option_unallocated');
  if (a.L <= policy.sample.smallMax) flags.push('sample_small');
  if (a.A !== null && a.A <= policy.sample.sparseMax) flags.push('outcome_sparse');
  if (a.A === 0 && a.L) flags.push('no_order_observed');
  if (a.A > 0 && recent.A === 0) flags.push('historical_only');
  if (a.A > 0 && g.periods.d7.A === 0) flags.push('no_recent7_observed');
  if (a.A > 0 && a.D === 0) flags.push('single_day_only');
  if (['d7', 'd14', 'd30'].some(w => g.periods[w].Q > 0 && g.periods[w].E === 0)) flags.push('reaction_without_retained_sales');
  const d30 = g.comparisons.d30, d14 = g.comparisons.d14;
  const keys = ['A', 'Q', 'N', 'E'];
  const down = c => c.Q.direction === 'down' && ['A', 'N', 'E'].every(k => ['down', 'flat'].includes(c[k].direction));
  if (down(d30) && (down(d14) || recent.A === 0)) flags.push('cooling_observed');
  if (keys.every(k => d30[k].direction === 'up') && keys.every(k => ['up', 'flat'].includes(d14[k].direction))) flags.push('recent_up_observed');
  const mixed = c => keys.some(k => c[k].direction === 'up') && keys.some(k => c[k].direction === 'down');
  if (mixed(d30) || mixed(d14) || keys.some(k => ['up', 'down'].includes(d30[k].direction) && ['up', 'down'].includes(d14[k].direction) && d30[k].direction !== d14[k].direction)) flags.push('mixed_recent');
  const concentration = policy.concentration.ks.map(k => a.top[k]);
  if (concentration.some(t => t.reasonCodes.includes('CONCENTRATION_EXACT_BOUNDARY'))) flags.push('concentration_boundary');
  if (concentration.some(t => t.tie.boundary)) reasonCodes.push('TOPK_BOUNDARY_TIE');
  const dependent = concentration.some(t => t.candidate === 'certain');
  const ambiguous = !dependent && concentration.some(t => t.candidate === 'ambiguous');
  const usable = a.L > 0 && [...sums, 'A', ...repeats].every(k => a[k] !== null) && !fit.blockingIssues;
  let primaryState = 'insufficient_data';
  if (!usable) reasonCodes.push(a.L ? 'GROUP_FACTS_INCOMPLETE' : 'NO_LINKABLE_PRODUCTS');
  else if (a.A === 0 || (a.A === 1 && a.D === 0)) reasonCodes.push(a.A === 0 ? 'NO_ORDER_OBSERVED' : 'SINGLE_UNREPEATED_PRODUCT');
  else if (dependent) { primaryState = 'concentration_dependent'; reasonCodes.push('CONCENTRATED_CORE_WITHOUT_RESIDUAL_REPLICATION'); }
  else if (ambiguous) { flags.push('concentration_boundary'); reasonCodes.push('TOPK_TIE_CHANGES_STATE'); }
  else if (a.A >= policy.explorationMinProducts) { primaryState = 'exploration_signal'; reasonCodes.push('MULTIPLE_PRODUCTS_OBSERVED'); }
  const s = policy.strong;
  const gates = {
    linkedSample: a.L >= s.minL, reactingProducts: a.A !== null && a.A >= s.minA,
    retainedRepetition: ['D', 'DN', 'DE'].every(k => a[k] !== null && a[k] >= s.minRepeat),
    recent30Replication: recent.A !== null && recent.DE !== null && recent.A >= s.minRecentA && recent.DE >= s.minRecentDE,
    recent14Retention: mid.eligibleActive !== null && mid.eligibleActive >= s.minRecent14EligibleProducts,
    // Independent of the concentration candidate's core-D prerequisite. Every
    // possible majority removal must leave retained repetition, including ties.
    residualReplication: usable && [1, 2].every(k => {
      const top = a.top[k];
      return top.share === null ? a.Q === 0
        : top.share <= policy.concentration.share
          || (top.remainingRanges.DE.min !== null && top.remainingRanges.DE.min >= policy.concentration.residualDE);
    }),
    recentConsistent: !flags.some(f => ['cooling_observed', 'mixed_recent'].includes(f)),
    coverage: fit.coverageVerified, availability: fit.availabilityKnown, taxonomy: !fit.taxonomyPartial, facts: usable,
  };
  const validationStatus = !usable ? 'blocked' : fit.coverageVerified && fit.exposureKnown && fit.testDurationKnown && fit.availabilityKnown && !fit.taxonomyPartial && !ambiguous ? 'validated' : 'observed_provisional';
  return { primaryState, flags: unique(flags), validationStatus, reasonCodes: unique(reasonCodes),
    promotion: { evidence_strong: { enabled: false, gates, unmet: Object.keys(gates).filter(k => !gates[k]), reason: 'STATE_DISABLED_BY_CURRENT_POLICY' },
      weak_observed_signal: { enabled: false, reason: 'STATE_DISABLED_BY_CURRENT_POLICY', unmet: ['predefinedExposureTestProtocol', ...(!fit.exposureKnown ? ['exposure'] : []), ...(!fit.testDurationKnown ? ['testDuration'] : []), ...(!fit.coverageVerified ? ['coverage'] : [])] } } };
}
/**
 * Input: {snapshot, products, orderFacts, policy?, combinations?}.
 * products have taxonomy + explicit orderLinkStatus. Facts carry already computed quantities.
 * Output contains diagnostics only; unknown sums are null, never silently zero-filled.
 */
export function diagnoseSourcingSignals({ snapshot, products, orderFacts, policy: override, combinations = APPROVED_SIGNAL_COMBINATIONS } = {}) {
  const issues = [];
  const blocked = code => ({ snapshot: structuredClone(snapshot || {}), policyVersion: snapshot?.policyVersion ?? null, groups: [], sharedEvidence: [], issues: [{ code, scope: 'snapshot' }], validationStatus: 'blocked' });
  if (!snapshot || !Array.isArray(products) || !Array.isArray(orderFacts) || !snapshot.timezone || typeof snapshot.taxonomyVersion !== 'string' || !snapshot.taxonomyVersion || !dateAt(snapshot.asOf, snapshot.timezone)) return blocked('INVALID_INPUT');
  try { new Intl.DateTimeFormat('en', { timeZone: snapshot.timezone }); } catch { return blocked('INVALID_TIMEZONE'); }
  let policy;
  try { policy = configure(override, snapshot.policyVersion); } catch (e) { return blocked(e.message); }
  const periods = snapshot.periods;
  if (!periods || ['all', 'd30', 'p30', 'd14', 'p14', 'd7', 'p7'].some(w => !plainDate(periods[w]?.start) || !plainDate(periods[w]?.end) || periods[w].start > periods[w].end)) return blocked('INVALID_PERIODS');
  let expected;
  try { expected = createSignalPeriods({ asOf: snapshot.asOf, timezone: snapshot.timezone, start: periods.all.start }); }
  catch { return blocked('INVALID_PERIODS'); }
  if (Object.keys(expected).some(w => expected[w].start !== periods[w].start || expected[w].end !== periods[w].end)) return blocked('PERIOD_BOUNDARY_MISMATCH');
  if (!Array.isArray(combinations) || combinations.some(c => !c || !c.label || !Array.isArray(c.all) || c.all.length < 2 || c.all.some(t => !t || typeof t.value !== 'string' || !(categoryFields.includes(t.field) || attributeFields.some(f => t.field === `attributes.${f}`)))) || new Set(combinations.map(c => c.label)).size !== combinations.length) return blocked('INVALID_COMBINATIONS');
  const ps = prepareProducts(products, issues, snapshot.taxonomyVersion);
  const facts = prepareFacts(orderFacts, ps, snapshot, issues);
  const groups = makeGroups(ps, combinations).map(g => {
    const memberSet = new Set(g.members.map(p => p.key));
    const scopedIssues = issues.filter(i => memberSet.has(i.productKey));
    // Issues remain attached to their original product/field. Only dependencies
    // of this group's definition participate in taxonomy validation.
    const taxonomyFields = unique(g.definition.map(term => term.field));
    const fieldPartial = (p, field) => field.startsWith('attributes.')
      ? p.taxonomy.attributes[field.slice(11)]?.status !== 'confirmed'
      : p.taxonomy[field] === '미확인';
    const taxonomyIssueApplies = issue => taxonomyFields.includes(issue.field)
      && /TAXONOMY|CATEGORY|ATTRIBUTE|MIXED_SALE/.test(issue.code);
    const known = field => g.members.filter(p => p.linked).length > 0 && g.members.filter(p => p.linked).every(p => p.observation[field] === 'verified');
    const out = { id: g.id, level: g.level, label: g.label, definition: structuredClone(g.definition), memberKeys: [...memberSet].sort(),
      periods: Object.fromEntries(Object.entries(periods).map(([w, period]) => [w, metrics(g.members, facts, period, w === 'all', policy)])), issues: scopedIssues,
      dataFitness: { coverageVerified: snapshot.collectionCompleteness === 'verified', exposureKnown: known('exposure'), testDurationKnown: known('testDuration'), availabilityKnown: known('availability'),
        taxonomyFields,
        taxonomyPartial: g.members.some(p => taxonomyFields.some(field => fieldPartial(p, field))) || scopedIssues.some(taxonomyIssueApplies),
        optionUnallocated: g.members.some(p => taxonomyFields.some(field => field.startsWith('attributes.') && p.taxonomy.attributes[field.slice(11)]?.status === 'option')),
        blockingIssues: scopedIssues.some(i => ['LINK_CONFLICT', 'PRODUCT_ORDER_CONFLICT', 'UPSTREAM_ISSUE'].includes(i.code)
          || (i.code === 'TAXONOMY_VERSION_MISMATCH' && taxonomyFields.length > 0)) } };
    out.comparisons = Object.fromEntries([30, 14, 7].map(n => [`d${n}`, comparison(out.periods[`p${n}`], out.periods[`d${n}`])]));
    const a = out.periods.all;
    out.contributingProductIds = a.productStats.filter(p => p.Q > 0).map(p => p.productNo).sort();
    out.repeatedProductIds = Object.fromEntries(repeats.map(k => [k, a.productStats.filter(p => p[k] === 1).map(p => p.productNo).sort()]));
    out.recentActiveProductIds = Object.fromEntries([7, 14, 30].map(n => [`d${n}`, out.periods[`d${n}`].productStats.filter(p => p.Q > 0).map(p => p.productNo).sort()]));
    out.sample = a.L === 0 ? 'unlinked' : a.L <= policy.sample.tinyMax ? 'very_small' : a.L <= policy.sample.smallMax ? 'small' : a.L <= policy.sample.mediumMax ? 'medium' : 'relatively_broad';
    return { ...out, ...assess(out, snapshot, policy) };
  });
  const sharedEvidence = [];
  for (const p of ps.filter(p => p.linked)) {
    const contributors = groups.filter(g => g.contributingProductIds.includes(p.productNo));
    if (contributors.length > 1) sharedEvidence.push({ productNo: p.productNo, groupIds: contributors.map(g => g.id).sort(), repeatedGroupIds: contributors.filter(g => g.repeatedProductIds.D.includes(p.productNo)).map(g => g.id).sort() });
  }
  for (const g of groups) {
    g.equivalentGroups = groups.filter(h => h.id !== g.id && JSON.stringify(h.memberKeys) === JSON.stringify(g.memberKeys)).map(h => h.id).sort();
    g.sameResponseGroups = g.contributingProductIds.length ? groups.filter(h => h.id !== g.id && JSON.stringify(h.contributingProductIds) === JSON.stringify(g.contributingProductIds)).map(h => h.id).sort() : [];
    g.sharedEvidence = sharedEvidence.filter(e => e.groupIds.includes(g.id)).map(e => e.productNo);
    if (g.sharedEvidence.length) g.flags = unique([...g.flags, 'shared_evidence']);
  }
  return { snapshot: structuredClone(snapshot), policyVersion: policy.version, policy: structuredClone(policy), groups, sharedEvidence, issues,
    validationStatus: groups.length && groups.every(g => g.validationStatus === 'validated') ? 'validated' : groups.length ? 'observed_provisional' : 'blocked' };
}
