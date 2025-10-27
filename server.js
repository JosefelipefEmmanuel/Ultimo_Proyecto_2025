const express = require("express");
const fs = require("fs");
const multer = require("multer");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");
const puppeteer = require("puppeteer");
const path = require("path");
const natural = require("natural");
const stopword = require("stopword");
const jschardet = require("jschardet");
const validator = require("validator");
const { dbCentral, dbAnalisis } = require("./database");
require("dotenv").config();
const nlp = require("compromise");
const cors = require("cors");

const app = express(); // 👈 DEBE IR ANTES DE usar app.use(cors())

// ✅ Permitir peticiones desde tu dominio
app.use(cors({
  origin: [
    "https://reconocimientoguatemala.org",
    "http://reconocimientoguatemala.org"
  ],
  methods: ["GET", "POST"],
  credentials: true
}));

// 🚀 Permitir cuerpos grandes (hasta 50 MB)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ============================
// 🧠 Servir recursos estáticos
// ============================
app.use("/models", express.static(path.join(__dirname, "public", "models")));
app.use(express.static(path.join(__dirname, "public")));

// ============================
// 🔁 Conexión a base local
// ============================
async function conectarAnalizadorDB() {
  try {
    const [rows] = await dbAnalisis.query("SELECT 1");
    console.log("✅ Conectado exitosamente a la base de datos local analizador_db.");
  } catch (err) {
    console.error("❌ Error conectando con analizador_db:", err.message);
    console.log("⏳ Reintentando conexión en 5 segundos...");
    setTimeout(conectarAnalizadorDB, 5000);
  }
}
conectarAnalizadorDB();

// ============================
// 🧠 Configuración FaceAPI
// ============================
const { Canvas, Image, ImageData, createCanvas, loadImage } = require("canvas");
const faceapi = require("face-api.js");
const Jimp = require("jimp");
const axios = require("axios");

// ⚙️ Inicializa entorno de Canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// 🧩 Fix automático para modelos FaceAPI con nombres personalizados
const modelRoot = path.join(__dirname, "public", "faceapi_models");

// Mapa de carpetas y nombres esperados
const modelMap = {
  ssd_mobilenetv1: "ssd_mobilenetv1_model-weights_manifest.json",
  face_landmark_68: "face_landmark_68_model-weights_manifest.json",
  face_recognition: "face_recognition_model-weights_manifest.json",
  tiny_face_detector: "tiny_face_detector_model-weights_manifest.json",
};

console.log("🛠️ Verificando existencia de manifests FaceAPI...");

for (const [folder, manifest] of Object.entries(modelMap)) {
  const folderPath = path.join(modelRoot, folder);
  const src = path.join(folderPath, "model.json");
  const alias = path.join(folderPath, manifest);

  try {
    if (fs.existsSync(src) && !fs.existsSync(alias)) {
      fs.copyFileSync(src, alias);
      console.log(`✅ Alias creado: ${manifest}`);
    } else if (!fs.existsSync(src)) {
      console.warn(`⚠️ Falta el archivo original: ${src}`);
    } else {
      console.log(`🟢 ${manifest} ya existe`);
    }
  } catch (err) {
    console.error(`❌ Error creando alias para ${manifest}:`, err.message);
  }
}

// 🚀 Cargar modelos FaceAPI modernos
(async () => {
  try {
    const modelRoot = path.join(__dirname, "public", "faceapi_models");
    console.log("🧠 Iniciando carga de modelos FaceAPI desde:", modelRoot);

    const modelPaths = {
      ssdMobilenetv1: path.join(modelRoot, "ssd_mobilenetv1"),
      faceLandmark68Net: path.join(modelRoot, "face_landmark_68"),
      faceRecognitionNet: path.join(modelRoot, "face_recognition"),
      tinyFaceDetector: path.join(modelRoot, "tiny_face_detector")
    };

    const loadModelSafe = async (net, dir) => {
      try {
        const files = fs.readdirSync(dir);
        const jsonFile = files.find(f => f.endsWith(".json"));
        const manifestFile = files.find(f => f.endsWith("_weights_manifest.json"));

        if (!jsonFile && !manifestFile) {
          console.warn(`⚠️ No se encontró manifest JSON en ${dir}`);
          return;
        }

        await net.loadFromDisk(dir);
        console.log(`✅ Modelo cargado correctamente: ${path.basename(dir)}`);
      } catch (err) {
        console.error(`❌ Error cargando ${path.basename(dir)}:`, err.message);
      }
    };

    await loadModelSafe(faceapi.nets.ssdMobilenetv1, modelPaths.ssdMobilenetv1);
    await loadModelSafe(faceapi.nets.faceLandmark68Net, modelPaths.faceLandmark68Net);
    await loadModelSafe(faceapi.nets.faceRecognitionNet, modelPaths.faceRecognitionNet);
    await loadModelSafe(faceapi.nets.tinyFaceDetector, modelPaths.tinyFaceDetector);

    console.log("✅ Todos los modelos FaceAPI cargados correctamente.");
  } catch (error) {
    console.error("❌ Error al cargar los modelos FaceAPI:", error.message);
    console.log("📁 Verifica la estructura:", path.join(__dirname, "public", "faceapi_models"));
  }
})();

// ============================
// ⚙️ Configuración de sesión
// ============================
const session = require("express-session");
app.use(session({
  secret: "clave_super_segura_umg",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// ============================
// ⚙️ Configuración de multer (subida de archivos)
// ============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// ============================
// 🏠 Página principal
// ============================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

// ============================
// 🔍 Carga de helpers comunes
// ============================
async function canvasLoadImage(filePath) {
  const buffer = fs.readFileSync(filePath);
  const img = await loadImage(buffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return canvas;
}

// ============================
// 🏠 Página principal
// ============================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});
// ============================
// 📩 Registrar usuario (fusionado: SP + rostro + QR + filtro robusto)
// ============================
app.post("/api/registrar", upload.single("photo"), async (req, res) => {
  try {
    const { nombre1, nombre2, nombre3, apellido1, apellido2, correo, telefono, cedula, filtro, password } = req.body;
    let fotoPath = null;

    // 📸 Guardar foto temporal
    if (req.file && req.file.path) {
      fotoPath = path.resolve(__dirname, req.file.path);
      console.log("📁 Foto subida correctamente:", fotoPath);
    }

    // 🔹 Datos base del usuario
    // 🌍 Generar URL del QR (local + pública)
    const codigoQR = `UMG-QR-${Math.floor(100000 + Math.random() * 900000)}`;
    const nombreCompleto = [nombre1, nombre2, nombre3, apellido1, apellido2].filter(Boolean).join(" ");
    const usuario = `${nombre1}.${apellido1}`.toLowerCase();
    const qrPath = `public/uploads/${codigoQR}.png`;

    // Detectar si se está ejecutando localmente o en producción
    const isLocal = process.env.NODE_ENV !== "production";
    const baseURL = isLocal
      ? `http://localhost:${port}`
      : `http://213.218.240.116:3000`;

    // Generar la URL final con el código
    const qrURL = `${baseURL}/analizador.html?codigo=${codigoQR}`;

    // Generar la imagen del QR
    await QRCode.toFile(qrPath, qrURL);
    const qrBuffer = fs.readFileSync(qrPath);

    // ============================
    // 🧠 SEGMENTAR Y APLICAR FILTRO
    // ============================
    let fotoFinalPath = fotoPath;
    let fotoFiltradaPath = null;
    let encodingFacial = null;

    if (fotoPath) {
      try {
        const imageBuffer = fs.readFileSync(fotoPath);
        const imageBase64 = imageBuffer.toString("base64");

        const response = await axios.post(
          "http://www.server.daossystem.pro:3405/Rostro/Segmentar",
          { RostroA: imageBase64 },
          { headers: { "Content-Type": "application/json" }, timeout: 10000 }
        );

        if (response.data?.rostro) {
          const imgData = Buffer.from(response.data.rostro, "base64");
          const segmentadoPath = path.resolve(__dirname, "public", "uploads", `${codigoQR}_segmentado.png`);
          fs.writeFileSync(segmentadoPath, imgData);
          fotoFinalPath = segmentadoPath;

          const filtroSeleccionado = (filtro || "ninguno").toLowerCase();
          console.log("🎨 Aplicando filtro:", filtroSeleccionado);

          const overlayDir = path.join(__dirname, "filtros");
          const overlayFileMap = {
            perro: "perro.png",
            lentes: "lentes.png",
            mapache: "mapache.png",
          };
          const overlayFile = overlayFileMap[filtroSeleccionado];
          if (overlayFile) {
            const overlayPath = path.join(overlayDir, overlayFile);
            if (fs.existsSync(overlayPath)) {
              const canvas = await canvasLoadImage(segmentadoPath);
              const detection = await faceapi.detectSingleFace(canvas).withFaceLandmarks();
              if (detection?.landmarks) {
                const jimpOverlay = await Jimp.read(overlayPath);
                const jimpImg = await Jimp.read(segmentadoPath);
                const jaw = detection.landmarks.getJawOutline();
                const leftEye = detection.landmarks.getLeftEye();
                const rightEye = detection.landmarks.getRightEye();

                const faceWidth = Math.abs(rightEye[3].x - leftEye[0].x) * 2.4;
                const faceHeight = Math.abs(jaw[8].y - leftEye[0].y) * 2.2;
                jimpOverlay.resize(faceWidth, faceHeight);

                const centerX = (leftEye[0].x + rightEye[3].x) / 2 - jimpOverlay.bitmap.width / 2;
                const centerY = leftEye[0].y - jimpOverlay.bitmap.height * 0.5;
                jimpImg.composite(jimpOverlay, centerX, centerY);

                fotoFiltradaPath = path.resolve(__dirname, "public", "uploads", `${codigoQR}_filtrado.png`);
                await jimpImg.writeAsync(fotoFiltradaPath);
                console.log("✅ Filtro aplicado correctamente.");
              }
            }
          }
        }
      } catch (err) {
        console.error("⚠️ Error procesando la foto:", err.message);
      }
    }

    // ============================
    // 🧠 GENERAR ENCODING FACIAL
    // ============================
    try {
      const canvas = await canvasLoadImage(fotoFinalPath);
      const detection = await faceapi.detectSingleFace(canvas).withFaceLandmarks().withFaceDescriptor();
      if (detection?.descriptor) {
        encodingFacial = JSON.stringify(Array.from(detection.descriptor));
        console.log("✅ Encoding facial generado correctamente.");
      }
    } catch (e) {
      console.warn("⚠️ No se generó encoding facial:", e.message);
    }

    // ============================
    // 💾 GUARDAR USUARIO (SP)
    // ============================
    const imgBase64 = fotoFinalPath ? fs.readFileSync(fotoFinalPath).toString("base64") : null;
    const sqlUsuario = `CALL sp_registrar_usuario(?, ?, ?, ?, ?, ?, ?, ?, @p_resultado, @p_mensaje);`;

    await dbCentral.query(sqlUsuario, [usuario, correo, nombreCompleto, password, telefono, imgBase64, 1, 1]);

    // ⏳ Esperar a que MySQL confirme el commit
    await new Promise(r => setTimeout(r, 800));

    const [rowsId] = await dbCentral.query(
      "SELECT id FROM usuarios WHERE email = ? OR usuario = ? ORDER BY id DESC LIMIT 1",
      [correo, usuario]
    );
    const usuarioId = rowsId?.[0]?.id;

    if (!usuarioId) {
      console.warn("⚠️ No se obtuvo ID del usuario tras SP.");
      return res.status(500).json({ success: false, message: "No se pudo obtener ID del usuario." });
    }

    // ============================
    // 💾 GUARDAR ENCODING FACIAL + QR
    // ============================
    if (encodingFacial) {
      await dbCentral.query(
        `INSERT INTO autenticacion_facial (usuario_id, encoding_facial, activo, fecha_creacion)
         VALUES (?, ?, 1, NOW())`,
        [usuarioId, encodingFacial]
      );
      console.log("✅ Registro facial guardado correctamente.");
    }

    const crypto = require("crypto");
    const qrHash = crypto.createHash("sha256").update(codigoQR).digest("hex");
    await dbCentral.query(
      `INSERT INTO codigos_qr (usuario_id, codigo_qr, qr_hash, activo)
       VALUES (?, ?, ?, 1)`,
      [usuarioId, codigoQR, qrHash]
    );
    console.log("✅ Código QR guardado correctamente.");

    // ============================
    // 📦 GENERAR PDF + CORREO + WHATSAPP
    // ============================
    generarPDFsYEnviarCorreo({
      nombre1, apellido1, nombreCompleto, correo, telefono, cedula, filtro,
      imgOriginalPath: fotoPath, imgFiltradaPath: fotoFiltradaPath,
      qrBuffer, codigoQR, qrPath
    }).catch(err => console.error("⚠️ Error enviando correo:", err));

    return res.json({ success: true, message: "✅ Usuario registrado correctamente con QR y rostro." });

  } catch (error) {
    console.error("❌ Error general en /api/registrar:", error);
    return res.status(500).json({ success: false, message: "Error general del servidor." });
  }
});

// ============================
// 🔐 LOGIN USUARIO (versión async/await para mysql2/promise)
// ============================
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

app.post("/api/login", async (req, res) => {
  try {
    const { correo, password, "g-recaptcha-response": captchaToken } = req.body;
    console.log("📥 Intentando login con:", correo);
    console.log("🧩 Token recibido del cliente:", captchaToken);

    if (!correo || !password)
      return res.status(400).json({ success: false, message: "⚠️ Faltan datos: correo o contraseña" });

    if (!captchaToken)
      return res.status(400).json({ success: false, message: "⚠️ Falta verificación reCAPTCHA." });

    // 🔒 Verificar reCAPTCHA con Google
    const verifyURL = "https://www.google.com/recaptcha/api/siteverify";
    const params = new URLSearchParams();
    params.append("secret", "6LfZ8_QrAAAAAL_K01TGewdpN42ps66QxwnL6-1u");
    params.append("response", captchaToken);

    const googleRes = await fetch(verifyURL, { method: "POST", body: params });
    const data = await googleRes.json();
    if (!data.success)
      return res.status(403).json({ success: false, message: "❌ reCAPTCHA inválido." });

    console.log("✅ reCAPTCHA validado correctamente. Ejecutando SP...");

    // ⚙️ Ejecutar el procedimiento almacenado
    const sql = `CALL sp_login_correo(?, ?, @p_resultado, @p_mensaje, @p_session_token);`;
    await dbCentral.query(sql, [correo, password]);
    console.log("📦 SP ejecutado correctamente. Consultando variables de salida...");

    const [rows] = await dbCentral.query(
      "SELECT @p_resultado AS resultado, @p_mensaje AS mensaje, @p_session_token AS token;"
    );
    console.log("📊 Resultado del SP:", rows);

    const { resultado, mensaje, token } = rows[0] || {};
    if (!resultado || resultado === 0)
      return res.status(401).json({ success: false, message: mensaje || "Credenciales inválidas." });

    // ✅ Obtener datos del usuario
    const [usuarios] = await dbCentral.query(
      "SELECT id, nombre_completo, email, telefono FROM usuarios WHERE email = ? LIMIT 1",
      [correo]
    );

    if (!usuarios.length)
      return res.json({ success: true, message: mensaje, token, usuario: { correo } });

    const user = usuarios[0];
    req.session.user = {
      id_usuario: user.id,
      nombre: user.nombre_completo,
      correo: user.email,
    };

    console.log(`✅ Sesión creada para ${user.nombre_completo} (${user.email})`);

    // 🧭 Responder al frontend
    res.json({ success: true, message: mensaje, token, usuario: user });

  } catch (error) {
    console.error("❌ Error general en /api/login:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor." });
  }
});

// ===============================
// 📡 LOGIN CON CÓDIGO QR
// ===============================

app.post("/api/login-qr", async (req, res) => {
  // 🔹 Acepta tanto 'codigo' como 'codigo_qr'
  const codigo = req.body.codigo || req.body.codigo_qr;
console.log("📦 Body recibido:", req.body);

  if (!codigo || codigo.trim() === "") {
    return res.status(400).json({ success: false, message: "Código QR vacío." });
  }

  try {
    const [rows] = await dbCentral.query(
      `SELECT u.id, u.nombre_completo, u.email, u.telefono
       FROM codigos_qr q
       INNER JOIN usuarios u ON q.usuario_id = u.id
       WHERE q.codigo_qr = ? AND q.activo = 1`,
      [codigo]
    );

    if (rows.length === 0)
      return res.status(404).json({ success: false, message: "QR inválido o inactivo." });

    const usuario = rows[0];
    console.log("✅ Login QR exitoso:", usuario.nombre_completo);

    res.json({
      success: true,
      message: "Inicio de sesión exitoso mediante QR",
      usuario
    });
  } catch (err) {
    console.error("Error en login QR:", err);
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
});

// ============================
// 🔍 Verificar carné QR (Base Centralizada)
// ============================
app.get("/verificar", (req, res) => {
  const { codigo } = req.query;
  if (!codigo) return res.send("<h3>⚠️ Código no proporcionado.</h3>");

  const sql = `
    SELECT u.*, q.codigo_qr
    FROM codigos_qr q
    INNER JOIN usuarios u ON q.usuario_id = u.id
    WHERE q.codigo_qr = ? AND q.activo = 1
  `;

  dbCentral.query(sql, [codigo], (err, results) => {
    if (err || results.length === 0)
      return res.send("<h3>❌ QR no registrado o inválido.</h3>");

    const user = results[0];
    res.send(`
      <div style="text-align:center;font-family:sans-serif;padding:30px;">
        <img src="https://upload.wikimedia.org/wikipedia/commons/3/39/Logo_UMG.png" width="90">
        <h2>Carné UMG — ${user.nombre_completo}</h2>
        <p><b>Código QR:</b> ${user.codigo_qr}</p>
        <p><b>Correo:</b> ${user.email}</p>
        <p><b>Teléfono:</b> ${user.telefono}</p>
        <p style="color:green;font-weight:bold;">Estado: ACTIVO ✅</p>
      </div>
    `);
  });
});


// ============================
// 👁️ LOGIN POR RECONOCIMIENTO FACIAL (Base Centralizada)
// ============================
app.post("/api/login-face", upload.single("rostro"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No se envió imagen." });
    }

    const uploadedImage = await canvasLoadImage(req.file.path);
    const detection = await faceapi
      .detectSingleFace(uploadedImage)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      fs.unlinkSync(req.file.path);
      return res
        .status(400)
        .json({ success: false, message: "No se detectó ningún rostro." });
    }

    // 🔹 Obtener todos los usuarios con rostro registrado
    const query = `
      SELECT a.usuario_id, a.imagen_referencia, a.encoding_facial, u.nombre_completo
      FROM autenticacion_facial a
      INNER JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.activo = 1
    `;

    // ✅ CONSULTA CON await (sin callback)
    const [results] = await dbCentral.query(query);

    let mejorCoincidencia = null;
    let menorDistancia = 1.0;

    for (const user of results) {
      try {
        const dbEncoding = JSON.parse(user.encoding_facial);
        const distancia = faceapi.euclideanDistance(
          detection.descriptor,
          Float32Array.from(dbEncoding)
        );
        if (distancia < menorDistancia) {
          menorDistancia = distancia;
          mejorCoincidencia = user;
        }
      } catch (e) {
        console.error("Error comparando con usuario:", user.usuario_id, e.message);
      }
    }

    fs.unlinkSync(req.file.path);

    if (mejorCoincidencia && menorDistancia < 0.85) {
      console.log(
        `✅ Rostro reconocido: ${mejorCoincidencia.nombre_completo} (distancia ${menorDistancia.toFixed(2)})`
      );

      // 🔹 Obtener datos completos del usuario (también con await)
      const [rows2] = await dbCentral.query(
        "SELECT id, nombre_completo, email, telefono FROM usuarios WHERE id = ? LIMIT 1",
        [mejorCoincidencia.usuario_id]
      );

      const user = rows2[0] || mejorCoincidencia;

      return res.json({
        success: true,
        message: `Bienvenido, ${user.nombre_completo}`,
        usuario: user,
      });
    } else {
      console.log("❌ Ninguna coincidencia facial encontrada.");
      return res
        .status(401)
        .json({ success: false, message: "Rostro no reconocido." });
    }
  } catch (error) {
    console.error("❌ Error general en /api/login-face:", error);
    res
      .status(500)
      .json({ success: false, message: "Error general del servidor." });
  }
});




// ============================
// 🧩 Helper para generar PDFs con Puppeteer
// ============================
async function renderHtmlToPdf(htmlString, outPath) {
  const puppeteer = require("puppeteer");
  const fs = require("fs");
  const path = require("path");

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log("🚀 Iniciando Puppeteer...");
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--no-job" // ✅ evita el error AssignProcessToJobObject
    ],
  });


  try {
    const page = await browser.newPage();
    await page.setContent(htmlString, { waitUntil: "load", timeout: 60000 });
    await page.emulateMediaType("screen");
    await page.pdf({
      path: outPath,
      format: "A4",
      printBackground: true,
      landscape: false,
      margin: { top: "0cm", bottom: "0cm", left: "0cm", right: "0cm" },
    });
    console.log(`✅ PDF generado correctamente: ${outPath}`);
  } catch (err) {
    console.error("❌ Error generando PDF:", err);
  } finally {
    await browser.close();
  }
}

console.log("📨 Iniciando generación de PDFs y envío de correo...");
async function generarPDFsYEnviarCorreo({
  nombre1,
  apellido1,
  nombreCompleto,
  correo,
  telefono,
  cedula,
  filtro,
  imgOriginalPath,      // ✅ ahora recibe las rutas
  imgFiltradaPath,      // ✅ con filtro (si existe)
  qrBuffer,
  codigoQR,
  qrPath
}) {
  console.log("🧾 Entrando a generarPDFsYEnviarCorreo (Puppeteer)...");
  try {
    // 1) Carga plantilla
    const htmlTemplate = fs.readFileSync(
      path.join(__dirname, "public", "plantilla_carnet.html"),
      "utf8"
    );

    // 2) Incrusta LOGO en base64 (evita rutas/OneDrive/timeouts)
    const logoFile = path.join(__dirname, "public", "img", "logo_umg.png");
    const logoBase64 = fs.readFileSync(logoFile).toString("base64");
    const logoData = `data:image/png;base64,${logoBase64}`;

    // 3) Datos comunes
    const qrData = `data:image/png;base64,${qrBuffer.toString("base64")}`;
    // Imagen original (sin filtro)
    const imgOriginalBase64 = fs.readFileSync(imgOriginalPath).toString("base64");
    const fotoDataNormal = `data:image/jpeg;base64,${imgOriginalBase64}`;

    // Imagen filtrada (si existe)
    let fotoDataFiltro = fotoDataNormal;
    if (imgFiltradaPath && fs.existsSync(imgFiltradaPath)) {
      const imgFiltradaBase64 = fs.readFileSync(imgFiltradaPath).toString("base64");
      fotoDataFiltro = `data:image/jpeg;base64,${imgFiltradaBase64}`;
    }


    const baseReplacements = (tpl, versionTexto, color) =>
      tpl
        .replace(/{{LOGO}}/g, logoData)
        .replace(/{{NOMBRE}}/g, nombreCompleto)
        .replace(/{{CEDULA}}/g, cedula || "N/A")
        .replace(/{{CORREO}}/g, correo)
        .replace(/{{TELEFONO}}/g, telefono)
        .replace(/{{CODIGO}}/g, codigoQR)
        .replace(/{{QR}}/g, qrData)
        .replace(/{{FILTRO}}/g, versionTexto)
        .replace(/{{BANDA_COLOR}}/g, color);


    // 4) HTML con filtro y sin filtro
    const htmlConFiltro = baseReplacements(htmlTemplate, "CON FILTRO", "#0069d9")
      .replace(/{{FOTO}}/g, fotoDataFiltro);

    const htmlSinFiltro = baseReplacements(htmlTemplate, "SIN FILTRO", "#6c757d")
      .replace(/{{FOTO}}/g, fotoDataNormal);



    // 5) Rutas de salida
    const pdfConFiltroPath = path.join(__dirname, "public", "uploads", `${codigoQR}_carnet.pdf`);
    const pdfSinFiltroPath = path.join(__dirname, "public", "uploads", `${codigoQR}_sin_filtro.pdf`);

    // 6) Render PDFs
    console.log("📄 Generando PDF con filtro...");
    await renderHtmlToPdf(htmlConFiltro, pdfConFiltroPath);
    console.log("✅ PDF con filtro generado:", pdfConFiltroPath);

    console.log("📄 Generando PDF sin filtro...");
    await renderHtmlToPdf(htmlSinFiltro, pdfSinFiltroPath);
    console.log("✅ PDF sin filtro generado:", pdfSinFiltroPath);

    // 7) Enviar correo
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // ✅ conexión SSL directa
      auth: {
        user: process.env.EMAIL_USER || "joseemmanuelfelipefranco@gmail.com",
        pass: process.env.EMAIL_PASS || "zziogvnmdeiqkthd", // ⚙️ usa .env si existe
      },
    });

    // Verificar conexión antes de enviar
    await transporter.verify();
    console.log("✅ Gmail listo para enviar correos");

    // Enviar correo UNA SOLA VEZ ✅
    await transporter.sendMail({
      from: `"UMG - Registro" <${process.env.EMAIL_USER || "joseemmanuelfelipefranco@gmail.com"}>`,
      to: correo,
      subject: "🎓 Carné Universitario UMG — Registro exitoso",
      html: `
    <h3>Bienvenido ${nombre1} ${apellido1}</h3>
    <p>Adjuntamos tus carnés (con y sin filtro).</p>
    <p>Escanea tu código QR para iniciar sesión o verificar tu identidad.</p>
  `,
      attachments: [
        { filename: "carnet_umg_con_filtro.pdf", path: pdfConFiltroPath },
        { filename: "carnet_umg_sin_filtro.pdf", path: pdfSinFiltroPath },
        { filename: "qr.png", path: qrPath },
      ],
    });

    console.log(`📧 Correo enviado correctamente a ${correo}`);

    // ✅ ✅ Aquí CIERRAS la función generarPDFsYEnviarCorreo
  } catch (error) {
    console.error("❌ Error al generar/enviar PDFs con Puppeteer:", error);
  }
} // ⬅️ ESTE cierre faltaba

// ===============================
// 🤖 ANALIZADOR LÉXICO MULTILENGUAJE (MODO FULL PRECISIÓN)
// ===============================
const readline = require("readline");

app.post("/analizar", upload.single("archivo"), async (req, res) => {
  try {
    const idioma = (req.body.idioma || "es").toLowerCase();
    const rutaArchivo = req.file.path;

    console.log(`📖 Analizando archivo grande: ${req.file.originalname}`);

    // ---------------------------------
    // 1. LECTURA EFICIENTE DEL ARCHIVO
    // ---------------------------------
    const stream = fs.createReadStream(rutaArchivo, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let texto = "";
    let lineas = 0;
    let bytesAcumulados = 0;
    const LIMITE_ANALISIS_COMPLETO = 20 * 1024 * 1024; // 20MB de texto en memoria

    for await (const linea of rl) {
      lineas++;
      const lineaConSalto = linea + "\n";
      texto += lineaConSalto;
      bytesAcumulados += Buffer.byteLength(lineaConSalto, "utf8");

      if (bytesAcumulados > LIMITE_ANALISIS_COMPLETO) {
        console.log("⚠️ Texto muy largo, se detiene acumulación completa en memoria (modo streaming).");
        break;
      }
    }

    console.log(`✅ Archivo leído (${lineas} líneas, ${bytesAcumulados} bytes usados en análisis)`);

    // ---------------------------------
    // 2. TOKENIZACIÓN SEGÚN IDIOMA
    // ---------------------------------
    let palabras;
    if (idioma === "zh") {
      // chino: cada caracter Han cuenta como "palabra"
      palabras = texto.match(/[\p{Script=Han}]/gu) || [];
    } else if (idioma === "ru") {
      // ruso: bloques cirílicos
      palabras = texto.match(/[\p{Script=Cyrillic}]+/gu) || [];
    } else if (idioma === "ar" || idioma.includes("árabe") || idioma.includes("arabe")) {
      palabras = texto.match(/[\p{Script=Arabic}]+/gu) || [];
      if (!palabras || palabras.length === 0) {
        const limpio = texto.replace(/[^\p{Script=Arabic}\s]/gu, "").trim();
        palabras = limpio.split(/\s+/).filter(Boolean);
      }
    } else {
      // idiomas tipo ES / EN / general alfabético latino
      palabras = texto.match(/\b[\wáéíóúüñÁÉÍÓÚÜÑ']+\b/g) || [];
    }

    const totalPalabras = palabras.length;
    const totalCaracteres = texto.length;

    // Frecuencia de palabras
    const frecuencia = {};
    for (const p of palabras) {
      const lower = p.toLowerCase();
      frecuencia[lower] = (frecuencia[lower] || 0) + 1;
    }

    const ordenarDesc = Object.entries(frecuencia).sort((a, b) => b[1] - a[1]);
    const topPalabras = ordenarDesc.slice(0, 10); // más frecuentes

    // palabras únicas aproximadas
    const palabrasUnicas = Object.keys(frecuencia).length;

    // oraciones aproximadas (para densidad léxica)
    const oraciones = texto.split(/[.!?¡¿؟。\n]+/).filter(s => s.trim().length > 0);
    const totalOraciones = oraciones.length;

    // densidad léxica aproximada = sustantivos+verbos / totalPalabras
    // (la vamos a calcular luego que tengamos sustantivos/verbos)

    // ---------------------------------
    // 3. EXTRACCIÓN DE ENTIDADES Y CLASES GRAMATICALES
    //    Modo inteligente:
    //    - Si el texto que cargamos en memoria es < ~5MB => usamos compromise (NLP completo)
    //    - Si es enorme => fallback heurístico (regex + reglas)
    // ---------------------------------
    const USAR_NLP_COMPLETO = texto.length <= 5 * 1024 * 1024;
    console.log(USAR_NLP_COMPLETO ? "🧠 NLP profundo activado" : "⚡ NLP heurístico (texto muy grande)");

    let pronombres = [];
    let personas = [];
    let lugares = [];
    let verbos = [];
    let sustantivos = [];

    if (USAR_NLP_COMPLETO) {
      const doc = nlp(texto);

      // pronombres detectados por compromise
      pronombres = doc.pronouns().out("array").map(p => p.trim());

      // verbos / sustantivos por compromise
      verbos = doc.verbs().out("array").map(v => v.toLowerCase().trim());
      sustantivos = doc.nouns().out("array").map(n => n.toLowerCase().trim());

      // Personas / lugares iniciales de compromise
      let personasRaw = doc.people().out("array");
      let lugaresRaw = doc.places().out("array");

      // Extra mejora: Nombres propios capitalizados estilo "José Arcadio Buendía"
      // y Lugares tipo "Ciudad de México", "Río Magdalena"
      const regexNombrePersona = /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2}\b/g;
      const regexLugarCompuesto = /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(de|del|la|los|las)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,3}\b/g;

      const candidatosCapitalizados = texto.match(regexNombrePersona) || [];
      const candidatosLugares = texto.match(regexLugarCompuesto) || [];

      // Combinar y limpiar PERSONAS
      personas = [
        ...personasRaw,
        ...candidatosCapitalizados
      ]
        .map(x => x.trim())
        .filter(x => x.length > 2)
        .filter(x => !/^(El|La|Los|Las|Un|Una|Para|Que|De|Del|Con|Sin|Y|En)$/i.test(x))
        .filter(x => /[A-ZÁÉÍÓÚÑ]/.test(x[0])) // debe empezar con mayúscula real
        .filter(x => x.split(" ").length <= 4) // evitar frases largas completas
        .slice(0, 200); // limitar ruido

      // Combinar y limpiar LUGARES
      lugares = [
        ...lugaresRaw,
        ...candidatosLugares
      ]
        .map(x => x.trim())
        .filter(x => x.length > 2)
        .filter(x => !/^(El|La|Los|Las|Un|Una|Para|Que|De|Del|Con|Sin|Y|En)$/i.test(x))
        .filter(x => /[A-ZÁÉÍÓÚÑ]/.test(x[0]))
        .slice(0, 200);

    } else {
      // ------------------------------
      // Fallback HEURÍSTICO (texto muy grande)
      // ------------------------------

      // pronombres por idioma
      const pronombres_es = ["yo","tú","usted","él","ella","nosotros","ellos","ellas","me","te","se","mi","tu","su","nos","os","ustedes","vosotros","vos"];
      const pronombres_en = ["i","you","he","she","it","we","they","me","him","her","us","them","my","your","our","their"];
      const pronombres_ru = ["я","ты","он","она","мы","вы","они","мне","тебе","ему","ей","нам","вам","им"];
      const pronombres_ar = ["أنا","أنت","هو","هي","نحن","هم"];
      const pronombres_zh = ["我","你","他","她","我们","你们","他们"];

      let basePronombres = pronombres_es;
      if (idioma === "en") basePronombres = pronombres_en;
      else if (idioma === "ru") basePronombres = pronombres_ru;
      else if (idioma === "ar") basePronombres = pronombres_ar;
      else if (idioma === "zh") basePronombres = pronombres_zh;

      // buscamos todos y normalizamos
      const regexPronombres = new RegExp(`\\b(${basePronombres.join("|")})\\b`, "gi");
      pronombres = (texto.match(regexPronombres) || []).map(p => p.trim());

      // personas heurística: “Nombre Apellido” con mayúsculas
      const regexNombrePersona = /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2}\b/g;
      personas = (texto.match(regexNombrePersona) || [])
        .filter(x => !/^(El|La|Los|Las|Un|Una|Para|Que|De|Del|Con|Sin|Y|En)$/i.test(x))
        .filter(x => x.split(" ").length <= 4)
        .slice(0, 200);

      // lugares heurístico: palabras comunes de ubicación y construcciones "Ciudad de X"
      const posiblesToponimos = [
        "Macondo","Guatemala","Ciudad de México","Bogotá","Madrid","Barcelona","Buenos Aires",
        "Colombia","México","Río Magdalena","Quito","Lima","Caracas","Sevilla","Cartagena","Paris","París"
      ];
      const regexLugarCompuesto = /\b(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(de|del|la|los|las)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,3})\b/g;

      const candidatosLugares1 = texto.match(regexLugarCompuesto) || [];
      const candidatosLugares2 = posiblesToponimos.filter(l => texto.includes(l));

      lugares = [...candidatosLugares1, ...candidatosLugares2]
        .map(x => x.trim())
        .filter(x => x.length > 2)
        .slice(0, 200);

      // verbos heurísticos en español: termina en ar/er/ir/ando/iendo/ado/ido
      if (idioma === "es") {
        const regexVerboEs = /\b([a-záéíóúñ]+(?:ar|er|ir|ando|iendo|ado|ido|aba|ía|aron|ieron|aré|eré|iré))\b/gi;
        verbos = (texto.match(regexVerboEs) || []).map(v => v.toLowerCase());
      }

      // sustantivos heurísticos en español: mayúscula inicial o terminaciones típicas
      if (idioma === "es") {
        const regexSustEsp = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|[a-záéíóúñ]+(?:ción|sión|dad|tad|ez|umbre|aje|or|ores|ora|oras|idad|idades))\b/g;
        sustantivos = (texto.match(regexSustEsp) || []).map(s => s.toLowerCase());
      }
    }

    // Limpiezas finales: quitar duplicados, basura rara tipo "—", comillas, etc.
    const limpiarLista = (arr) => [...new Set(
      arr
        .map(x => x.replace(/[«»"”“(),.;:¡!¿?\[\]]+/g, "").trim())
        .filter(x => x && x.length > 1)
        .filter(x => !/^[0-9]+$/.test(x))
        .slice(0, 300)
    )];

    pronombres  = limpiarLista(pronombres);
    personas    = limpiarLista(personas);
    lugares     = limpiarLista(lugares);
    verbos      = limpiarLista(verbos);
    sustantivos = limpiarLista(sustantivos);

    // densidad léxica aproximada
    const numLexicos = sustantivos.length + verbos.length;
    const densidadLexica = totalPalabras > 0
      ? (numLexicos / totalPalabras).toFixed(3)
      : "0";

    // ------------------------------
    // 5. RESPUESTA AL FRONT
    // ------------------------------
    res.json({
      success: true,
      idioma,
      totalPalabras,
      totalCaracteres,
      palabrasUnicas,
      totalOraciones,
      densidadLexica,
      topPalabras,        // [["de",8861],["la",6117],...]
      pronombres,         // ["yo","él","nosotros",...]
      personas,           // ["José Arcadio Buendía","Úrsula Iguarán",...]
      lugares,            // ["Macondo","Río Magdalena",...]
      verbos,             // ["recordar","había llevado","pensaba",...]
      sustantivos,        // ["aldea","río","hielo",...]
      texto               // <-- extracto analizado (hasta 20MB)
    });

    console.log("✅ Análisis completado con éxito.");

  } catch (err) {
    console.error("❌ Error al analizar:", err);
    res.status(500).json({
      success: false,
      error: "Error al analizar archivo."
    });
  }
});

// ============================
// 📩 Enviar PDF completo por correo al usuario
// ============================
app.post("/enviar-pdf", async (req, res) => {
  try {
    const { correo, nombre, resultado } = req.body;

    if (!correo || !resultado) {
      return res.status(400).json({ exito: false, error: "Faltan datos requeridos." });
    }

    console.log(`📧 Generando PDF completo para enviar a ${correo}`);

    // 🧾 Construir HTML completo del reporte
    const textoTruncado = resultado.texto.length > 3000 
      ? resultado.texto.slice(0, 3000) + "\n... [Texto truncado por tamaño]" 
      : resultado.texto;

    const html = `
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 30px; color: #222; }
          h2 { color: #004b8d; text-align: center; }
          h3 { color: #0069d9; margin-top: 20px; }
          ul { padding-left: 20px; }
          pre {
            background: #f5f5f5; 
            padding: 10px; 
            border-radius: 6px; 
            font-size: 12px;
            white-space: pre-wrap;
          }
          hr { border: 1px solid #ccc; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h2>📘 Reporte de Análisis Léxico Multilingüe</h2>
        <p><b>Usuario:</b> ${nombre}</p>
        <p><b>Correo:</b> ${correo}</p>
        <p><b>Idioma:</b> ${resultado.idioma}</p>
        <p><b>Total de palabras:</b> ${resultado.totalPalabras}</p>
        <p><b>Total de caracteres:</b> ${resultado.totalCaracteres}</p>
        <p><b>Palabras únicas:</b> ${resultado.palabrasUnicas}</p>
        <p><b>Oraciones detectadas:</b> ${resultado.totalOraciones}</p>
        <p><b>Densidad léxica:</b> ${resultado.densidadLexica}</p>

        <hr>
        <h3>🔝 Palabras más frecuentes</h3>
        <ul>
          ${resultado.topPalabras.map(([p, c]) => `<li><b>${p}</b> — ${c}</li>`).join("")}
        </ul>

        <h3>💬 Pronombres detectados</h3>
        <p>${resultado.pronombres?.join(", ") || "—"}</p>

        <h3>👤 Personas encontradas</h3>
        <p>${resultado.personas?.join(", ") || "—"}</p>

        <h3>📍 Lugares identificados</h3>
        <p>${resultado.lugares?.join(", ") || "—"}</p>

        <h3>🧩 Verbos</h3>
        <p>${resultado.verbos?.join(", ") || "—"}</p>

        <h3>📘 Sustantivos</h3>
        <p>${resultado.sustantivos?.join(", ") || "—"}</p>

        <hr>
        <h3>📜 Texto analizado (extracto)</h3>
        <pre>${textoTruncado}</pre>

        <hr>
        <p style="text-align:center; font-size:12px; color:#666;">
          © 2025 Universidad Mariano Gálvez — Proyecto Final Lenguajes Formales y Autómatas
        </p>
      </body>
      </html>
    `;

    // 📄 Generar PDF con Puppeteer
    const pdfPath = path.join(__dirname, "public", "uploads", `reporte_completo_${Date.now()}.pdf`);
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      margin: { top: "1.5cm", bottom: "1.5cm", left: "1.5cm", right: "1.5cm" },
    });
    await browser.close();

    console.log("✅ PDF completo generado:", pdfPath);

    // 📤 Configurar transporte de correo
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER || "joseemmanuelfelipefranco@gmail.com",
        pass: process.env.EMAIL_PASS || "zziogvnmdeiqkthd",
      },
    });

    // 📬 Enviar correo con PDF adjunto
    await transporter.sendMail({
      from: `"UMG Proyecto Final" <${process.env.EMAIL_USER || "joseemmanuelfelipefranco@gmail.com"}>`,
      to: correo,
      subject: "📄 Reporte Completo de Análisis Léxico Multilingüe",
      html: `
        <h3>Hola ${nombre},</h3>
        <p>Adjunto encontrarás tu <b>reporte completo</b> del análisis léxico multilingüe.</p>
        <p>Incluye todos los detalles detectados: idioma, frecuencias, pronombres, personas, lugares, verbos, sustantivos y texto procesado.</p>
        <p>Saludos,<br><b>Equipo UMG - Lenguajes Formales y Autómatas</b></p>
      `,
      attachments: [
        { filename: "reporte_analisis_completo.pdf", path: pdfPath }
      ],
    });

    console.log(`📨 Correo enviado correctamente a ${correo}`);
    res.json({ exito: true });

  } catch (err) {
    console.error("❌ Error en /enviar-pdf:", err);
    res.status(500).json({ exito: false, error: err.message });
  }
});

// ============================
// 🚀 Iniciar servidor
// ============================
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Servidor activo en http://localhost:${port}`));

// ============================
// 🧠 Helper para Canvas
// ============================
async function canvasLoadImage(filePath) {
  const buffer = fs.readFileSync(filePath);
  const img = await loadImage(buffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return canvas;
}