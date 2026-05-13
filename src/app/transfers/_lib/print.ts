export function generateBranchDR(params: {
  poRef: string;
  dnRef: string;
  branch: string;
  dispatchedAt: string;
  receivedAt: string;
  dispatchedBy: string;
  receivedBy: string;
  items: {
    item: string;
    requestedQty: number;
    dispatchedQty: number;
    receivedQty: number;
    unit: string;
  }[];
}): void {
  const { poRef, dnRef, branch, dispatchedAt, receivedAt, dispatchedBy, receivedBy, items } = params;
  const branchLabel = branch === "MKT" ? "Makati" : branch === "BF" ? "BF" : branch;

  const rows = items.map((it, idx) => {
    const bg            = idx % 2 === 0 ? "#f9f9f9" : "#fff";
    const isShort       = it.dispatchedQty < it.requestedQty;
    const isDiscrepancy = it.receivedQty !== it.dispatchedQty;
    const statusText    = isDiscrepancy
      ? `DISCREPANCY (got ${it.receivedQty})`
      : isShort
        ? `SHORT ${it.requestedQty - it.dispatchedQty}`
        : "FULL";
    const statusColor = isDiscrepancy || isShort ? "#c0392b" : "#27ae60";
    const itemColor   = isShort || isDiscrepancy ? "#c0392b" : "#111";
    return [
      `<tr style="background:${bg}">`,
      `<td style="padding:10px 16px;font-size:15px;font-weight:600;border-bottom:1px solid #e0e0e0;color:${itemColor}">${it.item.toUpperCase()}</td>`,
      `<td style="padding:10px 16px;font-size:14px;text-align:right;border-bottom:1px solid #e0e0e0">${it.requestedQty} ${it.unit}</td>`,
      `<td style="padding:10px 16px;font-size:14px;text-align:right;border-bottom:1px solid #e0e0e0">${it.dispatchedQty} ${it.unit}</td>`,
      `<td style="padding:10px 16px;font-size:14px;text-align:right;border-bottom:1px solid #e0e0e0">${it.receivedQty} ${it.unit}</td>`,
      `<td style="padding:10px 16px;font-size:12px;font-weight:600;text-align:right;border-bottom:1px solid #e0e0e0;color:${statusColor}">${statusText}</td>`,
      `</tr>`,
    ].join("");
  }).join("");

  const sigLine = "border-top:2px solid #111;padding-top:8px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.06em;margin-top:50px";

  const html = [
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>DR ${poRef}</title>`,
    `<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:40px 50px}`,
    `.hdr{text-align:center;margin-bottom:30px;padding-bottom:20px;border-bottom:3px solid #111}`,
    `.hdr h1{font-size:28px;font-weight:900;letter-spacing:.08em;margin-bottom:4px}.hdr p{font-size:14px;color:#555}`,
    `.meta{margin-bottom:28px;padding-bottom:18px;border-bottom:1px dashed #aaa}.ref{font-size:22px;font-weight:800;margin-bottom:6px}`,
    `.det{font-size:14px;color:#444;line-height:1.8}table{width:100%;border-collapse:collapse;margin-bottom:30px}`,
    `th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#555;border-bottom:2px solid #111;padding:8px 16px;text-align:left}`,
    `th:not(:first-child){text-align:right}`,
    `.ft{margin-top:60px;display:grid;grid-template-columns:1fr 1fr;gap:60px}.sb{text-align:center}`,
    `@media print{@page{margin:15mm 18mm}}</style></head>`,
    `<body><div class="hdr"><h1>THE BLACK BEAN</h1><p>Delivery Receipt</p></div>`,
    `<div class="meta"><div class="ref">PO# ${poRef} · DN# ${dnRef}</div>`,
    `<div class="det">`,
    `<div>Branch: <strong>${branchLabel}</strong></div>`,
    `<div>Dispatched: <strong>${dispatchedAt}</strong></div>`,
    `<div>Received: <strong>${receivedAt}</strong></div>`,
    `</div></div>`,
    `<table><thead><tr><th>Item</th><th>Ordered</th><th>Dispatched</th><th>Received</th><th>Status</th></tr></thead>`,
    `<tbody>${rows}`,
    `<tr><td colspan="5" style="border-top:2px solid #111;font-size:13px;font-weight:700;padding:10px 16px;text-align:right">Total: ${items.length} item${items.length !== 1 ? "s" : ""}</td></tr>`,
    `</tbody></table>`,
    `<div class="ft">`,
    `<div class="sb"><div style="font-size:16px;font-weight:700;min-height:24px">${dispatchedBy}</div><div style="${sigLine}">Dispatched by (Commissary)</div></div>`,
    `<div class="sb"><div style="font-size:16px;font-weight:700;min-height:24px">${receivedBy}</div><div style="${sigLine}">Received by (Branch)</div></div>`,
    `</div></body></html>`,
  ].join("\n");

  const blob = new Blob([html], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank");
  setTimeout(() => {
    if (win) win.print();
    URL.revokeObjectURL(url);
  }, 800);
}
