// api/bookings/delete.js
import { connectDB } from "../../db.js";
import Booking from "../../models/Booking.js";

export default async function handler(req, res) {
  if (req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed" });
  try {
    await connectDB();

    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing booking id" });

    const booking = await Booking.findOneAndDelete({ id }); // note: using your custom 'id' field
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    res.json({ message: "Booking deleted" });
  } catch (err) {
    console.error("Delete booking error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
