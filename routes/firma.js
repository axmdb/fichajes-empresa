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

// Limpiar nombres de carpetas
function clean(str) {
  return String(str)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "_");
}

// ---------------------------------------------
// POST /api/firma
// ---------------------------------------------
router.post('/', async (req, res) => {
  const { pin, signature, type, almacenId } = req.body;

  // Validación
  if (!pin || !signature || !type || !almacenId) {
    return res.status(400).json({
      message: "Faltan datos (pin, firma, tipo o almacenId)"
    });
  }

  try {
    // Buscar usuario por PIN y almacén
    const user = await User.findOne({ pin, almacenId });
    if (!user) {
      return res.status(404).json({
        message: "PIN no válido o usuario no pertenece al almacén"
      });
    }

    // Conversión base64 → buffer
    const base64 = signature.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    // Fecha actual
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const fecha = `${dd}-${mm}-${yyyy}`;

    // Carpeta de usuario limpia
    const userFolder = `${clean(user.name)}_${user.pin}`;

    // Nombre del archivo → firma_entrada / firma_salida / firma_desayuno_inicio / firma_desayuno_fin
    const fileName = `firma_${type}.png`;

    const key = `${user.almacenId}/${userFolder}/${fecha}/${fileName}`;

    // Subir a S3
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
    console.error("Error al guardar firma:", err);
    return res.status(500).json({
      message: "Error interno",
      error: err.message
    });
  }
});

module.exports = router;
