require("dotenv").config();
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const AWS = require("aws-sdk");
const User = require("./models/User");
const Fichaje = require("./models/Fichaje");

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

function formatDate(date) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

// ---------- ARGUMENTOS ----------
const args = require("minimist")(process.argv.slice(2));
const pin = String(args.pin).padStart(4, "0");

const almacenId = args.almacen;

if (!pin || !almacenId) {
  console.log("\n❌ Debes ejecutar así:");
  console.log("   node rebuildOneUser.js --pin 0066 --almacen almacen1\n");
  process.exit(1);
}

// ---------- MAIN ----------
(async () => {
  console.log("🔌 Conectando a MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Conectado a MongoDB");

  // Buscar usuario
  const user = await User.findOne({ pin, almacenId });
  if (!user) {
    console.log(`❌ Usuario PIN ${pin} no encontrado en ${almacenId}`);
    process.exit(1);
  }

  console.log(`\n👤 Usuario encontrado: ${user.name} (${user.pin})`);

  // Buscar TODOS los fichajes del usuario
  const fichajes = await Fichaje.find({ user: user._id, almacenId })
    .sort({ date: 1 });

  if (fichajes.length === 0) {
    console.log("⚠ Este usuario no tiene fichajes.");
    process.exit(0);
  }

  console.log(`📌 Total fichajes encontrados: ${fichajes.length}`);

  // Agrupar por días
  const porDia = {};

  fichajes.forEach(f => {
    const dia = formatDate(f.date);
    if (!porDia[dia]) porDia[dia] = [];
    porDia[dia].push(f);
  });

  console.log("\n📅 Días con fichajes:", Object.keys(porDia));

  // Procesar cada día
  for (const dia of Object.keys(porDia)) {
    const registrosDia = porDia[dia];
    console.log(`\n🛠️ Reconstruyendo Excel del día ${dia}: ${registrosDia.length} registros`);

    // Crear Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Fichajes");
    sheet.columns = [
      { header: "Tipo", key: "type", width: 20 },
      { header: "Fecha y Hora", key: "date", width: 30 },
    ];

    // Rellenar Excel con los fichajes reales
    registrosDia.forEach(f => {
      sheet.addRow({
        type: f.type,
        date: new Date(f.date).toLocaleString("es-ES", {
          timeZone: "Europe/Madrid",
        }),
      });
    });

    // Guardar en S3
    const userFolder = `${clean(user.name)}_${user.pin}`;
    const fileName = `fichajes_${dia}_${userFolder}.xlsx`;
    const key = `${almacenId}/${userFolder}/${dia}/${fileName}`;

    console.log("⬆ Subiendo a S3:", key);

    const buffer = await workbook.xlsx.writeBuffer();

    await s3.upload({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }).promise();

    console.log("✔ Excel subido correctamente.");
  }

  console.log("\n🎉 TODOS LOS EXCELS DE ESTE USUARIO HAN SIDO RECONSTRUIDOS PERFECTAMENTE.\n");
  process.exit(0);
})();
