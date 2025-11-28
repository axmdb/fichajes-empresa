const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Fichaje = require('../models/Fichaje');
const ExcelJS = require('exceljs');
const AWS = require('aws-sdk');

// --- AWS S3 ---
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Limpiar nombres para carpetas
function clean(str) {
  return String(str)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "_");
}

// ----------------------------
// POST /api/fichaje
// ----------------------------
router.post('/', async (req, res) => {
  const { pin, type, almacenId } = req.body;

  if (!pin || !type || !almacenId) {
    return res.status(400).json({ message: "Faltan datos (pin, tipo o almacenId)" });
  }

  try {
    const user = await User.findOne({ pin, almacenId });
    if (!user) return res.status(404).json({ message: "PIN incorrecto o no pertenece a este almacén" });

    const fichajes = await Fichaje.find({ user: user._id, almacenId }).sort({ date: -1 });

    const entrada = fichajes.find(f => f.type === 'entrada');
    const salida = fichajes.find(f => f.type === 'salida');

    // Validaciones
    if (type === 'salida') {
      if (!entrada) return res.status(400).json({ message: 'No puedes fichar salida sin entrada.' });
      if (salida && salida.date > entrada.date) {
        return res.status(400).json({ message: 'Ya fichaste salida después de la entrada.' });
      }
    }

    // Crear fichaje
    const registro = new Fichaje({
      user: user._id,
      almacenId,
      type,
      date: new Date(),
    });

    await registro.save();

    // Generar Excel individual
    await generateUserExcel(user, registro);

    return res.status(200).json({
      message: "Fichaje registrado correctamente",
      user: { name: user.name },
      type: registro.type,
      timestamp: registro.date,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno", error: err.message });
  }
});

// ----------------------------
// EXCEL POR USUARIO + DÍA
// ----------------------------
async function generateUserExcel(user, fichaje) {
  const now = new Date(fichaje.date);
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const fecha = `${dd}-${mm}-${yyyy}`;

  const userFolder = `${clean(user.name)}_${user.pin}`;
  const key = `${user.almacenId}/${userFolder}/${fecha}/fichajes_${fecha}.xlsx`;

  const workbook = new ExcelJS.Workbook();
  let sheet;

  // Intentar abrir archivo existente
  try {
    const existing = await s3.getObject({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    }).promise();

    await workbook.xlsx.load(existing.Body);
    sheet = workbook.getWorksheet("Fichajes") || workbook.addWorksheet("Fichajes");
  } catch (e) {
    sheet = workbook.addWorksheet("Fichajes");
    sheet.columns = [
      { header: "Tipo", key: "type", width: 20 },
      { header: "Fecha y Hora", key: "date", width: 30 },
    ];
  }

  sheet.addRow({
    type: fichaje.type,
    date: now.toLocaleString("es-ES", { timeZone: "Europe/Madrid" }),
  });

  const buffer = await workbook.xlsx.writeBuffer();

  await s3.upload({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }).promise();
}

module.exports = router;
