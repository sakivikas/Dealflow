export default {
  role: "Manager",
  roleColor: "#b85716",
  title: "Manager — Standard Operating Procedure",
  login: "manager@infinitee.in",
  overview: "Approve customer quotes, oversee the full pipeline, handle escalations and deletion requests, and review team performance.",
  sections: [
    {
      heading: "Step 1 — Approve or reject a quote (SLA: 4 hours)",
      items: [
        { type: "step", text: "Go to Queues → Quote approvals in the sidebar — all deals awaiting your decision are listed here." },
        { type: "step", text: "Open a deal → go to the Quote tab." },
        { type: "step", text: "Review the Compare view: vendor prices, cost breakdown (Ex-Works → CIF → Ex-Warehouse → Final), selected vendor, margins, and terms to customer." },
        { type: "step", text: "If approved: click Approve quote →. The deal moves to Quotation sent and the Sales person is notified to send it to the customer." },
        { type: "step", text: "If rejected: click Send back, choose which stage to return it to (e.g. Ready to quote for revision, or Vendor quote received if re-quoting is needed), and add a note explaining what needs to change." },
        { type: "note", text: "SLA for Quote approval is 4 hours. Delayed approvals may cause the customer to go to a competitor." },
      ],
    },
    {
      heading: "Step 2 — Monitor the full pipeline",
      items: [
        { type: "bullet", text: "Board view — all live deals by stage with SLA countdown timers. Red = SLA breached." },
        { type: "bullet", text: "Deals view — full searchable table. Filter by customer, product, deal ID, priority, or group." },
        { type: "bullet", text: "You can open any deal in the pipeline regardless of stage." },
        { type: "bullet", text: "Use Reassign owner inside a deal to move it to another team member if someone is unavailable." },
        { type: "bullet", text: "Use Send back in any deal's footer to push it to an earlier stage when rework is needed." },
      ],
    },
    {
      heading: "Step 3 — Handle deletion requests",
      items: [
        { type: "para", text: "When a team member cannot delete a deal themselves, they send a deletion request for your approval." },
        { type: "step", text: "Look for the red Deletion requested banner on deal cards in Board view, or the red dot indicator in Deals view." },
        { type: "step", text: "Open the deal — the banner at the top shows who requested it and the reason." },
        { type: "step", text: "If approved: click Archive — the deal is removed from the pipeline and archived (still visible in Reports → Archived deals)." },
        { type: "step", text: "If not approved: click Deny — the deal stays active and the requester is notified." },
        { type: "note", text: "You can also directly archive any deal at any time using the Archive deal button in the deal footer or the Archive button on deal cards." },
      ],
    },
    {
      heading: "Step 4 — Review performance (Insight → Reports)",
      items: [
        { type: "bullet", text: "Won / Lost / In-progress deal counts and conversion rate." },
        { type: "bullet", text: "Quoted deals — all deals where a quotation was built and sent (useful for Sales follow-up tracking)." },
        { type: "bullet", text: "Archived deals — full history of all completed and deleted deals with outcomes, notes, and who actioned them." },
        { type: "bullet", text: "SLA breach indicators across stages to identify pipeline bottlenecks." },
      ],
    },
    {
      heading: "Step 5 — Close won or lost deals",
      items: [
        { type: "step", text: "Open the deal at Order confirmed stage once delivery is complete." },
        { type: "step", text: "Click Close deal → Won." },
        { type: "step", text: "For lost deals at any stage: click Close deal → Lost and enter a brief reason." },
        { type: "step", text: "Closed deals are automatically archived and removed from the pipeline." },
      ],
    },
    {
      heading: "What Manager cannot do",
      items: [
        { type: "bullet", text: "Cannot configure system settings, email templates, or access control — that requires Admin." },
        { type: "bullet", text: "Cannot add or remove user login accounts." },
      ],
    },
  ],
};
