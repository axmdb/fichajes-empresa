require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authMiddleware = require('./middleware/auth');

const fichajeRoutes = require('./routes/fichaje');
const firmaRoutes = require('./routes/firma');
const userRoutes = require('./routes/users');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 🔌 Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch((err) => console.error("❌ MongoDB error", err));

// ✅ Rutas protegidas con middleware de autenticación
app.use('/api/fichaje', authMiddleware, fichajeRoutes);
app.use('/api/firma', authMiddleware, firmaRoutes);
app.use('/api/users', authMiddleware, userRoutes);

// Ruta pública simple
app.get('/', (req, res) => {
  res.send('Servidor funcionando');
});

// 🎧 Escucha en el puerto especificado
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor backend en http://${process.env.IP || 'localhost'}:${PORT}`);
});
