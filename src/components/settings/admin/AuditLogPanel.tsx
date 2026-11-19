import React, { useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { subscribeAuditLogs } from '../../../services/firebase/adminService';
import { AuditLogCategory, AuditLogEntry } from '../../../types/nexora';
import { formatRelativeTime } from '../../../utils/validation';

const CATEGORIES: ('all' | AuditLogCategory)[] = [
  'all',
  'admin',
  'community',
  'verification',
  'identity',
  'platform',
  'moderation',
  'notification',
];

export function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [category, setCategory] = useState<'all' | AuditLogCategory>('all');

  useEffect(() => {
    return subscribeAuditLogs(setLogs);
  }, []);

  const filtered = useMemo(
    () => (category === 'all' ? logs : logs.filter((l) => l.category === category)),
    [logs, category]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <History size={18} className="text-[#C084FC]" /> Immutable Platform Audit Trail
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Append-only administrative activity log enforced in Firestore rules (<code className="text-[#E9D5FF]">update, delete: false</code>).
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize ${
              category === cat
                ? 'bg-[#7C3AED] text-white'
                : 'bg-[#08070F] border border-white/10 text-[#94A3B8] hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-6 text-xs text-[#64748B]">No audit entries recorded for this filter.</p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {filtered.map((log) => (
              <div
                key={log.id}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] uppercase text-[#C084FC]">
                      {log.category}
                    </span>
                    <span className="font-semibold text-white">{log.action}</span>
                    {log.targetLabel && (
                      <span className="text-[#CBD5E1]">({log.targetLabel})</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#94A3B8] mt-0.5">
                    Actor: {log.actorName} [{log.actorRole}]
                    {log.details ? ` • ${log.details}` : ''}
                  </p>
                </div>
                <span className="text-[11px] text-[#64748B] font-mono-tabular shrink-0">
                  {formatRelativeTime(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
