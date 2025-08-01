require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const fichajeRoutes = require('./routes/fichaje');
const firmaRoutes = require('./routes/firma');


const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch((err) => console.error("❌ MongoDB error", err));

app.use('/api/fichaje', fichajeRoutes);
app.use('/api/users', require('./routes/users')); // o el path correcto
app.use('/api/firma', firmaRoutes);


app.get('/', (req, res) => {
  res.send('servidor funcionando');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor backend en http://${process.env.IP}:${PORT}`));

