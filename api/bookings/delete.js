// api/bookings/delete.js
import { connectDB } from "../../db.js";
import Booking from "../../models/Booking.js";

export default async function handler(req, res) {
  if (req.method !== "DELETE")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    await connectDB();

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Booking ID required" });

    const deleted = await Booking.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Booking not found" });

    res.json({ message: "Booking deleted successfully" });
  } catch (e) {
    console.error("Delete booking error:", e);
    res.status(500).json({ error: "Server error" });
  }
}
