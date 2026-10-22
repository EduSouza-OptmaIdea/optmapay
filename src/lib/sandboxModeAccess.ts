/** UI routing only. Backend RLS/API ownership is the authorization boundary. */
export function canOpenSandboxWorkspace(input: {
  authenticated: boolean;
  isPlatformStaff: boolean;
  isSuperAdmin: boolean;
}): boolean {
  if (!input.authenticated) return false;
  // Ordinary staff manage the platform, not fictional customer accounts.
  // The RPC-verified system owner may access Learn and Dev with OWN test accounts.
  return !input.isPlatformStaff || input.isSuperAdmin;
}
