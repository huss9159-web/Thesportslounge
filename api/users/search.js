// File: pages/api/users/search.js
import { connectDB } from "../../db.js"; // adjust path if needed
import User from "../../models/User.js";
import Booking from "../../models/Booking.js";

export default async function handler(req, res) {
  try {
    await connectDB();

    const q = req.query.q ? req.query.q.trim() : "";
    let users;

    if (!q) {
      // If no query, return all users (limit if needed)
      users = await User.find()
        .sort({ username: 1 })
        .select("username phone name password role")
        .lean();
    } else {
      // Regex search for username, name, or phone
      const re = new RegExp(q, "i");
      users = await User.find({
        $or: [{ phone: re }, { name: re }, { username: re }],
      })
        .sort({ username: 1 })
        .select("username phone name password role")
        .lean();
    }

    // Add booking count for each user
    await Promise.all(
      users.map(async (u) => {
        u.bookingCount = await Booking.countDocuments({
          $or: [{ phone: u.phone }, { createdBy: u.username }],
        });
      })
    );

    res.json(users || []);
  } catch (err) {
    console.error("Users search error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
