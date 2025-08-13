const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  pin: { type: String, required: true },
  role: { type: String, enum : ['admin', 'user'], default: 'user' },
  almacenId: { type: String, required: true }
});

// 🔹 Evitar pins duplicados en el mismo almacén
userSchema.index({ pin: 1, almacenId: 1 }, { unique: true });


module.exports = mongoose.model('User', userSchema);
