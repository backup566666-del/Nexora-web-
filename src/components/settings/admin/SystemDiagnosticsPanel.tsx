import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Search } from 'lucide-react';
import {
  resolveErrorDiagnostic,
  subscribeErrorDiagnostics,
} from '../../../services/firebase/errorHandler';
import { ErrorDiagnosticCategory, ErrorDiagnosticEntry, UserProfile } from '../../../types/nexora';
import { formatRelativeTime } from '../../../utils/validation';

interface SystemDiagnosticsPanelProps {
  actor: UserProfile;
}

const CATEGORY_FILTERS: { id: 'all' | ErrorDiagnosticCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'upload', label: 'Uploads' },
  { id: 'permission', label: 'Permissions' },
  { id: 'network', label: 'Network' },
  { id: 'auth', label: 'Auth' },
  { id: 'runtime', label: 'Runtime' },
];

export function SystemDiagnosticsPanel({ actor }: SystemDiagnosticsPanelProps) {
  const [entries, setEntries] = useState<ErrorDiagnosticEntry[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<'all' | ErrorDiagnosticCategory>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const unsub = subscribeErrorDiagnostics(
      (items) => {
        setErrorMsg('');
        setEntries(items);
      },
      (msg) => setErrorMsg(msg)
    );
    return () => unsub();
  }, []);

  const filteredEntries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return entries.filter((entry) => {
      if (!showResolved && entry.resolved) return false;
      if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        entry.requestId.toLowerCase().includes(q) ||
        entry.errorCode.toLowerCase().includes(q) ||
        entry.feature.toLowerCase().includes(q) ||
        entry.diagnosticMessage.toLowerCase().includes(q)
      );
    });
  }, [entries, showResolved, categoryFilter, searchTerm]);

  const openCount = useMemo(() => entries.filter((e) => !e.resolved).length, [entries]);

  const handleResolve = async (entryId: string) => {
    setBusyId(entryId);
    try {
      await resolveErrorDiagnostic(entryId, actor.uid);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <Activity size={18} className="text-[#C084FC]" />
            System Error Diagnostics
          </h2>
          <p className="text-xs text-[#94A3B8]">
            Private technical diagnostics automatically redacted for secrets and user PII. Ordinary users only receive friendly messages.
          </p>
        </div>
        <span className="px-3 py-1.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/25 text-xs font-semibold text-white shrink-0">
          {openCount} Open Issue{openCount === 1 ? '' : 's'}
        </span>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                categoryFilter === cat.id
                  ? 'bg-[#7C3AED] text-white'
                  : 'bg-[#08070F] text-[#94A3B8] border border-white/10 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <label className="inline-flex items-center gap-1.5 text-xs text-[#CBD5E1] cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="accent-[#7C3AED]"
            />
            Show resolved
          </label>
          <div className="relative flex-1 sm:w-56">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search request ID or code..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#08070F] border border-white/10 text-xs text-white outline-none focus:border-[#8B5CF6]"
            />
          </div>
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#08070F] border border-white/10 text-center space-y-2">
          <CheckCircle2 size={24} className="mx-auto text-emerald-400" />
          <p className="text-sm font-medium text-white">No diagnostics in this view</p>
          <p className="text-xs text-[#94A3B8]">
            Application health events and redacted failure reports will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => {
            const expanded = expandedId === entry.id;
            return (
              <div
                key={entry.id}
                className="p-4 rounded-2xl bg-[#08070F] border border-white/10 space-y-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold uppercase ${
                        entry.resolved
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {entry.resolved ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                      {entry.category}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-[#C084FC]">
                      {entry.errorCode}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-[#94A3B8]">
                      HTTP {entry.httpStatus}
                    </span>
                    <span className="text-[11px] text-[#CBD5E1] font-medium">
                      {entry.feature}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular text-[10px] text-[#64748B]">
                      {entry.requestId}
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#E2E8F0] break-words">{entry.diagnosticMessage}</p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-3 text-[11px] text-[#94A3B8]">
                    <span>Actor UID: {entry.actorUid.slice(0, 10)}...</span>
                    {entry.redactedStack && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : entry.id)}
                        className="inline-flex items-center gap-1 text-[#C084FC] hover:underline"
                      >
                        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {expanded ? 'Hide trace' : 'View trace'}
                      </button>
                    )}
                  </div>

                  {!entry.resolved && (
                    <button
                      type="button"
                      disabled={busyId === entry.id}
                      onClick={() => void handleResolve(entry.id)}
                      className="px-3 py-1 rounded-lg bg-[#7C3AED]/20 hover:bg-[#7C3AED]/35 border border-[#8B5CF6]/40 text-[11px] font-semibold text-white transition-colors"
                    >
                      {busyId === entry.id ? 'Saving...' : 'Mark Resolved'}
                    </button>
                  )}
                </div>

                {expanded && entry.redactedStack && (
                  <pre className="p-3 rounded-xl bg-[#050409] border border-white/10 text-[10px] font-mono text-[#94A3B8] overflow-x-auto whitespace-pre-wrap">
                    {entry.redactedStack}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
