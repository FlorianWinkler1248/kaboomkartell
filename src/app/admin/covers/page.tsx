import type { Metadata } from 'next';
import CoverGeneratorClient from './CoverGeneratorClient';
import { AdminPageHeader } from '@/components/admin/ui';

export const metadata: Metadata = {
  title: 'Cover Generator',
};

export const dynamic = 'force-dynamic';

/**
 * Admin: Cover-Generator.
 *
 * Nutzt einen externen Cover-Generator (/api/cover/generate), um für alle
 * PUBLISHED-Tracks ohne eigenes Cover automatisch eines zu generieren.
 */
export default function CoverGeneratorPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <AdminPageHeader
        kickerTag="/C/"
        kicker="COVER FACTORY"
        title="PIXEL-ART COVERS"
        description="Generates pixel-art covers for every published track that has no artwork yet. Jobs run against the cover generator — roughly 1-3 seconds per track."
      />
      <CoverGeneratorClient />
    </div>
  );
}
