import express from "express";
import cors from "cors";
import serverless from "serverless-http";
import {connectDB} from "../db.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import path from "path";

const app = express();
app.use(cors());
app.use(express.json());



// init default settings and admin user if missing
let initDone = false;
app.use(async (req,res,next) => {
  try {
    await connectDB();
    if (!initDone) {
      await init();
      initDone = true;
    }
    next();
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: "Database not available" });
  }
});
async function init() {
  const s = await Settings.findOne();
  if (!s) {
    await Settings.create({ template: "Your booking is confirmed...", prefix: "...", timeFormat:"12", toastTimeout:5, autoSend:0, sendCredentials:1 });
  }
  const admin = await User.findOne({ username: "admin" });
  if (!admin) {
    await User.create({ username: "admin", password:"1234", phone:"000", role:"admin", name:"Administrator" });
  }
}


function normalizePhone(p=""){ return (p||"").replace(/[^0-9]/g,""); }
function gen6(){ return String(Math.floor(100000 + Math.random()*900000)); }
function toMin(t){ const [hh,mm] = (t||"00:00").split(':').map(Number); return hh*60 + (mm||0); }
function overlaps(a1,b1,a2,b2){ if (b1 <= a1) b1 += 24*60; if (b2 <= a2) b2 += 24*60; return Math.max(a1,a2) < Math.min(b1,b2); }
// ---------------- AUTH ----------------
app.get(/^\/(?!api).*/, (req,res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});
app.post("/api/login", async (req,res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username & password required" });
    const row = await User.findOne({ username, password }).select("username phone role name");
    if (!row) return res.status(401).json({ error: "Invalid credentials" });
    res.json({ success:true, user: row });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ---------------- USERS ----------------
app.get("/api/users", async (req,res) => {
  try {
    const q = req.query.q ? req.query.q.trim() : "";
    let rows;
    if (!q) {
      rows = await User.find().sort({ username: 1 }).select("username phone name password role").lean();
      // attach bookingCount
      for (const r of rows) {
        r.bookingCount = await Booking.countDocuments({ $or: [{ phone: r.phone }, { createdBy: r.username }] });
      }
    } else {
      const re = new RegExp(q, "i");
      rows = await User.find({ $or: [{ phone: re }, { name: re }, { username: re }] }).sort({ username: 1 }).select("username phone name password role").lean();
      for (const r of rows) {
        r.bookingCount = await Booking.countDocuments({ $or: [{ phone: r.phone }, { createdBy: r.username }] });
      }
    }
    res.json(rows || []);
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.get("/api/users/search", async (req,res) => {
  try {
    const q = (req.query.q||"").trim();
    if (!q) return res.json([]);
    const re = new RegExp(q, "i");
    const rows = await User.find({ $or: [{ phone: re }, { name: re }, { username: re }] }).select("username phone name").limit(20).lean();
    res.json(rows || []);
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.get("/api/users/:phone", async (req,res) => {
  try {
    const p = normalizePhone(req.params.phone);
    const row = await User.findOne({ $or: [{ phone: p }, { username: p }] }).select("username phone name password role").lean();
    if (!row) return res.status(404).json({ error: "user not found" });
    const bookings = await Booking.find({ $or: [{ phone: row.username }, { createdBy: row.username }] }).sort({ date: 1, startTime: 1 }).lean();
    res.json({ user: row, bookings });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.post("/api/users/ensure", async (req,res) => {
  try {
    const { phone, name } = req.body || {};
    if (!phone) return res.status(400).json({ error: "phone required" });
    const p = normalizePhone(phone);
    const existing = await User.findOne({ $or: [{ phone: p }, { username: p }] }).select("username phone name role").lean();
    if (existing) return res.json({ created: false, user: existing });
    const pwd = gen6();
    const u = await User.create({ username: p, password: pwd, phone: p, role: "user", name: name || "" });
    res.json({ created: true, user: { id: u._id, username: u.username, phone: u.phone, role: u.role, name: u.name }, password: pwd });
  } catch(e){ res.status(500).json({ error: e.message }); }
});
app.get("/api/test", (req,res) => res.json({ ok: true }));

// ---------------- SETTINGS ----------------
app.get("/api/settings", async (req,res) => {
  try {
    const row = await Settings.findOne().lean();
    if (!row) return res.status(500).json({ error: "settings missing" });
    res.json({
      template: row.template,
      prefix: row.prefix,
      timeFormat: row.timeFormat || "12",
      toastTimeout: Number(row.toastTimeout) || 5,
      autoSend: Number(row.autoSend) || 0,
      sendCredentials: Number(row.sendCredentials) || 0
    });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.post("/api/settings", async (req,res) => {
  try {
    const s = req.body || {};
    const row = await Settings.findOne();
    if (!row) {
      await Settings.create(s);
    } else {
      await Settings.updateOne({}, s);
    }
    res.json({ message: "settings updated" });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ---------------- BOOKINGS ----------------
app.get("/api/bookings", async (req,res) => {
  try {
    const { from, to, status, phone } = req.query;
    const q = {};
    if (from || to) q.date = {};
    if (from) q.date.$gte = from;
    if (to) q.date.$lte = to;
    if (status && status !== "All") q.status = status;
    if (phone) q.$or = [{ phone: phone }, { createdBy: phone }];
    const rows = await Booking.find(q).sort({ date: 1, startTime: 1 }).lean();
    res.json(rows || []);
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.get("/api/bookings/free", async (req,res) => {
  try {
    const { from, to, start, end } = req.query;
    if (!from || !to || !start || !end) return res.status(400).json({ error: "from,to,start,end required" });
    const windowStart = toMin(start);
    let windowEnd = toMin(end); if (windowEnd <= windowStart) windowEnd += 24*60;
    const rows = await Booking.find({ date: { $gte: from, $lte: to }, status: "Confirmed" }).select("date startTime endTime").lean();
    const byDate = {};
    for (const b of rows) {
      const s = toMin(b.startTime), e = toMin(b.endTime);
      const eAdj = (e <= s) ? e + 24*60 : e;
      if (!byDate[b.date]) byDate[b.date] = [];
      const a = Math.max(s, windowStart), c = Math.min(eAdj, windowEnd);
      if (a < c) byDate[b.date].push([a,c]);
    }
    const out = [];
    const sDate = new Date(from), eDate = new Date(to);
    for (let d = new Date(sDate); d <= eDate; d.setDate(d.getDate()+1)) {
      const ds = d.toISOString().slice(0,10);
      const occ = (byDate[ds] || []).sort((x,y)=>x[0]-y[0]);
      const merged = [];
      for (const r of occ) {
        if (!merged.length) merged.push(r);
        else {
          const last = merged[merged.length-1];
          if (r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
          else merged.push(r);
        }
      }
      const frees = [];
      let cursor = windowStart;
      for (const m of merged) {
        if (m[0] > cursor) frees.push([cursor, m[0]]);
        cursor = Math.max(cursor, m[1]);
      }
      if (cursor < windowEnd) frees.push([cursor, windowEnd]);
      out.push({ date: ds, free: frees.map(f=>({ startMin: f[0], endMin: f[1] })) });
    }
    res.json(out);
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.get("/api/bookings/:id", async (req,res) => {
  try {
    const row = await Booking.findOne({ $or: [{ id: req.params.id }, { _id: req.params.id }] }).lean();
    if (!row) return res.status(404).json({ error: "booking not found" });
    res.json(row);
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// create/upsert booking
app.post("/api/bookings", async (req,res) => {
  try {
    const b = req.body || {};
    if (!b.customerName || !b.phone || !b.date || !b.startTime || !b.endTime) return res.status(400).json({ error: "customerName, phone, date, startTime, endTime required" });
    const phoneClean = normalizePhone(b.phone);
    const id = b.id || ("B" + Date.now());
    const startMin = toMin(b.startTime), endMin = toMin(b.endTime);

    async function conflictCheck(date, excludeId) {
      const rows = await Booking.find({ date: date, id: { $ne: excludeId }, status: { $in: ["Confirmed","Reserved"] } }).select("id startTime endTime status").lean();
      for (const r of rows) {
        const s2 = toMin(r.startTime), e2 = toMin(r.endTime);
        if (overlaps(startMin,endMin,s2,e2)) return { conflict: true, with: r };
      }
      return { conflict: false };
    }

    const existing = await Booking.findOne({ id: id });
    if (existing) {
      if (b.status === "Confirmed") {
        const chk = await conflictCheck(b.date, id);
        if (chk.conflict) return res.status(409).json({ error: "Time conflict: slot already booked" });
      }
      const fields = ["customerName","phone","date","startTime","endTime","status","paymentStatus","advance","comments","createdBy"];
      for (const f of fields) if (f in b) existing[f] = (f==="phone"?phoneClean:(f==="advance"?Number(b[f]||0):b[f]));
      await existing.save();
      return res.json({ message: "Booking updated", id });
    }

    if (b.status === "Confirmed") {
      const chk = await conflictCheck(b.date, id);
      if (chk.conflict) return res.status(409).json({ error: "Time conflict: slot already booked" });
    }

    // ensure user exists
    let createdUser = null;
    const userRow = await User.findOne({ $or: [{ phone: phoneClean }, { username: phoneClean }] });
    if (!userRow) {
      const pwd = gen6();
      await User.create({ username: phoneClean, password: pwd, phone: phoneClean, role: "user", name: b.customerName || "" });
      createdUser = { username: phoneClean, password: pwd };
    }

    const createdAt = new Date().toISOString();
    const createdBy = b.createdBy || phoneClean;
    const adv = Number(b.advance || 0);
    await Booking.create({ id, customerName: b.customerName, phone: phoneClean, date: b.date, startTime: b.startTime, endTime: b.endTime, status: b.status || "Pending", paymentStatus: b.paymentStatus || "Unpaid", advance: adv, comments: b.comments || "", createdBy, createdAt });
    const out = { message: "Booking saved", id };
    if (createdUser) out.createdUser = createdUser;
    res.json(out);

  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.patch("/api/bookings/:id/status", async (req,res) => {
  try {
    const id = req.params.id; const status = req.body.status;
    if (!status) return res.status(400).json({ error: "status required" });
    const row = await Booking.findOne({ $or: [{ id }, { _id: id }] }).lean();
    if (!row) return res.status(404).json({ error: "booking not found" });
    if (status === "Confirmed") {
      const smin = toMin(row.startTime), emin = toMin(row.endTime);
      const rows = await Booking.find({ date: row.date, id: { $ne: row.id }, status: { $in: ["Confirmed","Reserved"] } }).select("id startTime endTime status").lean();
      for (const r of rows) {
        let s2 = toMin(r.startTime), e2 = toMin(r.endTime);
        if (e2 <= s2) e2 += 24*60;
        let eAdj = emin; if (eAdj <= smin) eAdj += 24*60;
        if (Math.max(smin, s2) < Math.min(eAdj, e2)) return res.status(409).json({ error: "Time conflict: slot already booked" });
      }
    }
    await Booking.updateOne({ $or: [{ id }, { _id: id }] }, { $set: { status } });
    res.json({ message: "Status updated" });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.delete("/api/bookings/:id", async (req,res) => {
  try {
    const info = await Booking.deleteOne({ $or: [{ id: req.params.id }, { _id: req.params.id }] });
    if (!info.deletedCount) return res.status(404).json({ error: "booking not found" });
    res.json({ message: "Booking deleted" });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

app.get("*", (req,res) => {
  res.status(200).sendFile("index.html", { root: require('path').join(__dirname, '..', 'public') });
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

// For Vercel
export default serverless(app);



