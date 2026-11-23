// --- 1. MODULI CORE E DI TERZE PARTI ---
const http = require('http');           
const path = require('path');          
const fs = require('fs');               
const express = require('express');     
const multer = require('multer');       
const { Server: ServerWebSocket } = require('ws'); 

// --- 2. CONFIGURAZIONE E COSTANTI ---
const applicazione = express();
const PORTA = process.env.PORT || 3000;
const CARTELLA_DATI = path.join(__dirname, 'data');
const FILE_UTENTI = 'users.json';
const FILE_ANNUNCI = 'announcements.json';

// --- 3. GESTIONE DELLA PERSISTENZA DEI DATI (FILE JSON) ---

/**
 * Legge in modo asincrono un file JSON contenuto nella cartella 'data'.
 * Se il file non esiste o è vuoto, restituisce un array vuoto per evitare crash.
 */
async function leggiDati(nomeFile) {
    try {
        const percorsoCompleto = path.join(CARTELLA_DATI, nomeFile);
        const contenuto = await fs.promises.readFile(percorsoCompleto, 'utf-8');
        return JSON.parse(contenuto);
    } catch {
        return [];
    }
}

/**
 * Salva in modo asincrono i dati all'interno del file JSON specificato.
 * Usa JSON.stringify con indentazione a 2 spazi per mantenere il file leggibile.
 */
async function scriviDati(nomeFile, dati) {
    const percorsoCompleto = path.join(CARTELLA_DATI, nomeFile);
    await fs.promises.writeFile(percorsoCompleto, JSON.stringify(dati, null, 2), 'utf-8');
}

/**
 * Genera un identificatore progressivo lineare e intuitivo (es. user1, user2, announcement1).
 * Rimuove il prefisso testuale per isolare il numero, calcola il massimo attuale e aggiunge 1.
 */
function generaNuovoId(lista, prefisso) {
    let numeroMassimo = 0;
    lista.forEach(elemento => {
        if (elemento && elemento.id) {
            const numeroEstratto = parseInt(elemento.id.replace(prefisso, ''), 10);
            if (!isNaN(numeroEstratto) && numeroEstratto > numeroMassimo) {
                numeroMassimo = numeroEstratto;
            }
        }
    });
    return `${prefisso}${numeroMassimo + 1}`;
}

// --- 4. GESTIONE UPLOAD IMMAGINI (MULTER) ---
const cartellaUpload = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(cartellaUpload)) {
    fs.mkdirSync(cartellaUpload, { recursive: true });
}

// Configura il salvataggio dei file su disco con nome univoco basato sul timestamp
const configurazioneArchiviazione = multer.diskStorage({
    destination: (richiesta, file, callback) => callback(null, cartellaUpload),
    filename: (richiesta, file, callback) => {
        const estensione = path.extname(file.originalname);
        callback(null, `img_${Date.now()}${estensione}`);
    }
});
const gestoreUpload = multer({ storage: configurazioneArchiviazione });

// --- 5. MIDDLEWARE DI BASE E AUTENTICAZIONE ---
applicazione.use(express.json());                          // Decodifica automatica dei body in formato JSON
applicazione.use(express.urlencoded({ extended: true }));  // Decodifica dei dati inviati tramite form HTML
applicazione.use(express.static(path.join(__dirname, 'public'))); // Distribuzione dei file statici (HTML, CSS, JS client, immagini)

/**
 * Middleware di autenticazione per le rotte protette.
 * Verifica la presenza dell'ID utente tramite header HTTP 'x-user-id'.
 * Se l'ID corrisponde a un utente valido nel database JSON, permette l'accesso salvando l'utente in 'req.user'.
 */
async function richiediAutenticazione(richiesta, risposta, prossimo) {
    const idUtente = richiesta.headers['x-user-id'] || richiesta.query.userId || richiesta.body?.userId;
    const utenti = await leggiDati(FILE_UTENTI);
    const utenteTrovato = utenti.find(u => u.id === idUtente);

    if (!utenteTrovato) {
        return risposta.status(401).json({ error: 'Accesso negato. Utente non autenticato.' });
    }

    richiesta.user = utenteTrovato;
    prossimo(); // Passa al gestore della rotta successiva
}

// --- 6. FUNZIONI DI SUPPORTO PER LE ASTE ---

/**
 * Aggiunge a ciascun annuncio il nome utente del venditore (sellerUsername),
 * facilitando la visualizzazione lato frontend senza dover inviare dati sensibili.
 */
function arricchisciAnnuncio(annuncio, utenti) {
    const venditore = utenti.find(u => u.id === annuncio.userId);
    return { ...annuncio, sellerUsername: venditore ? venditore.username : 'Venditore' };
}

/**
 * Scansiona tutte le aste memorizzate. Se un'asta attiva ha superato la data di scadenza (expiresAt),
 * imposta lo stato a 'ended' (conclusa) e avvisa istantaneamente tutti i client tramite WebSocket.
 */
async function controllaAsteScadute() {
    const listaAste = await leggiDati(FILE_ANNUNCI);
    let modificato = false;
    const oraAttuale = Date.now();

    listaAste.forEach(asta => {
        if (asta.status === 'active' && new Date(asta.expiresAt).getTime() <= oraAttuale) {
            asta.status = 'ended';
            modificato = true;
            inviaATutti('AUCTION_ENDED', asta);
        }
    });

    if (modificato) {
        await scriviDati(FILE_ANNUNCI, listaAste);
    }
    return listaAste;
}

// --- 7. ROTTE HTML PER LA NAVIGAZIONE ---
applicazione.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views/home.html')));
applicazione.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views/login.html')));
applicazione.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views/register.html')));
applicazione.get('/my-announcements', (req, res) => res.sendFile(path.join(__dirname, 'views/my-announcements.html')));

// --- 8. ROTTE API: AUTENTICAZIONE UTENTI ---

// Registrazione di un nuovo utente con VINCOLO REGIONALE PIEMONTE
applicazione.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, confirmPassword, region } = req.body;

        // 1. Validazione campi obbligatori
        if (!username || !email || !password || !confirmPassword || !region) {
            return res.status(400).json({ error: 'Tutti i campi sono obbligatori.' });
        }

        // 2. Controllo fondamentale: la regione DEVE essere Piemonte
        if (String(region).trim() !== 'Piemonte') {
            return res.status(400).json({
                error: 'Piemarket è riservato ai residenti in Piemonte. Al momento non è possibile registrarsi da un\'altra regione.'
            });
        }

        // 3. Verifica corrispondenza e lunghezza minima password
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Le password non coincidono.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'La password deve avere almeno 6 caratteri.' });
        }

        // 4. Verifica unicità dell'indirizzo email
        const utenti = await leggiDati(FILE_UTENTI);
        const emailGiaPresente = utenti.some(u => u.email.toLowerCase() === email.trim().toLowerCase());
        if (emailGiaPresente) {
            return res.status(400).json({ error: 'Indirizzo email già registrato.' });
        }

        // 5. Creazione utente con ID progressivo (user1, user2...)
        const nuovoUtente = {
            id: generaNuovoId(utenti, 'user'),
            username: username.trim(),
            email: email.trim().toLowerCase(),
            password: password, // In chiaro per semplicità didattica (scopo scolastico)
            region: region.trim(),
            createdAt: new Date().toISOString()
        };

        utenti.push(nuovoUtente);
        await scriviDati(FILE_UTENTI, utenti);

        // Risposta senza esporre la password
        const { password: _, ...utenteSicuro } = nuovoUtente;
        res.status(201).json({ success: true, user: utenteSicuro });
    } catch (errore) {
        res.status(500).json({ error: errore.message });
    }
});

// Login con verifica di email e password
applicazione.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const utenti = await leggiDati(FILE_UTENTI);
        const utente = utenti.find(u => u.email.toLowerCase() === (email || '').trim().toLowerCase());

        if (!utente || utente.password !== password) {
            return res.status(401).json({ error: 'Credenziali non valide. Verifica email e password.' });
        }

        const { password: _, ...utenteSicuro } = utente;
        res.json({ success: true, user: utenteSicuro });
    } catch (errore) {
        res.status(500).json({ error: errore.message });
    }
});

// Logout (semplice conferma, il client pulirà il suo localStorage)
applicazione.post('/api/logout', (req, res) => res.json({ success: true }));

// Informazioni sul profilo dell'utente attualmente autenticato
applicazione.get('/api/me', richiediAutenticazione, (req, res) => {
    const { password: _, ...utenteSicuro } = req.user;
    res.json({ success: true, user: utenteSicuro });
});

// --- 9. ROTTE API: GESTIONE ASTE E RILANCI ---

// Ottiene tutte le aste (ordinate dalla più recente)
applicazione.get('/api/announcements', async (req, res) => {
    try {
        const aste = await controllaAsteScadute();
        const utenti = await leggiDati(FILE_UTENTI);
        aste.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, announcements: aste.map(a => arricchisciAnnuncio(a, utenti)) });
    } catch (errore) {
        res.status(500).json({ error: errore.message });
    }
});

// Ottiene solo le aste create dall'utente attualmente loggato ("Le mie aste")
applicazione.get('/api/announcements/my', richiediAutenticazione, async (req, res) => {
    try {
        const aste = await controllaAsteScadute();
        const utenti = await leggiDati(FILE_UTENTI);
        const mieAste = aste.filter(a => a.userId === req.user.id && a.status !== 'deleted');
        mieAste.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, announcements: mieAste.map(a => arricchisciAnnuncio(a, utenti)) });
    } catch (errore) {
        res.status(500).json({ error: errore.message });
    }
});

// Dettaglio di una singola asta tramite ID
applicazione.get('/api/announcements/:id', async (req, res) => {
    try {
        const aste = await controllaAsteScadute();
        const asta = aste.find(a => a.id === req.params.id && a.status !== 'deleted');
        if (!asta) return res.status(404).json({ error: 'Asta non trovata.' });

        const utenti = await leggiDati(FILE_UTENTI);
        res.json({ success: true, announcement: arricchisciAnnuncio(asta, utenti) });
    } catch (errore) {
        res.status(500).json({ error: errore.message });
    }
});

// Creazione e pubblicazione di una nuova asta con timer e caricamento immagine
applicazione.post('/api/announcements', richiediAutenticazione, gestoreUpload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'L\'immagine dell\'asta è obbligatoria.' });
        }

        const { title, description, price, durationMinutes } = req.body;
        const prezzoIniziale = Number(price);
        const minutiDurata = Math.max(1, parseInt(durationMinutes, 10) || 5); // Default 5 minuti, minimo 1

        if (!title || !description || isNaN(prezzoIniziale) || prezzoIniziale < 0) {
            return res.status(400).json({ error: 'Dati asta non validi.' });
        }

        const aste = await leggiDati(FILE_ANNUNCI);
        const adesso = new Date();
        // Calcolo della data di scadenza esatta: ora attuale + durata in minuti
        const dataScadenza = new Date(adesso.getTime() + minutiDurata * 60 * 1000).toISOString();

        const nuovaAsta = {
            id: generaNuovoId(aste, 'announcement'),
            userId: req.user.id,
            title: title.trim(),
            description: description.trim(),
            startingPrice: prezzoIniziale,
            currentBid: prezzoIniziale, // All'inizio l'offerta minima corrente è il prezzo di partenza
            highestBidderId: null,
            highestBidderUsername: null,
            image: `/uploads/${req.file.filename}`,
            durationMinutes: minutiDurata,
            expiresAt: dataScadenza,
            status: 'active',
            bids: [], // Storico dei rilanci
            createdAt: adesso.toISOString(),
            updatedAt: adesso.toISOString()
        };

        aste.push(nuovaAsta);
        await scriviDati(FILE_ANNUNCI, aste);

        const utenti = await leggiDati(FILE_UTENTI);
        const astaArricchita = arricchisciAnnuncio(nuovaAsta, utenti);

        // Notifica in tempo reale tutti i client connessi via WebSocket
        inviaATutti('NEW_ANNOUNCEMENT', astaArricchita);
        res.status(201).json({ success: true, announcement: astaArricchita });
    } catch (errore) {
        res.status(500).json({ error: errore.message });
    }
});

// Effettua un rilancio (offerta) su un'asta
applicazione.post('/api/announcements/:id/bid', richiediAutenticazione, async (req, res) => {
    try {
        const importoOfferta = Number(req.body.amount);
        if (isNaN(importoOfferta) || importoOfferta <= 0) {
            return res.status(400).json({ error: 'Importo offerta non valido.' });
        }

        const aste = await leggiDati(FILE_ANNUNCI);
        const asta = aste.find(a => a.id === req.params.id && a.status !== 'deleted');
        if (!asta) return res.status(404).json({ error: 'Asta non trovata.' });

        // Regola 1: il proprietario dell'asta non può fare offerte sulla propria merce
        if (asta.userId === req.user.id) {
            return res.status(400).json({ error: 'Non puoi fare offerte sulla tua stessa asta.' });
        }

        // Regola 2: verifica che l'asta non sia già terminata o scaduta
        if (asta.status !== 'active' || new Date(asta.expiresAt).getTime() <= Date.now()) {
            asta.status = 'ended';
            await scriviDati(FILE_ANNUNCI, aste);
            inviaATutti('AUCTION_ENDED', asta);
            return res.status(400).json({ error: 'L\'asta è terminata.' });
        }

        // Regola 3: l'offerta deve essere strettamente maggiore dell'offerta corrente
        if (importoOfferta <= asta.currentBid) {
            return res.status(400).json({
                error: `L'offerta deve essere superiore all'offerta attuale (${asta.currentBid} €).`
            });
        }

        // Aggiorna lo stato dell'asta con la nuova puntata vincente
        const dataRilancio = new Date().toISOString();
        asta.currentBid = importoOfferta;
        asta.highestBidderId = req.user.id;
        asta.highestBidderUsername = req.user.username;
        asta.updatedAt = dataRilancio;

        // Inserisce il rilancio nella cronologia dell'asta
        asta.bids.push({
            id: `bid${asta.bids.length + 1}`,
            userId: req.user.id,
            username: req.user.username,
            amount: importoOfferta,
            createdAt: dataRilancio
        });

        await scriviDati(FILE_ANNUNCI, aste);

        const utenti = await leggiDati(FILE_UTENTI);
        const astaArricchita = arricchisciAnnuncio(asta, utenti);

        // Notifica in tempo reale del rilancio a tutti i browser connessi
        inviaATutti('BID_PLACED', astaArricchita);
        res.json({ success: true, announcement: astaArricchita });
    } catch (errore) {
        res.status(500).json({ error: errore.message });
    }
});

// Eliminazione/Annullamento di un'asta da parte del proprietario
applicazione.delete('/api/announcements/:id', richiediAutenticazione, async (req, res) => {
    try {
        const aste = await leggiDati(FILE_ANNUNCI);
        const asta = aste.find(a => a.id === req.params.id);
        if (!asta) return res.status(404).json({ error: 'Asta non trovata.' });
        if (asta.userId !== req.user.id) return res.status(403).json({ error: 'Non autorizzato.' });

        asta.status = 'deleted';
        await scriviDati(FILE_ANNUNCI, aste);

        // Avvisa i client di rimuovere la card dell'asta
        inviaATutti('ANNOUNCEMENT_REMOVED', { id: asta.id });
        res.json({ success: true, message: 'Asta rimossa.' });
    } catch (errore) {
        res.status(500).json({ error: errore.message });
    }
});

// --- 10. SERVER HTTP E WEBSOCKET NATIVO (ws) ---
const serverHttp = http.createServer(applicazione);
const serverWs = new ServerWebSocket({ server: serverHttp, path: '/ws' });

// Gestione connessioni dei client al canale WebSocket
serverWs.on('connection', (clientWs, richiestaHttp) => {
    const urlRichiesta = new URL(richiestaHttp.url, `http://${richiestaHttp.headers.host || 'localhost'}`);
    clientWs.userId = urlRichiesta.searchParams.get('userId') || 'anon';
    console.log(`[WebSocket] Connesso: ${clientWs.userId}`);

    clientWs.on('close', () => {
        console.log(`[WebSocket] Chiuso: ${clientWs.userId}`);
    });
});

/**
 * Trasmette un messaggio a tutti i client WebSocket attualmente collegati.
 */
function inviaATutti(tipo, dati = {}) {
    const messaggioSerializzato = JSON.stringify({ type: tipo, data: dati });
    serverWs.clients.forEach(client => {
        // readyState === 1 indica che la connessione è aperta e pronta all'invio
        if (client.readyState === 1) {
            client.send(messaggioSerializzato);
        }
    });
}

// Timer di background: controlla ogni 3 secondi se ci sono aste scadute da chiudere
const intervalloControlloScadenze = setInterval(controllaAsteScadute, 3000);

// Avvio del server se eseguito come script principale
if (require.main === module) {
    serverHttp.listen(PORTA, () => {
        console.log(`Piemarket avviato su http://localhost:${PORTA}`);
    });
}

// Esportazioni per i test automatizzati (mantiene compatibilità con nomi inglesi e italiani)
module.exports = {
    app: applicazione,
    server: serverHttp,
    expiryInterval: intervalloControlloScadenze,
    applicazione,
    serverHttp,
    intervalloControlloScadenze
};
