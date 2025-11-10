// api/bookings/free.js
import { connectDB } from "../../lib/db.js";
import Booking from "../../models/Booking.js"; // adjust path if needed

export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    await connectDB();

    const { from, to, start, end } = req.query;
    if (!from || !to || !start || !end)
      return res
        .status(400)
        .json({ error: "Missing required query params: from,to,start,end" });

    // helper to convert HH:mm -> total minutes
    const toMin = (t) => {
      const [hh, mm] = (t || "00:00").split(":").map(Number);
      return hh * 60 + (mm || 0);
    };

    const windowStart = toMin(start);
    let windowEnd = toMin(end);
    if (windowEnd <= windowStart) windowEnd += 24 * 60;

    // Get confirmed bookings between date range
    const rows = await Booking.find({
      date: { $gte: from, $lte: to },
      status: "Confirmed",
    })
      .select("date startTime endTime")
      .sort({ date: 1, startTime: 1 })
      .lean();

    const byDate = {};
    for (const b of rows || []) {
      const s = toMin(b.startTime),
        e = toMin(b.endTime);
      const eAdj = e <= s ? e + 24 * 60 : e;
      if (!byDate[b.date]) byDate[b.date] = [];
      const a = Math.max(s, windowStart),
        c = Math.min(eAdj, windowEnd);
      if (a < c) byDate[b.date].push([a, c]);
    }

    // Compute free windows
    const out = [];
    const sDate = new Date(from),
      eDate = new Date(to);

    for (let d = new Date(sDate); d <= eDate; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      const occ = (byDate[ds] || []).sort((x, y) => x[0] - y[0]);

      // Merge overlapping bookings
      const merged = [];
      for (const r of occ) {
        if (!merged.length) merged.push(r);
        else {
          const last = merged[merged.length - 1];
          if (r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
          else merged.push(r);
        }
      }

      // Calculate free slots
      const frees = [];
      let cursor = windowStart;
      for (const m of merged) {
        if (m[0] > cursor) frees.push([cursor, m[0]]);
        cursor = Math.max(cursor, m[1]);
      }
      if (cursor < windowEnd) frees.push([cursor, windowEnd]);

      out.push({
        date: ds,
        free: frees.map((f) => ({
          startMin: f[0],
          endMin: f[1],
        })),
      });
    }

    res.json(out);
  } catch (e) {
    console.error("Error in /api/bookings/free:", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
}
