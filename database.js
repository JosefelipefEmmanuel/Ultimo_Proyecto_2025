// ====================================================
// 💾 CONEXIONES A BASES DE DATOS (versión async/await limpia)
// ====================================================
const mysql = require("mysql2/promise");

// 🔹 Base central (usuarios, login facial, QR)
const dbCentral = mysql.createPool({
  host: "66.70.255.24",
  user: "Grupo4",
  password: "ProyectoAut25",
  database: "sistema_autenticacion",
  port: 3306,
  connectionLimit: 10,
  connectTimeout: 10000
});

// 🔹 Base local (analizador léxico)
const dbAnalisis = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "josesitolqls",
  database: "analizador_db",
  port: 3306,
  connectionLimit: 10,
  connectTimeout: 10000
});

// ====================================================
// 🧪 Verificación de conexiones (asíncrona y segura)
// ====================================================
(async () => {
  console.log("🔍 Verificando conexiones...");

  try {
    const connCentral = await dbCentral.getConnection();
    console.log("✅ Conectado a la base central (sistema_autenticacion)");
    connCentral.release();
  } catch (err) {
    console.error("❌ Error con BD central:", err.message);
  }

  try {
    const connLocal = await dbAnalisis.getConnection();
    console.log("✅ Conectado a la base local (analizador_db)");
    connLocal.release();
  } catch (err) {
    console.error("❌ Error con BD local analizador_db:", err.message);
  }
})();

// 📤 Exportar ambas conexiones
module.exports = { dbCentral, dbAnalisis };
