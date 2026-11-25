"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRewardsConfig = exports.adminAdjustWallet = exports.transitionWithdrawalStatus = exports.requestWithdrawal = exports.reviewTaskSubmission = exports.submitTaskEntry = exports.claimReferral = exports.onUserOnboardingCompleted = exports.onAnnouncementApproved = exports.onNewUserWelcome = void 0;
const genai_1 = require("@google/genai");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const functionsV1 = require("firebase-functions/v1");
const firestore_2 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
const DATABASE_ID = 'ai-studio-bf321206-bfed-4f87-947f-b3aa40868ffd';
const FOUNDER_OWNER_EMAIL = 'backup566666@gmail.com';
const DEFAULT_MIN_WITHDRAWAL_NAIRA = 2000;
const REFERRALS_PER_KEY_POINT = 10;
const POINTS_PER_REFERRAL_MILESTONE = 1;
const geminiApiKeySecret = (0, params_1.defineSecret)('GEMINI_API_KEY');
function getDb() {
    return (0, firestore_1.getFirestore)((0, app_1.getApp)(), DATABASE_ID);
}
function isCallerVerified(auth) {
    if (!auth?.token)
        return false;
    if (auth.token.email_verified === true)
        return true;
    return typeof auth.token.phone_number === 'string' && auth.token.phone_number.length >= 7;
}
async function assertAuthorizedAdmin(uid, tokenEmail, requiredPerm) {
    const email = typeof tokenEmail === 'string' ? tokenEmail.toLowerCase() : '';
    if (email === FOUNDER_OWNER_EMAIL) {
        return { isOwner: true, role: 'owner' };
    }
    const db = getDb();
    const roleSnap = await db.collection('platform_roles').doc(uid).get();
    if (!roleSnap.exists) {
        throw new https_1.HttpsError('permission-denied', 'Administrative permissions required.');
    }
    const roleData = roleSnap.data() || {};
    if (roleData.active !== true) {
        throw new https_1.HttpsError('permission-denied', 'Staff role is inactive.');
    }
    const role = String(roleData.role || '');
    if (role === 'owner') {
        return { isOwner: true, role: 'owner' };
    }
    const perms = Array.isArray(roleData.permissions) ? roleData.permissions : [];
    if (!perms.includes(requiredPerm) && !perms.includes('manage_platform')) {
        throw new https_1.HttpsError('permission-denied', `Missing required permission: ${requiredPerm}`);
    }
    return { isOwner: false, role };
}
function canonicalizeEmailForAntiFraud(raw) {
    const clean = raw.trim().toLowerCase();
    const [local, domain] = clean.split('@');
    if (!local || !domain)
        return clean;
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
        return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
    }
    return `${local.split('+')[0]}@${domain}`;
}
function maskAccountNumber(raw) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 4)
        return '******';
    return `${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}
const VALID_TRANSITIONS = {
    pending: ['under_review', 'approved', 'rejected'],
    under_review: ['approved', 'rejected'],
    approved: ['processing', 'paid', 'rejected'],
    processing: ['paid', 'rejected'],
    paid: [],
    rejected: [],
};
/**
 * Automated New Member Welcome via Firebase Auth User Creation Trigger.
 */
exports.onNewUserWelcome = functionsV1
    .runWith({ secrets: [geminiApiKeySecret] })
    .auth.user()
    .onCreate(async (user) => {
    const db = getDb();
    const settingsSnap = await db.collection('ai_settings').doc('global').get();
    const settings = settingsSnap.data() || {};
    if (settings.enabled === false || settings.welcomeEnabled === false) {
        return;
    }
    const dedupeId = `ai_welcome_${user.uid}`;
    const existingNotif = await db
        .collection('notifications')
        .where('recipientId', '==', user.uid)
        .where('dedupeKey', '==', dedupeId)
        .limit(1)
        .get();
    if (!existingNotif.empty) {
        return;
    }
    const displayName = user.displayName || user.email?.split('@')[0] || 'Creator';
    const apiKey = geminiApiKeySecret.value() || process.env.GEMINI_API_KEY || '';
    const title = `Welcome to Nexora, ${displayName}!`;
    let preview = 'Explore Spaces, share Vibes, connect in Chat, or open Nexora AI Studio anytime.';
    let aiGenerated = false;
    if (apiKey) {
        try {
            const ai = new genai_1.GoogleGenAI({ apiKey });
            const model = String(settings.defaultModel || 'gemini-4-hydrogen');
            const response = await ai.models.generateContent({
                model,
                contents: `Write a friendly 2-sentence Nexora welcome notification (under 180 characters) for ${displayName}. Mention Spaces, Vibes, and Nexora AI.`,
            });
            const generatedText = (response.text || '').trim().slice(0, 195);
            if (generatedText) {
                preview = generatedText;
                aiGenerated = true;
            }
        }
        catch (err) {
            console.error('Gemini welcome generation failed:', err);
        }
    }
    await db.collection('notifications').add({
        recipientId: user.uid,
        actorId: 'nexora_ai',
        actorName: 'Nexora AI',
        actorAvatar: '',
        type: 'ai_welcome',
        category: 'account',
        title,
        targetType: 'system',
        targetId: 'ai',
        dedupeKey: dedupeId,
        preview,
        read: false,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    const tokenSnaps = await db
        .collection('device_tokens')
        .where('uid', '==', user.uid)
        .where('enabled', '==', true)
        .where('pushConsent', '==', true)
        .get();
    const tokens = tokenSnaps.docs.map((d) => String(d.data().token || '')).filter(Boolean);
    let delivered = 0;
    let failed = 0;
    const failureDetails = [];
    if (tokens.length > 0) {
        const pushRes = await (0, messaging_1.getMessaging)((0, app_1.getApp)()).sendEachForMulticast({
            tokens,
            notification: { title, body: preview },
        });
        delivered = pushRes.successCount;
        failed = pushRes.failureCount;
    }
    else {
        delivered = 1;
        failureDetails.push(aiGenerated
            ? 'In-app welcome delivered (no push token).'
            : 'In-app template welcome delivered.');
    }
    await db.collection('delivery_reports').add({
        sourceType: 'welcome',
        sourceId: user.uid,
        channel: tokens.length > 0 ? 'multi' : 'in_app',
        recipientCount: Math.max(1, tokens.length),
        deliveredCount: delivered,
        failedCount: failed,
        failureDetails,
        status: failed === 0 ? 'completed' : delivered > 0 ? 'partial' : 'failed',
        createdBy: 'nexora_ai',
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
});
/**
 * Owner-Approved Global Announcement Fan-Out Trigger.
 */
exports.onAnnouncementApproved = (0, firestore_2.onDocumentWritten)({ document: 'announcements/{announcementId}', database: DATABASE_ID }, async (event) => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();
    if (!after)
        return;
    if (after.ownerApproved !== true || after.status !== 'published')
        return;
    if (before && before.status === 'published' && before.ownerApproved === true)
        return;
    const db = getDb();
    const usersSnap = await db
        .collection('users')
        .where('onboardingCompleted', '==', true)
        .limit(1000)
        .get();
    const targetUids = [];
    usersSnap.docs.forEach((docSnap) => {
        const u = docSnap.data();
        if (u.suspended)
            return;
        if (after.audience === 'all') {
            targetUids.push(docSnap.id);
        }
        else if (after.audience === (u.subscriptionTier || 'free')) {
            targetUids.push(docSnap.id);
        }
    });
    const batch = db.batch();
    let count = 0;
    for (const uid of targetUids.slice(0, 450)) {
        const ref = db.collection('notifications').doc();
        batch.set(ref, {
            recipientId: uid,
            actorId: String(after.approvedBy || after.createdBy || 'nexora_ai'),
            actorName: 'Nexora AI',
            actorAvatar: '',
            type: 'announcement',
            category: 'admin',
            title: String(after.title).slice(0, 120),
            targetType: 'system',
            targetId: event.params.announcementId,
            dedupeKey: `ann_${event.params.announcementId}_${uid}`,
            preview: String(after.body).slice(0, 190),
            read: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        count++;
    }
    if (count > 0)
        await batch.commit();
    const tokensSnap = await db
        .collection('device_tokens')
        .where('enabled', '==', true)
        .where('pushConsent', '==', true)
        .limit(500)
        .get();
    const tokens = tokensSnap.docs
        .filter((d) => targetUids.includes(String(d.data().uid)))
        .map((d) => String(d.data().token || ''))
        .filter(Boolean);
    let pushDelivered = 0;
    let pushFailed = 0;
    if (tokens.length > 0) {
        const res = await (0, messaging_1.getMessaging)((0, app_1.getApp)()).sendEachForMulticast({
            tokens,
            notification: {
                title: String(after.title).slice(0, 120),
                body: String(after.body).slice(0, 200),
            },
        });
        pushDelivered = res.successCount;
        pushFailed = res.failureCount;
    }
    await db.collection('delivery_reports').add({
        sourceType: 'announcement',
        sourceId: event.params.announcementId,
        channel: tokens.length > 0 ? 'multi' : 'in_app',
        recipientCount: targetUids.length,
        deliveredCount: count + pushDelivered,
        failedCount: pushFailed,
        failureDetails: [],
        status: pushFailed === 0 ? 'completed' : 'partial',
        createdBy: String(after.approvedBy || after.createdBy || 'nexora_ai'),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
});
/**
 * Helper to atomically qualify a pending referral claim and award 1 Key Point per 10 qualified referrals.
 */
async function qualifyReferralAndAwardMilestone(inviteeUid) {
    const db = getDb();
    const claimRef = db.collection('referral_claims').doc(inviteeUid);
    await db.runTransaction(async (tx) => {
        const claimSnap = await tx.get(claimRef);
        if (!claimSnap.exists)
            return;
        const claim = claimSnap.data() || {};
        if (claim.status !== 'pending')
            return;
        const userSnap = await tx.get(db.collection('users').doc(inviteeUid));
        if (!userSnap.exists)
            return;
        const userData = userSnap.data() || {};
        if (userData.onboardingCompleted !== true || userData.suspended === true)
            return;
        const inviterUid = String(claim.inviterUid || '');
        const code = String(claim.invitationCode || '');
        if (!inviterUid || inviterUid === inviteeUid || !code)
            return;
        const invRef = db.collection('invitations').doc(code);
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists)
            return;
        const invData = invSnap.data() || {};
        if (invData.active === false)
            return;
        const cfgSnap = await tx.get(db.collection('rewards_config').doc('global'));
        const cfgData = cfgSnap.data() || {};
        if (cfgData.invitationsEnabled === false)
            return;
        const referralsPerPoint = Math.max(1, Number(cfgData.referralsPerPoint || REFERRALS_PER_KEY_POINT));
        const pointsPerMilestone = Math.max(1, Number(cfgData.pointsPerMilestone || POINTS_PER_REFERRAL_MILESTONE));
        const prevQualified = Math.max(0, Number(invData.qualifiedReferralsCount || 0));
        const nextQualified = prevQualified + 1;
        const prevMilestones = Math.max(0, Number(invData.milestonesAwarded || 0));
        const totalMilestones = Math.floor(nextQualified / referralsPerPoint);
        const newMilestones = Math.max(0, totalMilestones - prevMilestones);
        const pointsToCredit = newMilestones * pointsPerMilestone;
        tx.update(claimRef, {
            status: 'qualified',
            rewardStatus: pointsToCredit > 0 ? 'milestone_paid' : 'counted',
            qualifiedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.update(invRef, {
            qualifiedReferralsCount: nextQualified,
            milestonesAwarded: totalMilestones,
            pointsEarned: Math.max(0, Number(invData.pointsEarned || 0)) + pointsToCredit,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        if (pointsToCredit > 0) {
            const walletRef = db.collection('wallets').doc(inviterUid);
            const walletSnap = await tx.get(walletRef);
            const w = walletSnap.exists ? walletSnap.data() || {} : {};
            const nextAvail = Math.max(0, Number(w.availablePoints || 0)) + pointsToCredit;
            const nextEarned = Math.max(0, Number(w.lifetimeEarnedPoints || 0)) + pointsToCredit;
            tx.set(walletRef, {
                uid: inviterUid,
                availablePoints: nextAvail,
                pendingPoints: Math.max(0, Number(w.pendingPoints || 0)),
                lockedPoints: Math.max(0, Number(w.lockedPoints || 0)),
                lifetimeEarnedPoints: nextEarned,
                lifetimeWithdrawnPoints: Math.max(0, Number(w.lifetimeWithdrawnPoints || 0)),
                lifetimeWithdrawnNaira: Math.max(0, Number(w.lifetimeWithdrawnNaira || 0)),
                frozen: Boolean(w.frozen),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            const txId = `ref_milestone_${inviterUid}_${totalMilestones}`;
            tx.set(db.collection('wallet_transactions').doc(txId), {
                uid: inviterUid,
                type: 'referral_milestone',
                direction: 'credit',
                points: pointsToCredit,
                nairaEquivalent: null,
                pointRateNaira: null,
                referenceId: code,
                description: `Referral milestone reached (${nextQualified} qualified invitations)`,
                actorUid: 'system_rewards',
                balanceAfterAvailable: nextAvail,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
            const notifRef = db.collection('notifications').doc();
            tx.set(notifRef, {
                recipientId: inviterUid,
                actorId: 'system_rewards',
                actorName: 'Nexora Rewards',
                actorAvatar: '',
                type: 'referral_reward',
                category: 'rewards',
                title: `+${pointsToCredit} Key Point Earned`,
                targetType: 'invite',
                targetId: code,
                dedupeKey: txId,
                preview: `You reached ${nextQualified} qualified referrals and unlocked +${pointsToCredit} Key Point!`,
                read: false,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
    });
}
/**
 * Trigger referral qualification automatically as soon as an invitee completes verified onboarding.
 */
exports.onUserOnboardingCompleted = (0, firestore_2.onDocumentWritten)({ document: 'users/{userId}', database: DATABASE_ID }, async (event) => {
    const after = event.data?.after.data();
    if (!after || after.onboardingCompleted !== true || after.suspended === true)
        return;
    await qualifyReferralAndAwardMilestone(event.params.userId);
});
/**
 * Callable: Attribute a referral code to the calling verified user with anti-fraud checks.
 */
exports.claimReferral = (0, https_1.onCall)(async (request) => {
    if (!request.auth || !isCallerVerified(request.auth)) {
        throw new https_1.HttpsError('unauthenticated', 'Verified Nexora session required.');
    }
    const inviteeUid = request.auth.uid;
    const code = String(request.data?.code || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
        .slice(0, 24);
    const deviceHash = String(request.data?.deviceHash || '').trim().slice(0, 128);
    if (code.length < 3) {
        throw new https_1.HttpsError('invalid-argument', 'Valid invitation code required.');
    }
    const db = getDb();
    const invRef = db.collection('invitations').doc(code);
    const claimRef = db.collection('referral_claims').doc(inviteeUid);
    const [invSnap, existingClaimSnap, inviteeUserSnap, cfgSnap] = await Promise.all([
        invRef.get(),
        claimRef.get(),
        db.collection('users').doc(inviteeUid).get(),
        db.collection('rewards_config').doc('global').get(),
    ]);
    if (existingClaimSnap.exists) {
        return { status: existingClaimSnap.data()?.status, alreadyClaimed: true };
    }
    if (!invSnap.exists || invSnap.data()?.active === false) {
        throw new https_1.HttpsError('not-found', 'Invitation code not found or inactive.');
    }
    if (cfgSnap.exists && cfgSnap.data()?.invitationsEnabled === false) {
        throw new https_1.HttpsError('failed-precondition', 'Invitation rewards are currently paused.');
    }
    const invData = invSnap.data();
    const inviterUid = String(invData.ownerUid || '');
    if (!inviterUid || inviterUid === inviteeUid) {
        throw new https_1.HttpsError('invalid-argument', 'Self-referrals are not permitted.');
    }
    const signals = [];
    let fraudScore = 0;
    // Check duplicate device fingerprint or email alias similarity
    const inviterPrivSnap = await db.collection('users').doc(inviterUid).collection('private').doc('settings').get();
    const inviterEmail = String(inviterPrivSnap.data()?.email || '');
    const inviteeEmail = String(request.auth.token?.email || '');
    if (inviteeEmail && inviterEmail && canonicalizeEmailForAntiFraud(inviteeEmail) === canonicalizeEmailForAntiFraud(inviterEmail)) {
        fraudScore += 75;
        signals.push('email_alias_similarity');
    }
    if (deviceHash) {
        const sameDeviceSnap = await db
            .collection('referral_claims')
            .where('deviceHash', '==', deviceHash)
            .limit(5)
            .get();
        if (sameDeviceSnap.size >= 2) {
            fraudScore += 60;
            signals.push('repeated_device_fingerprint');
        }
    }
    const flagged = fraudScore >= 80;
    const inviteeProfile = inviteeUserSnap.data() || {};
    await db.runTransaction(async (tx) => {
        const doubleCheck = await tx.get(claimRef);
        if (doubleCheck.exists)
            return;
        tx.set(claimRef, {
            inviteeUid,
            inviteeName: String(inviteeProfile.displayName || 'Nexora Member').slice(0, 80),
            inviteeUsername: String(inviteeProfile.username || 'member').slice(0, 30),
            inviterUid,
            inviterName: String(invData.ownerName || 'Inviter').slice(0, 80),
            inviterUsername: String(invData.ownerUsername || 'inviter').slice(0, 30),
            invitationCode: code,
            status: flagged ? 'flagged' : 'pending',
            rewardStatus: flagged ? 'blocked' : 'uncounted',
            fraudScore,
            fraudSignals: signals,
            ...(deviceHash ? { deviceHash } : {}),
            registeredAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.update(invRef, {
            totalRegistrations: firestore_1.FieldValue.increment(1),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        if (flagged) {
            tx.set(db.collection('referral_fraud_alerts').doc(`fraud_${inviteeUid}`), {
                claimId: inviteeUid,
                inviteeUid,
                inviterUid,
                invitationCode: code,
                fraudScore,
                signals,
                status: 'open',
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
    });
    if (!flagged && inviteeProfile.onboardingCompleted === true) {
        await qualifyReferralAndAwardMilestone(inviteeUid);
    }
    return { status: flagged ? 'flagged' : 'claimed', fraudScore, signals };
});
/**
 * Callable: Submit proof for a strictly-free community task.
 */
exports.submitTaskEntry = (0, https_1.onCall)(async (request) => {
    if (!request.auth || !isCallerVerified(request.auth)) {
        throw new https_1.HttpsError('unauthenticated', 'Verified Nexora session required.');
    }
    const uid = request.auth.uid;
    const taskId = String(request.data?.taskId || '').trim();
    const proofText = String(request.data?.proofText || '').trim().slice(0, 1000);
    const proofUrl = String(request.data?.proofUrl || '').trim().slice(0, 400);
    if (!taskId || proofText.length < 3) {
        throw new https_1.HttpsError('invalid-argument', 'Task ID and proof summary are required.');
    }
    const db = getDb();
    const taskRef = db.collection('tasks').doc(taskId);
    const subId = `${taskId}_${uid}`;
    const subRef = db.collection('task_submissions').doc(subId);
    await db.runTransaction(async (tx) => {
        const [taskSnap, subSnap, userSnap, cfgSnap] = await Promise.all([
            tx.get(taskRef),
            tx.get(subRef),
            tx.get(db.collection('users').doc(uid)),
            tx.get(db.collection('rewards_config').doc('global')),
        ]);
        if (cfgSnap.exists && cfgSnap.data()?.tasksEnabled === false) {
            throw new https_1.HttpsError('failed-precondition', 'Tasks & rewards submissions are temporarily paused.');
        }
        if (!taskSnap.exists) {
            throw new https_1.HttpsError('not-found', 'Task not found.');
        }
        const task = taskSnap.data();
        if (task.active !== true) {
            throw new https_1.HttpsError('failed-precondition', 'This task is no longer accepting submissions.');
        }
        if (task.freeToParticipate !== true) {
            throw new https_1.HttpsError('failed-precondition', 'Only strictly free tasks are permitted on Nexora.');
        }
        if (subSnap.exists) {
            throw new https_1.HttpsError('already-exists', 'You have already submitted proof for this task.');
        }
        const u = userSnap.data() || {};
        if (u.suspended === true) {
            throw new https_1.HttpsError('permission-denied', 'Suspended accounts cannot submit tasks.');
        }
        tx.set(subRef, {
            taskId,
            taskTitle: String(task.title || '').slice(0, 120),
            uid,
            userDisplayName: String(u.displayName || 'Nexora Member').slice(0, 80),
            userUsername: String(u.username || 'member').slice(0, 30),
            proofText,
            ...(proofUrl ? { proofUrl } : {}),
            rewardPoints: Math.max(0, Number(task.rewardPoints || 0)),
            status: 'pending',
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.update(taskRef, {
            submissionsCount: firestore_1.FieldValue.increment(1),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return { submissionId: subId, status: 'pending' };
});
/**
 * Callable (Admin): Approve or reject a task submission atomically & credit Key Points.
 */
exports.reviewTaskSubmission = (0, https_1.onCall)(async (request) => {
    if (!request.auth || !isCallerVerified(request.auth)) {
        throw new https_1.HttpsError('unauthenticated', 'Verified session required.');
    }
    const actorUid = request.auth.uid;
    const adminInfo = await assertAuthorizedAdmin(actorUid, request.auth.token?.email, 'manage_rewards');
    const submissionId = String(request.data?.submissionId || '').trim();
    const decision = request.data?.decision === 'approved' ? 'approved' : request.data?.decision === 'rejected' ? 'rejected' : null;
    const note = String(request.data?.note || '').trim().slice(0, 300);
    if (!submissionId || !decision) {
        throw new https_1.HttpsError('invalid-argument', 'Submission ID and decision (approved/rejected) required.');
    }
    const db = getDb();
    const subRef = db.collection('task_submissions').doc(submissionId);
    await db.runTransaction(async (tx) => {
        const subSnap = await tx.get(subRef);
        if (!subSnap.exists)
            throw new https_1.HttpsError('not-found', 'Submission not found.');
        const sub = subSnap.data();
        if (sub.status !== 'pending') {
            throw new https_1.HttpsError('failed-precondition', 'Submission has already been reviewed.');
        }
        if (sub.uid === actorUid && !adminInfo.isOwner) {
            throw new https_1.HttpsError('permission-denied', 'You cannot approve your own task submission.');
        }
        tx.update(subRef, {
            status: decision,
            reviewerUid: actorUid,
            reviewerNote: note,
            reviewedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        if (decision === 'approved') {
            const rewardPoints = Math.max(0, Number(sub.rewardPoints || 0));
            const targetUid = String(sub.uid);
            const walletRef = db.collection('wallets').doc(targetUid);
            const walletSnap = await tx.get(walletRef);
            const w = walletSnap.exists ? walletSnap.data() || {} : {};
            const nextAvail = Math.max(0, Number(w.availablePoints || 0)) + rewardPoints;
            const nextEarned = Math.max(0, Number(w.lifetimeEarnedPoints || 0)) + rewardPoints;
            tx.set(walletRef, {
                uid: targetUid,
                availablePoints: nextAvail,
                pendingPoints: Math.max(0, Number(w.pendingPoints || 0)),
                lockedPoints: Math.max(0, Number(w.lockedPoints || 0)),
                lifetimeEarnedPoints: nextEarned,
                lifetimeWithdrawnPoints: Math.max(0, Number(w.lifetimeWithdrawnPoints || 0)),
                lifetimeWithdrawnNaira: Math.max(0, Number(w.lifetimeWithdrawnNaira || 0)),
                frozen: Boolean(w.frozen),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            tx.update(db.collection('tasks').doc(String(sub.taskId)), {
                approvedCount: firestore_1.FieldValue.increment(1),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            const txId = `task_${submissionId}`;
            tx.set(db.collection('wallet_transactions').doc(txId), {
                uid: targetUid,
                type: 'task_reward',
                direction: 'credit',
                points: rewardPoints,
                nairaEquivalent: null,
                pointRateNaira: null,
                referenceId: submissionId,
                description: `Task approved: ${String(sub.taskTitle || 'Free Task')}`,
                actorUid,
                balanceAfterAvailable: nextAvail,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
            tx.set(db.collection('notifications').doc(), {
                recipientId: targetUid,
                actorId: actorUid,
                actorName: 'Nexora Rewards',
                actorAvatar: '',
                type: 'task_reward',
                category: 'rewards',
                title: `Task Approved (+${rewardPoints} Key Points)`,
                targetType: 'tasks',
                targetId: String(sub.taskId),
                dedupeKey: txId,
                preview: `Your submission for "${String(sub.taskTitle || '')}" was verified and +${rewardPoints} Key Points were added.`,
                read: false,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        else {
            tx.set(db.collection('notifications').doc(), {
                recipientId: String(sub.uid),
                actorId: actorUid,
                actorName: 'Nexora Rewards',
                actorAvatar: '',
                type: 'task_reward',
                category: 'rewards',
                title: 'Task Submission Needs Attention',
                targetType: 'tasks',
                targetId: String(sub.taskId),
                dedupeKey: `task_reject_${submissionId}`,
                preview: note || `Submission for "${String(sub.taskTitle || '')}" was declined.`,
                read: false,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
    });
    return { ok: true, status: decision };
});
/**
 * Callable: Request Bank Withdrawal in Naira (Atomic balance lock + PII isolation).
 */
exports.requestWithdrawal = (0, https_1.onCall)(async (request) => {
    if (!request.auth || !isCallerVerified(request.auth)) {
        throw new https_1.HttpsError('unauthenticated', 'Verified session required.');
    }
    const uid = request.auth.uid;
    const pointsRequested = Number(request.data?.pointsRequested || 0);
    const bankName = String(request.data?.bankName || '').trim().slice(0, 100);
    const bankCode = String(request.data?.bankCode || '').trim().slice(0, 20);
    const accountNumber = String(request.data?.accountNumber || '').replace(/\D/g, '').slice(0, 20);
    const accountHolderName = String(request.data?.accountHolderName || '').trim().slice(0, 120);
    const accountVerificationStatus = request.data?.accountVerificationStatus === 'verified'
        ? 'verified'
        : request.data?.accountVerificationStatus === 'unverified_manual'
            ? 'unverified_manual'
            : 'not_configured';
    const verificationProvider = request.data?.verificationProvider === 'paystack' ||
        request.data?.verificationProvider === 'flutterwave'
        ? request.data.verificationProvider
        : 'none';
    if (!Number.isFinite(pointsRequested) || pointsRequested <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'Valid Key Points amount is required.');
    }
    if (!bankName || !bankCode || accountNumber.length !== 10 || accountHolderName.length < 2) {
        throw new https_1.HttpsError('invalid-argument', 'Complete 10-digit NUBAN bank details are required.');
    }
    const db = getDb();
    const withdrawalRef = db.collection('withdrawal_requests').doc();
    const privateRef = db.collection('withdrawal_private').doc(withdrawalRef.id);
    const walletRef = db.collection('wallets').doc(uid);
    await db.runTransaction(async (tx) => {
        const [cfgSnap, walletSnap, userSnap] = await Promise.all([
            tx.get(db.collection('rewards_config').doc('global')),
            tx.get(walletRef),
            tx.get(db.collection('users').doc(uid)),
        ]);
        const cfg = cfgSnap.exists ? cfgSnap.data() || {} : {};
        if (cfg.withdrawalsOpen === false) {
            throw new https_1.HttpsError('failed-precondition', String(cfg.lockReason || 'Withdrawals are currently locked.'));
        }
        const rate = cfg.pointRateNaira;
        if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
            throw new https_1.HttpsError('failed-precondition', 'Conversion rate has not been configured by the Owner yet.');
        }
        const minNaira = Math.max(100, Number(cfg.minWithdrawalNaira || DEFAULT_MIN_WITHDRAWAL_NAIRA));
        const nairaAmount = Math.round(pointsRequested * rate * 100) / 100;
        if (nairaAmount < minNaira) {
            throw new https_1.HttpsError('invalid-argument', `Minimum withdrawal is ₦${minNaira}.`);
        }
        if (!walletSnap.exists) {
            throw new https_1.HttpsError('failed-precondition', 'Insufficient Key Points balance.');
        }
        const w = walletSnap.data();
        if (w.frozen === true) {
            throw new https_1.HttpsError('permission-denied', 'Wallet is frozen by moderation.');
        }
        const avail = Number(w.availablePoints || 0);
        if (avail < pointsRequested) {
            throw new https_1.HttpsError('failed-precondition', 'Insufficient available Key Points balance.');
        }
        const user = userSnap.data() || {};
        if (user.suspended === true) {
            throw new https_1.HttpsError('permission-denied', 'Suspended accounts cannot request withdrawals.');
        }
        const nextAvail = avail - pointsRequested;
        const nextLocked = Math.max(0, Number(w.lockedPoints || 0)) + pointsRequested;
        tx.update(walletRef, {
            availablePoints: nextAvail,
            lockedPoints: nextLocked,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.set(withdrawalRef, {
            uid,
            userDisplayName: String(user.displayName || 'Nexora Member').slice(0, 80),
            userUsername: String(user.username || 'member').slice(0, 30),
            pointsRequested,
            pointRateNaira: rate,
            nairaAmount,
            bankName,
            bankCode,
            accountNumberMasked: maskAccountNumber(accountNumber),
            accountHolderName,
            accountVerificationStatus,
            verificationProvider,
            status: 'pending',
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.set(privateRef, {
            withdrawalId: withdrawalRef.id,
            uid,
            bankName,
            bankCode,
            accountNumber,
            accountHolderName,
            verificationProvider,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.set(db.collection('wallet_transactions').doc(`wlock_${withdrawalRef.id}`), {
            uid,
            type: 'withdrawal_lock',
            direction: 'debit',
            points: pointsRequested,
            nairaEquivalent: nairaAmount,
            pointRateNaira: rate,
            referenceId: withdrawalRef.id,
            description: `Withdrawal request queued (${bankName} ${maskAccountNumber(accountNumber)})`,
            actorUid: uid,
            balanceAfterAvailable: nextAvail,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return { withdrawalId: withdrawalRef.id, status: 'pending' };
});
/**
 * Callable (Admin): Transition withdrawal status and finalize or refund Key Points.
 */
exports.transitionWithdrawalStatus = (0, https_1.onCall)(async (request) => {
    if (!request.auth || !isCallerVerified(request.auth)) {
        throw new https_1.HttpsError('unauthenticated', 'Verified session required.');
    }
    const actorUid = request.auth.uid;
    const adminInfo = await assertAuthorizedAdmin(actorUid, request.auth.token?.email, 'manage_withdrawals');
    const withdrawalId = String(request.data?.withdrawalId || '').trim();
    const nextStatus = String(request.data?.nextStatus || '').trim();
    const paymentReference = String(request.data?.paymentReference || '').trim().slice(0, 120);
    const adminNote = String(request.data?.adminNote || '').trim().slice(0, 300);
    if (!withdrawalId || !nextStatus) {
        throw new https_1.HttpsError('invalid-argument', 'Withdrawal ID and target status are required.');
    }
    if (nextStatus === 'paid' && paymentReference.length < 3) {
        throw new https_1.HttpsError('invalid-argument', 'Confirmed payout reference is required before marking Paid.');
    }
    const db = getDb();
    const wReqRef = db.collection('withdrawal_requests').doc(withdrawalId);
    await db.runTransaction(async (tx) => {
        const wReqSnap = await tx.get(wReqRef);
        if (!wReqSnap.exists)
            throw new https_1.HttpsError('not-found', 'Withdrawal request not found.');
        const reqData = wReqSnap.data();
        const currentStatus = String(reqData.status || 'pending');
        if (!(VALID_TRANSITIONS[currentStatus] || []).includes(nextStatus)) {
            throw new https_1.HttpsError('failed-precondition', `Invalid status transition from ${currentStatus} to ${nextStatus}.`);
        }
        if (reqData.uid === actorUid && !adminInfo.isOwner) {
            throw new https_1.HttpsError('permission-denied', 'You cannot process your own withdrawal request.');
        }
        const walletRef = db.collection('wallets').doc(String(reqData.uid));
        const walletSnap = await tx.get(walletRef);
        const w = walletSnap.exists ? walletSnap.data() || {} : {};
        const pointsRequested = Number(reqData.pointsRequested || 0);
        const nairaAmount = Number(reqData.nairaAmount || 0);
        const avail = Math.max(0, Number(w.availablePoints || 0));
        const locked = Math.max(0, Number(w.lockedPoints || 0));
        tx.update(wReqRef, {
            status: nextStatus,
            reviewedBy: actorUid,
            ...(adminNote ? { adminNote } : {}),
            ...(nextStatus === 'paid'
                ? {
                    paymentReference,
                    paidBy: actorUid,
                    paidAt: firestore_1.FieldValue.serverTimestamp(),
                }
                : {}),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        if (nextStatus === 'rejected') {
            const nextAvail = avail + pointsRequested;
            const nextLocked = Math.max(0, locked - pointsRequested);
            tx.update(walletRef, {
                availablePoints: nextAvail,
                lockedPoints: nextLocked,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            tx.set(db.collection('wallet_transactions').doc(`wrefund_${withdrawalId}`), {
                uid: String(reqData.uid),
                type: 'withdrawal_refund',
                direction: 'credit',
                points: pointsRequested,
                nairaEquivalent: nairaAmount,
                pointRateNaira: Number(reqData.pointRateNaira || 0),
                referenceId: withdrawalId,
                description: adminNote || 'Withdrawal rejected — Key Points returned to available balance',
                actorUid,
                balanceAfterAvailable: nextAvail,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        else if (nextStatus === 'paid') {
            const nextLocked = Math.max(0, locked - pointsRequested);
            tx.update(walletRef, {
                lockedPoints: nextLocked,
                lifetimeWithdrawnPoints: Math.max(0, Number(w.lifetimeWithdrawnPoints || 0)) + pointsRequested,
                lifetimeWithdrawnNaira: Math.max(0, Number(w.lifetimeWithdrawnNaira || 0)) + nairaAmount,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            tx.set(db.collection('wallet_transactions').doc(`wpaid_${withdrawalId}`), {
                uid: String(reqData.uid),
                type: 'withdrawal_paid',
                direction: 'debit',
                points: pointsRequested,
                nairaEquivalent: nairaAmount,
                pointRateNaira: Number(reqData.pointRateNaira || 0),
                referenceId: withdrawalId,
                description: `Payout confirmed (${paymentReference})`,
                actorUid,
                balanceAfterAvailable: avail,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        tx.set(db.collection('notifications').doc(), {
            recipientId: String(reqData.uid),
            actorId: actorUid,
            actorName: 'Nexora Payouts',
            actorAvatar: '',
            type: 'withdrawal_update',
            category: 'rewards',
            title: `Withdrawal ${nextStatus.replace('_', ' ').toUpperCase()}`,
            targetType: 'wallet',
            targetId: withdrawalId,
            dedupeKey: `wstat_${withdrawalId}_${nextStatus}`,
            preview: nextStatus === 'paid'
                ? `Your ₦${nairaAmount.toLocaleString('en-NG')} bank payout has been confirmed (Ref: ${paymentReference}).`
                : nextStatus === 'rejected'
                    ? `Your withdrawal was declined (${adminNote || 'no note'}). ${pointsRequested} Key Points were restored.`
                    : `Your withdrawal status updated to ${nextStatus.replace('_', ' ')}.`,
            read: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return { ok: true, status: nextStatus };
});
/**
 * Callable (Admin): Manually credit or debit a user's Key Points balance with mandatory reason.
 */
exports.adminAdjustWallet = (0, https_1.onCall)(async (request) => {
    if (!request.auth || !isCallerVerified(request.auth)) {
        throw new https_1.HttpsError('unauthenticated', 'Verified session required.');
    }
    const actorUid = request.auth.uid;
    await assertAuthorizedAdmin(actorUid, request.auth.token?.email, 'manage_rewards');
    const targetUid = String(request.data?.targetUid || '').trim();
    const direction = request.data?.direction === 'debit' ? 'debit' : 'credit';
    const points = Number(request.data?.points || 0);
    const reason = String(request.data?.reason || '').trim().slice(0, 300);
    if (!targetUid || !Number.isFinite(points) || points <= 0 || reason.length < 3) {
        throw new https_1.HttpsError('invalid-argument', 'Target user, positive points, and reason are required.');
    }
    const db = getDb();
    const walletRef = db.collection('wallets').doc(targetUid);
    const txRef = db.collection('wallet_transactions').doc();
    let newBalance = 0;
    await db.runTransaction(async (tx) => {
        const walletSnap = await tx.get(walletRef);
        const w = walletSnap.exists ? walletSnap.data() || {} : {};
        const avail = Math.max(0, Number(w.availablePoints || 0));
        if (direction === 'debit' && avail < points) {
            throw new https_1.HttpsError('failed-precondition', 'Cannot debit more Key Points than available balance.');
        }
        newBalance = direction === 'credit' ? avail + points : avail - points;
        const nextEarned = direction === 'credit'
            ? Math.max(0, Number(w.lifetimeEarnedPoints || 0)) + points
            : Math.max(0, Number(w.lifetimeEarnedPoints || 0));
        tx.set(walletRef, {
            uid: targetUid,
            availablePoints: newBalance,
            pendingPoints: Math.max(0, Number(w.pendingPoints || 0)),
            lockedPoints: Math.max(0, Number(w.lockedPoints || 0)),
            lifetimeEarnedPoints: nextEarned,
            lifetimeWithdrawnPoints: Math.max(0, Number(w.lifetimeWithdrawnPoints || 0)),
            lifetimeWithdrawnNaira: Math.max(0, Number(w.lifetimeWithdrawnNaira || 0)),
            frozen: Boolean(w.frozen),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.set(txRef, {
            uid: targetUid,
            type: direction === 'credit' ? 'admin_credit' : 'admin_debit',
            direction,
            points,
            nairaEquivalent: null,
            pointRateNaira: null,
            referenceId: txRef.id,
            description: reason,
            actorUid,
            balanceAfterAvailable: newBalance,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.set(db.collection('notifications').doc(), {
            recipientId: targetUid,
            actorId: actorUid,
            actorName: 'Nexora Wallet Team',
            actorAvatar: '',
            type: 'wallet_adjustment',
            category: 'rewards',
            title: direction === 'credit' ? `+${points} Key Points Credited` : `${points} Key Points Debited`,
            targetType: 'wallet',
            targetId: txRef.id,
            dedupeKey: txRef.id,
            preview: reason,
            read: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return { ok: true, balanceAfterAvailable: newBalance, transactionId: txRef.id };
});
/**
 * Callable (Owner / Admin): Update global rewards & withdrawal configuration.
 * Only the Owner may modify `pointRateNaira`.
 */
exports.updateRewardsConfig = (0, https_1.onCall)(async (request) => {
    if (!request.auth || !isCallerVerified(request.auth)) {
        throw new https_1.HttpsError('unauthenticated', 'Verified session required.');
    }
    const actorUid = request.auth.uid;
    const adminInfo = await assertAuthorizedAdmin(actorUid, request.auth.token?.email, 'manage_withdrawals');
    const db = getDb();
    const cfgRef = db.collection('rewards_config').doc('global');
    const existingSnap = await cfgRef.get();
    const existing = existingSnap.exists ? existingSnap.data() || {} : {};
    const incomingRate = request.data?.pointRateNaira;
    if (incomingRate !== undefined && incomingRate !== existing.pointRateNaira && !adminInfo.isOwner) {
        throw new https_1.HttpsError('permission-denied', 'Only the Nexora Owner may configure the Key Point conversion rate.');
    }
    const nextRate = incomingRate === null
        ? null
        : typeof incomingRate === 'number' && Number.isFinite(incomingRate) && incomingRate > 0
            ? incomingRate
            : existing.pointRateNaira ?? null;
    const minNaira = typeof request.data?.minWithdrawalNaira === 'number' &&
        Number.isFinite(request.data.minWithdrawalNaira) &&
        request.data.minWithdrawalNaira >= 100
        ? request.data.minWithdrawalNaira
        : Number(existing.minWithdrawalNaira || DEFAULT_MIN_WITHDRAWAL_NAIRA);
    await cfgRef.set({
        id: 'global',
        withdrawalsOpen: typeof request.data?.withdrawalsOpen === 'boolean'
            ? request.data.withdrawalsOpen
            : existing.withdrawalsOpen !== false,
        pointRateNaira: nextRate,
        minWithdrawalNaira: minNaira,
        referralsPerPoint: Math.max(1, Number(request.data?.referralsPerPoint || existing.referralsPerPoint || REFERRALS_PER_KEY_POINT)),
        pointsPerMilestone: Math.max(1, Number(request.data?.pointsPerMilestone || existing.pointsPerMilestone || POINTS_PER_REFERRAL_MILESTONE)),
        invitationsEnabled: typeof request.data?.invitationsEnabled === 'boolean'
            ? request.data.invitationsEnabled
            : existing.invitationsEnabled !== false,
        tasksEnabled: typeof request.data?.tasksEnabled === 'boolean'
            ? request.data.tasksEnabled
            : existing.tasksEnabled !== false,
        lockReason: String(request.data?.lockReason ?? existing.lockReason ?? '').slice(0, 240),
        updatedBy: actorUid,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true };
});
//# sourceMappingURL=index.js.map