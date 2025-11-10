// api/bookings/[id]/status.js
import { connectDB } from "../../../db.js";
import Booking from "../../../models/Booking.js";

export default async function handler(req, res) {
  const { id } = req.query;

  await connectDB();

  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status required" });

  try {
    // Find booking by custom 'id' field
    const booking = await Booking.findOne({ id });
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    // Conflict check if confirming
    if (status === "Confirmed") {
      const toMin = t => {
        const [hh, mm] = (t || "00:00").split(":").map(Number);
        return hh * 60 + mm;
      };

      const smin = toMin(booking.startTime);
      const emin = toMin(booking.endTime);

      const bookingsOnSameDate = await Booking.find({
        date: booking.date,
        id: { $ne: id },
        status: { $in: ["Confirmed", "Reserved"] }
      });

      for (const b of bookingsOnSameDate) {
        let s2 = toMin(b.startTime);
        let e2 = toMin(b.endTime);
        if (e2 <= s2) e2 += 24 * 60;

        let eAdj = emin;
        if (eAdj <= smin) eAdj += 24 * 60;

        if (Math.max(smin, s2) < Math.min(eAdj, e2)) {
          return res.status(409).json({ error: "Time conflict: slot already booked" });
        }
      }
    }

    booking.status = status;
    await booking.save();

    res.json({ message: "Status updated" });
  } catch (err) {
    console.error("Update booking status error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
