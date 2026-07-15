'use client';

/**
 * Admin User-Verwaltung
 *
 * User-Liste mit Rollen-Management + Badge-Vergabe (v2.27, ADR-005 Phase 1).
 * - Rolle über Inline-Select aenderbar (Admin behält gelben Text-Akzent)
 * - Badges via "Manage Badges"-Modal (Toggle-Liste aller bekannten Typen)
 *
 * Obsidian-Polish: AdminPageHeader + AdminCard, Mutations-Feedback via Toast,
 * Role-Select über adminSelectClass statt Roh-Tailwind-Farbflächen.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Loader2,
  Bot,
  Award,
  X,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLES, isBotUser } from '@/lib/constants';
import { BADGE_TYPES_LIST, type BadgeType } from '@/lib/badges';
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  adminSelectClass,
} from '@/components/admin/ui';
import { useToast } from '@/components/providers/ToastProvider';

interface BadgeData {
  type: string;
  grantedAt: string;
}

interface UserData {
  id: string;
  username: string;
  email: string;
  role: string;
  displayName: string | null;
  isActive: boolean;
  createdAt: string;
  badges: BadgeData[];
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [manageBadgesUserId, setManageBadgesUserId] = useState<string | null>(null);
  const [badgeBusy, setBadgeBusy] = useState<string | null>(null);
  const { toast } = useToast();

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      const json = await res.json();
      if (json.success) {
        setUsers(json.data || []);
      } else {
        toast({ type: 'error', message: json.error || 'Failed to load users.' });
      }
    } catch (err) {
      console.error('Users laden Fehler:', err);
      toast({ type: 'error', message: 'Failed to load users.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Rolle ändern
  const updateRole = useCallback(async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ type: 'success', message: 'Role updated.' });
        loadUsers();
      } else {
        toast({ type: 'error', message: json.error || 'Failed to update role.' });
      }
    } catch (err) {
      console.error('Rollen-Update Fehler:', err);
      toast({ type: 'error', message: 'Failed to update role.' });
    }
  }, [loadUsers, toast]);

  // Badge togglen — POST grant / DELETE revoke
  const toggleBadge = useCallback(async (userId: string, type: BadgeType, currentlyHas: boolean) => {
    setBadgeBusy(`${userId}:${type}`);
    try {
      const res = await fetch(`/api/admin/users/${userId}/badges`, {
        method: currentlyHas ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const json = await res.json();
      if (json.success) {
        toast({
          type: 'success',
          message: currentlyHas ? 'Badge revoked.' : 'Badge granted.',
        });
        loadUsers();
      } else {
        toast({ type: 'error', message: json.error || 'Failed to update badge.' });
      }
    } catch (err) {
      console.error('Badge-Toggle Fehler:', err);
      toast({ type: 'error', message: 'Failed to update badge.' });
    } finally {
      setBadgeBusy(null);
    }
  }, [loadUsers, toast]);

  const manageBadgesUser = users.find((u) => u.id === manageBadgesUserId) ?? null;

  return (
    <div>
      <AdminPageHeader
        kickerTag="/U/"
        kicker="WOLFPACK ROSTER"
        title="USERS"
        actions={
          <span className="font-mono text-xs text-muted">
            {users.length} {users.length === 1 ? 'user' : 'users'} registered
          </span>
        }
      />

      <AdminCard padding="none" className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-rasta-green" size={24} />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <Users size={36} className="mx-auto text-muted mb-3" />
            <p className="text-muted">No users registered yet.</p>
          </div>
        ) : (
          <>
            {/* Desktop-Table (>= md) */}
            <div className="hidden md:block divide-y divide-border">
              {/* Header */}
              <div className="grid grid-cols-[1fr_140px_1fr_100px_120px] gap-4 px-4 py-3 font-mono text-[11px] font-semibold text-muted uppercase tracking-[0.15em]">
                <span>User</span>
                <span>Role</span>
                <span>Badges</span>
                <span>Status</span>
                <span>Registered</span>
              </div>

              {/* Users */}
              {users.map((user) => (
                <div
                  key={user.id}
                  className="grid grid-cols-[1fr_140px_1fr_100px_120px] gap-4 px-4 py-3 items-center hover:bg-elevated/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {user.displayName || user.username}
                    </p>
                    <p className="text-xs text-muted truncate">{user.email}</p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <select
                      value={user.role}
                      onChange={(e) => updateRole(user.id, e.target.value)}
                      className={cn(
                        adminSelectClass,
                        'px-2 py-1 text-xs font-medium',
                        user.role === ROLES.ADMIN && 'text-rasta-yellow'
                      )}
                    >
                      <option value={ROLES.MITGLIED}>Member</option>
                      <option value={ROLES.KUENSTLER}>Artist</option>
                      <option value={ROLES.HELFER}>Helper</option>
                      <option value={ROLES.ADMIN}>Admin</option>
                    </select>
                    {isBotUser(user.username) && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold text-violet-400 bg-violet-400/10 rounded-full">
                        <Bot size={9} />
                        AI
                      </span>
                    )}
                  </div>

                  {/* Badge-Spalte */}
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {user.role === 'ADMIN' ? (
                      <span className="text-[10px] text-muted italic">all (admin)</span>
                    ) : user.badges.length === 0 ? (
                      <span className="text-[10px] text-muted/60">none</span>
                    ) : (
                      user.badges.map((b) => (
                        <span
                          key={b.type}
                          className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-rasta-green/10 text-rasta-green whitespace-nowrap"
                        >
                          {b.type}
                        </span>
                      ))
                    )}
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setManageBadgesUserId(user.id)}
                      title="Manage badges"
                    >
                      <Award size={12} />
                      manage
                    </AdminButton>
                  </div>

                  <div>
                    <span
                      className={cn(
                        'px-2 py-0.5 text-xs font-medium rounded-full',
                        user.isActive
                          ? 'bg-rasta-green/10 text-rasta-green'
                          : 'bg-rasta-red/10 text-rasta-red'
                      )}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <span className="text-sm text-muted">
                    {new Date(user.createdAt).toLocaleDateString('en-US')}
                  </span>
                </div>
              ))}
            </div>

            {/* Mobile-Cards (< md) */}
            <div className="md:hidden divide-y divide-border">
              {users.map((user) => (
                <div key={user.id} className="p-4 space-y-2 hover:bg-elevated/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">
                        {user.displayName || user.username}
                      </p>
                      <p className="text-xs text-muted truncate">{user.email}</p>
                    </div>
                    {isBotUser(user.username) && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold text-violet-400 bg-violet-400/10 rounded-full shrink-0">
                        <Bot size={9} />
                        AI
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={user.role}
                      onChange={(e) => updateRole(user.id, e.target.value)}
                      className={cn(
                        adminSelectClass,
                        'px-2 py-1 text-xs font-medium',
                        user.role === ROLES.ADMIN && 'text-rasta-yellow'
                      )}
                    >
                      <option value={ROLES.MITGLIED}>Member</option>
                      <option value={ROLES.KUENSTLER}>Artist</option>
                      <option value={ROLES.HELFER}>Helper</option>
                      <option value={ROLES.ADMIN}>Admin</option>
                    </select>

                    <span
                      className={cn(
                        'px-2 py-0.5 text-xs font-medium rounded-full',
                        user.isActive
                          ? 'bg-rasta-green/10 text-rasta-green'
                          : 'bg-rasta-red/10 text-rasta-red'
                      )}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>

                    <span className="text-xs text-muted ml-auto">
                      {new Date(user.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  {/* Badges (Mobile) */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {user.role === 'ADMIN' ? (
                      <span className="text-[10px] text-muted italic">all (admin)</span>
                    ) : user.badges.length === 0 ? (
                      <span className="text-[10px] text-muted/60">no badges</span>
                    ) : (
                      user.badges.map((b) => (
                        <span
                          key={b.type}
                          className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-rasta-green/10 text-rasta-green"
                        >
                          {b.type}
                        </span>
                      ))
                    )}
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setManageBadgesUserId(user.id)}
                      title="Manage badges"
                    >
                      <Award size={12} />
                      manage badges
                    </AdminButton>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </AdminCard>

      {/* Manage-Badges-Modal */}
      {manageBadgesUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setManageBadgesUserId(null)}
        >
          <AdminCard
            framed
            padding="none"
            className="w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="min-w-0">
                <p className="text-xs text-muted">Badges for</p>
                <p className="font-semibold truncate">
                  {manageBadgesUser.displayName || manageBadgesUser.username}
                </p>
              </div>
              <button
                onClick={() => setManageBadgesUserId(null)}
                className="p-1.5 text-muted hover:text-foreground rounded transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4">
              {manageBadgesUser.role === 'ADMIN' && (
                <div className="mb-3 p-2.5 rounded-lg bg-rasta-yellow/10 border border-rasta-yellow/30 text-xs text-rasta-yellow">
                  Admin role implicitly grants all badges. Explicit toggles below are stored anyway —
                  useful if the role is later demoted.
                </div>
              )}
              <div className="space-y-1.5">
                {BADGE_TYPES_LIST.map((type) => {
                  const has = manageBadgesUser.badges.some((b) => b.type === type);
                  const busy = badgeBusy === `${manageBadgesUser.id}:${type}`;
                  return (
                    <button
                      key={type}
                      disabled={busy}
                      onClick={() => toggleBadge(manageBadgesUser.id, type, has)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors cursor-pointer disabled:opacity-50',
                        has
                          ? 'border-rasta-green/40 bg-rasta-green/10 text-rasta-green'
                          : 'border-border bg-elevated/30 text-muted hover:border-rasta-green/30 hover:text-foreground'
                      )}
                    >
                      <span className="font-mono">{type}</span>
                      {busy ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : has ? (
                        <Check size={14} />
                      ) : (
                        <span className="text-[10px] uppercase tracking-wider">grant</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </AdminCard>
        </div>
      )}
    </div>
  );
}
