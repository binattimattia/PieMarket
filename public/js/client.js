(function () {
    // Chiave usata per memorizzare la sessione utente nel localStorage del browser
    const CHIAVE_MEMORIA_LOCALE = 'piemarket_user';

    // --- 1. GESTIONE STATO UTENTE E CHIAMATE HTTP ---

    /**
     * Recupera l'oggetto dell'utente attualmente autenticato dal localStorage.
     */
    function ottieniUtenteCorrente() {
        try {
            return JSON.parse(localStorage.getItem(CHIAVE_MEMORIA_LOCALE));
        } catch {
            return null;
        }
    }

    /**
     * Salva l'oggetto utente nel localStorage per persistere la sessione.
     */
    function salvaUtenteCorrente(utente) {
        localStorage.setItem(CHIAVE_MEMORIA_LOCALE, JSON.stringify(utente));
    }

    /**
     * Rimuove i dati dell'utente dal localStorage (logout).
     */
    function rimuoviUtenteCorrente() {
        localStorage.removeItem(CHIAVE_MEMORIA_LOCALE);
    }

    /**
     * Helper per eseguire richieste fetch aggiungendo l'header personalizzato 'x-user-id'.
     * Questo sostituisce l'uso di cookie o token complessi per scopi didattici.
     */
    function richiestaAutenticata(url, opzioni = {}) {
        const utente = ottieniUtenteCorrente();
        const intestazioni = { ...(opzioni.headers || {}) };
        if (utente && utente.id) {
            intestazioni['x-user-id'] = utente.id;
        }
        return fetch(url, { ...opzioni, headers: intestazioni });
    }

    /**
     * Calcola il tempo rimanente confrontando la data di scadenza con l'ora attuale.
     */
    function calcolaTempoRimanente(dataScadenzaIso) {
        const differenzaMs = new Date(dataScadenzaIso).getTime() - Date.now();
        if (differenzaMs <= 0) {
            return { terminata: true, testo: 'Asta terminata', classeColore: 'bg-secondary' };
        }

        const secondiTotali = Math.floor(differenzaMs / 1000);
        const minuti = Math.floor(secondiTotali / 60);
        const secondi = secondiTotali % 60;

        let testoFormattato = '';
        if (minuti > 59) {
            const ore = Math.floor(minuti / 60);
            testoFormattato = `${ore}h ${minuti % 60}m`;
        } else {
            testoFormattato = `${String(minuti).padStart(2, '0')}:${String(secondi).padStart(2, '0')}`;
        }

        // Colori del badge in base all'urgenza: Rosso (<1 min), Giallo (<5 min), Blu (>5 min)
        const classeColore = secondiTotali < 60
            ? 'bg-danger'
            : (secondiTotali < 300 ? 'bg-warning text-dark' : 'bg-primary');

        return {
            terminata: false,
            testo: `⏳ ${testoFormattato}`,
            classeColore: classeColore
        };
    }

    // --- 2. COMUNICAZIONE IN TEMPO REALE TRAMITE WEBSOCKET ---
    const gestoriEventiWebSocket = {};

    /**
     * Inizializza la connessione WebSocket con il server Node.js.
     * Si riconnette automaticamente ogni 3 secondi se la connessione viene interrotta.
     */
    function inizializzaWebSocket() {
        const utente = ottieniUtenteCorrente();
        if (!utente) return;

        const protocollo = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const urlWs = `${protocollo}//${location.host}/ws?userId=${utente.id}`;
        const ws = new WebSocket(urlWs);

        // Quando il server invia un messaggio, decodifica il JSON e notifica le funzioni registrate
        ws.onmessage = (evento) => {
            try {
                const { type: tipo, data: dati } = JSON.parse(evento.data);
                const funzioni = gestoriEventiWebSocket[tipo] || [];
                funzioni.forEach(fn => fn(dati));
            } catch (_) {}
        };

        // Riconnessione automatica in caso di disconnessione
        ws.onclose = () => setTimeout(inizializzaWebSocket, 3000);
    }

    /**
     * Registra una funzione di callback da eseguire quando arriva uno specifico evento WebSocket.
     */
    function registraEventoWebSocket(tipo, callback) {
        if (!gestoriEventiWebSocket[tipo]) gestoriEventiWebSocket[tipo] = [];
        gestoriEventiWebSocket[tipo].push(callback);
    }

    // --- 3. CONTROLLO ACCESSO ALLE PAGINE E GESTIONE NAVBAR ---
    function gestisciNavigazione() {
        const utente = ottieniUtenteCorrente();
        const rottaAttuale = location.pathname;
        const ePaginaAutenticazione = ['/login', '/register'].includes(rottaAttuale);

        // Se non autenticato e cerca di accedere a una pagina protetta -> reindirizza al login
        if (!utente && !ePaginaAutenticazione) {
            location.href = '/login';
            return;
        }

        // Se già autenticato e visita login o register -> reindirizza alla home
        if (utente && ePaginaAutenticazione) {
            location.href = '/';
            return;
        }

        // Mostra il nome dell'utente loggato nella barra di navigazione
        const spanNomeUtente = document.getElementById('nav-username-display');
        if (utente && spanNomeUtente) {
            spanNomeUtente.textContent = utente.username;
        }

        // Gestione del pulsante di logout
        const bottoneLogout = document.getElementById('btn-logout');
        if (bottoneLogout) {
            bottoneLogout.onclick = (e) => {
                e.preventDefault();
                rimuoviUtenteCorrente();
                location.href = '/login';
            };
        }
    }

    // --- 4. LOGICA DELLA PAGINA DI LOGIN (/login) ---
    function inizializzaPaginaLogin() {
        const moduloLogin = document.getElementById('form-login');
        if (!moduloLogin) return;

        moduloLogin.onsubmit = async (evento) => {
            evento.preventDefault();
            const contenitoreAvvisi = document.getElementById('alert-container');

            try {
                const risposta = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: moduloLogin.email.value,
                        password: moduloLogin.password.value
                    })
                });

                const dati = await risposta.json();
                if (risposta.ok) {
                    salvaUtenteCorrente(dati.user);
                    location.href = '/';
                } else {
                    contenitoreAvvisi.innerHTML = `<div class="alert alert-danger py-2 small">${dati.error}</div>`;
                }
            } catch {
                contenitoreAvvisi.innerHTML = '<div class="alert alert-danger py-2 small">Errore di connessione.</div>';
            }
        };
    }

    // --- 5. LOGICA DELLA PAGINA DI REGISTRAZIONE (/register) ---
    function inizializzaPaginaRegistrazione() {
        const moduloRegistrazione = document.getElementById('form-register');
        if (!moduloRegistrazione) return;

        moduloRegistrazione.onsubmit = async (evento) => {
            evento.preventDefault();
            const contenitoreAvvisi = document.getElementById('alert-container');

            // Controllo lato client: corrispondenza password
            if (moduloRegistrazione.password.value !== moduloRegistrazione.confirmPassword.value) {
                contenitoreAvvisi.innerHTML = '<div class="alert alert-danger py-2 small">Le password non coincidono.</div>';
                return;
            }

            // Controllo lato client: vincolo Piemonte
            if (moduloRegistrazione.region.value !== 'Piemonte') {
                contenitoreAvvisi.innerHTML = '<div class="alert alert-warning py-2 small">Piemarket è riservato ai residenti in Piemonte.</div>';
                return;
            }

            try {
                const risposta = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: moduloRegistrazione.username.value,
                        email: moduloRegistrazione.email.value,
                        password: moduloRegistrazione.password.value,
                        confirmPassword: moduloRegistrazione.confirmPassword.value,
                        region: moduloRegistrazione.region.value
                    })
                });

                const dati = await risposta.json();
                if (risposta.ok) {
                    salvaUtenteCorrente(dati.user);
                    location.href = '/';
                } else {
                    contenitoreAvvisi.innerHTML = `<div class="alert alert-danger py-2 small">${dati.error}</div>`;
                }
            } catch {
                contenitoreAvvisi.innerHTML = '<div class="alert alert-danger py-2 small">Errore di connessione.</div>';
            }
        };
    }

    // --- 6. LOGICA DELLA PAGINA HOME: ASTE DAL VIVO (/) ---
    function inizializzaPaginaHome() {
        const grigliaAste = document.getElementById('announcements-grid');
        if (!grigliaAste) return;

        let elencoAste = [];
        let astaDettaglioCorrente = null;

        const messaggioVuoto = document.getElementById('empty-state');
        const elementoModaleDettaglio = document.getElementById('modalDetail');
        const modaleDettaglio = elementoModaleDettaglio ? new bootstrap.Modal(elementoModaleDettaglio) : null;
        const elementoModalePubblica = document.getElementById('modalPublish');
        const modalePubblica = elementoModalePubblica ? new bootstrap.Modal(elementoModalePubblica) : null;

        /**
         * Richiede al server l'elenco aggiornato delle aste e ridisegna la pagina.
         */
        async function caricaAste() {
            try {
                const risposta = await richiestaAutenticata('/api/announcements');
                if (risposta.ok) {
                    const dati = await risposta.json();
                    elencoAste = dati.announcements || [];
                    aggiornaGraficaAste();
                }
            } catch (_) {}
        }

        /**
         * Invia una nuova offerta (rilancio) per una determinata asta.
         */
        async function inviaOfferta(idAsta, importo) {
            try {
                const risposta = await richiestaAutenticata(`/api/announcements/${idAsta}/bid`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: importo })
                });

                const dati = await risposta.json();
                if (risposta.ok) {
                    aggiornaAstaInMemoria(dati.announcement);
                } else {
                    alert(dati.error || 'Errore durante l\'offerta.');
                }
            } catch {
                alert('Errore di connessione durante l\'offerta.');
            }
        }

        /**
         * Aggiorna un'asta sia nell'array locale che nel modale se aperto.
         */
        function aggiornaAstaInMemoria(astaAggiornata) {
            const indice = elencoAste.findIndex(a => a.id === astaAggiornata.id);
            if (indice !== -1) elencoAste[indice] = astaAggiornata;
            aggiornaGraficaAste();

            if (astaDettaglioCorrente && astaDettaglioCorrente.id === astaAggiornata.id) {
                astaDettaglioCorrente = astaAggiornata;
                aggiornaModaleDettaglio();
            }
        }

        /**
         * Genera dinamicamente le card HTML per ciascuna asta presente in elencoAste.
         */
        function aggiornaGraficaAste() {
            grigliaAste.innerHTML = '';
            if (messaggioVuoto) {
                messaggioVuoto.classList.toggle('d-none', elencoAste.length > 0);
            }

            const utente = ottieniUtenteCorrente();

            elencoAste.forEach(asta => {
                const infoTempo = calcolaTempoRimanente(asta.expiresAt);
                const eConclusa = asta.status === 'ended' || infoTempo.terminata;
                const eProprietario = utente && utente.id === asta.userId;
                const eMigliorOfferente = utente && utente.id === asta.highestBidderId;

                const colonna = document.createElement('div');
                colonna.className = 'col-md-6 col-lg-4 mb-4';
                colonna.innerHTML = `
                    <div class="card h-100 shadow-sm border-0 ${eConclusa ? 'opacity-75' : ''}">
                        <div class="announcement-img-container position-relative">
                            <img src="${asta.image}" alt="${asta.title}" class="announcement-img" loading="lazy">
                            <span class="badge ${infoTempo.classeColore} position-absolute top-0 start-0 m-2 px-3 py-2 fs-6 shadow-sm auction-timer-badge" data-expires="${asta.expiresAt}">
                                ${infoTempo.testo}
                            </span>
                            <span class="badge bg-dark position-absolute bottom-0 end-0 m-2 px-2 py-1 small">
                                Base: ${asta.startingPrice} €
                            </span>
                        </div>
                        <div class="card-body d-flex flex-column">
                            <h5 class="card-title fw-bold text-truncate mb-1">${asta.title}</h5>
                            <p class="card-text text-muted small text-truncate-2 flex-grow-1">${asta.description}</p>
                            <div class="p-3 my-2 rounded-3 bg-light border">
                                <div class="d-flex justify-content-between align-items-center">
                                    <span class="small text-muted fw-semibold">Offerta Attuale:</span>
                                    <span class="fs-4 fw-bold text-success">${asta.currentBid} €</span>
                                </div>
                                <div class="d-flex justify-content-between align-items-center mt-1 pt-1 border-top small">
                                    <span class="text-muted">Miglior offerente:</span>
                                    <strong class="${eMigliorOfferente ? 'text-primary' : 'text-dark'}">
                                        ${asta.highestBidderUsername ? `${asta.highestBidderUsername} ${eMigliorOfferente ? '(Tu)' : ''}` : 'Nessuna offerta'}
                                    </strong>
                                </div>
                            </div>
                            <div class="mt-2">
                                ${eConclusa ? `
                                    <div class="alert alert-secondary py-2 mb-0 text-center small fw-semibold">
                                        Asta conclusa! ${asta.highestBidderUsername ? `Vinta da <strong>${asta.highestBidderUsername}</strong> a ${asta.currentBid} €` : 'Nessun acquirente'}
                                    </div>
                                ` : eProprietario ? `
                                    <div class="alert alert-info py-2 mb-0 text-center small">
                                        Questa è la tua asta. Non puoi rilanciare.
                                    </div>
                                ` : `
                                    <!-- Bottoni Rilancio Rapido (+1€ e +5€) -->
                                    <div class="d-flex gap-2 mb-2">
                                        <button class="btn btn-outline-success btn-sm flex-fill fw-bold" onclick="PiemarketApp.bid('${asta.id}', ${asta.currentBid + 1})">
                                            +1 € (${asta.currentBid + 1} €)
                                        </button>
                                        <button class="btn btn-success btn-sm flex-fill fw-bold" onclick="PiemarketApp.bid('${asta.id}', ${asta.currentBid + 5})">
                                            +5 € (${asta.currentBid + 5} €)
                                        </button>
                                    </div>
                                    <!-- Offerta libera personalizzata -->
                                    <div class="input-group input-group-sm mb-1">
                                        <span class="input-group-text">€</span>
                                        <input type="number" class="form-control" id="custom-bid-${asta.id}" placeholder="Offerta libera" min="${asta.currentBid + 1}">
                                        <button class="btn btn-primary" onclick="PiemarketApp.customBid('${asta.id}', ${asta.currentBid})">Offri</button>
                                    </div>
                                `}
                            </div>
                        </div>
                        <div class="card-footer bg-white border-0 pt-0 pb-3">
                            <button class="btn btn-outline-secondary btn-sm w-100" onclick="PiemarketApp.openDetail('${asta.id}')">
                                Storico rilanci (${asta.bids ? asta.bids.length : 0})
                            </button>
                        </div>
                    </div>
                `;
                grigliaAste.appendChild(colonna);
            });
        }

        /**
         * Rende visibili le informazioni complete e la cronologia puntate nel modale.
         */
        function aggiornaModaleDettaglio() {
            const asta = astaDettaglioCorrente;
            if (!asta) return;

            const utente = ottieniUtenteCorrente();
            const infoTempo = calcolaTempoRimanente(asta.expiresAt);
            const eConclusa = asta.status === 'ended' || infoTempo.terminata;
            const eProprietario = utente && utente.id === asta.userId;

            document.getElementById('detail-img').src = asta.image;
            document.getElementById('detail-title').textContent = asta.title;
            document.getElementById('detail-description').textContent = asta.description;
            document.getElementById('detail-starting-price').textContent = `${asta.startingPrice} €`;
            document.getElementById('detail-current-bid').textContent = `${asta.currentBid} €`;
            document.getElementById('detail-highest-bidder').textContent = asta.highestBidderUsername || 'Nessuna offerta ancora';

            const elementoTimer = document.getElementById('detail-timer');
            elementoTimer.textContent = infoTempo.testo;
            elementoTimer.className = `fs-4 fw-bold ${infoTempo.terminata ? 'text-secondary' : 'text-danger'}`;

            // Rendering lista rilanci precedenti
            const listaPuntate = document.getElementById('detail-bids-list');
            listaPuntate.innerHTML = (!asta.bids || asta.bids.length === 0)
                ? '<div class="text-muted text-center py-2">Nessun rilancio effettuato. Sii il primo!</div>'
                : [...asta.bids].reverse().map(puntata => `
                    <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                        <span><strong>${puntata.username}</strong></span>
                        <span class="text-success fw-bold">${puntata.amount} €</span>
                        <span class="text-muted small">${new Date(puntata.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                `).join('');

            // Azioni rapide disponibili nel modale
            const contenitoreAzioni = document.getElementById('detail-bid-actions');
            if (eConclusa) {
                contenitoreAzioni.innerHTML = `<div class="alert alert-secondary text-center mb-0">Asta conclusa! Vincitore: <strong>${asta.highestBidderUsername || 'Nessuno'}</strong> a <strong>${asta.currentBid} €</strong></div>`;
            } else if (eProprietario) {
                contenitoreAzioni.innerHTML = `<div class="alert alert-info text-center mb-0">Sei il proprietario di questa asta. Non puoi rilanciare.</div>`;
            } else {
                contenitoreAzioni.innerHTML = `
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-success flex-fill fw-bold" onclick="PiemarketApp.bid('${asta.id}', ${asta.currentBid + 1})">+1 € (${asta.currentBid + 1} €)</button>
                        <button class="btn btn-success flex-fill fw-bold" onclick="PiemarketApp.bid('${asta.id}', ${asta.currentBid + 5})">+5 € (${asta.currentBid + 5} €)</button>
                    </div>
                `;
            }
        }

        // Pubblicazione nuova asta tramite il form del modale
        if (elementoModalePubblica) {
            const moduloPubblica = document.getElementById('form-publish');
            moduloPubblica.onsubmit = async (evento) => {
                evento.preventDefault();
                const bottoneInvio = document.getElementById('btn-submit-publish');
                bottoneInvio.disabled = true;

                try {
                    const datiForm = new FormData(moduloPubblica);
                    const risposta = await richiestaAutenticata('/api/announcements', {
                        method: 'POST',
                        body: datiForm
                    });

                    const dati = await risposta.json();
                    bottoneInvio.disabled = false;

                    if (risposta.ok) {
                        moduloPubblica.reset();
                        modalePubblica.hide();
                    } else {
                        alert(dati.error || 'Errore creazione asta.');
                    }
                } catch {
                    bottoneInvio.disabled = false;
                    alert('Errore di connessione.');
                }
            };
        }

        // Timer periodico nel browser: aggiorna ogni secondo i testi del countdown
        setInterval(() => {
            document.querySelectorAll('.auction-timer-badge').forEach(badge => {
                const info = calcolaTempoRimanente(badge.getAttribute('data-expires'));
                badge.textContent = info.testo;
                badge.className = `badge ${info.classeColore} position-absolute top-0 start-0 m-2 px-3 py-2 fs-6 shadow-sm auction-timer-badge`;
            });

            if (astaDettaglioCorrente) {
                const elementoTimerDettaglio = document.getElementById('detail-timer');
                if (elementoTimerDettaglio) {
                    elementoTimerDettaglio.textContent = calcolaTempoRimanente(astaDettaglioCorrente.expiresAt).testo;
                }
            }
        }, 1000);

        // Esposizione funzioni globali nell'oggetto PiemarketApp per gli handler onclick
        window.PiemarketApp = {
            inviaOfferta,
            bid: inviaOfferta, // Alias compatibilità
            inviaOffertaPersonalizzata: (id, offertaCorrente) => {
                const campoInput = document.getElementById(`custom-bid-${id}`);
                const valoreOfferta = parseFloat(campoInput?.value);
                if (isNaN(valoreOfferta) || valoreOfferta <= offertaCorrente) {
                    alert(`L'offerta deve essere superiore all'offerta attuale (${offertaCorrente} €).`);
                    return;
                }
                inviaOfferta(id, valoreOfferta);
            },
            customBid: (id, offertaCorrente) => window.PiemarketApp.inviaOffertaPersonalizzata(id, offertaCorrente),
            apriDettaglioAsta: (id) => {
                astaDettaglioCorrente = elencoAste.find(a => a.id === id);
                if (astaDettaglioCorrente) {
                    aggiornaModaleDettaglio();
                    modaleDettaglio.show();
                }
            },
            openDetail: (id) => window.PiemarketApp.apriDettaglioAsta(id)
        };

        // Gestione degli eventi WebSocket in tempo reale
        registraEventoWebSocket('NEW_ANNOUNCEMENT', (nuovaAsta) => {
            elencoAste.unshift(nuovaAsta);
            aggiornaGraficaAste();
        });

        registraEventoWebSocket('BID_PLACED', aggiornaAstaInMemoria);

        registraEventoWebSocket('AUCTION_ENDED', (astaTerminata) => {
            const asta = elencoAste.find(a => a.id === astaTerminata.id);
            if (asta) asta.status = 'ended';
            aggiornaGraficaAste();
            if (astaDettaglioCorrente && astaDettaglioCorrente.id === astaTerminata.id) {
                astaDettaglioCorrente.status = 'ended';
                aggiornaModaleDettaglio();
            }
        });

        registraEventoWebSocket('ANNOUNCEMENT_REMOVED', ({ id }) => {
            elencoAste = elencoAste.filter(a => a.id !== id);
            aggiornaGraficaAste();
        });

        // Caricamento iniziale delle aste
        caricaAste();
    }

    // --- 7. LOGICA DELLA PAGINA "LE MIE ASTE" (/my-announcements) ---
    function inizializzaPaginaMieAste() {
        const contenitoreMieAste = document.getElementById('my-announcements-container');
        if (!contenitoreMieAste) return;

        const messaggioVuoto = document.getElementById('my-empty-state');

        async function caricaMieAste() {
            try {
                const risposta = await richiestaAutenticata('/api/announcements/my');
                if (risposta.ok) {
                    const dati = await risposta.json();
                    renderizzaMieAste(dati.announcements || []);
                }
            } catch (_) {}
        }

        function renderizzaMieAste(lista) {
            contenitoreMieAste.innerHTML = '';
            if (messaggioVuoto) {
                messaggioVuoto.classList.toggle('d-none', lista.length > 0);
            }

            lista.forEach(asta => {
                const infoTempo = calcolaTempoRimanente(asta.expiresAt);
                const eConclusa = asta.status === 'ended' || infoTempo.terminata;

                const colonna = document.createElement('div');
                colonna.className = 'col-md-6 col-lg-4 mb-4';
                colonna.innerHTML = `
                    <div class="card h-100 shadow-sm border-0">
                        <div class="announcement-img-container position-relative">
                            <img src="${asta.image}" alt="${asta.title}" class="announcement-img">
                            <span class="badge ${infoTempo.classeColore} position-absolute top-0 start-0 m-2 px-2 py-1">${infoTempo.testo}</span>
                        </div>
                        <div class="card-body">
                            <h5 class="card-title fw-bold text-truncate">${asta.title}</h5>
                            <p class="card-text text-muted small text-truncate-2">${asta.description}</p>
                            <div class="p-2 bg-light rounded border small mb-2">
                                <div>Base d'asta: <strong>${asta.startingPrice} €</strong></div>
                                <div>Offerta più alta: <strong class="text-success">${asta.currentBid} €</strong></div>
                                <div>Miglior offerente: <strong>${asta.highestBidderUsername || 'Nessuno'}</strong></div>
                                <div>Totale rilanci: <strong>${asta.bids ? asta.bids.length : 0}</strong></div>
                            </div>
                        </div>
                        <div class="card-footer bg-white border-0 pt-0 pb-3">
                            ${(!asta.bids || asta.bids.length === 0) && !eConclusa ? `
                                <button class="btn btn-outline-danger btn-sm w-100" onclick="PiemarketApp.deleteAuction('${asta.id}')">
                                    Annulla Asta
                                </button>
                            ` : `<div class="text-center small text-muted fst-italic">${eConclusa ? 'Asta conclusa' : 'Asta con offerte attive'}</div>`}
                        </div>
                    </div>
                `;
                contenitoreMieAste.appendChild(colonna);
            });
        }

        // Funzione per eliminare/annullare una propria asta
        window.PiemarketApp = window.PiemarketApp || {};
        window.PiemarketApp.eliminaAsta = async (id) => {
            if (!confirm('Sei sicuro di voler annullare questa asta?')) return;
            const risposta = await richiestaAutenticata(`/api/announcements/${id}`, { method: 'DELETE' });
            if (risposta.ok) caricaMieAste();
        };
        window.PiemarketApp.deleteAuction = (id) => window.PiemarketApp.eliminaAsta(id);

        // Aggiorna la vista quando arrivano eventi WebSocket pertinenti
        registraEventoWebSocket('BID_PLACED', caricaMieAste);
        registraEventoWebSocket('AUCTION_ENDED', caricaMieAste);

        caricaMieAste();
    }

    // --- 8. AVVIO GENERALE AL CARICAMENTO DELLA PAGINA ---
    document.addEventListener('DOMContentLoaded', () => {
        gestisciNavigazione();
        inizializzaWebSocket();
        inizializzaPaginaLogin();
        inizializzaPaginaRegistrazione();
        inizializzaPaginaHome();
        inizializzaPaginaMieAste();
    });
})();
