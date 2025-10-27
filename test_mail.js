const nodemailer = require("nodemailer");
require("dotenv").config();

(async () => {
  try {
    console.log("Intentando login como:", process.env.EMAIL_USER);

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // SSL
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"UMG Registro" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // te lo mandas a ti mismo para probar
      subject: "Prueba de correo desde Node ✅",
      text: "Si lees esto, SMTP ya está funcionando 😎",
    });

    console.log("📧 ENVIADO! ID:", info.messageId);
  } catch (err) {
    console.error("❌ Error:", err);
  }
})();
