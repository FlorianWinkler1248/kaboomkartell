'use client';

/**
 * LibraryFilters — Filter- und Sortier-Bar für /library.
 *
 * Vier Selects: Sort + Genre + Pool/Set + Artist. Beim Ändern wird die
 * URL via router.push aktualisiert (Server-Component liest searchParams +
 * lädt neue Tracks). Page-Param wird auf 1 zurückgesetzt, sobald ein
 * Filter wechselt — sonst landet man auf einer leeren Seite eines
 * gefilterten Sub-Sets.
 *
 * v2.24 (03.05.2026): Erste Iteration. Pure URL-State, keine clientseitige
 * Track-Liste — alles SSR.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { useTranslations } from 'next-intl';

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface Props {
  sort: string;
  genre: string;
  pool: string;
  artist: string;
  genres: FilterOption[];
  pools: FilterOption[];
  artists: FilterOption[];
  hasActiveFilters: boolean;
}

// Sort-Werte sind URL-State (NICHT übersetzen) — Labels werden in der
// Component via t() lokalisiert. „A → Z" bleibt als Glyph universell.
const SORT_VALUES = ['newest', 'oldest', 'alphabetical', 'plays'] as const;

export default function LibraryFilters({
  sort,
  genre,
  pool,
  artist,
  genres,
  pools,
  artists,
  hasActiveFilters,
}: Props) {
  const t = useTranslations('library');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const sortOptions: FilterOption[] = SORT_VALUES.map((value) => ({
    value,
    label: t(`sort_${value}`),
  }));

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    // Page immer zurück auf 1, sobald ein Filter sich ändert.
    if (key !== 'page') params.delete('page');
    const queryString = params.toString();
    startTransition(() => {
      router.push(queryString ? `/library?${queryString}` : '/library');
    });
  };

  const clearAll = () => {
    startTransition(() => {
      router.push('/library');
    });
  };

  return (
    <div
      className="kbk-obsidian"
      style={{
        marginTop: 24,
        padding: '14px 16px',
        borderRadius: 10,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <FilterSelect
        label={t('filterSort')}
        value={sort}
        options={sortOptions}
        onChange={(v) => updateParam('sort', v === 'newest' ? '' : v)}
        showAllOption={false}
      />
      <FilterSelect
        label={t('filterGenre')}
        value={genre}
        options={genres}
        onChange={(v) => updateParam('genre', v)}
        allLabel={t('filterAllGenres')}
      />
      <FilterSelect
        label={t('filterSet')}
        value={pool}
        options={pools}
        onChange={(v) => updateParam('pool', v)}
        allLabel={t('filterAllSets')}
      />
      <FilterSelect
        label={t('filterArtist')}
        value={artist}
        options={artists}
        onChange={(v) => updateParam('artist', v)}
        allLabel={t('filterAllArtists')}
      />
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAll}
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            background: 'rgba(230,59,46,0.10)',
            border: '1px solid rgba(230,59,46,0.45)',
            color: '#E63B2E',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            borderRadius: 6,
          }}
        >
          {t('clearFilters')}
        </button>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  allLabel,
  showAllOption = true,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
  allLabel?: string;
  showAllOption?: boolean;
}) {
  return (
    <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.18em',
          color: 'rgba(255,255,255,0.45)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: 'rgba(10,11,12,0.92)',
          border: '1px solid rgba(255,255,255,0.18)',
          color: '#fff',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.06em',
          padding: '8px 28px 8px 12px',
          borderRadius: 6,
          cursor: 'pointer',
          appearance: 'none',
          // Pfeil-Icon als Background-Image (SVG inline)
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='%233FCF4A'><path d='M6 8L0 0h12z'/></svg>\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          backgroundSize: '10px 6px',
          minWidth: 130,
        }}
      >
        {showAllOption && <option value="">{allLabel ?? 'All'}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
            {typeof opt.count === 'number' ? ` (${opt.count})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
