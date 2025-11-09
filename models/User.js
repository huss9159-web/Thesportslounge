import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, index: true },
  password: String,
  phone: String,
  role: String,
  name: String
}, { timestamps: true });
export default mongoose.models.User || mongoose.model("User", userSchema);
