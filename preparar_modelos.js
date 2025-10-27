// preparar_modelos.js - versión definitiva
const fs = require("fs");
const path = require("path");

const modelos = [
  "ssd_mobilenetv1",
  "face_landmark_68",
  "face_recognition",
  "tiny_face_detector"
];

const baseDir = path.join(__dirname, "public", "models");

for (const modelo of modelos) {
  const carpeta = path.join(baseDir, modelo);
  const manifest = path.join(baseDir, `${modelo}_model-weights_manifest.json`);
  const shard1 = path.join(baseDir, `${modelo}_model-shard1`);
  const shard2 = path.join(baseDir, `${modelo}_model-shard2`);
  const destino = path.join(carpeta, "model.json");

  // Crear la subcarpeta si no existe
  if (!fs.existsSync(carpeta)) {
    fs.mkdirSync(carpeta, { recursive: true });
    console.log("📁 Creada carpeta:", carpeta);
  }

  // Mover los archivos correspondientes
  if (fs.existsSync(manifest)) {
    fs.renameSync(manifest, path.join(carpeta, "model.json"));
    console.log(`✅ ${modelo}: manifest movido`);
  }

  if (fs.existsSync(shard1)) {
    fs.renameSync(shard1, path.join(carpeta, `${modelo}_model-shard1`));
    console.log(`✅ ${modelo}: shard1 movido`);
  }

  if (fs.existsSync(shard2)) {
    fs.renameSync(shard2, path.join(carpeta, `${modelo}_model-shard2`));
    console.log(`✅ ${modelo}: shard2 movido`);
  }
}

console.log("🎯 Modelos FaceAPI organizados correctamente.");
