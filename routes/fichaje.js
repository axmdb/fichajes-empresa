// routes/fichaje.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Fichaje = require('../models/Fichaje');
const ExcelJS = require('exceljs');
const AWS = require('aws-sdk');
const PDFDocument = require('pdfkit');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

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

function getMonthName(date) {
  const months = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];
  return months[date.getMonth()];
}

function parseFechaDDMMYYYY(fecha) {
  if (!fecha) return null;

  const [dia, mes, anio] = String(fecha).split('/').map(Number);
  if (!dia || !mes || !anio) return null;

  return new Date(anio, mes - 1, dia);
}

function getNombreAlmacen(id) {
  const almacenes = {
    almacen1: 'FABRICA TARRAGONA',
    almacen2: 'FABRICA REUS',
    almacen3: 'EMPANADAS ALMA TARRAGONA',
    almacen4: 'EMPANADAS ALMA SALOU',
    almacen5: 'ALMACEN TARRAGONA',
    almacen6: 'ALMACEN ANDORRA',
  };

  return almacenes[id] || id;
}

async function obtenerRegistrosInspeccion({ almacenId, trabajador, desde, hasta }) {
  const match = {};

  if (almacenId) {
    match.almacenId = almacenId;
  }

  const desdeDate = parseFechaDDMMYYYY(desde);
  const hastaDate = parseFechaDDMMYYYY(hasta);

  if (desdeDate || hastaDate) {
    match.date = {};

    if (desdeDate) {
      desdeDate.setHours(0, 0, 0, 0);
      match.date.$gte = desdeDate;
    }

    if (hastaDate) {
      hastaDate.setHours(23, 59, 59, 999);
      match.date.$lte = hastaDate;
    }
  }

  const fichajes = await Fichaje.aggregate([
    { $match: match },
    { $sort: { date: 1 } },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'usuario'
      }
    },
    {
      $unwind: {
        path: '$usuario',
        preserveNullAndEmptyArrays: true
      }
    }
  ]);

  const grupos = {};

  for (const f of fichajes) {
    const fechaLocal = new Date(f.date).toLocaleDateString('es-ES', {
      timeZone: 'Europe/Madrid',
    });

    const horaLocal = new Date(f.date).toLocaleTimeString('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
    });

    const nombreTrabajador = f.usuario?.name || `Usuario eliminado (${f.user})`;
    const pin = f.usuario?.pin || '';
    const key = `${f.almacenId}-${f.user}-${fechaLocal}`;

    if (!grupos[key]) {
      grupos[key] = {
        id: key,
        trabajador: nombreTrabajador,
        pin,
        fecha: fechaLocal,
        entrada: '',
        desayunoInicio: '',
        desayunoFin: '',
        salida: '',
        almacenId: f.almacenId,
      };
    }

    if (f.type === 'entrada' && !grupos[key].entrada) {
      grupos[key].entrada = horaLocal;
    }

    if (f.type === 'desayuno_inicio' && !grupos[key].desayunoInicio) {
      grupos[key].desayunoInicio = horaLocal;
    }

    if (f.type === 'desayuno_fin' && !grupos[key].desayunoFin) {
      grupos[key].desayunoFin = horaLocal;
    }

    if (f.type === 'salida') {
      grupos[key].salida = horaLocal;
    }
  }

  let registros = Object.values(grupos);

  if (trabajador) {
    const texto = String(trabajador).trim().toLowerCase();

    registros = registros.filter(r =>
      r.trabajador.toLowerCase().includes(texto) ||
      r.pin.toLowerCase().includes(texto)
    );
  }

  registros.sort((a, b) => {
    const fechaA = parseFechaDDMMYYYY(a.fecha);
    const fechaB = parseFechaDDMMYYYY(b.fecha);
    return fechaB - fechaA;
  });

  return {
    totalFichajes: fichajes.length,
    totalRegistros: registros.length,
    registros,
  };
}

/* -----------------------------------
 * POST /api/fichaje
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
      return res.status(404).json({ message: 'PIN incorrecto o no pertenece a este almacén' });
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

    const registro = new Fichaje({
      user: user._id,
      almacenId,
      type,
      date: new Date(),
    });

    await registro.save();

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
 * GET /api/fichaje/estado
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
 * Excel mensual por usuario
 * -----------------------------------*/
async function generateUserExcel(user, fichaje) {
  const now = new Date(fichaje.date);
  const yyyy = now.getFullYear();

  const mesNombre = getMonthName(now);
  const carpetaMes = `${mesNombre}_${yyyy}`;

  const userFolder = `${clean(user.name)}_${user.pin}`;
  const fileName = `fichajes_${carpetaMes}_${userFolder}.xlsx`;
  const key = `${user.almacenId}/${userFolder}/${carpetaMes}/${fileName}`;

  const workbook = new ExcelJS.Workbook();
  let sheet;

  function ensureColumns(ws) {
    if (!ws.columns || ws.columns.length === 0) {
      ws.columns = [
        { header: 'Tipo', key: 'type', width: 20 },
        { header: 'Fecha y Hora', key: 'date', width: 30 },
      ];
    } else {
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
    const existing = await s3
      .getObject({ Bucket: process.env.AWS_BUCKET_NAME, Key: key })
      .promise();

    await workbook.xlsx.load(existing.Body);

    sheet = workbook.getWorksheet('Fichajes');
    if (!sheet) {
      sheet = workbook.addWorksheet('Fichajes');
    }

    ensureColumns(sheet);

  } catch (err) {
    sheet = workbook.addWorksheet('Fichajes');
    ensureColumns(sheet);
  }

  const fechaHora = now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });

  sheet.addRow({
    type: fichaje.type,
    date: fechaHora,
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
}

/* -----------------------------------
 * GET /api/fichaje/inspeccion
 * -----------------------------------*/
router.get('/inspeccion', async (req, res) => {
  try {
    const { almacenId, trabajador, desde, hasta } = req.query;

    const resultado = await obtenerRegistrosInspeccion({
      almacenId,
      trabajador,
      desde,
      hasta,
    });

    return res.status(200).json({
      ok: true,
      ...resultado,
    });

  } catch (err) {
    console.error('Error en /api/fichaje/inspeccion:', err);
    return res.status(500).json({
      ok: false,
      message: 'Error obteniendo fichajes para inspección',
      error: err.message,
    });
  }
});

/* -----------------------------------
 * GET /api/fichaje/inspeccion/pdf
 * -----------------------------------*/
router.get('/inspeccion/pdf', async (req, res) => {
  try {
    const { token, almacenId, trabajador, desde, hasta } = req.query;

    if (token !== process.env.API_SECRET) {
      return res.status(401).send('No autorizado');
    }

    const resultado = await obtenerRegistrosInspeccion({
      almacenId,
      trabajador,
      desde,
      hasta,
    });

    const registros = resultado.registros;
    const nombreAlmacen = getNombreAlmacen(almacenId);
    const fileName = `fichajes_${clean(nombreAlmacen)}_${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 28,
      autoFirstPage: true,
    });

    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 28;
    const tableWidth = pageWidth - margin * 2;

    const columns = [
      { title: 'Trabajador', width: 160 },
      { title: 'PIN', width: 45 },
      { title: 'Fecha', width: 70 },
      { title: 'Entrada', width: 55 },
      { title: 'Desayuno inicio', width: 95 },
      { title: 'Desayuno fin', width: 85 },
      { title: 'Salida', width: 55 },
      { title: 'Almacén', width: tableWidth - 160 - 45 - 70 - 55 - 95 - 85 - 55 },
    ];

    let pageNumber = 1;
    function drawTopHeader() {
      doc.rect(0, 0, pageWidth, 78).fill('#0b4f8a');

      doc
        .fillColor('white')
        .font('Helvetica-Bold')
        .fontSize(22)
        .text('PANEL DE FICHAJES', margin, 20, {
          width: tableWidth,
          align: 'center',
        });

      doc
        .font('Helvetica')
        .fontSize(9)
        .text('Registro de entradas, salidas y desayunos', margin, 48, {
          width: tableWidth,
          align: 'center',
        });

      doc.fillColor('black');
      doc.y = 95;
    }

    function drawInfoBox() {
      const boxX = margin;
      const boxY = doc.y;
      const boxH = 58;

      doc
        .roundedRect(boxX, boxY, tableWidth, boxH, 8)
        .fillAndStroke('#f0f8ff', '#c8dff2');

      doc
        .fillColor('#222')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(`Almacén: ${nombreAlmacen}`, boxX + 14, boxY + 12);

      doc
        .font('Helvetica')
        .fontSize(9)
        .text(`Trabajador / PIN: ${trabajador || 'Todos'}`, boxX + 14, boxY + 30)
        .text(`Desde: ${desde || '-'}    Hasta: ${hasta || '-'}`, boxX + 330, boxY + 30);

      doc
        .roundedRect(boxX + tableWidth - 145, boxY + 14, 125, 30, 6)
        .fill('#0b4f8a');

      doc
        .fillColor('white')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(`${registros.length} registros`, boxX + tableWidth - 145, boxY + 23, {
          width: 125,
          align: 'center',
        });

      doc.fillColor('black');
      doc.y = boxY + boxH + 18;
    }

    let y;

    function drawTableHeader() {
      y = doc.y;
      let x = margin;

      doc
        .roundedRect(margin, y, tableWidth, 22, 4)
        .fill('#222');

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('white');

      for (const col of columns) {
        doc.text(col.title, x + 4, y + 7, {
          width: col.width - 8,
          align: 'left',
        });
        x += col.width;
      }

      y += 22;
      doc.y = y;
      doc.fillColor('black');
    }

    function drawPageFooter() {
      const footerY = pageHeight - 45;

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#777');

      doc.text(
        `Generado el ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`,
        margin,
        footerY,
        {
          width: tableWidth / 2,
          align: 'left',
          lineBreak: false,
        }
      );

      doc.text(
        `Página ${pageNumber}`,
        margin,
        footerY,
        {
          width: tableWidth,
          align: 'right',
          lineBreak: false,
        }
      );

      doc.fillColor('black');
    }

    function addNewPage() {
      drawPageFooter();

      doc.addPage();
      pageNumber += 1;

      drawTopHeader();
      drawInfoBox();
      drawTableHeader();
}

    function drawRow(row, index) {
      const rowHeight = 24;

      if (y + rowHeight > pageHeight - 65) {
        addNewPage();
      }

      let x = margin;
      const bg = index % 2 === 0 ? '#ffffff' : '#f7f7f7';

      doc.rect(margin, y, tableWidth, rowHeight).fill(bg);

      const values = [
        row.trabajador,
        row.pin || '-',
        row.fecha,
        row.entrada || '-',
        row.desayunoInicio || '-',
        row.desayunoFin || '-',
        row.salida || '-',
        getNombreAlmacen(row.almacenId),
      ];

      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#222');

      values.forEach((value, colIndex) => {
        doc
          .rect(x, y, columns[colIndex].width, rowHeight)
          .stroke('#dddddd');

        doc.text(String(value), x + 4, y + 7, {
          width: columns[colIndex].width - 8,
          height: rowHeight - 6,
          ellipsis: true,
        });

        x += columns[colIndex].width;
      });

      y += rowHeight;
      doc.y = y;
    }

    drawTopHeader();
    drawInfoBox();
    drawTableHeader();

    if (registros.length === 0) {
      doc
        .fontSize(12)
        .font('Helvetica')
        .fillColor('#444')
        .text('No hay registros con los filtros seleccionados.', margin, y + 20);
    } else {
      registros.forEach((row, index) => drawRow(row, index));
    }

    drawPageFooter();
    doc.end();

  } catch (err) {
    console.error('Error generando PDF de inspección:', err);
    return res.status(500).send('Error generando PDF');
  }
});

module.exports = router;