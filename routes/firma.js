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

// --- LIMPIEZA DE NOMBRES PARA CARPETAS ---
function clean(str) {
  return String(str)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // quitar acentos
    .replace(/[^a-zA-Z0-9]/g, "_");                   // solo letras/números
}

// ---------------------------------
// POST /api/firma
// ---------------------------------
router.post('/', async (req, res) => {
  const { pin, signature, type, almacenId } = req.body;

  if (!pin || !signature || !type || !almacenId) {
    return res.status(400).json({
      message: "Faltan datos (pin, firma, tipo o almacenId)"
    });
  }

  try {
    // Buscar usuario en el almacén correcto
    const user = await User.findOne({ pin, almacenId });
    if (!user) {
      return res.status(404).json({
        message: "PIN no válido o usuario no pertenece al almacén"
      });
    }

    // Preparar imagen
    const base64 = signature.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    // Formato de fecha DD-MM-YYYY
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const fecha = `${dd}-${mm}-${yyyy}`;

    // Carpeta del usuario
    const userFolder = `${clean(user.name)}_${user.pin}`;

    // Nombre ARCHIVO — igual que el fichaje, mismo sitio
    const fileName = `firma_${type}_${userFolder}.png`;

    // RUTA FINAL
    const key = `${almacenId}/${userFolder}/${fecha}/${fileName}`;

    // Subir a S3
    const upload = await s3.upload({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentEncoding: "base64",
      ContentType: "image/png",
    }).promise();

    res.status(200).json({
      message: "Firma guardada correctamente",
      url: upload.Location,
      s3key: key
    });

  } catch (err) {
    console.error("Error en firma:", err);
    return res.status(500).json({
      message: "Error interno",
      error: err.message
    });
  }
});

module.exports = router;
