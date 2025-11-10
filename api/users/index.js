import { connectDB } from "../../db.js";
import User from "../../models/User.js";
import Booking from "../../models/Booking.js";

export default async function handler(req, res) {
  try {
    await connectDB();
    const q = req.query.q ? req.query.q.trim() : "";
    let rows;

    if (!q) {
      rows = await User.find()
        .sort({ username: 1 })
        .select("username phone name password role")
        .lean();
    } else {
      const re = new RegExp(q, "i");
      rows = await User.find({
        $or: [{ phone: re }, { name: re }, { username: re }],
      })
        .sort({ username: 1 })
        .select("username phone name password role")
        .lean();
    }

    await Promise.all(
      rows.map(async (r) => {
        r.bookingCount = await Booking.countDocuments({
          $or: [{ phone: r.phone }, { createdBy: r.username }],
        });
      })
    );

    res.json(rows || []);
  } catch (err) {
    console.error("Users error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
