import { secure } from "../../../lib/access.mjs";
import { loadDashboard } from "../../../lib/dashboard.mjs";
async function handleGET() {
  try {
    const d = await loadDashboard();
    const adapt = (o) => ({
      ...o,
      paymentDate: o.date,
      productOrderNo: o.productOrder,
      productName: o.product,
      payment: o.sales,
    });
    return Response.json(
      {
        ...d,
        orders: d.orders.map(adapt),
        cancels: d.cancels.map((c) => ({
          ...adapt(c),
          type:
            { before: "pre_cancel", after: "post_cancel" }[c.type] || c.type,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}

export const GET = secure(handleGET);
