const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Fichaje = require('../models/Fichaje');
const ExcelJS = require('exceljs');
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// POST /api/fichaje
router.post('/', async (req, res) => {
  //
  const { pin, type } = req.body;

  if (!pin || !type) {
    return res.status(400).json({ message: "Faltan datos (PIN o tipo)" });
  }

  try {
    const user = await User.findOne({ pin });
    if (!user) return res.status(404).json({ message: "PIN incorrecto" });

    const fichajes = await Fichaje.find({ user: user._id }).sort({ date: -1 });

    const ultimaEntrada = fichajes.find(f => f.type === 'entrada');
    const ultimaSalida = fichajes.find(f => f.type === 'salida');

    // 🔒 Validación para SALIDA
    if (type === 'salida') {
      if (!ultimaEntrada) {
        return res.status(400).json({ message: 'No puedes fichar salida sin haber fichado entrada.' });
      }
      if (ultimaSalida && ultimaSalida.date > ultimaEntrada.date) {
        return res.status(400).json({ message: 'Ya fichaste salida después de la última entrada.' });
      }

      const ultimoDesayunoInicio = fichajes.find(f => f.type === 'desayuno_inicio' && f.date > ultimaEntrada.date);
      const ultimoDesayunoFin = fichajes.find(f => f.type === 'desayuno_fin' && f.date > ultimaEntrada.date);

      if (ultimoDesayunoInicio && (!ultimoDesayunoFin || ultimoDesayunoFin.date < ultimoDesayunoInicio.date)) {
        return res.status(400).json({ message: 'Debes finalizar el desayuno antes de fichar salida.' });
      }
    }


    // 🔒 Validación para DESAYUNO
    if (type === 'desayuno_inicio') {
      if (!ultimaEntrada || (ultimaSalida && ultimaSalida.date > ultimaEntrada.date)) {
        return res.status(400).json({ message: 'Debes fichar entrada antes de iniciar desayuno.' });
      }
    }

    if (type === 'desayuno_fin') {
      const ultimoInicioDesayuno = fichajes.find(f => f.type === 'desayuno_inicio');
      const ultimoFinDesayuno = fichajes.find(f => f.type === 'desayuno_fin');

      if (
        !ultimoInicioDesayuno ||
        (ultimoFinDesayuno && ultimoFinDesayuno.date > ultimoInicioDesayuno.date)
      ) {
        return res.status(400).json({ message: 'Debes iniciar desayuno antes de finalizarlo.' });
      }
    }

    // ✅ Guardar nuevo fichaje
    const registro = new Fichaje({
      user: user._id,
      type,
      date: new Date(),
    });

    await registro.save();
    await generateExcelAndUpload();

    res.status(200).json({
      message: "Fichaje registrado correctamente",
      user: {
        name: user.name,
        role: user.role,
      },
      type: registro.type,
      timestamp: registro.date,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error interno", error: err.message });
  }
});

// GET /api/fichaje/estado?pin=1234
router.get('/estado', async (req, res) => {
  const { pin } = req.query;

  if (!pin) return res.status(400).json({ message: "Falta el PIN" });

  try {
    const user = await User.findOne({ pin });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const fichajes = await Fichaje.find({ user: user._id }).sort({ date: -1 });

    const ultimaEntrada = fichajes.find(f => f.type === 'entrada');
    const ultimaSalida = fichajes.find(f => f.type === 'salida');
    const ultimoInicioDesayuno = fichajes.find(f => f.type === 'desayuno_inicio');
    const ultimoFinDesayuno = fichajes.find(f => f.type === 'desayuno_fin');

    const haHechoEntrada = !!ultimaEntrada && (!ultimaSalida || ultimaEntrada.date > ultimaSalida.date);
    const desayunoIniciado = !!ultimoInicioDesayuno && (!ultimoFinDesayuno || ultimoInicioDesayuno.date > ultimoFinDesayuno.date);

    res.status(200).json({ haHechoEntrada, desayunoIniciado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error interno", error: err.message });
  }
});



// Función para generar y subir Excel a S3
async function generateExcelAndUpload() {
  const fichajes = await Fichaje.find().populate('user');

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Fichajes');

  worksheet.columns = [
    { header: 'Nombre', key: 'name', width: 25 },
    { header: 'PIN', key: 'pin', width: 15 },
    { header: 'Tipo', key: 'type', width: 20 },
    { header: 'Fecha y Hora', key: 'date', width: 30 },
  ];

  fichajes.forEach(f => {
    worksheet.addRow({
      name: f.user?.name || 'Desconocido',
      pin: f.user?.pin || '',
      type: f.type,
      date: new Date(f.date).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
    });
  });


  const now = new Date();
  const fecha = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const hora = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-mm-ss
  const fileName = `fichajes-${fecha}.xlsx`;
  const s3Key = `excel/${fecha}/${fileName}`;

  const buffer = await workbook.xlsx.writeBuffer();

  await s3.upload({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: s3Key,
    Body: buffer,
    ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }).promise();
}


module.exports = router;
