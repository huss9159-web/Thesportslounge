import connectDB from "../db.js";

export default async function handler(req, res) {
  try {
    await connectDB();
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
