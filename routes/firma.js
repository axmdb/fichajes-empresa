const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AWS = require('aws-sdk');

// --- AWS S3 ---
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Limpia nombres para carpetas/archivos
function clean(str) {
  return String(str)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "_");
}

// Nombre del mes en mayúsculas
function getMonthName(date) {
  const months = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];
  return months[date.getMonth()];
}

// ---------------------------------------------
// POST /api/firma
// ---------------------------------------------
router.post('/', async (req, res) => {
  const { pin, signature, type, almacenId } = req.body;

  if (!pin || !signature || !type || !almacenId) {
    return res.status(400).json({
      message: "Faltan datos (pin, firma, tipo o almacenId)"
    });
  }

  try {
    const user = await User.findOne({ pin, almacenId });
    if (!user) {
      return res.status(404).json({
        message: "PIN no válido o usuario no pertenece al almacén"
      });
    }

    // Base64 → buffer
    const base64 = signature.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    const now = new Date();

    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const fecha = `${dd}-${mm}-${yyyy}`;

    const mesNombre = getMonthName(now);
    const carpetaMes = `${mesNombre}_${yyyy}`;

    const userFolder = `${clean(user.name)}_${user.pin}`;
    const fileName = `firma_${type}.png`;

    const key = `${user.almacenId}/${userFolder}/${carpetaMes}/FIRMAS/${fecha}/${fileName}`;

    console.log("📌 Guardando firma en S3 con KEY:", key);

    const upload = await s3.upload({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentEncoding: "base64",
      ContentType: "image/png",
    }).promise();

    return res.status(200).json({
      message: "Firma guardada correctamente",
      url: upload.Location
    });

  } catch (err) {
    console.error("❌ Error al guardar firma:", err);
    return res.status(500).json({
      message: "Error interno",
      error: err.message
    });
  }
});

module.exports = router;
