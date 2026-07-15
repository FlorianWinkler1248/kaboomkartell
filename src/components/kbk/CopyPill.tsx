'use client';

/**
 * CopyPill — kopierbare Code-Pille im Cockpit-Look.
 *
 * Zeigt einen Wert (URL, Config-Snippet) in Mono-Schrift mit Copy-Button.
 * Feedback via useToast (Pflicht-Pattern, keine eigenen Alerts).
 * Genutzt von AiAgentsSection + /mcp (MCP-Discovery, Workflow kbk-mcp-discovery).
 */

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/providers/ToastProvider';

export default function CopyPill({
  value,
  display,
  multiline = false,
}: {
  value: string;
  /** Optional abweichende Anzeige (Default: value). */
  display?: string;
  /** true für mehrzeilige Snippets (pre-wrap statt einzeiliger Pille). */
  multiline?: boolean;
}) {
  const t = useTranslations('kbkUi');
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        toast({ type: 'success', message: t('copySuccess') });
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        toast({ type: 'error', message: t('copyFailed') });
      });
  };

  return (
    <div
      className="kbk-obsidian polished"
      style={{
        display: 'flex',
        alignItems: multiline ? 'flex-start' : 'center',
        gap: 10,
        padding: multiline ? '12px 14px' : '9px 14px',
        borderRadius: 8,
        boxShadow: 'inset 0 0 0 1px rgba(139,92,246,0.35)',
        maxWidth: '100%',
      }}
    >
      <code
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          color: 'rgba(255,255,255,0.88)',
          whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
          overflowX: 'auto',
          flex: 1,
          minWidth: 0,
          lineHeight: 1.5,
        }}
      >
        {display ?? value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={t('copyToClipboard')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          width: 30,
          height: 30,
          borderRadius: 6,
          border: '1px solid rgba(139,92,246,0.45)',
          background: copied ? 'rgba(63,207,74,0.15)' : 'rgba(139,92,246,0.12)',
          color: copied ? '#3FCF4A' : '#B69DFF',
          cursor: 'pointer',
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}
