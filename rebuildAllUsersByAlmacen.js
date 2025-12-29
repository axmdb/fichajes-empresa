require("dotenv").config();
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const AWS = require("aws-sdk");
const User = require("./models/User");
const Fichaje = require("./models/Fichaje");

// ---------- CONFIG ----------
const ALMACEN_ID = process.argv[2];
if (!ALMACEN_ID) {
  console.error("❌ Uso: node rebuildAllUsersByAlmacen.js <almacenId>");
  process.exit(1);
}

// ---------- AWS S3 ----------
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

function getMonthKey(date) {
  const d = new Date(date);
  const months = [
    'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
    'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'
  ];
  return `${months[d.getMonth()]}_${d.getFullYear()}`;
}

function formatDateTime(date) {
  return new Date(date).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid"
  });
}

// ---------- MAIN ----------
(async () => {
  console.log("🔌 Conectando a MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB conectado");

  console.log(`\n📋 Buscando usuarios del almacén: ${ALMACEN_ID}`);
  const users = await User.find({ almacenId: ALMACEN_ID });
  console.log(`✔ Usuarios encontrados: ${users.length}`);

  for (const user of users) {
    console.log(`\n👤 Usuario: ${user.name} (${user.pin})`);

    const fichajes = await Fichaje.find({ user: user._id })
      .sort({ date: 1 });

    if (fichajes.length === 0) {
      console.log("⚠ Sin fichajes, saltando");
      continue;
    }

    // Agrupar por MES
    const porMes = {};
    fichajes.forEach(f => {
      const mes = getMonthKey(f.date);
      if (!porMes[mes]) porMes[mes] = [];
      porMes[mes].push(f);
    });

    const userFolder = `${clean(user.name)}_${user.pin}`;

    for (const mes of Object.keys(porMes)) {
      console.log(`📊 Reconstruyendo Excel: ${mes}`);

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Fichajes");

      sheet.columns = [
        { header: "Tipo", key: "type", width: 20 },
        { header: "Fecha y Hora", key: "date", width: 30 },
      ];

      porMes[mes].forEach(f => {
        sheet.addRow({
          type: f.type,
          date: formatDateTime(f.date),
        });
      });

      const fileName = `fichajes_${mes}_${userFolder}.xlsx`;
      const key = `${ALMACEN_ID}/${userFolder}/${mes}/${fileName}`;

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

  console.log("\n🎉 REBUILD COMPLETO DEL ALMACÉN FINALIZADO\n");
  process.exit(0);
})();
