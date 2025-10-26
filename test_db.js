// ====================================================
// 🧪 PRUEBA DE CONEXIÓN A AMBAS BASES (Central + Local)
// ====================================================
const { dbCentral, dbAnalisis } = require("./database");

console.log("🔍 Verificando conexiones...");

// 🔹 Prueba con la base central (remota)
dbCentral.query("SELECT NOW() AS fecha", (err, rows) => {
  if (err) {
    console.error("❌ Error en la BD central:", err.message);
  } else {
    console.log("🕓 Central OK →", rows[0].fecha);
  }

  // 🔹 Prueba con la base de análisis (local)
  dbAnalisis.query("SELECT COUNT(*) AS total FROM analisis_texto", (err2, rows2) => {
    if (err2) {
      console.error("❌ Error en la BD analisis (local):", err2.message);
    } else {
      console.log("📊 Analisis OK → Total registros:", rows2[0].total);
    }
    process.exit(); // Finaliza el programa después de la prueba
  });
});
