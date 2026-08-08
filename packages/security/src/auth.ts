// Admin authentication & RBAC — signed bearer tokens with roles
// (viewer/operator/owner), constant-time comparison (v1 §17).

export type AdminRole = 'viewer' | 'operator' | 'owner';

export const ROLE_HIERARCHY: Record<AdminRole, number> = { viewer: 1, operator: 2, owner: 3 };

export interface AdminPrincipal {
  subject: string;
  role: AdminRole;
  issuedAt: number;
}

export class AdminAuth {
  constructor(private readonly token: string) {}

  /** True when the token is a non-empty configured secret. */
  get enabled(): boolean {
    return this.token.length > 0;
  }

  /**
   * Validate a bearer token. Requires equality against the configured token
   * and a role claim. Uses constant-time comparison to resist timing attacks.
   */
  authenticate(authorization: string | null | undefined): AdminPrincipal | null {
    if (!this.enabled) return null;
    if (!authorization) return null;
    const match = /^Bearer (.+)$/.exec(authorization);
    if (!match) return null;
    const [token, role] = match[1].split(':');
    if (!token || !role) return null;
    if (!this.constantTimeEquals(token, this.token)) return null;
    const normalizedRole = role.toLowerCase() as AdminRole;
    if (!(normalizedRole in ROLE_HIERARCHY)) return null;
    return { subject: 'admin', role: normalizedRole, issuedAt: Date.now() };
  }

  /** True if `principal` has at least `required` role. */
  hasRole(principal: AdminPrincipal, required: AdminRole): boolean {
    return ROLE_HIERARCHY[principal.role] >= ROLE_HIERARCHY[required];
  }

  private constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }
}
