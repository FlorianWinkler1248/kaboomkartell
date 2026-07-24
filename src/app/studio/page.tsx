'use client'

/**
 * Studio-Dashboard (ADR-041 Welle 3)
 *
 * Überblick fürs Artist-Studio: Profil-Status (published/claimed), Track-Zähler
 * nach Submission-Status und die eigenen Tracks mit ECHTEN Zahlen (playCount/
 * auraCount — Vanity-Disziplin: nichts erfinden). Fetch-Muster wie
 * Admin-Missions-Cockpit (Envelope {success,data,error} + useToast).
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, ExternalLink, Music2, UserRound, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/providers/ToastProvider'
import { AdminPageHeader, AdminCard, AdminButton } from '@/components/admin/ui'
import {
  type StudioProfile,
  type StudioTrack,
  trackDisplayStatus,
  SUBMISSION_STATUS_COLORS,
} from '@/components/studio/studio-types'

// Reihenfolge der Zähler-Kacheln — DRAFT zuerst, dann der Review-Fluss
const STATUS_ORDER = ['DRAFT', 'PENDING', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'] as const

export default function StudioDashboardPage() {
  const { toast } = useToast()
  const [profile, setProfile] = useState<StudioProfile | null>(null)
  const [tracks, setTracks] = useState<StudioTrack[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    try {
      const [profileRes, tracksRes] = await Promise.all([
        fetch('/api/studio/profile'),
        fetch('/api/studio/tracks'),
      ])
      const profileJson = await profileRes.json()
      const tracksJson = await tracksRes.json()
      if (profileJson.success) {
        setProfile(profileJson.data.profile)
      } else {
        toast({ message: profileJson.error || 'Error loading profile.', type: 'error' })
      }
      if (tracksJson.success) {
        setTracks(tracksJson.data.tracks)
      } else {
        toast({ message: tracksJson.error || 'Error loading tracks.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Track-Zähler nach Anzeige-Status (DRAFT = keine Submission)
  const statusCounts = tracks.reduce<Record<string, number>>((acc, t) => {
    const s = trackDisplayStatus(t)
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})
  const liveCount = tracks.filter((t) => t.isPublic).length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        kickerTag="/S/"
        kicker="ARTIST STUDIO"
        title="DASHBOARD"
        description="Your profile, your tracks, your numbers — all in one place."
        actions={
          profile?.isPublished ? (
            <Link href={`/artists/${profile.slug}`} target="_blank">
              <AdminButton variant="secondary">
                <ExternalLink size={16} />
                View public profile
              </AdminButton>
            </Link>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-muted" size={32} />
        </div>
      ) : (
        <>
          {/* Profil-Status-Karte */}
          <AdminCard className="space-y-3">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <UserRound size={16} className="text-rasta-green" />
              {profile ? profile.name : 'Profile'}
            </div>
            {profile ? (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-block px-2 py-0.5 rounded font-mono text-[10px] tracking-wider uppercase',
                    profile.isPublished
                      ? 'bg-rasta-green/15 text-rasta-green'
                      : 'bg-white/10 text-muted'
                  )}
                >
                  {profile.isPublished ? 'Published' : 'Not published'}
                </span>
                <span
                  className={cn(
                    'inline-block px-2 py-0.5 rounded font-mono text-[10px] tracking-wider uppercase',
                    profile.claimedAt
                      ? 'bg-rasta-green/15 text-rasta-green'
                      : 'bg-amber-500/15 text-amber-400'
                  )}
                >
                  {profile.claimedAt ? 'Claimed' : 'Unclaimed'}
                </span>
                <span className="text-xs text-muted font-mono">/artists/{profile.slug}</span>
              </div>
            ) : (
              <p className="text-sm text-muted">
                No artist profile linked to your account yet. Ask Flow.
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/studio/profile">
                <AdminButton size="sm" variant="secondary">
                  <UserRound size={14} />
                  Edit profile
                </AdminButton>
              </Link>
              <Link href="/studio/upload">
                <AdminButton size="sm" variant="secondary">
                  <Upload size={14} />
                  Upload a track
                </AdminButton>
              </Link>
            </div>
          </AdminCard>

          {/* Track-Zähler nach Submission-Status + LIVE */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {STATUS_ORDER.map((status) => (
              <AdminCard key={status} padding="sm" className="text-center">
                <div className="font-display text-2xl text-foreground">
                  {statusCounts[status] ?? 0}
                </div>
                <div
                  className={cn(
                    'mt-1 inline-block px-2 py-0.5 rounded font-mono text-[10px] tracking-wider uppercase',
                    SUBMISSION_STATUS_COLORS[status] || 'bg-white/10 text-muted'
                  )}
                >
                  {status.replace('_', ' ')}
                </div>
              </AdminCard>
            ))}
            <AdminCard padding="sm" className="text-center">
              <div className="font-display text-2xl text-rasta-green">{liveCount}</div>
              <div className="mt-1 inline-block px-2 py-0.5 rounded font-mono text-[10px] tracking-wider uppercase bg-rasta-green/15 text-rasta-green">
                Live
              </div>
            </AdminCard>
          </div>

          {/* Track-Liste mit echten Zahlen */}
          {tracks.length === 0 ? (
            <AdminCard className="text-center py-10 text-muted text-sm">
              No tracks yet — head over to{' '}
              <Link href="/studio/upload" className="text-rasta-green hover:underline">
                Upload
              </Link>{' '}
              and submit your first one.
            </AdminCard>
          ) : (
            <AdminCard padding="none" className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-muted font-mono text-[10px] tracking-wider uppercase border-b border-border">
                    <th className="px-4 py-3">Track</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Plays</th>
                    <th className="px-4 py-3 text-right">Aura</th>
                  </tr>
                </thead>
                <tbody>
                  {tracks.map((track) => {
                    const status = trackDisplayStatus(track)
                    return (
                      <tr key={track.id} className="border-b border-border/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Music2 size={14} className="text-muted shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium text-foreground truncate">{track.title}</div>
                              <div className="text-xs text-muted">{track.genre}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={cn(
                                'inline-block px-2 py-0.5 rounded font-mono text-[10px] tracking-wider uppercase',
                                SUBMISSION_STATUS_COLORS[status] || 'bg-white/10 text-muted'
                              )}
                            >
                              {status.replace('_', ' ')}
                            </span>
                            {track.isPublic && (
                              <span className="inline-block px-2 py-0.5 rounded font-mono text-[10px] tracking-wider uppercase bg-rasta-green/15 text-rasta-green">
                                Live
                              </span>
                            )}
                          </div>
                        </td>
                        {/* ECHTE Zahlen — keine Vanity-Fakes */}
                        <td className="px-4 py-3 text-right font-mono text-xs text-secondary">
                          {track.playCount}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-secondary">
                          {track.auraCount}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </AdminCard>
          )}
        </>
      )}
    </div>
  )
}
