export default function handler(req: any, res: any) {
  res.setHeader('x-optmapay-real-money', 'false');
  res.setHeader('x-optmapay-environment', 'sandbox');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', realMoney: false, environment: 'sandbox' });
  }

  const { amount, description, orderId, type } = req.body || {};

  return res.status(201).json({
    success: true,
    transactionId: `tx_sandbox_${Date.now()}`,
    orderId: orderId || `ORD-${Date.now().toString().slice(-4)}`,
    amount: amount || 100.00,
    type: type || 'pix',
    status: 'completed',
    realMoney: false,
    environment: 'sandbox',
    timestamp: new Date().toISOString(),
  });
}
