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

// Rango del día
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

    console.log("📊 Fichajes HOY:", fichajes.length);
    if (fichajes.length) {
      console.log(
        fichajes.map(f => `${f.type} - ${f.date.toISOString()}`).join("\n")
      );
    }

    // Clasificación
    const entradas = fichajes.filter(f => f.type === 'entrada');
    const salidas = fichajes.filter(f => f.type === 'salida');
    const desayunosInicio = fichajes.filter(f => f.type === 'desayuno_inicio');
    const desayunosFin = fichajes.filter(f => f.type === 'desayuno_fin');

    const ultimaEntrada = entradas[entradas.length - 1] || null;
    const ultimaSalida = salidas[salidas.length - 1] || null;
    const ultimoDesayunoInicio = desayunosInicio[desayunosInicio.length - 1] || null;
    const ultimoDesayunoFin = desayunosFin[desayunosFin.length - 1] || null;

    console.log("📌 Estado actual del usuario:");
    console.log(" - ultimaEntrada:", ultimaEntrada?.date);
    console.log(" - ultimaSalida:", ultimaSalida?.date);
    console.log(" - desayuno_inicio:", ultimoDesayunoInicio?.date);
    console.log(" - desayuno_fin:", ultimoDesayunoFin?.date);

    // ---------------- VALIDACIONES ----------------

    if (type === 'entrada') {
      if (ultimaEntrada && (!ultimaSalida || ultimaEntrada.date > ultimaSalida.date)) {
        return res.status(400).json({ message: 'Ya has fichado entrada y no has salido.' });
      }
    }

    if (type === 'desayuno_inicio') {
      const entradaActiva =
        ultimaEntrada && (!ultimaSalida || ultimaEntrada.date > ultimaSalida.date);

      if (!entradaActiva) {
        return res.status(400).json({ message: 'Debes fichar entrada antes del desayuno.' });
      }

      const desayunoAbierto =
        ultimoDesayunoInicio &&
        (!ultimoDesayunoFin || ultimoDesayunoInicio.date > ultimoDesayunoFin.date);

      if (desayunoAbierto) {
        return res.status(400).json({ message: 'Debes cerrar el desayuno anterior.' });
      }
    }

    if (type === 'desayuno_fin') {
      const desayunoAbierto =
        ultimoDesayunoInicio &&
        (!ultimoDesayunoFin || ultimoDesayunoInicio.date > ultimoDesayunoFin.date);

      if (!desayunoAbierto) {
        return res.status(400).json({ message: 'Debes iniciar desayuno antes de finalizarlo.' });
      }
    }

    if (type === 'salida') {
      if (!ultimaEntrada) {
        return res.status(400).json({ message: 'No puedes fichar salida sin entrada.' });
      }

      if (ultimaSalida && ultimaSalida.date > ultimaEntrada.date) {
        return res.status(400).json({ message: 'Ya fichaste salida después de la entrada.' });
      }

      const desayunoAbierto =
        ultimoDesayunoInicio &&
        (!ultimoDesayunoFin || ultimoDesayunoInicio.date > ultimoDesayunoFin.date);

      if (desayunoAbierto) {
        return res.status(400).json({ message: 'Debes finalizar el desayuno antes.' });
      }
    }

    // ---------------- GUARDAR FICHAJE ----------------

    const registro = new Fichaje({
      user: user._id,
      almacenId,
      type,
      date: new Date(),
    });

    await registro.save();
    console.log("✔ Fichaje guardado:", registro.type, registro.date);

    // ---------------- ACTUALIZAR ESTADO ----------------
    // Estos valores los devolvemos por si algún día modificas el frontend,
    // pero ahora mismo la tablet se basa sobre todo en GET /estado.

    const haHechoEntrada =
      type === 'entrada'
        ? true
        : type === 'salida'
        ? false
        : !!ultimaEntrada && (!ultimaSalida || ultimaEntrada.date > ultimaSalida.date);

    const desayunoIniciado =
      type === 'desayuno_inicio'
        ? true
        : type === 'desayuno_fin'
        ? false
        : !!ultimoDesayunoInicio &&
          (!ultimoDesayunoFin || ultimoDesayunoInicio.date > ultimoDesayunoFin.date);

    // ---------------- EXCEL ----------------
    await generateUserExcel(user, registro);

    return res.status(200).json({
      message: 'Fichaje registrado correctamente',
      haHechoEntrada,
      desayunoIniciado,
      type: registro.type,
      timestamp: registro.date,
    });

  } catch (err) {
    console.error('[POST /api/fichaje] ERROR:', err);
    return res.status(500).json({ message: 'Error interno', error: err.message });
  }
});

/* -----------------------------------
 *  GET /api/fichaje/estado
 *  (Usado por la app para saber si mostrar
 *   "Inicio desayuno" o "Fin desayuno")
 * -----------------------------------*/
router.get('/estado', async (req, res) => {
  const { pin, almacenId } = req.query;

  console.log("\n🔎 GET /api/fichaje/estado", req.query);

  if (!pin || !almacenId) {
    return res.status(400).json({ message: 'Faltan PIN o almacenId' });
  }

  try {
    const user = await User.findOne({ pin, almacenId });
    if (!user) {
      console.log("❌ Usuario no encontrado en /estado");
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const { inicio, fin } = getDayRange();

    const fichajes = await Fichaje.find({
      user: user._id,
      almacenId,
      date: { $gte: inicio, $lte: fin },
    }).sort({ date: 1 });

    console.log("📊 [ESTADO] Fichajes HOY:", fichajes.length);

    const entradas = fichajes.filter(f => f.type === 'entrada');
    const salidas = fichajes.filter(f => f.type === 'salida');
    const desayunosInicio = fichajes.filter(f => f.type === 'desayuno_inicio');
    const desayunosFin = fichajes.filter(f => f.type === 'desayuno_fin');

    const ultimaEntrada = entradas[entradas.length - 1] || null;
    const ultimaSalida = salidas[salidas.length - 1] || null;
    const ultimoDesayunoInicio = desayunosInicio[desayunosInicio.length - 1] || null;
    const ultimoDesayunoFin = desayunosFin[desayunosFin.length - 1] || null;

    const haHechoEntrada =
      !!ultimaEntrada && (!ultimaSalida || ultimaEntrada.date > ultimaSalida.date);

    const desayunoIniciado =
      !!ultimoDesayunoInicio &&
      (!ultimoDesayunoFin || ultimoDesayunoInicio.date > ultimoDesayunoFin.date);

    console.log("📌 [ESTADO] haHechoEntrada:", haHechoEntrada, "desayunoIniciado:", desayunoIniciado);

    return res.status(200).json({ haHechoEntrada, desayunoIniciado });
  } catch (err) {
    console.error('[GET /api/fichaje/estado] ERROR:', err);
    return res.status(500).json({ message: 'Error interno', error: err.message });
  }
});

/* -----------------------------------
 *  GENERAR EXCEL POR USUARIO Y DÍA
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

  // función helper para asegurar columnas y keys SIEMPRE
  function ensureColumns(ws) {
    if (!ws.columns || ws.columns.length === 0) {
      console.log("🧱 Definiendo columnas (no había ninguna)...");
      ws.columns = [
        { header: 'Tipo', key: 'type', width: 20 },
        { header: 'Fecha y Hora', key: 'date', width: 30 },
      ];
    } else {
      console.log("🧱 Ajustando keys de columnas existentes...");
      if (ws.columns[0]) {
        ws.columns[0].key = 'type';
        ws.columns[0].header = ws.columns[0].header || 'Tipo';
        ws.columns[0].width = ws.columns[0].width || 20;
      }
      if (ws.columns[1]) {
        ws.columns[1].key = 'date';
        ws.columns[1].header = ws.columns[1].header || 'Fecha y Hora';
        ws.columns[1].width = ws.columns[1].width || 30;
      }
    }
  }

  try {
    console.log("🔍 Intentando cargar archivo desde S3...");
    const existing = await s3
      .getObject({ Bucket: process.env.AWS_BUCKET_NAME, Key: key })
      .promise();

    console.log("✔ Archivo encontrado, cargando...");
    await workbook.xlsx.load(existing.Body);

    sheet = workbook.getWorksheet('Fichajes');
    if (!sheet) {
      console.log("⚠ Hoja 'Fichajes' inexistente, creando...");
      sheet = workbook.addWorksheet('Fichajes');
    }

    // MUY IMPORTANTE: asegurar columnas y keys
    ensureColumns(sheet);

    console.log("📄 Filas antes de añadir:", sheet.rowCount);
    const prevRows = sheet.getSheetValues().slice(1);
    console.log("📄 Contenido antes:", prevRows);

  } catch (err) {
    console.log("⚠ Archivo NO encontrado, creando nuevo:", err.code);

    sheet = workbook.addWorksheet('Fichajes');
    ensureColumns(sheet);

    console.log("📄 Hoja nueva creada (solo cabeceras).");
  }

  const fechaHora = now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
  console.log("➕ Añadiendo fila:", fichaje.type, fechaHora);

  // ahora sí, con las columnas con key definidas, esto rellenará bien la fila
  sheet.addRow({
    type: fichaje.type,
    date: fechaHora,
  });

  console.log("📄 Filas después de añadir:", sheet.rowCount);
  const newRows = sheet.getSheetValues().slice(1);
  console.log("📄 Contenido después:", newRows);

  const buffer = await workbook.xlsx.writeBuffer();

  console.log("⬆ Subiendo archivo a S3...");
  await s3
    .upload({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    .promise();

  console.log("✔ Excel subido correctamente");
}




module.exports = router;
