import { describe, expect, it } from 'vitest';
import { canOpenSandboxWorkspace } from '../src/lib/sandboxModeAccess';

describe('OptmaPay single-app Learn + Dev access', () => {
  it('permits authenticated system owner to open both sandbox modes using only owned accounts', () => {
    expect(canOpenSandboxWorkspace({authenticated:true,isPlatformStaff:true,isSuperAdmin:true})).toBe(true);
  });
  it('preserves Learn and Dev for regular signed-in sandbox participants during private pilot', () => {
    expect(canOpenSandboxWorkspace({authenticated:true,isPlatformStaff:false,isSuperAdmin:false})).toBe(true);
  });
  it('does not allow staff operators to enter someone else’s banking workspace', () => {
    expect(canOpenSandboxWorkspace({authenticated:true,isPlatformStaff:true,isSuperAdmin:false})).toBe(false);
  });
  it('denies anonymous and unauthenticated sessions even with stale admin flags', () => {
    for (const isPlatformStaff of [false,true]) for (const isSuperAdmin of [false,true]) {
      expect(canOpenSandboxWorkspace({authenticated:false,isPlatformStaff,isSuperAdmin})).toBe(false);
    }
  });
});
