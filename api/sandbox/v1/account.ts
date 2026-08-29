export default function handler(req: any, res: any) {
  res.setHeader('x-optmapay-real-money', 'false');
  res.setHeader('x-optmapay-environment', 'sandbox');

  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  if (!apiKey) {
    return res.status(401).json({
      error: 'Missing x-api-key header',
      realMoney: false,
      environment: 'sandbox',
    });
  }

  return res.status(200).json({
    account: {
      name: 'OptmaIdea Tecnologia & Vendas LTDA',
      type: 'merchant',
      cpf_cnpj: '45.892.102/0001-90',
      balance: 15420.00,
      pix_key: 'vendas@optmaidea.com.br',
      agency: '0001',
      account_number: '100500-1',
    },
    realMoney: false,
    environment: 'sandbox',
  });
}
