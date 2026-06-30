/* ============================================================================
   DealFlow — deal-management module (React)
   ----------------------------------------------------------------------------
   Single self-contained component with a default export. Drop it into your app
   as one module, e.g. a route or tab alongside your QC tool:

       import DealFlow from "./DealFlow";
       <DealFlow />

   • Styles are scoped under `.dealflow`, so they won't collide with your other
     modules. No Tailwind or global CSS required.
   • Persistence is behind the `storage` adapter below. In this preview it uses
     the in-browser persistent store (window.storage) with a memory fallback.
     To share data across users, replace the three methods with calls to your
     own backend (the rest of the component is unchanged).
   ========================================================================== */

import React, { useState, useRef, useEffect, useContext, createContext } from "react";
import SOP_SALES from "./sop/sop_sales.js";
import SOP_PURCHASER from "./sop/sop_purchaser.js";
import SOP_QC from "./sop/sop_qc.js";
import SOP_MANAGER from "./sop/sop_manager.js";
import SOP_ADMIN from "./sop/sop_admin.js";

/* ----------------------------- auth helpers -------------------------------- */
const SEED_ACCOUNTS = [
  { id: "auth_u1", email: "purchaser1@infinitee.in", teamMemberId: "u1", password: "Infin@123" },
  { id: "auth_u2", email: "purchaser2@infinitee.in", teamMemberId: "u2", password: "Infin@123" },
  { id: "auth_u3", email: "sales1@infinitee.in",     teamMemberId: "u3", password: "Infin@123" },
  { id: "auth_u4", email: "sales2@infinitee.in",     teamMemberId: "u4", password: "Infin@123" },
  { id: "auth_u5", email: "qc@infinitee.in",         teamMemberId: "u5", password: "Infin@123" },
  { id: "auth_u6", email: "manager@infinitee.in",    teamMemberId: "u6", password: "Infin@123" },
  { id: "auth_u7", email: "admin@infinitee.in",      teamMemberId: "u7", password: "Admin@123" },
];
function getToken() { return localStorage.getItem("dealflow_token"); }
function setToken(t) { if (t) localStorage.setItem("dealflow_token", t); else localStorage.removeItem("dealflow_token"); }
function getAccounts() {
  try { const d = localStorage.getItem("dealflow_db"); if (d) { const db = JSON.parse(d); return db.loginAccounts && db.loginAccounts.length ? db.loginAccounts : SEED_ACCOUNTS; } } catch (e) {}
  return SEED_ACCOUNTS;
}

async function loginApi(email, password) {
  const e = (email || "").toLowerCase().trim();
  const accounts = getAccounts();
  const u = accounts.find((x) => x.email === e && x.password === password);
  if (u) return { ok: true, token: btoa(JSON.stringify({ userId: u.id, email: u.email, teamMemberId: u.teamMemberId })), user: u };
  return { ok: false, error: "Invalid email or password" };
}

async function checkAuth() {
  const t = getToken();
  if (!t) return null;
  try { return JSON.parse(atob(t)); } catch (e) { setToken(null); return null; }
}
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let p = ""; for (let i = 0; i < 8; i++) p += chars[Math.floor(Math.random() * chars.length)]; return p + "!";
}

/* ----------------------------- Supabase config ----------------------------- */
// 1. Create a free project at https://supabase.com
// 2. Run supabase_setup.sql in the SQL Editor
// 3. Paste your Project URL and anon key below
const SUPABASE_URL = "https://kzwvrvfadfpehrqtitca.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6d3ZydmZhZGZwZWhycXRpdGNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTE0NjUsImV4cCI6MjA5Nzk2NzQ2NX0.ibjLSYYBnu1m4W7QEc5YtbQnWKw5FVJ80NB895l1N2k";
const sb = SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/* ----------------------------- storage adapter ---------------------------- */
const STORAGE_KEY = "dealflow_db";
const SB_KEY = "dealflow_main";
const storage = {
  async load() {
    if (sb) {
      try {
        const { data, error } = await sb.from("app_data").select("value").eq("key", SB_KEY).single();
        if (data && data.value) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data.value)); return data.value; }
      } catch (e) { console.warn("Supabase load failed, using localStorage", e); }
    }
    try { const d = localStorage.getItem(STORAGE_KEY); return d ? JSON.parse(d) : null; } catch (e) { return null; }
  },
  async save(db) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch (e) {}
    if (sb) {
      try {
        await sb.from("app_data").upsert({ key: SB_KEY, value: db, updated_at: new Date().toISOString() }, { onConflict: "key" });
      } catch (e) { console.warn("Supabase save failed", e); }
    }
  },
  async wipe() {
    localStorage.removeItem(STORAGE_KEY);
    if (sb) { try { await sb.from("app_data").delete().eq("key", SB_KEY); } catch (e) {} }
  },
};

/* -------------------------------- model ----------------------------------- */
const HR = 3600 * 1000;
const STAGES = [
  { k: "received", label: "Requirement received", col: "#3a6ea5", sla: 2, owner: "Purchaser", action: "send RFQ" },
  { k: "rfq", label: "RFQ sent", col: "#7d5ba6", sla: 36, owner: "Purchaser", action: "awaiting vendors" },
  { k: "vendor", label: "Vendor quote received", col: "#c98a00", sla: 4, owner: "Purchaser", action: "route to QC" },
  { k: "qc", label: "QC review", col: "#0e8f8f", sla: 24, owner: "QC Team", action: "QC decision" },
  { k: "ready", label: "Ready to quote", col: "#e8742c", sla: 2, owner: "Purchaser", action: "build quote" },
  { k: "approval", label: "Quote approval", col: "#b85716", sla: 4, owner: "Manager", action: "approve quote" },
  { k: "sent", label: "Quotation sent · follow-up", col: "#2f8f5b", sla: null, owner: "Sales", action: "follow up" },
  { k: "order", label: "Order confirmed", col: "#1f9d6b", sla: null, owner: "Sales", action: "fulfil" },
  { k: "closed", label: "Closed", col: "#8a94a0", sla: null, owner: "System", action: "archived" },
];
const STAGE = Object.fromEntries(STAGES.map((s) => [s.k, s]));
const DOC_TYPES = [["coa", "CoA"], ["tds", "TDS"], ["msds", "MSDS"]];
const VENDOR_TIERS = [["primary", "Primary"], ["secondary", "Secondary"], ["other", "Other"], ["temporary", "Temporary"]];
const TIER_COLORS = { primary: { bg: "#e7f5ee", fg: "#127a51" }, secondary: { bg: "#e9f0f8", fg: "#3a6ea5" }, other: { bg: "#eef1f5", fg: "#65727f" }, temporary: { bg: "#fdf0e6", fg: "#b85716" } };
const vendorTier = (v, pid) => (v.productTiers && v.productTiers[pid]) || "other";
const vendorsForProductByTier = (db, pid, tier) => db.vendors.filter((v) => v.active !== false && (v.productIds || []).includes(pid) && vendorTier(v, pid) === tier);
const REQ_ITEMS = [["pricePerKg", "Price / Kg"], ["incoterm", "IncoTerm"], ["packaging", "Packaging"], ["packSize", "Pack Size"], ["qtyPallet", "Qty / Pallet"], ["qtyContainer", "Qty / Container"], ["leadTime", "Lead Time / Availability"], ["hsnCode", "HSN Code"], ["sdsTdsCoa", "SDS / TDS / COA documents"]];
const DEFAULT_ROLES = [
  { id: "role_purchaser", name: "Purchaser", description: "Manages RFQs and vendor quotes" },
  { id: "role_qc", name: "QC Team", description: "Reviews and approves quality documents" },
  { id: "role_sales", name: "Sales", description: "Handles customer quotations and follow-ups" },
  { id: "role_manager", name: "Manager", description: "Oversees operations and reporting" },
  { id: "role_admin", name: "Admin", description: "Full system access and configuration" },
];
const PERM_ACTIONS = [["view", "View"], ["create", "Create"], ["edit", "Edit"], ["delete", "Delete"]];
const ALL_ROLES = ["Purchaser", "Sales", "QC Team", "Manager"];
const DEFAULT_PERMISSIONS = {
  received:  { view: ALL_ROLES, create: ["Purchaser", "Sales"], edit: ["Purchaser", "Sales"], delete: ["Manager", "Admin"] },
  rfq:       { view: ALL_ROLES, create: ["Purchaser"], edit: ["Purchaser"], delete: ["Manager", "Admin"] },
  vendor:    { view: ALL_ROLES, create: ["Purchaser"], edit: ["Purchaser"], delete: ["Manager", "Admin"] },
  qc:        { view: ALL_ROLES, create: ["QC Team"], edit: ["QC Team"], delete: ["Manager", "Admin"] },
  ready:     { view: ALL_ROLES, create: ["Purchaser", "Sales"], edit: ["Purchaser", "Sales"], delete: ["Manager", "Admin"] },
  approval:  { view: ALL_ROLES, create: ["Purchaser", "Sales"], edit: ["Manager"], delete: ["Manager", "Admin"] },
  sent:      { view: ALL_ROLES, create: ["Sales"], edit: ["Sales"], delete: ["Manager", "Admin"] },
  order:     { view: ALL_ROLES, create: ["Sales"], edit: ["Sales"], delete: ["Manager", "Admin"] },
  closed:    { view: ALL_ROLES, create: [], edit: [], delete: ["Manager", "Admin"] },
  vendors:   { view: ALL_ROLES, create: ["Purchaser"], edit: ["Purchaser"], delete: ["Purchaser"] },
  products:  { view: ALL_ROLES, create: ["Purchaser"], edit: ["Purchaser"], delete: ["Purchaser"] },
  users:     { view: ALL_ROLES, create: [], edit: [], delete: [] },
  templates: { view: ALL_ROLES, create: [], edit: [], delete: [] },
  compare:   { view: ALL_ROLES, create: [], edit: [], delete: [] },
};
const PRIORITIES = ["High", "Medium", "Low", "If time permits"];
const PRIORITY_COLORS = { High: { bg: "#fbeaea", fg: "#d4403f" }, Medium: { bg: "#fdf0e6", fg: "#b85716" }, Low: { bg: "#e9f0f8", fg: "#3a6ea5" }, "If time permits": { bg: "#eef1f5", fg: "#65727f" } };
const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2, "If time permits": 3 };
const FU_CADENCE = [1, 3, 5, 7];

/* ------------------------------- helpers ---------------------------------- */
const now = () => Date.now();
const initials = (n) => (n || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const money = (n, cur) => (cur || "₹") + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const curSymbol = (code) => ({ INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "AED ", SGD: "SGD ", JPY: "¥", CNY: "¥" }[code] || (code ? code + " " : "₹"));
const member = (db, id) => db.team.find((m) => m.id === id) || { name: "—" };
const vendor = (db, id) => db.vendors.find((v) => v.id === id) || { name: "—" };
const product = (db, id) => db.products.find((p) => p.id === id) || null;
const vendorProductNames = (db, v) => (v.productIds || []).map((id) => product(db, id) && product(db, id).name).filter(Boolean);
const vendorsForProduct = (db, pid) => db.vendors.filter((v) => v.active !== false && (v.productIds || []).includes(pid));
function vendorsMatchingText(db, txt) {
  const t = (txt || "").toLowerCase().trim();
  if (!t) return [];
  return db.vendors.filter((v) => v.active !== false && vendorProductNames(db, v).some((n) => { const ln = n.toLowerCase(); return t.includes(ln) || ln.includes(t) || ln.split(/\W+/).some((w) => w.length > 3 && t.includes(w)); }));
}
function fmtWhen(t) {
  const d = new Date(t), n = new Date();
  const sameDay = d.toDateString() === n.toDateString();
  return (sameDay ? "today" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function fmtSize(b) { if (!b) return ""; const u = ["B", "KB", "MB"]; let i = 0, n = b; while (n >= 1024 && i < 2) { n /= 1024; i++; } return (n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)) + u[i]; }
function remLabel(rem) {
  const a = Math.abs(rem), h = Math.floor(a / HR), m = Math.floor((a % HR) / 60000);
  const s = h >= 24 ? Math.floor(h / 24) + "d " + (h % 24) + "h" : h >= 1 ? h + "h " + m + "m" : m + "m";
  return rem < 0 ? "+" + s + " over" : s + " left";
}
function slaFor(deal) {
  const st = STAGE[deal.status];
  if (!st || st.sla == null) return { state: "none", label: st && st.k === "sent" ? "ongoing" : "—" };
  const total = st.sla * HR;
  let due;
  if (deal.status === "rfq") {
    const outstanding = deal.rfqs.filter((r) => !r.response).map((r) => r.dueAt);
    due = outstanding.length ? Math.min(...outstanding) : deal.stageAt + total;
  } else due = deal.stageAt + total;
  const rem = due - now();
  const state = rem < 0 ? "brk" : rem < total * 0.25 ? "warn" : "ok";
  return { state, rem, due, label: remLabel(rem) };
}
const isAtRisk = (deal) => { const s = slaFor(deal).state; return s === "brk" || s === "warn"; };
function dealProgress(deal) {
  const total = deal.rfqs.length, got = deal.rfqs.filter((r) => r.response).length;
  const pending = total - got;
  const info = [];
  const warn = [];

  switch (deal.status) {
    case "rfq": case "vendor":
      if (total > 0) info.push(got === total ? `All ${total} quoted` : `${got} of ${total} vendors responded`);
      break;
    case "qc":
      if (pending > 0) warn.push(`${pending} vendor${pending > 1 ? "s" : ""} RFQ pending`);
      break;
    case "ready":
      if (pending > 0) warn.push(`${pending} vendor${pending > 1 ? "s" : ""} RFQ pending`);
      if (got > 1) info.push(`${got} quotes to compare`);
      break;
    case "sent": {
      if (pending > 0) warn.push(`${pending} vendor RFQ pending`);
      const fuDone = deal.followups.filter((f) => f.doneAt).length, fuTotal = deal.followups.length;
      if (fuDone < fuTotal) info.push(`${fuDone} of ${fuTotal} follow-ups done`);
      break;
    }
    default: break;
  }
  return { info, warn };
}
const liveDeals = (db) => db.deals.filter((d) => d.status !== "closed");
const brandLabel = (db, deal) => { const p = deal.productId ? product(db, deal.productId) : null; return p && p.brandName ? p.brandName : null; };
const productWithBrand = (db, deal) => { const bl = brandLabel(db, deal); return bl ? `${deal.products} (${bl})` : deal.products; };

const EMAIL_CLIENTS = [["mailto", "Default (desktop app)"], ["outlook", "Outlook Web"], ["gmail", "Gmail"]];
function buildEmailUrl(client, to, subject, body) {
  const t = encodeURIComponent(to || "");
  const s = encodeURIComponent(subject || "");
  const b = encodeURIComponent(body || "");
  switch (client) {
    case "outlook": return `https://outlook.office.com/mail/deeplink/compose?to=${t}&subject=${s}&body=${b}`;
    case "gmail": return `https://mail.google.com/mail/?view=cm&to=${t}&su=${s}&body=${b}`;
    default: return `mailto:${t}?subject=${s}&body=${b}`;
  }
}
function copyEmailToClipboard(subject, body, toast) {
  const text = `Subject: ${subject}\n\n${body}`;
  navigator.clipboard.writeText(text).then(() => toast("Email copied to clipboard")).catch(() => toast("Copy failed", 1));
}

function evalExpr(raw) {
  const s = String(raw || "").trim();
  if (!s) return 0;
  if (/^[\d.+\-*/() ]+$/.test(s)) { try { const v = Function('"use strict"; return (' + s + ')')(); return typeof v === "number" && isFinite(v) ? v : 0; } catch (e) { return 0; } }
  return parseFloat(s) || 0;
}

const MAX_EMBED = 1.5 * 1024 * 1024;
function readFiles(fileList) {
  return Promise.all([...(fileList || [])].map((f) => new Promise((res) => {
    const meta = { name: f.name, size: f.size, type: f.type, addedAt: now(), stored: false };
    if (f.size > MAX_EMBED) { res(meta); return; }
    const r = new FileReader();
    r.onload = () => res({ ...meta, stored: true, data: r.result });
    r.onerror = () => res(meta);
    r.readAsDataURL(f);
  })));
}
function ensureProduct(db, name, brandName) {
  name = (name || "").trim(); if (!name) return null;
  const ex = db.products.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (ex) { if (brandName && !ex.brandName) ex.brandName = brandName; return ex.id; }
  const p = { id: "p" + now() + Math.floor(Math.random() * 1000), name, brandName: brandName || "" };
  db.products.push(p); return p.id;
}

/* --------------------------------- seed ----------------------------------- */
function seed() {
  const team = [
    { id: "u1", name: "Purchaser 1", roles: ["Purchaser"], loginEmail: "purchaser1@infinitee.in" },
    { id: "u2", name: "Purchaser 2", roles: ["Purchaser"], loginEmail: "purchaser2@infinitee.in" },
    { id: "u3", name: "Sales 1", roles: ["Sales"], loginEmail: "sales1@infinitee.in" },
    { id: "u4", name: "Sales 2", roles: ["Purchaser", "Sales"], loginEmail: "sales2@infinitee.in" },
    { id: "u5", name: "QC Manager", roles: ["QC Team"], loginEmail: "qc@infinitee.in" },
    { id: "u6", name: "Manager", roles: ["Manager"], loginEmail: "manager@infinitee.in" },
    { id: "u7", name: "Admin", roles: ["Admin"], loginEmail: "admin@infinitee.in" },
  ];
  const products = [];
  const vendors = [];
  const deals = [];
  const emailTemplates = [
    { id: "tpl_new", name: "New vendor", type: "new", subject: "RFQ — {{product}} — {{quantity}}", body: "Dear {{vendor_name}},\n\nWe are {{customer}}. We are reaching out to you for the first time regarding a quotation for the following product:\n\nProduct: {{product}}\nQuantity: {{quantity}}\n{{details}}\n\n{{required_items}}\n\n{{additional_info}}\n\nWe look forward to establishing a business relationship with you. Please send your quotation at the earliest.\n\nRegards" },
    { id: "tpl_existing", name: "Existing vendor", type: "existing", subject: "RFQ — {{product}} — {{quantity}}", body: "Dear {{vendor_name}},\n\nWe would like to request a quotation for the following:\n\nProduct: {{product}}\nQuantity: {{quantity}}\n{{details}}\n\n{{required_items}}\n\n{{additional_info}}\n\nPlease send your quotation at the earliest.\n\nRegards" },
    { id: "tpl_cust_new", name: "New customer quotation", type: "new_customer", subject: "Quotation — {{product}} — {{quantity}}", body: "Dear {{customer}},\n\nThank you for your enquiry. We are pleased to submit our quotation for your consideration:\n\n{{details}}\n\nWe look forward to doing business with you. Please feel free to reach out for any clarifications.\n\nBest regards" },
    { id: "tpl_cust_existing", name: "Existing customer quotation", type: "existing_customer", subject: "Quotation — {{product}} — {{quantity}}", body: "Dear {{customer}},\n\nThank you for your continued business. Please find our quotation below:\n\n{{details}}\n\nAs always, we are happy to discuss terms. Looking forward to your confirmation.\n\nBest regards" },
    { id: "tpl_fu_first", name: "1st follow-up", type: "followup_first", subject: "Follow-up: Quotation — {{product}}", body: "Dear {{customer}},\n\nI hope this message finds you well. I am writing to follow up on our quotation for {{product}} ({{quantity}}) sent recently.\n\nWe would be happy to discuss any questions or adjustments you may need. Please let us know how you would like to proceed.\n\nLooking forward to hearing from you.\n\nBest regards" },
    { id: "tpl_fu_subsequent", name: "Subsequent follow-up", type: "followup_subsequent", subject: "Follow-up: Quotation — {{product}}", body: "Dear {{customer}},\n\nI am following up once again regarding our quotation for {{product}} ({{quantity}}).\n\nIf there are any concerns about pricing, terms, or specifications, we are open to discussing them. We value the opportunity to work with you and would appreciate an update on your decision.\n\nPlease do not hesitate to reach out.\n\nBest regards" },
  ];
  const permissions = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
  const roles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
  const coaTemplate = { headerImg: "", footerImg: "", signatureImg: "", approvedByName: "", revision: "" };
  const loginAccounts = SEED_ACCOUNTS.map((a) => ({ ...a }));
  const stageEmailTemplates = STAGES.filter((s) => s.owner !== "System").map((s) => ({
    stageKey: s.k,
    enabled: true,
    subject: `[DealFlow] {{deal_id}} moved to ${s.label} — {{product}}`,
    body: `Hi,\n\nDeal {{deal_id}} has moved to "${s.label}" and needs your attention.\n\nCustomer: {{customer}}\nProduct: {{product}}\nQuantity: {{quantity}}\nAction needed: {{action}}\n\nPlease log in to DealFlow to take action.\n\nRegards\n{{user}}`,
  }));
  return { meta: { version: 2, seeded: true }, team, products, vendors, deals, emailTemplates, stageEmailTemplates, permissions, roles, seq: 1, groupSeq: 1, deletedDeals: [], coaTemplate, loginAccounts };
}
function migrate(db) {
  if (!db.products) {
    db.products = [];
    db.vendors.forEach((v) => { v.productIds = (v.products || "").split(",").map((s) => { const n = s.trim(); if (!n) return null; let p = db.products.find((x) => x.name.toLowerCase() === n.toLowerCase()); if (!p) { p = { id: "p" + db.products.length + "_" + (now() % 100000), name: n }; db.products.push(p); } return p.id; }).filter(Boolean); delete v.products; });
  }
  db.products = db.products || [];
  db.products.forEach((p) => { if (!("brandName" in p)) p.brandName = ""; if (!("active" in p)) p.active = true; });
  db.vendors.forEach((v) => { if (!v.productIds) v.productIds = []; if (!v.productTiers) v.productTiers = {}; if (!("email" in v)) v.email = ""; if (!("active" in v)) v.active = true; if (!("contactPerson" in v)) v.contactPerson = ""; });
  db.deals.forEach((d) => {
    if (d.productId === undefined) { const p = db.products.find((p) => p.name.toLowerCase() === (d.products || "").toLowerCase()); d.productId = p ? p.id : null; }
    if (!("specFiles" in d)) d.specFiles = [];
    if (!("rfqTerms" in d)) d.rfqTerms = null;
    if (!("contactPerson" in d)) d.contactPerson = "";
    if (!("contactPhone" in d)) d.contactPhone = "";
    if (!("contactEmail" in d)) d.contactEmail = "";
    if (!Array.isArray(d.restrictions)) d.restrictions = [];
    if (!d.priority) d.priority = "Medium";
    if (!("groupId" in d)) d.groupId = null;
    if (!d.vendorQc) d.vendorQc = {};
  });
  if (!db.coaTemplate) db.coaTemplate = { headerImg: "", footerImg: "", signatureImg: "", approvedByName: "", revision: "" };
  if (!db.loginAccounts || !db.loginAccounts.length) { db.loginAccounts = SEED_ACCOUNTS.map((a) => ({ ...a })); }
  else { SEED_ACCOUNTS.forEach((seed) => { if (!db.loginAccounts.find((a) => a.teamMemberId === seed.teamMemberId)) { db.loginAccounts.push({ ...seed }); } }); }
  if (!db.emailTemplates) {
    db.emailTemplates = [
      { id: "tpl_new", name: "New vendor", type: "new", subject: "RFQ — {{product}} — {{quantity}}", body: "Dear {{vendor_name}},\n\nWe are {{customer}}. We are reaching out to you for the first time regarding a quotation for the following product:\n\nProduct: {{product}}\nQuantity: {{quantity}}\n{{details}}\n\n{{required_items}}\n\n{{additional_info}}\n\nWe look forward to establishing a business relationship with you. Please send your quotation at the earliest.\n\nRegards" },
      { id: "tpl_existing", name: "Existing vendor", type: "existing", subject: "RFQ — {{product}} — {{quantity}}", body: "Dear {{vendor_name}},\n\nWe would like to request a quotation for the following:\n\nProduct: {{product}}\nQuantity: {{quantity}}\n{{details}}\n\n{{required_items}}\n\n{{additional_info}}\n\nPlease send your quotation at the earliest.\n\nRegards" },
    ];
  }
  if (!db.permissions) db.permissions = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
  if (!db.roles) db.roles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
  if (!db.archivedDeals) {
    db.archivedDeals = [];
    (db.deletedDeals || []).forEach((d) => {
      db.archivedDeals.push({ ...d, archiveReason: "deleted", archivedAt: d.deletedAt || now(), archivedBy: d.deletedBy, archiveNote: d.deleteReason || "" });
    });
    db.deals.filter((d) => d.status === "closed").forEach((d) => {
      db.archivedDeals.push({ ...d, log: [...(d.log || [])], archiveReason: (d.closed && d.closed.result) || "closed", archivedAt: d.stageAt || (d.closed && d.closed.at) || now(), archivedBy: d.ownerId, archiveNote: (d.closed && d.closed.reason) || "" });
    });
    db.deals = db.deals.filter((d) => d.status !== "closed");
    db.deletedDeals = [];
  }
  if (!db.stageEmailTemplates) {
    db.stageEmailTemplates = STAGES.filter((s) => s.owner !== "System").map((s) => ({
      stageKey: s.k,
      enabled: true,
      subject: `[DealFlow] {{deal_id}} moved to ${s.label} — {{product}}`,
      body: `Hi,\n\nDeal {{deal_id}} has moved to "${s.label}" and needs your attention.\n\nCustomer: {{customer}}\nProduct: {{product}}\nQuantity: {{quantity}}\nAction needed: {{action}}\n\nPlease log in to DealFlow to take action.\n\nRegards\n{{user}}`,
    }));
  } else {
    db.stageEmailTemplates.forEach((t) => { if (!("enabled" in t)) t.enabled = true; });
  }
  db.team.forEach((u) => { if (!u.roles) u.roles = u.role ? [u.role] : []; if (!u.emailClient) u.emailClient = "mailto"; if (!("loginEmail" in u)) u.loginEmail = ""; if (!("mobile" in u)) u.mobile = ""; if (!("signatureImg" in u)) u.signatureImg = ""; });
  Object.keys(DEFAULT_PERMISSIONS).forEach((area) => { if (db.permissions[area]) { Object.keys(DEFAULT_PERMISSIONS[area]).forEach((action) => { if (!db.permissions[area][action]) db.permissions[area][action] = DEFAULT_PERMISSIONS[area][action]; }); } });
  return db;
}

/* ------------------------------- context ---------------------------------- */
const Store = createContext(null);
const useStore = () => useContext(Store);

/* ---------------------------- tiny UI helpers ----------------------------- */
const slaCls = { ok: "ok", warn: "warn", brk: "brk", none: "none" };
function Sla({ s, style }) {
  if (!s) return null;
  return <span className={"sla " + slaCls[s.state]} style={style}><span className="pip" />{s.label}</span>;
}
const Avatar = ({ name }) => <span className="av">{initials(name)}</span>;
function SpecFiles({ files }) {
  if (!files || !files.length) return <span style={{ color: "var(--muted-2)" }}>none attached</span>;
  return <>{files.map((f, i) => {
    const inner = <>
      <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "none" }}><path d="M21 12.5L12 21a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3l7.5-7.5" /></svg>
      {f.name} <span style={{ color: "var(--muted-2)", fontSize: 11 }}>{fmtSize(f.size)}</span>
    </>;
    const base = { display: "inline-flex", alignItems: "center", gap: 5, margin: "0 8px 5px 0", fontSize: 12.5, fontWeight: 500 };
    return f.stored
      ? <a key={i} href={f.data} download={f.name} target="_blank" rel="noopener noreferrer" style={base}>{inner}</a>
      : <span key={i} title="Reference only in this preview — wired to your file store in production" style={{ ...base, color: "var(--muted)" }}>{inner}</span>;
  })}</>;
}

/* --------------------------------- modal ---------------------------------- */
function Modal({ title, children, okLabel, onOk, onClose }) {
  const [busy, setBusy] = useState(false);
  const click = async () => { setBusy(true); let r; try { r = await onOk(); } finally { setBusy(false); } if (r !== false) onClose(); };
  return (
    <div className="modal-scrim show" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head"><h3>{title}</h3><button className="x" onClick={onClose}>×</button></div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={click}>{okLabel}</button></div>
      </div>
    </div>
  );
}
const Note = ({ children }) => <div className="note"><span className="ic">⚠</span><div>{children}</div></div>;
function EmailDraftBtn({ to, subject, body, opened, onOpened, label }) {
  const { loggedInUser, toast } = useStore();
  const client = loggedInUser ? loggedInUser.emailClient || "mailto" : "mailto";
  const open = () => { window.open(buildEmailUrl(client, to, subject, body), "_blank"); if (onOpened) onOpened(); };
  const copy = () => copyEmailToClipboard(subject, body, toast);
  if (opened) return <span className="tag" style={{ background: "var(--ok-soft)", color: "#127a51", whiteSpace: "nowrap" }}>Draft opened</span>;
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <button className="btn primary sm" style={{ whiteSpace: "nowrap" }} onClick={open}>{label || "Open email draft"}</button>
      <button className="btn ghost sm" title="Copy email to clipboard" style={{ padding: "5px 7px" }} onClick={copy}><svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg></button>
    </span>
  );
}
const Empty = ({ big, sub }) => <div className="panel empty"><div className="big">{big}</div><div>{sub}</div></div>;

/* ================================ ROOT ==================================== */
export default function DealFlow() {
  const dbRef = useRef(null);
  const [, bump] = useState(0);
  const rerender = () => bump((x) => x + 1);
  const [ready, setReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState("board");
  const [loggedInUserId, setLoggedInUserId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [openTab, setOpenTab] = useState("current");
  const [modal, setModal] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [sidebar, setSidebar] = useState(false);
  const toastTimer = useRef(null);

  useEffect(() => { (async () => {
    const authUser = await checkAuth();
    if (authUser) setLoggedInUserId(authUser.teamMemberId);
    setAuthChecked(true);
  })(); }, []);

  useEffect(() => {
    if (!loggedInUserId || !authChecked) return;
    (async () => {
      let db = await storage.load();
      if (db && db.deals) {
        migrate(db);
      } else {
        const check = await storage.load();
        if (check && check.deals) {
          db = check; migrate(db);
        } else {
          db = seed(); migrate(db); await storage.save(db);
        }
      }
      dbRef.current = db; setReady(true);
    })();
  }, [loggedInUserId, authChecked]);
  useEffect(() => { const t = setInterval(rerender, 30000); return () => clearInterval(t); }, []);

  const db = dbRef.current;
  const commit = () => { storage.save(dbRef.current); rerender(); };
  const toast = (msg, warn) => { setToastMsg({ msg, warn }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToastMsg(null), 2400); };
  const openDeal = (id, tab = "current") => { setOpenId(id); setOpenTab(tab); };
  const closeDrawer = () => setOpenId(null);
  const openModal = (m) => setModal(m);
  const closeModal = () => setModal(null);
  const loggedInUser = db ? db.team.find((u) => u.id === loggedInUserId) : null;
  const userRoles = loggedInUser ? (loggedInUser.roles || []) : [];
  const role = userRoles.join(", ");
  const canDo = (area, action) => {
    if (userRoles.includes("Admin")) return true;
    const perms = db && db.permissions && db.permissions[area];
    if (!perms) return false;
    return (perms[action] || []).some((r) => userRoles.includes(r));
  };
  const isManager = userRoles.includes("Manager") || userRoles.includes("Admin");
  const canActOnDeal = (deal, stage, action) => {
    if (!canDo(stage || deal.status, action)) return false;
    if (userRoles.includes("Admin")) return true;
    if (userRoles.includes("Manager")) return true;
    const roleBasedStages = ["qc", "approval"];
    if (roleBasedStages.includes(deal.status)) return true;
    return deal.ownerId === loggedInUserId;
  };
  const canReassign = (deal) => deal.status !== "closed" && (isManager || deal.ownerId === loggedInUserId);
  const logout = () => { setToken(null); setLoggedInUserId(null); setReady(false); };
  const logEvent = (deal, action, who = role) => deal.log.unshift({ at: now(), who, action });
  const renderStageTemplate = (tplStr, deal, stage, user) => {
    const vars = {
      "{{deal_id}}": deal.id,
      "{{stage}}": stage.label,
      "{{customer}}": deal.customer,
      "{{product}}": deal.products,
      "{{quantity}}": `${deal.qty} ${deal.unit || ""}`.trim(),
      "{{action}}": stage.action,
      "{{user}}": (user && user.name) || "",
      "{{user_email}}": (user && user.loginEmail) || "",
      "{{user_mobile}}": (user && user.mobile) || "",
    };
    return Object.entries(vars).reduce((s, [k, v]) => s.split(k).join(v || ""), tplStr);
  };
  const notifyStageOwner = (deal, toStage) => {
    const stage = STAGE[toStage];
    if (!stage || stage.owner === "System") return;
    const recipients = db.team.filter(u => u.loginEmail && (u.roles || []).includes(stage.owner) && u.id !== loggedInUserId);
    if (!recipients.length) return;
    const to = recipients.map(r => r.loginEmail).join(",");
    const tpl = (db.stageEmailTemplates || []).find(t => t.stageKey === toStage);
    if (tpl && tpl.enabled === false) return;
    const subject = tpl ? renderStageTemplate(tpl.subject, deal, stage, loggedInUser) : `[DealFlow] ${deal.id} moved to ${stage.label} — ${deal.products}`;
    const body = tpl ? renderStageTemplate(tpl.body, deal, stage, loggedInUser) : `Hi,\n\nDeal ${deal.id} has moved to "${stage.label}".\n\nCustomer: ${deal.customer}\nProduct: ${deal.products}\nAction: ${stage.action}\n\nRegards`;
    const client = loggedInUser ? loggedInUser.emailClient || "mailto" : "mailto";
    window.open(buildEmailUrl(client, to, subject, body), "_blank");
  };
  const nextId = () => { const v = db.seq || db.deals.length + 1; db.seq = v + 1; return "DL-" + String(v).padStart(4, "0"); };
  const nextGroupId = () => { const v = db.groupSeq || 1; db.groupSeq = v + 1; return "GRP-" + String(v).padStart(4, "0"); };

  const actions = {
    createGroupId() { return nextGroupId(); },
    createDeal(data) {
      const intake = "Enquiry received via " + data.channel + (data.specFiles.length ? ` · ${data.specFiles.length} spec file(s) attached` : "");
      const d = { id: nextId(), ...data, status: "received", createdAt: now(), stageAt: now(), rfqs: [], qc: null, quote: null, followups: [], order: null, closed: null, rfqTerms: null, log: [{ at: now(), who: "Sales", action: intake }] };
      db.deals.unshift(d); commit(); toast("Deal " + d.id + " created"); openDeal(d.id);
    },
    sendRFQ(deal, { terms, picks, hrs }) {
      deal.rfqTerms = terms;
      picks.forEach((vid) => {
        const existing = deal.rfqs.find((r) => r.vendorId === vid);
        if (existing) { existing.sentAt = now(); existing.dueAt = now() + hrs * HR; }
        else { deal.rfqs.push({ vendorId: vid, sentAt: now(), dueAt: now() + hrs * HR, response: null }); }
      });
      deal.status = "rfq"; deal.stageAt = now();
      logEvent(deal, `RFQ sent to ${picks.length} vendor(s) · ${terms.qty || ""} ${terms.incoterm || ""} · ${hrs}h deadline`);
      commit(); toast("RFQ sent to " + picks.length + " vendor(s)"); notifyStageOwner(deal, "rfq");
    },
    addRFQVendors(deal, { picks, hrs }) {
      picks.forEach((vid) => deal.rfqs.push({ vendorId: vid, sentAt: now(), dueAt: now() + hrs * HR, response: null }));
      logEvent(deal, `Additional RFQ sent to ${picks.length} vendor(s) · ${hrs}h deadline`);
      commit(); toast("RFQ sent to " + picks.length + " additional vendor(s)");
    },
    removeRFQVendor(deal, vid, reason) {
      deal.rfqs = deal.rfqs.filter((r) => r.vendorId !== vid);
      logEvent(deal, `Vendor removed from RFQ — ${vendor(db, vid).name}` + (reason ? ": " + reason : ""));
      commit(); toast("Vendor removed from RFQ");
    },
    recordQuote(deal, vid, resp) {
      const r = deal.rfqs.find((x) => x.vendorId === vid); r.response = resp;
      const nd = (resp.attachments || []).length;
      const cur = resp.currency === "INR" || !resp.currency ? "₹" : resp.currency + " ";
      logEvent(deal, `Vendor quote logged — ${vendor(db, vid).name} @ ${cur}${resp.price}/kg${nd ? ` · ${nd} doc(s)` : ""}`);
      commit(); toast("Quote logged" + (nd ? ` · ${nd} doc(s) attached` : ""));
    },
    moveStage(deal, to, txt) { deal.status = to; deal.stageAt = now(); logEvent(deal, txt); commit(); toast(STAGE[to].label); notifyStageOwner(deal, to); },
    sendBack(deal, reason) {
      const idx = STAGES.findIndex((s) => s.k === deal.status);
      if (idx <= 0) return;
      const prev = STAGES[idx - 1].k;
      deal.status = prev; deal.stageAt = now();
      logEvent(deal, "Sent back to " + STAGE[prev].label + " for correction" + (reason ? ": " + reason : ""));
      commit(); toast("Sent back to " + STAGE[prev].label); notifyStageOwner(deal, prev);
    },
    doQC(deal, { vendorId, result, checklist, notes, files }) {
      if (!deal.vendorQc) deal.vendorQc = {};
      const vName = vendorId ? vendor(db, vendorId).name : "all";
      deal.vendorQc[vendorId || "_all"] = { result, checklist, notes, files, reviewerId: loggedInUserId || (db.team[0] && db.team[0].id), reviewedAt: now() };
      deal.qc = { result, checklist, notes, files, reviewerId: loggedInUserId || (db.team[0] && db.team[0].id), reviewedAt: now() };
      if (result === "rejected") { deal.status = "rfq"; deal.stageAt = now(); logEvent(deal, "QC rejected — " + vName + (notes ? ": " + notes : "")); toast("Rejected — back to sourcing"); commit(); notifyStageOwner(deal, "rfq"); }
      else { deal.status = "ready"; deal.stageAt = now(); logEvent(deal, "QC " + (result === "deviation" ? "approved with deviations" : "approved") + " — " + vName + (notes ? ": " + notes : "")); toast("QC " + (result === "deviation" ? "approved w/ deviation" : "approved")); commit(); notifyStageOwner(deal, "ready"); }

    },
    submitForApproval(deal, { draft, terms }) {
      deal.pendingQuote = { ...draft, terms, submittedAt: now(), submittedBy: loggedInUserId };
      deal.quoteApproval = null;
      deal.status = "approval"; deal.stageAt = now();
      logEvent(deal, `Quote submitted for approval — ${money(draft.total, draft.currency)}`);
      commit(); toast("Quote submitted for manager approval"); notifyStageOwner(deal, "approval");
    },
    approveQuote(deal, notes) {
      deal.quoteApproval = { status: "approved", by: loggedInUserId, at: now(), notes: notes || "" };
      logEvent(deal, "Quote approved" + (notes ? ": " + notes : ""));
      commit(); toast("Quote approved — ready to send to customer");
    },
    rejectQuote(deal, reason) {
      deal.quoteApproval = { status: "rejected", by: loggedInUserId, at: now(), notes: reason };
      deal.status = "ready"; deal.stageAt = now();
      logEvent(deal, "Quote rejected — " + (reason || "no reason given"));
      commit(); toast("Quote rejected — returned to quote builder"); notifyStageOwner(deal, "ready");
    },
    sendQuote(deal) {
      deal.quote = { ...deal.pendingQuote, sentAt: now() };
      deal.followups = FU_CADENCE.map((day, i) => ({ id: "f" + now() + i, dueAt: now() + day * 24 * HR, doneAt: null, note: "", outcome: "" }));
      deal.status = "sent"; deal.stageAt = now();
      logEvent(deal, `Quotation sent to customer — ${money(deal.quote.total, deal.quote.currency)}`);
      commit(); toast("Quotation sent · follow-ups scheduled"); notifyStageOwner(deal, "sent");
    },
    logFollowup(deal, fid, { outcome, note }) {
      const f = deal.followups.find((x) => x.id === fid); f.doneAt = now(); f.outcome = outcome; f.note = note;
      if (!deal.followups.some((x) => !x.doneAt)) deal.followups.push({ id: "f" + now(), dueAt: now() + 7 * 24 * HR, doneAt: null, note: "", outcome: "" });
      logEvent(deal, "Follow-up logged: " + outcome); commit(); toast("Follow-up logged");
    },
    closeDeal(deal, { result, reason }) {
      deal.closed = { result, reason: reason || (result === "won" ? "Order confirmed" : "No reason given"), at: now() };
      deal.status = "closed"; deal.stageAt = now();
      logEvent(deal, "Closed — " + (result === "won" ? "Won" : "Lost"));
      notifyStageOwner(deal, "closed");
      if (!db.archivedDeals) db.archivedDeals = [];
      db.archivedDeals.unshift({ ...deal, log: [...deal.log], archiveReason: result, archivedAt: now(), archivedBy: loggedInUserId, archiveNote: reason || "" });
      db.deals = db.deals.filter((d) => d.id !== deal.id);
      closeDrawer(); commit(); toast("Deal closed — " + (result === "won" ? "Won" : "Lost"));
    },
    deleteDeal(dealId, reason) {
      const deal = db.deals.find((d) => d.id === dealId);
      if (!deal) return;
      if (!db.archivedDeals) db.archivedDeals = [];
      db.archivedDeals.unshift({ ...deal, log: [...deal.log], archiveReason: "deleted", archivedAt: now(), archivedBy: loggedInUserId, archiveNote: reason || "" });
      db.deals = db.deals.filter((d) => d.id !== dealId);
      closeDrawer(); commit(); toast("Deal " + dealId + " archived");
    },
    reassign(deal, ownerId) { if (ownerId !== deal.ownerId) { logEvent(deal, "Reassigned to " + member(db, ownerId).name); deal.ownerId = ownerId; } commit(); toast("Owner updated"); },
    saveVendor(existing, data) {
      if (existing) { Object.assign(existing, data); commit(); toast("Vendor updated"); return existing.id; }
      else { if (!data.productTiers) data.productTiers = {}; const v = { id: "v" + now(), ...data }; db.vendors.push(v); commit(); toast("Vendor added"); return v.id; }
    },
    promoteVendor(vendorId, pid, newTier) {
      const v = db.vendors.find((x) => x.id === vendorId);
      if (!v) return;
      if (!v.productTiers) v.productTiers = {};
      v.productTiers[pid] = newTier;
      commit(); toast(v.name + " → " + newTier);
    },
    deleteVendor(vendorId) {
      const v = db.vendors.find((x) => x.id === vendorId);
      if (!v) return;
      const inUse = db.deals.some((d) => d.rfqs.some((r) => r.vendorId === vendorId));
      if (inUse) { v.active = false; logEvent(null, "Vendor deactivated: " + v.name); }
      else { db.vendors = db.vendors.filter((x) => x.id !== vendorId); }
      commit(); toast(inUse ? v.name + " deactivated (has RFQ history)" : v.name + " deleted");
    },
    mergeVendors(keepId, removeId) {
      const keep = db.vendors.find((x) => x.id === keepId);
      const remove = db.vendors.find((x) => x.id === removeId);
      if (!keep || !remove) return;
      (remove.productIds || []).forEach((pid) => {
        if (!(keep.productIds || []).includes(pid)) { keep.productIds = [...(keep.productIds || []), pid]; }
        if (!keep.productTiers) keep.productTiers = {};
        if (!keep.productTiers[pid] && remove.productTiers && remove.productTiers[pid]) keep.productTiers[pid] = remove.productTiers[pid];
      });
      if (remove.email && !keep.email) keep.email = remove.email;
      db.deals.forEach((d) => { d.rfqs.forEach((r) => { if (r.vendorId === removeId) r.vendorId = keepId; }); });
      db.vendors = db.vendors.filter((x) => x.id !== removeId);
      commit(); toast("Merged " + remove.name + " into " + keep.name);
    },
    saveUser(existing, data) {
      if (existing) Object.assign(existing, data);
      else db.team.push({ id: "u" + now(), ...data });
      commit(); toast(existing ? "User updated" : "User added");
    },
    async deleteUser(userId) {
      const inUse = db.deals.some((d) => d.ownerId === userId);
      if (inUse) { toast("Cannot delete — user is assigned to deals", 1); return false; }
      db.team = db.team.filter((u) => u.id !== userId);
      commit(); toast("User removed"); return true;
    },
    addProduct(name, brandName) { if (db.products.some((p) => p.name.toLowerCase() === name.toLowerCase())) { toast("Already in catalog", 1); return false; } ensureProduct(db, name, brandName); commit(); toast("Product added"); return true; },
    importRows(text) {
      let nv = 0, uv = 0, lines = 0; const before = db.products.length;
      const validTiers = { primary: "primary", secondary: "secondary", other: "other", temporary: "temporary" };
      const rows = text.split(/\r?\n/);
      const firstRow = (rows[0] || "").toLowerCase();
      const hasHeader = firstRow.includes("product") && firstRow.includes("vendor");
      const hasEmail = hasHeader && firstRow.includes("email");
      (hasHeader ? rows.slice(1) : rows).forEach((line) => {
        line = line.trim(); if (!line) return;
        const parts = line.split(",").map((s) => s.trim());
        if (parts.length < 2) return;
        const prodName = parts[0]; const vendorName = parts[1];
        if (!prodName || !vendorName) return;
        let vendorEmail, tierRaw, brand;
        if (hasEmail || parts.length >= 5) {
          vendorEmail = (parts[2] || "").trim();
          tierRaw = (parts[3] || "other").toLowerCase().trim();
          brand = (parts[4] || "").trim();
        } else {
          vendorEmail = "";
          tierRaw = (parts[2] || "other").toLowerCase().trim();
          brand = (parts[3] || "").trim();
        }
        const tier = validTiers[tierRaw] || "other";
        lines++;
        const pid = ensureProduct(db, prodName, brand);
        if (!pid) return;
        let v = db.vendors.find((x) => x.name.toLowerCase() === vendorName.toLowerCase());
        if (v) {
          if (!v.productIds) v.productIds = [];
          if (!v.productTiers) v.productTiers = {};
          if (!v.productIds.includes(pid)) v.productIds.push(pid);
          v.productTiers[pid] = tier;
          if (vendorEmail && !v.email) v.email = vendorEmail;
          uv++;
        } else {
          db.vendors.push({ id: "v" + now() + "_" + nv, name: vendorName, email: vendorEmail, rating: 4, avgResp: 24, productIds: [pid], productTiers: { [pid]: tier } });
          nv++;
        }
      });
      commit();
      return { nv, uv, np: db.products.length - before, lines };
    },
    saveTemplate(existing, data) {
      if (existing) Object.assign(existing, data);
      else { db.emailTemplates.push({ id: "tpl_" + now(), ...data }); }
      commit(); toast(existing ? "Template updated" : "Template added");
    },
    deleteTemplate(tplId) {
      db.emailTemplates = db.emailTemplates.filter((t) => t.id !== tplId);
      commit(); toast("Template deleted");
    },
    saveStageTemplate(stageKey, data) {
      if (!db.stageEmailTemplates) db.stageEmailTemplates = [];
      const existing = db.stageEmailTemplates.find((t) => t.stageKey === stageKey);
      if (existing) Object.assign(existing, data);
      else db.stageEmailTemplates.push({ stageKey, ...data });
      commit(); toast("Stage email updated");
    },
    saveStageDraft(deal, stageKey, data) {
      if (!deal.stageDrafts) deal.stageDrafts = {};
      deal.stageDrafts[stageKey] = data;
      commit(); toast("Draft saved");
    },
    requestDeleteDeal(deal, reason) {
      deal.deleteRequest = { requestedBy: loggedInUserId, requestedAt: now(), reason };
      logEvent(deal, "Requested deletion: " + reason);
      commit(); toast("Deletion request sent to manager");
    },
    denyDeleteRequest(deal) {
      delete deal.deleteRequest;
      logEvent(deal, "Deletion request denied by manager");
      commit(); toast("Deletion request denied");
    },
    savePermissions(perms) {
      db.permissions = perms;
      commit(); toast("Access control updated");
    },
    saveRole(existing, data) {
      if (existing) Object.assign(existing, data);
      else db.roles.push({ id: "role_" + now(), ...data });
      commit(); toast(existing ? "Role updated" : "Role added");
    },
    deleteRole(roleId) {
      const r = db.roles.find((x) => x.id === roleId);
      if (!r) return false;
      if (r.name === "Admin") { toast("Cannot delete the Admin role", 1); return false; }
      const inUse = db.team.some((u) => (u.roles || []).includes(r.name));
      if (inUse) { toast("Cannot delete — role is assigned to users", 1); return false; }
      db.roles = db.roles.filter((x) => x.id !== roleId);
      commit(); toast("Role deleted"); return true;
    },
    async resetDemo() { await storage.wipe(); const fresh = seed(); migrate(fresh); dbRef.current = fresh; await storage.save(fresh); closeDrawer(); rerender(); toast("Demo data reset"); },
  };

  if (!authChecked) return <div className="dealflow"><style>{CSS}</style><div style={{ padding: 40, color: "#65727f" }}>Loading…</div></div>;
  if (!loggedInUserId) return <div className="dealflow"><style>{CSS}</style><LoginPage onLogin={(teamMemberId, token) => { setToken(token); setLoggedInUserId(teamMemberId); }} /></div>;
  if (!ready) return <div className="dealflow"><style>{CSS}</style><div style={{ padding: 40, color: "#65727f" }}>Loading…</div></div>;

  const risk = liveDeals(db).filter(isAtRisk).length;
  const ctx = { db, role, loggedInUser, canDo, canActOnDeal, canReassign, isManager, logout, toast, openDeal, closeDrawer, openModal, closeModal, actions, commit };
  const titles = {
    board: ["Pipeline", "Every live deal, by stage"], deals: ["All deals", "The full book, searchable"],
    qc: ["QC review queue", "Documents waiting to be vetted"], followups: ["Follow-ups", "Tasks chasing a customer decision"], approvals: ["Quote approvals", "Quotations waiting for manager sign-off"], pendingrfqs: ["Pending RFQs", "Vendor quotes still awaited across all stages"],
    users: ["User master", "Manage your team members for deal assignment"],
    reports: ["Reports", "How the operation is performing"], catalog: ["Products", "Products and the vendors who supply them"],
    vendors: ["Vendors", "Your approved supplier base"],
    templates: ["Email templates", "Configure RFQ email drafts for new and existing vendors"],
    stageemails: ["Stage change emails", "Configure notification emails sent when deals move between stages"],
    coatemplate: ["CoA template", "Configure Infinitee CoA letterhead, signature, and footer"],
    accesscontrol: ["Access control", "Configure role-based permissions for each stage"],
    roles: ["Roles", "Manage roles that can be assigned to users"],
    sop: ["SOP / User guide", "Standard operating procedures for each role"],
  };
  const Views = { board: BoardView, deals: DealsView, qc: QCView, followups: FollowupsView, approvals: ApprovalsView, pendingrfqs: PendingRfqsView, users: UsersView, reports: ReportsView, catalog: CatalogView, vendors: VendorsView, templates: EmailTemplatesView, stageemails: StageEmailTemplatesView, coatemplate: CoaTemplateView, accesscontrol: AccessControlView, roles: RolesView, sop: SOPView };
  const View = Views[view];

  return (
    <Store.Provider value={ctx}>
      <div className="dealflow">
        <style>{CSS}</style>
        <div className="app">
          <Sidebar view={view} setView={(v) => { setView(v); setSidebar(false); }} open={sidebar} onReset={() => { if (window.confirm("Reset all data back to the demo set? This cannot be undone.")) actions.resetDemo(); }} />
          <header className="topbar">
            <button className="btn ghost menu-btn" style={{ padding: 6 }} onClick={() => setSidebar((s) => !s)}><svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
            <div><div className="top-title">{titles[view][0]}</div><div className="top-sub">{titles[view][1]}</div></div>
            <div className="spacer" />
            <button className={"alert-pill" + (risk === 0 ? " clear" : "")} onClick={() => setView("board")}><span className="dot" /> <b>{risk}</b> {risk === 0 ? "on track" : "at risk"}</button>
            <div className="role-pick"><Avatar name={loggedInUser.name} /><div><span style={{ fontWeight: 600, fontSize: 13 }}>{loggedInUser.name}</span><span style={{ display: "block", fontSize: 10.5, color: "var(--muted)", marginTop: -1 }}>{(loggedInUser.roles || []).join(", ")}</span></div></div>
            {canDo("received", "create") && <button className="btn primary" onClick={() => openModal({ kind: "newEnquiry" })}><svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>New enquiry</button>}
            <button className="btn ghost sm" onClick={logout} title="Log out" style={{ padding: 6, color: "var(--muted)" }}><svg width="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg></button>
          </header>
          <main className="main"><View /></main>
        </div>

        <div className={"scrim" + (openId ? " show" : "")} onClick={closeDrawer} />
        <aside className={"drawer" + (openId ? " show" : "")}>{openId && <DealDrawer key={openId} dealId={openId} initialTab={openTab} />}</aside>

        {modal && <ModalHost modal={modal} />}
        {toastMsg && <div className="toast show"><span className="ic">{toastMsg.warn ? "⚠" : "✓"}</span>{toastMsg.msg}</div>}
      </div>
    </Store.Provider>
  );
}

/* --------------------------------- login ---------------------------------- */
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError("Please enter email and password"); return; }
    setBusy(true); setError("");
    try {
      const res = await loginApi(email.trim(), password);
      if (res.ok) {
        onLogin(res.user.teamMemberId, res.token);
      } else {
        setError(res.error || "Login failed");
      }
    } catch (err) {
      setError("Cannot reach server. Is the backend running?");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div style={{ flex: 1, background: "linear-gradient(135deg, #1a3a6e 0%, #2d6a4f 50%, #1a5c3a 100%)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "40px 30px", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.08, backgroundImage: "radial-gradient(circle at 20% 50%, #fff 1px, transparent 1px), radial-gradient(circle at 80% 20%, #fff 1px, transparent 1px), radial-gradient(circle at 60% 80%, #fff 1px, transparent 1px)", backgroundSize: "60px 60px, 80px 80px, 50px 50px" }} />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 420 }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: "rgba(255,255,255,0.15)", backdropFilter: "blur(10px)", display: "inline-grid", placeItems: "center", marginBottom: 24, border: "2px solid rgba(255,255,255,0.25)" }}>
            <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: 2, fontFamily: "'Segoe UI', sans-serif" }}>I</span>
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>INFINITEE</h1>
          <div style={{ fontSize: 14, letterSpacing: 3, textTransform: "uppercase", opacity: 0.7, marginBottom: 30 }}>Chemical Distribution</div>
          <div style={{ width: 60, height: 2, background: "rgba(255,255,255,0.4)", margin: "0 auto 30px" }} />
          <h2 style={{ fontSize: 22, fontWeight: 300, lineHeight: 1.5, opacity: 0.9 }}>Welcome to managing your deals and winning businesses</h2>
          <p style={{ fontSize: 14, opacity: 0.6, marginTop: 16, lineHeight: 1.7 }}>Track enquiries, manage vendors, build quotations, and close deals — all in one place.</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 30, marginTop: 36 }}>
            {[["Pipeline", "Track every deal stage"], ["Vendors", "Manage your supply base"], ["Quotes", "Build & send quotations"]].map(([t, s]) => (
              <div key={t} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{t}</div>
                <div style={{ fontSize: 11, opacity: 0.5 }}>{s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ width: 420, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 36px", background: "#fff" }}>
        <div style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Sign in</h2>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Enter your credentials to continue</p>
        </div>
        <form onSubmit={submit}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Email</label>
          <input type="email" className="inp" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@infinitee.in" autoFocus autoComplete="email" style={{ width: "100%", marginBottom: 16 }} />
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Password</label>
          <div style={{ position: "relative", marginBottom: 20 }}>
            <input type={showPass ? "text" : "password"} className="inp" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" autoComplete="current-password" style={{ width: "100%", paddingRight: 40 }} />
            <button type="button" onClick={() => setShowPass((s) => !s)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4, fontSize: 12 }}>{showPass ? "Hide" : "Show"}</button>
          </div>
          {error && <div style={{ color: "#d4403f", fontSize: 13, marginBottom: 14, padding: "8px 12px", background: "#fbeaea", borderRadius: 8 }}>{error}</div>}
          <button type="submit" className="btn primary" disabled={busy} style={{ width: "100%", padding: "12px 0", fontSize: 14, fontWeight: 600 }}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <div style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "var(--muted-2)", lineHeight: 1.6 }}>
          Contact your administrator for login credentials.
        </div>
        <div style={{ marginTop: "auto", paddingTop: 30, textAlign: "center", fontSize: 11, color: "var(--muted-2)" }}>Infinitee DealFlow</div>
      </div>
    </div>
  );
}

/* ------------------------------- sidebar ---------------------------------- */
function Sidebar({ view, setView, open, onReset }) {
  const { db, loggedInUser, canDo } = useStore();
  const isAdmin = loggedInUser && (loggedInUser.roles || []).includes("Admin");
  const fuCount = db.deals.filter((d) => d.status === "sent").reduce((a, d) => a + d.followups.filter((f) => !f.doneAt && f.dueAt <= now()).length, 0);
  const Item = ({ id, label, badge, children }) => (
    <button className={"nav" + (view === id ? " active" : "")} onClick={() => setView(id)}>{children}{label}{badge != null && <span className="badge">{badge}</span>}</button>
  );
  return (
    <aside className={"side" + (open ? " show" : "")}>
      <div className="brand"><div className="logo">D</div><div><b>DealFlow</b><span>Distribution ops</span></div></div>
      <Item id="board" label="Pipeline" badge={liveDeals(db).length}><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="11" rx="1" /></svg></Item>
      <Item id="deals" label="All deals" badge={db.deals.length}><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h10" /></svg></Item>
      <div className="nav-sec">Queues</div>
      {canDo("qc", "view") && <Item id="qc" label="QC review" badge={db.deals.filter((d) => d.status === "qc").length}><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg></Item>}
      {canDo("sent", "view") && <Item id="followups" label="Follow-ups" badge={fuCount}><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg></Item>}
      {canDo("approval", "view") && <Item id="approvals" label="Quote approvals" badge={db.deals.filter((d) => d.status === "approval" && (!d.quoteApproval || d.quoteApproval.status !== "approved")).length}><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15l2 2 4-4" /></svg></Item>}
      <Item id="pendingrfqs" label="Pending RFQs" badge={db.deals.filter((d) => d.status !== "received" && d.status !== "rfq" && pendingRfqCount(d) > 0).length}><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg></Item>
      <div className="nav-sec">Insight</div>
      <Item id="reports" label="Reports"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg></Item>
      {canDo("products", "view") && <Item id="catalog" label="Products" badge={db.products.length}><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7L12 12l8.7-5M12 22V12" /></svg></Item>}
      {canDo("vendors", "view") && <Item id="vendors" label="Vendors" badge={db.vendors.length}><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-6 9 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg></Item>}
      <div className="nav-sec">Admin</div>
      {canDo("users", "view") && <Item id="users" label="User master" badge={db.team.length}><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg></Item>}
      {canDo("templates", "view") && <Item id="templates" label="Email templates" badge={(db.emailTemplates || []).length}><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><path d="M22 6l-10 7L2 6" /></svg></Item>}
      {isAdmin && <Item id="stageemails" label="Stage change emails"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><path d="M22 6l-10 7L2 6" /><path d="M5 20l4-4" /><path d="M19 20l-4-4" /></svg></Item>}
      <Item id="coatemplate" label="CoA template"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></svg></Item>
      {isAdmin && <Item id="roles" label="Roles" badge={(db.roles || []).length}><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" /><circle cx="12" cy="15" r="1.5" /></svg></Item>}
      {isAdmin && <Item id="accesscontrol" label="Access control"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></Item>}
      <Item id="sop" label="SOP / User guide"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg></Item>
      <div className="side-foot">DealFlow · data saved to database</div>
    </aside>
  );
}

/* -------------------------------- cards ----------------------------------- */
const pendingRfqCount = (deal) => deal.rfqs.filter((r) => !r.response).length;
function DealCard({ deal }) {
  const { db, openDeal, openModal, isManager } = useStore();
  const s = slaFor(deal), st = STAGE[deal.status];
  const cls = s.state === "brk" ? "brk" : s.state === "warn" ? "warn" : s.state === "ok" ? "ok" : "";
  const { info, warn } = dealProgress(deal);
  const pendingVendors = pendingRfqCount(deal);
  const showPendingStrip = pendingVendors > 0 && !["received", "rfq"].includes(deal.status);
  const groupCount = deal.groupId ? db.deals.filter((d) => d.groupId === deal.groupId).length : 0;
  return (
    <div className={"card " + cls} onClick={() => openDeal(deal.id)}>
      <div className="card-top"><span className="card-id">{deal.id}</span>{groupCount > 1 && <span className="tag" style={{ background: "#f3e8ff", color: "#7d5ba6", fontSize: 10 }}>{groupCount} grouped</span>}{deal.priority && deal.priority !== "Medium" && (() => { const pc = PRIORITY_COLORS[deal.priority]; return <span className="tag" style={{ background: pc.bg, color: pc.fg, fontSize: 10 }}>{deal.priority}</span>; })()}<span className="tag" style={{ background: st.col + "1a", color: st.col, marginLeft: "auto" }}>{st.action}</span></div>
      <div className="card-cust">{deal.customer}</div>
      <div className="card-prod">{productWithBrand(db, deal)} · {deal.qty} {deal.unit}</div>
      {(info.length > 0 || warn.length > 0) && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
        {info.map((t, i) => <span key={i} className="card-prog">{t}</span>)}
        {warn.map((t, i) => <span key={i} className="card-warn">{t}</span>)}
      </div>}
      {showPendingStrip && <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, padding: "5px 8px", borderRadius: 6, background: "var(--signal-soft)", border: "1px solid #f0d0a8", fontSize: 11, fontWeight: 600, color: "var(--signal)" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--signal)", animation: "pulse 1.2s infinite" }} />{pendingVendors} vendor{pendingVendors > 1 ? "s" : ""} RFQ still pending
      </div>}
      {deal.deleteRequest && <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, padding: "5px 8px", borderRadius: 6, background: "var(--breach-soft)", border: "1px solid var(--breach)", fontSize: 11, fontWeight: 600, color: "var(--breach)" }}>
        <svg width="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flex: "none" }}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
        Deletion requested
      </div>}
      <div className="card-foot">
        <span className="owner"><Avatar name={member(db, deal.ownerId).name} />{member(db, deal.ownerId).name.split(" ")[0]}</span>
        <Sla s={s} style={{ marginLeft: "auto" }} />
        {isManager && <button className="btn danger sm" style={{ fontSize: 10, padding: "2px 7px", marginLeft: 6 }} onClick={(e) => { e.stopPropagation(); openModal({ kind: "deleteDeal", dealId: deal.id }); }}>Archive</button>}
      </div>
    </div>
  );
}

/* -------------------------------- views ----------------------------------- */
function PendingRfqBar() {
  const { db, openDeal } = useStore();
  const [open, setOpen] = useState(false);
  const pending = db.deals.filter((d) => d.status !== "received" && d.status !== "rfq" && pendingRfqCount(d) > 0);
  if (!pending.length) return null;
  const overdue = pending.filter((d) => d.rfqs.some((r) => !r.response && r.dueAt < now()));
  return (
    <div style={{ marginBottom: 14 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: "var(--radius)", background: "var(--signal-soft)", border: "1px solid #f0d0a8", cursor: "pointer" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--signal)", animation: "pulse 1.2s infinite", flex: "none" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--signal)", flex: 1 }}>{pending.length} deal{pending.length > 1 ? "s" : ""} ha{pending.length > 1 ? "ve" : "s"} pending vendor quotes across stages{overdue.length > 0 && <span style={{ color: "var(--breach)" }}> · {overdue.length} overdue</span>}</span>
        <svg width="14" viewBox="0 0 24 24" fill="none" stroke="var(--signal)" strokeWidth="2.5" style={{ transform: open ? "rotate(180deg)" : "", transition: ".15s" }}><polyline points="6 9 12 15 18 9" /></svg>
      </div>
      {open && <div className="panel" style={{ marginTop: 6, overflow: "hidden" }}>
        <table><thead><tr><th>Deal</th><th>Customer</th><th>Stage</th><th>Pending</th><th>Overdue</th></tr></thead>
          <tbody>{pending.map((d) => { const pc = pendingRfqCount(d); const od = d.rfqs.filter((r) => !r.response && r.dueAt < now()).length; const st = STAGE[d.status]; return (
            <tr className="clickable" key={d.id} onClick={() => openDeal(d.id)}>
              <td className="mono" style={{ fontSize: 12 }}>{d.id}</td>
              <td style={{ fontWeight: 600 }}>{d.customer}</td>
              <td><span className="tag" style={{ background: st.col + "1a", color: st.col }}>{st.label}</span></td>
              <td><span className="sla warn"><span className="pip" />{pc} vendor{pc > 1 ? "s" : ""}</span></td>
              <td>{od > 0 ? <span className="sla brk"><span className="pip" />{od} overdue</span> : <span style={{ color: "var(--muted-2)", fontSize: 12 }}>on time</span>}</td>
            </tr>); })}</tbody>
        </table>
      </div>}
    </div>
  );
}
function BoardView() {
  const { db, canDo } = useStore();
  return (
    <div><PendingRfqBar /><div className="board">
      {STAGES.filter((st) => st.k !== "closed").map((st) => {
        if (!canDo(st.k, "view")) return null;
        const ds = db.deals.filter((d) => d.status === st.k).sort((a, b) => (slaFor(a).rem ?? 1e15) - (slaFor(b).rem ?? 1e15));
        return (
          <div className="col" key={st.k}>
            <div className="col-head"><span className="col-dot" style={{ background: st.col }} /><h4>{st.label}</h4><span className="ct">{ds.length}</span></div>
            <div className="col-body">{ds.length ? ds.map((d) => <DealCard key={d.id} deal={d} />) : <div className="col-empty">Nothing here</div>}</div>
          </div>
        );
      })}
    </div></div>
  );
}
function SortTh({ label, sortKey, sort, setSort }) {
  const active = sort.key === sortKey;
  const asc = active && sort.dir === "asc";
  return (
    <th style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }} onClick={() => setSort({ key: sortKey, dir: active && sort.dir === "asc" ? "desc" : "asc" })}>
      {label} <span style={{ fontSize: 10, color: active ? "var(--signal)" : "var(--muted-2)" }}>{active ? (asc ? "▲" : "▼") : "⇅"}</span>
    </th>
  );
}
function DealsView() {
  const { db, openDeal, openModal, commit, toast, canDo, isManager } = useStore();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "createdAt", dir: "desc" });
  const [groupBy, setGroupBy] = useState(false);
  const filtered = db.deals.filter((d) => canDo(d.status, "view") && (d.customer + d.products + d.id + (d.priority || "") + (d.groupId || "")).toLowerCase().includes(q.toLowerCase()));
  const sorted = filtered.slice().sort((a, b) => {
    if (groupBy) { const ga = a.groupId || "zzz_" + a.id, gb = b.groupId || "zzz_" + b.id; if (ga !== gb) return ga.localeCompare(gb); }
    const dir = sort.dir === "asc" ? 1 : -1;
    switch (sort.key) {
      case "customer": return dir * a.customer.localeCompare(b.customer);
      case "products": return dir * (a.products || "").localeCompare(b.products || "");
      case "owner": return dir * member(db, a.ownerId).name.localeCompare(member(db, b.ownerId).name);
      case "priority": return dir * ((PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3));
      case "stage": return dir * (STAGES.findIndex((s) => s.k === a.status) - STAGES.findIndex((s) => s.k === b.status));
      case "group": return dir * (a.groupId || "").localeCompare(b.groupId || "");
      case "createdAt": return dir * (a.createdAt - b.createdAt);
      default: return 0;
    }
  });
  let lastGroup = null;
  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <div className="field" style={{ maxWidth: 340, flex: 1, marginBottom: 0 }}><input placeholder="Search customer, product, deal ID, priority or group…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className={"check" + (groupBy ? " on" : "")} style={{ padding: "6px 10px", marginBottom: 0, fontSize: 12 }}>
          <input type="checkbox" checked={groupBy} onChange={(e) => setGroupBy(e.target.checked)} /><span>Group by enquiry</span>
        </label>
      </div>
      <div className="panel" style={{ overflow: "hidden" }}>
        <table><thead><tr>
          <SortTh label="Deal" sortKey="createdAt" sort={sort} setSort={setSort} />
          <SortTh label="Customer" sortKey="customer" sort={sort} setSort={setSort} />
          <SortTh label="Product" sortKey="products" sort={sort} setSort={setSort} />
          <SortTh label="Owner" sortKey="owner" sort={sort} setSort={setSort} />
          <SortTh label="Priority" sortKey="priority" sort={sort} setSort={setSort} />
          <SortTh label="Group" sortKey="group" sort={sort} setSort={setSort} />
          <SortTh label="Stage" sortKey="stage" sort={sort} setSort={setSort} />
          <th>SLA</th>
          {canDo("compare", "view") && <th style={{ width: 1 }}></th>}
          {isManager && <th style={{ width: 1 }}></th>}
        </tr></thead>
          <tbody>{sorted.length ? sorted.map((d) => { const s = slaFor(d), st = STAGE[d.status]; const pc = PRIORITY_COLORS[d.priority] || PRIORITY_COLORS.Medium;
            const showGroupHeader = groupBy && d.groupId && d.groupId !== lastGroup;
            if (d.groupId) lastGroup = d.groupId; else lastGroup = null;
            const gc = d.groupId ? db.deals.filter((x) => x.groupId === d.groupId).length : 0;
            return (
            <React.Fragment key={d.id}>
              {showGroupHeader && <tr style={{ background: "#f3e8ff" }}><td colSpan={isManager ? 10 : 9} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#7d5ba6" }}>{d.groupId} · {d.customer} · {gc} products</td></tr>}
              <tr className="clickable" onClick={() => openDeal(d.id)} style={groupBy && d.groupId ? { background: "#faf5ff" } : undefined}>
                <td className="mono" style={{ fontSize: 12 }}>{d.id}</td>
                <td style={{ fontWeight: 600 }}>{d.customer}{d.deleteRequest && <span title={"Deletion requested: " + d.deleteRequest.reason} style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "var(--breach)", marginLeft: 5, verticalAlign: "middle" }} />}</td>
                <td>{d.products}{brandLabel(db, d) && <span style={{ display: "block", fontSize: 11, color: "var(--info)", fontWeight: 500 }}>{brandLabel(db, d)}</span>}</td>
                <td><span className="owner"><Avatar name={member(db, d.ownerId).name} />{member(db, d.ownerId).name.split(" ")[0]}</span></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <select value={d.priority || "Medium"} onChange={(e) => { d.priority = e.target.value; commit(); toast("Priority updated"); }} style={{ background: pc.bg, color: pc.fg, border: "1px solid " + pc.fg + "44", borderRadius: 4, padding: "3px 6px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td>{d.groupId ? <span className="tag" style={{ background: "#f3e8ff", color: "#7d5ba6", fontSize: 10 }}>{d.groupId}</span> : <span style={{ color: "var(--muted-2)", fontSize: 12 }}>—</span>}</td>
                <td><span className="tag" style={{ background: st.col + "1a", color: st.col }}>{st.label}</span></td>
                <td><Sla s={s} /></td>
                {canDo("compare", "view") && <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                  {d.rfqs.some((r) => r.response) && <button className="btn sm" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => openDeal(d.id, "compare")}>Compare</button>}
                </td>}
                {isManager && <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                  <button className="btn danger sm" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => openModal({ kind: "deleteDeal", dealId: d.id })}>Archive</button>
                </td>}
              </tr>
            </React.Fragment>);
          }) : <tr><td colSpan={isManager ? 10 : 9} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No deals match.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}
function QCView() {
  const { db } = useStore();
  const ds = db.deals.filter((d) => d.status === "qc");
  if (!ds.length) return <Empty big="QC queue is clear" sub="No documents are waiting to be vetted right now." />;
  return <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>{ds.map((d) => <DealCard key={d.id} deal={d} />)}</div>;
}
function FollowupsView() {
  const { db, openDeal } = useStore();
  const ds = db.deals.filter((d) => d.status === "sent");
  if (!ds.length) return <Empty big="No active follow-ups" sub="Quotations you send to customers will appear here with a chase schedule." />;
  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <table><thead><tr><th>Deal</th><th>Customer</th><th>Quote</th><th>Next chase</th><th>Owner</th><th /></tr></thead>
        <tbody>{ds.map((d) => { const next = d.followups.filter((f) => !f.doneAt).sort((a, b) => a.dueAt - b.dueAt)[0]; const over = next && next.dueAt <= now(); return (
          <tr className="clickable" key={d.id} onClick={() => openDeal(d.id)}>
            <td className="mono" style={{ fontSize: 12 }}>{d.id}</td><td style={{ fontWeight: 600 }}>{d.customer}</td><td>{d.quote ? money(d.quote.total) : "—"}</td>
            <td>{next ? <span className={"sla " + (over ? "brk" : "ok")}><span className="pip" />{over ? "due now" : fmtWhen(next.dueAt)}</span> : <span className="tag">all done</span>}</td>
            <td><span className="owner"><Avatar name={member(db, d.ownerId).name} />{member(db, d.ownerId).name.split(" ")[0]}</span></td>
            <td style={{ textAlign: "right" }}><span className="btn sm">Open</span></td>
          </tr>); })}</tbody>
      </table>
    </div>
  );
}
function PendingRfqsView() {
  const { db, openDeal } = useStore();
  const deals = db.deals.filter((d) => d.status !== "received" && d.status !== "rfq" && pendingRfqCount(d) > 0);
  if (!deals.length) return <Empty big="No pending vendor quotes" sub="All RFQs have been responded to or are still in the initial RFQ stage." />;
  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <table><thead><tr><th>Deal</th><th>Customer</th><th>Product</th><th>Stage</th><th>Vendor</th><th>Sent</th><th>Status</th></tr></thead>
        <tbody>{deals.flatMap((d) => {
          const uniquePending = d.rfqs.reduce((acc, r) => {
            const idx = acc.findIndex((x) => x.vendorId === r.vendorId);
            if (idx === -1) acc.push(r);
            else if (r.response && !acc[idx].response) acc[idx] = r;
            return acc;
          }, []).filter((r) => !r.response);
          return uniquePending.map((r) => {
          const st = STAGE[d.status]; const v = vendor(db, r.vendorId); const over = r.dueAt < now();
          return (
            <tr className="clickable" key={d.id + r.vendorId} onClick={() => openDeal(d.id)}>
              <td className="mono" style={{ fontSize: 12 }}>{d.id}</td>
              <td style={{ fontWeight: 600 }}>{d.customer}</td>
              <td>{d.products}</td>
              <td><span className="tag" style={{ background: st.col + "1a", color: st.col }}>{st.label}</span></td>
              <td style={{ fontWeight: 500 }}>{v.name}</td>
              <td style={{ fontSize: 12, color: "var(--muted)" }}>{fmtWhen(r.sentAt)}</td>
              <td>{over ? <span className="sla brk"><span className="pip" />overdue</span> : <span className="sla warn"><span className="pip" />{remLabel(r.dueAt - now())}</span>}</td>
            </tr>);
          });
        })}</tbody>
      </table>
    </div>
  );
}
function ApprovalsView() {
  const { db, openDeal } = useStore();
  const deals = db.deals.filter((d) => d.status === "approval");
  const pending = deals.filter((d) => !d.quoteApproval || d.quoteApproval.status !== "approved");
  const approved = deals.filter((d) => d.quoteApproval && d.quoteApproval.status === "approved");
  if (!deals.length) return <Empty big="No quotes pending approval" sub="Quotations submitted for approval will appear here." />;
  return (
    <div>
      {pending.length > 0 && <>
        <h4 style={{ fontSize: 13, color: "var(--signal)", marginBottom: 10 }}>Pending approval ({pending.length})</h4>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", marginBottom: 20 }}>{pending.map((d) => <DealCard key={d.id} deal={d} />)}</div>
      </>}
      {approved.length > 0 && <>
        <h4 style={{ fontSize: 13, color: "var(--ok)", marginBottom: 10 }}>Approved — awaiting send ({approved.length})</h4>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>{approved.map((d) => <DealCard key={d.id} deal={d} />)}</div>
      </>}
    </div>
  );
}
function Bar({ label, value, max, color }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
    <span style={{ width: 150, fontSize: 12.5, fontWeight: 500 }}>{label}</span>
    <span className="bar" style={{ flex: 1 }}><span style={{ width: (value / max * 100) + "%", background: color || "var(--signal)" }} /></span>
    <span className="mono" style={{ fontSize: 12, width: 42, textAlign: "right" }}>{value}</span>
  </div>;
}
function ReportsView() {
  const { db } = useStore();
  const live = liveDeals(db);
  const archived = db.archivedDeals || [];
  const won = archived.filter((d) => d.archiveReason === "won");
  const lost = archived.filter((d) => d.archiveReason === "lost");
  const risk = live.filter(isAtRisk).length;
  const breaches = live.filter((d) => slaFor(d).state === "brk").length;
  const winRate = won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : 0;
  const cyc = won.map((d) => ((d.closed && d.closed.at ? d.closed.at : d.archivedAt) - d.createdAt) / (24 * HR));
  const avgCyc = cyc.length ? (cyc.reduce((a, b) => a + b, 0) / cyc.length).toFixed(1) : "—";
  const Tile = ({ k, v, cls }) => <div className={"panel stat " + (cls || "")}><div className="k">{k}</div><div className="v">{v}</div></div>;
  const maxStage = Math.max(1, ...STAGES.filter((s) => s.k !== "closed").map((st) => db.deals.filter((d) => d.status === st.k).length));
  const maxResp = Math.max(1, ...db.vendors.map((v) => v.avgResp));
  const maxLoad = Math.max(1, ...db.team.map((u) => live.filter((d) => d.ownerId === u.id).length));
  return (
    <div>
      <div className="grid stat-grid">
        <Tile k="Live deals" v={live.length} />
        <Tile k="At risk now" v={<>{risk} <small>of {live.length}</small></>} cls={risk ? "brk" : "ok"} />
        <Tile k="SLA breaches" v={breaches} cls={breaches ? "brk" : "ok"} />
        <Tile k="Win rate" v={<>{winRate}<small>%</small></>} cls="ok" />
        <Tile k="Won / Lost" v={won.length + " / " + lost.length} />
        <Tile k="Avg cycle (won)" v={<>{avgCyc} <small>days</small></>} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 16 }}>
        <div className="panel" style={{ padding: "18px 20px" }}>
          <h4 style={{ marginBottom: 14 }}>Pipeline by stage</h4>
          {STAGES.filter((s) => s.k !== "closed").map((st) => <Bar key={st.k} label={st.label} value={db.deals.filter((d) => d.status === st.k).length} max={maxStage} color={st.col} />)}
        </div>
        <div className="panel" style={{ padding: "18px 20px" }}>
          <h4 style={{ marginBottom: 14 }}>Vendor responsiveness</h4>
          {db.vendors.slice().sort((a, b) => a.avgResp - b.avgResp).map((v) => <Bar key={v.id} label={v.name} value={v.avgResp} max={maxResp} color={v.avgResp > 30 ? "var(--breach)" : "var(--ok)"} />)}
        </div>
        <div className="panel" style={{ padding: "18px 20px" }}>
          <h4 style={{ marginBottom: 14 }}>Purchaser load (live deals)</h4>
          {db.team.map((u) => <Bar key={u.id} label={u.name} value={live.filter((d) => d.ownerId === u.id).length} max={maxLoad} />)}
        </div>
        <div className="panel" style={{ padding: "18px 20px" }}>
          <h4 style={{ marginBottom: 14 }}>Why deals are lost</h4>
          {lost.length ? lost.map((d, i) => <div key={i} style={{ fontSize: 13, padding: "7px 0", borderBottom: "1px solid var(--line-2)" }}><b>{d.customer}</b> <span style={{ color: "var(--muted)" }}>— {d.closed ? d.closed.reason : d.archiveNote || "—"}</span></div>) : <p style={{ color: "var(--muted)", fontSize: 13 }}>No losses recorded yet.</p>}
        </div>
      </div>
      <QuotedDealsReport />
      <ArchivedDealsReport />
    </div>
  );
}
function QuotedDealsReport() {
  const { db, openDeal } = useStore();
  const archived = db.archivedDeals || [];
  const activeQuoted = db.deals.filter((d) => d.quote || d.pendingQuote);
  const archivedQuoted = archived.filter((d) => d.archiveReason !== "deleted" && (d.quote || d.pendingQuote));
  const rows = [
    ...activeQuoted.map((d) => ({ ...d, _type: "active" })),
    ...archivedQuoted.map((d) => ({ ...d, _type: "archived" })),
  ].sort((a, b) => {
    const aDate = (a.quote && a.quote.sentAt) || (a.pendingQuote && a.pendingQuote.submittedAt) || a.archivedAt || a.createdAt || 0;
    const bDate = (b.quote && b.quote.sentAt) || (b.pendingQuote && b.pendingQuote.submittedAt) || b.archivedAt || b.createdAt || 0;
    return bDate - aDate;
  });
  if (!rows.length) return null;
  const outcomeLabel = (d) => {
    if (d._type === "active") { const st = STAGE[d.status]; return <span className="tag" style={{ background: st.col + "1a", color: st.col }}>{st.label}</span>; }
    if (d.archiveReason === "won") return <span className="tag" style={{ background: "var(--ok-soft)", color: "#127a51" }}>Won</span>;
    if (d.archiveReason === "lost") return <span className="tag" style={{ background: "var(--breach-soft)", color: "var(--breach)" }}>Lost</span>;
    return <span className="tag">Closed</span>;
  };
  return (
    <div className="panel" style={{ marginTop: 16, overflow: "hidden" }}>
      <h4 style={{ padding: "18px 20px 14px" }}>Quoted deals — sales follow-up ({rows.length})</h4>
      <table>
        <thead><tr><th>Deal</th><th>Customer</th><th>Product</th><th>Quote value</th><th>Owner</th><th>Status / Outcome</th><th>Date quoted</th></tr></thead>
        <tbody>{rows.map((d, i) => {
          const q = d.quote || (d.pendingQuote && d.pendingQuote.finalQuote) || {};
          const val = d.quote ? money(d.quote.total, d.quote.currency || "₹") : (q.pricePerUnit ? money(q.pricePerUnit, d.pendingQuote && d.pendingQuote.currency) : "—");
          const dateVal = (d.quote && d.quote.sentAt) || (d.pendingQuote && d.pendingQuote.submittedAt) || d.archivedAt || d.stageAt;
          const owner = db.team.find((u) => u.id === d.ownerId) || { name: "—" };
          return (
            <tr key={i} className={d._type === "active" ? "clickable" : ""} onClick={d._type === "active" ? () => openDeal(d.id) : undefined}>
              <td className="mono" style={{ fontSize: 12 }}>{d.id}</td>
              <td style={{ fontWeight: 600 }}>{d.customer}</td>
              <td>{d.products}</td>
              <td className="mono" style={{ fontWeight: 700 }}>{val}</td>
              <td><span className="owner"><Avatar name={owner.name} />{owner.name.split(" ")[0]}</span></td>
              <td>{outcomeLabel(d)}</td>
              <td style={{ fontSize: 12, color: "var(--muted)" }}>{dateVal ? fmtWhen(dateVal) : "—"}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}
function ArchivedDealsReport() {
  const { db } = useStore();
  const archived = (db.archivedDeals || []).slice().sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
  if (!archived.length) return null;
  const typeLabel = (d) => {
    if (d.archiveReason === "won") return <span className="tag" style={{ background: "var(--ok-soft)", color: "#127a51" }}>Won</span>;
    if (d.archiveReason === "lost") return <span className="tag" style={{ background: "var(--breach-soft)", color: "var(--breach)" }}>Lost</span>;
    if (d.archiveReason === "deleted") return <span className="tag" style={{ background: "var(--surface)", color: "var(--muted)" }}>Deleted</span>;
    return <span className="tag">{d.archiveReason || "Archived"}</span>;
  };
  return (
    <div className="panel" style={{ marginTop: 16, overflow: "hidden" }}>
      <h4 style={{ padding: "18px 20px 14px" }}>Archive ({archived.length})</h4>
      <table>
        <thead><tr><th>Deal ID</th><th>Customer</th><th>Product</th><th>Stage</th><th>Outcome</th><th>Note</th><th>Archived by</th><th>Archived on</th></tr></thead>
        <tbody>{archived.map((d, i) => {
          const st = STAGE[d.status] || {};
          const byUser = d.archivedBy ? (db.team.find((u) => u.id === d.archivedBy) || { name: "—" }).name : "—";
          return (
            <tr key={i}>
              <td className="mono" style={{ fontSize: 12 }}>{d.id}</td>
              <td style={{ fontWeight: 600 }}>{d.customer}</td>
              <td>{d.products}</td>
              <td>{st.col ? <span className="tag" style={{ background: st.col + "1a", color: st.col }}>{st.label}</span> : "—"}</td>
              <td>{typeLabel(d)}</td>
              <td style={{ color: "var(--muted)", maxWidth: 200, fontSize: 12 }}>{d.archiveNote || "—"}</td>
              <td style={{ fontSize: 12 }}>{byUser}</td>
              <td style={{ fontSize: 12, color: "var(--muted)" }}>{fmtWhen(d.archivedAt)}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}
function VendorsView() {
  const { db, openModal, canDo, commit, toast, actions, role } = useStore();
  const canEdit = canDo("vendors", "edit");
  const isAdmin = (role || []).includes("Admin");
  const [showInactive, setShowInactive] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeKeep, setMergeKeep] = useState("");
  const [mergeRemove, setMergeRemove] = useState("");
  const [vendorQ, setVendorQ] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const toggleVendor = (v, e) => { e.stopPropagation(); v.active = !v.active; commit(); toast(v.name + (v.active ? " activated" : " deactivated")); };
  const inactiveCount = db.vendors.filter((v) => v.active === false).length;
  const displayed = (showInactive ? db.vendors : db.vendors.filter((v) => v.active !== false))
    .filter((v) => !vendorQ.trim() || v.name.toLowerCase().includes(vendorQ.trim().toLowerCase()) || (v.contactPerson || "").toLowerCase().includes(vendorQ.trim().toLowerCase()))
    .slice().sort((a, b) => sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
  const doMerge = () => {
    if (!mergeKeep || !mergeRemove) { toast("Select both vendors", 1); return; }
    if (mergeKeep === mergeRemove) { toast("Cannot merge a vendor with itself", 1); return; }
    const kn = (db.vendors.find((v) => v.id === mergeKeep) || {}).name;
    const rn = (db.vendors.find((v) => v.id === mergeRemove) || {}).name;
    if (!window.confirm("Merge \"" + rn + "\" into \"" + kn + "\"?\n\nAll RFQs and products from \"" + rn + "\" will be moved to \"" + kn + "\", and \"" + rn + "\" will be deleted.")) return;
    actions.mergeVendors(mergeKeep, mergeRemove);
    setMergeMode(false); setMergeKeep(""); setMergeRemove("");
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <input value={vendorQ} onChange={(e) => setVendorQ(e.target.value)} placeholder="Search vendors…" style={{ maxWidth: 260 }} />
          <span style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap" }}>{inactiveCount > 0 && <button className="btn ghost sm" style={{ fontSize: 11 }} onClick={() => setShowInactive((s) => !s)}>{showInactive ? "Hide" : "Show"} {inactiveCount} inactive</button>}</span>
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          {isAdmin && <button className="btn sm" onClick={() => setMergeMode((m) => !m)}>{mergeMode ? "Cancel merge" : "Merge vendors"}</button>}
          {canDo("vendors", "create") && <button className="btn primary sm" onClick={() => openModal({ kind: "vendor", vendorId: null })}>+ Add vendor</button>}
        </span>
      </div>
      {mergeMode && <div className="panel" style={{ padding: "14px 18px", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Merge two vendors</div>
        <div className="row2">
          <div className="field"><label>Keep this vendor</label><select value={mergeKeep} onChange={(e) => setMergeKeep(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }}>
            <option value="">— Select —</option>
            {db.vendors.filter((v) => v.active !== false).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select></div>
          <div className="field"><label>Merge & remove this vendor</label><select value={mergeRemove} onChange={(e) => setMergeRemove(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }}>
            <option value="">— Select —</option>
            {db.vendors.filter((v) => v.active !== false && v.id !== mergeKeep).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select></div>
        </div>
        {mergeKeep && mergeRemove && <div className="note" style={{ marginTop: 8 }}><span className="ic">⚠</span><div>All RFQs and products from <b>{(db.vendors.find((v) => v.id === mergeRemove) || {}).name}</b> will be moved to <b>{(db.vendors.find((v) => v.id === mergeKeep) || {}).name}</b>. This cannot be undone.</div></div>}
        <button className="btn primary sm" style={{ marginTop: 10 }} onClick={doMerge}>Merge vendors</button>
      </div>}
      <div className="panel" style={{ overflow: "hidden" }}>
        <table><thead><tr>
          <th style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }} onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}>Vendor {sortDir === "asc" ? "↑" : "↓"}</th>
          {canEdit && <th>Status</th>}<th>Contact person</th><th>Products carried</th><th>Rating</th><th>Avg response</th><th>Open RFQs</th>{isAdmin && <th />}</tr></thead>
          <tbody>{displayed.map((v) => { const isActive = v.active !== false; const open = db.deals.reduce((a, d) => a + d.rfqs.filter((r) => r.vendorId === v.id && !r.response).length, 0); return (
            <tr className={canEdit ? "clickable" : ""} key={v.id} style={isActive ? {} : { opacity: 0.5 }} onClick={() => canEdit && openModal({ kind: "vendor", vendorId: v.id })}>
              <td style={{ fontWeight: 600 }}>{v.name}</td>
              {canEdit && <td><button className={"btn sm " + (isActive ? "ok" : "danger")} style={{ fontSize: 11, padding: "3px 10px", minWidth: 70 }} onClick={(e) => toggleVendor(v, e)}>{isActive ? "Active" : "Inactive"}</button></td>}
              <td>{v.contactPerson ? <span style={{ fontWeight: 500 }}>{v.contactPerson}</span> : <span style={{ color: "var(--muted-2)" }}>—</span>}</td>
              <td style={{ lineHeight: 2 }}>{(v.productIds || []).length ? (v.productIds || []).map((pid) => { const p = product(db, pid); if (!p) return null; const t = vendorTier(v, pid), tc = TIER_COLORS[t]; return <span className="tag" key={pid} style={{ marginRight: 4, background: tc.bg, color: tc.fg }}>{p.name}</span>; }) : <span style={{ color: "var(--muted-2)" }}>none yet</span>}</td>
              <td>{isActive ? "★ " + v.rating : "—"}</td><td><span className={"sla " + (v.avgResp > 30 ? "warn" : "ok")}>{v.avgResp}h</span></td><td className="mono">{open}</td>
              {isAdmin && <td style={{ textAlign: "right" }}><button className="btn sm danger" style={{ fontSize: 10, padding: "2px 8px" }} onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete " + v.name + "?\n\nIf this vendor has RFQ history, it will be deactivated instead.")) actions.deleteVendor(v.id); }}>Delete</button></td>}
            </tr>); })}</tbody>
        </table>
      </div>
    </div>
  );
}
function UsersView() {
  const { db, openModal, canDo } = useStore();
  const live = liveDeals(db);
  const canEdit = canDo("users", "edit");
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{canEdit ? "Manage team members available for deal assignment." : "Team members directory."}</span>
        {canDo("users", "create") && <button className="btn primary sm" onClick={() => openModal({ kind: "user", userId: null })}>+ Add user</button>}
      </div>
      <div className="panel" style={{ overflow: "hidden" }}>
        <table><thead><tr><th>Name</th><th>Login email</th><th>Role</th><th>Live deals</th><th>Total deals</th>{canEdit && <th />}</tr></thead>
          <tbody>{db.team.map((u) => { const lc = live.filter((d) => d.ownerId === u.id).length; const tc = db.deals.filter((d) => d.ownerId === u.id).length; return (
            <tr className={canEdit ? "clickable" : ""} key={u.id} onClick={() => canEdit && openModal({ kind: "user", userId: u.id })}>
              <td style={{ fontWeight: 600 }}><span className="owner"><Avatar name={u.name} />{u.name}</span></td>
              <td style={{ fontSize: 12.5, color: "var(--muted)" }}>{u.loginEmail || <span style={{ color: "var(--breach)", fontSize: 11 }}>no login</span>}</td>
              <td style={{ lineHeight: 2 }}>{(u.roles || []).map((r) => <span className="tag" key={r} style={{ marginRight: 4 }}>{r}</span>)}</td>
              <td className="mono">{lc}</td>
              <td className="mono">{tc}</td>
              {canEdit && <td style={{ textAlign: "right" }}><span className="btn sm">Edit</span></td>}
            </tr>); })}</tbody>
        </table>
      </div>
    </div>
  );
}
function EmailTemplatesView() {
  const { db, actions, canDo } = useStore();
  const canEdit = canDo("templates", "edit");
  const canCreate = canDo("templates", "create");
  const canDelete = canDo("templates", "delete");
  const templates = db.emailTemplates || [];
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(null);
  const TYPE_LABELS = { new: "New vendor", existing: "Existing vendor", general: "General", new_customer: "New customer quote", existing_customer: "Existing customer quote", customer_quote: "Customer quote", followup_first: "1st follow-up", followup_subsequent: "Subsequent follow-up" };
  const startEdit = (tpl) => { setEditId(tpl.id); setForm({ name: tpl.name, type: tpl.type, subject: tpl.subject, body: tpl.body }); };
  const startNew = () => { setEditId("__new__"); setForm({ name: "", type: "general", subject: "RFQ — {{product}} — {{quantity}}", body: "" }); };
  const cancel = () => { setEditId(null); setForm(null); };
  const save = () => {
    if (!form.name.trim()) return;
    if (editId === "__new__") actions.saveTemplate(null, form);
    else { const existing = templates.find((t) => t.id === editId); actions.saveTemplate(existing, form); }
    cancel();
  };
  const PLACEHOLDER_GROUPS = [
    { label: "Vendor", items: ["{{vendor_name}}", "{{vendor_contact}}", "{{vendor_email}}"] },
    { label: "Customer", items: ["{{customer}}", "{{customer_contact}}", "{{customer_email}}", "{{customer_phone}}"] },
    { label: "Deal", items: ["{{product}}", "{{quantity}}", "{{details}}", "{{required_items}}", "{{additional_info}}"] },
    { label: "Sender", items: ["{{user}}", "{{user_email}}", "{{user_mobile}}", "{{signature}}"] },
  ];
  const Tag = ({ p }) => <code style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 4, fontSize: 11.5, marginRight: 4, fontFamily: "var(--mono)", display: "inline-block", marginBottom: 3 }}>{p}</code>;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Configure email drafts used when sending RFQs. Templates auto-select based on vendor type (new / existing).</span>
        {canCreate && <button className="btn primary sm" onClick={startNew}>+ Add template</button>}
      </div>
      <div className="note" style={{ marginBottom: 14, alignItems: "flex-start" }}><span className="ic" style={{ marginTop: 2 }}>i</span><div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Available placeholders</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px 16px" }}>
          {PLACEHOLDER_GROUPS.map(({ label, items }) => (
            <div key={label}><div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>{items.map((p) => <Tag key={p} p={p} />)}</div>
          ))}
        </div>
      </div></div>
      {templates.map((tpl) => {
        const editing = editId === tpl.id;
        return (
          <div key={tpl.id} className="panel" style={{ marginBottom: 12, overflow: "hidden" }}>
            {editing ? (
              <div style={{ padding: "16px 18px" }}>
                <div className="row2">
                  <div className="field"><label>Template name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                  <div className="field"><label>Auto-select for</label><select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}><option value="new">New vendor RFQ</option><option value="existing">Existing vendor RFQ</option><option value="new_customer">New customer quote</option><option value="existing_customer">Existing customer quote</option><option value="followup_first">1st follow-up</option><option value="followup_subsequent">Subsequent follow-up</option><option value="general">General</option></select></div>
                </div>
                <div className="field"><label>Subject line</label><input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} /></div>
                <div className="field"><label>Email body</label><textarea style={{ minHeight: 200, fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.5 }} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} /></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn primary sm" onClick={save}>Save</button>
                  <button className="btn ghost sm" onClick={cancel}>Cancel</button>
                  {canDelete && <button className="btn danger sm" style={{ marginLeft: "auto" }} onClick={() => { actions.deleteTemplate(tpl.id); cancel(); }}>Delete</button>}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: canEdit ? "pointer" : "default" }} onClick={() => canEdit && startEdit(tpl)}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{tpl.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Auto-selects for: <b>{TYPE_LABELS[tpl.type] || tpl.type}</b> &middot; Subject: {tpl.subject}</div>
                </div>
                {canEdit && <span className="btn sm">Edit</span>}
              </div>
            )}
          </div>
        );
      })}
      {editId === "__new__" && (
        <div className="panel" style={{ marginBottom: 12, padding: "16px 18px" }}>
          <div className="row2">
            <div className="field"><label>Template name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Follow-up RFQ" /></div>
            <div className="field"><label>Auto-select for</label><select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}><option value="new">New vendor RFQ</option><option value="existing">Existing vendor RFQ</option><option value="new_customer">New customer quote</option><option value="existing_customer">Existing customer quote</option><option value="followup_first">1st follow-up</option><option value="followup_subsequent">Subsequent follow-up</option><option value="general">General</option></select></div>
          </div>
          <div className="field"><label>Subject line</label><input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} /></div>
          <div className="field"><label>Email body</label><textarea style={{ minHeight: 200, fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.5 }} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder={"Dear {{vendor_name}},\n\nWe would like to request a quotation for:\n\nProduct: {{product}}\nQuantity: {{quantity}}\n{{details}}\n\n{{required_items}}\n\n{{additional_info}}\n\nRegards"} /></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary sm" onClick={save}>Add template</button>
            <button className="btn ghost sm" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}
      {!templates.length && editId !== "__new__" && <Empty big="No email templates" sub="Add a template to start sending RFQ emails to vendors." />}
    </div>
  );
}
function StageEmailTemplatesView() {
  const { db, actions } = useStore();
  const templates = db.stageEmailTemplates || [];
  const [editKey, setEditKey] = useState(null);
  const [form, setForm] = useState(null);
  const PLACEHOLDERS = ["{{deal_id}}", "{{stage}}", "{{customer}}", "{{product}}", "{{quantity}}", "{{action}}", "{{user}}", "{{user_email}}", "{{user_mobile}}"];
  const startEdit = (tpl) => { setEditKey(tpl.stageKey); setForm({ subject: tpl.subject, body: tpl.body }); };
  const cancel = () => { setEditKey(null); setForm(null); };
  const save = () => { actions.saveStageTemplate(editKey, form); cancel(); };
  const toggleEnabled = (tpl, e) => { e.stopPropagation(); actions.saveStageTemplate(tpl.stageKey, { subject: tpl.subject, body: tpl.body, enabled: !tpl.enabled }); };
  const stagesWithTemplates = STAGES.filter((s) => s.owner !== "System").map((s) => {
    const tpl = templates.find((t) => t.stageKey === s.k);
    return { stage: s, tpl: tpl || { stageKey: s.k, enabled: true, subject: `[DealFlow] {{deal_id}} moved to ${s.label} — {{product}}`, body: `Hi,\n\nDeal {{deal_id}} has moved to "${s.label}" and needs your attention.\n\nCustomer: {{customer}}\nProduct: {{product}}\nQuantity: {{quantity}}\nAction needed: {{action}}\n\nPlease log in to DealFlow to take action.\n\nRegards\n{{user}}` } };
  });
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Configure the email sent to stage owners when a deal moves to their stage. Toggle each stage on or off as needed.</span>
      </div>
      <div className="note" style={{ marginBottom: 14 }}><span className="ic">i</span><div>Available placeholders: {PLACEHOLDERS.map((p) => <code key={p} style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 4, fontSize: 11.5, marginRight: 4, fontFamily: "var(--mono)" }}>{p}</code>)}</div></div>
      {stagesWithTemplates.map(({ stage, tpl }) => {
        const editing = editKey === stage.k;
        const enabled = tpl.enabled !== false;
        return (
          <div key={stage.k} className="panel" style={{ marginBottom: 12, overflow: "hidden", opacity: enabled ? 1 : 0.6 }}>
            {editing ? (
              <div style={{ padding: "16px 18px" }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: stage.col, marginRight: 8 }} />{stage.label}
                  <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400, marginLeft: 8 }}>Sent to: {stage.owner}</span>
                </div>
                <div className="field"><label>Subject line</label><input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} /></div>
                <div className="field"><label>Email body</label><textarea style={{ minHeight: 200, fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.5 }} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} /></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn primary sm" onClick={save}>Save</button>
                  <button className="btn ghost sm" onClick={cancel}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: stage.col, flex: "none" }} />
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => startEdit(tpl)}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{stage.label}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>To: <b>{stage.owner}</b> &middot; Subject: {tpl.subject}</div>
                </div>
                <button
                  onClick={(e) => toggleEnabled(tpl, e)}
                  style={{ padding: "4px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                    background: enabled ? "var(--ok-soft)" : "var(--surface)",
                    color: enabled ? "#127a51" : "var(--muted)" }}
                >{enabled ? "✓ Required" : "Not required"}</button>
                <span className="btn sm" onClick={() => startEdit(tpl)}>Edit</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
function RolesView() {
  const { db, actions } = useStore();
  const roles = db.roles || [];
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(null);
  const startEdit = (r) => { setEditId(r.id); setForm({ name: r.name, description: r.description || "" }); };
  const startNew = () => { setEditId("__new__"); setForm({ name: "", description: "" }); };
  const cancel = () => { setEditId(null); setForm(null); };
  const save = () => {
    if (!form.name.trim()) return;
    if (editId === "__new__") {
      if (roles.some((r) => r.name.toLowerCase() === form.name.trim().toLowerCase())) { actions.toast && actions.toast("Role name already exists", 1); return; }
      actions.saveRole(null, { name: form.name.trim(), description: form.description.trim() });
    } else {
      const existing = roles.find((r) => r.id === editId);
      actions.saveRole(existing, { name: form.name.trim(), description: form.description.trim() });
    }
    cancel();
  };
  const usersWithRole = (roleName) => db.team.filter((u) => (u.roles || []).includes(roleName)).length;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Define roles that can be assigned to users. Configure their permissions under Access Control.</span>
        <button className="btn primary sm" onClick={startNew}>+ Add role</button>
      </div>
      <div className="panel" style={{ overflow: "hidden" }}>
        <table>
          <thead><tr><th>Role</th><th>Description</th><th>Users</th><th /></tr></thead>
          <tbody>
            {roles.map((r) => {
              const editing = editId === r.id;
              const isAdmin = r.name === "Admin";
              const count = usersWithRole(r.name);
              return editing ? (
                <tr key={r.id}>
                  <td><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={isAdmin} style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13 }} /></td>
                  <td><input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13 }} /></td>
                  <td className="mono">{count}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn primary sm" style={{ marginRight: 4 }} onClick={save}>Save</button>
                    <button className="btn ghost sm" style={{ marginRight: 4 }} onClick={cancel}>Cancel</button>
                    {!isAdmin && <button className="btn danger sm" onClick={() => { if (actions.deleteRole(r.id) !== false) cancel(); }}>Delete</button>}
                  </td>
                </tr>
              ) : (
                <tr className="clickable" key={r.id} onClick={() => startEdit(r)}>
                  <td style={{ fontWeight: 600 }}>{r.name}{isAdmin && <span className="tag" style={{ marginLeft: 6, background: "var(--signal-soft)", color: "var(--signal)" }}>System</span>}</td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{r.description || "—"}</td>
                  <td className="mono">{count}</td>
                  <td style={{ textAlign: "right" }}><span className="btn sm">Edit</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editId === "__new__" && (
        <div className="panel" style={{ marginTop: 12, padding: "16px 18px" }}>
          <div className="row2">
            <div className="field"><label>Role name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Logistics" /></div>
            <div className="field"><label>Description</label><input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What this role does" /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary sm" onClick={save}>Add role</button>
            <button className="btn ghost sm" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}
      <div className="note" style={{ marginTop: 14 }}><span className="ic">i</span><div>The <b>Admin</b> role cannot be deleted or renamed. Roles assigned to users cannot be deleted — reassign users first. After adding a role, go to <b>Access Control</b> to set its permissions.</div></div>
    </div>
  );
}
function CoaTemplateView() {
  const { db, commit, toast } = useStore();
  const t = db.coaTemplate || {};
  const upd = (k, v) => { db.coaTemplate = { ...db.coaTemplate, [k]: v }; commit(); };
  const uploadImg = (field) => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.onchange = (e) => { const file = e.target.files[0]; if (!file) return; const r = new FileReader(); r.onload = (ev) => upd(field, ev.target.result); r.readAsDataURL(file); }; inp.click(); };
  const imgZone = (label, field, desc) => (
    <div className="panel" style={{ padding: 18, marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>{desc}</div>
      {t[field] ? <div style={{ position: "relative", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
        <img src={t[field]} style={{ width: "100%", display: "block", maxHeight: 160, objectFit: "contain", background: "#f7f8fa" }} />
        <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 4 }}>
          <button className="btn sm" onClick={() => uploadImg(field)}>Replace</button>
          <button className="btn sm danger" onClick={() => upd(field, "")}>Remove</button>
        </div>
      </div> : <div onClick={() => uploadImg(field)} style={{ border: "2px dashed var(--line)", borderRadius: 8, padding: "28px 0", textAlign: "center", cursor: "pointer", background: "var(--surface)" }}>
        <div style={{ fontSize: 24, color: "var(--muted-2)", marginBottom: 4 }}>+</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Click to upload image</div>
      </div>}
    </div>
  );
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>Configure the Infinitee CoA letterhead. These images and settings apply to all CoAs generated from any deal.</div>
      {imgZone("Header image", "headerImg", "Company logo, name, address — appears at the top of every CoA (full width).")}
      {imgZone("Signature image", "signatureImg", "Authorized signatory's signature — appears in the 'Approved by' section.")}
      <div className="panel" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Approved by name</div>
        <div className="field"><input value={t.approvedByName || ""} onChange={(e) => upd("approvedByName", e.target.value)} placeholder="e.g. Dr. Ramesh Kumar — Authorized Signatory" /></div>
      </div>
      {imgZone("Footer image", "footerImg", "Certifications, communication address — appears at the bottom of every CoA (full width).")}
      <div className="panel" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Revision text</div>
        <div className="field"><input value={t.revision || ""} onChange={(e) => upd("revision", e.target.value)} placeholder="e.g. COA Rev 02, 04/2021" /></div>
      </div>
      <div className="note"><span className="ic">i</span><div>Changes are saved automatically. To preview, go to any deal in QC stage and click "Generate Infinitee CoA".</div></div>
    </div>
  );
}
function AccessControlView() {
  const { db, actions } = useStore();
  const [perms, setPerms] = useState(() => JSON.parse(JSON.stringify(db.permissions || DEFAULT_PERMISSIONS)));
  const AREAS = [
    ["received", "Requirement received"], ["rfq", "RFQ sent"], ["vendor", "Vendor quote received"],
    ["qc", "QC review"], ["ready", "Ready to quote"], ["approval", "Quote approval"], ["sent", "Quotation sent"], ["order", "Order confirmed"], ["closed", "Closed"],
    ["vendors", "Vendors master"], ["products", "Products master"], ["users", "User master"], ["templates", "Email templates"],
    ["compare", "Compare vendors view"],
  ];
  const nonAdminRoles = (db.roles || []).filter((r) => r.name !== "Admin").map((r) => r.name);
  const toggle = (area, action, role) => {
    setPerms((p) => {
      const next = JSON.parse(JSON.stringify(p));
      if (!next[area]) next[area] = { view: [], create: [], edit: [], delete: [] };
      const arr = next[area][action] || [];
      next[area][action] = arr.includes(role) ? arr.filter((r) => r !== role) : [...arr, role];
      return next;
    });
  };
  const save = () => actions.savePermissions(perms);
  const hasRole = (area, action, role) => ((perms[area] || {})[action] || []).includes(role);
  const firstAction = PERM_ACTIONS[0][0];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Admin always has full access. Configure permissions for other roles below. Unchecking <b>View</b> hides that stage or area from the user entirely.</span>
        <button className="btn primary sm" onClick={save}>Save permissions</button>
      </div>
      <div className="panel" style={{ overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th rowSpan={2} style={{ verticalAlign: "bottom" }}>Stage / Area</th>
              {nonAdminRoles.map((r) => <th key={r} colSpan={PERM_ACTIONS.length} style={{ textAlign: "center", borderLeft: "2px solid var(--line)" }}>{r}</th>)}
            </tr>
            <tr>
              {nonAdminRoles.map((r) => PERM_ACTIONS.map(([a, l]) => <th key={r + a} style={{ textAlign: "center", fontSize: 10, padding: "4px 6px", ...(a === firstAction ? { borderLeft: "2px solid var(--line)" } : {}) }}>{l}</th>))}
            </tr>
          </thead>
          <tbody>
            {AREAS.map(([area, label]) => (
              <tr key={area}>
                <td style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>{label}</td>
                {nonAdminRoles.map((r) => PERM_ACTIONS.map(([a]) => (
                  <td key={r + a} style={{ textAlign: "center", ...(a === firstAction ? { borderLeft: "2px solid var(--line)" } : {}) }}>
                    <input type="checkbox" checked={hasRole(area, a, r)} onChange={() => toggle(area, a, r)} style={{ width: 16, height: 16, accentColor: "var(--signal)", cursor: "pointer" }} />
                  </td>
                )))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note" style={{ marginTop: 14 }}><span className="ic">i</span><div><b>Admin</b> role always has full access to all areas and actions — it cannot be restricted.</div></div>
    </div>
  );
}
function TierTag({ v, pid, compact }) {
  const { actions, loggedInUser } = useStore();
  const uRoles = loggedInUser ? (loggedInUser.roles || []) : [];
  const canChange = uRoles.includes("Admin") || uRoles.includes("Manager") || uRoles.includes("QC Team");
  const t = vendorTier(v, pid), c = TIER_COLORS[t];
  const [showMenu, setShowMenu] = useState(false);
  const tiers = ["primary", "secondary", "other", "temporary"];
  return (
    <span className="tag" style={{ background: c.bg, color: c.fg, marginRight: 4, marginBottom: 2, gap: 5, position: "relative" }}>
      {v.name}{!compact && <span style={{ fontSize: 10, opacity: .7, textTransform: "uppercase", letterSpacing: ".03em" }}>{t}</span>}
      {canChange && <button title="Change tier" onClick={(e) => { e.stopPropagation(); setShowMenu((s) => !s); }} style={{ border: "none", background: "none", cursor: "pointer", color: c.fg, fontWeight: 700, fontSize: 11, lineHeight: 1, padding: "0 0 0 2px" }}>▼</button>}
      {showMenu && <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 10, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,.12)", padding: 4, minWidth: 120 }} onClick={(e) => e.stopPropagation()}>
        {tiers.map((tier) => { const tc = TIER_COLORS[tier]; return (
          <div key={tier} onClick={() => { actions.promoteVendor(v.id, pid, tier); setShowMenu(false); }} style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 4, background: t === tier ? tc.bg : "transparent", color: tc.fg, display: "flex", alignItems: "center", gap: 6 }}>
            {t === tier && <span>✓</span>}{tier}
          </div>
        ); })}
      </div>}
    </span>
  );
}
function EditableCell({ value, onSave, canEdit, placeholder, emptyLabel, style }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");
  const save = () => { if (val.trim()) { onSave(val.trim()); } setEditing(false); };
  if (editing && canEdit) return <td><input value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} autoFocus style={{ width: "100%", padding: "4px 8px", border: "1px solid var(--signal)", borderRadius: 4, fontSize: 13, outline: "none" }} /></td>;
  return <td onClick={() => canEdit && setEditing(true)} style={{ cursor: canEdit ? "pointer" : "default", ...style }}>{value ? <span style={style}>{value}</span> : <span className="tag" style={{ background: "var(--signal-soft)", color: "var(--signal)", fontSize: 10 }}>{canEdit ? (emptyLabel || "Click to set") : "Not set"}</span>}</td>;
}
function BrandNameCell({ product: p, canEdit }) {
  const { commit } = useStore();
  return <EditableCell value={p.brandName} onSave={(v) => { p.brandName = v; commit(); }} canEdit={canEdit} style={{ fontWeight: 500, color: "var(--info)" }} />;
}
function CatalogView() {
  const { db, openModal, canDo, actions, commit, toast } = useStore();
  const canEdit = canDo("products", "edit");
  const tierOrder = ["primary", "secondary", "other", "temporary"];
  const [showInactive, setShowInactive] = useState(false);
  const [productQ, setProductQ] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const toggleProduct = (p) => { p.active = !p.active; commit(); toast(p.name + (p.active ? " activated" : " deactivated")); };
  const inactiveCount = db.products.filter((p) => p.active === false).length;
  const displayed = (showInactive ? db.products : db.products.filter((p) => p.active !== false))
    .filter((p) => !productQ.trim() || p.name.toLowerCase().includes(productQ.trim().toLowerCase()))
    .slice().sort((a, b) => sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <input value={productQ} onChange={(e) => setProductQ(e.target.value)} placeholder="Search products…" style={{ maxWidth: 260 }} />
          <span style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap" }}>{inactiveCount > 0 && <button className="btn ghost sm" style={{ fontSize: 11 }} onClick={() => setShowInactive((s) => !s)}>{showInactive ? "Hide" : "Show"} {inactiveCount} inactive</button>}</span>
        </span>
        {canDo("products", "create") && <span style={{ display: "flex", gap: 8 }}>
          <button className="btn sm" onClick={() => openModal({ kind: "import" })}>Import vendors &amp; products</button>
          <button className="btn primary sm" onClick={() => openModal({ kind: "addProduct" })}>+ Add product</button>
        </span>}
      </div>
      {displayed.length ? (
        <div className="panel" style={{ overflow: "hidden" }}>
          <table><thead><tr>
            <th style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }} onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}>Product {sortDir === "asc" ? "↑" : "↓"}</th>
            <th>Infin Brand Name</th>{canEdit && <th>Status</th>}<th>Primary</th><th>Secondary</th><th>Other</th><th>Temporary</th></tr></thead>
            <tbody>{displayed.map((p) => {
              const isActive = p.active !== false;
              return (
                <tr key={p.id} style={isActive ? {} : { opacity: 0.5 }}>
                  <EditableCell value={p.name} onSave={(v) => { p.name = v; commit(); }} canEdit={canEdit} style={{ fontWeight: 600 }} />
                  <BrandNameCell product={p} canEdit={canEdit} />
                  {canEdit && <td><button className={"btn sm " + (isActive ? "ok" : "danger")} style={{ fontSize: 11, padding: "3px 10px", minWidth: 70 }} onClick={() => toggleProduct(p)}>{isActive ? "Active" : "Inactive"}</button></td>}
                  {tierOrder.map((tier) => { const vs = vendorsForProductByTier(db, p.id, tier); return (
                    <td key={tier} style={{ lineHeight: 2.1 }}>{vs.length ? vs.map((v) => <TierTag key={v.id} v={v} pid={p.id} compact />) : <span style={{ color: "var(--muted-2)", fontSize: 12 }}>—</span>}</td>
                  ); })}
                </tr>);
            })}</tbody>
          </table>
        </div>
      ) : <Empty big="No products yet" sub="Add a product, or import a vendor list to populate your catalog." />}
    </div>
  );
}

/* ------------------------------ compare view -------------------------------- */
function CompareView({ deal }) {
  const { db, openModal, canDo, isManager, canActOnDeal } = useStore();
  const q = useContext(QuoteDraft);
  const allRfqs = deal.rfqs;
  const vendorCount = allRfqs.length;
  const canAct = canActOnDeal(deal, deal.status, "edit") || canDo("vendor", "edit") || isManager;
  const rt = deal.rfqTerms || {};
  const req = rt.required || {};
  const pName = deal.productId ? (product(db, deal.productId) || {}).name : deal.products;

  const hdr = { fontSize: 13, fontWeight: 700, padding: "12px 14px", background: "var(--surface)", borderBottom: "2px solid var(--line)", position: "sticky", left: 0, zIndex: 1 };
  const lbl = { padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap", background: "var(--card)", borderRight: "1px solid var(--line-2)", position: "sticky", left: 0, zIndex: 1, minWidth: 140 };
  const val = { padding: "6px 14px", fontSize: 13, borderRight: "1px solid var(--line-2)", minWidth: 170, verticalAlign: "top" };
  const sectionHead = (label, color) => (
    <tr><td colSpan={vendorCount + 1} style={{ ...hdr, color: color || "var(--ink)", borderTop: "3px solid " + (color || "var(--line)") }}>{label}</td></tr>
  );

  const rfqFields = [
    ["productName", "Product", rt.productName || pName],
    ["qty", "Quantity", rt.qty || (deal.qty + " " + (deal.unit || ""))],
    ["packSize", "Pack size", rt.packSize],
    ["incoterm", "Incoterm", rt.incoterm],
    ["priceValidity", "Price validity", rt.priceValidity],
    ["hsn", "HSN code", rt.hsn],
  ];

  const quoteFields = [
    ["price", "Price / Kg"],
    ["currency", "Currency"],
    ["incoterm", "IncoTerm"],
    ["packaging", "Packaging"],
    ["packSize", "Pack Size"],
    ["qtyPallet", "Qty / Pallet"],
    ["qtyContainer", "Qty / Container"],
    ["leadTime", "Lead Time"],
    ["hsnCode", "HSN Code"],
    ["priceValidity", "Price Validity"],
    ["terms", "Payment Terms"],
    ["deviations", "Deviations"],
  ];

  const QUOTE_ROWS = [
    { k: "incoterm", label: "Incoterm (vendor)", level: "fob", text: true },
    { k: "exWorks", label: "Ex-Works", level: "fob" }, { k: "freightInland", label: "Freight (Inland)", level: "fob" },
    { k: "cnf", label: "C&F", level: "fob" }, { k: "fob", label: "FOB", calc: true, level: "fob" },
    { k: "seaFreight", label: "Sea Freight", level: "cif" }, { k: "cif", label: "CIF", calc: true, level: "cif" },
    { k: "duty", label: "Duty", level: "exWarehouse" }, { k: "tariff", label: "Tariff", level: "exWarehouse" },
    { k: "otherCosts", label: "Other Costs", level: "exWarehouse" }, { k: "exWarehouse", label: "Ex-Warehouse", calc: true, level: "exWarehouse" },
    { k: "freightDelivery", label: "Freight (Delivery)", level: "final" },
  ];

  return (
    <div>
      <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ ...lbl, fontWeight: 700, fontSize: 12, background: "var(--surface)", position: "sticky", top: 0, zIndex: 3, boxShadow: "0 2px 4px rgba(0,0,0,.08)" }}></th>
            {allRfqs.map((r) => {
              const v = vendor(db, r.vendorId);
              const done = !!r.response;
              const tier = deal.productId ? vendorTier(v, deal.productId) : null;
              const tc = tier ? TIER_COLORS[tier] : null;
              return <th key={r.vendorId} style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, background: "var(--surface)", borderRight: "1px solid var(--line-2)", minWidth: 170, textAlign: "left", position: "sticky", top: 0, zIndex: 2, boxShadow: "0 2px 4px rgba(0,0,0,.08)" }}>
                {v.name}
                {tc && <span className="tag" style={{ background: tc.bg, color: tc.fg, marginLeft: 6, fontSize: 9, textTransform: "uppercase" }}>{tier}</span>}
                <div style={{ fontSize: 11, fontWeight: 400, color: done ? "var(--ok)" : "var(--signal)", marginTop: 2 }}>{done ? "Quote received" : "Pending"}</div>
              </th>;
            })}
          </tr>
        </thead>
        <tbody>
          {/* Bucket 1: Enquiry */}
          {sectionHead("1. Enquiry", "#3a6ea5")}
          {[["Customer", deal.customer], ["Product", pName + (brandLabel(db, deal) ? " (" + brandLabel(db, deal) + ")" : "")], ["Quantity", deal.qty + " " + (deal.unit || "")], ["Specification", deal.spec || "—"], ["Timeline", deal.timeline || "—"], ["Application", deal.application || "Not known"], ["Channel", deal.channel], ["Owner", member(db, deal.ownerId).name]].map(([k, v]) => (
            <tr key={k}><td style={lbl}>{k}</td><td colSpan={vendorCount} style={val}>{v}</td></tr>
          ))}

          {/* Bucket 2: RFQ Terms */}
          {sectionHead("2. RFQ terms sent to vendors", "#7d5ba6")}
          {deal.rfqTerms ? rfqFields.filter(([, , v]) => v).map(([k, label, v]) => (
            <tr key={k}><td style={lbl}>{label}</td><td colSpan={vendorCount} style={val}>{v}</td></tr>
          )) : <tr><td style={lbl}>—</td><td colSpan={vendorCount} style={{ ...val, color: "var(--muted)" }}>No RFQ terms recorded</td></tr>}
          {REQ_ITEMS.filter(([k]) => req[k]).length > 0 && <tr><td style={lbl}>Required items</td><td colSpan={vendorCount} style={{ ...val, lineHeight: 2 }}>
            {REQ_ITEMS.filter(([k]) => req[k]).map(([k, l]) => <span key={k} className="tag" style={{ marginRight: 4, background: "var(--ok-soft)", color: "#127a51" }}>{l}</span>)}
          </td></tr>}

          {/* Bucket 3: Vendor Quotes */}
          {sectionHead("3. Vendor quotes", "#c98a00")}
          {quoteFields.map(([k, label]) => (
            <tr key={k}>
              <td style={lbl}>{label}</td>
              {allRfqs.map((r) => {
                if (!r.response) {
                  return <td key={r.vendorId} style={{ ...val, color: "var(--muted-2)", fontStyle: "italic" }}>—</td>;
                }
                const v = r.response[k] || r.response[k === "hsnCode" ? "hsn" : ""] || "";
                if (k === "price") {
                  return <td key={r.vendorId} style={{ ...val, fontWeight: 700, fontFamily: "var(--mono)", fontSize: 14 }}>{money(r.response.price, curSymbol(r.response.currency))}</td>;
                }
                return <td key={r.vendorId} style={val}>{v || "—"}</td>;
              })}
            </tr>
          ))}
          <tr>
            <td style={lbl}>Status</td>
            {allRfqs.map((r) => (
              <td key={r.vendorId} style={val}>
                {r.response
                  ? <span className="sla ok"><span className="pip" />Received</span>
                  : canAct
                    ? <button className="btn sm primary" onClick={() => openModal({ kind: "recordQuote", dealId: deal.id, vendorId: r.vendorId })}>Log quote</button>
                    : <span className="sla warn"><span className="pip" />Pending</span>}
              </td>
            ))}
          </tr>

          {/* Bucket 4: Vendor Documents */}
          {sectionHead("4. Vendor documents", "#0e8f8f")}
          {DOC_TYPES.map(([k, label]) => (
            <tr key={k}>
              <td style={lbl}>{label}</td>
              {allRfqs.map((r) => {
                if (!r.response) return <td key={r.vendorId} style={{ ...val, color: "var(--muted-2)" }}>—</td>;
                const atts = (r.response.attachments || []).filter((a) => a.docType === label);
                const hasFlag = r.response.docs && r.response.docs[k];
                return <td key={r.vendorId} style={val}>
                  {atts.length > 0 ? <div>{atts.map((f, i) => <div key={i} style={{ marginBottom: 3 }}><SpecFiles files={[f]} /></div>)}</div>
                    : hasFlag ? <span className="tag" style={{ background: "var(--ok-soft)", color: "#127a51" }}>Provided (no file)</span>
                    : <span className="tag" style={{ background: "var(--breach-soft)", color: "var(--breach)" }}>Missing</span>}
                </td>;
              })}
            </tr>
          ))}
          <tr>
            <td style={lbl}>Other docs</td>
            {allRfqs.map((r) => {
              if (!r.response) return <td key={r.vendorId} style={{ ...val, color: "var(--muted-2)" }}>—</td>;
              const others = (r.response.attachments || []).filter((a) => a.docType === "Other");
              return <td key={r.vendorId} style={val}>{others.length > 0 ? others.map((f, i) => <div key={i} style={{ marginBottom: 3 }}><SpecFiles files={[f]} /></div>) : <span style={{ color: "var(--muted-2)" }}>—</span>}</td>;
            })}
          </tr>

          {/* Bucket 5: QC Checklist (per vendor) */}
          {sectionHead("5. QC checklist", "#0e8f8f")}
          {(() => { const vqc = deal.vendorQc || {}; return <>
            {[["spec", "CoA meets general spec"], ["custspec", "CoA meets customer spec"], ["vendor", "Vendor approval confirmed"], ["docs", "All documents present"]].map(([k, l]) => (
              <tr key={k}>
                <td style={lbl}>{l}</td>
                {allRfqs.map((r) => { const q = vqc[r.vendorId]; return (
                  <td key={r.vendorId} style={val}>{!r.response ? <span style={{ color: "var(--muted-2)" }}>—</span> : !q ? <span style={{ color: "var(--muted-2)" }}>Pending</span> : q.checklist && q.checklist[k] ? <span style={{ color: "var(--ok)", fontWeight: 600 }}>Yes</span> : <span style={{ color: "var(--breach)", fontWeight: 600 }}>No</span>}</td>
                ); })}
              </tr>
            ))}
            <tr>
              <td style={lbl}>QC result</td>
              {allRfqs.map((r) => { const q = vqc[r.vendorId]; return (
                <td key={r.vendorId} style={val}>{!r.response ? <span style={{ color: "var(--muted-2)" }}>—</span> : !q ? <span className="tag" style={{ background: "var(--signal-soft)", color: "var(--signal)" }}>Not reviewed</span> : <span className="tag" style={{ background: q.result === "approved" ? "var(--ok-soft)" : q.result === "deviation" ? "var(--signal-soft)" : "var(--breach-soft)", color: q.result === "approved" ? "#127a51" : q.result === "deviation" ? "var(--signal)" : "var(--breach)" }}>{q.result === "approved" ? "Approved" : q.result === "deviation" ? "Approved w/ deviation" : "Rejected"}</span>}</td>
              ); })}
            </tr>
            <tr>
              <td style={lbl}>QC notes</td>
              {allRfqs.map((r) => { const q = vqc[r.vendorId]; return (
                <td key={r.vendorId} style={val}>{q && q.notes ? q.notes : <span style={{ color: "var(--muted-2)" }}>—</span>}</td>
              ); })}
            </tr>
            <tr>
              <td style={lbl}>Reviewed by</td>
              {allRfqs.map((r) => { const q = vqc[r.vendorId]; return (
                <td key={r.vendorId} style={val}>{q ? <>{member(db, q.reviewerId).name}<div style={{ fontSize: 11, color: "var(--muted)" }}>{fmtWhen(q.reviewedAt)}</div></> : <span style={{ color: "var(--muted-2)" }}>—</span>}</td>
              ); })}
            </tr>
          </>; })()}

          {/* Bucket 6: QC Documents (per vendor) */}
          {sectionHead("6. QC documents", "#0e8f8f")}
          {(() => { const vqc = deal.vendorQc || {}; return (
            <tr>
              <td style={lbl}>Documents</td>
              {allRfqs.map((r) => { const q = vqc[r.vendorId]; const files = q && q.files ? q.files : []; return (
                <td key={r.vendorId} style={val}>{files.length > 0 ? files.map((f, i) => <div key={i} style={{ marginBottom: 3 }}><SpecFiles files={[f]} /></div>) : <span style={{ color: "var(--muted-2)" }}>—</span>}</td>
              ); })}
            </tr>
          ); })()}

          {/* Bucket 7: Quote Builder */}
          {sectionHead("7. Quote builder", "#e8742c")}
          {deal.rfqs.some((r) => r.response) ? <>
            <tr>
              <td style={lbl}>Quote up to</td>
              <td colSpan={vendorCount} style={val}>
                <select value={q.quoteUpTo || "final"} onChange={(e) => q.set({ quoteUpTo: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "4px 8px", fontSize: 13, fontWeight: 600 }}>
                  {[["fob", "FOB"], ["cif", "CIF"], ["exWarehouse", "Ex-Warehouse"], ["final", "Delivered (full)"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </td>
            </tr>
            {(() => {
              const lvlOrder = ["fob", "cif", "exWarehouse", "final"];
              const upTo = q.quoteUpTo || "final";
              const cut = lvlOrder.indexOf(upTo);
              const visibleRows = QUOTE_ROWS.filter((r) => lvlOrder.indexOf(r.level) <= cut);
              const pk = upTo === "fob" ? "fob" : upTo === "cif" ? "cif" : upTo === "exWarehouse" ? "exWarehouse" : "priceQuote";
              return <>
                {visibleRows.map((row) => {
                  const isCalc = row.calc;
                  const isText = row.text;
                  return (
                    <tr key={row.k} style={isCalc ? { background: "var(--surface)" } : {}}>
                      <td style={{ ...lbl, color: isCalc ? "var(--ok)" : "var(--muted)", fontWeight: isCalc ? 700 : 600 }}>{row.label}</td>
                      {allRfqs.map((r) => {
                        if (!r.response) return <td key={r.vendorId} style={{ ...val, color: "var(--muted-2)" }}>—</td>;
                        const col = q.cols[r.vendorId] || {};
                        const calc = q.colCalc(col);
                        if (isText) {
                          const fallback = r.response.incoterm || "";
                          const v = col[row.k] !== undefined ? col[row.k] : fallback;
                          return <td key={r.vendorId} style={{ padding: "4px 8px", borderRight: "1px solid var(--line-2)" }}>
                            <input value={v} onChange={(e) => q.setCol(r.vendorId, row.k, e.target.value)} placeholder={fallback || "e.g. FOB"} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 5, padding: "5px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", background: v ? "#fff" : "var(--ok-soft)", color: "var(--ink)", fontWeight: 600, boxSizing: "border-box" }} />
                          </td>;
                        }
                        if (isCalc) return <QCell key={r.vendorId} value={col[row.k] || ""} onChange={(v) => q.setCol(r.vendorId, row.k, v)} calcFallback={calc[row.k]} cur={q.currency} />;
                        return <QCell key={r.vendorId} value={col[row.k] || ""} onChange={(v) => q.setCol(r.vendorId, row.k, v)} cur={q.currency} />;
                      })}
                    </tr>
                  );
                })}
                <tr style={{ borderTop: "2px solid var(--line)", background: "var(--surface)" }}>
                  <td style={{ ...lbl, fontWeight: 700, fontSize: 12, color: "var(--ok)" }}>{[["fob", "FOB"], ["cif", "CIF"], ["exWarehouse", "Ex-Warehouse"], ["final", "Delivered"]].find(([k]) => k === upTo)?.[1] || "Price"} subtotal</td>
                  {allRfqs.map((r) => {
                    if (!r.response) return <td key={r.vendorId} style={{ ...val, color: "var(--muted-2)" }}>—</td>;
                    const col = q.cols[r.vendorId] || {};
                    const calc = q.colCalc(col);
                    return <td key={r.vendorId} className="mono" style={{ ...val, fontSize: 13, fontWeight: 700, color: "var(--ok)" }}>{money(calc[pk] || 0, q.currency)}</td>;
                  })}
                </tr>
                <tr>
                  <td style={lbl}>Margins</td>
                  {allRfqs.map((r) => {
                    if (!r.response) return <td key={r.vendorId} style={{ ...val, color: "var(--muted-2)" }}>—</td>;
                    const col = q.cols[r.vendorId] || {};
                    return <QCell key={r.vendorId} value={col.margins || ""} onChange={(v) => q.setCol(r.vendorId, "margins", v)} cur={q.currency} />;
                  })}
                </tr>
                <tr style={{ borderTop: "2px solid var(--ok)" }}>
                  <td style={{ ...lbl, fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>Price to quote</td>
                  {allRfqs.map((r) => {
                    if (!r.response) return <td key={r.vendorId} style={{ ...val, color: "var(--muted-2)" }}>—</td>;
                    const col = q.cols[r.vendorId] || {};
                    const calc = q.colCalc(col);
                    const sel = q.selectedVendorId === r.vendorId;
                    const subtotal = calc[pk] || 0;
                    const margin = evalExpr(col.margins);
                    return <td key={r.vendorId} className="mono" style={{ ...val, fontSize: 15, fontWeight: 700, color: "var(--ok)", background: sel ? "var(--ok-soft)" : undefined }}>{money(subtotal + margin, q.currency)}<span style={{ fontSize: 10, fontWeight: 400, color: "var(--muted)" }}> /{deal.unit || "unit"}</span></td>;
                  })}
                </tr>
              </>;
            })()}
            <tr>
              <td style={{ ...lbl, color: "var(--muted)" }}>Select vendor</td>
              {allRfqs.map((r) => {
                if (!r.response) return <td key={r.vendorId} style={{ ...val, color: "var(--muted-2)" }}>—</td>;
                const sel = q.selectedVendorId === r.vendorId;
                return <td key={r.vendorId} style={{ ...val, textAlign: "center", background: sel ? "var(--ok-soft)" : undefined }}>
                  <input type="radio" name="cmpQuoteSelect" checked={sel} onChange={() => q.set({ selectedVendorId: r.vendorId })} style={{ width: 18, height: 18, accentColor: "var(--ok)", cursor: "pointer" }} />
                </td>;
              })}
            </tr>
          </> : <tr><td style={lbl}>—</td><td colSpan={vendorCount} style={{ ...val, color: "var(--muted)" }}>No vendor quotes received yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------- drawer ----------------------------------- */
function DealDrawer({ dealId, initialTab = "current" }) {
  const { db, closeDrawer, loggedInUser, canActOnDeal, isManager, canDo } = useStore();
  const deal = db.deals.find((d) => d.id === dealId) || null;

  // stage-form drafts live here so the body forms and the footer buttons share them
  const pName = deal && deal.productId ? (product(db, deal.productId) || {}).name : deal ? deal.products : "";
  const matchedCount = deal ? (deal.productId ? vendorsForProduct(db, deal.productId) : vendorsMatchingText(db, deal.products)).length : 0;
  const rfqDraft = deal && deal.stageDrafts && deal.stageDrafts.received;
  const [rfq, setRfq] = useState(() => ({ productName: rfqDraft ? rfqDraft.productName : pName, qty: rfqDraft ? rfqDraft.qty : (deal ? (deal.qty || "") + (deal.unit ? " " + deal.unit : "") : ""), packSize: rfqDraft ? rfqDraft.packSize : "", incoterm: rfqDraft ? rfqDraft.incoterm : "", priceValidity: rfqDraft ? rfqDraft.priceValidity : "", hsn: rfqDraft ? rfqDraft.hsn : "", hrs: rfqDraft ? rfqDraft.hrs : 36, picks: rfqDraft ? rfqDraft.picks : [], showAll: matchedCount === 0, required: rfqDraft ? rfqDraft.required : { pricePerKg: true, incoterm: true, packaging: true, packSize: true, qtyPallet: true, qtyContainer: true, leadTime: true, hsnCode: true, sdsTdsCoa: true }, additionalInfo: rfqDraft ? rfqDraft.additionalInfo : "" }));
  const rfqStore = { ...rfq, set: (p) => setRfq((x) => ({ ...x, ...p })) };

  const qcDocRefs = { sds: useRef(null), tds: useRef(null), coa: useRef(null) };
  const [qc, setQc] = useState(() => {
    const vqc = deal ? (deal.vendorQc || {}) : {};
    const qcDraft = deal && deal.stageDrafts && deal.stageDrafts.qc;
    const rqs = deal ? deal.rfqs.filter((r) => r.response) : [];
    const vs = {};
    rqs.forEach((r) => { const dr = qcDraft && qcDraft.vendorStates && qcDraft.vendorStates[r.vendorId]; const ex = vqc[r.vendorId]; vs[r.vendorId] = dr || (ex ? { checklist: ex.checklist || {}, notes: ex.notes || "" } : { checklist: {}, notes: "" }); });
    return { checklist: {}, notes: "", otherSlots: [{ id: "qo0", ref: null }], selectedVendorId: null, vendorStates: vs };
  });
  const qcStore = { ...qc, docRefs: qcDocRefs, set: (p) => setQc((x) => ({ ...x, ...p })) };

  const quotedRfqs = deal ? deal.rfqs.filter((r) => r.response) : [];
  const emptyCol = () => ({ incoterm: "", exWorks: "", freightInland: "", cnf: "", fob: "", seaFreight: "", cif: "", duty: "", tariff: "", otherCosts: "", exWarehouse: "", freightDelivery: "", margins: "" });
  const initCols = () => {
    const cols = {};
    quotedRfqs.forEach((r) => { cols[r.vendorId] = { ...emptyCol(), incoterm: r.response.incoterm || "", exWorks: r.response.price || "" }; });
    return cols;
  };
  const quoteDraft = deal && deal.stageDrafts && deal.stageDrafts.ready;
  const [quote, setQuote] = useState(() => {
    if (quoteDraft) {
      const baseCols = initCols();
      const mergedCols = { ...baseCols };
      Object.keys(quoteDraft.cols || {}).forEach((vid) => { mergedCols[vid] = { ...(baseCols[vid] || emptyCol()), ...quoteDraft.cols[vid] }; });
      return { ...quoteDraft, cols: mergedCols };
    }
    return { cols: initCols(), currency: "₹", terms: "", selectedVendorId: quotedRfqs.length === 1 ? quotedRfqs[0].vendorId : null, quoteUpTo: "final" };
  });
  const setCol = (vid, field, val) => setQuote((q) => ({ ...q, cols: { ...q.cols, [vid]: { ...q.cols[vid], [field]: val } } }));
  const colCalc = (col) => {
    const e = (f) => evalExpr(col[f]);
    const fob = col.fob ? e("fob") : e("exWorks") + e("freightInland") + e("cnf");
    const cif = col.cif ? e("cif") : fob + e("seaFreight");
    const exWarehouse = col.exWarehouse ? e("exWarehouse") : cif + e("duty") + e("tariff") + e("otherCosts");
    const priceQuote = exWarehouse + e("freightDelivery") + e("margins");
    return { fob, cif, exWarehouse, priceQuote };
  };
  const quoteStore = { ...quote, setCol, colCalc, set: (p) => setQuote((x) => ({ ...x, ...p })) };

  const [drawerTab, setDrawerTab] = useState(initialTab);

  if (!deal) return null;
  const st = STAGE[deal.status], s = slaFor(deal);
  const stepIdx = STAGES.findIndex((x) => x.k === deal.status);
  const showCompareTab = deal.rfqs.length > 0 && deal.status !== "received" && canDo("compare", "view");
  return (
    <RfqDraft.Provider value={rfqStore}><QcDraft.Provider value={qcStore}><QuoteDraft.Provider value={quoteStore}>
      <div className="dr-head" style={drawerTab === "compare" ? { padding: "10px 22px" } : undefined}>
        {drawerTab === "compare" ? <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="card-id" style={{ fontSize: 11 }}>{deal.id}</span>
            <span className="tag" style={{ background: st.col + "1a", color: st.col, fontSize: 10 }}>{st.label}</span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{deal.customer}</span>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>{productWithBrand(db, deal)} · {deal.qty} {deal.unit}</span>
            {s.state !== "none" && <Sla s={s} style={{ marginLeft: "auto" }} />}
            <button className="x" onClick={closeDrawer} style={{ marginLeft: s.state === "none" ? "auto" : 0 }}>×</button>
          </div>
        </> : <>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="card-id">{deal.id}</span>
            <span className="tag" style={{ background: st.col + "1a", color: st.col }}>{st.label}</span>
            {s.state !== "none" ? <Sla s={s} style={{ marginLeft: "auto" }} /> : <span style={{ marginLeft: "auto" }} />}
            <button className="x" onClick={closeDrawer}>×</button>
          </div>
          <h2 style={{ fontSize: 22, marginTop: 8 }}>{deal.customer}</h2>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>{productWithBrand(db, deal)} · {deal.qty} {deal.unit}</div>
          <div className="stepper">{STAGES.filter((x) => x.k !== "closed").map((x, i, arr) => (
            <React.Fragment key={x.k}>
              <div className={"step " + (i < stepIdx ? "done" : i === stepIdx ? "cur" : "")}><span className="n">{i < stepIdx ? "✓" : i + 1}</span>{x.label.split(" ")[0]}</div>
              {i < arr.length - 1 && <span className="step-line" />}
            </React.Fragment>))}</div>
        </>}
        {showCompareTab && <div style={{ display: "flex", gap: 0, marginTop: drawerTab === "compare" ? 8 : 12, borderBottom: "2px solid var(--line)" }}>
          {[["current", "Deal view"], ["compare", "Compare vendors"]].map(([k, l]) => (
            <button key={k} onClick={() => setDrawerTab(k)} style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600, border: "none", borderBottom: drawerTab === k ? "2px solid var(--signal)" : "2px solid transparent", marginBottom: -2, background: "none", color: drawerTab === k ? "var(--signal)" : "var(--muted)", cursor: "pointer" }}>{l}</button>
          ))}
        </div>}
        {drawerTab !== "compare" && loggedInUser && deal.ownerId !== loggedInUser.id && !isManager && (
          <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--line)", fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            Read-only — this deal is assigned to <b style={{ marginLeft: 2 }}>{member(db, deal.ownerId).name}</b>
          </div>
        )}
        {deal.deleteRequest && (
          <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 6, background: "var(--breach-soft)", border: "1px solid var(--breach)", fontSize: 12, color: "var(--breach)", display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "none" }}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
            <span style={{ flex: 1 }}><b>Deletion requested</b> by {member(db, deal.deleteRequest.requestedBy).name}: "{deal.deleteRequest.reason}"</span>
            {isManager && <>
              <button className="btn danger sm" onClick={() => openModal({ kind: "deleteDeal", dealId: deal.id })}>Archive</button>
              <button className="btn ghost sm" style={{ color: "var(--muted)" }} onClick={() => actions.denyDeleteRequest(deal)}>Deny</button>
            </>}
          </div>
        )}
      </div>
      {drawerTab === "current" ? <div className="dr-body">
        {deal.rfqTerms
          ? <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}><Overview deal={deal} /></div>
              <div style={{ flex: 1, minWidth: 0 }}><RfqTerms deal={deal} /></div>
            </div>
          : <Overview deal={deal} />}
        {deal.status === "qc" && deal.rfqs.length > 0 && <RFQPanel deal={deal} />}
        {deal.status === "ready" && deal.rfqs.length > 0 && <RFQPanel deal={deal} />}
        <StageSection deal={deal} />
        {deal.rfqs.length > 0 && !["received", "rfq", "qc", "ready"].includes(deal.status) && <RFQPanel deal={deal} />}
        {deal.qc && deal.qc.files && deal.qc.files.length > 0 && <Documents deal={deal} />}
        <AuditLog deal={deal} />
      </div> : <div className="dr-body" style={{ padding: 0 }}><CompareView deal={deal} /></div>}
      <Footer deal={deal} />
    </QuoteDraft.Provider></QcDraft.Provider></RfqDraft.Provider>
  );
}
function Overview({ deal }) {
  const { db, openDeal } = useStore();
  return (
    <div className="block"><h4>Enquiry</h4>
      <dl className="kv">
        <dt>Customer</dt><dd>{deal.customer}</dd>
        {deal.contactPerson && <><dt>Contact</dt><dd>{deal.contactPerson}</dd></>}
        {deal.contactPhone && <><dt>Phone</dt><dd><a href={"tel:" + deal.contactPhone}>{deal.contactPhone}</a></dd></>}
        {deal.contactEmail && <><dt>Email</dt><dd><a href={"mailto:" + deal.contactEmail}>{deal.contactEmail}</a></dd></>}
        <dt>Channel</dt><dd>{deal.channel}</dd>
        <dt>Product</dt><dd>{deal.products}{brandLabel(db, deal) && <span style={{ color: "var(--info)", fontWeight: 600, marginLeft: 6 }}>({brandLabel(db, deal)})</span>}{deal.productId && !(product(db, deal.productId) || {}).brandName && <span className="tag" style={{ background: "var(--signal-soft)", color: "var(--signal)", marginLeft: 6, fontSize: 10 }}>No brand name</span>}</dd>
        <dt>Quantity</dt><dd>{deal.qty} {deal.unit}</dd>
        <dt>Specification</dt><dd>{deal.spec || <span style={{ color: "var(--muted-2)" }}>none provided</span>}</dd>
        <dt>Spec files</dt><dd><SpecFiles files={deal.specFiles} /></dd>
        <dt>Delivery</dt><dd>{deal.timeline || "—"}</dd>
        <dt>Application</dt><dd>{deal.application || "Not known"}</dd>
        {deal.restrictions && deal.restrictions.length > 0 && <><dt>Approved vendors</dt><dd style={{ lineHeight: 2 }}>{deal.restrictions.map((vid) => <span className="tag" key={vid} style={{ marginRight: 4 }}>{vendor(db, vid).name}</span>)}</dd></>}
        <dt>Priority</dt><dd>{deal.priority ? (() => { const pc = PRIORITY_COLORS[deal.priority] || PRIORITY_COLORS.Medium; return <span className="tag" style={{ background: pc.bg, color: pc.fg }}>{deal.priority}</span>; })() : "—"}</dd>
        <dt>Owner</dt><dd>{member(db, deal.ownerId).name}</dd>
        <dt>Raised</dt><dd>{fmtWhen(deal.createdAt)}</dd>
      </dl>
      {deal.groupId && (() => {
        const grouped = db.deals.filter((d) => d.groupId === deal.groupId && d.id !== deal.id);
        if (!grouped.length) return null;
        return (
          <div style={{ marginTop: 12, padding: "10px 12px", background: "#f3e8ff", borderRadius: 8, border: "1px solid #e0d0f0" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#7d5ba6", marginBottom: 6 }}>Grouped enquiry · {deal.groupId} · {grouped.length + 1} products</div>
            {grouped.map((g) => { const gst = STAGE[g.status]; return (
              <div key={g.id} onClick={() => openDeal(g.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer", fontSize: 12.5 }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{g.id}</span>
                <span style={{ fontWeight: 500, flex: 1 }}>{g.products}</span>
                <span className="tag" style={{ background: gst.col + "1a", color: gst.col, fontSize: 10 }}>{gst.label}</span>
              </div>); })}
          </div>);
      })()}
    </div>
  );
}
function RfqTerms({ deal }) {
  const t = deal.rfqTerms || {};
  const req = t.required || {};
  const checkedItems = REQ_ITEMS.filter(([k]) => req[k]);
  const termParts = [
    `Product: ${t.productName || deal.products}`,
    t.qty && `Qty: ${t.qty}`,
    t.incoterm && `Incoterm: ${t.incoterm}`,
    t.packSize && `Pack size: ${t.packSize}`,
    t.priceValidity && `Price validity: ${t.priceValidity}`,
    t.hsn && `HSN: ${t.hsn}`,
    t.spec && `Spec: ${t.spec}`,
    t.timeline && `Delivery: ${t.timeline}`,
    t.contactPerson && `Contact: ${t.contactPerson}`,
  ].filter(Boolean);
  return (
    <div className="block"><h4>RFQ terms sent to vendors</h4>
      <p style={{ fontSize: 13, margin: "0 0 6px", lineHeight: 1.7, color: "var(--ink)" }}>{termParts.join(" · ")}</p>
      {checkedItems.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
        <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center", marginRight: 2 }}>Required:</span>
        {checkedItems.map(([k, l]) => <span key={k} className="tag" style={{ background: "var(--ok-soft)", color: "#127a51" }}>{l} ✓</span>)}
      </div>}
      {t.additionalInfo && <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0" }}>{t.additionalInfo}</p>}
    </div>
  );
}
function QuoteComparison({ deal }) {
  const { db } = useStore();
  const rows = deal.rfqs.filter((r) => r.response).sort((a, b) => parseFloat(a.response.price) - parseFloat(b.response.price));
  return (
    <div className="block" style={{ padding: 0, overflow: "hidden" }}>
      <h4 style={{ padding: "16px 18px 0" }}>Quotes received — commercial terms</h4>
      <table style={{ marginTop: 8 }}>
        <thead><tr><th>Vendor</th><th>Price/kg</th><th>IncoTerm</th><th>Packaging</th><th>Pack Size</th><th>Qty/Pallet</th><th>Qty/Container</th><th>Lead time</th><th>HSN</th><th>Validity</th></tr></thead>
        <tbody>{rows.map((r, i) => { const x = r.response; return (
          <tr key={r.vendorId}>
            <td style={{ fontWeight: 600 }}>{vendor(db, r.vendorId).name}{i === 0 && <span className="tag" style={{ background: "var(--ok-soft)", color: "#127a51", marginLeft: 6 }}>lowest</span>}</td>
            <td className="mono" style={{ fontWeight: 700 }}>{x.price ? money(x.price) : "—"}</td>
            <td>{x.incoterm || "—"}</td><td>{x.packaging || "—"}</td><td>{x.packSize || "—"}</td>
            <td>{x.qtyPallet || "—"}</td><td>{x.qtyContainer || "—"}</td>
            <td>{x.leadTime || "—"}</td><td className="mono" style={{ fontSize: 12 }}>{x.hsnCode || x.hsn || "—"}</td><td>{x.priceValidity || "—"}</td>
          </tr>); })}</tbody>
      </table>
    </div>
  );
}
function Documents({ deal }) {
  if (!deal.qc || !deal.qc.files || !deal.qc.files.length) return null;
  return (
    <div className="block"><h4>QC documents</h4>
      <SpecFiles files={deal.qc.files} />
    </div>
  );
}
function AuditLog({ deal }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="block" style={{ padding: 0 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "12px 16px", textAlign: "left" }}>
        <h4 style={{ margin: 0, flex: 1 }}>Audit trail</h4>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{deal.log.length} entries</span>
        <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: open ? "rotate(180deg)" : "", transition: ".15s", color: "var(--muted)", flex: "none" }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && <div style={{ padding: "0 16px 12px" }}>
        <ul className="log">{deal.log.map((e, i) => <li key={i}><span className="when">{fmtWhen(e.at)}</span><span><span className="who">{e.who}</span> · {e.action}</span></li>)}</ul>
      </div>}
    </div>
  );
}

/* --------------------------- stage working areas -------------------------- */
function StageSection({ deal }) {
  switch (deal.status) {
    case "received": return <StageReceived deal={deal} />;
    case "rfq": return <StageRFQ deal={deal} />;
    case "vendor": return <div className="block"><h4>Route to quality control</h4><p style={{ fontSize: 13, color: "var(--muted)", margin: "-4px 0 0" }}>{deal.rfqs.filter((r) => r.response).length} vendor quote(s) logged. Send the documents to QC for vetting against the customer spec. You can continue logging late quotes or adding vendors below.</p></div>;
    case "qc": return <StageQC deal={deal} />;
    case "ready": return <StageQuote deal={deal} />;
    case "approval": return <StageApproval deal={deal} />;
    case "sent": return <StageFollowup deal={deal} />;
    case "order": return <div className="block"><h4>Order confirmed</h4><div className="note"><span className="ic">🔒</span><div>Vendor price and QC-approved spec are locked. Logistics and finance have been notified. Documents are attached to the order.</div></div><dl className="kv" style={{ marginTop: 12 }}><dt>Locked value</dt><dd>{deal.quote ? money(deal.quote.total) : "—"}</dd><dt>Terms</dt><dd>{deal.quote ? deal.quote.terms : "—"}</dd></dl></div>;
    default: return null;
  }
}

/* StageReceived holds RFQ commercial terms + vendor picker; the footer reads
   this state, so we lift it into the drawer-level via context-free local store. */
const RfqDraft = createContext(null);

function QuickAddVendor({ deal, onAdded }) {
  const { db, actions, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const add = () => {
    if (!name.trim()) { toast("Vendor name is required", 1); return; }
    const existing = db.vendors.find((v) => v.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) { toast("Vendor \"" + existing.name + "\" already exists in vendor master", 1); return; }
    const productIds = deal.productId ? [deal.productId] : [];
    const productTiers = {};
    if (deal.productId) productTiers[deal.productId] = "temporary";
    const vid = actions.saveVendor(null, { name: name.trim(), email: email.trim(), rating: 0, avgResp: 0, productIds, productTiers });
    if (onAdded) onAdded(vid);
    setName(""); setEmail(""); setOpen(false);
  };
  if (!open) return <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>+ Add new vendor</button>;
  return (
    <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 8, border: "1px dashed var(--signal)", background: "var(--signal-soft)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--signal)", marginBottom: 8 }}>Quick add vendor <span className="tag" style={{ background: "#fff3e0", color: "#b85716", marginLeft: 6, fontSize: 9, textTransform: "uppercase" }}>temporary</span></div>
      <div className="row2">
        <div className="field"><label>Vendor name *</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Chemicals Ltd" /></div>
        <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sales@vendor.com" /></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button className="btn primary sm" onClick={add}>Add & select</button>
        <button className="btn ghost sm" onClick={() => { setOpen(false); setName(""); setEmail(""); }}>Cancel</button>
      </div>
    </div>
  );
}
function StageReceived({ deal }) {
  const draft = useContext(RfqDraft);
  const { db } = useStore();
  const pName = deal.productId ? (product(db, deal.productId) || {}).name : deal.products || "";
  const baseMatched = deal.productId ? vendorsForProduct(db, deal.productId) : vendorsMatchingText(db, deal.products);
  const pickedExtra = draft.picks.map((id) => db.vendors.find((v) => v.id === id)).filter((v) => v && !baseMatched.some((m) => m.id === v.id));
  const matched = [...baseMatched, ...pickedExtra];
  const set = (k) => (e) => draft.set({ [k]: e.target.value });
  const toggle = (id) => () => draft.set({ picks: draft.picks.includes(id) ? draft.picks.filter((x) => x !== id) : [...draft.picks, id] });
  return (
    <>
      <div className="block"><h4>RFQ commercial terms</h4>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "-4px 0 12px" }}>These go out with the RFQ so every vendor quotes in the same shape and the responses line up for comparison.</p>
        <div className="row2">
          <div className="field"><label>Product name</label><input value={draft.productName} onChange={set("productName")} /></div>
          <div className="field"><label>Qty for quotation</label><input value={draft.qty} onChange={set("qty")} /></div>
        </div>
        <div className="row2">
          <div className="field"><label>Pack size</label><input value={draft.packSize} onChange={set("packSize")} placeholder="e.g. 25 kg bags / 200 L drum" /></div>
          <div className="field"><label>Incoterm / delivery term</label><input value={draft.incoterm} onChange={set("incoterm")} placeholder="e.g. FOB, CIF, EXW" /></div>
        </div>
        <div className="row2">
          <div className="field"><label>Price validity required</label><input value={draft.priceValidity} onChange={set("priceValidity")} placeholder="e.g. 30 days" /></div>
          <div className="field"><label>HSN code</label><input value={draft.hsn} onChange={set("hsn")} placeholder="e.g. 29051220" /></div>
        </div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 8 }}>Required from vendors</label>
        {REQ_ITEMS.map(([k, l]) => (
          <label className={"check" + (draft.required[k] ? " on" : "")} key={k}>
            <input type="checkbox" checked={!!draft.required[k]} onChange={(e) => draft.set({ required: { ...draft.required, [k]: e.target.checked } })} />
            <span>{l}</span>
          </label>
        ))}
        <div className="field" style={{ marginTop: 10 }}><label>Additional information for vendors</label><textarea value={draft.additionalInfo} onChange={(e) => draft.set({ additionalInfo: e.target.value })} placeholder="Any extra instructions or requirements for vendors…" /></div>
      </div>
      <div className="block">
        <h4>Send RFQ to vendors</h4>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "-4px 0 12px" }}>Only vendors who carry <b>{pName || "this product"}</b> are shown. SLA timers start the moment the RFQ goes out.</p>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, display: "block", marginBottom: 8 }}>{matched.length} vendor{matched.length === 1 ? "" : "s"} carry this product</span>
        {matched.length ? matched.map((v) => { const tier = deal.productId ? vendorTier(v, deal.productId) : null; const tc = tier ? TIER_COLORS[tier] : null; const on = draft.picks.includes(v.id); return (
          <label className={"check" + (on ? " on" : "")} key={v.id}>
            <input type="checkbox" checked={on} onChange={toggle(v.id)} />
            <span><b>{v.name}</b>{tc && <span className="tag" style={{ background: tc.bg, color: tc.fg, marginLeft: 6, fontSize: 10, textTransform: "uppercase", letterSpacing: ".03em" }}>{tier}</span>} · <span style={{ color: "var(--muted)" }}>{vendorProductNames(db, v).join(", ") || "no products listed"} · avg {v.avgResp}h</span></span>
          </label>); }) : <div className="col-empty">No approved vendor carries this product yet.</div>}
        <QuickAddVendor deal={deal} onAdded={(vid) => draft.set({ picks: [...draft.picks, vid] })} />
        <div className="field" style={{ marginTop: 6 }}><label>Response deadline (hours)</label><input type="number" value={draft.hrs} min="1" onChange={(e) => draft.set({ hrs: e.target.value })} /></div>
      </div>
    </>
  );
}
function RFQPanel({ deal }) {
  const { db, openModal, actions, toast, canActOnDeal, canDo, isManager } = useStore();
  const canAct = canActOnDeal(deal, deal.status, "edit") || canDo("vendor", "edit") || isManager;
  const preQcStages = ["received", "rfq", "vendor"];
  const canAddVendor = canAct && preQcStages.includes(deal.status);
  const uniqueRfqs = deal.rfqs.reduce((acc, r) => {
    const idx = acc.findIndex((x) => x.vendorId === r.vendorId);
    if (idx === -1) { acc.push(r); }
    else if (r.response && !acc[idx].response) { acc[idx] = r; }
    return acc;
  }, []);
  const pending = uniqueRfqs.filter((r) => !r.response);
  const responded = uniqueRfqs.filter((r) => r.response);
  const overdue = pending.some((r) => r.dueAt < now());
  const [adding, setAdding] = useState(false);
  const alreadySent = deal.rfqs.map((r) => r.vendorId);
  const baseMatched = deal.productId ? vendorsForProduct(db, deal.productId) : vendorsMatchingText(db, deal.products);
  const [picks, setPicks] = useState([]);
  const pickedExtra = picks.map((id) => db.vendors.find((v) => v.id === id)).filter((v) => v && !baseMatched.some((m) => m.id === v.id));
  const matched = [...baseMatched, ...pickedExtra];
  const available = matched.filter((v) => !alreadySent.includes(v.id));
  const [hrs, setHrs] = useState(36);
  const togglePick = (id) => () => setPicks((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const sendMore = () => {
    if (!picks.length) { toast("Pick at least one vendor", 1); return; }
    const rt = deal.rfqTerms || {};
    const terms = { productName: rt.productName || deal.products, qty: rt.qty || (deal.qty + " " + (deal.unit || "")), packSize: rt.packSize || "", incoterm: rt.incoterm || "", priceValidity: rt.priceValidity || "", hsn: rt.hsn || "", required: rt.required || {}, additionalInfo: rt.additionalInfo || "", spec: deal.spec, timeline: deal.timeline, customer: deal.customer, contactPerson: deal.contactPerson, contactPhone: deal.contactPhone, contactEmail: deal.contactEmail, channel: deal.channel };
    openModal({ kind: "rfqDrafts", dealId: deal.id, terms, picks, hrs: +hrs || 36, mode: "add" });
    setPicks([]); setAdding(false);
  };
  const dis = { opacity: 0.5, pointerEvents: "none" };
  return (
    <>
      {overdue && <Note>A vendor has missed its deadline. Chase them, or record a quote to move on.</Note>}
      <div className="block"><h4>Vendor RFQ responses</h4>
        {uniqueRfqs.length === 0 && <div className="col-empty">No RFQs sent yet.</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: uniqueRfqs.length ? 8 : 0 }}>
        {uniqueRfqs.map((r) => { const done = !!r.response, due = r.dueAt - now(); const v = vendor(db, r.vendorId); return (
          <div key={r.vendorId} style={{ border: "1px solid " + (done ? "#b7dfc4" : "var(--line)"), borderRadius: 10, padding: "14px 16px", flex: "1 1 170px", minWidth: 170, maxWidth: 260, background: done ? "#f0faf4" : "var(--surface)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{v.name}</div>
            {done ? <>
              <span className="sla ok" style={{ alignSelf: "flex-start" }}><span className="pip" />Received</span>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{fmtWhen(r.response.receivedAt)}</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--mono)" }}>{money(r.response.price, curSymbol(r.response.currency))}<span style={{ fontSize: 11, fontWeight: 400 }}>/kg</span></div>
              {r.response.incoterm && <div style={{ fontSize: 12 }}>Incoterm: <b>{r.response.incoterm}</b></div>}
              {r.response.packSize && <div style={{ fontSize: 12 }}>Pack size: <b>{r.response.packSize}</b></div>}
              {r.response.leadTime && <div style={{ fontSize: 12 }}>Lead time: <b>{r.response.leadTime}</b></div>}
              {r.response.priceValidity && <div style={{ fontSize: 12 }}>Validity: <b>{r.response.priceValidity}</b></div>}
              <div style={{ borderTop: "1px solid var(--line-2)", marginTop: 8, paddingTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".04em" }}>Documents</div>
                {DOC_TYPES.map(([k, l]) => { const atts = (r.response.attachments || []).filter((a) => a.docType === l);
                  if (atts.length) return <div key={k} style={{ marginBottom: 4 }}><span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{l}: </span><SpecFiles files={atts} /></div>;
                  if (r.response.docs && r.response.docs[k]) return <div key={k} style={{ marginBottom: 3 }}><span className="tag" style={{ background: "var(--ok-soft)", color: "#127a51", fontSize: 10 }}>{l} ✓</span></div>;
                  return <div key={k} style={{ marginBottom: 3 }}><span className="tag" style={{ background: "var(--breach-soft)", color: "var(--breach)", fontSize: 10 }}>{l} missing</span></div>;
                })}
                {(r.response.attachments || []).filter((a) => a.docType === "Other").length > 0 && <div style={{ marginBottom: 4 }}><span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Other: </span><SpecFiles files={(r.response.attachments || []).filter((a) => a.docType === "Other")} /></div>}
                {deal.coaData && deal.coaData[r.vendorId] && <button className="btn sm ok" style={{ fontSize: 10, padding: "2px 8px", marginTop: 4 }} onClick={() => openModal({ kind: "infiniteeCoa", dealId: deal.id, vendorId: r.vendorId })}>Infinitee CoA</button>}
              </div>
            </> : <>
              <span className={"sla " + (due < 0 ? "brk" : due < 6 * HR ? "warn" : "ok")} style={{ alignSelf: "flex-start" }}><span className="pip" />{remLabel(due)}</span>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Sent {fmtWhen(r.sentAt)}</div>
              <button className="btn sm primary" disabled={!canAct} title={canAct ? "" : "You don't have permission"} style={canAct ? {} : dis} onClick={() => openModal({ kind: "recordQuote", dealId: deal.id, vendorId: r.vendorId })}>Log quote</button>
              <button className="btn sm danger" disabled={!canAct} title={canAct ? "Remove — vendor declined or will not respond" : "You don't have permission"} style={canAct ? {} : dis} onClick={() => { if (window.confirm("Remove " + v.name + " from this RFQ?")) actions.removeRFQVendor(deal, r.vendorId, "Removed / declined"); }}>Remove ✕</button>
            </>}
          </div>); })}
        </div>
        {pending.length > 0 && deal.status !== "rfq" && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, padding: "6px 0" }}>{pending.length} vendor(s) still awaiting response — you can log their quotes here when they arrive.</div>}
        {!adding && canAddVendor && <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setAdding(true)}>+ Add more vendors to this RFQ</button>}
        {!adding && !canAddVendor && !preQcStages.includes(deal.status) && pending.length > 0 && <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 8, fontStyle: "italic" }}>New vendors cannot be added after QC review stage.</div>}
      </div>
      {adding && <div className="block">
        <h4>Add vendors to RFQ</h4>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "-4px 0 12px" }}>Only vendors who carry this product are shown. Already-sent vendors are excluded.</p>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, display: "block", marginBottom: 8 }}>{available.length} vendor{available.length === 1 ? "" : "s"} available</span>
        {available.length ? available.map((v) => { const tier = deal.productId ? vendorTier(v, deal.productId) : null; const tc = tier ? TIER_COLORS[tier] : null; const on = picks.includes(v.id); return (
          <label className={"check" + (on ? " on" : "")} key={v.id}>
            <input type="checkbox" checked={on} onChange={togglePick(v.id)} />
            <span><b>{v.name}</b>{tc && <span className="tag" style={{ background: tc.bg, color: tc.fg, marginLeft: 6, fontSize: 10, textTransform: "uppercase", letterSpacing: ".03em" }}>{tier}</span>} · <span style={{ color: "var(--muted)" }}>{vendorProductNames(db, v).join(", ") || "no products listed"} · avg {v.avgResp}h</span></span>
          </label>); }) : <div className="col-empty">{matched.length > 0 ? "All matching vendors have already been sent this RFQ." : "No vendor carries this product yet."}</div>}
        <QuickAddVendor deal={deal} onAdded={(vid) => setPicks((p) => [...p, vid])} />
        <div className="field" style={{ marginTop: 8 }}><label>Response deadline (hours)</label><input type="number" value={hrs} min="1" onChange={(e) => setHrs(e.target.value)} /></div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="btn primary sm" onClick={sendMore}>Send RFQ to selected</button>
          <button className="btn ghost sm" onClick={() => { setAdding(false); setPicks([]); }}>Cancel</button>
        </div>
      </div>}
    </>
  );
}
function StageRFQ({ deal }) {
  return <RFQPanel deal={deal} />;
}
function CoaButton({ dealId, vendorId }) {
  const { openModal } = useStore();
  return <button className="btn sm" style={{ marginBottom: 12, background: "var(--info-soft, #e6f0ff)", color: "var(--info, #2563eb)", border: "1px solid #bcd4f7" }} onClick={() => openModal({ kind: "infiniteeCoa", dealId, vendorId })}>Infinitee CoA</button>;
}
const COA_BODY_FIELDS = [
  { id: "batchNo", l: "Batch No." }, { id: "mfgDate", l: "Mfg. Date" }, { id: "expDate", l: "Expiry / Retest Date" },
  { id: "coaDate", l: "Date of Analysis" }, { id: "lotSize", l: "Lot Size" }, { id: "grade", l: "Grade" },
  { id: "customer", l: "Customer" }, { id: "poRef", l: "PO / Reference" },
];
function buildCoaHtml(f, tmpl) {
  const allParams = (f.customRows || []).filter((r) => r.param);
  const fm = { batchNo: f.batchNo, mfgDate: f.mfgDate, expDate: f.expDate, coaDate: f.coaDate, lotSize: f.lotSize, grade: f.grade, customer: f.customer, poRef: f.poRef };
  const selFields = (f.bodyFields || []).map((id) => { const bf = COA_BODY_FIELDS.find((x) => x.id === id); return bf && fm[id] ? { l: bf.l, v: fm[id] } : null; }).filter(Boolean);
  let infoHtml = "";
  if (selFields.length) { const ic = "padding:9px 14px;border:1px solid #2d3748;font-size:13px"; let rows = ""; for (let i = 0; i < selFields.length;) { const rem = selFields.length - i; if (rem >= 3) { rows += `<tr><td style="${ic}"><b>${selFields[i].l}:</b> ${selFields[i].v}</td><td style="${ic}"><b>${selFields[i+1].l}:</b> ${selFields[i+1].v}</td><td style="${ic}"><b>${selFields[i+2].l}:</b> ${selFields[i+2].v}</td></tr>`; i += 3; } else if (rem === 2) { rows += `<tr><td style="${ic}"><b>${selFields[i].l}:</b> ${selFields[i].v}</td><td style="${ic}" colspan="2"><b>${selFields[i+1].l}:</b> ${selFields[i+1].v}</td></tr>`; i += 2; } else { rows += `<tr><td style="${ic}" colspan="3"><b>${selFields[i].l}:</b> ${selFields[i].v}</td></tr>`; i += 1; } } infoHtml = `<table style="width:100%;border-collapse:collapse;margin-bottom:28px"><tbody>${rows}</tbody></table>`; }
  const bc = "border:1px solid #2d3748;padding:10px 16px;font-size:13px;text-align:center";
  const sigName = tmpl.approvedByName || "Authorized Signatory";
  return `<!DOCTYPE html><html><head><title>Infinitee CoA — ${f.productName}</title><style>
    @media print { @page { margin: 15mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } body * { visibility: hidden; } #coa-print, #coa-print * { visibility: visible; } #coa-print { position: fixed; top: 0; left: 0; width: 100%; } }
    body { font-family: 'Times New Roman', Georgia, serif; color: #1a202c; margin: 0; padding: 0; }
  </style></head><body><div id="coa-print" style="max-width:780px;margin:0 auto;background:#fff">
    ${tmpl.headerImg ? `<div style="text-align:center"><img src="${tmpl.headerImg}" style="width:100%;display:block" /></div>` : ""}
    <hr style="border:none;border-top:2px solid #1a202c;margin:0" />
    <div style="padding:30px 40px 20px">
      <div style="text-align:center;margin-bottom:28px">
        <div style="font-size:17px;font-weight:700;text-decoration:underline;text-underline-offset:5px;letter-spacing:1px;margin-bottom:14px">${f.coaTitle || "CERTIFICATE OF ANALYSIS"}</div>
        <div style="font-size:20px;font-weight:800;margin-bottom:6px">${f.productName}</div>
      </div>
      ${infoHtml}
      <table style="width:100%;border-collapse:collapse;margin-bottom:40px">
        <thead><tr><th style="${bc};font-weight:700;font-size:14px;border-bottom:2px solid #1a202c">Parameters</th><th style="${bc};font-weight:700;font-size:14px;border-bottom:2px solid #1a202c">Specification</th><th style="${bc};font-weight:700;font-size:14px;border-bottom:2px solid #1a202c">Test Results</th><th style="${bc};font-weight:700;font-size:14px;border-bottom:2px solid #1a202c">Method</th></tr></thead>
        <tbody>${allParams.map((r) => `<tr><td style="${bc}">${r.param}</td><td style="${bc}">${r.spec || "—"}</td><td style="${bc};font-weight:600">${r.result}</td><td style="${bc}">${r.method || "—"}</td></tr>`).join("")}
        ${allParams.length === 0 ? `<tr><td colspan="4" style="${bc};color:#a0aec0">No parameters entered</td></tr>` : ""}</tbody>
      </table>
      ${f.conclusion ? `<div style="text-align:center;font-size:14px;font-weight:600;color:#2d6a4f;margin-bottom:40px">${f.conclusion}</div>` : ""}
      <div style="text-align:center;margin-bottom:40px;margin-top:50px">
        <div style="font-size:14px;color:#4a5568;margin-bottom:10px">Approved by</div>
        ${tmpl.signatureImg ? `<div style="margin-bottom:8px"><img src="${tmpl.signatureImg}" style="height:60px" /></div>` : `<div style="height:50px;border-bottom:1px solid #2d3748;width:200px;margin:0 auto;margin-bottom:8px"></div>`}
        <div style="font-size:13px;font-weight:600">${sigName}</div>
      </div>
    </div>
    ${tmpl.footerImg ? `<hr style="border:none;border-top:1px solid #cbd5e0;margin:0" /><div style="text-align:center"><img src="${tmpl.footerImg}" style="width:100%;display:block" /></div>` : ""}
    ${tmpl.revision ? `<div style="padding:4px 16px;font-size:10px;color:#718096">${tmpl.revision}</div>` : ""}
  </div></body></html>`;
}
function InfiniteeCoaModal({ dealId, vendorId }) {
  const { db, closeModal, toast, commit } = useStore();
  const deal = db.deals.find((d) => d.id === dealId);
  const v = vendor(db, vendorId);
  const tmpl = db.coaTemplate || {};
  const pName = deal && deal.productId ? (product(db, deal.productId) || {}).name : (deal ? deal.products : "");
  const brandName = deal && deal.productId ? (product(db, deal.productId) || {}).brandName || "" : "";
  const hasSaved = deal && deal.coaData && deal.coaData[vendorId];
  const [mode, setMode] = useState(hasSaved ? "view" : "edit");
  const [saved, setSaved] = useState(false);
  const [f, setF] = useState({
    productName: brandName || pName || "", grade: "", batchNo: "", mfgDate: "", expDate: "", lotSize: "",
    customer: deal ? deal.customer : "", poRef: "", coaDate: new Date().toISOString().slice(0, 10),
    customRows: [{ param: "", spec: "", result: "", method: "" }],
    conclusion: "The above product conforms to the specification.",
    bodyFields: ["batchNo", "mfgDate", "expDate", "coaDate", "lotSize"],
    coaTitle: "CERTIFICATE OF ANALYSIS",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setCustom = (i, k, val) => setF((p) => { const rows = [...p.customRows]; rows[i] = { ...rows[i], [k]: val }; return { ...p, customRows: rows }; });
  const addRow = () => setF((p) => ({ ...p, customRows: [...p.customRows, { param: "", spec: "", result: "", method: "" }] }));
  const removeRow = (i) => setF((p) => ({ ...p, customRows: p.customRows.filter((_, j) => j !== i) }));
  const togField = (id) => setF((p) => ({ ...p, bodyFields: p.bodyFields.includes(id) ? p.bodyFields.filter((x) => x !== id) : [...p.bodyFields, id] }));

  const saveCoa = () => { if (!deal) return; if (!deal.coaData) deal.coaData = {}; deal.coaData[vendorId] = { ...f, generatedAt: now() }; commit(); setSaved(true); toast("Infinitee CoA saved"); setTimeout(() => setSaved(false), 3000); };
  const printCoa = () => { const w = window.open("", "_blank", "width=800,height=1000"); w.document.write(buildCoaHtml(f, tmpl)); w.document.close(); setTimeout(() => w.print(), 500); };

  useEffect(() => { if (hasSaved) setF((p) => ({ ...p, ...deal.coaData[vendorId] })); }, []);

  const allParams = (f.customRows || []).filter((r) => r.param);
  const fm = { batchNo: f.batchNo, mfgDate: f.mfgDate, expDate: f.expDate, coaDate: f.coaDate, lotSize: f.lotSize, grade: f.grade, customer: f.customer, poRef: f.poRef };
  const selFields = (f.bodyFields || []).map((id) => { const bf = COA_BODY_FIELDS.find((x) => x.id === id); return bf && fm[id] ? { l: bf.l, v: fm[id] } : null; }).filter(Boolean);

  const tabStyle = (active) => ({ padding: "8px 16px", fontSize: 13, fontWeight: 600, border: "none", borderBottom: active ? "2px solid var(--signal)" : "2px solid transparent", marginBottom: -2, background: "none", color: active ? "var(--signal)" : "var(--muted)", cursor: "pointer" });

  return (
    <div className="modal-scrim show" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="modal" style={{ maxWidth: 780 }}>
        <div className="modal-head">
          <h3>Infinitee CoA — {v.name}</h3>
          <button className="x" onClick={closeModal}>×</button>
        </div>
        <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--line)", padding: "0 20px" }}>
          <button style={tabStyle(mode === "edit")} onClick={() => setMode("edit")}>Edit</button>
          <button style={tabStyle(mode === "view")} onClick={() => setMode("view")}>Preview</button>
        </div>
        <div className="modal-body">
          {mode === "edit" ? <>
            <div className="field"><label>CoA title</label><input value={f.coaTitle} onChange={set("coaTitle")} /></div>
            <div className="field"><label>Product name (on CoA)</label><input value={f.productName} onChange={set("productName")} /></div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginTop: 14, marginBottom: 8 }}>Body fields — select which to show on CoA</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {COA_BODY_FIELDS.map((bf) => <label key={bf.id} className={"check" + (f.bodyFields.includes(bf.id) ? " on" : "")} style={{ fontSize: 12, minWidth: 150 }}><input type="checkbox" checked={f.bodyFields.includes(bf.id)} onChange={() => togField(bf.id)} /><span>{bf.l}</span></label>)}
            </div>
            <div className="row2">
              <div className="field"><label>Batch No.</label><input value={f.batchNo} onChange={set("batchNo")} /></div>
              <div className="field"><label>Grade</label><input value={f.grade} onChange={set("grade")} placeholder="e.g. HPLC, AR, LR" /></div>
            </div>
            <div className="row2">
              <div className="field"><label>Mfg. date</label><input type="date" value={f.mfgDate} onChange={set("mfgDate")} /></div>
              <div className="field"><label>Expiry / Retest date</label><input type="date" value={f.expDate} onChange={set("expDate")} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>Lot size</label><input value={f.lotSize} onChange={set("lotSize")} placeholder="e.g. 500 kg" /></div>
              <div className="field"><label>Date of analysis</label><input type="date" value={f.coaDate} onChange={set("coaDate")} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>Customer</label><input value={f.customer} onChange={set("customer")} /></div>
              <div className="field"><label>PO / Reference</label><input value={f.poRef} onChange={set("poRef")} /></div>
            </div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginTop: 16, marginBottom: 8 }}>Test parameters</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 4, marginBottom: 6, fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>
              <span>Parameter</span><span>Specification</span><span>Result</span><span>Method</span><span />
            </div>
            {f.customRows.map((row, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 6, marginBottom: 6 }}>
                <input value={row.param} onChange={(e) => setCustom(i, "param", e.target.value)} placeholder="e.g. pH" style={{ padding: "5px 8px", border: "1px solid var(--line)", borderRadius: 4, fontSize: 12 }} />
                <input value={row.spec} onChange={(e) => setCustom(i, "spec", e.target.value)} placeholder="e.g. 5.5 - 6.5" style={{ padding: "5px 8px", border: "1px solid var(--line)", borderRadius: 4, fontSize: 12 }} />
                <input value={row.result} onChange={(e) => setCustom(i, "result", e.target.value)} placeholder="e.g. 6.0" style={{ padding: "5px 8px", border: "1px solid var(--line)", borderRadius: 4, fontSize: 12 }} />
                <input value={row.method} onChange={(e) => setCustom(i, "method", e.target.value)} placeholder="e.g. IP" style={{ padding: "5px 8px", border: "1px solid var(--line)", borderRadius: 4, fontSize: 12 }} />
                <button className="btn sm danger" style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => removeRow(i)}>✕</button>
              </div>
            ))}
            <button className="btn ghost sm" onClick={addRow}>+ Add parameter</button>
            <div className="field" style={{ marginTop: 14 }}><label>Conclusion</label><textarea value={f.conclusion} onChange={set("conclusion")} /></div>
          </> : <>
            <div style={{ fontFamily: "'Times New Roman', Georgia, serif", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
              {tmpl.headerImg && <div><img src={tmpl.headerImg} style={{ width: "100%", display: "block" }} /></div>}
              <hr style={{ border: "none", borderTop: "2px solid #1a202c", margin: 0 }} />
              <div style={{ padding: "24px 30px 16px" }}>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, textDecoration: "underline", letterSpacing: 1, marginBottom: 10 }}>{f.coaTitle || "CERTIFICATE OF ANALYSIS"}</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{f.productName}</div>
                </div>
                {selFields.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}><tbody>
                  {(() => { const rows = []; for (let i = 0; i < selFields.length; i += 3) { const cells = selFields.slice(i, i + 3); rows.push(<tr key={i}>{cells.map((c, j) => <td key={j} style={{ padding: "6px 10px", border: "1px solid #2d3748", fontSize: 12 }} colSpan={cells.length < 3 && j === cells.length - 1 ? 4 - cells.length : 1}><b>{c.l}:</b> {c.v}</td>)}</tr>); } return rows; })()}
                </tbody></table>}
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20, fontSize: 12 }}>
                  <thead><tr>{["Parameters", "Specification", "Test Results", "Method"].map((h) => <th key={h} style={{ border: "1px solid #2d3748", padding: "7px 10px", textAlign: "center", fontWeight: 700 }}>{h}</th>)}</tr></thead>
                  <tbody>{allParams.length > 0 ? allParams.map((r, i) => <tr key={i}><td style={{ border: "1px solid #2d3748", padding: "6px 10px", textAlign: "center" }}>{r.param}</td><td style={{ border: "1px solid #2d3748", padding: "6px 10px", textAlign: "center" }}>{r.spec || "—"}</td><td style={{ border: "1px solid #2d3748", padding: "6px 10px", textAlign: "center", fontWeight: 600 }}>{r.result}</td><td style={{ border: "1px solid #2d3738", padding: "6px 10px", textAlign: "center" }}>{r.method || "—"}</td></tr>) : <tr><td colSpan={4} style={{ border: "1px solid #2d3748", padding: "10px", textAlign: "center", color: "#a0aec0" }}>No parameters entered — switch to Edit tab</td></tr>}</tbody>
                </table>
                {f.conclusion && <div style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "#2d6a4f", marginBottom: 20 }}>{f.conclusion}</div>}
                <div style={{ textAlign: "center", marginTop: 30 }}>
                  <div style={{ fontSize: 12, color: "#4a5568", marginBottom: 8 }}>Approved by</div>
                  {tmpl.signatureImg ? <div style={{ marginBottom: 6 }}><img src={tmpl.signatureImg} style={{ height: 50 }} /></div> : <div style={{ height: 40, borderBottom: "1px solid #2d3748", width: 180, margin: "0 auto", marginBottom: 6 }} />}
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{tmpl.approvedByName || "Authorized Signatory"}</div>
                </div>
              </div>
              {tmpl.footerImg && <><hr style={{ border: "none", borderTop: "1px solid #cbd5e0", margin: 0 }} /><div><img src={tmpl.footerImg} style={{ width: "100%", display: "block" }} /></div></>}
              {tmpl.revision && <div style={{ padding: "4px 12px", fontSize: 9, color: "#718096" }}>{tmpl.revision}</div>}
            </div>
          </>}
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={closeModal}>Close</button>
          {mode === "edit" && <button className="btn" onClick={() => setMode("view")}>Preview</button>}
          {mode === "view" && <button className="btn" onClick={() => setMode("edit")}>Edit</button>}
          <button className="btn primary" onClick={() => { saveCoa(); }}>{saved ? "Saved!" : "Save"}</button>
          {mode === "view" && <button className="btn ok" onClick={() => { saveCoa(); printCoa(); }}>Print / PDF</button>}
        </div>
      </div>
    </div>
  );
}
function StageQC({ deal }) {
  const qc = useContext(QcDraft);
  const { db, canActOnDeal, actions, toast } = useStore();
  const canQc = canActOnDeal(deal, "qc", "edit");
  const quotedRfqs = deal.rfqs.filter((r) => r.response);
  const vendorQc = deal.vendorQc || {};
  const checks = [
    ["spec",   "CoA parameters meet general spec"],
    ["custspec","CoA meets customer-specific spec"],
    ["vendor", "Vendor approval status confirmed"],
    ["docs",   "All required documents present (CoA / TDS / MSDS)"],
  ];

  const vendorStates = qc.vendorStates || {};
  const setVS = (vid, patch) => qc.set({ vendorStates: { ...qc.vendorStates, [vid]: { ...(qc.vendorStates[vid] || {}), ...patch } } });

  const collectDocs = async () => {
    const tag = async (ref, label) => ref.current && ref.current.files ? (await readFiles(ref.current.files)).map((x) => ({ ...x, docType: label })) : [];
    let files = [
      ...await tag(qc.docRefs.sds, "INFIN SDS"),
      ...await tag(qc.docRefs.tds, "INFIN TDS"),
      ...await tag(qc.docRefs.coa, "INFIN CoA"),
    ];
    for (const slot of qc.otherSlots) { if (slot.ref && slot.ref.files) files = [...files, ...(await readFiles(slot.ref.files)).map((x) => ({ ...x, docType: "Other" }))]; }
    return files;
  };

  const decide = async (vid, result) => {
    const st = vendorStates[vid] || { checklist: {}, notes: "" };
    const files = await collectDocs();
    actions.doQC(deal, { vendorId: vid, result, checklist: st.checklist, notes: st.notes, files });
  };

  if (!quotedRfqs.length) return (
    <div className="block"><h4>QC review</h4>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>No vendor quotes logged yet.</p>
    </div>
  );

  const RESULT_STYLE = { approved: { bg: "var(--ok-soft)", col: "#127a51", label: "✓ Approved" }, deviation: { bg: "#fff8e1", col: "#b8860b", label: "~ Deviation" }, rejected: { bg: "var(--breach-soft)", col: "var(--breach)", label: "✕ Rejected" } };

  return (
    <>
      <div className="block">
        <h4>QC review — per vendor</h4>
        {!canQc && <div style={{ padding: "8px 12px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--line)", fontSize: 12, color: "var(--muted)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          Read-only — you don't have QC edit permission
        </div>}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          {quotedRfqs.map((r) => {
            const v = vendor(db, r.vendorId);
            const done = vendorQc[r.vendorId];
            const rs = done && RESULT_STYLE[done.result];
            const st = vendorStates[r.vendorId] || { checklist: {}, notes: "" };
            return (
              <div key={r.vendorId} style={{ flex: "1 1 210px", minWidth: 210, maxWidth: 280, border: done ? `2px solid ${rs.col}` : "1px solid var(--line)", borderRadius: "var(--radius)", padding: "14px 14px 12px", background: "var(--card)", display: "flex", flexDirection: "column", gap: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  {v.name}
                  {done && <span className="tag" style={{ background: rs.bg, color: rs.col, fontSize: 10 }}>{rs.label}</span>}
                </div>
                {done && done.notes && <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, fontStyle: "italic" }}>{done.notes}</div>}
                <div style={canQc ? {} : { opacity: 0.5, pointerEvents: "none" }}>
                  {checks.map(([k, l]) => (
                    <label className={"check" + (st.checklist[k] ? " on" : "")} key={k} style={{ fontSize: 12 }}>
                      <input type="checkbox" checked={!!st.checklist[k]} onChange={(e) => setVS(r.vendorId, { checklist: { ...st.checklist, [k]: e.target.checked } })} />
                      <span style={{ fontSize: 12 }}>{l}</span>
                    </label>
                  ))}
                  <textarea value={st.notes} onChange={(e) => setVS(r.vendorId, { notes: e.target.value })} placeholder="Notes / deviation detail…" style={{ width: "100%", marginTop: 8, minHeight: 54, resize: "vertical", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 5, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
                  <CoaButton dealId={deal.id} vendorId={r.vendorId} />
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                    <button className="btn ok sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => decide(r.vendorId, "approved")}>Approve</button>
                    <button className="btn sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => decide(r.vendorId, "deviation")}>Deviation</button>
                    <button className="btn danger sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => decide(r.vendorId, "rejected")}>Reject</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="block">
        <h4>QC approved documents <span style={{ fontWeight: 400, fontSize: 12, color: "var(--muted)" }}>(INFIN docs sent to customer)</span></h4>
        <div className="row3">
          <div className="field"><label>INFIN SDS</label><input type="file" multiple ref={qc.docRefs.sds} /></div>
          <div className="field"><label>INFIN TDS</label><input type="file" multiple ref={qc.docRefs.tds} /></div>
          <div className="field"><label>INFIN CoA</label><input type="file" multiple ref={qc.docRefs.coa} /></div>
        </div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "4px 0 8px" }}>Other documents <span style={{ fontWeight: 400 }}>(QC report, signed checklist, vetted spec…)</span></label>
        {qc.otherSlots.map((slot, i) => (
          <div className="field" key={slot.id}><label>Document {i + 1}</label><input type="file" multiple ref={(el) => { slot.ref = el; }} /></div>
        ))}
        <button className="btn ghost sm" onClick={() => qc.set({ otherSlots: [...qc.otherSlots, { id: "qo" + Date.now(), ref: null }] })}>+ Add more documents</button>
      </div>
    </>
  );
}
function VendorQuoteCards({ deal, onSelect }) {
  const { db } = useStore();
  const quotes = deal.rfqs.filter((r) => r.response).sort((a, b) => parseFloat(a.response.price) - parseFloat(b.response.price));
  if (quotes.length < 2) return null;
  const lowest = parseFloat(quotes[0].response.price);
  return (
    <div className="block" style={{ padding: "16px 18px" }}>
      <h4>Compare vendor quotes</h4>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(quotes.length, 3)}, 1fr)`, gap: 10, marginTop: 4 }}>
        {quotes.map((r, i) => { const x = r.response, price = parseFloat(x.price), vn = vendor(db, r.vendorId).name, isBest = i === 0;
          const docs = DOC_TYPES.map(([k, l]) => ({ label: l, ok: x.docs && x.docs[k] }));
          return (
            <div key={r.vendorId} style={{ border: isBest ? "2px solid var(--ok)" : "1px solid var(--line)", borderRadius: "var(--radius)", padding: "14px 14px 12px", background: "var(--card)", position: "relative" }}>
              {isBest && <span className="tag" style={{ background: "var(--ok-soft)", color: "#127a51", position: "absolute", top: -10, right: 12, fontSize: 10 }}>Best price</span>}
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{vn}</div>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--mono)", color: isBest ? "var(--ok)" : "var(--ink)" }}>{money(price, curSymbol(x.currency))}<span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>/kg</span></div>
              {!isBest && <div style={{ fontSize: 11, color: "var(--breach)", fontWeight: 600, marginTop: 2 }}>+{Math.round((price - lowest) / lowest * 100)}% vs lowest</div>}
              <div style={{ borderTop: "1px solid var(--line-2)", marginTop: 10, paddingTop: 8, fontSize: 12, color: "var(--muted)", display: "grid", gap: 4 }}>
                <div><b>Incoterm:</b> {x.incoterm || "—"}</div>
                <div><b>Packaging:</b> {x.packaging || "—"}</div>
                <div><b>Pack Size:</b> {x.packSize || "—"}</div>
                {x.qtyPallet && <div><b>Qty/Pallet:</b> {x.qtyPallet}</div>}
                {x.qtyContainer && <div><b>Qty/Container:</b> {x.qtyContainer}</div>}
                <div><b>Lead time:</b> {x.leadTime || "—"}</div>
                <div><b>HSN:</b> {x.hsnCode || x.hsn || "—"}</div>
                <div><b>Validity:</b> {x.priceValidity || "—"}</div>
                <div><b>Terms:</b> {x.terms || "—"}</div>
                {x.deviations && <div style={{ color: "var(--signal)" }}><b>Deviation:</b> {x.deviations}</div>}
              </div>
              <div style={{ borderTop: "1px solid var(--line-2)", marginTop: 8, paddingTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {docs.map((d) => <span key={d.label} className="tag" style={{ fontSize: 10, background: d.ok ? "var(--ok-soft)" : "var(--breach-soft)", color: d.ok ? "#127a51" : "var(--breach)" }}>{d.label} {d.ok ? "✓" : "✕"}</span>)}
              </div>
              {onSelect && <button className="btn sm primary" style={{ width: "100%", marginTop: 10, justifyContent: "center" }} onClick={() => onSelect(r)}>Use this quote</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function QCell({ value, onChange, calcFallback, cur }) {
  const raw = String(value || "");
  const resolved = evalExpr(value);
  const isFormula = raw.trim() !== "" && raw.trim() !== String(resolved);
  const showCalc = !raw.trim() && calcFallback != null;
  return (
    <td style={{ padding: "4px 6px", verticalAlign: "middle", position: "relative" }}>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={showCalc ? money(calcFallback, cur) : ""}
        style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 5, padding: "6px 8px", fontSize: 12, fontFamily: "var(--mono)", background: showCalc ? "var(--ok-soft)" : "#fff", outline: "none", color: showCalc ? "var(--muted-2)" : "var(--ink)" }} />
      {isFormula && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--muted-2)", pointerEvents: "none" }}>={money(resolved, cur)}</span>}
    </td>
  );
}
function CalcCell({ value, cur }) {
  return (
    <td className="mono" style={{ padding: "4px 6px", fontSize: 12, fontWeight: 700, color: "var(--ok)", background: "var(--ok-soft)", textAlign: "right" }}>
      {money(value, cur)}
    </td>
  );
}
function StageQuote({ deal }) {
  const { db, canActOnDeal } = useStore();
  const canEdit = canActOnDeal(deal, "ready", "edit");
  const q = useContext(QuoteDraft);
  const quotedRfqs = deal.rfqs.filter((r) => r.response).sort((a, b) => parseFloat(a.response.price) - parseFloat(b.response.price));
  const pName = deal.productId ? (product(db, deal.productId) || {}).name : deal.products;
  const cur = q.currency;
  const ALL_ROWS = [
    { k: "incoterm", label: "Incoterm (vendor)", type: "text", level: "fob" },
    { k: "exWorks", label: "Ex-Works", type: "input", level: "fob" },
    { k: "freightInland", label: "Freight (Inland)", type: "input", level: "fob" },
    { k: "cnf", label: "C&F", type: "input", level: "fob" },
    { k: "fob", label: "FOB", type: "calc", formula: "Ex-Works + Freight + C&F", level: "fob" },
    { k: "seaFreight", label: "Sea Freight", type: "input", level: "cif" },
    { k: "cif", label: "CIF", type: "calc", formula: "FOB + Sea Freight", level: "cif" },
    { k: "duty", label: "Duty", type: "input", level: "exWarehouse" },
    { k: "tariff", label: "Tariff", type: "input", level: "exWarehouse" },
    { k: "otherCosts", label: "Other Costs", type: "input", level: "exWarehouse" },
    { k: "exWarehouse", label: "Ex-Warehouse", type: "calc", formula: "CIF + Duty + Tariff + Other", level: "exWarehouse" },
    { k: "freightDelivery", label: "Freight (Delivery)", type: "input", level: "final" },
  ];
  const QUOTE_LEVELS = [["fob", "FOB"], ["cif", "CIF"], ["exWarehouse", "Ex-Warehouse"], ["final", "Delivered (full)"]];
  const levelOrder = ["fob", "cif", "exWarehouse", "final"];
  const upTo = q.quoteUpTo || "final";
  const cutoff = levelOrder.indexOf(upTo);
  const ROWS = ALL_ROWS.filter((r) => levelOrder.indexOf(r.level) <= cutoff);
  const subtotalKey = upTo === "fob" ? "fob" : upTo === "cif" ? "cif" : upTo === "exWarehouse" ? "exWarehouse" : "priceQuote";
  if (!quotedRfqs.length) return <div className="block"><h4>Build quotation</h4><div className="col-empty">No vendor quotes received yet. Log at least one vendor quote to build a quotation.</div></div>;
  return (
    <div className="block" style={{ padding: 0, overflow: "auto" }}>
      {!canEdit && <div style={{ padding: "8px 18px 0" }}><div style={{ padding: "8px 12px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--line)", fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        Read-only — you don't have permission to edit quotations
      </div></div>}
      <div style={canEdit ? {} : { opacity: 0.5, pointerEvents: "none" }}>
      <div style={{ padding: "16px 18px 0" }}>
        <h4>Build quotation</h4>
        {deal.qc && deal.qc.result === "deviation" && <Note>QC approved with deviations — make sure the customer is told.</Note>}
      </div>
      <div style={{ display: "flex", gap: 14, padding: "0 18px 10px", fontSize: 13, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "4px 10px" }}>
          <span style={{ color: "var(--muted)", fontWeight: 600 }}>Customer</span><span style={{ fontWeight: 500 }}>{deal.customer}</span>
          <span style={{ color: "var(--muted)", fontWeight: 600 }}>Product</span><span style={{ fontWeight: 500 }}>{pName}{brandLabel(db, deal) && <span style={{ color: "var(--info)", marginLeft: 6 }}>({brandLabel(db, deal)})</span>}</span>
          <span style={{ color: "var(--muted)", fontWeight: 600 }}>UoM</span><span style={{ fontWeight: 500 }}>{deal.unit || "—"}</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Quote up to</label>
            <select value={upTo} onChange={(e) => q.set({ quoteUpTo: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "4px 8px", fontSize: 13, fontWeight: 600 }}>
              {QUOTE_LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Currency</label>
            <select value={cur} onChange={(e) => q.set({ currency: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "4px 8px", fontSize: 13, fontWeight: 600 }}>
              {["₹", "$", "€", "£", "AED", "SAR"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-2)", padding: "0 18px 8px", fontStyle: "italic" }}>Type formulas in any field (e.g. 1000/500). Calculated rows auto-fill but can be overridden by typing a value.</div>
      <table style={{ fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ width: 140, padding: "8px 10px" }}>Cost element</th>
            {quotedRfqs.map((r) => {
              const v = vendor(db, r.vendorId);
              const sel = q.selectedVendorId === r.vendorId;
              return <th key={r.vendorId} style={{ textAlign: "center", padding: "8px 6px", minWidth: 140, background: sel ? "var(--ok-soft)" : undefined }}>
                <div style={{ fontWeight: 700 }}>{v.name}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>{r.response.incoterm || "—"} · {money(r.response.price, curSymbol(r.response.currency))}/kg</div>
              </th>;
            })}
            <th style={{ width: 120, fontSize: 10, color: "var(--muted)", padding: "8px 6px" }}>Formula</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const isCalc = row.type === "calc";
            const isText = row.type === "text";
            return (
              <tr key={row.k} style={{ background: isCalc ? "var(--surface)" : isText ? "var(--surface)" : undefined }}>
                <td style={{ padding: "6px 10px", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap", color: isCalc ? "var(--ok)" : "var(--ink)" }}>{row.label}</td>
                {quotedRfqs.map((r) => {
                  const col = q.cols[r.vendorId] || {};
                  const calc = q.colCalc(col);
                  const sel = q.selectedVendorId === r.vendorId;
                  if (isText) {
                    const fallback = r.response ? (r.response.incoterm || "") : "";
                    const val = col[row.k] !== undefined ? col[row.k] : fallback;
                    return <td key={r.vendorId} style={{ padding: "4px 6px", background: sel ? "var(--ok-soft)" : undefined }}>
                      <input value={val} onChange={(e) => q.setCol(r.vendorId, row.k, e.target.value)} placeholder={fallback || "e.g. FOB"} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 5, padding: "6px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", background: val ? "#fff" : "var(--ok-soft)", color: "var(--ink)", fontWeight: 600 }} />
                    </td>;
                  }
                  if (isCalc) {
                    const override = col[row.k];
                    const calcVal = calc[row.k];
                    return <QCell key={r.vendorId} value={override} onChange={(v) => q.setCol(r.vendorId, row.k, v)} calcFallback={calcVal} cur={cur} />;
                  }
                  return <QCell key={r.vendorId} value={col[row.k] || ""} onChange={(v) => q.setCol(r.vendorId, row.k, v)} cur={cur} />;
                })}
                <td style={{ fontSize: 10, color: "var(--muted-2)", padding: "4px 6px" }}>{row.formula || ""}</td>
              </tr>
            );
          })}
          <tr style={{ borderTop: "2px solid var(--line)", background: "var(--surface)" }}>
            <td style={{ padding: "8px 10px", fontWeight: 700, fontSize: 12, color: "var(--ok)" }}>{QUOTE_LEVELS.find(([k]) => k === upTo)?.[1] || "Price"} subtotal</td>
            {quotedRfqs.map((r) => {
              const col = q.cols[r.vendorId] || {};
              const calc = q.colCalc(col);
              const sel = q.selectedVendorId === r.vendorId;
              return <td key={r.vendorId} className="mono" style={{ textAlign: "center", padding: "8px 6px", fontSize: 13, fontWeight: 700, color: "var(--ok)", background: sel ? "var(--ok-soft)" : undefined }}>
                {money(calc[subtotalKey] || 0, cur)}
              </td>;
            })}
            <td />
          </tr>
          <tr>
            <td style={{ padding: "6px 10px", fontWeight: 600, fontSize: 12 }}>Margins</td>
            {quotedRfqs.map((r) => {
              const col = q.cols[r.vendorId] || {};
              return <QCell key={r.vendorId} value={col.margins || ""} onChange={(v) => q.setCol(r.vendorId, "margins", v)} cur={cur} />;
            })}
            <td style={{ fontSize: 10, color: "var(--muted-2)", padding: "4px 6px" }}>Added to subtotal</td>
          </tr>
          <tr style={{ borderTop: "2px solid var(--ok)" }}>
            <td style={{ padding: "10px 10px", fontWeight: 700, fontSize: 13 }}>Price to quote</td>
            {quotedRfqs.map((r) => {
              const col = q.cols[r.vendorId] || {};
              const calc = q.colCalc(col);
              const sel = q.selectedVendorId === r.vendorId;
              const subtotal = calc[subtotalKey] || 0;
              const margin = evalExpr(col.margins);
              return <td key={r.vendorId} className="mono" style={{ textAlign: "center", padding: "10px 6px", fontSize: 15, fontWeight: 700, color: "var(--ok)", background: sel ? "var(--ok-soft)" : undefined }}>
                {money(subtotal + margin, cur)}<span style={{ fontSize: 10, fontWeight: 400, color: "var(--muted)" }}> /{deal.unit || "unit"}</span>
              </td>;
            })}
            <td />
          </tr>
          <tr>
            <td style={{ padding: "8px 10px", fontWeight: 600, fontSize: 12, color: "var(--muted)" }}>Select for quote</td>
            {quotedRfqs.map((r) => {
              const sel = q.selectedVendorId === r.vendorId;
              return <td key={r.vendorId} style={{ textAlign: "center", padding: "8px 6px", background: sel ? "var(--ok-soft)" : undefined }}>
                <input type="radio" name="quoteSelect" checked={sel} onChange={() => q.set({ selectedVendorId: r.vendorId })} style={{ width: 18, height: 18, accentColor: "var(--ok)", cursor: "pointer" }} />
              </td>;
            })}
            <td />
          </tr>
        </tbody>
      </table>
      <div style={{ padding: "12px 18px" }}>
        <div className="field"><label>Terms to customer</label><input value={q.terms} onChange={(e) => q.set({ terms: e.target.value })} placeholder="e.g. 30 days credit, ex-works" /></div>
        {!q.selectedVendorId && <div className="note"><span className="ic">⚠</span><div>Select a vendor above to finalize the quotation.</div></div>}
      </div>
      </div>
    </div>
  );
}
function StageApproval({ deal }) {
  const { db, loggedInUser } = useStore();
  const pq = deal.pendingQuote || {};
  const fq = pq.finalQuote || {};
  const cur = fq.currency || pq.currency || "₹";
  const approved = deal.quoteApproval && deal.quoteApproval.status === "approved";
  const approver = deal.quoteApproval ? member(db, deal.quoteApproval.by) : null;
  const submitter = pq.submittedBy ? member(db, pq.submittedBy) : null;
  return (
    <div className="block">
      <h4>{approved ? "Quote approved — ready to send" : "Quote pending approval"}</h4>
      {approved ? (
        <div className="note" style={{ background: "var(--ok-soft)", borderColor: "#bfe6d2", marginBottom: 14 }}>
          <span className="ic" style={{ color: "var(--ok)" }}>✓</span>
          <div><b>Approved by {approver ? approver.name : "—"}</b> · {deal.quoteApproval.at ? fmtWhen(deal.quoteApproval.at) : ""}{deal.quoteApproval.notes && <div style={{ color: "var(--muted)", marginTop: 2 }}>{deal.quoteApproval.notes}</div>}</div>
        </div>
      ) : (
        <div className="note" style={{ marginBottom: 14 }}><span className="ic">⏳</span><div>Submitted by <b>{submitter ? submitter.name : "—"}</b> {pq.submittedAt ? "on " + fmtWhen(pq.submittedAt) : ""}. A manager must approve this quote before it can be sent to the customer.</div></div>
      )}
      <div style={{ background: "var(--surface)", borderRadius: 8, padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>Quotation to customer — {approved ? "locked" : "pending review"}</div>
        <dl className="kv" style={{ fontSize: 13.5 }}>
          <dt>Product</dt><dd>{fq.productName || deal.products}</dd>
          <dt>Quantity</dt><dd>{fq.quantity || deal.qty + " " + (deal.unit || "")}</dd>
          <dt>Price / {deal.unit || "unit"}</dt><dd style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--ok)", fontSize: 16 }}>{cur}{fq.pricePerUnit || "—"}</dd>
          <dt>Incoterm</dt><dd>{fq.incoterm || "—"}</dd>
          <dt>Packaging</dt><dd>{fq.packaging || "—"}</dd>
          <dt>Pack Size</dt><dd>{fq.packSize || "—"}</dd>
          <dt>Lead Time</dt><dd>{fq.leadTime || "—"}</dd>
          <dt>Payment Terms</dt><dd>{fq.paymentTerm || "—"}</dd>
          <dt>Price Validity</dt><dd>{fq.priceValidity || "—"}</dd>
          {fq.otherTerms && <><dt>Other Terms</dt><dd>{fq.otherTerms}</dd></>}
          <dt>Selected vendor</dt><dd>{pq.selectedVendor || "—"}</dd>
          <dt>Total price quote</dt><dd style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15 }}>{money(pq.total, cur)} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)" }}>/ {deal.unit || "unit"}</span></dd>
        </dl>
      </div>
    </div>
  );
}
function StageFollowup({ deal }) {
  const { openModal, canActOnDeal } = useStore();
  const canAct = canActOnDeal(deal, "sent", "edit");
  const oldest = deal.followups.filter((f) => !f.doneAt).sort((a, b) => a.dueAt - b.dueAt)[0];
  return (
    <>
      <div className="block"><h4>Quotation sent · {deal.quote ? money(deal.quote.total) : ""}</h4>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "-4px 0 4px" }}>Sent {deal.quote ? fmtWhen(deal.quote.sentAt) : ""}. Work the chase schedule until the customer decides.</p>
        {deal.followups.slice().sort((a, b) => a.dueAt - b.dueAt).map((f) => { const over = !f.doneAt && f.dueAt <= now(); return (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--line-2)" }}>
            <div style={{ flex: 1 }}><b>{f.doneAt ? "✓ " : ""}Chase — {fmtWhen(f.dueAt)}</b>{f.outcome && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{f.outcome}{f.note ? ": " + f.note : ""}</div>}</div>
            {f.doneAt ? <span className="tag" style={{ background: "var(--ok-soft)", color: "#127a51" }}>logged</span> : <>
              <span className={"sla " + (over ? "brk" : "ok")}><span className="pip" />{over ? "due" : remLabel(f.dueAt - now())}</span>
              {canAct && <button className="btn sm primary" onClick={() => openModal({ kind: "logFollowup", dealId: deal.id, fid: f.id })}>Log</button>}
            </>}
          </div>); })}
      </div>
      {oldest && now() - oldest.dueAt > 2 * 24 * HR && <Note>No customer response for several days — in production this would escalate to the Sales Manager and trigger a final follow-up message.</Note>}
    </>
  );
}

/* drafts for stage forms, provided per-deal by Footer/Drawer wrapper */
const QcDraft = createContext(null);
const QuoteDraft = createContext(null);

function Footer({ deal }) {
  const { db, role, actions, openModal, toast, canDo, canActOnDeal, canReassign, isManager, loggedInUser } = useStore();
  const rfqStore = useContext(RfqDraft);
  const qcStore = useContext(QcDraft);
  const quoteStore = useContext(QuoteDraft);
  const qcFiles = async () => {
    const tag = async (ref, label) => (await readFiles(ref.current && ref.current.files)).map((x) => ({ ...x, docType: label }));
    let files = [...await tag(qcStore.docRefs.sds, "SDS"), ...await tag(qcStore.docRefs.tds, "TDS"), ...await tag(qcStore.docRefs.coa, "CoA")];
    for (const slot of qcStore.otherSlots) { if (slot.ref) files = [...files, ...(await readFiles(slot.ref.files)).map((x) => ({ ...x, docType: "Other" }))]; }
    return files;
  };

  const buttons = [];
  const Btn = (label, cls, onClick, enabled = true, tip = "") => buttons.push(<button key={label} className={"btn " + cls} disabled={!enabled} title={!enabled ? tip : undefined} onClick={onClick}>{label}</button>);

  switch (deal.status) {
    case "received":
      Btn("Save draft", "ghost", () => actions.saveStageDraft(deal, "received", { productName: rfqStore.productName, qty: rfqStore.qty, packSize: rfqStore.packSize, incoterm: rfqStore.incoterm, priceValidity: rfqStore.priceValidity, hsn: rfqStore.hsn, required: rfqStore.required, additionalInfo: rfqStore.additionalInfo, picks: rfqStore.picks, hrs: rfqStore.hrs }), true);
      Btn("Send RFQ →", "primary", () => {
        if (!rfqStore.picks.length) { toast("Pick at least one vendor", 1); return; }
        const missingTerms = [
          !rfqStore.productName.trim() && "Product name",
          !rfqStore.qty.trim() && "Quantity",
          !rfqStore.incoterm.trim() && "Incoterm",
        ].filter(Boolean);
        if (missingTerms.length) { toast("Please fill in: " + missingTerms.join(", "), 1); return; }
        openModal({ kind: "rfqDrafts", dealId: deal.id, terms: { productName: rfqStore.productName, qty: rfqStore.qty, packSize: rfqStore.packSize, incoterm: rfqStore.incoterm, priceValidity: rfqStore.priceValidity, hsn: rfqStore.hsn, required: rfqStore.required, additionalInfo: rfqStore.additionalInfo, spec: deal.spec, timeline: deal.timeline, customer: deal.customer, contactPerson: deal.contactPerson, contactPhone: deal.contactPhone, contactEmail: deal.contactEmail, channel: deal.channel }, picks: rfqStore.picks, hrs: +rfqStore.hrs || 36 });
      }, canActOnDeal(deal, "received", "edit"), "You don't have permission or this deal is not assigned to you");
      break;
    case "rfq":
      Btn("Mark quotes received →", "primary", () => actions.moveStage(deal, "vendor", "Vendor quote received"), deal.rfqs.some((r) => r.response) && canActOnDeal(deal, "rfq", "edit"), "Log at least one vendor quote first");
      break;
    case "vendor":
      Btn("Send to QC →", "primary", () => actions.moveStage(deal, "qc", "Sent to QC for vetting"), canActOnDeal(deal, "vendor", "edit"), "You don't have permission or this deal is not assigned to you");
      break;
    case "qc":
      Btn("Save QC draft", "ghost", () => actions.saveStageDraft(deal, "qc", { vendorStates: qcStore.vendorStates }), true);
      break;
    case "ready":
      Btn("Save draft", "ghost", () => actions.saveStageDraft(deal, "ready", { cols: quoteStore.cols, currency: quoteStore.currency, terms: quoteStore.terms, selectedVendorId: quoteStore.selectedVendorId, quoteUpTo: quoteStore.quoteUpTo }), true);
      Btn("Submit for approval →", "primary", () => {
        if (!quoteStore.selectedVendorId) { toast("Select a vendor to finalize the quotation", 1); return; }
        const vid = quoteStore.selectedVendorId;
        const col = quoteStore.cols[vid] || {};
        const c = quoteStore.colCalc(col);
        const e = (f) => evalExpr(col[f]);
        const rfqResp = deal.rfqs.find((r) => r.vendorId === vid);
        const resp = rfqResp ? rfqResp.response || {} : {};
        const draft = { vendorId: vid, selectedVendor: vendor(db, vid).name, exWorks: e("exWorks"), freightInland: e("freightInland"), cnf: e("cnf"), fob: col.fob ? e("fob") : c.fob, seaFreight: e("seaFreight"), cif: col.cif ? e("cif") : c.cif, duty: e("duty"), tariff: e("tariff"), otherCosts: e("otherCosts"), exWarehouse: col.exWarehouse ? e("exWarehouse") : c.exWarehouse, freightDelivery: e("freightDelivery"), margins: e("margins"), total: c.priceQuote, currency: quoteStore.currency, allVendorCols: quoteStore.cols };
        openModal({ kind: "finalQuote", dealId: deal.id, draft, terms: quoteStore.terms, resp });
      }, canActOnDeal(deal, "ready", "edit"), "You don't have permission or this deal is not assigned to you");
      break;
    case "approval": {
      const approved = deal.quoteApproval && deal.quoteApproval.status === "approved";
      if (approved) {
        Btn("Send approved quote to customer →", "primary", () => {
          const pq = deal.pendingQuote || {};
          const fq = pq.finalQuote || {};
          const cur = fq.currency || pq.currency || "₹";
          const emailClient = loggedInUser ? loggedInUser.emailClient || "mailto" : "mailto";
          const isNewCustomer = !db.deals.some((d) => d.id !== deal.id && d.customer.toLowerCase() === deal.customer.toLowerCase() && d.closed && d.closed.result === "won");
          const allTpls = db.emailTemplates || [];
          const tpl = allTpls.find((t) => t.id === fq.emailTplId) || allTpls.find((t) => t.type === (isNewCustomer ? "new_customer" : "existing_customer")) || allTpls[0];
          const emailVars = { "{{vendor_name}}": deal.customer, "{{customer}}": deal.customer, "{{product}}": fq.productName || deal.products, "{{quantity}}": fq.quantity || deal.qty + " " + (deal.unit || ""),
            "{{details}}": [`Price: ${cur}${fq.pricePerUnit} / ${deal.unit || "unit"}`, fq.incoterm ? `Incoterm: ${fq.incoterm}` : "", fq.packaging ? `Packaging: ${fq.packaging}` : "", fq.packSize ? `Pack Size: ${fq.packSize}` : "", fq.leadTime ? `Lead Time: ${fq.leadTime}` : "", fq.paymentTerm ? `Payment Terms: ${fq.paymentTerm}` : "", fq.priceValidity ? `Price Validity: ${fq.priceValidity}` : "", fq.otherTerms ? `Other Terms: ${fq.otherTerms}` : ""].filter(Boolean).join("\n"),
            "{{required_items}}": "", "{{additional_info}}": "" };
          let body = tpl ? tpl.body : `Dear ${deal.customer},\n\nPlease find our quotation below:\n\n{{details}}\n\nRegards`;
          Object.entries(emailVars).forEach(([k, v]) => { body = body.split(k).join(v); });
          body = body.replace(/\n{3,}/g, "\n\n").trim();
          const subject = tpl ? tpl.subject.replace("{{product}}", fq.productName || "").replace("{{quantity}}", fq.quantity || "") : `Quotation — ${fq.productName}`;
          window.open(buildEmailUrl(emailClient, deal.contactEmail || "", subject, body), "_blank");
          copyEmailToClipboard(subject, body, toast);
          actions.sendQuote(deal);
        }, canActOnDeal(deal, "approval", "create"), "You don't have permission or this deal is not assigned to you");
      } else {
        Btn("Approve quote", "ok", () => openModal({ kind: "approveQuote", dealId: deal.id }), canActOnDeal(deal, "approval", "edit"), "Only managers can approve quotes");
        Btn("Reject — revise quote", "danger", () => openModal({ kind: "rejectQuote", dealId: deal.id }), canActOnDeal(deal, "approval", "edit"), "Only managers can reject quotes");
      }
      break;
    }
    case "sent":
      Btn("Customer confirmed order →", "ok", () => actions.moveStage(deal, "order", "Customer confirmed order"), canActOnDeal(deal, "sent", "edit"), "You don't have permission or this deal is not assigned to you");
      Btn("Mark lost", "danger", () => openModal({ kind: "close", dealId: deal.id, result: "lost" }), canActOnDeal(deal, "sent", "edit"), "You don't have permission or this deal is not assigned to you");
      break;
    case "order":
      Btn("Close — Won", "ok", () => openModal({ kind: "close", dealId: deal.id, result: "won" }), canActOnDeal(deal, "order", "edit"), "You don't have permission or this deal is not assigned to you");
      break;
    default: break;
  }
  const stageIdx = STAGES.findIndex((s) => s.k === deal.status);
  if (stageIdx > 0 && (canActOnDeal(deal, deal.status, "edit") || isManager)) {
    buttons.push(<button key="sendback" className="btn ghost" onClick={() => openModal({ kind: "sendBack", dealId: deal.id })} style={{ color: "var(--signal)" }}>← Send back</button>);
  }
  if (canReassign(deal)) buttons.push(<button key="reassign" className="btn ghost" onClick={() => openModal({ kind: "reassign", dealId: deal.id })}>Reassign owner</button>);
  if (canActOnDeal(deal, deal.status, "delete")) {
    buttons.push(<button key="delete" className="btn danger" onClick={() => openModal({ kind: "deleteDeal", dealId: deal.id })} style={{ marginLeft: "auto" }}>Archive deal</button>);
  } else if (!deal.deleteRequest && loggedInUser) {
    buttons.push(<button key="requestdelete" className="btn ghost" onClick={() => openModal({ kind: "requestDelete", dealId: deal.id })} style={{ color: "var(--breach)", marginLeft: "auto" }}>Request deletion →</button>);
  }

  return <div className="dr-foot">{buttons}</div>;
}

/* --------------------------------- sop view -------------------------------- */
const ROLE_SOP_MAP = [
  { role: "Sales",     sop: SOP_SALES },
  { role: "Purchaser", sop: SOP_PURCHASER },
  { role: "QC Team",   sop: SOP_QC },
  { role: "Manager",   sop: SOP_MANAGER },
  { role: "Admin",     sop: SOP_ADMIN },
];
function buildSOPHtml(sops) {
  const escape = (t) => (t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sections = sops.map((sop) => {
    const secHtml = sop.sections.map((sec) => {
      let stepNum = 0;
      const items = sec.items.map((item) => {
        if (item.type === "step") {
          stepNum++;
          return `<p style="margin:4px 0 6px 0;padding-left:30px;position:relative;font-size:11pt;line-height:1.6;color:#1a1a1a;">
            <span style="position:absolute;left:0;top:1px;display:inline-block;width:20px;height:20px;border-radius:50%;background:${sop.roleColor}22;color:${sop.roleColor};font-size:9pt;font-weight:700;text-align:center;line-height:20px;">${stepNum}</span>
            ${escape(item.text)}</p>`;
        }
        if (item.type === "bullet") return `<p style="margin:4px 0;padding-left:20px;font-size:11pt;line-height:1.6;color:#1a1a1a;">&#8226;&nbsp;${escape(item.text)}</p>`;
        if (item.type === "note") return `<p style="margin:8px 0;padding:8px 12px;border-left:3px solid #2d9e6b;background:#f0faf5;font-size:10.5pt;line-height:1.6;color:#1a1a1a;"><strong>Note:</strong> ${escape(item.text)}</p>`;
        if (item.type === "para") return `<p style="margin:4px 0 8px 0;font-size:11pt;line-height:1.6;color:#1a1a1a;">${escape(item.text)}</p>`;
        return "";
      }).join("");
      return `<div style="margin-bottom:14px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:4px;page-break-inside:avoid;">
        <h3 style="margin:0 0 10px 0;font-size:12pt;font-weight:700;color:${sop.roleColor};padding-bottom:8px;border-bottom:1px solid #e2e8f0;">${escape(sec.heading)}</h3>
        ${items}
      </div>`;
    }).join("");
    return `<div style="page-break-before:always;">
      <h1 style="margin:0 0 4px 0;font-size:20pt;font-weight:700;color:#1a1a1a;border-bottom:3px solid ${sop.roleColor};padding-bottom:8px;">${escape(sop.title)}</h1>
      <p style="margin:0 0 6px 0;font-size:10pt;color:#666;">Login: <span style="font-family:monospace;">${escape(sop.login)}</span></p>
      <div style="margin:12px 0 18px 0;padding:12px 16px;border-left:4px solid ${sop.roleColor};background:#f8f9fa;">
        <p style="margin:0;font-size:11pt;line-height:1.6;color:#1a1a1a;"><strong>Overview:</strong> ${escape(sop.overview)}</p>
      </div>
      ${secHtml}
    </div>`;
  }).join("");
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Infinitee DealFlow — SOP</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; margin: 2cm; }
  h1 { font-size: 20pt; } h2 { font-size: 14pt; } h3 { font-size: 12pt; }
  p { margin: 4px 0; }
  @page { margin: 2cm; }
</style></head>
<body>
<h1 style="text-align:center;font-size:22pt;color:#1a1a1a;border-bottom:2px solid #ccc;padding-bottom:10px;margin-bottom:6px;">Infinitee DealFlow</h1>
<p style="text-align:center;font-size:12pt;color:#666;margin-bottom:0;">Standard Operating Procedures</p>
<p style="text-align:center;font-size:10pt;color:#999;margin-top:4px;">Generated ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
${sections}
</body></html>`;
}
function downloadSOPDoc(sops, filename) {
  const html = buildSOPHtml(Array.isArray(sops) ? sops : [sops]);
  const blob = new Blob(["﻿" + html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function SOPView() {
  const { loggedInUser } = useStore();
  const userRoles = (loggedInUser && loggedInUser.roles) || [];
  const isAdmin = userRoles.includes("Admin");
  const sops = isAdmin ? ROLE_SOP_MAP.map((m) => m.sop) : ROLE_SOP_MAP.filter((m) => userRoles.includes(m.role)).map((m) => m.sop);
  const [active, setActive] = useState(() => (sops[0] || {}).role || "");
  const sop = sops.find((s) => s.role === active) || sops[0];
  if (!sop) return <Empty big="No SOP available" sub="Contact your Admin." />;
  const fileName = (s) => `SOP_${s.role.replace(/\s+/g, "_")}_Infinitee.doc`;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>{sop.title}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>Login: <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{sop.login}</span></div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {sops.length > 1 && sops.map((s) => (
            <button key={s.role} className={"btn sm" + (active === s.role ? " primary" : " ghost")} style={active === s.role ? { background: s.roleColor, borderColor: s.roleColor } : {}} onClick={() => setActive(s.role)}>{s.role}</button>
          ))}
          <button className="btn sm" style={{ display: "flex", alignItems: "center", gap: 5 }} onClick={() => downloadSOPDoc(sop, fileName(sop))}>
            <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Download SOP
          </button>
          {isAdmin && (
            <button className="btn sm ghost" style={{ display: "flex", alignItems: "center", gap: 5 }} onClick={() => downloadSOPDoc(sops, "SOP_All_Roles_Infinitee.doc")}>
              <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Download all
            </button>
          )}
        </div>
      </div>
      <div className="panel" style={{ padding: "16px 20px", marginBottom: 16, borderLeft: `4px solid ${sop.roleColor}` }}>
        <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6 }}><b>Overview:</b> {sop.overview}</div>
      </div>
      {sop.sections.map((sec, si) => (
        <div key={si} className="panel" style={{ padding: "14px 20px", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: sop.roleColor, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>{sec.heading}</div>
          <div>
            {(() => {
              let stepNum = 0;
              return sec.items.map((item, ii) => {
                if (item.type === "step") {
                  stepNum++;
                  return (
                    <div key={ii} style={{ display: "flex", gap: 10, marginBottom: 7, alignItems: "flex-start" }}>
                      <span style={{ minWidth: 22, height: 22, borderRadius: "50%", background: sop.roleColor + "20", color: sop.roleColor, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", marginTop: 1 }}>{stepNum}</span>
                      <span style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.55 }}>{item.text}</span>
                    </div>
                  );
                }
                if (item.type === "bullet") return (
                  <div key={ii} style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start", paddingLeft: 4 }}>
                    <span style={{ minWidth: 6, height: 6, borderRadius: "50%", background: sop.roleColor, flex: "none", marginTop: 7 }} />
                    <span style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.55 }}>{item.text}</span>
                  </div>
                );
                if (item.type === "note") return (
                  <div key={ii} style={{ display: "flex", gap: 8, marginBottom: 8, marginTop: 4, padding: "8px 12px", borderRadius: 6, background: "var(--ok-soft)", border: "1px solid var(--ok)", alignItems: "flex-start" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#127a51", flex: "none" }}>Note:</span>
                    <span style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.55 }}>{item.text}</span>
                  </div>
                );
                if (item.type === "para") return <div key={ii} style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6, marginBottom: 8 }}>{item.text}</div>;
                return null;
              });
            })()}
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- modals --------------------------------- */
function ModalHost({ modal }) {
  switch (modal.kind) {
    case "newEnquiry": return <NewEnquiryModal />;
    case "rfqDrafts": return <RfqDraftsModal dealId={modal.dealId} terms={modal.terms} picks={modal.picks} hrs={modal.hrs} mode={modal.mode} />;
    case "finalQuote": return <FinalQuoteModal dealId={modal.dealId} draft={modal.draft} terms={modal.terms} resp={modal.resp} />;
    case "approveQuote": return <ApproveQuoteModal dealId={modal.dealId} />;
    case "rejectQuote": return <RejectQuoteModal dealId={modal.dealId} />;
    case "recordQuote": return <RecordQuoteModal dealId={modal.dealId} vendorId={modal.vendorId} />;
    case "logFollowup": return <LogFollowupModal dealId={modal.dealId} fid={modal.fid} />;
    case "close": return <CloseModal dealId={modal.dealId} result={modal.result} />;
    case "deleteDeal": return <DeleteDealModal dealId={modal.dealId} />;
    case "requestDelete": return <RequestDeleteModal dealId={modal.dealId} />;
    case "sendBack": return <SendBackModal dealId={modal.dealId} />;
    case "infiniteeCoa": return <InfiniteeCoaModal dealId={modal.dealId} vendorId={modal.vendorId} />;
    case "reassign": return <ReassignModal dealId={modal.dealId} />;
    case "vendor": return <VendorModal vendorId={modal.vendorId} />;
    case "user": return <UserModal userId={modal.userId} />;
    case "addProduct": return <AddProductModal />;
    case "import": return <ImportModal />;
    default: return null;
  }
}
function NewEnquiryModal() {
  const { db, actions, closeModal, toast } = useStore();
  const emptyLine = () => ({ id: now() + Math.random(), product: "", qty: "", unit: "", spec: "", timeline: "", application: "Not known" });
  const [f, setF] = useState({ customer: "", contactPerson: "", contactPhone: "", contactEmail: "", channel: "Email", ownerId: db.team[0].id, priority: "Medium", restrictions: [] });
  const [lines, setLines] = useState([emptyLine()]);
  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const removeLine = (id) => setLines((p) => p.length > 1 ? p.filter((l) => l.id !== id) : p);
  const setLine = (id, k, v) => setLines((p) => p.map((l) => l.id === id ? { ...l, [k]: v } : l));
  const [vendorQ, setVendorQ] = useState("");
  const vendorOpts = db.vendors.filter((v) => v.active !== false && !f.restrictions.includes(v.id) && v.name.toLowerCase().includes(vendorQ.toLowerCase().trim()));
  const addVendor = (vid) => { setF((p) => ({ ...p, restrictions: [...p.restrictions, vid] })); setVendorQ(""); };
  const removeVendor = (vid) => setF((p) => ({ ...p, restrictions: p.restrictions.filter((x) => x !== vid) }));
  const fileRef = useRef(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Modal title="New customer enquiry" okLabel={lines.length > 1 ? `Create ${lines.length} deals (grouped)` : "Create deal"} onClose={closeModal} onOk={async () => {
      if (!f.customer.trim()) { toast("Customer name needed", 1); return false; }
      const validLines = lines.filter((l) => l.product.trim());
      if (!validLines.length) { toast("Add at least one product", 1); return false; }
      const specFiles = await readFiles(fileRef.current && fileRef.current.files);
      const groupId = validLines.length > 1 ? actions.createGroupId() : null;
      validLines.forEach((l, i) => {
        const pm = db.products.find((p) => p.name.toLowerCase() === l.product.trim().toLowerCase());
        actions.createDeal({ customer: f.customer.trim(), contactPerson: f.contactPerson.trim(), contactPhone: f.contactPhone.trim(), contactEmail: f.contactEmail.trim(), channel: f.channel, ownerId: f.ownerId, products: l.product.trim() || "(to confirm)", productId: pm ? pm.id : null, qty: l.qty || "—", unit: l.unit || "", spec: l.spec, timeline: l.timeline, priority: f.priority, application: l.application, groupId, restrictions: f.restrictions, specFiles: i === 0 ? specFiles : [] });
      });
      if (validLines.length > 1) toast(`${validLines.length} grouped deals created`);
    }}>
      <div className="field"><label>Customer</label><input value={f.customer} onChange={set("customer")} placeholder="Company name" /></div>
      <div className="row3">
        <div className="field"><label>Contact person</label><input value={f.contactPerson} onChange={set("contactPerson")} placeholder="Name" /></div>
        <div className="field"><label>Phone</label><input value={f.contactPhone} onChange={set("contactPhone")} placeholder="+91 98765 43210" /></div>
        <div className="field"><label>Email</label><input value={f.contactEmail} onChange={set("contactEmail")} placeholder="name@company.com" /></div>
      </div>
      <div className="row3">
        <div className="field"><label>Channel</label><select value={f.channel} onChange={set("channel")}>{["Email", "WhatsApp", "Phone", "CRM form"].map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label>Assign to</label><select value={f.ownerId} onChange={set("ownerId")}>{db.team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="field"><label>Priority</label><select value={f.priority} onChange={set("priority")}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></div>
      </div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6, marginTop: 4 }}>Products <span style={{ fontWeight: 400 }}>— add multiple products to create grouped deals</span></label>
      {lines.map((l, i) => (
        <div key={l.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", marginBottom: 8, background: "var(--surface)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>Product {i + 1}</span>
            {lines.length > 1 && <button onClick={() => removeLine(l.id)} style={{ marginLeft: "auto", border: "none", background: "none", color: "var(--breach)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
          </div>
          <div className="field" style={{ marginBottom: 8 }}><input list="prod-list" value={l.product} onChange={(e) => setLine(l.id, "product", e.target.value)} placeholder="Product name — pick from catalog" /></div>
          <div className="row3">
            <div className="field" style={{ marginBottom: 0 }}><label>Qty</label><input value={l.qty} onChange={(e) => setLine(l.id, "qty", e.target.value)} placeholder="2000" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Unit</label><input value={l.unit} onChange={(e) => setLine(l.id, "unit", e.target.value)} placeholder="L / kg" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Delivery</label><input value={l.timeline} onChange={(e) => setLine(l.id, "timeline", e.target.value)} placeholder="3 weeks" /></div>
          </div>
          <div className="row2" style={{ marginTop: 8 }}>
            <div className="field" style={{ marginBottom: 0 }}><label>Spec</label><input value={l.spec} onChange={(e) => setLine(l.id, "spec", e.target.value)} placeholder="e.g. ≥99.9%" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Application</label><select value={l.application} onChange={(e) => setLine(l.id, "application", e.target.value)}>{["Personal care", "Home care", "Industrial application", "Pharma", "Food", "Not known"].map((a) => <option key={a}>{a}</option>)}</select></div>
          </div>
        </div>
      ))}
      <datalist id="prod-list">{db.products.filter((p) => p.active !== false).map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <button className="btn ghost sm" onClick={addLine} style={{ marginBottom: 12 }}>+ Add another product</button>
      <div className="field"><label>Attach vendor specs</label><input type="file" multiple ref={fileRef} /><div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 5 }}>Spec sheets travel with the deal — vendors quote against them and QC vets against them.</div></div>
      <div className="field"><label>Approved vendors only <span style={{ fontWeight: 400, color: "var(--muted-2)" }}>(optional)</span></label>
        {f.restrictions.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>{f.restrictions.map((vid) => <span key={vid} className="tag" style={{ background: "var(--ok-soft)", color: "#127a51", gap: 4 }}>{vendor(db, vid).name}<button onClick={() => removeVendor(vid)} style={{ border: "none", background: "none", color: "#127a51", cursor: "pointer", padding: "0 0 0 2px", fontWeight: 700, fontSize: 13, lineHeight: 1 }}>×</button></span>)}</div>}
        <div style={{ position: "relative" }}>
          <input value={vendorQ} onChange={(e) => setVendorQ(e.target.value)} placeholder="Type vendor name…" />
          {vendorQ.trim().length > 0 && vendorOpts.length > 0 && <div style={{ position: "absolute", left: 0, right: 0, top: "100%", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "0 0 8px 8px", boxShadow: "var(--shadow)", zIndex: 10, maxHeight: 160, overflow: "auto" }}>{vendorOpts.map((v) => <div key={v.id} onClick={() => addVendor(v.id)} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, fontWeight: 500 }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{v.name}</div>)}</div>}
        </div>
      </div>
    </Modal>
  );
}
function renderTemplate(tplBody, deal, terms, v, user) {
  const req = terms.required || {};
  const reqList = REQ_ITEMS.filter(([k]) => req[k]).map(([, l]) => l);
  const reqBlock = reqList.length ? "Please include the following in your response:\n" + reqList.map((l) => `  - ${l}`).join("\n") : "";
  const detailLines = [];
  if (terms.packSize) detailLines.push(`Pack size: ${terms.packSize}`);
  if (terms.incoterm) detailLines.push(`Incoterm / Delivery: ${terms.incoterm}`);
  if (terms.priceValidity) detailLines.push(`Price validity required: ${terms.priceValidity}`);
  if (terms.hsn) detailLines.push(`HSN code: ${terms.hsn}`);
  if (deal.spec) detailLines.push(`Specification: ${deal.spec}`);
  if (deal.timeline) detailLines.push(`Delivery timeline: ${deal.timeline}`);
  const vars = {
    "{{vendor_name}}": v.name,
    "{{vendor_contact}}": v.contactPerson || "",
    "{{vendor_email}}": v.email || "",
    "{{contact_person}}": v.contactPerson || v.name,
    "{{customer}}": deal.customer,
    "{{customer_contact}}": deal.contactPerson || "",
    "{{customer_email}}": deal.contactEmail || "",
    "{{customer_phone}}": deal.contactPhone || "",
    "{{product}}": terms.productName || deal.products,
    "{{quantity}}": terms.qty || (deal.qty + " " + (deal.unit || "")),
    "{{user}}": (user && user.name) || "",
    "{{user_email}}": (user && user.loginEmail) || "",
    "{{user_mobile}}": (user && user.mobile) || "",
    "{{signature}}": [user && user.name, user && user.loginEmail, user && user.mobile].filter(Boolean).join("\n"),
    "{{details}}": detailLines.join("\n"),
    "{{required_items}}": reqBlock,
    "{{additional_info}}": terms.additionalInfo || "",
  };
  let out = tplBody;
  Object.entries(vars).forEach(([k, val]) => { out = out.split(k).join(val); });
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
function RfqDraftsModal({ dealId, terms, picks, hrs, mode }) {
  const { db, actions, closeModal, toast, loggedInUser } = useStore();
  const emailClient = loggedInUser ? loggedInUser.emailClient || "mailto" : "mailto";
  const deal = db.deals.find((d) => d.id === dealId);
  const isAdd = mode === "add";
  const vendors = picks.map((vid) => db.vendors.find((v) => v.id === vid)).filter(Boolean);
  const [opened, setOpened] = useState({});
  const hasHistory = (vid) => db.deals.some((d) => d.id !== dealId && d.rfqs.some((r) => r.vendorId === vid));
  const defaultTpl = (vid) => { const h = hasHistory(vid); const t = db.emailTemplates || []; const match = t.find((x) => x.type === (h ? "existing" : "new")); return match ? match.id : (t[0] ? t[0].id : null); };
  const [tplPicks, setTplPicks] = useState(() => { const m = {}; picks.forEach((vid) => { m[vid] = defaultTpl(vid); }); return m; });
  const getTpl = (vid) => (db.emailTemplates || []).find((t) => t.id === tplPicks[vid]) || (db.emailTemplates || [])[0] || null;
  const subject = `RFQ — ${terms.productName || deal.products} — ${terms.qty || deal.qty + " " + (deal.unit || "")}`;
  const getBody = (v) => { const tpl = getTpl(v.id); return tpl ? renderTemplate(tpl.body, deal, terms, v, loggedInUser) : "(no template configured)"; };
  const openDraft = (v) => {
    window.open(buildEmailUrl(emailClient, v.email || "", subject, getBody(v)), "_blank");
    setOpened((p) => ({ ...p, [v.id]: true }));
  };
  const allOpened = vendors.every((v) => opened[v.id]);
  const templates = db.emailTemplates || [];
  const confirmLabel = allOpened ? (isAdd ? "Confirm & add to RFQ" : "Confirm & send RFQ") : (isAdd ? "Add to RFQ (skip remaining drafts)" : "Send RFQ (skip remaining drafts)");
  return (
    <Modal title={isAdd ? "Review RFQ email drafts — additional vendors" : "Review RFQ email drafts"} okLabel={confirmLabel} onClose={closeModal} onOk={() => {
      if (isAdd) actions.addRFQVendors(deal, { picks, hrs });
      else actions.sendRFQ(deal, { terms, picks, hrs });
    }}>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 14px" }}>Each vendor gets a separate email draft. Choose a template, preview the email, then open it in your email client to review and send.</p>
      {vendors.map((v) => {
        const tpl = getTpl(v.id);
        const body = tpl ? renderTemplate(tpl.body, deal, terms, v, loggedInUser) : "(no email template configured — add one under Email Templates)";
        const isExisting = hasHistory(v.id);
        return (
          <div key={v.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--radius)", marginBottom: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: opened[v.id] ? "var(--ok-soft)" : "var(--surface)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{v.name} <span className="tag" style={{ background: isExisting ? "var(--info-soft)" : "var(--signal-soft)", color: isExisting ? "var(--info)" : "var(--signal)", marginLeft: 4 }}>{isExisting ? "Existing" : "New"}</span></div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{v.email || "no email set — add one under Vendors"}</div>
              </div>
              {templates.length > 1 && !opened[v.id] && <select value={tplPicks[v.id] || ""} onChange={(e) => setTplPicks((p) => ({ ...p, [v.id]: e.target.value }))} style={{ padding: "5px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "#fff" }}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
              <EmailDraftBtn to={v.email || ""} subject={subject} body={getBody(v)} opened={opened[v.id]} onOpened={() => setOpened((p) => ({ ...p, [v.id]: true }))} />
            </div>
            <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--muted)", whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", borderTop: "1px solid var(--line-2)", background: "var(--card)", fontFamily: "var(--mono)", lineHeight: 1.5 }}>{body}</div>
          </div>
        );
      })}
      {!allOpened && <div className="note" style={{ marginTop: 4 }}><span className="ic">i</span><div>Open all email drafts before confirming, or click the button below to skip and record the RFQ directly.</div></div>}
    </Modal>
  );
}
function FinalQuoteModal({ dealId, draft, terms: initTerms, resp }) {
  const { db, actions, closeModal, openModal: showModal, toast, loggedInUser } = useStore();
  const emailClient = loggedInUser ? loggedInUser.emailClient || "mailto" : "mailto";
  const deal = db.deals.find((d) => d.id === dealId);
  const prod = deal.productId ? product(db, deal.productId) : null;
  const pName = prod ? prod.name : deal.products;
  const pBrand = prod ? prod.brandName || "" : "";
  const hasBrand = !!pBrand;
  const cur = draft.currency || "₹";
  const [f, setF] = useState({
    productName: hasBrand ? `${pName} (${pBrand})` : pName || "", quantity: (deal.qty || "") + (deal.unit ? " " + deal.unit : ""),
    pricePerUnit: draft.total ? String(Number(draft.total).toFixed(2)) : "",
    incoterm: resp.incoterm || "", packaging: resp.packaging || "", packSize: resp.packSize || "",
    leadTime: resp.leadTime || "", paymentTerm: resp.terms || initTerms || "", priceValidity: resp.priceValidity || "",
    otherTerms: "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const isNewCustomer = !db.deals.some((d) => d.id !== dealId && d.customer.toLowerCase() === deal.customer.toLowerCase() && d.closed && d.closed.result === "won");
  const tplType = isNewCustomer ? "new_customer" : "existing_customer";
  const templates = (db.emailTemplates || []).filter((t) => t.type === tplType || t.type === "general" || t.type === "customer_quote");
  const allTpls = db.emailTemplates || [];
  const [tplId, setTplId] = useState(() => { const m = allTpls.find((t) => t.type === tplType); return m ? m.id : (allTpls[0] ? allTpls[0].id : ""); });
  return (
    <Modal title="Finalize quotation — submit for approval" okLabel="Submit for manager approval" onClose={closeModal} onOk={() => {
      if (!hasBrand) { toast("Brand name is required before quoting. Update the product in the Products catalog first.", 1); return false; }
      if (!f.pricePerUnit) { toast("Price per unit is required", 1); return false; }
      const finalQuote = { ...f, currency: cur, total: draft.total, emailTplId: tplId, brandName: pBrand };
      actions.submitForApproval(deal, { draft: { ...draft, finalQuote }, terms: f.paymentTerm });
    }}>
      {!hasBrand && <div className="note" style={{ background: "var(--breach-soft)", borderColor: "#f1c9c9", marginBottom: 14 }}><span className="ic" style={{ color: "var(--breach)" }}>✕</span><div><b>Brand name missing.</b> This product does not have an Infin Brand Name set. Go to <b>Products</b> catalog to add it before submitting the quotation. You cannot proceed without a brand name.</div></div>}
      <div className="note" style={{ marginBottom: 14 }}><span className="ic">i</span><div>Complete the quotation details below. This will be submitted for <b>manager approval</b> before being sent to <b>{deal.customer}</b>{deal.contactEmail && <> ({deal.contactEmail})</>}. Customer type: <b>{isNewCustomer ? "New" : "Existing"}</b></div></div>
      <div className="row2">
        <div className="field"><label>Product name</label><input value={f.productName} onChange={set("productName")} /></div>
        <div className="field"><label>Quantity</label><input value={f.quantity} onChange={set("quantity")} /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Price / {deal.unit || "unit"} ({cur})</label><input value={f.pricePerUnit} onChange={set("pricePerUnit")} placeholder="e.g. 150.00" /></div>
        <div className="field"><label>Incoterm</label><input value={f.incoterm} onChange={set("incoterm")} placeholder="e.g. CIF, FOB" /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Packaging</label><input value={f.packaging} onChange={set("packaging")} placeholder="e.g. HDPE drums" /></div>
        <div className="field"><label>Pack Size</label><input value={f.packSize} onChange={set("packSize")} placeholder="e.g. 25 kg bags" /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Lead Time</label><input value={f.leadTime} onChange={set("leadTime")} placeholder="e.g. 10 days" /></div>
        <div className="field"><label>Payment Term</label><input value={f.paymentTerm} onChange={set("paymentTerm")} placeholder="e.g. 30 days credit" /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Price Validity</label><input value={f.priceValidity} onChange={set("priceValidity")} placeholder="e.g. 30 days" /></div>
        <div className="field"><label>Other Terms</label><input value={f.otherTerms} onChange={set("otherTerms")} placeholder="e.g. MOQ, certifications" /></div>
      </div>
      <div className="field" style={{ marginTop: 6 }}>
        <label>Email template</label>
        <select value={tplId} onChange={(e) => setTplId(e.target.value)} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", fontSize: 14 }}>
          {allTpls.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.type})</option>)}
          {!allTpls.length && <option value="">No templates — add one under Email Templates</option>}
        </select>
        <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 5 }}>Choose a template for the customer quotation email. Add customer-specific templates under Email Templates with type "new_customer" or "existing_customer".</div>
      </div>
    </Modal>
  );
}
function ApproveQuoteModal({ dealId }) {
  const { db, actions, closeModal } = useStore();
  const deal = db.deals.find((d) => d.id === dealId);
  const [notes, setNotes] = useState("");
  return (
    <Modal title="Approve quotation" okLabel="Approve" onClose={closeModal} onOk={() => actions.approveQuote(deal, notes)}>
      <div className="note" style={{ background: "var(--ok-soft)", borderColor: "#bfe6d2", marginBottom: 14 }}><span className="ic" style={{ color: "var(--ok)" }}>✓</span><div>You are approving the quotation of <b>{money((deal.pendingQuote || {}).total, ((deal.pendingQuote || {}).finalQuote || {}).currency)}</b> for <b>{deal.customer}</b>. Once approved, the quote will be locked and the seller can send it to the customer.</div></div>
      <div className="field"><label>Approval notes (optional)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes or conditions for the seller…" /></div>
    </Modal>
  );
}
function RejectQuoteModal({ dealId }) {
  const { db, actions, closeModal, toast } = useStore();
  const deal = db.deals.find((d) => d.id === dealId);
  const [reason, setReason] = useState("");
  return (
    <Modal title="Reject quotation" okLabel="Reject & return to quote builder" onClose={closeModal} onOk={() => {
      if (!reason.trim()) { toast("Please provide a reason for rejection", 1); return false; }
      actions.rejectQuote(deal, reason.trim());
    }}>
      <div className="note" style={{ background: "var(--breach-soft)", borderColor: "#f1c9c9", marginBottom: 14 }}><span className="ic" style={{ color: "var(--breach)" }}>✕</span><div>The deal will return to the <b>Ready to quote</b> stage so the seller can revise the quotation.</div></div>
      <div className="field"><label>Reason for rejection</label><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. margin too low, wrong incoterm, price needs adjustment…" /></div>
    </Modal>
  );
}
function RecordQuoteModal({ dealId, vendorId }) {
  const { db, actions, closeModal, toast } = useStore();
  const deal = db.deals.find((d) => d.id === dealId);
  const rt = deal.rfqTerms || {};
  const req = rt.required || {};
  const [f, setF] = useState({ price: "", currency: "INR", incoterm: rt.incoterm || "", packaging: "", packSize: rt.packSize || "", qtyPallet: "", qtyContainer: "", leadTime: "", hsnCode: rt.hsn || "", priceValidity: rt.priceValidity || "", terms: "", dev: "" });
  const CURRENCIES = [["INR", "₹ INR"], ["USD", "$ USD"], ["EUR", "€ EUR"], ["GBP", "£ GBP"], ["AED", "AED"], ["SGD", "SGD"], ["JPY", "¥ JPY"], ["CNY", "¥ CNY"]];
  const refs = { coa: useRef(null), tds: useRef(null), msds: useRef(null) };
  const [otherRefs, setOtherRefs] = useState([{ id: "o0", ref: null }]);
  const addOtherSlot = () => setOtherRefs((p) => [...p, { id: "o" + now(), ref: null }]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Modal title={"Log quote — " + vendor(db, vendorId).name} okLabel="Save quote" onClose={closeModal} onOk={async () => {
      if (!f.price) { toast("Enter a price", 1); return false; }
      const tag = async (ref, label) => (await readFiles(ref.current && ref.current.files)).map((x) => ({ ...x, docType: label }));
      let otherFiles = [];
      for (const slot of otherRefs) { if (slot.ref) otherFiles = [...otherFiles, ...(await readFiles(slot.ref.files)).map((x) => ({ ...x, docType: "Other" }))]; }
      const attachments = [...await tag(refs.coa, "CoA"), ...await tag(refs.tds, "TDS"), ...await tag(refs.msds, "MSDS"), ...otherFiles];
      const docs = { coa: attachments.some((a) => a.docType === "CoA"), tds: attachments.some((a) => a.docType === "TDS"), msds: attachments.some((a) => a.docType === "MSDS") };
      actions.recordQuote(deal, vendorId, { price: f.price, currency: f.currency, incoterm: f.incoterm, packaging: f.packaging, packSize: f.packSize, qtyPallet: f.qtyPallet, qtyContainer: f.qtyContainer, leadTime: f.leadTime, hsnCode: f.hsnCode, priceValidity: f.priceValidity, hsn: f.hsnCode, terms: f.terms, docs, attachments, deviations: f.dev, receivedAt: now() });
    }}>
      {rt.required && <div className="note" style={{ marginBottom: 14 }}><span className="ic">i</span><div>Fields marked with <b>*</b> were requested from this vendor in the RFQ.</div></div>}
      <div className="row3">
        <div className="field"><label>Currency</label><select value={f.currency} onChange={set("currency")} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", fontSize: 14 }}>{CURRENCIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label>Price / Kg {req.pricePerKg ? "*" : ""}</label><input type="number" value={f.price} onChange={set("price")} placeholder="e.g. 120" /></div>
        <div className="field"><label>IncoTerm {req.incoterm ? "*" : ""}</label><input value={f.incoterm} onChange={set("incoterm")} placeholder="e.g. FOB, CIF, EXW" /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Packaging {req.packaging ? "*" : ""}</label><input value={f.packaging} onChange={set("packaging")} placeholder="e.g. HDPE drums" /></div>
        <div className="field"><label>Pack Size {req.packSize ? "*" : ""}</label><input value={f.packSize} onChange={set("packSize")} placeholder="e.g. 25 kg bags" /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Qty / Pallet {req.qtyPallet ? "*" : ""}</label><input value={f.qtyPallet} onChange={set("qtyPallet")} placeholder="e.g. 40 bags" /></div>
        <div className="field"><label>Qty / Container {req.qtyContainer ? "*" : ""}</label><input value={f.qtyContainer} onChange={set("qtyContainer")} placeholder="e.g. 20 MT" /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Lead Time / Availability {req.leadTime ? "*" : ""}</label><input value={f.leadTime} onChange={set("leadTime")} placeholder="e.g. 10 days" /></div>
        <div className="field"><label>HSN Code {req.hsnCode ? "*" : ""}</label><input value={f.hsnCode} onChange={set("hsnCode")} placeholder="e.g. 29051220" /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Price validity</label><input value={f.priceValidity} onChange={set("priceValidity")} placeholder="e.g. 30 days" /></div>
        <div className="field"><label>Payment terms</label><input value={f.terms} onChange={set("terms")} placeholder="e.g. 30 days credit" /></div>
      </div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 8 }}>SDS / TDS / COA documents {req.sdsTdsCoa ? "*" : ""}</label>
      <div className="row3">
        <div className="field"><label>CoA</label><input type="file" multiple ref={refs.coa} /></div>
        <div className="field"><label>TDS</label><input type="file" multiple ref={refs.tds} /></div>
        <div className="field"><label>MSDS / SDS</label><input type="file" multiple ref={refs.msds} /></div>
      </div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 8 }}>Other documents <span style={{ fontWeight: 400 }}>(quotation, test reports, certificates…)</span></label>
      {otherRefs.map((slot, i) => (
        <div className="field" key={slot.id}><label>Document {i + 1}</label><input type="file" multiple ref={(el) => { slot.ref = el; }} /></div>
      ))}
      <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={addOtherSlot}>+ Add more documents</button>
      <div className="field"><label>Deviations from spec (if any)</label><input value={f.dev} onChange={set("dev")} placeholder="leave blank if none" /></div>
    </Modal>
  );
}
function LogFollowupModal({ dealId, fid }) {
  const { db, actions, closeModal, loggedInUser, toast } = useStore();
  const emailClient = loggedInUser ? loggedInUser.emailClient || "mailto" : "mailto";
  const deal = db.deals.find((d) => d.id === dealId);
  const [outcome, setOutcome] = useState("No response yet");
  const [note, setNote] = useState("");
  const doneCount = deal.followups.filter((f) => f.doneAt).length;
  const isFirst = doneCount === 0;
  const tplType = isFirst ? "followup_first" : "followup_subsequent";
  const allTpls = db.emailTemplates || [];
  const defaultTpl = allTpls.find((t) => t.type === tplType) || allTpls.find((t) => t.type === "followup_first") || allTpls[0];
  const [tplId, setTplId] = useState(defaultTpl ? defaultTpl.id : "");
  const [emailOpened, setEmailOpened] = useState(false);
  const pName = deal.productId ? (product(db, deal.productId) || {}).name : deal.products;
  const buildBody = () => {
    const tpl = allTpls.find((t) => t.id === tplId);
    if (!tpl) return "";
    const vars = { "{{customer}}": deal.customer, "{{vendor_name}}": deal.customer, "{{product}}": pName, "{{quantity}}": (deal.qty || "") + (deal.unit ? " " + deal.unit : ""), "{{details}}": "", "{{required_items}}": "", "{{additional_info}}": "" };
    let body = tpl.body;
    Object.entries(vars).forEach(([k, v]) => { body = body.split(k).join(v); });
    return body.replace(/\n{3,}/g, "\n\n").trim();
  };
  const getSubject = () => { const tpl = allTpls.find((t) => t.id === tplId); return tpl ? tpl.subject.replace("{{product}}", pName).replace("{{quantity}}", (deal.qty || "") + " " + (deal.unit || "")) : "Follow-up: " + pName; };
  return (
    <Modal title="Log follow-up" okLabel="Save & log follow-up" onClose={closeModal} onOk={() => actions.logFollowup(deal, fid, { outcome, note })}>
      <div className="field"><label>Outcome</label><select value={outcome} onChange={(e) => setOutcome(e.target.value)}>{["No response yet", "In review", "Negotiating", "Objection raised", "Ready to order"].map((o) => <option key={o}>{o}</option>)}</select></div>
      <div className="field"><label>Notes</label><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Feedback, objections, expected decision date…" /></div>
      <div style={{ borderTop: "1px solid var(--line)", marginTop: 8, paddingTop: 14 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 8 }}>Send follow-up email to {deal.customer}</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <select value={tplId} onChange={(e) => setTplId(e.target.value)} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 6, padding: "7px 10px", fontSize: 13 }}>
            {allTpls.filter((t) => t.type === "followup_first" || t.type === "followup_subsequent" || t.type === "general").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            {!allTpls.length && <option value="">No templates</option>}
          </select>
          <EmailDraftBtn to={deal.contactEmail || ""} subject={getSubject()} body={buildBody()} opened={emailOpened} onOpened={() => setEmailOpened(true)} />
        </div>
        <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted)", whiteSpace: "pre-wrap", maxHeight: 140, overflow: "auto", border: "1px solid var(--line-2)", borderRadius: 6, background: "var(--surface)", fontFamily: "var(--mono)", lineHeight: 1.5 }}>{buildBody() || "(select a template)"}</div>
        <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 6 }}>{isFirst ? "Using 1st follow-up template." : `Follow-up #${doneCount + 1} — using subsequent template.`} You can edit the email in your email client before sending.</div>
      </div>
    </Modal>
  );
}
function CloseModal({ dealId, result }) {
  const { db, actions, closeModal } = useStore();
  const deal = db.deals.find((d) => d.id === dealId);
  const won = result === "won";
  const [reason, setReason] = useState("");
  return (
    <Modal title={"Close deal — " + (won ? "Won" : "Lost")} okLabel={won ? "Close as won" : "Close as lost"} onClose={closeModal} onOk={() => actions.closeDeal(deal, { result, reason })}>
      <div className="field"><label>{won ? "Closing note" : "Reason for loss"}</label><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={won ? "Order details, value…" : "e.g. lost on price, timeline, competitor…"} /></div>
    </Modal>
  );
}
function SendBackModal({ dealId }) {
  const { db, actions, closeModal, toast } = useStore();
  const deal = db.deals.find((d) => d.id === dealId);
  const [reason, setReason] = useState("");
  if (!deal) return null;
  const idx = STAGES.findIndex((s) => s.k === deal.status);
  const prevStage = idx > 0 ? STAGES[idx - 1] : null;
  if (!prevStage) return null;
  return (
    <Modal title="Send back for correction" okLabel={"Send back to " + prevStage.label} onClose={closeModal} onOk={() => {
      if (!reason.trim()) { toast("Please provide a reason", 1); return false; }
      actions.sendBack(deal, reason);
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--line)", marginBottom: 14 }}>
        <span className="tag" style={{ background: STAGE[deal.status].col + "1a", color: STAGE[deal.status].col }}>{STAGE[deal.status].label}</span>
        <span style={{ fontSize: 18, color: "var(--muted)" }}>→</span>
        <span className="tag" style={{ background: prevStage.col + "1a", color: prevStage.col }}>{prevStage.label}</span>
      </div>
      <div className="field"><label>Reason for sending back <span style={{ color: "var(--breach)" }}>*</span></label><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. missing documents, incorrect pricing, spec mismatch…" /></div>
    </Modal>
  );
}
function DeleteDealModal({ dealId }) {
  const { db, actions, closeModal } = useStore();
  const deal = db.deals.find((d) => d.id === dealId);
  const [reason, setReason] = useState("");
  if (!deal) return null;
  return (
    <Modal title="Archive deal" okLabel="Archive deal" onClose={closeModal} onOk={() => { if (!reason.trim()) return false; actions.deleteDeal(dealId, reason); }}>
      <Note>This will remove <b>{deal.id}</b> ({deal.customer} — {deal.products}) from the pipeline and archive it. You can find it in Reports → Archive.</Note>
      <div className="field"><label>Reason <span style={{ color: "var(--breach)" }}>*</span></label><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. duplicate entry, wrongly created, customer cancelled before RFQ…" /></div>
    </Modal>
  );
}
function RequestDeleteModal({ dealId }) {
  const { db, actions, closeModal, toast } = useStore();
  const deal = db.deals.find((d) => d.id === dealId);
  const [reason, setReason] = useState("");
  if (!deal) return null;
  return (
    <Modal title="Request deal deletion" okLabel="Send request to manager" onClose={closeModal} onOk={() => { if (!reason.trim()) { toast("Please provide a reason", 1); return false; } actions.requestDeleteDeal(deal, reason); }}>
      <Note>This sends a deletion request to the manager for <b>{deal.id}</b> ({deal.customer} — {deal.products}). The manager will see the request and can approve or deny it.</Note>
      <div className="field"><label>Reason for deletion <span style={{ color: "var(--breach)" }}>*</span></label><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. duplicate entry, wrongly created, customer cancelled before RFQ…" /></div>
    </Modal>
  );
}
function ReassignModal({ dealId }) {
  const { db, actions, closeModal } = useStore();
  const deal = db.deals.find((d) => d.id === dealId);
  const [ownerId, setOwnerId] = useState(deal.ownerId);
  return (
    <Modal title="Reassign owner" okLabel="Reassign" onClose={closeModal} onOk={() => actions.reassign(deal, ownerId)}>
      <div className="field"><label>Owner</label><select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>{db.team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
    </Modal>
  );
}
function VendorModal({ vendorId }) {
  const { db, actions, closeModal, toast, loggedInUser } = useStore();
  const uRoles = loggedInUser ? (loggedInUser.roles || []) : [];
  const canSetTier = uRoles.includes("Admin") || uRoles.includes("Manager") || uRoles.includes("QC Team");
  const existing = vendorId ? db.vendors.find((v) => v.id === vendorId) : null;
  const [name, setName] = useState(existing ? existing.name : "");
  const [email, setEmail] = useState(existing ? existing.email || "" : "");
  const [contactPerson, setContactPerson] = useState(existing ? existing.contactPerson || "" : "");
  const [rating, setRating] = useState(existing ? existing.rating : 4.0);
  const [avgResp, setAvgResp] = useState(existing ? existing.avgResp : 24);
  const initTiers = () => { const m = {}; if (existing) (existing.productIds || []).forEach((pid) => { m[pid] = vendorTier(existing, pid); }); return m; };
  const [tiers, setTiers] = useState(initTiers);
  const [newp, setNewp] = useState("");
  const setTier = (pid, tier) => setTiers((t) => { if (tier === "") { const n = { ...t }; delete n[pid]; return n; } return { ...t, [pid]: tier }; });
  return (
    <Modal title={(existing ? "Edit " : "Add ") + "vendor"} okLabel={existing ? "Save vendor" : "Add vendor"} onClose={closeModal} onOk={() => {
      if (!name.trim()) { toast("Vendor name needed", 1); return false; }
      if (!existing) { const dup = db.vendors.find((v) => v.name.toLowerCase() === name.trim().toLowerCase()); if (dup) { toast("Vendor \"" + dup.name + "\" already exists", 1); return false; } }
      const newIds = (newp || "").split(",").map((s) => ensureProduct(db, s)).filter(Boolean);
      const defaultTier = canSetTier ? "other" : "temporary";
      const merged = { ...tiers }; newIds.forEach((id) => { if (!merged[id]) merged[id] = defaultTier; });
      const productIds = Object.keys(merged);
      const productTiers = { ...merged };
      actions.saveVendor(existing, { name: name.trim(), email: email.trim(), contactPerson: contactPerson.trim(), rating: +rating || (existing ? existing.rating : 4), avgResp: +avgResp || (existing ? existing.avgResp : 24), productIds, productTiers });
    }}>
      <div className="field"><label>Vendor name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="row2">
        <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sales@vendor.com" /></div>
        <div className="field"><label>Contact person</label><input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="e.g. John Smith" /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Rating</label><input type="number" step="0.1" value={rating} onChange={(e) => setRating(e.target.value)} /></div>
        <div className="field"><label>Avg response (h)</label><input type="number" value={avgResp} onChange={(e) => setAvgResp(e.target.value)} /></div>
      </div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Products carried <span style={{ fontWeight: 400 }}>— select a tier to add, blank to remove</span></label>
      {!canSetTier && <div style={{ fontSize: 11, color: "var(--signal)", marginBottom: 6 }}>You can only assign <b>Temporary</b> status. QC Team, Manager, or Admin can promote to other tiers.</div>}
      <div style={{ maxHeight: 260, overflow: "auto", marginBottom: 8 }}>
        {db.products.length ? db.products.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => { const cur = tiers[p.id] || ""; return (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderBottom: "1px solid var(--line-2)" }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{p.name}</span>
            {canSetTier ? (
              <select value={cur} onChange={(e) => setTier(p.id, e.target.value)} style={{ width: 130, padding: "5px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12, background: cur ? TIER_COLORS[cur].bg : "#fff", color: cur ? TIER_COLORS[cur].fg : "var(--muted-2)", fontWeight: 600 }}>
                <option value="">— none —</option>{VENDOR_TIERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            ) : (
              cur && cur !== "temporary" ? (
                <span className="tag" style={{ background: TIER_COLORS[cur].bg, color: TIER_COLORS[cur].fg, fontSize: 11 }}>{cur}</span>
              ) : (
                <select value={cur} onChange={(e) => setTier(p.id, e.target.value)} style={{ width: 130, padding: "5px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12, background: cur ? TIER_COLORS[cur].bg : "#fff", color: cur ? TIER_COLORS[cur].fg : "var(--muted-2)", fontWeight: 600 }}>
                  <option value="">— none —</option><option value="temporary">Temporary</option>
                </select>
              )
            )}
          </div>); }) : <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No products in the catalog yet — add some below.</div>}
      </div>
      <div className="field"><label>Add new product(s) to the catalog — comma separated</label><input value={newp} onChange={(e) => setNewp(e.target.value)} placeholder="e.g. Toluene, Xylene" /></div>
    </Modal>
  );
}
function UserModal({ userId }) {
  const { db, actions, closeModal, toast, isManager, commit } = useStore();
  const existing = userId ? db.team.find((u) => u.id === userId) : null;
  const acct = existing ? (db.loginAccounts || []).find((a) => a.teamMemberId === existing.id) : null;
  const [name, setName] = useState(existing ? existing.name : "");
  const [loginEmail, setLoginEmail] = useState(existing ? existing.loginEmail || "" : "");
  const [initPassword, setInitPassword] = useState("");
  const roleNames = (db.roles || []).map((r) => r.name);
  const [selRoles, setSelRoles] = useState(existing ? (existing.roles || (existing.role ? [existing.role] : [])) : []);
  const [emailClient, setEmailClient] = useState(existing ? existing.emailClient || "mailto" : "mailto");
  const [mobile, setMobile] = useState(existing ? existing.mobile || "" : "");
  const [signatureImg, setSignatureImg] = useState(existing ? existing.signatureImg || "" : "");
  const uploadSignature = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = (e) => { const file = e.target.files[0]; if (!file) return; const r = new FileReader(); r.onload = (ev) => setSignatureImg(ev.target.result); r.readAsDataURL(file); };
    inp.click();
  };
  const toggleRole = (r) => setSelRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  const [generatedPass, setGeneratedPass] = useState("");

  const handleResetPassword = () => {
    const np = generatePassword();
    if (!db.loginAccounts) db.loginAccounts = [];
    const idx = db.loginAccounts.findIndex((a) => a.teamMemberId === existing.id);
    if (idx >= 0) { db.loginAccounts[idx].password = np; }
    else { db.loginAccounts.push({ id: "auth_" + existing.id, email: (existing.loginEmail || "").toLowerCase(), teamMemberId: existing.id, password: np }); }
    commit(); setGeneratedPass(np); toast("Password reset — share the new password with the user");
  };

  const handleSave = () => {
    if (!name.trim()) { toast("Name is required", 1); return false; }
    if (!selRoles.length) { toast("Select at least one role", 1); return false; }
    if (!loginEmail.trim() || !loginEmail.includes("@")) { toast("A valid login email is required", 1); return false; }
    if (!existing && (!initPassword || initPassword.length < 6)) { toast("Initial password must be at least 6 characters", 1); return false; }
    const email = loginEmail.trim().toLowerCase();
    if (!existing) {
      const dup = (db.loginAccounts || []).find((a) => a.email === email);
      if (dup) { toast("A user with this email already exists", 1); return false; }
      const newId = "u" + Date.now();
      if (!db.loginAccounts) db.loginAccounts = [];
      db.loginAccounts.push({ id: "auth_" + newId, email, teamMemberId: newId, password: initPassword });
      actions.saveUser(null, { id: newId, name: name.trim(), loginEmail: email, roles: selRoles, emailClient, mobile: mobile.trim(), signatureImg });
    } else {
      if (!db.loginAccounts) db.loginAccounts = [];
      const idx = db.loginAccounts.findIndex((a) => a.teamMemberId === existing.id);
      if (idx >= 0) { db.loginAccounts[idx].email = email; }
      else { const seed = SEED_ACCOUNTS.find((s) => s.teamMemberId === existing.id); db.loginAccounts.push({ id: "auth_" + existing.id, email, teamMemberId: existing.id, password: seed ? seed.password : "Infin@123" }); }
      actions.saveUser(existing, { name: name.trim(), loginEmail: email, roles: selRoles, emailClient, mobile: mobile.trim(), signatureImg });
    }
  };

  const handleDelete = () => {
    if (actions.deleteUser(existing.id) !== false) {
      if (db.loginAccounts) db.loginAccounts = db.loginAccounts.filter((a) => a.teamMemberId !== existing.id);
      commit();
      closeModal();
    }
  };

  return (
    <Modal title={(existing ? "Edit " : "Add ") + "user"} okLabel={existing ? "Save user" : "Add user"} onClose={closeModal} onOk={handleSave}>
      <div className="field"><label>Full name <span style={{ color: "var(--breach)" }}>*</span></label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anjali Rao" /></div>
      <div className="row2">
        <div className="field"><label>Login email <span style={{ color: "var(--breach)" }}>*</span></label><input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="e.g. anjali@company.com" /><div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 5 }}>This email is used to sign in to DealFlow.</div></div>
        <div className="field"><label>Mobile number</label><input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="e.g. +91 98765 43210" /></div>
      </div>
      {!existing && <div className="field"><label>Initial password <span style={{ color: "var(--breach)" }}>*</span></label>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="text" value={initPassword} onChange={(e) => setInitPassword(e.target.value)} placeholder="Min 6 characters" style={{ flex: 1 }} />
          <button className="btn sm" type="button" onClick={() => setInitPassword(generatePassword())}>Generate</button>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 5 }}>Share this password with the user so they can log in.</div>
      </div>}
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Roles <span style={{ fontWeight: 400 }}>— select one or more</span></label>
      {roleNames.map((r) => (
        <label className={"check" + (selRoles.includes(r) ? " on" : "")} key={r}>
          <input type="checkbox" checked={selRoles.includes(r)} onChange={() => toggleRole(r)} />
          <span>{r}</span>
        </label>
      ))}
      <div className="field" style={{ marginTop: 10 }}>
        <label>Email signature image</label>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 4 }}>
          {signatureImg
            ? <div style={{ border: "1px solid var(--line)", borderRadius: 6, padding: 6, background: "var(--surface)", display: "flex", alignItems: "center", gap: 8 }}>
                <img src={signatureImg} alt="Signature" style={{ maxHeight: 60, maxWidth: 200, display: "block" }} />
                <button className="btn sm danger" type="button" onClick={() => setSignatureImg("")} style={{ flexShrink: 0 }}>Remove</button>
              </div>
            : <div style={{ border: "2px dashed var(--line)", borderRadius: 6, padding: "14px 20px", fontSize: 12.5, color: "var(--muted)", cursor: "pointer" }} onClick={uploadSignature}>
                Click to upload signature image
              </div>}
          {signatureImg && <button className="btn sm" type="button" onClick={uploadSignature}>Replace</button>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 5 }}>Use <code style={{ background: "var(--surface)", padding: "1px 4px", borderRadius: 3, fontFamily: "var(--mono)" }}>{"{{signature}}"}</code> in email templates to insert this image.</div>
      </div>
      <div className="field" style={{ marginTop: 10 }}><label>Email client</label>
        <select value={emailClient} onChange={(e) => setEmailClient(e.target.value)} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", fontSize: 14 }}>
          {EMAIL_CLIENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {existing && isManager && (
        <div style={{ marginTop: 14, padding: "14px 16px", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--line)" }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>Login account</label>
          {acct && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Current password: <code style={{ background: "var(--line-2)", padding: "2px 6px", borderRadius: 4, fontFamily: "var(--mono)" }}>{acct.password}</code></div>}
          {generatedPass
            ? <div style={{ padding: "10px 14px", background: "var(--ok-soft)", borderRadius: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#127a51", marginBottom: 4 }}>New password generated:</div>
                <code style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--ink)", letterSpacing: 1 }}>{generatedPass}</code>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Share this with the user. They must log in again.</div>
              </div>
            : <button className="btn sm" onClick={handleResetPassword}>Reset password</button>}
        </div>
      )}
      {existing && isManager && <div style={{ marginTop: 12 }}>
        <button className="btn danger sm" onClick={handleDelete}>Delete user</button>
        <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 5 }}>Users assigned to deals cannot be deleted.</div>
      </div>}
    </Modal>
  );
}
function AddProductModal() {
  const { db, actions, closeModal, toast } = useStore();
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  return (
    <Modal title="Add product" okLabel="Add product" onClose={closeModal} onOk={() => { if (!name.trim()) { toast("Product name needed", 1); return false; } return actions.addProduct(name.trim(), brandName.trim()); }}>
      <div className="field"><label>Product name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Toluene" /></div>
      <div className="field"><label>Infin Brand Name <span style={{ fontWeight: 400, color: "var(--muted-2)" }}>(optional — required before quoting to customer)</span></label><input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Infin Toluene" /></div>
    </Modal>
  );
}
function ImportModal() {
  const { actions, closeModal, toast } = useStore();
  const [text, setText] = useState("");
  const fileRef = useRef(null);
  const sampleRows = [
    ["Product", "Vendor", "Vendor Email", "Status", "Infin Brand Name"],
    ["Acetonitrile (HPLC)", "Acme Chemicals", "sales@acmechemicals.in", "Primary", "Infin ACN-HPLC"],
    ["Acetonitrile (HPLC)", "Gujarat Organics", "info@gujaratorganics.in", "Secondary", "Infin ACN-HPLC"],
    ["Titanium Dioxide", "Polychem Industries", "quotes@polychem.in", "Primary", "Infin TiO2"],
    ["Methanol", "Gujarat Organics", "info@gujaratorganics.in", "Primary", ""],
    ["Methanol", "Polychem Industries", "quotes@polychem.in", "Other", ""],
    ["Sodium Hydroxide pellets", "Reliable Reagents", "procurement@reliable.com", "Temporary", "Infin NaOH"],
  ];
  const downloadExcel = () => {
    if (!window.XLSX) { toast("Excel library not loaded — try CSV instead", 1); return; }
    const ws = window.XLSX.utils.aoa_to_sheet(sampleRows);
    ws["!cols"] = [{ wch: 28 }, { wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 20 }];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Vendors & Products");
    window.XLSX.writeFile(wb, "vendor_product_import_template.xlsx");
  };
  const downloadCsv = () => {
    const csv = sampleRows.map((r) => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "vendor_product_import_template.csv"; a.click();
  };
  const readExcel = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = window.XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_csv(ws);
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
  return (
    <Modal title="Import vendors & products" okLabel="Import" onClose={closeModal} onOk={async () => {
      let t = text.trim();
      const f = fileRef.current && fileRef.current.files[0];
      if (f && !t) {
        try {
          if (f.name.match(/\.xlsx?$/i) && window.XLSX) t = await readExcel(f);
          else t = await f.text();
        } catch (e) { toast("Could not read file", 1); return false; }
      }
      if (!t) { toast("Upload a file or paste rows", 1); return false; }
      const r = actions.importRows(t);
      if (!r.lines) { toast("No valid rows found", 1); return false; }
      toast(`Imported: ${r.nv} new + ${r.uv} updated vendor(s), ${r.np} new product(s) from ${r.lines} rows`);
    }}>
      <Note>Upload an Excel or CSV file with columns: <b>Product, Vendor, Vendor Email, Status, Infin Brand Name</b>. Status should be <b>Primary</b>, <b>Secondary</b>, <b>Other</b>, or <b>Temporary</b>. Email and Brand name are optional.</Note>
      <div style={{ display: "flex", gap: 8, marginTop: 10, marginBottom: 14 }}>
        <button className="btn sm primary" onClick={downloadExcel}>Download Excel template</button>
        <button className="btn ghost sm" onClick={downloadCsv}>Download CSV template</button>
      </div>
      <div style={{ background: "var(--surface)", borderRadius: 6, padding: "10px 12px", marginBottom: 12, fontSize: 11.5, fontFamily: "var(--mono)", overflow: "auto", maxHeight: 100, lineHeight: 1.6 }}>
        {sampleRows.map((r, i) => <div key={i} style={i === 0 ? { color: "var(--muted)", fontWeight: 600 } : {}}>{r.join("  |  ")}</div>)}
      </div>
      <div className="field"><label>Upload file (.xlsx or .csv)</label><input type="file" accept=".xlsx,.xls,.csv,.txt" ref={fileRef} /></div>
      <div className="field"><label>…or paste rows here</label><textarea style={{ minHeight: 100, fontFamily: "var(--mono)", fontSize: 12 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Product,Vendor,Vendor Email,Status,Infin Brand Name\nAcetonitrile,Acme Chemicals,sales@acme.in,Primary,Infin ACN"} /></div>
    </Modal>
  );
}

/* ------------------------------ scoped styles ----------------------------- */
const CSS = `.dealflow{--ink:#16202e; --ink-2:#26323f;
  --surface:#eef1f5; --card:#ffffff;
  --line:#dfe4ea; --line-2:#eef1f5;
  --muted:#65727f; --muted-2:#909aa6;
  --text:#1c2630;
  --signal:#e8742c; --signal-soft:#fdf0e6;
  --ok:#1f9d6b; --ok-soft:#e7f5ee;
  --breach:#d4403f; --breach-soft:#fbeaea;
  --info:#3a6ea5; --info-soft:#e9f0f8;
  --radius:10px; --radius-sm:7px;
  --shadow:0 1px 2px rgba(22,32,46,.06), 0 4px 16px rgba(22,32,46,.05);
  --mono:'Space Mono', ui-monospace, monospace;
  --disp:'Space Grotesk', system-ui, sans-serif;
  --body:'Inter', system-ui, sans-serif;}
.dealflow *{box-sizing:border-box}
.dealflow{;}
.dealflow{font-family:var(--body);background:var(--surface);color:var(--text);font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased}
.dealflow button{font-family:inherit;cursor:pointer}
.dealflow input, .dealflow select, .dealflow textarea{font-family:inherit;font-size:14px}
.dealflow h1, .dealflow h2, .dealflow h3, .dealflow h4{font-family:var(--disp);margin:0;font-weight:600;letter-spacing:-.01em}
.dealflow .mono{font-family:var(--mono)}
.dealflow a{color:var(--info)}
.dealflow .app{display:grid;grid-template-columns:228px 1fr;grid-template-rows:auto 1fr;height:100vh;grid-template-areas:"side top" "side main"}
.dealflow .topbar{grid-area:top;background:var(--card);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:16px;padding:0 22px;height:60px;position:sticky;top:0;z-index:20}
.dealflow .side{grid-area:side;background:var(--ink);color:#cdd6e0;display:flex;flex-direction:column;padding:18px 12px;gap:3px;overflow:auto}
.dealflow .main{grid-area:main;overflow:auto;padding:22px 26px 60px}
.dealflow .brand{display:flex;align-items:center;gap:10px;padding:4px 10px 18px;color:#fff}
.dealflow .brand .logo{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--signal),#f2a25f);display:grid;place-items:center;font-family:var(--disp);font-weight:700;color:#fff;font-size:16px;flex:none}
.dealflow .brand b{font-family:var(--disp);font-size:17px;font-weight:600;letter-spacing:-.02em}
.dealflow .brand span{display:block;font-size:10.5px;color:#7d8aa0;letter-spacing:.04em;text-transform:uppercase;font-weight:500}
.dealflow .nav{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:8px;color:#aeb9c6;font-weight:500;font-size:13.5px;border:none;background:none;width:100%;text-align:left;transition:background .12s,color .12s}
.dealflow .nav:hover{background:#1f2b3a;color:#fff}
.dealflow .nav.active{background:var(--signal);color:#fff}
.dealflow .nav .ic{width:17px;flex:none;opacity:.9}
.dealflow .nav .badge{margin-left:auto;font-family:var(--mono);font-size:11px;background:#2a3949;color:#dfe6ee;border-radius:20px;padding:1px 7px;font-weight:700}
.dealflow .nav.active .badge{background:rgba(255,255,255,.25);color:#fff}
.dealflow .nav-sec{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#5e6c7c;padding:16px 11px 6px;font-weight:600}
.dealflow .side-foot{margin-top:auto;padding:12px 11px 4px;font-size:11px;color:#5e6c7c;border-top:1px solid #243140}
.dealflow .top-title{font-family:var(--disp);font-size:18px;font-weight:600}
.dealflow .top-sub{color:var(--muted);font-size:12.5px;margin-top:1px}
.dealflow .spacer{flex:1}
.dealflow .role-pick{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:5px 10px}
.dealflow .role-pick label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.dealflow .role-pick select{border:none;background:none;font-weight:600;color:var(--ink);outline:none}
.dealflow .alert-pill{display:flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--card);border-radius:8px;padding:6px 11px;font-size:12.5px;font-weight:500;color:var(--muted)}
.dealflow .alert-pill b{font-family:var(--mono);color:var(--breach)}
.dealflow .alert-pill.clear b{color:var(--ok)}
.dealflow .alert-pill .dot{width:8px;height:8px;border-radius:50%;background:var(--breach)}
.dealflow .alert-pill.clear .dot{background:var(--ok)}
.dealflow .btn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:8px 14px;font-weight:600;font-size:13px;display:inline-flex;align-items:center;gap:7px;transition:.12s}
.dealflow .btn:hover{border-color:var(--muted-2)}
.dealflow .btn.primary{background:var(--signal);border-color:var(--signal);color:#fff}
.dealflow .btn.primary:hover{background:#d9651f}
.dealflow .btn.ghost{background:none;border-color:transparent;color:var(--muted)}
.dealflow .btn.ghost:hover{background:var(--surface);color:var(--ink)}
.dealflow .btn.sm{padding:6px 11px;font-size:12px}
.dealflow .btn.ok{background:var(--ok);border-color:var(--ok);color:#fff}
.dealflow .btn.danger{background:#fff;border-color:var(--breach);color:var(--breach)}
.dealflow .btn:disabled{opacity:.45;cursor:not-allowed}
.dealflow .board{display:flex;gap:14px;align-items:flex-start;padding-bottom:10px}
.dealflow .col{flex:0 0 250px;background:transparent}
.dealflow .col-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;position:sticky;top:0}
.dealflow .col-dot{width:9px;height:9px;border-radius:50%;flex:none}
.dealflow .col-head h4{font-size:13px;font-weight:600}
.dealflow .col-head .ct{font-family:var(--mono);font-size:11px;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:20px;padding:0 7px;margin-left:auto}
.dealflow .col-body{display:flex;flex-direction:column;gap:9px;min-height:30px}
.dealflow .col-empty{font-size:12px;color:var(--muted-2);border:1px dashed var(--line);border-radius:9px;padding:14px;text-align:center}
.dealflow .card{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--line);border-radius:var(--radius);padding:12px 13px;box-shadow:var(--shadow);cursor:pointer;transition:.12s}
.dealflow .card:hover{transform:translateY(-1px);box-shadow:0 2px 4px rgba(22,32,46,.08),0 8px 22px rgba(22,32,46,.09)}
.dealflow .card.brk{border-left-color:var(--breach)}
.dealflow .card.warn{border-left-color:var(--signal)}
.dealflow .card.ok{border-left-color:var(--ok)}
.dealflow .card-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.dealflow .card-id{font-family:var(--mono);font-size:11.5px;color:var(--muted);font-weight:700}
.dealflow .card-cust{font-weight:600;font-size:14px;margin:5px 0 2px;letter-spacing:-.01em}
.dealflow .card-prod{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dealflow .card-prog{font-size:11px;font-weight:600;color:var(--info);background:var(--info-soft);border-radius:4px;padding:3px 7px;display:inline-block}
.dealflow .card-warn{font-size:11px;font-weight:600;color:var(--signal);background:var(--signal-soft);border-radius:4px;padding:3px 7px;display:inline-block}
.dealflow .card-foot{display:flex;align-items:center;gap:8px;margin-top:10px}
.dealflow .owner{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);font-weight:500}
.dealflow .av{width:20px;height:20px;border-radius:50%;background:var(--ink-2);color:#fff;font-size:10px;display:grid;place-items:center;font-weight:600;flex:none}
.dealflow .sla{margin-left:auto;font-family:var(--mono);font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;display:inline-flex;align-items:center;gap:5px}
.dealflow .sla.ok{background:var(--ok-soft);color:#127a51}
.dealflow .sla.warn{background:var(--signal-soft);color:#b85716}
.dealflow .sla.brk{background:var(--breach-soft);color:var(--breach)}
.dealflow .sla.none{background:var(--surface);color:var(--muted-2)}
.dealflow .sla.brk .pip{animation:pulse 1.2s infinite}
.dealflow .pip{width:6px;height:6px;border-radius:50%;background:currentColor}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
.dealflow .panel{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
.dealflow .grid{display:grid;gap:14px}
.dealflow .stat-grid{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.dealflow .stat{padding:16px 18px}
.dealflow .stat .k{font-size:12px;color:var(--muted);font-weight:500}
.dealflow .stat .v{font-family:var(--disp);font-size:30px;font-weight:600;letter-spacing:-.02em;margin-top:4px}
.dealflow .stat .v small{font-size:14px;color:var(--muted);font-weight:500}
.dealflow .stat.brk .v{color:var(--breach)}
.dealflow .stat.ok .v{color:var(--ok)}
.dealflow table{width:100%;border-collapse:collapse}
.dealflow th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line)}
.dealflow td{padding:11px 14px;border-bottom:1px solid var(--line-2);font-size:13.5px;vertical-align:middle}
.dealflow tr:last-child td{border-bottom:none}
.dealflow tr.clickable{cursor:pointer}
.dealflow tr.clickable:hover{background:var(--surface)}
.dealflow .tag{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:2px 9px;border-radius:20px;background:var(--surface);color:var(--muted)}
.dealflow .bar{height:7px;border-radius:4px;background:var(--line-2);overflow:hidden}
.dealflow .bar>span{display:block;height:100%;background:var(--signal)}
.dealflow .section-head{display:flex;align-items:center;gap:12px;margin:0 0 16px}
.dealflow .section-head h2{font-size:21px}
.dealflow .section-head p{color:var(--muted);font-size:13px;margin:2px 0 0}
.dealflow .scrim{position:fixed;inset:0;background:rgba(18,26,36,.4);opacity:0;pointer-events:none;transition:.18s;z-index:40}
.dealflow .scrim.show{opacity:1;pointer-events:auto}
.dealflow .drawer{position:fixed;top:0;right:0;height:100%;width:min(680px,94vw);background:var(--surface);box-shadow:-12px 0 40px rgba(22,32,46,.18);transform:translateX(100%);transition:transform .22s cubic-bezier(.4,0,.2,1);z-index:50;display:flex;flex-direction:column}
.dealflow .drawer.show{transform:none}
.dealflow .dr-head{background:var(--card);border-bottom:1px solid var(--line);padding:18px 22px;position:sticky;top:0}
.dealflow .dr-body{overflow:auto;padding:20px 22px 80px;flex:1}
.dealflow .dr-foot{border-top:1px solid var(--line);background:var(--card);padding:14px 22px;display:flex;gap:10px;flex-wrap:wrap}
.dealflow .block{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;margin-bottom:14px}
.dealflow .block h4{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.dealflow .kv{display:grid;grid-template-columns:130px 1fr;gap:6px 14px;font-size:13.5px}
.dealflow .kv dt{color:var(--muted)}
.dealflow .kv dd{margin:0;font-weight:500}
.dealflow .stepper{display:flex;align-items:center;gap:0;flex-wrap:wrap;margin-top:10px}
.dealflow .step{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--muted-2);font-weight:600}
.dealflow .step .n{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;font-family:var(--mono);font-size:10px}
.dealflow .step.done{color:var(--ok)}
.dealflow .step.done .n{background:var(--ok);border-color:var(--ok);color:#fff}
.dealflow .step.cur{color:var(--signal)}
.dealflow .step.cur .n{border-color:var(--signal);color:var(--signal)}
.dealflow .step-line{width:18px;height:1.5px;background:var(--line);margin:0 4px}
.dealflow .field{margin-bottom:13px}
.dealflow .field label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px}
.dealflow .field input, .dealflow .field select, .dealflow .field textarea{width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 11px;background:#fff;outline:none;color:var(--text)}
.dealflow .field input:focus, .dealflow .field select:focus, .dealflow .field textarea:focus{border-color:var(--signal);box-shadow:0 0 0 3px var(--signal-soft)}
.dealflow .field textarea{resize:vertical;min-height:64px}
.dealflow .row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.dealflow .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.dealflow .check{display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;margin-bottom:7px;font-size:13px;cursor:pointer;background:#fff}
.dealflow .check input{width:16px;height:16px;accent-color:var(--signal)}
.dealflow .check.on{border-color:var(--ok);background:var(--ok-soft)}
.dealflow .log{list-style:none;margin:0;padding:0}
.dealflow .log li{display:flex;gap:11px;padding:8px 0;border-bottom:1px solid var(--line-2);font-size:13px}
.dealflow .log li:last-child{border:none}
.dealflow .log .when{font-family:var(--mono);font-size:11px;color:var(--muted-2);flex:none;width:96px}
.dealflow .log .who{font-weight:600}
.dealflow .note{font-size:12.5px;color:var(--muted);background:var(--info-soft);border:1px solid #d4e2f1;border-radius:8px;padding:9px 12px;display:flex;gap:9px}
.dealflow .note .ic{flex:none;color:var(--info)}
.dealflow .empty{text-align:center;color:var(--muted);padding:50px 20px}
.dealflow .empty .big{font-family:var(--disp);font-size:18px;color:var(--ink);margin-bottom:6px}
.dealflow .modal-scrim{position:fixed;inset:0;background:rgba(18,26,36,.45);display:none;place-items:center;z-index:60;padding:20px}
.dealflow .modal-scrim.show{display:grid}
.dealflow .modal{background:var(--card);border-radius:14px;width:min(560px,100%);max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.dealflow .modal-head{padding:18px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center}
.dealflow .modal-head h3{font-size:18px}
.dealflow .modal-body{padding:20px 22px}
.dealflow .modal-foot{padding:14px 22px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:10px}
.dealflow .x{margin-left:auto;border:none;background:none;font-size:22px;color:var(--muted);line-height:1;padding:0 4px}
.dealflow .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--ink);color:#fff;padding:11px 18px;border-radius:10px;font-size:13.5px;font-weight:500;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;transition:.2s;z-index:80;display:flex;align-items:center;gap:9px}
.dealflow .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.dealflow .toast .ic{color:var(--signal)}
.dealflow .hide{display:none!important}
@media(max-width:880px){.dealflow .app{grid-template-columns:1fr;grid-template-areas:"top" "main"}.dealflow .side{position:fixed;left:0;top:0;bottom:0;width:228px;z-index:70;transform:translateX(-100%);transition:.2s}.dealflow .side.show{transform:none}.dealflow .menu-btn{display:inline-flex!important}}
.dealflow .menu-btn{display:none}`;
