require("dotenv").config();
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const AWS = require("aws-sdk");

const User = require("./models/User");
const Fichaje = require("./models/Fichaje");

// ---------- AWS ----------
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// ---------- HELPERS ----------
function clean(str) {
  return String(str)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "_");
}

function getMonthName(date) {
  const months = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];
  return months[date.getMonth()];
}

function getMonthKey(date) {
  const d = new Date(date);
  return `${getMonthName(d)}_${d.getFullYear()}`;
}

// ---------- ARGS ----------
const args = process.argv.slice(2);
const almacenIndex = args.indexOf("--almacen");

if (almacenIndex === -1 || !args[almacenIndex + 1]) {
  console.error("❌ Uso: node rebuildAlmacen.js --almacen almacen3");
  process.exit(1);
}

const almacenId = args[almacenIndex + 1];

// ---------- MAIN ----------
(async () => {
  console.log("🔌 Conectando a MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Conectado a MongoDB");

  console.log(`\n📦 Reconstruyendo almacén: ${almacenId}`);

  const users = await User.find({ almacenId });
  console.log(`👤 Usuarios encontrados: ${users.length}`);

  for (const user of users) {
    console.log(`\n==============================`);
    console.log(`👤 ${user.name} (${user.pin})`);
    console.log(`==============================`);

    const fichajes = await Fichaje.find({ user: user._id, almacenId })
      .sort({ date: 1 });

    if (!fichajes.length) {
      console.log("⚠ Sin fichajes, saltando...");
      continue;
    }

    // Agrupar por MES_AÑO
    const porMes = {};
    fichajes.forEach(f => {
      const key = getMonthKey(f.date);
      if (!porMes[key]) porMes[key] = [];
      porMes[key].push(f);
    });

    const userFolder = `${clean(user.name)}_${user.pin}`;

    for (const mes of Object.keys(porMes)) {
      const registros = porMes[mes];

      console.log(`\n📅 Reconstruyendo ${mes} (${registros.length} fichajes)`);

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Fichajes");

      sheet.columns = [
        { header: "Tipo", key: "type", width: 20 },
        { header: "Fecha y Hora", key: "date", width: 30 },
      ];

      registros.forEach(f => {
        sheet.addRow({
          type: f.type,
          date: new Date(f.date).toLocaleString("es-ES", {
            timeZone: "Europe/Madrid",
          }),
        });
      });

      const fileName = `fichajes_${mes}_${userFolder}.xlsx`;
      const key = `${almacenId}/${userFolder}/${mes}/${fileName}`;

      console.log("⬆ Subiendo:", key);

      const buffer = await workbook.xlsx.writeBuffer();

      await s3.upload({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }).promise();

      console.log("✔ Excel generado");
    }
  }

  console.log("\n🎉 REBUILD COMPLETADO PARA TODO EL ALMACÉN");
  process.exit(0);
})();
