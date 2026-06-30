import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { findUserByEmail, createUser, updatePassword, listUsers, deleteUser, load as loadData } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dealflow-dev-secret-change-in-production";
const TOKEN_EXPIRY = "7d";

function getUserRoles(teamMemberId) {
  const appData = loadData("dealflow_db");
  if (!appData || !appData.team) return [];
  const member = appData.team.find((m) => m.id === teamMemberId);
  return member ? (member.roles || []) : [];
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }
  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  const roles = getUserRoles(req.user.teamMemberId);
  if (!roles.includes("Admin")) {
    return res.status(403).json({ ok: false, error: "Admin access required" });
  }
  next();
}

function requireManagerOrAdmin(req, res, next) {
  const roles = getUserRoles(req.user.teamMemberId);
  if (!roles.includes("Admin") && !roles.includes("Manager")) {
    return res.status(403).json({ ok: false, error: "Manager or Admin access required" });
  }
  next();
}

const router = Router();

router.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "Email and password are required" });
  }

  const user = findUserByEmail(email.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({ ok: false, error: "Invalid email or password" });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ ok: false, error: "Invalid email or password" });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, teamMemberId: user.team_member_id },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  res.json({
    ok: true,
    token,
    user: { id: user.id, email: user.email, teamMemberId: user.team_member_id },
  });
});

router.post("/api/auth/register", requireAuth, requireAdmin, (req, res) => {
  const { email, password, teamMemberId } = req.body || {};
  if (!email || !password || !teamMemberId) {
    return res.status(400).json({ ok: false, error: "Email, password, and team member are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
  }

  const existing = findUserByEmail(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ ok: false, error: "A user with this email already exists" });
  }

  const id = "auth_" + Date.now();
  createUser(id, email.toLowerCase().trim(), password, teamMemberId);

  res.json({ ok: true, user: { id, email: email.toLowerCase().trim(), teamMemberId } });
});

router.post("/api/auth/change-password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ ok: false, error: "Current and new passwords are required" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ ok: false, error: "New password must be at least 6 characters" });
  }

  const user = findUserByEmail(req.user.email);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ ok: false, error: "Current password is incorrect" });
  }

  updatePassword(user.id, newPassword);
  res.json({ ok: true });
});

router.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

router.get("/api/auth/users", requireAuth, requireAdmin, (req, res) => {
  const users = listUsers();
  res.json({ ok: true, users });
});

router.delete("/api/auth/users/:id", requireAuth, requireManagerOrAdmin, (req, res) => {
  if (req.params.id === req.user.teamMemberId) {
    return res.status(400).json({ ok: false, error: "Cannot delete your own account" });
  }
  const users = listUsers();
  const user = users.find((u) => u.team_member_id === req.params.id);
  if (user) deleteUser(user.id);
  res.json({ ok: true });
});

router.post("/api/auth/reset-password", requireAuth, requireManagerOrAdmin, (req, res) => {
  const { teamMemberId, newPassword } = req.body || {};
  if (!teamMemberId || !newPassword) {
    return res.status(400).json({ ok: false, error: "Team member and new password are required" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
  }
  const users = listUsers();
  const user = users.find((u) => u.team_member_id === teamMemberId);
  if (!user) {
    return res.status(404).json({ ok: false, error: "No login account found for this team member" });
  }
  updatePassword(user.id, newPassword);
  res.json({ ok: true });
});

export default router;
