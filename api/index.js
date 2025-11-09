import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import serverless from "serverless-http";

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB cache to reuse connections
let cached = global.mongoose || { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI) throw new Error("❌ Missing MONGO_URI env variable");

    cached.promise = mongoose
      .connect(MONGO_URI, {
        dbName: "sportslounge",
        bufferCommands: false,
      })
      .then((mongoose) => {
        console.log("✅ MongoDB connected");
        return mongoose;
      })
      .catch((err) => {
        cached.promise = null; // reset on failure
        throw err;
      });
  }
  cached.conn = await cached.promise;
  global.mongoose = cached;
  return cached.conn;
}

// Middleware ensures DB is connected
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    res.status(500).json({ error: "Database not available" });
  }
});

// Routes
app.get("/", (req, res) => res.send("✅ Sports Lounge API is running!"));

app.get("/api/test", (req, res) => res.json({ message: "API working fine ✅" }));

app.get("/api/users", async (req, res) => {
  try {
    const users = await mongoose.connection.db.collection("users").find().toArray();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wrap with serverless for Vercel
export default serverless(app);
