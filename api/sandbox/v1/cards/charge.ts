export default function handler(req: any, res: any) {
  res.setHeader('x-optmapay-real-money', 'false');
  res.setHeader('x-optmapay-environment', 'sandbox');

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      realMoney: false,
      environment: 'sandbox',
    });
  }

  const {
    cardNumber,
    cardholderName,
    expirationDate,
    cvv,
    amount,
    installments = 1,
    tipo = 'credito',
    orderId,
    description,
  } = req.body || {};

  const cleanNumber = (cardNumber || '').replace(/\D/g, '');

  // Strict BIN validation
  if (!cleanNumber.startsWith('5899') && !cleanNumber.startsWith('5898')) {
    return res.status(400).json({
      error: 'Card declined',
      code: 'ERR_REAL_CARD_BLOCKED',
      message: 'Operação Recusada: Cartão real não permitido no Sandbox. Use apenas cartões fictícios OptmaPay com prefixo 5899 ou 5898.',
      realMoney: false,
      environment: 'sandbox',
    });
  }

  const numAmount = parseFloat(amount) || 100.0;
  const numInstallments = Math.max(1, Math.min(12, parseInt(installments, 10) || 1));

  // Fee calculation (standard plan)
  const feePercent = tipo === 'debito' ? 0.85 : (numInstallments === 1 ? 2.89 : 2.89 + (numInstallments * 0.65));
  const feeAmount = Math.round((numAmount * (feePercent / 100)) * 100) / 100;
  const netAmount = Math.round((numAmount - feeAmount) * 100) / 100;

  const nsu = String(Math.floor(10000000 + Math.random() * 90000000));
  const authorizationCode = `AUTH-${Math.floor(100000 + Math.random() * 900000)}`;
  const tid = `TID-${Date.now().toString().slice(-8)}`;

  return res.status(200).json({
    success: true,
    status: 'paid',
    message: 'Transação autorizada com sucesso no OptmaPay Sandbox!',
    data: {
      transactionId: `tx_card_${Date.now()}`,
      orderId: orderId || `ORD-${Date.now().toString().slice(-6)}`,
      amountGross: numAmount,
      feePercent,
      feeAmount,
      amountNet: netAmount,
      installments: numInstallments,
      tipo,
      cardMasked: `${cleanNumber.slice(0, 4)} **** **** ${cleanNumber.slice(-4)}`,
      cardBrand: 'OptmaCard',
      cardholderName: cardholderName || 'CLIENTE SANDBOX',
      authorizationCode,
      nsu,
      tid,
      realMoney: false,
      environment: 'sandbox',
      timestamp: new Date().toISOString(),
    },
  });
}
