export default {
  role: "Purchaser",
  roleColor: "#3a6ea5",
  title: "Purchaser — Standard Operating Procedure",
  login: "purchaser1@infinitee.in  /  purchaser2@infinitee.in",
  overview: "Manage all vendor-side activity — send RFQs, receive and enter quotes, route to QC, and build the customer quote for manager approval.",
  sections: [
    {
      heading: "Step 1 — Pick up a new requirement (SLA: 2 hours)",
      items: [
        { type: "step", text: "When a Sales person creates a deal, it appears in the Requirement received stage on the Board." },
        { type: "step", text: "Open the deal promptly — SLA is 2 hours." },
        { type: "step", text: "Review the enquiry details: customer, product, quantity, spec, delivery timeline, application." },
        { type: "note", text: "Click Save draft at any point if you need to pause and return later without losing your work." },
      ],
    },
    {
      heading: "Step 2 — Send RFQ to vendors (SLA: 36 hours for response)",
      items: [
        { type: "step", text: "In the deal drawer, go to the RFQ tab." },
        { type: "step", text: "Fill in the RFQ terms: product name, quantity, pack size, incoterm, price validity, HSN code." },
        { type: "step", text: "Tick the items vendors must include in their response: Price/Kg, IncoTerm, Packaging, Pack Size, Qty/Pallet, Qty/Container, Lead Time, HSN Code, SDS/TDS/COA documents." },
        { type: "step", text: "Add any additional information or special requirements." },
        { type: "step", text: "Select which vendors to send to. Primary-tier vendors are shown first. You can add new vendors here too." },
        { type: "step", text: "Click Send RFQ →. For each vendor, an email draft opens automatically in your email client — send it." },
        { type: "step", text: "The deal moves to RFQ sent stage. Vendors have 36 hours to respond." },
        { type: "note", text: "Use Queues → Pending RFQs in the sidebar to monitor all outstanding vendor RFQs across all deals." },
      ],
    },
    {
      heading: "Step 3 — Enter vendor quotes (SLA: 4 hours to route after receipt)",
      items: [
        { type: "step", text: "When a vendor replies, open the deal → RFQ tab." },
        { type: "step", text: "Find the vendor's row and click Enter quote." },
        { type: "step", text: "Fill in all prices provided: Ex-Works, Freight (Inland), C&F, FOB, Sea Freight, CIF, Duty, Tariff, Other Costs, Ex-Warehouse, Freight (Delivery), and Final price." },
        { type: "step", text: "Enter the vendor's quoted Incoterm." },
        { type: "step", text: "Repeat for every vendor that responds." },
        { type: "step", text: "Once at least one vendor has quoted, the deal moves to Vendor quote received. Route to QC within 4 hours." },
      ],
    },
    {
      heading: "Step 4 — Route to QC",
      items: [
        { type: "step", text: "Open the deal → QC tab." },
        { type: "step", text: "Review any vendor documents already attached (CoA, TDS, MSDS)." },
        { type: "step", text: "Click Route to QC →. The deal moves to QC review and the QC Team is notified." },
      ],
    },
    {
      heading: "Step 5 — Build the customer quote (Ready to quote — SLA: 2 hours)",
      items: [
        { type: "step", text: "After QC approves, the deal moves to Ready to quote. Open it within 2 hours." },
        { type: "step", text: "Open the deal → Quote tab. The Compare view shows all vendor quotes side by side." },
        { type: "step", text: "Review the full cost breakdown for each vendor: Ex-Works → FOB → CIF → Ex-Warehouse → Final delivered." },
        { type: "step", text: "Select the winning vendor by clicking their column." },
        { type: "step", text: "Adjust any cost components as needed — totals calculate automatically." },
        { type: "step", text: "Set the Quote up to level: FOB / CIF / Ex-Warehouse / Final delivered." },
        { type: "step", text: "Enter Terms to customer (payment terms, delivery conditions, validity)." },
        { type: "step", text: "Click Save draft to save progress without submitting." },
        { type: "step", text: "When ready, click Submit for approval →. The deal moves to Quote approval and the Manager is notified." },
      ],
    },
    {
      heading: "Managing the product & vendor master",
      items: [
        { type: "bullet", text: "Go to Insight → Products to view, add, or edit products. Use the search box and click the Product column header to sort A–Z or Z–A." },
        { type: "bullet", text: "Go to Insight → Vendors to view, add, or edit vendors. Search by name or contact person. Click the Vendor column header to sort." },
        { type: "bullet", text: "Import vendors and products in bulk via Import vendors & products." },
        { type: "bullet", text: "Assign vendors to products with a tier: Primary / Secondary / Other / Temporary." },
      ],
    },
    {
      heading: "What Purchaser cannot do",
      items: [
        { type: "bullet", text: "Cannot send the customer quotation — that is Sales's job after Manager approval." },
        { type: "bullet", text: "Cannot approve quotes — Manager sign-off required." },
        { type: "bullet", text: "Cannot permanently delete deals — inform your Manager." },
      ],
    },
  ],
};
