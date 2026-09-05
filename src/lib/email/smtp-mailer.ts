/**
 * Mailer Server-Side (Executado exclusivamente em ambiente Node / Edge Serverless)
 * Não roda diretamente no navegador do cliente por motivos de segurança.
 */

export interface SmtpEmailOptions {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  fromEmail?: string;
}

export async function sendSmtpEmail(options: SmtpEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const fromEmail = options.fromEmail || (import.meta.env?.VITE_SMTP_FROM_EMAIL as string) || 'optmapay.auth@optmaidea.com.br';
    const fromName = options.fromName || (import.meta.env?.VITE_SMTP_FROM_NAME as string) || 'OptmaPay Sandbox | Dev Bank';

    // Se estiver rodando via API endpoint backend
    const response = await fetch('/api/v1/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: options.to,
        subject: options.subject,
        html: options.html,
        fromEmail,
        fromName,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: err };
    }

    const data = await response.json();
    return { success: true, messageId: data.messageId };
  } catch (err: any) {
    return { success: false, error: err.message || 'Falha no envio do e-mail SMTP' };
  }
}
