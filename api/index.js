import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import serverless from "serverless-http";

const app = express();

app.use(cors());
app.use(express.json());

// Reuse DB connection (important for Vercel)
let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  const MONGO_URI = process.env.MONGODB_URI ||
  "mongodb+srv://huss9159_db_user:e1EJsWc6mPRtzo5B@cluster0.k7xnlso.mongodb.net/sportslounge";
  if (!MONGO_URI) throw new Error("MONGO_URI not set");
  await mongoose.connect(MONGO_URI, { dbName: "sportslounge" });
  isConnected = true;
  console.log("✅ MongoDB connected");
}

// Middleware to ensure DB connection before each request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    res.status(500).json({ error: "Database connection failed" });
  }
});

// Example routes
app.get("/", (req, res) => {
  res.send("✅ Sports Lounge API is running on Vercel!");
});

app.get("/api/test", (req, res) => {
  res.json({ message: "API working fine ✅" });
});

// Example Mongo route (optional)
app.get("/api/users", async (req, res) => {
  try {
    const users = await mongoose.connection.db.collection("users").find().toArray();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export as serverless handler
export default serverless(app);
