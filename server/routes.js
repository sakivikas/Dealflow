import { Router } from "express";
import { load, save, wipe } from "./db.js";
import { requireAuth } from "./auth.js";

const router = Router();
const KEY = "dealflow_db";

router.get("/api/data", requireAuth, (req, res) => {
  const data = load(KEY);
  res.json({ ok: true, data });
});

router.post("/api/data", requireAuth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ ok: false, error: "Invalid data" });
  }
  save(KEY, body);
  res.json({ ok: true });
});

router.delete("/api/data", requireAuth, (req, res) => {
  wipe(KEY);
  res.json({ ok: true });
});

export default router;
