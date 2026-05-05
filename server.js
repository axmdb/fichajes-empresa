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

// ---------------------------------------------
// 🔍 LOG GLOBAL DE TODAS LAS PETICIONES
// ---------------------------------------------
app.use((req, res, next) => {
  const start = Date.now();

  console.log(`➡️  Request recibido: ${req.method} ${req.url}`);

  res.on('finish', () => {
    const duration = Date.now() - start;

    // Petición lenta -> posible cold start
    if (duration > 2000) {
      console.warn(`🐢 [COLD] ${req.method} ${req.url} tardó ${duration}ms`);
    }

    console.log(`⬅️  Respuesta enviada (${duration}ms): ${req.method} ${req.url} → ${res.statusCode}`);
  });

  next();
});

// ---------------------------------------------
// 🔌 Conexión a MongoDB + LOGS de estado
// ---------------------------------------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch((err) => console.error("❌ Error al conectar con MongoDB:", err));

mongoose.connection.on('error', (err) => {
  console.error("🔥 [MongoDB ERROR]:", err);
});

mongoose.connection.on('disconnected', () => {
  console.warn("⚠️ [MongoDB] Desconectado");
});

mongoose.connection.on('reconnected', () => {
  console.log("🔄 [MongoDB] Reconectado");
});

// ---------------------------------------------
// 🔐 Rutas protegidas
// ---------------------------------------------
app.use('/api/fichaje', (req, res, next) => {
  if (req.path === '/inspeccion/pdf') return next();
  return authMiddleware(req, res, next);
 }, fichajeRoutes);

app.use('/api/firma', authMiddleware, firmaRoutes);
app.use('/api/users', authMiddleware, userRoutes);

// ---------------------------------------------
// Ruta pública simple
// ---------------------------------------------
app.get('/', (req, res) => {
  res.send('Servidor funcionando');
});

// ---------------------------------------------
// 🔥 Manejador GLOBAL de errores de Express
// ---------------------------------------------
app.use((err, req, res, next) => {
  console.error("🔥 [Express ERROR]:", err);
  res.status(500).json({ message: "Error interno del servidor", error: err.message });
});

// ---------------------------------------------
// 🎧 Levantar servidor
// ---------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor backend en http://${process.env.IP || 'localhost'}:${PORT}`);
});
