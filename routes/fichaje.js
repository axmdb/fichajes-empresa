// routes/fichaje.js
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

// Limpia nombres para carpetas/archivos
function clean(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_');
}

function getDayRange(date = new Date()) {
  const inicio = new Date(date);
  inicio.setHours(0, 0, 0, 0);

  const fin = new Date(date);
  fin.setHours(23, 59, 59, 999);

  return { inicio, fin };
}

/* -----------------------------------
 *  POST /api/fichaje
 * -----------------------------------*/
router.post('/', async (req, res) => {
  console.log("\n\n==============================");
  console.log("📥 PETICIÓN DE FICHAJE RECIBIDA:");
  console.log(req.body);
  console.log("==============================\n");

  const { pin, type, almacenId } = req.body;

  if (!pin || !type || !almacenId) {
    return res.status(400).json({ message: 'Faltan datos (pin, tipo o almacenId)' });
  }

  try {
    const user = await User.findOne({ pin, almacenId });
    if (!user) {
      console.log("❌ Usuario NO encontrado con ese PIN y almacen");
      return res.status(404).json({ message: 'PIN incorrecto o no pertenece a este almacén' });
    }

    console.log("✔ Usuario encontrado:", user.name);

    const { inicio, fin } = getDayRange();

    const fichajes = await Fichaje.find({
      user: user._id,
      almacenId,
      date: { $gte: inicio, $lte: fin },
    }).sort({ date: 1 });

    console.log("📊 Fichajes de HOY:", fichajes.length);
    console.log(fichajes.map(f => `${f.type} - ${f.date}`).join("\n"));

    const entradas = fichajes.filter(f => f.type === 'entrada');
    const salidas = fichajes.filter(f => f.type === 'salida');
    const desayunosInicio = fichajes.filter(f => f.type === 'desayuno_inicio');
    const desayunosFin = fichajes.filter(f => f.type === 'desayuno_fin');

    const ultimaEntrada = entradas[entradas.length - 1] || null;
    const ultimaSalida = salidas[salidas.length - 1] || null;
    const ultimoDesayunoInicio = desayunosInicio[desayunosInicio.length - 1] || null;
    const ultimoDesayunoFin = desayunosFin[desayunosFin.length - 1] || null;

    console.log("📌 Estado actual:");
    console.log(" - última entrada:", ultimaEntrada?.date);
    console.log(" - última salida:", ultimaSalida?.date);
    console.log(" - último desayuno inicio:", ultimoDesayunoInicio?.date);
    console.log(" - último desayuno fin:", ultimoDesayunoFin?.date);

    // --- VALIDACIONES DEL FLUJO ---
    if (type === 'entrada') {
      if (ultimaEntrada && (!ultimaSalida || ultimaEntrada.date > ultimaSalida.date)) {
        console.log("❌ Entrada no permitida (ya hay una entrada activa)");
        return res.status(400).json({
          message: 'Ya has fichado entrada y no has salido todavía.',
        });
      }
    }

    if (type === 'desayuno_inicio') {
      const entradaActiva =
        ultimaEntrada && (!ultimaSalida || ultimaEntrada.date > ultimaSalida.date);

      if (!entradaActiva) {
        console.log("❌ Desayuno inicio sin entrada previa");
        return res.status(400).json({
          message: 'Debes fichar entrada antes del desayuno.',
        });
      }

      const desayunoAbierto =
        ultimoDesayunoInicio &&
        (!ultimoDesayunoFin || ultimoDesayunoInicio.date > ultimoDesayunoFin.date);

      if (desayunoAbierto) {
        console.log("❌ Ya hay un desayuno iniciado sin cerrar");
        return res.status(400).json({
          message: 'Ya tienes un desayuno iniciado que no has finalizado.',
        });
      }
    }

    if (type === 'desayuno_fin') {
      const desayunoAbierto =
        ultimoDesayunoInicio &&
        (!ultimoDesayunoFin || ultimoDesayunoInicio.date > ultimoDesayunoFin.date);

      if (!desayunoAbierto) {
        console.log("❌ Desayuno fin sin desayuno inicio");
        return res.status(400).json({
          message: 'Debes iniciar desayuno antes de finalizarlo.',
        });
      }
    }

    if (type === 'salida') {
      if (!ultimaEntrada) {
        console.log("❌ Salida sin entrada");
        return res.status(400).json({
          message: 'No puedes fichar salida sin haber fichado entrada.',
        });
      }

      if (ultimaSalida && ultimaSalida.date > ultimaEntrada.date) {
        console.log("❌ Doble salida no permitida");
        return res.status(400).json({
          message: 'Ya fichaste salida después de la última entrada.',
        });
      }

      const desayunoAbierto =
        ultimoDesayunoInicio &&
        (!ultimoDesayunoFin || ultimoDesayunoInicio.date > ultimoDesayunoFin.date);

      if (desayunoAbierto) {
        console.log("❌ Salida con desayuno abierto");
        return res.status(400).json({
          message: 'Debes finalizar el desayuno antes de fichar salida.',
        });
      }
    }

    // --- GUARDAR FICHAJE ---
    const registro = new Fichaje({
      user: user._id,
      almacenId,
      type,
      date: new Date(),
    });

    await registro.save();
    console.log("✔ Fichaje guardado en Mongo:", registro);

    // Excel
    await generateUserExcel(user, registro);

    return res.status(200).json({
      message: 'Fichaje registrado correctamente',
      user: { name: user.name },
      type: registro.type,
      timestamp: registro.date,
    });
  } catch (err) {
    console.error('[POST /api/fichaje] ERROR:', err);
    return res.status(500).json({ message: 'Error interno', error: err.message });
  }
});

/* -----------------------------------
 *  EXCEL CON LOGS
 * -----------------------------------*/
async function generateUserExcel(user, fichaje) {
  console.log("\n📄 GENERANDO EXCEL...");

  const now = new Date(fichaje.date);
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const fecha = `${dd}-${mm}-${yyyy}`;

  const userFolder = `${clean(user.name)}_${user.pin}`;
  const fileName = `fichajes_${fecha}_${userFolder}.xlsx`;
  const key = `${user.almacenId}/${userFolder}/${fecha}/${fileName}`;

  console.log("📌 S3 KEY:", key);

  const workbook = new ExcelJS.Workbook();
  let sheet;

  try {
    console.log("🔍 Intentando cargar archivo desde S3...");
    const existing = await s3
      .getObject({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
      })
      .promise();

    console.log("✔ Archivo encontrado en S3. Cargando...");
    await workbook.xlsx.load(existing.Body);
    sheet = workbook.getWorksheet('Fichajes');

    if (!sheet) {
      console.log("⚠ No había hoja llamada Fichajes. Creando...");
      sheet = workbook.addWorksheet('Fichajes');
      sheet.columns = [
        { header: 'Tipo', key: 'type', width: 20 },
        { header: 'Fecha y Hora', key: 'date', width: 30 },
      ];
    }

    console.log("📄 Filas existentes ANTES de añadir:", sheet.rowCount);

  } catch (err) {
    console.log("⚠ Archivo NO encontrado en S3 o error cargando:", err.code);

    sheet = workbook.addWorksheet('Fichajes');
    sheet.columns = [
      { header: 'Tipo', key: 'type', width: 20 },
      { header: 'Fecha y Hora', key: 'date', width: 30 },
    ];

    console.log("📄 Hoja nueva creada.");
  }

  // Añadir la fila
  console.log("➕ Añadiendo fila:", fichaje.type, now);

  sheet.addRow({
    type: fichaje.type,
    date: now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
  });

  console.log("📄 Filas DESPUÉS de añadir:", sheet.rowCount);

  const buffer = await workbook.xlsx.writeBuffer();

  console.log("⬆ Subiendo archivo a S3...");
  await s3
    .upload({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    .promise();

  console.log("✔ Excel subido correctamente a S3");
}

module.exports = router;
