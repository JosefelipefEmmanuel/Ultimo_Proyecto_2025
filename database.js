// ====================================================
// 💾 CONEXIONES A BASES DE DATOS
// ====================================================
const mysql = require("mysql2");

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

// 🧪 Verificación automática
console.log("🔍 Verificando conexiones...");

dbCentral.getConnection((err, conn) => {
  if (err) console.error("❌ Error con BD central:", err.message);
  else {
    console.log("✅ Conectado a la base central (sistema_autenticacion)");
    conn.release();
  }
});

dbAnalisis.getConnection((err, conn) => {
  if (err) console.error("❌ Error con BD local analizador_db:", err.message);
  else {
    console.log("✅ Conectado a la base local (analizador_db)");
    conn.release();
  }
});

module.exports = { dbCentral, dbAnalisis };
