export default {
  role: "Admin",
  roleColor: "#7d5ba6",
  title: "Admin — Standard Operating Procedure",
  login: "admin@infinitee.in",
  overview: "Full system access — configure users, roles, permissions, email templates, CoA letterhead, and maintain master data.",
  sections: [
    {
      heading: "User management (Admin → User master)",
      items: [
        { type: "bullet", text: "Add a team member — fill in name, roles (a person can hold multiple roles), login email, and mobile number." },
        { type: "bullet", text: "Create login account — set the email address and password for their app login." },
        { type: "bullet", text: "Reset password — reset any team member's password if they are locked out." },
        { type: "bullet", text: "Deactivate — removes a team member from the active team without deleting their deal history." },
        { type: "note", text: "Roles determine what each person can see and do in the app. Assign roles carefully. Changes take effect on the user's next action." },
      ],
    },
    {
      heading: "Roles (Admin → Roles)",
      items: [
        { type: "para", text: "The five default roles are: Purchaser, QC Team, Sales, Manager, Admin." },
        { type: "bullet", text: "Create custom roles if your team has additional functions." },
        { type: "bullet", text: "Rename existing roles to match your internal terminology." },
        { type: "bullet", text: "Roles can be assigned to multiple team members. Team members can hold multiple roles." },
      ],
    },
    {
      heading: "Access control (Admin → Access control)",
      items: [
        { type: "para", text: "Set which roles can View / Create / Edit / Delete at each pipeline stage. Changes take effect immediately for all users." },
        { type: "bullet", text: "Requirement received — default: Purchaser and Sales can create and edit." },
        { type: "bullet", text: "RFQ sent — default: Purchaser only." },
        { type: "bullet", text: "Vendor quote received — default: Purchaser only." },
        { type: "bullet", text: "QC review — default: QC Team only." },
        { type: "bullet", text: "Ready to quote — default: Purchaser and Sales." },
        { type: "bullet", text: "Quote approval — default: Manager can edit (approve/reject)." },
        { type: "bullet", text: "Quotation sent — default: Sales only." },
        { type: "bullet", text: "Order confirmed — default: Sales only." },
        { type: "bullet", text: "Delete / Archive (any stage) — default: Manager and Admin only." },
      ],
    },
    {
      heading: "Email templates (Admin → Email templates)",
      items: [
        { type: "bullet", text: "New vendor RFQ and Existing vendor RFQ — used when Purchasers send RFQs." },
        { type: "bullet", text: "New customer quotation and Existing customer quotation — used when Sales send quotes." },
        { type: "bullet", text: "Follow-up templates — used for customer follow-up emails." },
        { type: "para", text: "Available placeholders are grouped by: Vendor ({{vendor_name}}, {{vendor_contact}}, {{vendor_email}}), Customer ({{customer}}, {{customer_contact}}, {{customer_email}}, {{customer_phone}}), Deal ({{product}}, {{quantity}}, {{details}}, {{required_items}}, {{additional_info}}), Sender ({{user}}, {{user_email}}, {{user_mobile}}, {{signature}})." },
        { type: "note", text: "{{signature}} inserts the sender's name, email, and phone as plain text. Signature images must be configured directly in each user's email client (Gmail or Outlook settings) — they cannot travel via email compose links." },
      ],
    },
    {
      heading: "Stage change emails (Admin → Stage change emails)",
      items: [
        { type: "bullet", text: "Configure automatic notification emails sent to the stage owner whenever a deal moves into their stage." },
        { type: "bullet", text: "Enable or disable per stage individually." },
        { type: "bullet", text: "Edit the subject and body for each stage notification." },
      ],
    },
    {
      heading: "CoA template (Admin → CoA template)",
      items: [
        { type: "step", text: "Upload the Header image — company letterhead / logo, appears at the top of every CoA (full width)." },
        { type: "step", text: "Upload the Signature image — authorized signatory's signature, appears in the Approved by section." },
        { type: "step", text: "Set the Approved by name (e.g. Dr. Ramesh Kumar — Authorized Signatory)." },
        { type: "step", text: "Set the Revision number." },
        { type: "note", text: "These settings apply to all CoAs generated from any deal across the system." },
      ],
    },
    {
      heading: "Product & vendor master",
      items: [
        { type: "bullet", text: "Admins can do everything Purchasers can, plus permanently delete vendors (if no RFQ history) or deactivate them (if history exists)." },
        { type: "bullet", text: "Merge vendors — combine duplicate vendor records without losing any RFQ history (Admin → Vendors → Merge vendors)." },
        { type: "bullet", text: "Import vendors and products in bulk via Insight → Products → Import vendors & products." },
      ],
    },
    {
      heading: "Quick reference — who does what",
      items: [
        { type: "bullet", text: "Create new enquiry: Sales, Purchaser, Admin" },
        { type: "bullet", text: "Send RFQ to vendors: Purchaser, Admin" },
        { type: "bullet", text: "Enter vendor quote: Purchaser, Admin" },
        { type: "bullet", text: "QC review & decision: QC Team, Admin" },
        { type: "bullet", text: "Build customer quote: Purchaser, Sales, Admin" },
        { type: "bullet", text: "Approve / reject quote: Manager, Admin" },
        { type: "bullet", text: "Send quotation to customer: Sales, Admin" },
        { type: "bullet", text: "Log follow-ups: Sales, Admin" },
        { type: "bullet", text: "Confirm order / Close deal: Sales, Admin" },
        { type: "bullet", text: "Archive / delete deal: Manager, Admin" },
        { type: "bullet", text: "Add / edit products & vendors: Purchaser, Admin" },
        { type: "bullet", text: "View reports & insights: All roles" },
        { type: "bullet", text: "Manage users, roles, permissions, templates: Admin only" },
      ],
    },
  ],
};
