const nodemailer = require("nodemailer");
const env = require("./env");

async function sendEmail(message){
/*     let transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: env.email, // your email
          pass: env.email_password, // your email password
        },
      });
    
      await transporter.sendMail({
        from: '"Trevor Bot" <sarifluca.dev@gmail.com>', // sender address
        to: "sarifluca.dev@example.com", // list of receivers
        subject: message, // Subject line
        text: "wah waah", // plain text body
      });

      return; */
}

module.exports = sendEmail;
