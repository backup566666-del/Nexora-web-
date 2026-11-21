import React, { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, FileCheck2, Lock, XCircle } from 'lucide-react';
import {
  reviewIdentityVerification,
  subscribeAllIdentityVerifications,
} from '../../../services/firebase/adminService';
import { extractReadableErrorMessage } from '../../../services/firebase/errorHandler';
import {
  IdentityVerificationRequest,
  PlatformRole,
  UserProfile,
} from '../../../types/nexora';
import { formatRelativeTime } from '../../../utils/validation';

interface IdentityVerificationPanelProps {
  actor: UserProfile;
  myRole: PlatformRole;
}

const DOC_TYPE_LABELS: Record<IdentityVerificationRequest['documentType'], string> = {
  passport: 'Passport',
  national_id: 'National ID Card',
  drivers_license: "Driver's License",
};

export function IdentityVerificationPanel({
  actor,
  myRole,
}: IdentityVerificationPanelProps) {
  const [items, setItems] = useState<IdentityVerificationRequest[]>([]);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    return subscribeAllIdentityVerifications(setItems);
  }, []);

  const handleDecision = async (
    req: IdentityVerificationRequest,
    decision: 'approved' | 'rejected'
  ) => {
    setBusy(true);
    setFeedback(null);
    try {
      await reviewIdentityVerification({
        actor,
        actorRole: myRole.role,
        request: req,
        decision,
        reviewerNote: reviewNotes[req.id] || '',
      });
      setFeedback({
        type: 'ok',
        text: `Identity document for @${req.username} marked ${decision}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to review identity document.', { feature: 'admin:identity-review' }),
      });
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = items.filter((i) => i.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <Lock size={18} className="text-rose-300" />
            Confidential Identity Document Vault
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Strictly restricted to the Nexora Owner and staff holding explicit <code className="text-[#E9D5FF]">review_identity_docs</code> permission. Approving an identity submission automatically grants the official blue <strong className="text-sky-300">Verified Identity</strong> badge and sends a dual in-app &amp; email confirmation.
          </p>
        </div>
        <span className="px-3 py-1.5 rounded-lg bg-[#08070F] border border-rose-500/25 text-xs font-mono-tabular text-amber-300">
          Pending Reviews: <strong>{pendingCount}</strong>
        </span>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-white/70 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#08070F] border border-white/[0.06] text-center space-y-2">
          <FileCheck2 size={24} className="mx-auto text-[#64748B]" />
          <p className="text-xs text-[#94A3B8]">
            No identity verification documents are awaiting inspection.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((req) => {
            const isExpanded = expandedDocId === req.id;
            const isImageDoc = req.documentPreviewUrl.startsWith('data:image/');

            return (
              <div
                key={req.id}
                className="p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">
                        {req.legalFullName}
                      </span>
                      <span className="text-xs text-[#C084FC]">@{req.username}</span>
                      <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-[#CBD5E1]">
                        {DOC_TYPE_LABELS[req.documentType]} • {req.documentCountry}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${
                          req.status === 'approved'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : req.status === 'rejected'
                            ? 'bg-rose-500/15 text-rose-300'
                            : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#94A3B8] mt-1">
                      Account: {req.displayName} • File: {req.documentFileName} • Submitted{' '}
                      {formatRelativeTime(req.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandedDocId(isExpanded ? null : req.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white"
                    >
                      {isExpanded ? <EyeOff size={13} /> : <Eye size={13} />}
                      {isExpanded ? 'Hide Document' : 'Inspect Document'}
                    </button>

                    {req.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDecision(req, 'approved')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                        >
                          <CheckCircle2 size={13} /> Approve ID
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDecision(req, 'rejected')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/25 text-xs text-rose-200"
                        >
                          <XCircle size={13} /> Reject ID
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/25 space-y-3">
                    {isImageDoc ? (
                      <img
                        src={req.documentPreviewUrl}
                        alt={`Confidential identity document for ${req.legalFullName}`}
                        className="max-h-96 w-auto rounded-lg border border-white/10 mx-auto object-contain"
                      />
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-[#08070F]">
                        <span className="text-xs text-[#CBD5E1]">
                          Document attachment: {req.documentFileName}
                        </span>
                        <a
                          href={req.documentPreviewUrl}
                          download={req.documentFileName}
                          className="px-3 py-1.5 rounded-lg bg-[#7C3AED] text-xs font-semibold text-white text-center"
                        >
                          Download Restricted Attachment
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {req.status === 'pending' ? (
                  <input
                    type="text"
                    value={reviewNotes[req.id] || ''}
                    onChange={(e) =>
                      setReviewNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                    }
                    placeholder="Confidential reviewer note (reason for approval/rejection)..."
                    className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/15 text-xs text-white outline-none"
                  />
                ) : (
                  req.reviewerNote && (
                    <p className="text-[11px] text-[#94A3B8]">
                      Reviewer note: {req.reviewerNote}
                    </p>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
