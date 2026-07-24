/**
 * Submission-Lifecycle — Review-Queue der Studio-Einreichungen (ADR-041).
 *
 * Pure Transition-Map, client-safe (kein prisma) — die UI importiert die
 * Status-Konstanten, die Routen die Übergangs-Prüfung. Publish bleibt IMMER
 * bei Flow: APPROVE (+publish) ist die einzige Route zu isPublic=true.
 *
 *   PENDING ──APPROVE──────────→ APPROVED   (terminal)
 *   PENDING ──REJECT───────────→ REJECTED   (terminal)
 *   PENDING ──REQUEST_CHANGES──→ CHANGES_REQUESTED
 *   CHANGES_REQUESTED ──(Artist-Re-Submit/PUT)──→ PENDING
 *   CHANGES_REQUESTED ──APPROVE/REJECT─────→ APPROVED/REJECTED
 */

export const SUBMISSION_STATUS = {
  PENDING: 'PENDING',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUS)[keyof typeof SUBMISSION_STATUS];

export const REVIEW_ACTIONS = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  REQUEST_CHANGES: 'REQUEST_CHANGES',
} as const;

export type ReviewAction = (typeof REVIEW_ACTIONS)[keyof typeof REVIEW_ACTIONS];

const TRANSITIONS: Record<SubmissionStatus, Partial<Record<ReviewAction, SubmissionStatus>>> = {
  PENDING: {
    APPROVE: 'APPROVED',
    REJECT: 'REJECTED',
    REQUEST_CHANGES: 'CHANGES_REQUESTED',
  },
  CHANGES_REQUESTED: {
    APPROVE: 'APPROVED',
    REJECT: 'REJECTED',
  },
  APPROVED: {},
  REJECTED: {},
};

/** Ziel-Status für eine Review-Aktion — null wenn der Übergang nicht erlaubt ist. */
export function reviewTransition(
  current: string,
  action: ReviewAction
): SubmissionStatus | null {
  const map = TRANSITIONS[current as SubmissionStatus];
  if (!map) return null;
  return map[action] ?? null;
}

/** Darf der Artist den Track noch editieren? (Re-Submit setzt zurück auf PENDING.) */
export function isEditableByArtist(status: string): boolean {
  return status === SUBMISSION_STATUS.PENDING || status === SUBMISSION_STATUS.CHANGES_REQUESTED;
}
