

const express = require('express');
const router = express.Router();
const User = require('../models/User'); // asegúrate de que la ruta es correcta

// POST /api/users - Crear usuario
router.post('/', async (req, res) => {
  const { name, pin, role } = req.body;

  if (!name || !pin) {
    return res.status(400).json({ message: 'Faltan datos' });
  }

  try {
    const existingUser = await User.findOne({ pin });
    if (existingUser) {
      return res.status(409).json({ message: 'PIN ya existe' });
    }

    const user = new User({ name, pin, role: role || 'user' });
    await user.save();

    res.status(201).json({ message: 'Usuario creado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al crear usuario', error: err.message });
  }
});

// GET /api/users - Obtener lista de usuarios
router.get('/', async (req, res) => {
  try {
    const users = await User.find({}, 'name pin role'); // sólo los campos necesarios
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener usuarios', error: err.message });
  }
});

// DELETE /api/users/:id - Eliminar usuario
router.delete('/:id', async (req, res) => {
    try {
      const userId = req.params.id;
      const deleted = await User.findByIdAndDelete(userId);
  
      if (!deleted) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }
  
      res.status(200).json({ message: 'Usuario eliminado' });
    } catch (err) {
      res.status(500).json({ message: 'Error al eliminar usuario', error: err.message });
    }
  });

  // GET /api/users/by-pin/:pin - Buscar usuario por PIN
router.get('/by-pin/:pin', async (req, res) => {
  try {
    const user = await User.findOne({ pin: req.params.pin });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error al buscar usuario', error: err.message });
  }
});

  

module.exports = router;
