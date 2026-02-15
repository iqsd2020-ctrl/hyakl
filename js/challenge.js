/**
 * تحدي صديق
 * Handles invites, matches, and realtime progress.
 */

import { 
    collection, doc, setDoc, getDoc, updateDoc, addDoc, 
    query, where, onSnapshot, serverTimestamp, deleteDoc,
    limit, orderBy, runTransaction, increment
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

import { 
    ref, set, onValue, onDisconnect, remove, 
    serverTimestamp as rtdbTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

let challengeState = {
    currentInviteId: null,
    currentMatchId: null,
    opponentData: null,
    isHost: false,
    questions: [],
    currentIdx: 0,
    myScore: 0,
    myCorrect: 0,
    myLives: 3,
    opponentProgress: { answered: 0, correct: 0, lives: 3 },
    inviteTimer: null,
    matchUnsub: null,
    matchRealtimeUnsub: null,
    rtdbUnsub: null,
    awaitingFinal: false,
    selectedBank: "random_all",
    finishLock: false
};

// --- Initialization ---
export function initChallengeSystem() {
    if (!window.db) return;
    window.effectiveUserId = window.effectiveUserId ?? window.auth?.currentUser?.uid ?? window.firebaseAuth?.currentUser?.uid ?? window.user?.uid;
    if (!window.effectiveUserId) return;
    listenForIncomingInvites();
}

// --- Invite Logic ---

function listenForIncomingInvites() {
    const q = query(
        collection(window.db, "challengeInvites"),
        where("toId", "==", window.effectiveUserId),
        where("status", "==", "pending"),
        limit(1)
    );

    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const invite = change.doc.data();
                const inviteId = change.doc.id;
                
                // Check expiry
                const now = Date.now();
                const createdAt = invite.createdAt?.toMillis() || now;
                if (now - createdAt > 60000) {
                    updateDoc(doc(window.db, "challengeInvites", inviteId), { status: "expired" });
                    return;
                }

                showIncomingInvite(inviteId, invite);
            }
        });
}, (err) => {
        console.error(err);
        window.toast("تعذر استقبال التحديات: صلاحيات غير كافية", "error");
    });
}

function showIncomingInvite(inviteId, invite) {
    const modal = document.getElementById('challenge-receive-modal');
    const text = document.getElementById('challenge-receive-text');
    const timerSpan = document.getElementById('receive-timer');
    const avatarBox = document.getElementById('challenge-receive-avatar');
    
    if (!modal || !text) return;

    if (avatarBox && invite.fromAvatar && typeof window.getAvatarHTML === 'function') {
        avatarBox.innerHTML = window.getAvatarHTML(invite.fromAvatar, invite.fromFrame || 'default', "w-full h-full");
    }

    text.textContent = `${invite.fromName} يتحداك بـ ${window.toArabicDigits(invite.questionCount)} أسئلة!`;
    modal.classList.add('active');
    
    let timeLeft = 60;
    const timer = setInterval(() => {
        timeLeft--;
        if (timerSpan) timerSpan.textContent = window.toArabicDigits(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timer);
            updateDoc(doc(window.db, "challengeInvites", inviteId), { status: "expired" });
            modal.classList.remove('active');
        }
    }, 1000);

    document.getElementById('btn-accept-challenge').onclick = () => {
        clearInterval(timer);
        acceptInvite(inviteId, invite);
    };

    document.getElementById('btn-reject-challenge').onclick = () => {
        clearInterval(timer);
        updateDoc(doc(window.db, "challengeInvites", inviteId), { status: "rejected" });
        modal.classList.remove('active');
    };
}

export function openChallengeSetup(opponentData) {
    challengeState.opponentData = opponentData;
    if (challengeState.opponentData) {
        const oid =
            challengeState.opponentData.uid ??
            challengeState.opponentData.userId ??
            challengeState.opponentData.id ??
            challengeState.opponentData.docId;
        if (oid != null) challengeState.opponentData.uid = oid;
    }
    const modal = document.getElementById('challenge-setup-modal');
    if (modal) {
        modal.classList.add('active');
        const closeBtn = modal.querySelector('.close-modal');
        if (closeBtn) {
            closeBtn.onclick = () => modal.classList.remove('active');
        }
    }

    const bankBtns = document.querySelectorAll('.challenge-bank-btn');
    const setActiveBank = (bank) => {
        challengeState.selectedBank = bank;
        bankBtns.forEach(b => {
            if (b.getAttribute('data-bank') === bank) {
                b.classList.add('border-orange-500/60', 'bg-slate-700');
            } else {
                b.classList.remove('border-orange-500/60', 'bg-slate-700');
            }
        });
    };

    setActiveBank("random_all");

    bankBtns.forEach(btn => {
        btn.onclick = () => {
            const bank = btn.getAttribute('data-bank');
            if (bank) setActiveBank(bank);
        };
    });

    const btns = document.querySelectorAll('.challenge-opt-btn');
    btns.forEach(btn => {
        btn.onclick = () => {
            const count = parseInt(btn.getAttribute('data-count'));
            sendInvite(count);
            modal.classList.remove('active');
        };
    });
}

async function sendInvite(questionCount) {
    if (!challengeState.opponentData) return;

    const fromId =
        window.effectiveUserId ??
        window.auth?.currentUser?.uid ??
        window.firebaseAuth?.currentUser?.uid ??
        window.user?.uid;

    const toId =
        challengeState.opponentData?.uid ??
        challengeState.opponentData?.userId ??
        challengeState.opponentData?.id ??
        challengeState.opponentData?.docId;

    if (fromId == null) {
        window.toast("تعذر إرسال الدعوة: تعذر تحديد معرف حسابك", "error");
        return;
    }
    if (toId == null) {
        window.toast("تعذر إرسال الدعوة: تعذر تحديد معرف الخصم", "error");
        return;
    }

    const existingQ = query(
        collection(window.db, "challengeInvites"),
        where("fromId", "==", fromId),
        where("toId", "==", toId),
        where("status", "==", "pending")
    );
    const existing = await window.getDocs(existingQ);
    if (!existing.empty) {
        window.toast("لديك دعوة معلقة بالفعل لهذا اللاعب", "info");
        return;
    }

    const inviteData = {
        fromId: fromId,
        fromName: window.userProfile?.username || window.auth?.currentUser?.displayName || 'لاعب',
        fromAvatar: window.userProfile?.customAvatar || window.auth?.currentUser?.photoURL || '',
        fromFrame: window.userProfile?.equippedFrame || 'default',
        toId: toId,
        questionCount: questionCount,
        questionBank: challengeState.selectedBank || "random_all",
        status: "pending",
        createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(window.db, "challengeInvites"), inviteData);
    challengeState.currentInviteId = docRef.id;
    challengeState.isHost = true;

    document.getElementById('settings-modal')?.classList.remove('active');

    showWaitingModal(questionCount);
    listenToInviteStatus(docRef.id);
}

function showWaitingModal(questionCount) {
    const modal = document.getElementById('challenge-waiting-modal');
    const timerSpan = document.getElementById('challenge-timer');
    const details = document.getElementById('challenge-waiting-details');
    if (!modal) return;

    if (details && challengeState.opponentData) {
        const name = challengeState.opponentData.username || challengeState.opponentData.name || 'الخصم';
        details.textContent = `تم إرسال الدعوة إلى ${name} • عدد الأسئلة: ${window.toArabicDigits(questionCount)}`;
    }

    modal.classList.add('active');
    let timeLeft = 60;
    challengeState.inviteTimer = setInterval(() => {
        timeLeft--;
        if (timerSpan) timerSpan.textContent = window.toArabicDigits(timeLeft);
        if (timeLeft <= 0) {
            cancelInvite();
        }
    }, 1000);

    document.getElementById('btn-cancel-challenge').onclick = cancelInvite;
}

async function cancelInvite() {
    if (challengeState.inviteTimer) clearInterval(challengeState.inviteTimer);
    if (challengeState.currentInviteId) {
        await updateDoc(doc(window.db, "challengeInvites", challengeState.currentInviteId), { status: "expired" });
    }
    document.getElementById('challenge-waiting-modal')?.classList.remove('active');
}

function listenToInviteStatus(inviteId) {
    const unsub = onSnapshot(doc(window.db, "challengeInvites", inviteId), (snap) => {
        const data = snap.data();
        if (!data) return;

        if (data.status === "accepted") {
            unsub();
            if (challengeState.inviteTimer) clearInterval(challengeState.inviteTimer);
            document.getElementById('challenge-waiting-modal')?.classList.remove('active');
            // Host will wait for match doc to be created by acceptor or create it themselves
            // In this design, let's make the acceptor create the match doc for simplicity
        } else if (data.status === "rejected") {
            unsub();
            if (challengeState.inviteTimer) clearInterval(challengeState.inviteTimer);
            document.getElementById('challenge-waiting-modal')?.classList.remove('active');
            window.toast("تم رفض التحدي من قبل الخصم", "info");
        } else if (data.status === "expired") {
            unsub();
            if (challengeState.inviteTimer) clearInterval(challengeState.inviteTimer);
            document.getElementById('challenge-waiting-modal')?.classList.remove('active');
            window.toast("انتهت صلاحية الدعوة", "info");
        }
    });

    // Also listen for match creation
    const matchQ = query(
        collection(window.db, "challengeMatches"),
        where("inviteId", "==", inviteId),
        limit(1)
    );
    const matchUnsub = onSnapshot(matchQ, (snapshot) => {
        if (!snapshot.empty) {
            matchUnsub();
            const matchDoc = snapshot.docs[0];
            startMatch(matchDoc.id, matchDoc.data());
        }
    });
}

async function acceptInvite(inviteId, invite) {
    await updateDoc(doc(window.db, "challengeInvites", inviteId), { status: "accepted" });
    document.getElementById('challenge-receive-modal')?.classList.remove('active');
    document.getElementById('settings-modal')?.classList.remove('active');

    // Create Match Doc
    const questionIds = await pickRandomQuestions(invite.questionCount, invite.questionBank);
    const matchData = {
        inviteId: inviteId,
        player1Id: invite.fromId,
        player2Id: invite.toId,
        player1Name: invite.fromName,
        player2Name: window.userProfile?.username || window.auth?.currentUser?.displayName || 'لاعب',
        questionIds: questionIds,
        questionCount: invite.questionCount,
        status: "active",
        createdAt: serverTimestamp()
    };

    const matchRef = await addDoc(collection(window.db, "challengeMatches"), matchData);
    challengeState.isHost = false;
    challengeState.opponentData = { uid: invite.fromId, username: invite.fromName };
    startMatch(matchRef.id, matchData);
}

const challengeBankDefs = {
    aqida_fiqh: { path: 'Data/Noor/aqida_fiqh.json', type: 'mcq' },
    dataNooR: { path: 'Data/Noor/dataNooR.json', type: 'mcq' },
    dua_ziyarat: { path: 'Data/Noor/dua_ziyarat.json', type: 'mcq' },
    general_info: { path: 'Data/Noor/general_info.json', type: 'mcq' },
    history_battles: { path: 'Data/Noor/history_battles.json', type: 'mcq' },
    infallibles_all: { path: 'Data/Noor/infallibles_all.json', type: 'mcq' },
    mahdi_culture: { path: 'Data/Noor/mahdi_culture.json', type: 'mcq' },
    personalities: { path: 'Data/Noor/personalities.json', type: 'mcq' },
    prophets: { path: 'Data/Noor/prophets.json', type: 'mcq' },
    quran_nahj: { path: 'Data/Noor/quran_nahj.json', type: 'mcq' },
    truefalse: { path: 'Data/Noor/truefalse.json', type: 'tf' }
};

const challengeBankCache = {};

async function loadChallengeBank(bankKey) {
    if (challengeBankCache[bankKey]) return challengeBankCache[bankKey];
    const def = challengeBankDefs[bankKey];
    if (!def) throw new Error('Unknown bank');
    const response = await fetch(def.path);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    const all = Array.isArray(data) ? data : (data.questions || []);
    challengeBankCache[bankKey] = all;
    return all;
}

async function pickRandomQuestions(count, selection) {
    try {
        const sel = selection || "dataNooR";
        const banks =
            sel === "random_all" ? Object.keys(challengeBankDefs) :
            sel === "general_info" ? ["general_info"] :
            sel === "dataNooR" ? ["dataNooR"] :
            sel === "truefalse" ? ["truefalse"] :
            ["dataNooR"];

        if (banks.length === 1) {
            const bankKey = banks[0];
            const allQuestions = await loadChallengeBank(bankKey);
            if (allQuestions.length === 0) throw new Error('No questions found');

            const indices = Array.from({length: allQuestions.length}, (_, i) => i);
            const shuffled = indices.sort(() => 0.5 - Math.random());

            return shuffled.slice(0, count).map(idx => ({ bank: bankKey, idx }));
        }

        const refs = [];
        for (const bankKey of banks) {
            const allQuestions = await loadChallengeBank(bankKey);
            for (let i = 0; i < allQuestions.length; i++) {
                refs.push({ bank: bankKey, idx: i });
            }
        }

        if (refs.length === 0) throw new Error('No questions found');

        const shuffled = refs.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    } catch (e) {
        console.error("Failed to pick questions, using fallback indices", e);
        return Array.from({length: count}, (_, i) => i);
    }
}

// --- Match Logic ---

async function startMatch(matchId, matchData) {
    challengeState.currentMatchId = matchId;
    challengeState.currentIdx = 0;
    challengeState.myScore = 0;
    challengeState.myCorrect = 0;
    challengeState.myLives = 3;
    challengeState.opponentProgress = { answered: 0, correct: 0, lives: 3 };

    window.effectiveUserId = window.effectiveUserId ?? window.auth?.currentUser?.uid ?? window.firebaseAuth?.currentUser?.uid ?? window.user?.uid;

document.getElementById('player-profile-modal')?.classList.remove('active');
    challengeState.awaitingFinal = false;
    challengeState.finishLock = false;

    // Load Questions
    challengeState.questions = await fetchQuestionsByIds(matchData.questionIds);
    
    // Setup UI
    document.getElementById('opponent-name-label').textContent = challengeState.isHost ? matchData.player2Name : matchData.player1Name;
    updateMatchUI();
    document.getElementById('challenge-match-view').classList.remove('hidden');
    
    // Setup RTDB Presence & Progress
    setupMatchRealtime(matchData);
    
    // Show first question
    showNextChallengeQuestion();
}
async function fetchQuestionsByIds(ids) {
    try {
        const result = [];

        for (const id of ids) {
            if (id && typeof id === 'object' && id.bank) {
                const bankKey = id.bank;
                const all = await loadChallengeBank(bankKey);
                if (all.length === 0) throw new Error('No questions found');

                const idx = parseInt(id.idx);
                const item = !isNaN(idx) ? all[idx % all.length] : all[Math.floor(Math.random() * all.length)];

                if (challengeBankDefs[bankKey]?.type === 'tf') {
                    result.push({
                        question: item.q ?? item.question ?? "",
                        options: ["صح", "خطأ"],
                        correctAnswer: item.a ? 0 : 1,
                        topic: "صح وخطأ"
                    });
                } else {
                    result.push(item);
                }
                continue;
            }

            const idx = parseInt(id);
            const all = await loadChallengeBank('dataNooR');
            if (all.length === 0) throw new Error('No questions found');

            if (!isNaN(idx)) {
                result.push(all[idx % all.length]);
            } else {
                result.push(all.find(q => q.id === id) || all[Math.floor(Math.random() * all.length)]);
            }
        }

        return result;
    } catch (e) {
        console.error("Error fetching questions by IDs", e);
        return ids.map((_, i) => ({
            question: "تعذر تحميل السؤال، يرجى التحقق من الاتصال",
            options: ["خيار 1", "خيار 2", "خيار 3", "خيار 4"],
            correctAnswer: 0
        }));
    }
}
function setupMatchRealtime(matchData) {
    const matchId = challengeState.currentMatchId;
    const myId = window.effectiveUserId ?? window.auth?.currentUser?.uid ?? window.firebaseAuth?.currentUser?.uid ?? window.user?.uid;
    if (myId != null) window.effectiveUserId = myId;

    const p1 = matchData?.player1Id;
    const p2 = matchData?.player2Id;
    const oppId = (myId === p1) ? p2 : p1;

    if (myId == null || oppId == null) return;

    const myRef = ref(window.rtdb, `matches/${matchId}/${myId}`);
    const oppRef = ref(window.rtdb, `matches/${matchId}/${oppId}`);

    // Initial state
    set(myRef, {
        answered: 0,
        correct: 0,
        lives: 3,
        status: "playing"
    });

    // Disconnect handler
    onDisconnect(myRef).update({ status: "disconnected" });

    // Listen to opponent
    challengeState.rtdbUnsub = onValue(oppRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            challengeState.opponentProgress = data;
            updateMatchUI();
            checkMatchEndConditions();
        }
    });

    challengeState.matchRealtimeUnsub = onSnapshot(doc(window.db, "challengeMatches", matchId), (snap) => {
        const d = snap.data();
        if (!d) return;
        const oppField = (myId === d.player1Id) ? 'player2Progress' : 'player1Progress';
        const opp = d[oppField];
        if (!opp) return;

        challengeState.opponentProgress = {
            answered: opp.answered ?? challengeState.opponentProgress.answered ?? 0,
            correct: opp.correct ?? challengeState.opponentProgress.correct ?? 0,
            lives: opp.lives ?? challengeState.opponentProgress.lives ?? 3,
            status: challengeState.opponentProgress.status
        };
        updateMatchUI();
        checkMatchEndConditions();
    });
}

function updateMatchUI() {
    const total = challengeState.questions.length;
    
    // My Progress
    const myPct = (challengeState.currentIdx / total) * 100;
    document.getElementById('my-challenge-progress-fill').style.width = `${myPct}%`;
    document.getElementById('my-challenge-progress-text').textContent = window.toArabicDigits(`${challengeState.currentIdx}/${total}`);
    
    // Opponent Progress
    const oppPct = (challengeState.opponentProgress.answered / total) * 100;
    document.getElementById('opponent-challenge-progress-fill').style.width = `${oppPct}%`;
    document.getElementById('opponent-challenge-progress-text').textContent = window.toArabicDigits(`${challengeState.opponentProgress.answered}/${total}`);
    
    // Score
    document.getElementById('challenge-match-score').textContent = window.toArabicDigits(`${challengeState.myCorrect} - ${challengeState.opponentProgress.correct}`);
    
    // Lives
    renderChallengeLives('my-challenge-lives', challengeState.myLives);
    renderChallengeLives('opponent-challenge-lives', challengeState.opponentProgress.lives);
}

function renderChallengeLives(containerId, count) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const span = document.createElement('span');
        span.className = `material-symbols-rounded text-sm ${i < count ? 'text-red-500' : 'text-slate-600'}`;
        span.textContent = i < count ? 'favorite' : 'favorite_border';
        container.appendChild(span);
    }
}

function showNextChallengeQuestion() {
    if (challengeState.currentIdx >= challengeState.questions.length) {
        finishMatch();
        return;
    }

    const q = challengeState.questions[challengeState.currentIdx];
    const textEl = document.getElementById('challenge-question-text');
    const topicEl = document.getElementById('challenge-question-topic');
    const optionsContainer = document.getElementById('challenge-options-container');
    
    textEl.textContent = q.question;
    if (topicEl) topicEl.textContent = q.topic || "";
    optionsContainer.innerHTML = '';

    q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = "option-btn group relative overflow-hidden w-full p-3 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 transition-all flex items-center gap-4 text-right";
        btn.innerHTML = `
            <span class="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 font-bold group-hover:text-amber-400 transition-colors shrink-0 font-mono">${window.toArabicDigits(i+1)}</span>
            <span class="font-bold text-white flex-1">${opt}</span>
        `;
        btn.onclick = () => handleChallengeAnswer(i, btn);
        optionsContainer.appendChild(btn);
    });
}

function handleChallengeAnswer(idx, btn) {
    const q = challengeState.questions[challengeState.currentIdx];
    const isCorrect = idx === q.correctAnswer;
    const btns = document.querySelectorAll('#challenge-options-container .option-btn');
    
    btns.forEach(b => b.classList.add('pointer-events-none', 'opacity-50'));
    btn.classList.remove('opacity-50');

    if (isCorrect) {
        btn.classList.add('border-green-500', 'bg-green-500/20');
        challengeState.myCorrect++;
    } else {
        btn.classList.add('border-red-500', 'bg-red-500/20');
        challengeState.myLives--;
        // Show correct
        btns[q.correctAnswer].classList.remove('opacity-50');
        btns[q.correctAnswer].classList.add('border-green-500', 'bg-green-500/10');
    }

    challengeState.currentIdx++;
    
    // Update RTDB
    const myId = window.effectiveUserId ?? window.auth?.currentUser?.uid ?? window.firebaseAuth?.currentUser?.uid ?? window.user?.uid;
    if (myId != null) window.effectiveUserId = myId;
    const myRef = ref(window.rtdb, `matches/${challengeState.currentMatchId}/${myId}`);
    updateDoc(doc(window.db, "challengeMatches", challengeState.currentMatchId), {
        [challengeState.isHost ? 'player1Progress' : 'player2Progress']: {
            answered: challengeState.currentIdx,
            correct: challengeState.myCorrect,
            lives: challengeState.myLives
        }
    });
    set(myRef, {
        answered: challengeState.currentIdx,
        correct: challengeState.myCorrect,
        lives: challengeState.myLives,
        status: challengeState.myLives <= 0 ? "finished" : "playing"
    });

    updateMatchUI();

    if (challengeState.myLives <= 0) {
        setTimeout(() => finishMatch("lost_lives"), 1500);
    } else {
        setTimeout(showNextChallengeQuestion, 1500);
    }
}

function checkMatchEndConditions() {
    if (challengeState.opponentProgress.lives <= 0) {
        // Opponent lost all lives, but I should continue until I finish or lose
    }
    if (challengeState.opponentProgress.status === "disconnected") {
        finishMatch("opponent_disconnected");
    }
}

async function finishMatch(reason = "normal") {
    if (challengeState.finishLock) return;
    challengeState.finishLock = true;

    if (challengeState.rtdbUnsub) {
        challengeState.rtdbUnsub();
        challengeState.rtdbUnsub = null;
    }

    if (challengeState.matchRealtimeUnsub) {
        challengeState.matchRealtimeUnsub();
        challengeState.matchRealtimeUnsub = null;
    }

    const matchId = challengeState.currentMatchId;
    const myId = window.effectiveUserId ?? window.auth?.currentUser?.uid ?? window.firebaseAuth?.currentUser?.uid ?? window.user?.uid;
    if (myId != null) window.effectiveUserId = myId;
    const total = challengeState.questions.length;

    const myRef = ref(window.rtdb, `matches/${matchId}/${myId}`);
    set(myRef, {
        answered: challengeState.currentIdx,
        correct: challengeState.myCorrect,
        lives: challengeState.myLives,
        status: "finished"
    });

    document.getElementById('challenge-match-view').classList.add('hidden');

    const matchRef = doc(window.db, "challengeMatches", matchId);
    const matchSnap = await getDoc(matchRef);
    const matchData = matchSnap.data();
    if (!matchData) {
        challengeState.finishLock = false;
        return;
    }

    const myIsP1 = (myId === matchData.player1Id);
    const oppP = myIsP1 ? matchData.player2Progress : matchData.player1Progress;

    const oppAnswered = oppP?.answered ?? 0;
    const oppCorrect = oppP?.correct ?? 0;
    const oppLives = oppP?.lives ?? 3;

    challengeState.opponentProgress = { answered: oppAnswered, correct: oppCorrect, lives: oppLives };

    const oppFinished = (oppAnswered >= total) || (oppLives <= 0);

    if (reason === "opponent_disconnected" || reason === "quit" || oppFinished) {
        showResult(reason, matchData);
        return;
    }

    showPendingFinal(matchData, challengeState.myCorrect, total, oppAnswered);

    challengeState.awaitingFinal = true;
    challengeState.matchUnsub = onSnapshot(matchRef, (snap) => {
        const d = snap.data();
        if (!d) return;
        if (!challengeState.awaitingFinal) return;

        const mineIsP1 = (myId === d.player1Id);
        const myP = mineIsP1 ? d.player1Progress : d.player2Progress;
        const opp = mineIsP1 ? d.player2Progress : d.player1Progress;

        const myCorrect = myP?.correct ?? challengeState.myCorrect;
        const myLives = myP?.lives ?? challengeState.myLives;
        const oAnswered = opp?.answered ?? 0;
        const oCorrect = opp?.correct ?? 0;
        const oLives = opp?.lives ?? 3;

        challengeState.opponentProgress = { answered: oAnswered, correct: oCorrect, lives: oLives };

        const oFinished = (oAnswered >= total) || (oLives <= 0);
        if (!oFinished) return;

        challengeState.awaitingFinal = false;
        if (challengeState.matchUnsub) {
            challengeState.matchUnsub();
            challengeState.matchUnsub = null;
        }

        showFinalAfterWait(d, myCorrect, oCorrect, total, myLives, oLives);
    });
}
function showPendingFinal(matchData, myCorrect, total, oppAnswered) {
    const modal = document.getElementById('challenge-result-modal');
    const title = document.getElementById('challenge-result-title');
    const reasonText = document.getElementById('challenge-result-reason');
    const myRes = document.getElementById('my-final-result');
    const oppRes = document.getElementById('opponent-final-result');

    const oppName = challengeState.opponentData?.username || (challengeState.isHost ? matchData.player2Name : matchData.player1Name) || 'الخصم';

    modal.classList.add('active');
    title.textContent = "تم تسجيل نتيجتك";
    reasonText.textContent = `الخصم لا يزال يلعب (${window.toArabicDigits(`${oppAnswered}/${total}`)}) • سنُعلمك بالنتيجة النهائية عند انتهائه`;

    myRes.textContent = window.toArabicDigits(`${myCorrect}/${total}`);
    oppRes.textContent = `—/${window.toArabicDigits(`${total}`)}`;
    applyChallengeCorrectToLeaderboard(myCorrect);

    document.getElementById('btn-close-challenge-result').onclick = () => {
        modal.classList.remove('active');
    };
}

function showFinalAfterWait(matchData, myCorrect, oppCorrect, total, myLives, oppLives) {
    const modal = document.getElementById('challenge-result-modal');
    const title = document.getElementById('challenge-result-title');
    const reasonText = document.getElementById('challenge-result-reason');
    const myRes = document.getElementById('my-final-result');
    const oppRes = document.getElementById('opponent-final-result');

    const oppName = challengeState.opponentData?.username || (challengeState.isHost ? matchData.player2Name : matchData.player1Name) || 'الخصم';

    const mLives = (typeof myLives === 'number') ? myLives : challengeState.myLives;
    const oLives = (typeof oppLives === 'number') ? oppLives : (challengeState.opponentProgress?.lives ?? 3);

    modal.classList.add('active');

    myRes.textContent = window.toArabicDigits(`${myCorrect}/${total}`);
    oppRes.textContent = window.toArabicDigits(`${oppCorrect}/${total}`);
    applyChallengeCorrectToLeaderboard(myCorrect);

    if (mLives <= 0) {
        title.textContent = "خسرت";
        reasonText.textContent = "نفدت قلوبك!";
    } else if (oLives <= 0) {
        title.textContent = "فزت!";
        reasonText.textContent = "نفدت قلوب الخصم!";
    } else {
        title.textContent = `نتيجة جولتك مع ${oppName} كانت:`;

        if (myCorrect > oppCorrect) {
            reasonText.textContent = "أنت الفائز النهائي";
        } else if (myCorrect < oppCorrect) {
            reasonText.textContent = `${oppName} هو الفائز النهائي`;
        } else {
            reasonText.textContent = "تعادل";
        }
    }

    settleChallengePoints("normal");

    try {
        const oppName = challengeState.opponentData?.username || 'الخصم';
        const body = `${title.textContent} ضد ${oppName} • ${window.toArabicDigits(`${myCorrect}/${total}`)} - ${window.toArabicDigits(`${oppCorrect}/${total}`)} • ${reasonText.textContent}`;
        if (typeof window.addLocalNotification === 'function') window.addLocalNotification('نتيجة تحدي صديق', body, 'swords');
    } catch (_) {}

    document.getElementById('btn-close-challenge-result').onclick = () => {
        modal.classList.remove('active');
        if (challengeState.matchUnsub) {
            challengeState.matchUnsub();
            challengeState.matchUnsub = null;
        }
        challengeState.awaitingFinal = false;
        challengeState.finishLock = false;
        challengeState.currentMatchId = null;
    };
}
function showResult(reason, matchData) {
    const modal = document.getElementById('challenge-result-modal');
    const title = document.getElementById('challenge-result-title');
    const reasonText = document.getElementById('challenge-result-reason');
    const myRes = document.getElementById('my-final-result');
    const oppRes = document.getElementById('opponent-final-result');
    
    document.getElementById('challenge-match-view').classList.add('hidden');
    modal.classList.add('active');

    const myCorrect = challengeState.myCorrect;
    const oppCorrect = challengeState.opponentProgress.correct;
    const total = challengeState.questions.length;

    myRes.textContent = window.toArabicDigits(`${myCorrect}/${total}`);
    oppRes.textContent = window.toArabicDigits(`${oppCorrect}/${total}`);
    applyChallengeCorrectToLeaderboard(myCorrect);

    if (reason === "opponent_disconnected") {
        title.textContent = "فزت!";
        reasonText.textContent = "الخصم انسحب من المباراة";
    } else if (challengeState.myLives <= 0) {
        title.textContent = "خسرت";
        reasonText.textContent = "نفدت قلوبك!";
    } else if (challengeState.opponentProgress.lives <= 0) {
        title.textContent = "فزت!";
        reasonText.textContent = "نفدت قلوب الخصم!";
    } else {
        if (myCorrect > oppCorrect) {
            title.textContent = "فزت!";
            reasonText.textContent = `لقد تغلبت على ${challengeState.opponentData.username}`;
        } else if (myCorrect < oppCorrect) {
            title.textContent = "خسرت";
            reasonText.textContent = `تفوق عليك ${challengeState.opponentData.username}`;
        } else {
            title.textContent = "تعادل";
            reasonText.textContent = "كانت مباراة قوية!";
        }
    }

    settleChallengePoints(reason);

    try {
        const oppName = challengeState.opponentData?.username || (challengeState.isHost ? matchData.player2Name : matchData.player1Name) || 'الخصم';
        const body = `${title.textContent} ضد ${oppName} • النتيجة: ${window.toArabicDigits(`${myCorrect}/${total}`)} مقابل ${window.toArabicDigits(`${oppCorrect}/${total}`)} • ${reasonText.textContent}`;
        if (typeof window.addLocalNotification === 'function') window.addLocalNotification('نتيجة تحدي صديق', body, 'swords');
    } catch (_) {}

    document.getElementById('btn-close-challenge-result').onclick = () => {
        modal.classList.remove('active');
        if (challengeState.matchUnsub) {
            challengeState.matchUnsub();
            challengeState.matchUnsub = null;
        }
        challengeState.awaitingFinal = false;
        challengeState.finishLock = false;
        challengeState.currentMatchId = null;
    };
}

async function settleChallengePoints(reason = "normal") {
    try {
        if (!window.db) return;
        const matchId = challengeState.currentMatchId;
        if (!matchId) return;

        const myId =
            window.effectiveUserId ??
            window.auth?.currentUser?.uid ??
            window.firebaseAuth?.currentUser?.uid ??
            window.user?.uid;

        if (!myId) return;
        window.effectiveUserId = myId;

        const matchRef = doc(window.db, "challengeMatches", matchId);

        await runTransaction(window.db, async (tx) => {
            const mSnap = await tx.get(matchRef);
            if (!mSnap.exists()) return;

            const m = mSnap.data() || {};
            if (m.pointsSettled === true) return;

            const p1Id = m.player1Id;
            const p2Id = m.player2Id;

            const p1 = m.player1Progress || {};
            const p2 = m.player2Progress || {};

            const p1Lives = (typeof p1.lives === 'number') ? p1.lives : 3;
            const p2Lives = (typeof p2.lives === 'number') ? p2.lives : 3;

            const p1Correct = (typeof p1.correct === 'number') ? p1.correct : 0;
            const p2Correct = (typeof p2.correct === 'number') ? p2.correct : 0;

            let winnerId = null;
            let loserId = null;

            if (p1Id && p2Id) {
                if (reason === "quit") {
                    loserId = myId;
                    winnerId = (myId === p1Id) ? p2Id : p1Id;
                } else if (reason === "opponent_disconnected") {
                    winnerId = myId;
                    loserId = (myId === p1Id) ? p2Id : p1Id;
                } else {
                    if (p1Lives <= 0 && p2Lives > 0) {
                        winnerId = p2Id;
                        loserId = p1Id;
                    } else if (p2Lives <= 0 && p1Lives > 0) {
                        winnerId = p1Id;
                        loserId = p2Id;
                    } else if (p1Correct > p2Correct) {
                        winnerId = p1Id;
                        loserId = p2Id;
                    } else if (p2Correct > p1Correct) {
                        winnerId = p2Id;
                        loserId = p1Id;
                    }
                }
            }

            let amount = 0;

            if (winnerId && loserId) {
                const loserRef = doc(window.db, "users", loserId);
                const lSnap = await tx.get(loserRef);
                const lData = lSnap.exists() ? (lSnap.data() || {}) : {};
                const lBal = Number(lData.balance ?? lData.highScore ?? 0) || 0;
                amount = Math.max(0, Math.min(100, lBal));
            }

            tx.update(matchRef, {
                pointsSettled: true,
                pointsSettledAt: serverTimestamp(),
                pointsSettledAmount: amount,
                pointsWinnerId: winnerId,
                pointsLoserId: loserId,
                pointsSettledReason: reason
            });
        });

        const settledSnap = await getDoc(matchRef);
        const settled = settledSnap.exists() ? (settledSnap.data() || {}) : {};

        const amount = Number(settled.pointsSettledAmount ?? 0) || 0;
        const winnerId = settled.pointsWinnerId ?? null;
        const loserId = settled.pointsLoserId ?? null;

        const myUserRef = doc(window.db, "users", myId);

        if (winnerId && loserId) {
            if (myId === winnerId && settled.pointsAppliedWinner !== true) {
                if (amount > 0) {
                    await updateDoc(myUserRef, { balance: increment(amount), highScore: increment(amount) });
                    if (typeof window.addLocalNotification === 'function') window.addLocalNotification('نقاط تحدي صديق', `تمت إضافة ${window.toArabicDigits(amount)} نقطة إلى رصيدك`, 'swords');
                }
                await updateDoc(matchRef, { pointsAppliedWinner: true, pointsAppliedWinnerAt: serverTimestamp() });
            } else if (myId === loserId && settled.pointsAppliedLoser !== true) {
                if (amount > 0) {
                    await updateDoc(myUserRef, { balance: increment(-amount), highScore: increment(-amount) });
                    if (typeof window.addLocalNotification === 'function') window.addLocalNotification('نقاط تحدي صديق', `تم خصم ${window.toArabicDigits(amount)} نقطة من رصيدك`, 'swords');
                } else {
                    if (typeof window.addLocalNotification === 'function') window.addLocalNotification('نقاط تحدي صديق', `لا يوجد رصيد كافٍ للخصم`, 'swords');
                }
                await updateDoc(matchRef, { pointsAppliedLoser: true, pointsAppliedLoserAt: serverTimestamp() });
            }
        }

        if (window.userProfile) {
            const mySnap = await getDoc(myUserRef);
            if (mySnap.exists()) {
                const d = mySnap.data() || {};
                const b = Number(d.balance ?? d.highScore ?? 0) || 0;
                window.userProfile.balance = b;
                window.userProfile.highScore = b;
                if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
            }
        }
    } catch (e) {
        console.error(e);
    }
}
async function applyChallengeCorrectToLeaderboard(myCorrect) {
    try {
        if (!window.db) return;
        const matchId = challengeState.currentMatchId;
        if (!matchId) return;

        const myId =
            window.effectiveUserId ??
            window.auth?.currentUser?.uid ??
            window.firebaseAuth?.currentUser?.uid ??
            window.user?.uid;

        if (!myId) return;
        window.effectiveUserId = myId;

        const inc = Number(myCorrect) || 0;
        if (inc <= 0) return;

        const d = new Date();
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        const matchRef = doc(window.db, "challengeMatches", matchId);
        const userRef = doc(window.db, "users", myId);

        let appliedNow = false;

        await runTransaction(window.db, async (tx) => {
            const mSnap = await tx.get(matchRef);
            if (!mSnap.exists()) return;

            const m = mSnap.data() || {};
            const applied = m.challengeCorrectApplied || {};
            if (applied[myId] === true) return;

            const uSnap = await tx.get(userRef);
            if (!uSnap.exists()) return;

            const u = uSnap.data() || {};
            const stats = u.stats || {};
            const ms = u.monthlyStats || {};

            const prevTotal = Number(stats.totalCorrect || 0) || 0;
            const newTotal = prevTotal + inc;

            let newMonthCorrect = inc;
            if (ms.key === monthKey) newMonthCorrect = (Number(ms.correct || 0) || 0) + inc;

            tx.update(userRef, {
                "stats.totalCorrect": newTotal,
                "monthlyStats.key": monthKey,
                "monthlyStats.correct": newMonthCorrect
            });

            tx.update(matchRef, {
                [`challengeCorrectApplied.${myId}`]: true,
                [`challengeCorrectAmount.${myId}`]: inc
            });

            appliedNow = true;
        });

        if (appliedNow && window.userProfile) {
            window.userProfile.stats = window.userProfile.stats || {};
            window.userProfile.monthlyStats = window.userProfile.monthlyStats || {};

            window.userProfile.stats.totalCorrect = (Number(window.userProfile.stats.totalCorrect || 0) || 0) + inc;

            if (window.userProfile.monthlyStats.key !== monthKey) {
                window.userProfile.monthlyStats.key = monthKey;
                window.userProfile.monthlyStats.correct = inc;
            } else {
                window.userProfile.monthlyStats.correct = (Number(window.userProfile.monthlyStats.correct || 0) || 0) + inc;
            }

            if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
        }
    } catch (e) {
        console.error(e);
    }
}

// Quit handler
const quitBtn = document.getElementById('btn-quit-challenge');
if (quitBtn) quitBtn.onclick = () => {
    if (confirm("هل أنت متأكد من الانسحاب؟ سيتم اعتبارك خاسراً.")) {
        finishMatch("quit");
    }
};

// Expose to window for global access
window.openChallengeSetup = openChallengeSetup;
window.initChallengeSystem = initChallengeSystem;
