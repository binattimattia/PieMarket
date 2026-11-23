// ============================================================================
// PIEMARKET — Client JavaScript Unificato (Aste in Tempo Reale)
// ============================================================================

(function () {
    const STORAGE_KEY = 'piemarket_user';

    // --- GESTIONE UTENTE E RICHIESTE HTTP ---
    function getCurrentUser() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
    }
    function setCurrentUser(user) { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)); }
    function clearCurrentUser() { localStorage.removeItem(STORAGE_KEY); }

    function authFetch(url, options = {}) {
        const user = getCurrentUser();
        const headers = { ...(options.headers || {}) };
        if (user && user.id) headers['x-user-id'] = user.id;
        return fetch(url, { ...options, headers });
    }

    // Calcolo tempo rimanente alla scadenza
    function getRemainingTime(expiresAt) {
        const diff = new Date(expiresAt).getTime() - Date.now();
        if (diff <= 0) return { ended: true, text: 'Asta terminata', cssClass: 'bg-secondary' };

        const sec = Math.floor(diff / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        const timeStr = m > 59 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return {
            ended: false,
            text: `⏳ ${timeStr}`,
            cssClass: sec < 60 ? 'bg-danger' : (sec < 300 ? 'bg-warning text-dark' : 'bg-primary')
        };
    }

    // --- WEBSOCKET NATIVO ---
    const wsListeners = {};
    function initWebSocket() {
        const user = getCurrentUser();
        if (!user) return;
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${location.host}/ws?userId=${user.id}`);
        ws.onmessage = (e) => {
            try {
                const { type, data } = JSON.parse(e.data);
                (wsListeners[type] || []).forEach(fn => fn(data));
            } catch (_) {}
        };
        ws.onclose = () => setTimeout(initWebSocket, 3000);
    }

    function onWsEvent(type, fn) {
        if (!wsListeners[type]) wsListeners[type] = [];
        wsListeners[type].push(fn);
    }

    // --- CONTROLLO ACCESSO E NAVBAR ---
    function handleNavigation() {
        const user = getCurrentUser();
        const isAuthPage = ['/login', '/register'].includes(location.pathname);
        if (!user && !isAuthPage) return location.href = '/login';
        if (user && isAuthPage) return location.href = '/';

        const userDisplay = document.getElementById('nav-username-display');
        if (user && userDisplay) userDisplay.textContent = user.username;

        const logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) logoutBtn.onclick = (e) => {
            e.preventDefault();
            clearCurrentUser();
            location.href = '/login';
        };
    }

    // --- PAGINA LOGIN ---
    function initLoginPage() {
        const form = document.getElementById('form-login');
        if (!form) return;
        form.onsubmit = async (e) => {
            e.preventDefault();
            const alertBox = document.getElementById('alert-container');
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: form.email.value, password: form.password.value })
                });
                const data = await res.json();
                if (res.ok) {
                    setCurrentUser(data.user);
                    location.href = '/';
                } else {
                    alertBox.innerHTML = `<div class="alert alert-danger py-2 small">${data.error}</div>`;
                }
            } catch {
                alertBox.innerHTML = '<div class="alert alert-danger py-2 small">Errore di rete.</div>';
            }
        };
    }

    // --- PAGINA REGISTRAZIONE ---
    function initRegisterPage() {
        const form = document.getElementById('form-register');
        if (!form) return;
        form.onsubmit = async (e) => {
            e.preventDefault();
            const alertBox = document.getElementById('alert-container');
            if (form.password.value !== form.confirmPassword.value) {
                alertBox.innerHTML = '<div class="alert alert-danger py-2 small">Le password non coincidono.</div>';
                return;
            }
            if (form.region.value !== 'Piemonte') {
                alertBox.innerHTML = '<div class="alert alert-warning py-2 small">Piemarket è riservato ai residenti in Piemonte.</div>';
                return;
            }
            try {
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: form.username.value,
                        email: form.email.value,
                        password: form.password.value,
                        confirmPassword: form.confirmPassword.value,
                        region: form.region.value
                    })
                });
                const data = await res.json();
                if (res.ok) {
                    setCurrentUser(data.user);
                    location.href = '/';
                } else {
                    alertBox.innerHTML = `<div class="alert alert-danger py-2 small">${data.error}</div>`;
                }
            } catch {
                alertBox.innerHTML = '<div class="alert alert-danger py-2 small">Errore di rete.</div>';
            }
        };
    }

    // --- PAGINA HOME: ASTE DAL VIVO ---
    function initHomePage() {
        const grid = document.getElementById('announcements-grid');
        if (!grid) return;

        let allAuctions = [];
        let currentDetailAuction = null;
        const emptyState = document.getElementById('empty-state');
        const modalDetailEl = document.getElementById('modalDetail');
        const modalDetail = modalDetailEl ? new bootstrap.Modal(modalDetailEl) : null;
        const modalPublishEl = document.getElementById('modalPublish');
        const modalPublish = modalPublishEl ? new bootstrap.Modal(modalPublishEl) : null;

        async function loadAuctions() {
            try {
                const res = await authFetch('/api/announcements');
                if (res.ok) {
                    const data = await res.json();
                    allAuctions = data.announcements || [];
                    render();
                }
            } catch {}
        }

        async function sendBid(auctionId, amount) {
            try {
                const res = await authFetch(`/api/announcements/${auctionId}/bid`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount })
                });
                const data = await res.json();
                if (res.ok) {
                    updateAuctionInState(data.announcement);
                } else {
                    alert(data.error || 'Errore durante l\'offerta.');
                }
            } catch {
                alert('Errore di connessione durante l\'offerta.');
            }
        }

        function updateAuctionInState(updated) {
            const idx = allAuctions.findIndex(a => a.id === updated.id);
            if (idx !== -1) allAuctions[idx] = updated;
            render();
            if (currentDetailAuction && currentDetailAuction.id === updated.id) {
                currentDetailAuction = updated;
                renderDetailModal();
            }
        }

        function render() {
            grid.innerHTML = '';
            if (emptyState) emptyState.classList.toggle('d-none', allAuctions.length > 0);
            const user = getCurrentUser();

            allAuctions.forEach(item => {
                const time = getRemainingTime(item.expiresAt);
                const isEnded = item.status === 'ended' || time.ended;
                const isOwner = user && user.id === item.userId;
                const isHighest = user && user.id === item.highestBidderId;

                const col = document.createElement('div');
                col.className = 'col-md-6 col-lg-4 mb-4';
                col.innerHTML = `
                    <div class="card h-100 shadow-sm border-0 ${isEnded ? 'opacity-75' : ''}">
                        <div class="announcement-img-container position-relative">
                            <img src="${item.image}" alt="${item.title}" class="announcement-img" loading="lazy">
                            <span class="badge ${time.cssClass} position-absolute top-0 start-0 m-2 px-3 py-2 fs-6 shadow-sm auction-timer-badge" data-expires="${item.expiresAt}">
                                ${time.text}
                            </span>
                            <span class="badge bg-dark position-absolute bottom-0 end-0 m-2 px-2 py-1 small">
                                Base: ${item.startingPrice} €
                            </span>
                        </div>
                        <div class="card-body d-flex flex-column">
                            <h5 class="card-title fw-bold text-truncate mb-1">${item.title}</h5>
                            <p class="card-text text-muted small text-truncate-2 flex-grow-1">${item.description}</p>
                            <div class="p-3 my-2 rounded-3 bg-light border">
                                <div class="d-flex justify-content-between align-items-center">
                                    <span class="small text-muted fw-semibold">Offerta Attuale:</span>
                                    <span class="fs-4 fw-bold text-success">${item.currentBid} €</span>
                                </div>
                                <div class="d-flex justify-content-between align-items-center mt-1 pt-1 border-top small">
                                    <span class="text-muted">Miglior offerente:</span>
                                    <strong class="${isHighest ? 'text-primary' : 'text-dark'}">
                                        ${item.highestBidderUsername ? `${item.highestBidderUsername} ${isHighest ? '(Tu)' : ''}` : 'Nessuna offerta'}
                                    </strong>
                                </div>
                            </div>
                            <div class="mt-2">
                                ${isEnded ? `
                                    <div class="alert alert-secondary py-2 mb-0 text-center small fw-semibold">
                                        Asta conclusa! ${item.highestBidderUsername ? `Vinta da <strong>${item.highestBidderUsername}</strong> a ${item.currentBid} €` : 'Nessun acquirente'}
                                    </div>
                                ` : isOwner ? `
                                    <div class="alert alert-info py-2 mb-0 text-center small">
                                        Questa è la tua asta. Non puoi rilanciare.
                                    </div>
                                ` : `
                                    <div class="d-flex gap-2 mb-2">
                                        <button class="btn btn-outline-success btn-sm flex-fill fw-bold" onclick="PiemarketApp.bid('${item.id}', ${item.currentBid + 1})">
                                            +1 € (${item.currentBid + 1} €)
                                        </button>
                                        <button class="btn btn-success btn-sm flex-fill fw-bold" onclick="PiemarketApp.bid('${item.id}', ${item.currentBid + 5})">
                                            +5 € (${item.currentBid + 5} €)
                                        </button>
                                    </div>
                                    <div class="input-group input-group-sm mb-1">
                                        <span class="input-group-text">€</span>
                                        <input type="number" class="form-control" id="custom-bid-${item.id}" placeholder="Offerta libera" min="${item.currentBid + 1}">
                                        <button class="btn btn-primary" onclick="PiemarketApp.customBid('${item.id}', ${item.currentBid})">Offri</button>
                                    </div>
                                `}
                            </div>
                        </div>
                        <div class="card-footer bg-white border-0 pt-0 pb-3">
                            <button class="btn btn-outline-secondary btn-sm w-100" onclick="PiemarketApp.openDetail('${item.id}')">
                                Storico rilanci (${item.bids ? item.bids.length : 0})
                            </button>
                        </div>
                    </div>
                `;
                grid.appendChild(col);
            });
        }

        function renderDetailModal() {
            const a = currentDetailAuction;
            if (!a) return;
            const user = getCurrentUser();
            const time = getRemainingTime(a.expiresAt);
            const isEnded = a.status === 'ended' || time.ended;
            const isOwner = user && user.id === a.userId;

            document.getElementById('detail-img').src = a.image;
            document.getElementById('detail-title').textContent = a.title;
            document.getElementById('detail-description').textContent = a.description;
            document.getElementById('detail-starting-price').textContent = `${a.startingPrice} €`;
            document.getElementById('detail-current-bid').textContent = `${a.currentBid} €`;
            document.getElementById('detail-highest-bidder').textContent = a.highestBidderUsername || 'Nessuna offerta ancora';

            const timerEl = document.getElementById('detail-timer');
            timerEl.textContent = time.text;
            timerEl.className = `fs-4 fw-bold ${time.ended ? 'text-secondary' : 'text-danger'}`;

            const bidsList = document.getElementById('detail-bids-list');
            bidsList.innerHTML = (!a.bids || a.bids.length === 0)
                ? '<div class="text-muted text-center py-2">Nessun rilancio effettuato. Sii il primo!</div>'
                : [...a.bids].reverse().map(b => `
                    <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                        <span><strong>${b.username}</strong></span>
                        <span class="text-success fw-bold">${b.amount} €</span>
                        <span class="text-muted small">${new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                `).join('');

            const actionsEl = document.getElementById('detail-bid-actions');
            if (isEnded) {
                actionsEl.innerHTML = `<div class="alert alert-secondary text-center mb-0">Asta conclusa! Vincitore: <strong>${a.highestBidderUsername || 'Nessuno'}</strong> a <strong>${a.currentBid} €</strong></div>`;
            } else if (isOwner) {
                actionsEl.innerHTML = `<div class="alert alert-info text-center mb-0">Sei il proprietario di questa asta. Non puoi rilanciare.</div>`;
            } else {
                actionsEl.innerHTML = `
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-success flex-fill fw-bold" onclick="PiemarketApp.bid('${a.id}', ${a.currentBid + 1})">+1 € (${a.currentBid + 1} €)</button>
                        <button class="btn btn-success flex-fill fw-bold" onclick="PiemarketApp.bid('${a.id}', ${a.currentBid + 5})">+5 € (${a.currentBid + 5} €)</button>
                    </div>
                `;
            }
        }

        // Pubblicazione nuova asta
        if (modalPublishEl) {
            const formPublish = document.getElementById('form-publish');
            formPublish.onsubmit = async (e) => {
                e.preventDefault();
                const btn = document.getElementById('btn-submit-publish');
                btn.disabled = true;
                try {
                    const res = await authFetch('/api/announcements', { method: 'POST', body: new FormData(formPublish) });
                    const data = await res.json();
                    btn.disabled = false;
                    if (res.ok) {
                        formPublish.reset();
                        modalPublish.hide();
                    } else {
                        alert(data.error || 'Errore creazione asta.');
                    }
                } catch {
                    btn.disabled = false;
                    alert('Errore di connessione.');
                }
            };
        }

        // Aggiornamento per-secondo del timer a schermo
        setInterval(() => {
            document.querySelectorAll('.auction-timer-badge').forEach(b => {
                const info = getRemainingTime(b.getAttribute('data-expires'));
                b.textContent = info.text;
                b.className = `badge ${info.cssClass} position-absolute top-0 start-0 m-2 px-3 py-2 fs-6 shadow-sm auction-timer-badge`;
            });
            if (currentDetailAuction) {
                const timerEl = document.getElementById('detail-timer');
                if (timerEl) timerEl.textContent = getRemainingTime(currentDetailAuction.expiresAt).text;
            }
        }, 1000);

        // Esposizione funzioni globali per i click degli utenti
        window.PiemarketApp = {
            bid: sendBid,
            customBid: (id, current) => {
                const input = document.getElementById(`custom-bid-${id}`);
                const amount = parseFloat(input?.value);
                if (isNaN(amount) || amount <= current) {
                    alert(`L'offerta deve essere superiore a ${current} €.`);
                    return;
                }
                sendBid(id, amount);
            },
            openDetail: (id) => {
                currentDetailAuction = allAuctions.find(a => a.id === id);
                if (currentDetailAuction) {
                    renderDetailModal();
                    modalDetail.show();
                }
            }
        };

        // Eventi WebSocket in tempo reale
        onWsEvent('NEW_ANNOUNCEMENT', (item) => { allAuctions.unshift(item); render(); });
        onWsEvent('BID_PLACED', updateAuctionInState);
        onWsEvent('AUCTION_ENDED', (ended) => {
            const item = allAuctions.find(a => a.id === ended.id);
            if (item) item.status = 'ended';
            render();
            if (currentDetailAuction && currentDetailAuction.id === ended.id) {
                currentDetailAuction.status = 'ended';
                renderDetailModal();
            }
        });
        onWsEvent('ANNOUNCEMENT_REMOVED', ({ id }) => {
            allAuctions = allAuctions.filter(a => a.id !== id);
            render();
        });

        loadAuctions();
    }

    // --- PAGINA LE MIE ASTE ---
    function initMyAuctionsPage() {
        const container = document.getElementById('my-announcements-container');
        if (!container) return;
        const empty = document.getElementById('my-empty-state');

        async function load() {
            try {
                const res = await authFetch('/api/announcements/my');
                if (res.ok) {
                    const data = await res.json();
                    render(data.announcements || []);
                }
            } catch {}
        }

        function render(list) {
            container.innerHTML = '';
            if (empty) empty.classList.toggle('d-none', list.length > 0);
            list.forEach(item => {
                const time = getRemainingTime(item.expiresAt);
                const isEnded = item.status === 'ended' || time.ended;
                const col = document.createElement('div');
                col.className = 'col-md-6 col-lg-4 mb-4';
                col.innerHTML = `
                    <div class="card h-100 shadow-sm border-0">
                        <div class="announcement-img-container position-relative">
                            <img src="${item.image}" alt="${item.title}" class="announcement-img">
                            <span class="badge ${time.cssClass} position-absolute top-0 start-0 m-2 px-2 py-1">${time.text}</span>
                        </div>
                        <div class="card-body">
                            <h5 class="card-title fw-bold text-truncate">${item.title}</h5>
                            <p class="card-text text-muted small text-truncate-2">${item.description}</p>
                            <div class="p-2 bg-light rounded border small mb-2">
                                <div>Base d'asta: <strong>${item.startingPrice} €</strong></div>
                                <div>Offerta più alta: <strong class="text-success">${item.currentBid} €</strong></div>
                                <div>Miglior offerente: <strong>${item.highestBidderUsername || 'Nessuno'}</strong></div>
                                <div>Totale rilanci: <strong>${item.bids ? item.bids.length : 0}</strong></div>
                            </div>
                        </div>
                        <div class="card-footer bg-white border-0 pt-0 pb-3">
                            ${(!item.bids || item.bids.length === 0) && !isEnded ? `
                                <button class="btn btn-outline-danger btn-sm w-100" onclick="PiemarketApp.deleteAuction('${item.id}')">
                                    Annulla Asta
                                </button>
                            ` : `<div class="text-center small text-muted fst-italic">${isEnded ? 'Asta conclusa' : 'Asta con offerte attive'}</div>`}
                        </div>
                    </div>
                `;
                container.appendChild(col);
            });
        }

        window.PiemarketApp = window.PiemarketApp || {};
        window.PiemarketApp.deleteAuction = async (id) => {
            if (!confirm('Sei sicuro di voler annullare questa asta?')) return;
            const res = await authFetch(`/api/announcements/${id}`, { method: 'DELETE' });
            if (res.ok) load();
        };

        onWsEvent('BID_PLACED', load);
        onWsEvent('AUCTION_ENDED', load);
        load();
    }

    document.addEventListener('DOMContentLoaded', () => {
        handleNavigation();
        initWebSocket();
        initLoginPage();
        initRegisterPage();
        initHomePage();
        initMyAuctionsPage();
    });
})();
