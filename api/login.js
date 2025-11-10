import { connectDB } from "../db.js";
import User from "../models/User.js";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    await connectDB();
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ error: "username & password required" });

    const row = await User.findOne({ username, password })
      .select("username phone role name")
      .lean();
    if (!row) return res.status(401).json({ error: "Invalid credentials" });

    res.json({ success: true, user: row });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
