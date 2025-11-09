import mongoose from "mongoose";
const settingsSchema = new mongoose.Schema({
  template: String,
  prefix: String,
  timeFormat: String,
  toastTimeout: Number,
  autoSend: Number,
  sendCredentials: Number
});
export default mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
