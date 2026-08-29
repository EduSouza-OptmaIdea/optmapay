import { supabase } from './supabase';
import { SandboxAccount, SandboxBoleto, SandboxCard, SandboxWebhookConfig } from '../types/sandbox';

export async function seedDemoAccounts(userId: string): Promise<SandboxAccount[]> {
  // Check if accounts already exist for this user
  const { data: existing } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId);

  if (existing && existing.length >= 2) {
    return existing as SandboxAccount[];
  }

  // 1. Merchant Account (OptmaIdea)
  const merchantAccount = {
    user_id: userId,
    name: 'OptmaIdea Tecnologia & Vendas LTDA',
    type: 'merchant',
    cpf_cnpj: '45.892.102/0001-90',
    phone: '(11) 98877-6655',
    balance: 15420.00,
    pix_key: 'vendas@optmaidea.com.br',
    agency: '0001',
    account_number: '100500-1',
    config: { default_merchant: true, webhook_retry_auto: true },
  };

  // 2. Customer Account 1 (PF)
  const customerPF = {
    user_id: userId,
    name: 'Carlos Eduardo Silva (Cliente Teste)',
    type: 'customer',
    cpf_cnpj: '123.456.789-00',
    phone: '(11) 97123-4567',
    balance: 3500.00,
    pix_key: 'carlos.silva.teste@optmapay.fake',
    agency: '0001',
    account_number: '200800-2',
    config: { default_customer: true },
  };

  // 3. Customer Account 2 (PJ)
  const customerPJ = {
    user_id: userId,
    name: 'Lojas Venda Rápida EIRELI (Pseudo Cliente PJ)',
    type: 'customer',
    cpf_cnpj: '98.765.432/0001-11',
    phone: '(21) 99888-1122',
    balance: 12800.00,
    pix_key: 'financeiro@vendarapida.fake',
    agency: '0001',
    account_number: '300900-3',
    config: {},
  };

  const { data: inserted, error } = await supabase
    .from('accounts')
    .insert([merchantAccount, customerPF, customerPJ])
    .select();

  if (error || !inserted) {
    console.error('Erro ao popular contas de teste:', error);
    return [];
  }

  const accounts = inserted as SandboxAccount[];
  const merchant = accounts.find((a) => a.type === 'merchant') || accounts[0];
  const customer1 = accounts.find((a) => a.type === 'customer') || accounts[1];

  // Populate Demo Boletos
  await supabase.from('boletos').insert([
    {
      user_id: userId,
      account_id: merchant.id,
      amount: 450.00,
      due_date: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
      barcode: '23793381286000000450000000012345678901234567',
      linha_digitavel: '23793.38128 60000.000450 00000.001234 5 678901234567',
      status: 'pending',
      payer_name: customer1.name,
      payer_cpf: customer1.cpf_cnpj,
      external_reference: 'DUP-2026-001',
    },
    {
      user_id: userId,
      account_id: merchant.id,
      amount: 1290.00,
      due_date: new Date(Date.now() + 86400000 * 15).toISOString().split('T')[0],
      barcode: '23793381286000001290000000098765432109876543',
      linha_digitavel: '23793.38128 60000.001290 00000.009876 5 432109876543',
      status: 'pending',
      payer_name: 'Lojas Venda Rápida EIRELI',
      payer_cpf: '98.765.432/0001-11',
      external_reference: 'ORDER-9942',
    },
  ]);

  // Populate Demo Virtual Cards
  await supabase.from('cartoes').insert([
    {
      user_id: userId,
      account_id: customer1.id,
      tipo: 'credito',
      cardholder_name: customer1.name.toUpperCase(),
      masked_number: '5412 **** **** 9012',
      validade: '12/29',
      cvv: '884',
      credit_limit: 5000.00,
      current_balance: 450.00,
      status: 'active',
    },
    {
      user_id: userId,
      account_id: customer1.id,
      tipo: 'debito',
      cardholder_name: customer1.name.toUpperCase(),
      masked_number: '4012 **** **** 3344',
      validade: '08/30',
      cvv: '123',
      credit_limit: 0.00,
      current_balance: 0.00,
      status: 'active',
    },
  ]);

  // Populate Demo Webhook Config
  await supabase.from('webhooks_config').insert([
    {
      user_id: userId,
      account_id: merchant.id,
      url: 'https://webhook.site/optmapay-test-demo',
      events: ['pix.paid', 'boleto.paid', 'payment.settled', 'order.paid'],
      secret: 'optmapay_sec_live_test_9921',
      active: true,
    },
  ]);

  // Populate Demo API Key
  await supabase.from('api_keys').insert([
    {
      user_id: userId,
      key_name: 'Chave de Testes E-Commerce Staging',
      api_key: 'sk_test_optmapay_live_981273918237',
      active: true,
    },
  ]);

  return accounts;
}

export async function resetSandboxScenario(userId: string): Promise<boolean> {
  try {
    await supabase.from('webhooks_log').delete().eq('user_id', userId);
    await supabase.from('transactions').delete().eq('user_id', userId);
    await supabase.from('boletos').delete().eq('user_id', userId);
    await supabase.from('cartoes').delete().eq('user_id', userId);
    await supabase.from('webhooks_config').delete().eq('user_id', userId);
    await supabase.from('api_keys').delete().eq('user_id', userId);
    await supabase.from('accounts').delete().eq('user_id', userId);

    await seedDemoAccounts(userId);
    return true;
  } catch (err) {
    console.error('Erro ao resetar dados de sandbox:', err);
    return false;
  }
}
