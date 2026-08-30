import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { to, subject, html, fromName, fromEmail } = req.body || {};

    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Campos "to", "subject" e "html" são obrigatórios.' });
    }

    const host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER || 'a18be8001@smtp-brevo.com';
    const pass = process.env.SMTP_PASS || '';
    const defaultFrom = process.env.SMTP_FROM_EMAIL || 'optmapay.auth@optmaidea.com.br';
    const defaultName = process.env.SMTP_FROM_NAME || 'OptmaPay Sandbox | Dev Bank';

    const senderEmail = fromEmail || defaultFrom;
    const senderName = fromName || defaultName;

    if (!pass) {
      console.warn('SMTP_PASS não configurada nas variáveis de ambiente da Vercel.');
      return res.status(200).json({
        success: false,
        warning: 'SMTP_PASS não configurada na Vercel. E-mail simulado.',
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to,
      subject,
      html,
    });

    return res.status(200).json({
      success: true,
      messageId: info.messageId,
    });
  } catch (error: any) {
    console.error('Erro ao enviar e-mail SMTP:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Falha interna ao disparar e-mail SMTP.',
    });
  }
}
