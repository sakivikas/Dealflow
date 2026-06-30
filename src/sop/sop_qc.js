export default {
  role: "QC Team",
  roleColor: "#0e8f8f",
  title: "QC Team — Standard Operating Procedure",
  login: "qc@infinitee.in",
  overview: "Review vendor quality documents for each deal and make a pass/fail decision before the customer quote is built.",
  sections: [
    {
      heading: "Step 1 — Find deals awaiting QC (SLA: 24 hours)",
      items: [
        { type: "step", text: "Go to Queues → QC review in the sidebar to see all deals currently in the QC review stage." },
        { type: "step", text: "Alternatively, open the Board and look at the QC review column." },
        { type: "note", text: "SLA is 24 hours from when the deal enters QC review. Red timer = SLA breached." },
      ],
    },
    {
      heading: "Step 2 — Review vendor documents",
      items: [
        { type: "step", text: "Open the deal. Go to the QC tab." },
        { type: "step", text: "You will see one section per vendor who quoted." },
        { type: "step", text: "For each vendor, review their documents:" },
        { type: "bullet", text: "CoA (Certificate of Analysis) — check purity, specifications, batch details match the customer requirement." },
        { type: "bullet", text: "TDS (Technical Data Sheet) — verify product specs align with what was enquired." },
        { type: "bullet", text: "MSDS (Material Safety Data Sheet) — check hazard classification and handling instructions." },
        { type: "step", text: "Work through the QC checklist for each vendor — tick each item as you verify it." },
        { type: "step", text: "Add notes for any concerns, discrepancies, or conditional approvals." },
        { type: "step", text: "Click Save QC draft if you need to pause and return later." },
      ],
    },
    {
      heading: "Step 3 — Make the QC decision",
      items: [
        { type: "bullet", text: "Vendor passes QC → mark as approved. The Purchaser can then select this vendor when building the customer quote." },
        { type: "bullet", text: "Vendor fails QC → record the reason in notes. The deal may be sent back to the vendor stage for a revised or replacement quote." },
        { type: "step", text: "Once all vendors are reviewed, click QC complete →. The deal moves to Ready to quote and the Purchaser is notified." },
      ],
    },
    {
      heading: "Step 4 — Generate a CoA (Certificate of Analysis)",
      items: [
        { type: "para", text: "If Infinitee issues its own CoA to the customer:" },
        { type: "step", text: "Open the deal → Documents section." },
        { type: "step", text: "Fill in the CoA form: product details, test parameters, results, and conclusion." },
        { type: "step", text: "Click Generate CoA — a print-ready CoA is produced with Infinitee's letterhead, authorized signature, and revision number." },
        { type: "step", text: "Download and share with the customer or Sales team." },
        { type: "note", text: "The CoA letterhead and signature are configured by the Admin under Admin → CoA template. Contact your Admin if the letterhead needs updating." },
      ],
    },
    {
      heading: "What QC Team cannot do",
      items: [
        { type: "bullet", text: "Cannot send RFQs to vendors or enter vendor quotes — Purchaser's responsibility." },
        { type: "bullet", text: "Cannot build or approve customer quotes." },
        { type: "bullet", text: "Cannot delete or archive deals." },
      ],
    },
  ],
};
