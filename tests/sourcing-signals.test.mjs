import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagnoseSourcingSignals, createSignalPeriods, DEFAULT_SIGNAL_POLICY } from '../lib/sourcing-signals.mjs';
import { classifyProductName } from '../lib/sourcing-taxonomy.mjs';
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const input = fixture('sourcing-signals-input');
const expected = fixture('sourcing-signals-expected');
const result = diagnoseSourcingSignals(input);
const group = (id, data = result) => { const g = data.groups.find(g => g.id === id); assert.ok(g, id); return g; };
const p = (productNo, name = '와이드 팬츠') => ({ sourceKey: `test:${productNo}`, productNo, productName: name,
  taxonomy: classifyProductName(name, { productNo, sourceKey: `test:${productNo}` }), orderLinkStatus: productNo ? 'linked' : 'unlinked' });
let serial = 0;
const f = (productNo, date, qty = 1, extra = {}) => ({ productNo, productOrder: `line${++serial}`, orderNo: `order${serial}`,
  orderDate: date, qty, cancelQty: 0, netQty: qty, eligibleQty: qty, pendingClaim: false, ...extra });
const run = (products, orderFacts = [], more = {}) => diagnoseSourcingSignals({ snapshot: structuredClone(input.snapshot), products, orderFacts, ...more });
const all = data => group('total:전체', data);

test('snapshot has exactly 271 products, 10 unlinked and all 142 archived groups', () => {
  assert.equal(input.products.length, 271); assert.equal(result.groups.length, 142);
  assert.deepEqual(result.groups.map(g => g.id).sort(), expected.groups.map(g => g.id).sort());
  const m = all(result).periods.all;
  assert.deepEqual([m.R, m.L, m.U, m.A, m.Q, m.C, m.N, m.E], [271,261,10,37,286,63,223,184]);
  assert.equal(m.productStats.length, 261);
  for (const g of result.groups) for (const m of Object.values(g.periods)) assert.equal(m.R, m.L + m.U);
});
for (const g of expected.groups) test(`stage4 7-window numeric regression: ${g.id}`, () => {
  const actual = group(g.id);
  for (const [w, metrics] of Object.entries(g.periods)) for (const [key, value] of Object.entries(metrics)) {
    assert.equal(key.startsWith('top') ? actual.periods[w].top[key.slice(3)].share : actual.periods[w][key], value, `${g.id}/${w}/${key}`);
  }
});
// Manually transcribed Stage 5 states; not produced by the implementation.
const manual = [
 ['baseType:원피스','concentration_dependent'], ['secondaryCategory:롱원피스','concentration_dependent'],
 ['secondaryCategory:미니원피스','concentration_dependent'], ['baseType:스커트','concentration_dependent'],
 ['baseType:숏·하프팬츠','exploration_signal'], ['baseType:팬츠','concentration_dependent'],
 ['baseType:슬랙스','concentration_dependent'], ['baseType:나시·슬리브리스','concentration_dependent'],
 ['baseType:티셔츠','insufficient_data'], ['baseType:블라우스','insufficient_data'],
 ['attribute:widthShape:와이드','concentration_dependent'], ['attribute:silhouette:A라인','exploration_signal'],
 ['attribute:fitEase:오버핏','concentration_dependent'], ['attribute:design:셔링','concentration_dependent'],
 ['attribute:design:핀턱','concentration_dependent'], ['attribute:design:리본','concentration_dependent'],
 ['attribute:pattern:스트라이프','concentration_dependent'], ['attribute:materialExpression:데님','exploration_signal'],
 ['attribute:materialExpression:니트','insufficient_data'], ['combination:원피스 ∩ 롱','concentration_dependent'],
 ['combination:원피스 ∩ 롱 ∩ 셔링','concentration_dependent'], ['combination:팬츠 ∩ 와이드','concentration_dependent'],
 ['combination:팬츠 ∩ 와이드 ∩ 데님','insufficient_data'], ['combination:숏·하프팬츠 ∩ 데님','exploration_signal'],
 ['combination:스커트 ∩ A라인','exploration_signal'],
];
for (const [id, state] of manual) test(`stage5 manual-state comparison: ${id}`, () => assert.equal(group(id).primaryState, state));

test('dress TOP2 176/200 and long dress 176/178; residual replication is visible', () => {
  const d = group('baseType:원피스').periods.all, l = group('secondaryCategory:롱원피스').periods.all;
  assert.equal(d.top[2].share, 176/200); assert.equal(l.top[2].share,176/178);
  assert.deepEqual([d.top[2].remaining.Q,d.top[2].remaining.DE,l.top[2].remaining.Q,l.top[2].remaining.DE], [24,1,2,0]);
});
test('same products support overfit/stripe and pintuck/shirring/puff; alias does not duplicate evidence', () => {
  const over = group('attribute:fitEase:오버핏'); assert.equal(over.periods.all.Q,113);
  assert.deepEqual(over.contributingProductIds,['67545180']);
  const a = result.sharedEvidence.find(x=>x.productNo==='67545180');
  for (const id of ['attribute:fitEase:오버핏','attribute:pattern:스트라이프','combination:원피스 ∩ 롱']) assert.ok(a.groupIds.includes(id));
  const b = result.sharedEvidence.find(x=>x.productNo==='67182128');
  for (const id of ['attribute:design:핀턱','attribute:design:셔링','attribute:design:퍼프']) assert.ok(b.groupIds.includes(id));
  assert.ok(group('secondaryCategory:롱원피스').equivalentGroups.includes('combination:원피스 ∩ 롱'));
});
test('A-line recent two orders on one day: O=1 D=0', () => {
  const m=group('attribute:silhouette:A라인').periods.d7; assert.deepEqual([m.Q,m.O,m.D,m.DN,m.DE],[2,1,0,0,0]);
});
test('denim shorts three option rows are one order and one date', () => {
  const p=group('combination:숏·하프팬츠 ∩ 데님').periods.all.productStats.find(p=>p.productNo==='68911554');
  assert.deepEqual([p.Q,p.orderCount,p.dateCount,p.O,p.D],[3,1,1,0,0]);
});
test('shorts TOP2 exactly 50% is not majority; residuals and boundary preserved', () => {
  const g=group('baseType:숏·하프팬츠'); assert.equal(g.periods.all.top[2].share,0.5);
  assert.equal(g.periods.all.top[2].candidate,'no'); assert.ok(g.flags.includes('concentration_boundary'));
});
test('Q increases but retained performance decreases: mixed, not recent_up', () => {
  const g=group('baseType:숏·하프팬츠'); assert.equal(g.comparisons.d14.Q.direction,'up'); assert.equal(g.comparisons.d14.E.direction,'down');
  assert.ok(g.flags.includes('mixed_recent')); assert.ok(!g.flags.includes('recent_up_observed'));
});
test('30-day up / 14-day down is mixed, with zero-origin observation instead of infinite growth', () => {
  const g=group('baseType:슬랙스'); assert.equal(g.comparisons.d30.Q.percent,null);
  assert.equal(g.comparisons.d30.Q.observation,'0에서 관측 시작'); assert.equal(g.comparisons.d14.Q.direction,'down'); assert.ok(g.flags.includes('mixed_recent'));
});
test('7-day zero alone does not create negative state', () => {
  const g=all(run([p('a'),p('b')],[f('a','2026-09-10'),f('b','2026-09-11')]));
  assert.equal(g.primaryState,'exploration_signal'); assert.ok(g.flags.includes('no_recent7_observed')); assert.ok(!g.flags.includes('cooling_observed'));
});
test('unlinked products have no product sales record and L=0 rate is null', () => {
  const g=all(run([p('')],[f('','2026-09-10')])); assert.deepEqual([g.periods.all.R,g.periods.all.L,g.periods.all.U,g.periods.all.rate],[1,0,1,null]);
  assert.deepEqual(g.periods.all.productStats,[]); assert.equal(g.primaryState,'insufficient_data'); assert.ok(!g.flags.includes('no_order_observed'));
});
test('zero observations with unknown exposure are insufficient, never weak', () => {
  const g=all(run([p('a')])); assert.equal(g.primaryState,'insufficient_data'); assert.ok(g.flags.includes('no_order_observed')); assert.ok(g.flags.includes('exposure_unknown'));
});
test('taxonomy field conflict preserves other fields, order facts and product population', () => {
  const product=p('a','슬림 루즈핏 리본 티셔츠');
  const r=run([product],[f('a','2026-09-10')]); assert.equal(group('baseType:티셔츠',r).periods.all.Q,1);
  assert.ok(r.groups.some(g=>g.id==='attribute:design:리본')); assert.ok(!r.groups.some(g=>g.level==='attribute:fitEase'));
});
test('option length and unscoped set attributes are not allocated', () => {
  const r=run([p('a','미니&롱 원피스'),p('b','셔링 블라우스 스커트 세트')]);
  assert.ok(!r.groups.some(g=>g.level==='attribute:length')); assert.ok(!r.groups.some(g=>g.id==='attribute:design:셔링'));
  assert.equal(all(r).periods.all.R,2); assert.ok(all(r).flags.includes('option_unallocated'));
});
test('TOPk tie changes possible state: all permutations hold, ranges preserve alternatives', () => {
  const products=[p('a'),p('b'),p('c')];
  const orders=[f('a','2026-09-01'),f('a','2026-09-02'),f('b','2026-09-01',2),f('c','2026-09-01',2)];
  const one=all(run(products,orders)), two=all(run([...products].reverse(),[...orders].reverse()));
  assert.equal(one.periods.all.top[2].candidate,'ambiguous'); assert.equal(one.primaryState,'insufficient_data');
  assert.ok(one.reasonCodes.includes('TOPK_TIE_CHANGES_STATE')); assert.equal(two.primaryState,one.primaryState);
  assert.deepEqual(one.periods.all.top[2].remainingRanges.DE,{min:0,max:1});
});
test('large tie pools use exact repetition signatures without combinatorial product enumeration', () => {
  const products=Array.from({length:100},(_,i)=>p(String(i)));
  const g=all(run(products,products.map(p=>f(p.productNo,'2026-09-01'))));
  assert.equal(g.periods.all.top[3].tie.tiedProductIds.length,100); assert.equal(g.primaryState,'exploration_signal');
});
test('missing orderNo preserves quantities, quarantines repetition and leaves other products usable', () => {
  const r=run([p('a','원피스'),p('b','티셔츠')],[f('a','2026-09-01',1,{orderNo:''}),f('b','2026-09-01')]);
  const a=group('baseType:원피스',r); assert.equal(a.periods.all.Q,1); assert.equal(a.periods.all.O,null); assert.equal(a.periods.all.D,null);
  assert.ok(a.issues.some(i=>i.code==='ORDER_NO_MISSING')); assert.equal(group('baseType:티셔츠',r).validationStatus,'observed_provisional');
});
test('same order with inconsistent dates does not create repeated days', () => {
  const r=run([p('a')],[f('a','2026-09-01',1,{orderNo:'x'}),f('a','2026-09-02',1,{orderNo:'x'})]);
  assert.equal(all(r).periods.all.Q,2); assert.equal(all(r).periods.all.O,0); assert.equal(all(r).periods.all.D,null);
  assert.ok(r.issues.some(i=>i.code==='ORDER_DATE_CONFLICT'));
});
test('invalid date preserves cumulative quantity but makes period attribution unknown', () => {
  const r=run([p('a')],[f('a','2026-02-30')]); assert.equal(all(r).periods.all.Q,1); assert.equal(all(r).periods.d30.Q,null);
  assert.ok(r.issues.some(i=>i.code==='ORDER_DATE_INVALID'));
});
test('unknown coverage remains provisional and reports disabled state gates', () => {
  for(const g of result.groups){assert.ok(!['evidence_strong','weak_observed_signal'].includes(g.primaryState));assert.ok(g.flags.includes('coverage_unverified'));assert.equal(g.promotion.evidence_strong.enabled,false);}
});
test('strong and weak remain disabled even with verified observations', () => {
  const products=Array.from({length:12},(_,i)=>({...p(String(i)),observation:{exposure:'verified',testDuration:'verified',availability:'verified'}}));
  const facts=products.flatMap(p=>[f(p.productNo,'2026-09-08'),f(p.productNo,'2026-09-09')]);
  const snapshot={...input.snapshot,collectionCompleteness:'verified'};
  const g=all(run(products,facts,{snapshot})); assert.equal(g.primaryState,'exploration_signal'); assert.equal(g.validationStatus,'validated');
  assert.equal(g.promotion.evidence_strong.enabled,false); assert.equal(all(run(products,[],{snapshot})).primaryState,'insufficient_data');
});
test('quantities are consumed verbatim, including pending E; no commerce recalculation', () => {
  const g=all(run([p('a')],[f('a','2026-09-01',5,{cancelQty:2,netQty:3,eligibleQty:0,pendingClaim:true})]));
  assert.deepEqual([g.periods.all.Q,g.periods.all.C,g.periods.all.N,g.periods.all.E],[5,2,3,0]);
  assert.ok(g.flags.includes('reaction_without_retained_sales'));
});
test('bad numeric field is null and does not poison unrelated category', () => {
  const r=run([p('a','원피스'),p('b','티셔츠')],[f('a','2026-09-01',1,{netQty:undefined}),f('b','2026-09-01')]);
  assert.equal(group('baseType:원피스',r).periods.all.N,null); assert.equal(group('baseType:원피스',r).periods.all.Q,1);
  assert.equal(group('baseType:티셔츠',r).periods.all.N,1);
});
test('duplicate exact fact is not double counted; conflicting product-order is quarantined', () => {
  const fact=f('a','2026-09-01'); const r=run([p('a')],[fact,{...fact}]); assert.equal(all(r).periods.all.Q,1);
  const bad=run([p('a')],[fact,{...fact,qty:2}]); assert.equal(all(bad).periods.all.Q,null);
  assert.ok(bad.issues.some(i=>i.code==='PRODUCT_ORDER_CONFLICT'));
});
test('duplicate MD product counted once; conflicting attribute quarantined only in that field', () => {
  const first=p('a','롱 리본 원피스'), second=p('a','미니 리본 원피스');
  const r=run([first,second]); assert.equal(all(r).periods.all.R,1);
  assert.ok(!r.groups.some(g=>g.level==='attribute:length')); assert.equal(group('attribute:design:리본',r).periods.all.R,1);
});
test('calendar boundaries are inclusive, timezone-aware, and independent of system clock', () => {
  const periods=createSignalPeriods({asOf:'2026-09-18T15:00:00Z',timezone:'Asia/Seoul',start:'2026-04-15'});
  assert.deepEqual(periods,input.snapshot.periods);
  const g=all(run([p('a')],[f('a','2026-09-12T15:00:00Z'),f('a','2026-09-12T14:59:59Z')]));
  assert.equal(g.periods.d7.Q,1); assert.equal(g.periods.p7.Q,1);
});
test('malformed snapshots and unversioned threshold changes are blocked', () => {
  assert.equal(diagnoseSourcingSignals().validationStatus,'blocked');
  assert.equal(run([p('a')],[],{policy:{concentration:{share:0.6}}}).issues[0].code,'POLICY_VERSION_REQUIRED');
  const bad=structuredClone(input.snapshot);bad.periods.d7.start='2026-09-14';
  assert.equal(run([p('a')],[],{snapshot:bad}).issues[0].code,'PERIOD_BOUNDARY_MISMATCH');
});
test('policy overrides require a distinct version and preserve exactly-half distinction', () => {
  const policy={version:'test-policy-v2',concentration:{share:0.6}};
  const r=run([p('a'),p('b')],[f('a','2026-09-01'),f('a','2026-09-02'),f('b','2026-09-01')],{snapshot:{...input.snapshot,policyVersion:policy.version},policy});
  assert.equal(r.policyVersion,'test-policy-v2'); assert.equal(all(r).primaryState,'concentration_dependent');
  assert.equal(DEFAULT_SIGNAL_POLICY.concentration.share,0.5);
});
test('input is not mutated and results are repeatable', () => {
  const before=JSON.stringify(input);assert.deepEqual(diagnoseSourcingSignals(input),result);assert.equal(JSON.stringify(input),before);
});

test('malformed taxonomy row is isolated and does not throw away a valid product', () => {
  const bad={...p('a'),taxonomy:{...p('a').taxonomy,attributes:'bad',review:[null]}};
  const r=run([bad,p('b','리본 티셔츠')],[f('b','2026-09-01')]);
  assert.equal(group('attribute:design:리본',r).periods.all.Q,1);
  const broken=run([{...p('a'),taxonomy:'broken'},p('b','리본 티셔츠')]);
  assert.equal(group('baseType:티셔츠',broken).periods.all.L,1);
});
test('registration after snapshot boundary and invalid combinations return blocked instead of throwing', () => {
  const snapshot=structuredClone(input.snapshot);snapshot.periods.all={start:'2027-01-01',end:'2027-02-01'};
  assert.equal(run([p('a')],[],{snapshot}).validationStatus,'blocked');
  assert.equal(run([p('a')],[],{combinations:[null]}).validationStatus,'blocked');
});
test('upstream product issue is scoped to its own groups', () => {
  const r=run([p('a','원피스'),p('b','티셔츠')],[f('a','2026-09-01',1,{issue:{code:'SOURCE_ERROR'}}),f('b','2026-09-01')]);
  assert.equal(group('baseType:원피스',r).validationStatus,'blocked');
  assert.equal(group('baseType:티셔츠',r).validationStatus,'observed_provisional');
});
