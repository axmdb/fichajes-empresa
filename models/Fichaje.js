const mongoose = require('mongoose');

const fichajeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['entrada', 'salida', 'desayuno_inicio', 'desayuno_fin'], // ✅ ampliado
    required: true
  },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Fichaje', fichajeSchema);
