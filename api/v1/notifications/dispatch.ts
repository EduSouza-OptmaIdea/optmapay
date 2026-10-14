import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';
import { getSupabaseAdmin } from '../../../_lib/supabaseAdmin';

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));

async function sendTransactionalEmail(to: string, subject: string, body: string): Promise<void> {
  const sender = process.env.SMTP_FROM_EMAIL || 'optmapay.auth@optmaidea.com.br';
  const label = process.env.SMTP_FROM_NAME || 'OptmaPay Sandbox';
  const html = `<div style="font:15px/1.6 Arial,sans-serif;max-width:600px;margin:auto;color:#172b38">
    <h2>OptmaPay Sandbox</h2><p><strong>Comunicação sobre sua conta de simulação</strong></p>
    <h3>${escapeHtml(subject)}</h3>
    <p style="white-space:pre-wrap">${escapeHtml(body)}</p>
    <p style="background:#ecfdf5;padding:12px">Ambiente educacional. Nenhum dinheiro real é movimentado.</p>
    <p>Consulte também a Central de Mensagens da aplicação.</p></div>`;
  const brevo = process.env.BREVO_API_KEY || (process.env.SMTP_PASS?.startsWith('xkeysib-') ? process.env.SMTP_PASS : '');
  if (brevo) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email',{
      method:'POST',headers:{'Content-Type':'application/json','api-key':brevo},
      body:JSON.stringify({
        sender:{email:sender,name:label},to:[{email:to}],subject,htmlContent:html,
      }),
    });
    if(!response.ok) throw new Error('Falha no provedor de e-mail ('+response.status+').');
    return;
  }
  if(!process.env.SMTP_PASS) throw new Error('SMTP/Brevo ainda não configurado neste deployment.');
  const transporter=nodemailer.createTransport({
    host:process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port:Number(process.env.SMTP_PORT || '587'),
    secure:process.env.SMTP_PORT==='465',
    auth:{user:process.env.SMTP_USER || sender,pass:process.env.SMTP_PASS},
    connectionTimeout:12000,
  });
  await transporter.sendMail({from:`"${label}" <${sender}>`,to,subject,html});
}

export default async function handler(req: VercelRequest,res: VercelResponse) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  const authorization=String(req.headers.authorization || '');
  const token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
  const requestId=typeof req.body?.requestId==='string'?req.body.requestId:'';
  if(!token || !/^[0-9a-f-]{36}$/i.test(requestId)) return res.status(400).json({error:'Autenticação e pedido válidos são obrigatórios'});
  try {
    const admin=getSupabaseAdmin();
    const {data:auth,error:authError}=await admin.auth.getUser(token);
    if(authError || !auth.user) return res.status(401).json({error:'Sessão inválida'});
    const userId=auth.user.id;
    const {data:request,error:requestError}=await admin.from('platform_limit_requests')
      .select('id,user_id').eq('id',requestId).maybeSingle();
    if(requestError || !request) return res.status(404).json({error:'Solicitação não encontrada'});
    if(request.user_id!==userId) {
      const {data:operator}=await admin.from('platform_staff').select('role,enabled,permissions')
        .eq('user_id',userId).maybeSingle();
      const permitted=operator?.enabled && (
        (operator.role==='owner') ||
        (Array.isArray(operator.permissions) && (operator.permissions.includes('limits.manage') || operator.permissions.includes('messages.send')))
      );
      if(!permitted) return res.status(403).json({error:'Não autorizado'});
    }
    const {data:pending,error:listError}=await admin.from('platform_email_outbox')
      .select('id,recipient_user_id,subject,body,status,attempts')
      .eq('request_id',requestId)
      .in('status',['pending','failed'])
      .lt('attempts',5).order('created_at',{ascending:true}).limit(30);
    if(listError) throw listError;
    let delivered=0,failed=0;
    for(const item of pending || []) {
      const {data:claimed,error:claimError}=await admin.from('platform_email_outbox')
        .update({status:'sending',attempts:item.attempts+1,last_error:null})
        .eq('id',item.id).eq('status',item.status)
        .select('id').maybeSingle();
      if(claimError || !claimed) continue;
      try {
        if(!item.recipient_user_id) throw new Error('Destinatário ausente');
        const {data:receiver,error:recipientError}=await admin.auth.admin.getUserById(item.recipient_user_id);
        if(recipientError || !receiver.user?.email) throw new Error('E-mail do destinatário indisponível');
        await sendTransactionalEmail(receiver.user.email,item.subject,item.body);
        await admin.from('platform_email_outbox').update({status:'sent',sent_at:new Date().toISOString(),last_error:null}).eq('id',item.id);
        delivered++;
      }catch(e:unknown){
        await admin.from('platform_email_outbox').update({
          status:'failed',last_error:String(e instanceof Error?e.message:e).slice(0,500),
        }).eq('id',item.id);
        failed++;
      }
    }
    return res.status(200).json({processed:delivered+failed,sent:delivered,failed,
      note:failed?'Mensagens na aplicação já disponíveis; alguns e-mails aguardam reenvio.':undefined});
  }catch(e:unknown){
    console.error('Failed to dispatch platform notifications:',e);
    return res.status(500).json({error:'Não foi possível processar os e-mails pendentes'});
  }
}
