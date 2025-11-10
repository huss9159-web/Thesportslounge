import { connectDB } from "../db.js";
import Settings from "../models/Settings.js";

export default async function handler(req, res) {
  await connectDB();

  if (req.method === "GET") {
    try {
      const row = await Settings.findOne().lean();
      if (!row) return res.status(500).json({ error: "settings missing" });

      res.json({
        template: row.template,
        prefix: row.prefix,
        timeFormat: row.timeFormat || "12",
        toastTimeout: Number(row.toastTimeout) || 5,
        autoSend: Number(row.autoSend) || 0,
        sendCredentials: Number(row.sendCredentials) || 0,
      });
    } catch (err) {
      console.error("Settings get error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }

  if (req.method === "POST") {
    try {
      const s = req.body || {};
      const row = await Settings.findOne();
      if (!row) await Settings.create(s);
      else await Settings.updateOne({}, s);

      res.json({ message: "settings updated" });
    } catch (err) {
      console.error("Settings post error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
}
