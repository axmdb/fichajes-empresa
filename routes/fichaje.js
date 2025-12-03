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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_');
}

// Devuelve rango [inicioDia, finDia] para HOY
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
  const { pin, type, almacenId } = req.body;

  if (!pin || !type || !almacenId) {
    return res.status(400).json({ message: 'Faltan datos (pin, tipo o almacenId)' });
  }

  try {
    const user = await User.findOne({ pin, almacenId });
    if (!user) {
      return res
        .status(404)
        .json({ message: 'PIN incorrecto o no pertenece a este almacén' });
    }

    const { inicio, fin } = getDayRange();

    // Fichajes SOLO del día actual de este usuario y almacén
    const fichajes = await Fichaje.find({
      user: user._id,
      almacenId,
      date: { $gte: inicio, $lte: fin },
    }).sort({ date: 1 }); // ordenados de más antiguo a más reciente

    // Última entrada / salida del día
    const entradas = fichajes.filter(f => f.type === 'entrada');
    const salidas = fichajes.filter(f => f.type === 'salida');
    const desayunosInicio = fichajes.filter(f => f.type === 'desayuno_inicio');
    const desayunosFin = fichajes.filter(f => f.type === 'desayuno_fin');

    const ultimaEntrada = entradas[entradas.length - 1] || null;
    const ultimaSalida = salidas[salidas.length - 1] || null;
    const ultimoDesayunoInicio = desayunosInicio[desayunosInicio.length - 1] || null;
    const ultimoDesayunoFin = desayunosFin[desayunosFin.length - 1] || null;

    // --- VALIDACIONES DEL FLUJO ---

    if (type === 'entrada') {
      // No permitir dos entradas seguidas sin salida
      if (ultimaEntrada && (!ultimaSalida || ultimaEntrada.date > ultimaSalida.date)) {
        return res.status(400).json({
          message: 'Ya has fichado entrada y no has salido todavía.',
        });
      }
    }

    if (type === 'desayuno_inicio') {
      // Debe haber entrada activa (entrada sin salida posterior)
      const entradaActiva =
        ultimaEntrada && (!ultimaSalida || ultimaEntrada.date > ultimaSalida.date);

      if (!entradaActiva) {
        return res.status(400).json({
          message: 'Debes fichar entrada antes del desayuno.',
        });
      }

      // No permitir varios desayunos inicio sin cerrar el anterior
      const desayunoAbierto =
        ultimoDesayunoInicio &&
        (!ultimoDesayunoFin || ultimoDesayunoInicio.date > ultimoDesayunoFin.date);

      if (desayunoAbierto) {
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
        return res.status(400).json({
          message: 'Debes iniciar desayuno antes de finalizarlo.',
        });
      }
    }

    if (type === 'salida') {
      if (!ultimaEntrada) {
        return res.status(400).json({
          message: 'No puedes fichar salida sin haber fichado entrada.',
        });
      }

      // No permitir dos salidas seguidas
      if (ultimaSalida && ultimaSalida.date > ultimaEntrada.date) {
        return res.status(400).json({
          message: 'Ya fichaste salida después de la última entrada.',
        });
      }

      // No permitir salida si hay desayuno abierto
      const desayunoAbierto =
        ultimoDesayunoInicio &&
        (!ultimoDesayunoFin || ultimoDesayunoInicio.date > ultimoDesayunoFin.date);

      if (desayunoAbierto) {
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

    // Añadir al Excel del usuario para hoy
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
 *  GET /api/fichaje/estado
 * -----------------------------------*/
router.get('/estado', async (req, res) => {
  const { pin, almacenId } = req.query;

  if (!pin || !almacenId) {
    return res.status(400).json({ message: 'Faltan PIN o almacenId' });
  }

  try {
    const user = await User.findOne({ pin, almacenId });
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const { inicio, fin } = getDayRange();

    const fichajes = await Fichaje.find({
      user: user._id,
      almacenId,
      date: { $gte: inicio, $lte: fin },
    }).sort({ date: 1 });

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
  const now = new Date(fichaje.date);
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const fecha = `${dd}-${mm}-${yyyy}`;

  const userFolder = `${clean(user.name)}_${user.pin}`;
  const fileName = `fichajes_${fecha}_${userFolder}.xlsx`;
  const key = `${user.almacenId}/${userFolder}/${fecha}/${fileName}`;

  const workbook = new ExcelJS.Workbook();
  let sheet;

  try {
    // Intentar cargar el archivo existente
    const existing = await s3
      .getObject({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
      })
      .promise();

    await workbook.xlsx.load(existing.Body);
    sheet = workbook.getWorksheet('Fichajes');

    // Si NO existe la hoja
    if (!sheet) {
      sheet = workbook.addWorksheet('Fichajes');
      sheet.columns = [
        { header: 'Tipo', key: 'type', width: 20 },
        { header: 'Fecha y Hora', key: 'date', width: 30 },
      ];
    }
  } catch (err) {
    // Archivo NO existe → crear uno nuevo
    sheet = workbook.addWorksheet('Fichajes');
    sheet.columns = [
      { header: 'Tipo', key: 'type', width: 20 },
      { header: 'Fecha y Hora', key: 'date', width: 30 },
    ];
  }

  // AÑADIR LA NUEVA FILA SIN BORRAR LAS ANTERIORES
  sheet.addRow({
    type: fichaje.type,
    date: now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
  });

  const buffer = await workbook.xlsx.writeBuffer();

  await s3
    .upload({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    .promise();

   console.log("Excel cargado, filas existentes:", sheet.rowCount);
 
}


module.exports = router;
