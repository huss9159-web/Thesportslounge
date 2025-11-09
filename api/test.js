// api/test.js
import { connectDB } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    await connectDB();
    return res.status(200).json({ ok: true, message: "✅ MongoDB connected" });
  } catch (err) {
    console.error("DB error:", err);
    return res.status(500).json({ error: "Database connection failed" });
  }
}
