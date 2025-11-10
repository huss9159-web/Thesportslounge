import { connectDB } from "../../db.js";
import Booking from "../../models/Booking.js";
import User from "../../models/User.js";

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

export default async function handler(req, res) {
  await connectDB();

  if (req.method === "GET") {
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
  }

  if (req.method === "POST") {
    try {
      const b = req.body || {};
      if (!b.customerName || !b.phone || !b.date || !b.startTime || !b.endTime)
        return res
          .status(400)
          .json({ error: "customerName, phone, date, startTime, endTime required" });

      const phoneClean = normalizePhone(b.phone);
      const id = b.id || "B" + Date.now();
      const startMin = toMin(b.startTime);
      const endMin = toMin(b.endTime);

      async function conflictCheck(date, excludeId) {
        const rows = await Booking.find({
          date,
          id: { $ne: excludeId },
          status: { $in: ["Confirmed", "Reserved"] },
        })
          .select("id startTime endTime status")
          .lean();
        for (const r of rows) {
          const s2 = toMin(r.startTime),
            e2 = toMin(r.endTime);
          if (overlaps(startMin, endMin, s2, e2))
            return { conflict: true, with: r };
        }
        return { conflict: false };
      }

      const existing = await Booking.findOne({ id });
      if (existing) {
        if (b.status === "Confirmed") {
          const chk = await conflictCheck(b.date, id);
          if (chk.conflict)
            return res
              .status(409)
              .json({ error: "Time conflict: slot already booked" });
        }
        const fields = [
          "customerName",
          "phone",
          "date",
          "startTime",
          "endTime",
          "status",
          "paymentStatus",
          "advance",
          "comments",
          "createdBy",
        ];
        for (const f of fields)
          if (f in b)
            existing[f] =
              f === "phone"
                ? phoneClean
                : f === "advance"
                ? Number(b[f] || 0)
                : b[f];
        await existing.save();
        return res.json({ message: "Booking updated", id });
      }

      if (b.status === "Confirmed") {
        const chk = await conflictCheck(b.date, id);
        if (chk.conflict)
          return res
            .status(409)
            .json({ error: "Time conflict: slot already booked" });
      }

      let createdUser = null;
      const userRow = await User.findOne({
        $or: [{ phone: phoneClean }, { username: phoneClean }],
      }).lean();
      if (!userRow) {
        const pwd = gen6();
        await User.create({
          username: phoneClean,
          password: pwd,
          phone: phoneClean,
          role: "user",
          name: b.customerName || "",
        });
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
  }
}
