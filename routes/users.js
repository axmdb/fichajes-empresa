// routes/users.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// Proteger todas las rutas de usuarios
router.use(authMiddleware);

// POST /api/users - Crear usuario
router.post('/', async (req, res) => {
  const { name, pin, role, almacenId } = req.body;

  if (!name || !pin || !almacenId) {
    return res.status(400).json({ message: 'Faltan datos' });
  }

  try {
    // Comprobación manual adicional (además del índice único)
    const existing = await User.findOne({ pin, almacenId });
    if (existing) {
      return res.status(409).json({ message: 'PIN ya existe en este almacén' });
    }

    const user = new User({ name, pin, role: role || 'user', almacenId });
    await user.save();

    return res.status(201).json({ message: `Usuario creado en el almacén: ${almacenId}` });
  } catch (err) {
    // Duplicado por índice único compuesto
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'PIN ya existe en este almacén' });
    }
    return res.status(500).json({ message: 'Error al crear usuario', error: err.message });
  }
});

// GET /api/users - Listar usuarios por almacén
router.get('/', async (req, res) => {
  const { almacenId } = req.query;
  if (!almacenId) return res.status(400).json({ message: 'Falta almacenId' });

  try {
    const users = await User.find({ almacenId }, 'name pin role almacenId');
    return res.status(200).json(users);
  } catch (err) {
    return res.status(500).json({ message: 'Error al obtener usuarios', error: err.message });
  }
});

// GET /api/users/by-pin/:pin - Buscar usuario por PIN dentro del almacén
router.get('/by-pin/:pin', async (req, res) => {
  const { almacenId } = req.query;
  if (!almacenId) return res.status(400).json({ message: 'Falta almacenId' });

  // 👇 logs útiles
  console.log('[by-pin] params.pin =', req.params.pin, 'query.almacenId =', almacenId);

  try {
    const pin = String(req.params.pin).trim();
    const alm = String(almacenId).trim();

    const user = await User.findOne({ pin, almacenId: alm }).lean();
    console.log('[by-pin] query result =', user);

    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    return res.status(200).json(user);
  } catch (err) {
    console.error('[by-pin] ERROR:', err);
    return res.status(500).json({ message: 'Error al buscar usuario', error: err.message });
  }
});


// DELETE /api/users/:id - Eliminar usuario (restringido al almacén)
router.delete('/:id', async (req, res) => {
  const { almacenId } = req.query;
  if (!almacenId) return res.status(400).json({ message: 'Falta almacenId' });

  try {
    const deleted = await User.findOneAndDelete({ _id: req.params.id, almacenId });
    if (!deleted) {
      return res.status(404).json({ message: 'Usuario no encontrado en este almacén' });
    }
    return res.status(200).json({ message: 'Usuario eliminado' });
  } catch (err) {
    return res.status(500).json({ message: 'Error al eliminar usuario', error: err.message });
  }
});

module.exports = router;
