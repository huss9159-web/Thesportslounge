import mongoose from "mongoose";
const bookingSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true }, // keep legacy id if provided
  customerName: String,
  phone: String,
  date: String,
  startTime: String,
  endTime: String,
  status: String,
  paymentStatus: String,
  totalAmount: { type: Number, default: 0 },
  advance: Number,
  comments: String,
  createdBy: String,
  createdAt: String
}, { timestamps: true });
export default mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
