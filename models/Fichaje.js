const mongoose = require('mongoose');

const fichajeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['entrada', 'salida', 'desayuno_inicio', 'desayuno_fin'],
    required: true
  },
  date: { type: Date, default: Date.now },

  // 🔹 Asociar fichaje a un almacén
  almacenId: { type: String, required: true },
});

module.exports = mongoose.model('Fichaje', fichajeSchema);
