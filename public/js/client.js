// ============================================================================
// PIEMARKET — Client JavaScript Unificato (public/js/client.js)
// Gestione stato utente, chiamate API (senza cookie), WebSocket e DOM delle pagine
// ============================================================================

(function () {
    const STORAGE_KEY = 'piemarket_user';

    // ------------------------------------------------------------------------
    // 1. STATO UTENTE & UTILITY GLOBALI (PiemarketApp)
    // ------------------------------------------------------------------------
    function getCurrentUser() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return null;
        try { return JSON.parse(stored); } catch (_) { return null; }
    }

    function setCurrentUser(user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    }

    function clearCurrentUser() {
        localStorage.removeItem(STORAGE_KEY);
    }

    /**
     * Esegue fetch aggiungendo l'header di identificazione x-user-id (senza cookie)
     */
    function authFetch(url, options = {}) {
        const user = getCurrentUser();
        const headers = options.headers ? { ...options.headers } : {};
        if (user && user.id) {
            headers['x-user-id'] = user.id;
        }
        return fetch(url, { ...options, headers });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatPrice(price) {
        const num = Number(price);
        if (num === 0) return '<span class="badge bg-success">Gratis</span>';
        return `<strong>${num} €</strong>`;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('it-IT', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function logout() {
        clearCurrentUser();
        window.location.href = '/login';
    }

    window.PiemarketApp = {
        getCurrentUser,
        setCurrentUser,
        clearCurrentUser,
        authFetch,
        escapeHtml,
        formatPrice,
        formatDate,
        logout
    };

    // ------------------------------------------------------------------------
    // 2. CLIENT WEBSOCKET NATIVO
    // ------------------------------------------------------------------------
    let ws = null;
    const wsListeners = {};

    function initWebSocket() {
        const user = getCurrentUser();
        if (!user) return; // Non connettere su pagine pubbliche (login/register)

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?userId=${encodeURIComponent(user.id)}`;

        try {
            ws = new WebSocket(wsUrl);
            ws.onopen = () => console.log('[WS] Connesso come', user.id);
            ws.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    if (wsListeners[payload.type]) {
                        wsListeners[payload.type].forEach(fn => fn(payload.data));
                    }
                } catch (_) {}
            };
            ws.onclose = () => {
                // Riconnessione dopo breve intervallo
                setTimeout(initWebSocket, 3000);
            };
        } catch (e) {
            console.error('[WS] Errore connessione:', e);
        }
    }

    function onWsEvent(type, callback) {
        if (!wsListeners[type]) wsListeners[type] = [];
        wsListeners[type].push(callback);
    }

    // ------------------------------------------------------------------------
    // 3. CONTROLLO ACCESSO PAGINE & NAVBAR
    // ------------------------------------------------------------------------
    function handleNavigation() {
        const user = getCurrentUser();
        const path = window.location.pathname;
        const isAuthPage = path === '/login' || path === '/register';

        if (!user && !isAuthPage) {
            window.location.href = '/login';
            return;
        }
        if (user && isAuthPage) {
            window.location.href = '/';
            return;
        }

        if (user) {
            const usernameDisplay = document.getElementById('nav-username-display');
            if (usernameDisplay) usernameDisplay.textContent = user.username;
        }

        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }
    }

    // ------------------------------------------------------------------------
    // 4. LOGICA PAGINA: LOGIN (/login)
    // ------------------------------------------------------------------------
    function initLoginPage() {
        const formLogin = document.getElementById('form-login');
        if (!formLogin) return;

        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const alertBox = document.getElementById('alert-container');
            alertBox.innerHTML = '';

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (res.ok) {
                    setCurrentUser(data.user);
                    window.location.href = '/';
                } else {
                    alertBox.innerHTML = `<div class="alert alert-danger py-2 small">${data.error || 'Credenziali errate.'}</div>`;
                }
            } catch (_) {
                alertBox.innerHTML = `<div class="alert alert-danger py-2 small">Errore di rete.</div>`;
            }
        });
    }

    // ------------------------------------------------------------------------
    // 5. LOGICA PAGINA: REGISTRAZIONE (/register)
    // ------------------------------------------------------------------------
    function initRegisterPage() {
        const formRegister = document.getElementById('form-register');
        if (!formRegister) return;

        formRegister.addEventListener('submit', async (e) => {
            e.preventDefault();
            const alertBox = document.getElementById('alert-container');
            alertBox.innerHTML = '';

            const username = document.getElementById('username').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const region = document.getElementById('region').value;

            if (password !== confirmPassword) {
                alertBox.innerHTML = `<div class="alert alert-danger py-2 small">Le password non coincidono.</div>`;
                return;
            }

            // CONTROLLO REGIONE LATO CLIENT
            if (region !== 'Piemonte') {
                alertBox.innerHTML = `
                    <div class="alert alert-warning py-2 small">
                        <strong>Accesso limitato:</strong><br>
                        Piemarket è riservato ai residenti in Piemonte. Al momento non è possibile registrarsi da un'altra regione.
                    </div>
                `;
                return;
            }

            try {
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password, confirmPassword, region })
                });
                const data = await res.json();
                if (res.ok) {
                    setCurrentUser(data.user);
                    window.location.href = '/';
                } else {
                    alertBox.innerHTML = `<div class="alert alert-danger py-2 small">${data.error || 'Errore registrazione.'}</div>`;
                }
            } catch (_) {
                alertBox.innerHTML = `<div class="alert alert-danger py-2 small">Errore di connessione.</div>`;
            }
        });
    }

    // ------------------------------------------------------------------------
    // 6. LOGICA PAGINA: HOME (Bacheca Annunci)
    // ------------------------------------------------------------------------
    function initHomePage() {
        const grid = document.getElementById('announcements-grid');
        if (!grid) return;

        let allAnnouncements = [];
        let currentDetailAnn = null;

        const emptyState = document.getElementById('empty-state');
        const searchInput = document.getElementById('search-input');
        const priceFilter = document.getElementById('price-filter');
        const modalDetailEl = document.getElementById('modalDetail');
        const modalDetail = modalDetailEl ? new bootstrap.Modal(modalDetailEl) : null;
        const modalOfferEl = document.getElementById('modalMakeOffer');
        const modalOffer = modalOfferEl ? new bootstrap.Modal(modalOfferEl) : null;
        const modalPublishEl = document.getElementById('modalPublish');
        const modalPublish = modalPublishEl ? new bootstrap.Modal(modalPublishEl) : null;

        async function load() {
            try {
                const res = await authFetch('/api/announcements');
                if (res.ok) {
                    const data = await res.json();
                    allAnnouncements = data.announcements || [];
                    render();
                }
            } catch (_) {}
        }

        function render() {
            grid.innerHTML = '';
            const search = (searchInput ? searchInput.value : '').toLowerCase().trim();
            const filter = priceFilter ? priceFilter.value : 'all';

            // Mostra solo annunci attivi (esclude i venduti)
            const filtered = allAnnouncements.filter((item) => {
                if (item.status !== 'active') return false;
                const matches = item.title.toLowerCase().includes(search) || item.description.toLowerCase().includes(search);
                if (!matches) return false;

                if (filter === 'free') return item.price === 0;
                if (filter === 'under20') return item.price > 0 && item.price <= 20;
                if (filter === '20to100') return item.price > 20 && item.price <= 100;
                if (filter === 'over100') return item.price > 100;
                return true;
            });

            if (filtered.length === 0) {
                if (emptyState) emptyState.classList.remove('d-none');
                return;
            }
            if (emptyState) emptyState.classList.add('d-none');

            filtered.forEach((item) => {
                const col = document.createElement('div');
                col.className = 'col-sm-6 col-md-4 col-lg-3 mb-4';
                const priceBadge = item.price === 0 ? 'bg-success' : 'bg-primary';
                const priceText = item.price === 0 ? 'Gratis' : `${item.price} €`;

                col.innerHTML = `
                    <div class="card announcement-card h-100 shadow-sm">
                        <div class="announcement-img-container">
                            <img src="${item.image}" alt="${escapeHtml(item.title)}" class="announcement-img" loading="lazy">
                            <span class="badge ${priceBadge} price-badge">${priceText}</span>
                        </div>
                        <div class="card-body d-flex flex-column">
                            <h5 class="card-title text-truncate">${escapeHtml(item.title)}</h5>
                            <p class="card-text text-muted small text-truncate-2 flex-grow-1">${escapeHtml(item.description)}</p>
                            <div class="d-flex justify-content-between align-items-center pt-2 border-top text-muted small">
                                <span><i class="bi bi-person"></i> ${escapeHtml(item.sellerUsername)}</span>
                                <span>${formatDate(item.createdAt).split(',')[0]}</span>
                            </div>
                        </div>
                        <div class="card-footer bg-white border-0 pt-0 pb-3">
                            <button class="btn btn-outline-primary btn-sm w-100 btn-view">Visualizza Dettagli</button>
                        </div>
                    </div>
                `;

                col.querySelector('.btn-view').addEventListener('click', () => openDetail(item));
                grid.appendChild(col);
            });
        }

        function openDetail(item) {
            currentDetailAnn = item;
            const currentUser = getCurrentUser();
            const isOwner = currentUser && currentUser.id === item.userId;

            document.getElementById('detail-img').src = item.image;
            document.getElementById('detail-title').textContent = item.title;
            document.getElementById('detail-description').textContent = item.description;
            document.getElementById('detail-seller').textContent = item.sellerUsername;
            document.getElementById('detail-date').textContent = formatDate(item.createdAt);
            document.getElementById('detail-price').innerHTML = formatPrice(item.price);

            const actions = document.getElementById('detail-actions');
            actions.innerHTML = '';

            if (isOwner) {
                actions.innerHTML = `
                    <div class="alert alert-info py-2 mb-0 me-auto small">Questo è un tuo annuncio.</div>
                    <a href="/my-announcements" class="btn btn-outline-secondary">I miei annunci</a>
                `;
            } else {
                const buyText = item.price === 0 ? 'Richiedi oggetto (Gratis)' : `Acquista a ${item.price} €`;
                const btnBuy = document.createElement('button');
                btnBuy.className = 'btn btn-success me-2';
                btnBuy.innerHTML = `<i class="bi bi-cart-check"></i> ${buyText}`;
                btnBuy.addEventListener('click', () => submitPurchase(item));

                const btnOffer = document.createElement('button');
                btnOffer.className = 'btn btn-primary';
                btnOffer.innerHTML = `<i class="bi bi-chat-quote"></i> Fai un'offerta`;
                btnOffer.addEventListener('click', () => {
                    modalDetail.hide();
                    openMakeOffer(item);
                });

                actions.appendChild(btnBuy);
                actions.appendChild(btnOffer);
            }

            modalDetail.show();
        }

        async function submitPurchase(item) {
            if (!confirm(`Confermi la richiesta per "${item.title}" a ${item.price === 0 ? 'prezzo gratuito' : item.price + ' €'}?`)) return;
            try {
                const res = await authFetch('/api/offers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ announcementId: item.id, amount: item.price, message: 'Richiesta di acquisto' })
                });
                const data = await res.json();
                if (res.ok) {
                    modalDetail.hide();
                    alert('Proposta inoltrata con successo al venditore!');
                } else {
                    alert(data.error || 'Errore richiesta.');
                }
            } catch (_) { alert('Errore di connessione.'); }
        }

        function openMakeOffer(item) {
            document.getElementById('offer-target-title').textContent = item.title;
            document.getElementById('offer-original-price').textContent = item.price === 0 ? 'Gratis' : `${item.price} €`;
            document.getElementById('offer-amount-input').value = item.price > 0 ? Math.floor(item.price * 0.9) : 0;
            document.getElementById('offer-message-input').value = '';
            modalOffer.show();
        }

        const btnSendOffer = document.getElementById('btn-send-offer');
        if (btnSendOffer) {
            btnSendOffer.addEventListener('click', async () => {
                const amount = parseFloat(document.getElementById('offer-amount-input').value);
                const message = document.getElementById('offer-message-input').value;
                if (isNaN(amount) || amount < 0) {
                    alert('Inserisci un importo valido.');
                    return;
                }
                try {
                    btnSendOffer.disabled = true;
                    const res = await authFetch('/api/offers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ announcementId: currentDetailAnn.id, amount, message })
                    });
                    const data = await res.json();
                    btnSendOffer.disabled = false;
                    if (res.ok) {
                        modalOffer.hide();
                        alert(`Offerta di ${amount} € inviata.`);
                    } else {
                        alert(data.error || 'Errore invio offerta.');
                    }
                } catch (_) {
                    btnSendOffer.disabled = false;
                    alert('Errore di rete.');
                }
            });
        }

        const formPublish = document.getElementById('form-publish');
        if (formPublish) {
            formPublish.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btnSubmit = document.getElementById('btn-submit-publish');
                btnSubmit.disabled = true;
                btnSubmit.textContent = 'Caricamento...';

                try {
                    const formData = new FormData(formPublish);
                    const res = await authFetch('/api/announcements', { method: 'POST', body: formData });
                    const data = await res.json();
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = 'Pubblica annuncio';
                    if (res.ok) {
                        formPublish.reset();
                        modalPublish.hide();
                    } else {
                        alert(data.error || 'Errore pubblicazione.');
                    }
                } catch (_) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = 'Pubblica annuncio';
                    alert('Errore di rete.');
                }
            });
        }

        if (searchInput) searchInput.addEventListener('input', render);
        if (priceFilter) priceFilter.addEventListener('change', render);

        // Eventi WebSocket
        onWsEvent('NEW_ANNOUNCEMENT', (newAnn) => {
            if (newAnn.status === 'active') {
                allAnnouncements.unshift(newAnn);
                render();
            }
        });

        onWsEvent('ANNOUNCEMENT_UPDATED', (updatedAnn) => {
            if (updatedAnn.status !== 'active') {
                allAnnouncements = allAnnouncements.filter(a => a.id !== updatedAnn.id);
            } else {
                const idx = allAnnouncements.findIndex(a => a.id === updatedAnn.id);
                if (idx !== -1) allAnnouncements[idx] = updatedAnn;
                else allAnnouncements.unshift(updatedAnn);
            }
            render();
        });

        onWsEvent('ANNOUNCEMENT_REMOVED', (data) => {
            allAnnouncements = allAnnouncements.filter(a => a.id !== data.id);
            render();
        });

        load();
    }

    // ------------------------------------------------------------------------
    // 7. LOGICA PAGINA: OFFERTE E TRATTATIVE (/offers)
    // ------------------------------------------------------------------------
    function initOffersPage() {
        const receivedContainer = document.getElementById('received-offers-container');
        if (!receivedContainer) return;

        const sentContainer = document.getElementById('sent-offers-container');
        const modalNegEl = document.getElementById('modalNegotiation');
        const modalNeg = modalNegEl ? new bootstrap.Modal(modalNegEl) : null;
        let currentOffer = null;

        function getStatusBadge(status, isMyTurn) {
            switch (status) {
                case 'pending_seller':
                    return isMyTurn
                        ? '<span class="badge bg-warning text-dark">Risposta richiesta da te (Venditore)</span>'
                        : '<span class="badge bg-secondary">In attesa del venditore</span>';
                case 'pending_buyer':
                    return isMyTurn
                        ? '<span class="badge bg-warning text-dark">Risposta richiesta da te (Acquirente)</span>'
                        : '<span class="badge bg-secondary">In attesa dell\'acquirente</span>';
                case 'accepted':
                    return '<span class="badge bg-success">Accordo Raggiunto</span>';
                case 'rejected':
                    return '<span class="badge bg-danger">Rifiutata</span>';
                case 'cancelled':
                    return '<span class="badge bg-secondary">Annullata (Oggetto venduto)</span>';
                default:
                    return `<span class="badge bg-light text-dark">${status}</span>`;
            }
        }

        async function loadOffers() {
            try {
                const [resRec, resSent] = await Promise.all([
                    authFetch('/api/offers/received'),
                    authFetch('/api/offers/sent')
                ]);
                if (resRec.ok) renderReceived((await resRec.json()).offers || []);
                if (resSent.ok) renderSent((await resSent.json()).offers || []);
            } catch (_) {}
        }

        function renderReceived(offers) {
            receivedContainer.innerHTML = '';
            if (offers.length === 0) {
                receivedContainer.innerHTML = '<div class="alert alert-light border text-center py-4 text-muted">Nessuna offerta ricevuta.</div>';
                return;
            }
            offers.forEach((o) => {
                const isMyTurn = o.status === 'pending_seller';
                const card = document.createElement('div');
                card.className = `card mb-3 shadow-sm ${isMyTurn ? 'border-warning' : ''}`;
                card.innerHTML = `
                    <div class="card-body d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center gap-3">
                            <img src="${o.announcementImage || '/images/placeholder.png'}" class="rounded" style="width: 60px; height: 60px; object-fit: cover;">
                            <div>
                                <h5 class="mb-1">${escapeHtml(o.announcementTitle)}</h5>
                                <div class="text-muted small">Da: <strong>${escapeHtml(o.buyerUsername)}</strong> | Prezzo base: ${o.announcementOriginalPrice} €</div>
                                <div class="mt-1">${getStatusBadge(o.status, isMyTurn)} <strong class="text-primary ms-2">${o.currentAmount} €</strong></div>
                            </div>
                        </div>
                        <button class="btn btn-sm ${isMyTurn ? 'btn-primary' : 'btn-outline-primary'} btn-open">Dettagli trattativa</button>
                    </div>
                `;
                card.querySelector('.btn-open').addEventListener('click', () => openNeg(o.id));
                receivedContainer.appendChild(card);
            });
        }

        function renderSent(offers) {
            sentContainer.innerHTML = '';
            if (offers.length === 0) {
                sentContainer.innerHTML = '<div class="alert alert-light border text-center py-4 text-muted">Nessuna offerta inviata.</div>';
                return;
            }
            offers.forEach((o) => {
                const isMyTurn = o.status === 'pending_buyer';
                const card = document.createElement('div');
                card.className = `card mb-3 shadow-sm ${isMyTurn ? 'border-warning' : ''}`;
                card.innerHTML = `
                    <div class="card-body d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center gap-3">
                            <img src="${o.announcementImage || '/images/placeholder.png'}" class="rounded" style="width: 60px; height: 60px; object-fit: cover;">
                            <div>
                                <h5 class="mb-1">${escapeHtml(o.announcementTitle)}</h5>
                                <div class="text-muted small">Venditore: <strong>${escapeHtml(o.sellerUsername)}</strong> | Prezzo base: ${o.announcementOriginalPrice} €</div>
                                <div class="mt-1">${getStatusBadge(o.status, isMyTurn)} <strong class="text-primary ms-2">${o.currentAmount} €</strong></div>
                            </div>
                        </div>
                        <button class="btn btn-sm ${isMyTurn ? 'btn-primary' : 'btn-outline-primary'} btn-open">Dettagli trattativa</button>
                    </div>
                `;
                card.querySelector('.btn-open').addEventListener('click', () => openNeg(o.id));
                sentContainer.appendChild(card);
            });
        }

        async function openNeg(offerId) {
            try {
                const res = await authFetch(`/api/offers/${offerId}`);
                if (!res.ok) return;
                currentOffer = (await res.json()).offer;
                renderModal();
                modalNeg.show();
            } catch (_) {}
        }

        function renderModal() {
            if (!currentOffer) return;
            const o = currentOffer;
            const user = getCurrentUser();
            const isSeller = user && user.id === o.sellerId;
            const isBuyer = user && user.id === o.buyerId;
            const isMyTurn = (o.status === 'pending_seller' && isSeller) || (o.status === 'pending_buyer' && isBuyer);

            document.getElementById('neg-title').textContent = o.announcementTitle;
            document.getElementById('neg-seller').textContent = o.sellerUsername;
            document.getElementById('neg-buyer').textContent = o.buyerUsername;
            document.getElementById('neg-current-price').textContent = `${o.currentAmount} €`;
            document.getElementById('neg-status-badge').innerHTML = getStatusBadge(o.status, isMyTurn);

            const hist = document.getElementById('neg-history');
            hist.innerHTML = '';
            o.history.forEach((h) => {
                const isFromSeller = h.fromUserId === o.sellerId;
                const name = isFromSeller ? o.sellerUsername : o.buyerUsername;
                const role = isFromSeller ? 'Venditore' : 'Acquirente';
                const isMe = user && user.id === h.fromUserId;
                const div = document.createElement('div');
                div.className = 'timeline-item';
                div.innerHTML = `
                    <div class="p-3 bg-light rounded border">
                        <div class="d-flex justify-content-between mb-1">
                            <strong>${escapeHtml(name)} <span class="badge ${isFromSeller ? 'bg-secondary' : 'bg-info text-dark'}">${role}</span> ${isMe ? '<span class="badge bg-primary">Tu</span>' : ''}</strong>
                            <span class="text-muted small">${formatDate(h.createdAt)}</span>
                        </div>
                        <div class="fw-bold text-success fs-5 mb-1">${h.amount} €</div>
                        ${h.message ? `<div class="text-muted small fst-italic">"${escapeHtml(h.message)}"</div>` : ''}
                    </div>
                `;
                hist.appendChild(div);
            });

            const actions = document.getElementById('neg-actions');
            actions.innerHTML = '';

            if (o.status === 'accepted') {
                actions.innerHTML = `<div class="alert alert-success w-100 text-center mb-0">Accordo raggiunto a <strong>${o.currentAmount} €</strong>!</div>`;
            } else if (o.status === 'rejected') {
                actions.innerHTML = `<div class="alert alert-danger w-100 text-center mb-0">Questa trattativa è stata rifiutata.</div>`;
            } else if (o.status === 'cancelled') {
                actions.innerHTML = `<div class="alert alert-secondary w-100 text-center mb-0">Trattativa annullata: questo oggetto è già stato venduto a un altro acquirente.</div>`;
            } else if (isMyTurn) {
                actions.innerHTML = `
                    <div class="w-100">
                        <div class="d-flex gap-2 mb-3">
                            <button class="btn btn-success flex-grow-1" id="btn-accept">Accetta (${o.currentAmount} €)</button>
                            <button class="btn btn-outline-danger" id="btn-reject">Rifiuta</button>
                        </div>
                        <div class="card p-3 bg-light">
                            <h6 class="mb-2 text-muted">Invia una Controfferta</h6>
                            <div class="input-group mb-2">
                                <span class="input-group-text">€</span>
                                <input type="number" id="input-counter-amount" class="form-control" placeholder="Nuova cifra" min="0">
                            </div>
                            <input type="text" id="input-counter-message" class="form-control form-control-sm mb-2" placeholder="Messaggio facoltativo">
                            <button class="btn btn-primary btn-sm" id="btn-counter">Invia Controfferta</button>
                        </div>
                    </div>
                `;

                actions.querySelector('#btn-accept').addEventListener('click', async () => {
                    if (!confirm(`Accetti la proposta di ${o.currentAmount} €? L'annuncio risulterà venduto.`)) return;
                    try {
                        const res = await authFetch(`/api/offers/${o.id}/accept`, { method: 'POST' });
                        const data = await res.json();
                        if (res.ok) { currentOffer = data.offer; renderModal(); loadOffers(); }
                        else alert(data.error);
                    } catch (_) {}
                });

                actions.querySelector('#btn-reject').addEventListener('click', async () => {
                    if (!confirm('Rifiutare l\'offerta?')) return;
                    try {
                        const res = await authFetch(`/api/offers/${o.id}/reject`, { method: 'POST' });
                        const data = await res.json();
                        if (res.ok) { currentOffer = data.offer; renderModal(); loadOffers(); }
                        else alert(data.error);
                    } catch (_) {}
                });

                actions.querySelector('#btn-counter').addEventListener('click', async () => {
                    const amount = parseFloat(document.getElementById('input-counter-amount').value);
                    const message = document.getElementById('input-counter-message').value;
                    if (isNaN(amount) || amount < 0) return alert('Importo non valido.');

                    try {
                        const res = await authFetch(`/api/offers/${o.id}/counter`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ amount, message })
                        });
                        const data = await res.json();
                        if (res.ok) { currentOffer = data.offer; renderModal(); loadOffers(); }
                        else alert(data.error);
                    } catch (_) {}
                });
            } else {
                actions.innerHTML = `<div class="alert alert-secondary w-100 text-center mb-0">In attesa della risposta della controparte.</div>`;
            }
        }

        // WebSocket events per trattative
        ['NEW_OFFER', 'COUNTER_OFFER', 'OFFER_ACCEPTED', 'OFFER_REJECTED', 'OFFER_CANCELLED'].forEach(evt => {
            onWsEvent(evt, (updated) => {
                loadOffers();
                if (currentOffer && updated && currentOffer.id === updated.id) {
                    currentOffer = updated;
                    renderModal();
                }
            });
        });

        loadOffers();
    }

    // ------------------------------------------------------------------------
    // 8. LOGICA PAGINA: I MIEI ANNUNCI (/my-announcements)
    // ------------------------------------------------------------------------
    function initMyAnnouncementsPage() {
        const container = document.getElementById('my-announcements-container');
        if (!container) return;

        const empty = document.getElementById('my-empty-state');
        const modalEditEl = document.getElementById('modalEditAnnouncement');
        const modalEdit = modalEditEl ? new bootstrap.Modal(modalEditEl) : null;
        const formEdit = document.getElementById('form-edit-announcement');

        async function load() {
            try {
                const res = await authFetch('/api/announcements/my');
                if (res.ok) {
                    const data = await res.json();
                    render(data.announcements || []);
                }
            } catch (_) {}
        }

        function render(list) {
            container.innerHTML = '';
            if (list.length === 0) {
                if (empty) empty.classList.remove('d-none');
                return;
            }
            if (empty) empty.classList.add('d-none');

            list.forEach((item) => {
                const col = document.createElement('div');
                col.className = 'col-md-6 col-lg-4 mb-4';
                const isSold = item.status === 'sold';
                const priceText = item.price === 0 ? 'Gratis' : `${item.price} €`;

                col.innerHTML = `
                    <div class="card h-100 shadow-sm border-0">
                        <div class="announcement-img-container">
                            <img src="${item.image}" alt="${escapeHtml(item.title)}" class="announcement-img">
                            <span class="badge ${item.price === 0 ? 'bg-success' : 'bg-primary'} price-badge">${priceText}</span>
                            ${isSold ? '<span class="badge bg-danger position-absolute top-0 start-0 m-2">Venduto</span>' : ''}
                        </div>
                        <div class="card-body">
                            <h5 class="card-title text-truncate">${escapeHtml(item.title)}</h5>
                            <p class="card-text text-muted small text-truncate-2">${escapeHtml(item.description)}</p>
                            <div class="text-muted small">Pubblicato: ${formatDate(item.createdAt)}</div>
                        </div>
                        <div class="card-footer bg-white border-0 pt-0 pb-3 d-flex gap-2">
                            <button class="btn btn-outline-primary btn-sm flex-grow-1 btn-edit">Modifica</button>
                            <button class="btn btn-outline-danger btn-sm btn-delete">Elimina</button>
                        </div>
                    </div>
                `;

                col.querySelector('.btn-edit').addEventListener('click', () => {
                    document.getElementById('edit-announcement-id').value = item.id;
                    document.getElementById('edit-title').value = item.title;
                    document.getElementById('edit-description').value = item.description;
                    document.getElementById('edit-price').value = item.price;
                    document.getElementById('edit-image').value = '';
                    modalEdit.show();
                });

                col.querySelector('.btn-delete').addEventListener('click', async () => {
                    if (!confirm(`Eliminare "${item.title}"?`)) return;
                    try {
                        const res = await authFetch(`/api/announcements/${item.id}`, { method: 'DELETE' });
                        if (res.ok) load();
                    } catch (_) {}
                });

                container.appendChild(col);
            });
        }

        if (formEdit) {
            formEdit.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = document.getElementById('edit-announcement-id').value;
                const formData = new FormData(formEdit);
                try {
                    const res = await authFetch(`/api/announcements/${id}`, { method: 'PUT', body: formData });
                    if (res.ok) {
                        modalEdit.hide();
                        load();
                    } else {
                        const data = await res.json();
                        alert(data.error || 'Errore modifica.');
                    }
                } catch (_) {}
            });
        }

        load();
    }

    // ------------------------------------------------------------------------
    // 9. AVVIO AL CARICAMENTO DEL DOM
    // ------------------------------------------------------------------------
    document.addEventListener('DOMContentLoaded', () => {
        handleNavigation();
        initWebSocket();
        initLoginPage();
        initRegisterPage();
        initHomePage();
        initOffersPage();
        initMyAnnouncementsPage();
    });
})();
