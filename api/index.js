// api/index.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import serverless from "serverless-http";

import { connectDB } from "../db.js";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Settings from "../models/Settings.js";

// ---------------- FIX __dirname ----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- EXPRESS APP ----------------
const app = express();
app.use(cors());
app.use(express.json());

// ---------------- DB INIT ----------------
let dbInitialized = false;
let defaultsInitialized = false;

async function initDB() {
  if (!dbInitialized) {
    // Timeout to prevent hanging
    await Promise.race([
      connectDB(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("DB connection timeout")), 5000)),
    ]);
    dbInitialized = true;
    console.log("✅ MongoDB connected");
  }
}

async function initDefaults() {
  if (defaultsInitialized) return;

  const s = await Settings.findOne().lean();
  if (!s) {
    await Settings.create({
      template: "Your booking is confirmed for The Sports Lounge on {date} ({day}) from {start} to {end}.",
      prefix: "Booking available today at The Sports Lounge:",
      timeFormat: "12",
      toastTimeout: 5,
      autoSend: 0,
      sendCredentials: 1,
    });
  }

  const admin = await User.findOne({ username: "admin" }).lean();
  if (!admin) {
    await User.create({
      username: "admin",
      password: "1234",
      phone: "000",
      role: "admin",
      name: "Administrator",
    });
    await User.create({
      username: "03001234567",
      password: "pass123",
      phone: "03001234567",
      role: "user",
      name: "Test User",
    });
  }

  defaultsInitialized = true;
}

// ---------------- UTILITIES ----------------
function normalizePhone(p = "") {
  return (p || "").replace(/[^0-9]/g, "");
}
function gen6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function toMin(t) {
  const [hh, mm] = (t || "00:00").split(":").map(Number);
  return hh * 60 + (mm || 0);
}
function overlaps(a1, b1, a2, b2) {
  if (b1 <= a1) b1 += 24 * 60;
  if (b2 <= a2) b2 += 24 * 60;
  return Math.max(a1, a2) < Math.min(b1, b2);
}

// ---------------- MIDDLEWARE ----------------
// Lazy DB init only for routes that need DB
app.use(async (req, res, next) => {
  try {
    await initDB();
    await initDefaults();
    next();
  } catch (e) {
    console.error("DB Init Error:", e);
    res.status(500).json({ error: "Database not available" });
  }
});


// ---------------- AUTH ----------------
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username & password required" });

    const row = await User.findOne({ username, password }).select("username phone role name").lean();
    if (!row) return res.status(401).json({ error: "Invalid credentials" });

    res.json({ success: true, user: row });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------- USERS ----------------
app.get("/api/users", async (req, res) => {
  try {
    const q = req.query.q ? req.query.q.trim() : "";
    let rows;
    if (!q) {
      rows = await User.find().sort({ username: 1 }).select("username phone name password role").lean();
    } else {
      const re = new RegExp(q, "i");
      rows = await User.find({ $or: [{ phone: re }, { name: re }, { username: re }] })
        .sort({ username: 1 })
        .select("username phone name password role")
        .lean();
    }

    await Promise.all(
      rows.map(async (r) => {
        r.bookingCount = await Booking.countDocuments({ $or: [{ phone: r.phone }, { createdBy: r.username }] });
      })
    );

    res.json(rows || []);
  } catch (err) {
    console.error("Users error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------- SINGLE USER ----------------
app.get("/api/users/:phone", async (req, res) => {
  try {
    const p = normalizePhone(req.params.phone);
    const row = await User.findOne({ $or: [{ phone: p }, { username: p }] })
      .select("username phone name password role")
      .lean();
    if (!row) return res.status(404).json({ error: "user not found" });

    const bookings = await Booking.find({ $or: [{ phone: row.username }, { createdBy: row.username }] })
      .sort({ date: 1, startTime: 1 })
      .lean();

    res.json({ user: row, bookings });
  } catch (err) {
    console.error("User detail error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------- SETTINGS ----------------
app.get("/api/settings", async (req, res) => {
  try {
    const row = await Settings.findOne().lean();
    if (!row) return res.status(500).json({ error: "settings missing" });

    res.json({
      template: row.template,
      prefix: row.prefix,
      timeFormat: row.timeFormat || "12",
      toastTimeout: Number(row.toastTimeout) || 5,
      autoSend: Number(row.autoSend) || 0,
      sendCredentials: Number(row.sendCredentials) || 0,
    });
  } catch (err) {
    console.error("Settings get error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/settings", async (req, res) => {
  try {
    const s = req.body || {};
    const row = await Settings.findOne();
    if (!row) await Settings.create(s);
    else await Settings.updateOne({}, s);

    res.json({ message: "settings updated" });
  } catch (err) {
    console.error("Settings post error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------- BOOKINGS ----------------
app.get("/api/bookings", async (req, res) => {
  try {
    const { from, to, status, phone } = req.query;
    const q = {};
    if (from || to) q.date = {};
    if (from) q.date.$gte = from;
    if (to) q.date.$lte = to;
    if (status && status !== "All") q.status = status;
    if (phone) q.$or = [{ phone }, { createdBy: phone }];

    const rows = await Booking.find(q).sort({ date: 1, startTime: 1 }).lean();
    res.json(rows || []);
  } catch (err) {
    console.error("Bookings error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------- CREATE/UPDATE BOOKINGS ----------------
app.post("/api/bookings", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.customerName || !b.phone || !b.date || !b.startTime || !b.endTime)
      return res.status(400).json({ error: "customerName, phone, date, startTime, endTime required" });

    const phoneClean = normalizePhone(b.phone);
    const id = b.id || "B" + Date.now();
    const startMin = toMin(b.startTime);
    const endMin = toMin(b.endTime);

    async function conflictCheck(date, excludeId) {
      const rows = await Booking.find({ date, id: { $ne: excludeId }, status: { $in: ["Confirmed", "Reserved"] } })
        .select("id startTime endTime status")
        .lean();
      for (const r of rows) {
        const s2 = toMin(r.startTime),
          e2 = toMin(r.endTime);
        if (overlaps(startMin, endMin, s2, e2)) return { conflict: true, with: r };
      }
      return { conflict: false };
    }

    const existing = await Booking.findOne({ id });
    if (existing) {
      if (b.status === "Confirmed") {
        const chk = await conflictCheck(b.date, id);
        if (chk.conflict) return res.status(409).json({ error: "Time conflict: slot already booked" });
      }
      const fields = ["customerName", "phone", "date", "startTime", "endTime", "status", "paymentStatus", "advance", "comments", "createdBy"];
      for (const f of fields) if (f in b) existing[f] = f === "phone" ? phoneClean : f === "advance" ? Number(b[f] || 0) : b[f];
      await existing.save();
      return res.json({ message: "Booking updated", id });
    }

    if (b.status === "Confirmed") {
      const chk = await conflictCheck(b.date, id);
      if (chk.conflict) return res.status(409).json({ error: "Time conflict: slot already booked" });
    }

    let createdUser = null;
    const userRow = await User.findOne({ $or: [{ phone: phoneClean }, { username: phoneClean }] }).lean();
    if (!userRow) {
      const pwd = gen6();
      await User.create({ username: phoneClean, password: pwd, phone: phoneClean, role: "user", name: b.customerName || "" });
      createdUser = { username: phoneClean, password: pwd };
    }

    const createdAt = new Date().toISOString();
    const createdBy = b.createdBy || phoneClean;
    const adv = Number(b.advance || 0);
    await Booking.create({
      id,
      customerName: b.customerName,
      phone: phoneClean,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status || "Pending",
      paymentStatus: b.paymentStatus || "Unpaid",
      advance: adv,
      comments: b.comments || "",
      createdBy,
      createdAt,
    });

    const out = { message: "Booking saved", id };
    if (createdUser) out.createdUser = createdUser;
    res.json(out);
  } catch (err) {
    console.error("Booking save error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------- EXPORT FOR VERCEL ----------------
export default serverless(app);
