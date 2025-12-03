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

function clean(str) {
  return String(str)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "_");
}


// ========================================
//   📌  RUTA POST PRINCIPAL (NO CAMBIAR)
// ========================================
router.post('/', async (req, res) => {
  const { pin, type, almacenId } = req.body;

  if (!pin || !type || !almacenId) {
    return res.status(400).json({ message: "Faltan datos (pin, tipo o almacenId)" });
  }

  try {
    const user = await User.findOne({ pin, almacenId });
    if (!user) {
      return res.status(404).json({ message: "PIN incorrecto o no pertenece a este almacén" });
    }

    // Obtenemos solo fichajes DEL MISMO DÍA — FIX IMPORTANTE
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);

    const finDia = new Date();
    finDia.setHours(23, 59, 59, 999);

    const fichajes = await Fichaje.find({
      user: user._id,
      almacenId,
      date: { $gte: inicioDia, $lte: finDia }
    }).sort({ date: -1 });

    // Últimos eventos del día
    const entrada = fichajes.find(f => f.type === 'entrada');
    const salida = fichajes.find(f => f.type === 'salida');
    const ultimoDesayunoInicio = fichajes.find(f => f.type === 'desayuno_inicio');
    const ultimoDesayunoFin = fichajes.find(f => f.type === 'desayuno_fin');


    // VALIDACIONES (idénticas a las tuyas)
    if (type === 'salida') {
      if (!entrada)
        return res.status(400).json({ message: "No puedes fichar salida sin entrada." });

      if (salida && salida.date > entrada.date)
        return res.status(400).json({ message: "Ya fichaste salida después de la entrada." });

      if (ultimoDesayunoInicio && (!ultimoDesayunoFin || ultimoDesayunoInicio.date > ultimoDesayunoFin.date))
        return res.status(400).json({ message: "Debes finalizar el desayuno antes de salir." });
    }

    if (type === 'desayuno_inicio') {
      if (!entrada || (salida && salida.date > entrada.date))
        return res.status(400).json({ message: "Debes fichar entrada antes del desayuno." });
    }

    if (type === 'desayuno_fin') {
      if (!ultimoDesayunoInicio || (ultimoDesayunoFin && ultimoDesayunoFin.date > ultimoDesayunoInicio.date))
        return res.status(400).json({ message: "Debes iniciar el desayuno antes de finalizarlo." });
    }


    // GUARDAR FICHAJE
    const registro = new Fichaje({
      user: user._id,
      almacenId,
      type,
      date: new Date(),
    });

    await registro.save();

    await generateUserExcel(user, registro);

    res.json({
      message: "Fichaje registrado correctamente",
      type,
      timestamp: registro.date
    });

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).json({ message: "Error interno", error: err.message });
  }
});


// ========================================
//   📌 GENERAR EXCEL (FUNCIONANDO)
// ========================================
async function generateUserExcel(user, fichaje) {
  const fecha = new Date(fichaje.date).toLocaleDateString("es-ES").replace(/\//g, "-");

  const userFolder = `${clean(user.name)}_${user.pin}`;
  const fileName = `fichajes_${fecha}_${userFolder}.xlsx`;

  const key = `${user.almacenId}/${userFolder}/${fecha}/${fileName}`;

  const workbook = new ExcelJS.Workbook();
  let sheet;

  try {
    const existing = await s3.getObject({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key
    }).promise();

    await workbook.xlsx.load(existing.Body);
    sheet = workbook.worksheets[0];
  } catch {
    sheet = workbook.addWorksheet("Fichajes");
    sheet.columns = [
      { header: "Tipo", key: "type", width: 20 },
      { header: "Fecha y Hora", key: "date", width: 30 }
    ];
  }

  sheet.addRow({
    type: fichaje.type,
    date: new Date(fichaje.date).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid"
    })
  });

  const buffer = await workbook.xlsx.writeBuffer();

  await s3.upload({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }).promise();
}

module.exports = router;
