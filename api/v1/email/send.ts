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
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || process.env.BREVO_API_KEY || '';
    const defaultFrom = process.env.SMTP_FROM_EMAIL || 'optmapay.auth@optmaidea.com.br';
    const defaultName = process.env.SMTP_FROM_NAME || 'OptmaPay Sandbox | Dev Bank';

    const senderEmail = fromEmail || defaultFrom;
    const senderName = fromName || defaultName;

    if (!pass) {
      console.warn('SMTP_PASS/BREVO_API_KEY não configurada na Vercel.');
      return res.status(200).json({
        success: false,
        warning: 'SMTP_PASS não configurada na Vercel. E-mail simulado.',
      });
    }

    // Estratégia 1: Se a senha for uma chave de API do Brevo (xkeysib-...), envia via API HTTPS direta do Brevo (ultrarrápida e sem bloqueio de porta)
    if (pass.startsWith('xkeysib-') || process.env.BREVO_API_KEY) {
      try {
        const apiKey = pass.startsWith('xkeysib-') ? pass : process.env.BREVO_API_KEY || pass;
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
          },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: to }],
            subject,
            htmlContent: html,
          }),
        });

        if (brevoRes.ok) {
          const brevoData = await brevoRes.json();
          return res.status(200).json({
            success: true,
            provider: 'brevo-https-api',
            messageId: brevoData.messageId,
          });
        } else {
          const brevoErr = await brevoRes.text();
          console.warn('Falha na API HTTPS do Brevo, tentando SMTP Nodemailer...', brevoErr);
        }
      } catch (brevoEx) {
        console.warn('Exceção na chamada HTTPS do Brevo:', brevoEx);
      }
    }

    // Estratégia 2: Envio via Nodemailer SMTP Relay
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user: user || defaultFrom,
        pass,
      },
      connectionTimeout: 10000,
    });

    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to,
      subject,
      html,
    });

    return res.status(200).json({
      success: true,
      provider: 'nodemailer-smtp',
      messageId: info.messageId,
    });
  } catch (error: any) {
    console.error('Erro ao enviar e-mail:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Falha interna ao disparar e-mail.',
    });
  }
}
