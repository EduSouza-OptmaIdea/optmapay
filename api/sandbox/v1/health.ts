export default function handler(req: any, res: any) {
  res.setHeader('x-optmapay-real-money', 'false');
  res.setHeader('x-optmapay-environment', 'sandbox');
  res.status(200).json({
    status: 'ok',
    service: 'optmapay-sandbox',
    realMoney: false,
    environment: 'sandbox',
    timestamp: new Date().toISOString(),
  });
}
