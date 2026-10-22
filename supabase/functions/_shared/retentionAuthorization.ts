/**
 * A scheduled retention purge is an internal privileged operation.
 * verify_jwt=true at the Edge gateway is NOT sufficient: an ordinary JWT
 * must never authorize invoking service_role administrative RPCs.
 */
export function isAuthorizedRetentionRequest(
  request: Request,
  internalSecret: string | undefined,
  serviceRoleKey: string | undefined,
): boolean {
  const providedInternal = request.headers.get('x-optmapay-internal-token');
  if (internalSecret && providedInternal && providedInternal === internalSecret) {
    return true;
  }

  const bearer = request.headers.get('authorization') || '';
  const parsed = bearer.match(/^Bearer ([^\s]+)$/i);
  return Boolean(serviceRoleKey && parsed && parsed[1] === serviceRoleKey);
}

export function isAllowedRetentionMethod(method: string): boolean {
  return method === 'POST';
}
