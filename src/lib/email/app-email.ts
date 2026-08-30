/**
 * Camada de E-mails Transacionais da Aplicação OptmaPay Sandbox
 * (Boas-vindas, Exclusão de Conta LGPD e Alertas de Retenção de 60 Dias)
 */
import { sendSmtpEmail } from './smtp-mailer';

export interface WelcomeEmailParams {
  to: string;
  fullName?: string;
}

export interface AccountDeletedEmailParams {
  to: string;
  fullName?: string;
  accountName?: string;
}

export interface RetentionWarningEmailParams {
  to: string;
  fullName?: string;
  daysRemaining: number;
  accountName: string;
}

export async function sendWelcomeEmail(params: WelcomeEmailParams) {
  const greeting = params.fullName ? `Olá, ${params.fullName}!` : 'Olá, Desenvolvedor!';
  
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background-color:#f8f6f2;font-family:'Segoe UI',sans-serif;color:#374151;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;">
        <tr><td align="center">
          <table width="100%" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr><td align="center" style="padding:28px 24px;background-color:#29324e;border-bottom:4px solid #19A999;">
              <img src="https://wertmoquxdrucdbobuie.supabase.co/storage/v1/object/public/images/optmapay-logo-tema-claro.png" width="220" style="display:block;margin:0 auto;">
              <div style="font-size:11px;font-weight:700;color:#19A999;letter-spacing:2px;margin-top:8px;">SANDBOX DEV BANK</div>
            </td></tr>
            <tr><td style="padding:36px 30px;">
              <h1 style="margin:0 0 16px;color:#29324e;font-size:22px;font-weight:800;">Bem-vindo ao OptmaPay Sandbox!</h1>
              <p style="margin:0 0 14px;font-size:14px;color:#475569;">${greeting}</p>
              <p style="margin:0 0 14px;font-size:14px;color:#475569;">Sua conta de operador foi <strong>ativada com sucesso</strong>. Agora você já pode criar contas digitais de teste, gerar cobranças Pix, emitir boletos e testar webhooks em tempo real.</p>
              <table align="center" style="margin:28px auto;">
                <tr><td align="center" bgcolor="#19A999" style="border-radius:10px;">
                  <a href="https://optmapay.optmaidea.com.br/dashboard" target="_blank" style="display:inline-block;padding:14px 28px;font-size:13px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:10px;background-color:#19A999;">Acessar o Internet Banking</a>
                </td></tr>
              </table>
            </td></tr>
            <tr><td align="center" style="background-color:#f1f5f9;padding:20px;color:#64748b;font-size:11px;">
              <div>OptmaPay Sandbox Dev Bank • © 2026 <a href="https://optmaidea.com.br" style="color:#19A999;text-decoration:none;font-weight:700;">OptmaIdea</a></div>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  return sendSmtpEmail({
    to: params.to,
    subject: 'Bem-vindo ao OptmaPay Sandbox Dev Bank',
    html,
  });
}

export async function sendAccountDeletedEmail(params: AccountDeletedEmailParams) {
  const greeting = params.fullName ? `Olá, ${params.fullName}!` : 'Olá!';
  const accountLine = params.accountName 
    ? `<p style="margin:0 0 14px;font-size:14px;color:#475569;">Conta sandbox encerrada: <strong>${params.accountName}</strong>.</p>`
    : '';

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background-color:#f8f6f2;font-family:'Segoe UI',sans-serif;color:#374151;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;">
        <tr><td align="center">
          <table width="100%" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr><td align="center" style="padding:28px 24px;background-color:#29324e;border-bottom:4px solid #DC2626;">
              <img src="https://wertmoquxdrucdbobuie.supabase.co/storage/v1/object/public/images/optmapay-logo-tema-claro.png" width="220" style="display:block;margin:0 auto;">
              <div style="font-size:11px;font-weight:700;color:#f87171;letter-spacing:2px;margin-top:8px;">CONFIRMAÇÃO DE EXCLUSÃO DE DADOS (LGPD)</div>
            </td></tr>
            <tr><td style="padding:36px 30px;">
              <h1 style="margin:0 0 16px;color:#29324e;font-size:22px;font-weight:800;">Conta Sandbox Encerrada</h1>
              <p style="margin:0 0 14px;font-size:14px;color:#475569;">${greeting}</p>
              ${accountLine}
              <p style="margin:0 0 14px;font-size:14px;color:#475569;">Confirmamos que a exclusão solicitada foi <strong>processada com sucesso</strong> em nosso banco de dados. Todos os registros vinculados foram definitivamente expurgados.</p>
            </td></tr>
            <tr><td align="center" style="background-color:#f1f5f9;padding:20px;color:#64748b;font-size:11px;">
              <div>OptmaPay Sandbox Dev Bank • © 2026 <a href="https://optmaidea.com.br" style="color:#19A999;text-decoration:none;font-weight:700;">OptmaIdea</a></div>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  return sendSmtpEmail({
    to: params.to,
    subject: 'Confirmação de exclusão da sua conta OptmaPay Sandbox',
    html,
  });
}
