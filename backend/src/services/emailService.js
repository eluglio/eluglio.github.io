const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false, // true para porta 465, false para outras
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Envia e-mail de convite com o link único
 */
async function sendInviteEmail(toEmail, roleGranted, inviteLink) {
  const roleNames = {
    publisher: 'Publicador',
    admin: 'Administrador',
    owner: 'Dono'
  };

  const mailOptions = {
    from: `"Ágora Vermelha" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Você foi convidado para o Ágora Vermelha!',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; rounded: 12px;">
        <h2 style="color: #dc2626;">Convite de Acesso - Ágora Vermelha</h2>
        <p>Olá!</p>
        <p>Você recebeu um convite para fazer parte da plataforma como <strong>${roleNames[roleGranted] || roleGranted}</strong>.</p>
        <p>Para aceitar o convite e concluir seu cadastro ou atualizar seu nível, acesse o link abaixo:</p>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${inviteLink}" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Aceitar Convite</a>
        </div>
        <p style="font-size: 12px; color: #666;">Se o botão não funcionar, copie e cole este link no seu navegador:<br><a href="${inviteLink}">${inviteLink}</a></p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ E-mail aceito pelo servidor SMTP:', info.response);
    // info.messageId contém o ID único gerado para essa mensagem
  } catch (error) {
    console.error('❌ Falha crítica no envio do e-mail:', error);
  }
}

module.exports = { sendInviteEmail };