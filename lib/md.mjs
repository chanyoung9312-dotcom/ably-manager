import {
  seoulDate,
  dateKey,
  inWindow,
  shiftDay,
  dayDistance,
} from "./dates.mjs";
// These thresholds are explicit operating rules, not a statistical demand forecast.
export const MD_RULES = {
  minDays: 3,
  minUnits: 3,
  minAge: 7,
  mainDays: 5,
  mainUnits: 8,
  mainSpan: 14,
  reviewDays: 7,
};
export const productKey = (o) =>
  o.productNo ? `id:${o.productNo}` : `unlinked:${o.productOrder || o.row}`;
const sum = (a, k) => a.reduce((s, o) => s + (o[k] ?? 0), 0);

function buildUploadStats(data, today) {
  const source = (data.mdUploads || data.mdProducts || [])
    .map((p) => ({
      date: dateKey(p.date),
      uploader: String(p.uploader || "").trim(),
    }))
    .filter((p) => p.date && p.date <= today);
  const dayOfWeek = new Date(`${today}T00:00:00Z`).getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = shiftDay(today, mondayOffset);
  const weekdayLabels = ["월", "화", "수", "목", "금"];
  const weekdays = weekdayLabels.map((label, i) => {
    const date = shiftDay(weekStart, i);
    const [, month, day] = date.split("-");
    return {
      date,
      label,
      short: `${Number(month)}/${Number(day)}`,
    };
  });
  const weekEnd = weekdays.at(-1).date;
  const monthKey = today.slice(0, 7);
  const assigned = source.filter((p) => p.uploader);
  const memberNames = [...new Set(assigned.map((p) => p.uploader))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
  const count = (rows, predicate) => rows.filter(predicate).length;
  const members = memberNames.map((name) => {
    const rows = assigned.filter((p) => p.uploader === name);
    const days = Object.fromEntries(
      weekdays.map((d) => [d.date, count(rows, (p) => p.date === d.date)]),
    );
    return {
      name,
      today: count(rows, (p) => p.date === today),
      week: count(rows, (p) => p.date >= weekStart && p.date <= weekEnd),
      month: count(rows, (p) => p.date.startsWith(monthKey)),
      total: rows.length,
      days,
    };
  });
  const unassigned = source.filter((p) => !p.uploader);
  const weekdayToday = dayOfWeek >= 1 && dayOfWeek <= 5;
  return {
    today,
    weekdayToday,
    dailyTargetPerPerson: 4,
    weeklyTargetPerPerson: 20,
    teamTodayTarget: weekdayToday ? memberNames.length * 4 : 0,
    teamWeekTarget: memberNames.length * 20,
    weekStart,
    weekEnd,
    weekdays,
    monthLabel: `${Number(today.slice(5, 7))}월`,
    members,
    todayTotal: members.reduce((s, p) => s + p.today, 0),
    weekTotal: members.reduce((s, p) => s + p.week, 0),
    monthTotal: members.reduce((s, p) => s + p.month, 0),
    total: members.reduce((s, p) => s + p.total, 0),
    unassigned: {
      today: count(unassigned, (p) => p.date === today),
      week: count(unassigned, (p) => p.date >= weekStart && p.date <= weekEnd),
      month: count(unassigned, (p) => p.date.startsWith(monthKey)),
      total: unassigned.length,
    },
  };
}

export function analyze(data, { today = seoulDate() } = {}) {
  if (!dateKey(today)) throw new Error("유효하지 않은 분석 기준일");
  const coverage = dateKey(data.coverageStart),
    warnings = [...(data.warnings || [])];
  if (!coverage)
    warnings.push(
      "주문 수집 시작일 미확인: 0건과 수집 누락을 구별할 수 없어 추세 확정·사입 판단을 보류합니다.",
    );
  const orders = (data.orders || []).filter(
    (o) => o.date && o.date <= today && o.state !== "unpaid",
  );
  const window = (n, offset = 0, rows = orders) =>
    rows.filter((o) => inWindow(o.date, today, n, offset));
  const metrics = (rows) => ({
    qty: sum(rows, "qty"),
    net: sum(rows, "netQty"),
    eligible: sum(rows, "eligibleQty"),
    sales: sum(rows, "sales"),
    netSales: sum(rows, "netSales"),
    orderCount: new Set(rows.map((o) => o.orderNo || o.productOrder)).size,
    activeDays: new Set(
      rows.filter((o) => o.eligibleQty > 0).map((o) => o.date),
    ).size,
  });
  const trends = [7, 14, 30].map((n) => {
    const current = metrics(window(n)),
      previous = metrics(window(n, n));
    return {
      days: n,
      current,
      previous,
      comparable: !!coverage && coverage <= shiftDay(today, 1 - 2 * n),
      change:
        previous.net > 0
          ? ((current.net - previous.net) / previous.net) * 100
          : null,
    };
  });
  const map = new Map();
  for (const o of orders) {
    const k = productKey(o);
    if (!map.has(k))
      map.set(k, {
        key: k,
        productNo: o.productNo,
        name: o.product,
        orders: [],
      });
    map.get(k).orders.push(o);
  }
  for (const p of data.mdProducts || []) {
    const k = productKey(p);
    if (!map.has(k))
      map.set(k, {
        key: k,
        productNo: p.productNo,
        name: p.product,
        orders: [],
      });
  }
  for (const p of data.inventory || []) {
    const k = productKey(p);
    if (!map.has(k))
      map.set(k, {
        key: k,
        productNo: p.productNo,
        name: p.product,
        orders: [],
      });
  }
  const rows = [...map.values()]
    .map((p) => {
      const own = p.orders,
        windows = [7, 14, 30].map((n) => ({
          days: n,
          current: metrics(window(n, 0, own)),
          previous: metrics(window(n, n, own)),
          comparable: !!coverage && coverage <= shiftDay(today, 1 - 2 * n),
        }));
      const [w7, w14, w30] = windows;
      const md = (data.mdProducts || []).filter(
          (m) => p.productNo && m.productNo === p.productNo,
        ),
        meta = md.length === 1 ? md[0] : {};
      const reg = dateKey(meta.registeredAt || meta.date),
        age = reg ? dayDistance(today, reg) : null;
      const options = (data.inventory || []).filter(
        (i) => p.productNo && i.productNo === p.productNo,
      );
      const stock =
        options.length && !options.some((o) => o.invalid || o.qty === null)
          ? sum(options, "qty")
          : null;
      const active = window(30, 0, own).filter((o) => o.eligibleQty > 0),
        dates = [...new Set(active.map((o) => o.date))].sort();
      const daily = new Map();
      for (const o of active)
        daily.set(o.date, (daily.get(o.date) || 0) + o.eligibleQty);
      const concentration = w30.current.eligible
        ? Math.max(...daily.values()) / w30.current.eligible
        : 0;
      const last = dates.at(-1) || null,
        span = dates.length > 1 ? dayDistance(last, dates[0]) : 0;
      const gaps = dates.slice(1).map((d, i) => dayDistance(d, dates[i]));
      const claims = (data.claims || data.cancels || []).filter(
        (c) => p.productNo && c.productNo === p.productNo,
      );
      const pending = own.some((o) => o.pendingClaim),
        cancelled = sum(window(30, 0, own), "cancelQty");
      const cancelRate = w30.current.qty ? cancelled / w30.current.qty : 0;
      let speed = "❓ 데이터 부족";
      if (
        w7.comparable &&
        (w7.current.eligible >= 2 || w7.previous.eligible >= 2)
      )
        speed =
          w7.current.eligible > w7.previous.eligible * 1.25
            ? "🔥 판매 가속"
            : w7.current.eligible < w7.previous.eligible * 0.75
              ? "📉 판매 둔화"
              : "➡️ 판매 유지";
      const missing = [];
      // Warning copy is display-only: scope is recorded at the source, before
      // malformed or conflicting rows are removed from the canonical ledger.
      const issues = (data.issues || []).filter(
        (issue) =>
          issue.scope === "ledger" ||
          (issue.scope === "product" &&
            ((p.productNo && issue.productNos?.includes(p.productNo)) ||
              issue.productKey === p.key)),
      );
      for (const issue of issues)
        missing.push(
          `${issue.scope === "ledger" ? "원장 전체" : "해당 상품"} 오류 해소: ${issue.message}`,
        );
      if (!p.productNo) missing.push("상품번호 연결");
      if (md.length > 1) missing.push("중복 MD 상품번호 확인");
      if (!reg || age < 0) missing.push("등록일 확인");
      else if (!meta.registeredAt)
        missing.push("실제 등록일 확인(현재 MD 업로드일 대용)");
      if (!coverage || coverage > shiftDay(today, -29))
        missing.push("최근 30일 주문 수집 범위 확인");
      if (stock === null) missing.push("옵션별 현재 재고");
      if (pending) missing.push("진행 중 취소·반품 확정");
      const repeated =
        w14.current.eligible >= MD_RULES.minUnits &&
        w14.current.activeDays >= MD_RULES.minDays &&
        w7.current.eligible >= 1;
      let grade = "B",
        stage = w30.current.qty ? "초기 반응" : "데이터 부족",
        decision = "관찰",
        timing = "조금 더 관찰",
        buy = "⚪ 무재고 유지";
      if (repeated) {
        stage = "판매 가능성 있음";
        grade = "A";
      }
      if (
        repeated &&
        w30.current.eligible >= MD_RULES.mainUnits &&
        dates.length >= MD_RULES.mainDays &&
        span >= MD_RULES.mainSpan &&
        w7.current.eligible >= 2 &&
        concentration <= 0.5 &&
        cancelRate <= 0.3
      ) {
        stage = "지속 판매 확인";
        grade = "S";
      }
      if (
        !missing.length &&
        age >= MD_RULES.minAge &&
        repeated &&
        cancelRate <= 0.4 &&
        concentration <= 0.6
      ) {
        decision = "사입 검토";
        timing = "지금 사입 조건 확인";
        buy = "🟡 소량 사입 검토";
      }
      // No exposure/click data: never classify a zero-sales product as C/D solely for not selling.
      let reason = `7일 순판매 ${w7.current.net}개 · 14일 ${w14.current.net}개 · 30일 ${w30.current.net}개 · 유효 판매 ${dates.length}일 분산`;
      if (pending) reason += " · 미확정 클레임은 사입 근거에서 제외";
      if (concentration > 0.6)
        reason += " · 하루 집중 주문으로 반복 수요 확인 필요";
      let quantities = null;
      const lead = meta.leadDays,
        incoming = meta.incoming,
        reserved = meta.reserved;
      const validSupply =
        Number.isFinite(lead) &&
        lead > 0 &&
        lead <= 90 &&
        Number.isInteger(incoming) &&
        incoming >= 0 &&
        Number.isInteger(reserved) &&
        reserved >= 0;
      if (!validSupply) missing.push("공급기간·입고예정·예약재고");
      if (decision === "사입 검토" && validSupply) {
        const dailyRate = Math.min(
          w7.current.eligible / 7,
          w14.current.eligible / 14,
        );
        const available = stock + incoming - reserved;
        const quantity = (review, multiplier) =>
          Math.max(
            0,
            Math.ceil(dailyRate * (lead + review) * multiplier - available),
          );
        quantities = {
          conservative: quantity(3, 0.75),
          recommended: quantity(7, 1),
          aggressive: quantity(10, 1.25),
          dailyRate,
          available,
          leadDays: lead,
        };
        if (quantities.recommended === 0) {
          decision = "추가 사입 중단";
          timing = "아직 사입하지 않음";
          buy = "⚪ 보유·입고 재고 우선";
        } else {
          buy = `🟡 추천 ${quantities.recommended}개 검토`;
          timing = "지금 사입 검토";
        }
      }
      if (
        meta.seasonEnd &&
        meta.seasonEnd <= shiftDay(today, Number.isFinite(lead) ? lead : 0)
      ) {
        decision = "추가 사입 중단";
        timing = "아직 사입하지 않음";
        buy = "⚪ 판매 가능기간 확인";
        quantities = null;
        reason += " · 입고 전 판매 종료 위험";
      }
      const stockDays =
        stock !== null && w14.current.eligible > 0
          ? stock / (w14.current.eligible / 14)
          : null;
      const additional = Math.max(0, MD_RULES.minDays - w14.current.activeDays);
      return {
        ...p,
        orders: undefined,
        windows,
        q7: w7.current.net,
        p7: w7.previous.net,
        q14: w14.current.net,
        q30: w30.current.net,
        total: sum(own, "qty"),
        netTotal: sum(own, "netQty"),
        grade,
        stage,
        decision,
        timing,
        buy,
        speed,
        reason,
        missing: [...new Set(missing)],
        issues,
        quantities,
        stock,
        stockDays,
        options,
        registeredAt: reg,
        age,
        days30: dates.length,
        last,
        span,
        meanGap: gaps.length
          ? sum(
              gaps.map((n) => ({ n })),
              "n",
            ) / gaps.length
          : null,
        concentration,
        cancels: cancelled,
        cancelRate,
        claims,
        observe: additional
          ? `다른 날짜 ${additional}일 이상의 추가 유효 주문을 확인하고 7일 후 재평가`
          : "7일 후 판매 지속·공급 조건 재평가",
      };
    })
    .sort((a, b) => b.q7 - a.q7 || b.q30 - a.q30);
  return {
    today,
    trends,
    rows,
    uploads: buildUploadStats(data, today),
    warnings,
    updatedAt: data.updatedAt,
    coverageStart: coverage || null,
    salesMode: data.salesMode,
  };
}
