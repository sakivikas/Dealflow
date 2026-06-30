export default {
  role: "Sales",
  roleColor: "#2f8f5b",
  title: "Sales — Standard Operating Procedure",
  login: "sales1@infinitee.in  /  sales2@infinitee.in",
  overview: "Capture new enquiries from customers, send the final quotation, follow up until an order is confirmed or the deal is closed.",
  sections: [
    {
      heading: "Step 1 — Log a new customer enquiry",
      items: [
        { type: "step", text: "Click + New enquiry (top-right of the screen)." },
        { type: "step", text: "Fill in: Customer (company name), Contact person, Phone, Email, Channel (Email / WhatsApp / Phone / CRM form), Assign to, Priority." },
        { type: "step", text: "Under Products, fill in: product name, quantity, unit, delivery timeline, specification, and Application (Personal care / Home care / Industrial application / Pharma / Food / Not known) for each product." },
        { type: "step", text: "Add more products with + Add another product — each becomes a separate but grouped deal." },
        { type: "step", text: "Attach any spec sheets the customer has provided." },
        { type: "step", text: "Optionally restrict to Approved vendors only." },
        { type: "step", text: "Click Create deal. The deal opens immediately in the drawer." },
        { type: "note", text: "If a customer enquires about multiple products at once, add them as separate product lines in the same form — this groups them so they travel together through the pipeline." },
      ],
    },
    {
      heading: "Step 2 — Monitor the pipeline",
      items: [
        { type: "bullet", text: "Use Board view to see all deals by stage with SLA countdown timers." },
        { type: "bullet", text: "Use Deals view for a searchable table — filter by customer, product, deal ID, priority, or group." },
        { type: "bullet", text: "Deals you own show your name in the Owner column. Red = SLA breached." },
      ],
    },
    {
      heading: "Step 3 — Send the customer quotation",
      items: [
        { type: "para", text: "The Purchaser builds and submits the quote. Once the Manager approves it, the deal moves to Quotation sent and becomes yours to action." },
        { type: "step", text: "Open the deal. Go to the Quote tab." },
        { type: "step", text: "Review the quote the Purchaser built — prices, margins, terms, selected vendor." },
        { type: "step", text: "Click Open email draft — a pre-filled email opens in your email client. Send it to the customer." },
        { type: "step", text: "Once sent, click Mark as sent — the deal moves to Quotation sent · follow-up stage." },
      ],
    },
    {
      heading: "Step 4 — Follow up with the customer",
      items: [
        { type: "step", text: "Open the deal. Go to the Follow-up tab." },
        { type: "step", text: "Click + Log follow-up after each customer interaction. Record what was said and set a next follow-up date." },
        { type: "step", text: "Use Queues → Follow-ups in the sidebar to see all deals due for follow-up today." },
        { type: "step", text: "If the customer requests changes to the quote, inform the Purchaser to revise. The deal may be sent back to Ready to quote." },
      ],
    },
    {
      heading: "Step 5 — Confirm the order",
      items: [
        { type: "step", text: "When the customer confirms, open the deal and click Confirm order — deal moves to Order confirmed." },
        { type: "step", text: "Once fully delivered and complete, click Close deal → Won." },
      ],
    },
    {
      heading: "Step 6 — Close a lost deal",
      items: [
        { type: "step", text: "If the customer declines, click Close deal → Lost and enter a brief reason." },
        { type: "step", text: "The deal is archived and appears in Reports for reference." },
      ],
    },
    {
      heading: "What Sales cannot do",
      items: [
        { type: "bullet", text: "Cannot send RFQs to vendors — that is the Purchaser's responsibility." },
        { type: "bullet", text: "Cannot enter vendor quotes or build the price comparison." },
        { type: "bullet", text: "Cannot approve quotes — that requires Manager sign-off." },
        { type: "bullet", text: "Cannot permanently delete deals — use Request deletion → in the deal footer if needed." },
      ],
    },
  ],
};
