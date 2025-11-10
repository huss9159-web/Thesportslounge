// api/login.js
import { connectDB } from "../db.js";
import User from "../models/User.js";

export default async function handler(req, res) {
  await connectDB();
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  res.status(200).json({ user });
}
