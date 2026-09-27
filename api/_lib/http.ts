import crypto from 'node:crypto';

export interface StandardErrorPayload {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  requestId: string;
  realMoney: false;
  environment: 'sandbox';
}

export interface StandardSuccessPayload<T = any> {
  success: true;
  data?: T;
  [key: string]: any;
}

export function setStandardSandboxHeaders(res: any, requestId?: string): string {
  const reqId = requestId || crypto.randomUUID();
  res.setHeader('x-optmapay-real-money', 'false');
  res.setHeader('x-optmapay-environment', 'sandbox');
  res.setHeader('x-optmapay-request-id', reqId);
  res.setHeader('Cache-Control', 'no-store');
  return reqId;
}

export function sendError(
  res: any,
  status: number,
  code: string,
  message: string,
  details?: any,
  requestId?: string
) {
  const reqId = setStandardSandboxHeaders(res, requestId);
  const payload: StandardErrorPayload = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    requestId: reqId,
    realMoney: false,
    environment: 'sandbox',
  };

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json');
  }
  return res.end(JSON.stringify(payload));
}

export function sendSuccess(
  res: any,
  status: number,
  data: Record<string, any>,
  requestId?: string
) {
  const reqId = setStandardSandboxHeaders(res, requestId);
  const payload = {
    ...data,
    requestId: reqId,
    realMoney: false,
    environment: 'sandbox',
  };

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json');
  }
  return res.end(JSON.stringify(payload));
}
