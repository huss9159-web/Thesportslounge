import mongoose from "mongoose";
const MONGO_URI =
  process.env.MONGODB_URI 
  export async function connectDB() {
    console.log('MONGO_URI',MONGO_URI)

  if (!MONGO_URI) throw new Error("Missing MONGODB_URI");
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI);
  console.log("✅ MongoDB connected");
}
