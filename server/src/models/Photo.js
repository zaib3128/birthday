import mongoose from 'mongoose';

// The picture itself is stored inside MongoDB, so no extra file storage is needed.
const schema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // whose picture this is. Every query filters on it.
    size: { type: Number, default: 0 }, // bytes
    name: { type: String, maxlength: 100 },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true, select: false }, // "select: false" keeps big data out of normal queries
  },
  { timestamps: true }
);

// Holds everything the photo list and the usage totals need, so MongoDB never has to read the big picture data for them.
schema.index({ owner: 1, _id: 1, size: 1, name: 1 });

export default mongoose.models.Photo || mongoose.model('Photo', schema);
