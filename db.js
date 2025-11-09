import mongoose from "mongoose";
const MONGO_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://huss9159_db_user:e1EJsWc6mPRtzo5B@cluster0.k7xnlso.mongodb.net/sportslounge";
  export async function connectDB() {
    console.log('MONGO_URI',MONGO_URI)

  if (!MONGO_URI) throw new Error("Missing MONGODB_URI");
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI);
  console.log("✅ MongoDB connected");
}
