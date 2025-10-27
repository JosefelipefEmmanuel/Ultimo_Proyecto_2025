// ============================================================
// 🛠️ Fix FaceAPI model manifests (.json) automatically
// ============================================================

const fs = require("fs");
const path = require("path");

const modelsDir = path.join(__dirname, "public", "models");
const manifests = [
  "tiny_face_detector_model-weights_manifest.json",
  "face_landmark_68_model-weights_manifest.json",
  "face_recognition_model-weights_manifest.json",
  "ssd_mobilenetv1_model-weights_manifest.json",
];

console.log("🔍 Corrigiendo manifests en:", modelsDir);

for (const manifestName of manifests) {
  const filePath = path.join(modelsDir, manifestName);

  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ No encontrado: ${manifestName}`);
    continue;
  }

  try {
    const rawData = fs.readFileSync(filePath, "utf8");
    let data = JSON.parse(rawData);

    // Normalizar formato (a veces JSON puede venir sin array principal)
    if (!Array.isArray(data)) data = [data];

    let modified = false;

    data.forEach((entry) => {
      if (entry.paths) {
        entry.paths = entry.paths.map((p) => {
          if (!p.endsWith(".bin")) {
            modified = true;
            return `${p}.bin`;
          }
          return p;
        });
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ Corregido: ${manifestName}`);
    } else {
      console.log(`🟢 Ya estaba correcto: ${manifestName}`);
    }
  } catch (err) {
    console.error(`❌ Error al procesar ${manifestName}:`, err.message);
  }
}

console.log("🎉 Revisión completa. Ahora ejecuta: npm start");
