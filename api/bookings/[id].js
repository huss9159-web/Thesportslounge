// api/bookings/[id].js
import { connectDB } from "../../../db.js";
import Booking from "../../../models/Booking.js";

export default async function handler(req, res) {
  const { id } = req.query;

  await connectDB();

  if (req.method === "GET") {
    // Fetch booking by custom 'id' field
    try {
      const booking = await Booking.findOne({ id }).lean();
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      res.json(booking);
    } catch (err) {
      console.error("Get booking error:", err);
      res.status(500).json({ error: "Server error" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
