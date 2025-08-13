const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

router.post('/', async (req, res) => {
  const { pin, signature, type, almacenId } = req.body;

  // 🔹 Validación completa
  if (!pin || !signature || !type || !almacenId) {
    return res.status(400).json({ message: 'Faltan datos (pin, firma, tipo o almacenId)' });
  }

  try {
    // 🔹 Buscar usuario SOLO dentro de este almacén
    const user = await User.findOne({ pin, almacenId });
    if (!user) {
      return res.status(404).json({ message: 'PIN no válido o usuario no pertenece a este almacén' });
    }

    const base64Data = signature.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const now = new Date();
    const fecha = now.toISOString().split('T')[0];
    const fileName = `firma_${type}.png`;

    // 🔹 Guardar en carpeta por almacén y usuario
    const folderPath = `${almacenId}/firmas/${user.name}_${user.pin}/${fecha}/${fileName}`;

    const uploadResult = await s3.upload({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: folderPath,
      Body: buffer,
      ContentEncoding: 'base64',
      ContentType: 'image/png',
    }).promise();

    res.status(200).json({
      message: 'Firma guardada en S3',
      url: uploadResult.Location
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar firma en S3', error: err.message });
  }
});



module.exports = router;
