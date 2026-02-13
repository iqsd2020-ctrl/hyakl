/**
 * Friend Challenge Module
 * Handles invites, matches, and realtime progress.
 */

import { 
    collection, doc, setDoc, getDoc, updateDoc, addDoc, 
    query, where, onSnapshot, serverTimestamp, deleteDoc,
    limit, orderBy
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
    rtdbUnsub: null
};

// --- Initialization ---
export function initChallengeSystem() {
    if (!window.db || !window.effectiveUserId) return;
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
    });
}

function showIncomingInvite(inviteId, invite) {
    const modal = document.getElementById('challenge-receive-modal');
    const text = document.getElementById('challenge-receive-text');
    const timerSpan = document.getElementById('receive-timer');
    
    if (!modal || !text) return;

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
        toId: toId,
        questionCount: questionCount,
        status: "pending",
        createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(window.db, "challengeInvites"), inviteData);
    challengeState.currentInviteId = docRef.id;
    challengeState.isHost = true;

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

    // Create Match Doc
    const questionIds = await pickRandomQuestions(invite.questionCount);
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

async function pickRandomQuestions(count) {
    try {
        // Try to fetch from the standard path
        const response = await fetch('Data/Noor/dataNooR.json');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const allQuestions = Array.isArray(data) ? data : (data.questions || []);
        
        if (allQuestions.length === 0) throw new Error('No questions found');

        const indices = Array.from({length: allQuestions.length}, (_, i) => i);
        const shuffled = indices.sort(() => 0.5 - Math.random());
        
        return shuffled.slice(0, count);
    } catch (e) {
        console.error("Failed to pick questions, using fallback indices", e);
        // Fallback to indices 0 to count-1
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

    // Load Questions
    challengeState.questions = await fetchQuestionsByIds(matchData.questionIds);
    
    // Setup UI
    document.getElementById('opponent-name-label').textContent = challengeState.isHost ? matchData.player2Name : matchData.player1Name;
    updateMatchUI();
    document.getElementById('challenge-match-view').classList.remove('hidden');
    
    // Setup RTDB Presence & Progress
    setupMatchRealtime();
    
    // Show first question
    showNextChallengeQuestion();
}

async function fetchQuestionsByIds(ids) {
    try {
        const response = await fetch('Data/Noor/dataNooR.json');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const all = Array.isArray(data) ? data : (data.questions || []);
        
        if (all.length === 0) throw new Error('No questions found');

        return ids.map(id => {
            const idx = parseInt(id);
            if (!isNaN(idx)) {
                return all[idx % all.length];
            }
            return all.find(q => q.id === id) || all[Math.floor(Math.random() * all.length)];
        });
    } catch (e) {
        console.error("Error fetching questions by IDs", e);
        // Return dummy questions if fetch fails
        return ids.map((_, i) => ({
            question: "تعذر تحميل السؤال، يرجى التحقق من الاتصال",
            options: ["خيار 1", "خيار 2", "خيار 3", "خيار 4"],
            correctAnswer: 0
        }));
    }
}

function setupMatchRealtime() {
    const matchId = challengeState.currentMatchId;
    const myId = window.effectiveUserId;
    const oppId = challengeState.opponentData.uid;

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
    const optionsContainer = document.getElementById('challenge-options-container');
    
    textEl.textContent = q.question;
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
    const myRef = ref(window.rtdb, `matches/${challengeState.currentMatchId}/${window.effectiveUserId}`);
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
    if (challengeState.rtdbUnsub) challengeState.rtdbUnsub();
    
    const myRef = ref(window.rtdb, `matches/${challengeState.currentMatchId}/${window.effectiveUserId}`);
    set(myRef, {
        answered: challengeState.currentIdx,
        correct: challengeState.myCorrect,
        lives: challengeState.myLives,
        status: "finished"
    });

    // Wait a bit for final sync
    setTimeout(async () => {
        const matchSnap = await getDoc(doc(window.db, "challengeMatches", challengeState.currentMatchId));
        const matchData = matchSnap.data();
        
        showResult(reason, matchData);
    }, 1000);
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

    document.getElementById('btn-close-challenge-result').onclick = () => {
        modal.classList.remove('active');
        // Cleanup
        challengeState.currentMatchId = null;
    };
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
