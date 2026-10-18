import mongoose from 'mongoose';

// Settings for the whole service (not for one person). There is only one of these.
const schema = new mongoose.Schema(
  {
    key: { type: String, default: 'config', unique: true },
    signupMode: { type: String, enum: ['closed', 'approval', 'open'], default: 'approval' },
    homeOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // whose site is shown on the home address
  },
  { timestamps: true }
);

export default mongoose.models.Config || mongoose.model('Config', schema);
