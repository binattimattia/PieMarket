// ============================================================================
// PIEMARKET — Server Web Unificato (Node.js, Express, WebSocket, Persistenza JSON)
// Progetto didattico TPSIT: compravendita regionale esclusiva per il Piemonte
// ============================================================================

// NODE.JS: Importazione dei moduli core tramite require() (CommonJS)
const http = require('http');
const path = require('path');
const fs = require('fs');

// EXPRESS & MODULI ESTERNI
const express = require('express');
const multer = require('multer');
const { Server } = require('ws'); // WEBSOCKET: destructuring della classe Server

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------------------------------------------------------
// 1. GESTIONE PERSISTENZA FILE JSON (Modulo core fs)
// ----------------------------------------------------------------------------
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = 'users.json';
const ANNOUNCEMENTS_FILE = 'announcements.json';
const OFFERS_FILE = 'offers.json';

// Coda di scrittura per garantire operazioni atomiche e sequenziali
const writeQueues = {};

/**
 * Assicura che la cartella data e il file JSON esistano inizializzati con []
 */
function ensureFile(filename) {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf-8');
    }
    return filePath;
}

/**
 * Legge e converte in array/oggetto il contenuto di un file JSON
 * CONCETTO DIDATTICO: fs.promises per I/O asincrono e JSON.parse()
 */
async function readData(filename) {
    const filePath = ensureFile(filename);
    try {
        const raw = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error(`Errore lettura ${filename}:`, err.message);
        return [];
    }
}

/**
 * Scrive i dati su file JSON in modo atomico tramite file temporaneo
 * CONCETTO DIDATTICO: JSON.stringify() per serializzazione e fs.promises.rename()
 */
function writeData(filename, data) {
    const filePath = ensureFile(filename);
    const tempPath = `${filePath}.tmp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    if (!writeQueues[filename]) {
        writeQueues[filename] = Promise.resolve();
    }

    const op = writeQueues[filename].then(async () => {
        try {
            const jsonStr = JSON.stringify(data, null, 2);
            await fs.promises.writeFile(tempPath, jsonStr, 'utf-8');
            await fs.promises.rename(tempPath, filePath);
            return true;
        } catch (err) {
            console.error(`Errore scrittura ${filename}:`, err.message);
            if (fs.existsSync(tempPath)) {
                try { await fs.promises.unlink(tempPath); } catch (_) {}
            }
            throw err;
        }
    });

    writeQueues[filename] = op.catch(() => {});
    return op;
}

// ----------------------------------------------------------------------------
// 2. HELPER GENERAZIONE ID PROGRESSIVI (user1, announcement1, offer1)
// ----------------------------------------------------------------------------
function getNextId(list, prefix) {
    let maxNum = 0;
    const regex = new RegExp(`^${prefix}(\\d+)$`);
    list.forEach((item) => {
        if (item && item.id) {
            const match = item.id.match(regex);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
            }
        }
    });
    return `${prefix}${maxNum + 1}`;
}

// ----------------------------------------------------------------------------
// 3. CONFIGURAZIONE UPLOAD IMMAGINI (Multer)
// ----------------------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `img_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato immagine non valido. Ammessi solo JPG, PNG e WEBP.'), false);
        }
    }
});

// ----------------------------------------------------------------------------
// 4. MIDDLEWARE EXPRESS E AUTENTICAZIONE (Senza cookie)
// ----------------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Middleware: controlla la presenza dell'ID utente nell'header x-user-id
 */
async function requireAuth(req, res, next) {
    const userId = req.headers['x-user-id'] || req.query.userId || (req.body && req.body.userId);
    if (!userId) {
        return res.status(401).json({ error: 'Accesso negato. ID utente non fornito.' });
    }

    const users = await readData(USERS_FILE);
    const user = users.find((u) => u.id === userId);
    if (!user) {
        return res.status(401).json({ error: 'Accesso negato. Utente non trovato.' });
    }

    req.user = user;
    next();
}

// ----------------------------------------------------------------------------
// 5. ROTTE HTML PER LE VISTE
// ----------------------------------------------------------------------------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'home.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));
app.get('/offers', (req, res) => res.sendFile(path.join(__dirname, 'views', 'offers.html')));
app.get('/my-announcements', (req, res) => res.sendFile(path.join(__dirname, 'views', 'my-announcements.html')));

// ----------------------------------------------------------------------------
// 6. ROTTE API — AUTENTICAZIONE
// ----------------------------------------------------------------------------
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, confirmPassword, region } = req.body;
        if (!username || !email || !password || !confirmPassword || !region) {
            return res.status(400).json({ error: 'Tutti i campi sono obbligatori.' });
        }

        const trimmedRegion = String(region).trim();
        // REGOLA FONDAMENTALE: Solo residenti in Piemonte
        if (trimmedRegion !== 'Piemonte') {
            return res.status(400).json({
                error: 'Piemarket è riservato ai residenti in Piemonte. Al momento non è possibile registrarsi da un\'altra regione.'
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Le password non coincidono.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'La password deve avere almeno 6 caratteri.' });
        }

        const users = await readData(USERS_FILE);
        const emailExists = users.some(u => u.email.toLowerCase() === email.trim().toLowerCase());
        if (emailExists) {
            return res.status(400).json({ error: 'Indirizzo email già registrato.' });
        }

        const newId = getNextId(users, 'user');
        const newUser = {
            id: newId,
            username: username.trim(),
            email: email.trim().toLowerCase(),
            password: password, // Salvataggio diretto senza hashing
            region: trimmedRegion,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        await writeData(USERS_FILE, users);

        const { password: _, ...safeUser } = newUser;
        res.status(201).json({ success: true, user: safeUser });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email e password sono obbligatorie.' });
        }

        const users = await readData(USERS_FILE);
        const user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Credenziali non valide. Verifica email e password.' });
        }

        const { password: _, ...safeUser } = user;
        res.json({ success: true, user: safeUser });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logout', (req, res) => {
    res.json({ success: true, message: 'Disconnesso.' });
});

app.get('/api/me', requireAuth, (req, res) => {
    const { password: _, ...safeUser } = req.user;
    res.json({ success: true, user: safeUser });
});

// Helper per arricchire l'annuncio con l'username del venditore
async function enrichAnnouncement(item, users) {
    const seller = users.find(u => u.id === item.userId);
    return {
        ...item,
        sellerUsername: seller ? seller.username : 'Utente'
    };
}

// ----------------------------------------------------------------------------
// 7. ROTTE API — ANNUNCI
// ----------------------------------------------------------------------------
// GET: Annunci attivi (gli annunci venduti o eliminati NON compaiono nella home page)
app.get('/api/announcements', async (req, res) => {
    try {
        const list = await readData(ANNOUNCEMENTS_FILE);
        const users = await readData(USERS_FILE);
        const active = list.filter(a => a.status === 'active');
        active.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const enriched = await Promise.all(active.map(a => enrichAnnouncement(a, users)));
        res.json({ success: true, announcements: enriched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: I miei annunci
app.get('/api/announcements/my', requireAuth, async (req, res) => {
    try {
        const list = await readData(ANNOUNCEMENTS_FILE);
        const users = await readData(USERS_FILE);
        const mine = list.filter(a => a.userId === req.user.id && a.status !== 'deleted');
        mine.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const enriched = await Promise.all(mine.map(a => enrichAnnouncement(a, users)));
        res.json({ success: true, announcements: enriched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Singolo annuncio
app.get('/api/announcements/:id', async (req, res) => {
    try {
        const list = await readData(ANNOUNCEMENTS_FILE);
        const users = await readData(USERS_FILE);
        const item = list.find(a => a.id === req.params.id && a.status !== 'deleted');
        if (!item) return res.status(404).json({ error: 'Annuncio non trovato.' });

        res.json({ success: true, announcement: await enrichAnnouncement(item, users) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Pubblica annuncio
app.post('/api/announcements', requireAuth, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'L\'immagine dell\'annuncio è obbligatoria.' });
        }
        const { title, description, price } = req.body;
        const numPrice = Number(price);

        if (!title || !description || isNaN(numPrice) || numPrice < 0) {
            if (req.file) try { fs.unlinkSync(req.file.path); } catch (_) {}
            return res.status(400).json({ error: 'Dati annuncio non validi.' });
        }

        const list = await readData(ANNOUNCEMENTS_FILE);
        const newId = getNextId(list, 'announcement');
        const now = new Date().toISOString();

        const newAnnouncement = {
            id: newId,
            userId: req.user.id,
            title: title.trim(),
            description: description.trim(),
            price: numPrice,
            image: `/uploads/${req.file.filename}`,
            status: 'active',
            createdAt: now,
            updatedAt: now
        };

        list.push(newAnnouncement);
        await writeData(ANNOUNCEMENTS_FILE, list);

        const users = await readData(USERS_FILE);
        const enriched = await enrichAnnouncement(newAnnouncement, users);

        // WEBSOCKET BROADCAST a tutti gli utenti connessi
        broadcast('NEW_ANNOUNCEMENT', enriched);

        res.status(201).json({ success: true, announcement: enriched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT: Modifica annuncio proprio
app.put('/api/announcements/:id', requireAuth, upload.single('image'), async (req, res) => {
    try {
        const list = await readData(ANNOUNCEMENTS_FILE);
        const item = list.find(a => a.id === req.params.id);
        if (!item || item.status === 'deleted') return res.status(404).json({ error: 'Annuncio non trovato.' });

        if (item.userId !== req.user.id) {
            return res.status(400).json({ error: 'Non hai il permesso di modificare questo annuncio.' });
        }

        const { title, description, price } = req.body;
        if (title) item.title = title.trim();
        if (description) item.description = description.trim();
        if (price !== undefined) {
            const num = Number(price);
            if (!isNaN(num) && num >= 0) item.price = num;
        }
        if (req.file) {
            item.image = `/uploads/${req.file.filename}`;
        }
        item.updatedAt = new Date().toISOString();
        await writeData(ANNOUNCEMENTS_FILE, list);

        const users = await readData(USERS_FILE);
        const enriched = await enrichAnnouncement(item, users);
        broadcast('ANNOUNCEMENT_UPDATED', enriched);

        res.json({ success: true, announcement: enriched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Elimina annuncio proprio
app.delete('/api/announcements/:id', requireAuth, async (req, res) => {
    try {
        const list = await readData(ANNOUNCEMENTS_FILE);
        const item = list.find(a => a.id === req.params.id);
        if (!item) return res.status(404).json({ error: 'Annuncio non trovato.' });

        if (item.userId !== req.user.id) {
            return res.status(400).json({ error: 'Non hai il permesso di eliminare questo annuncio.' });
        }

        item.status = 'deleted';
        item.updatedAt = new Date().toISOString();
        await writeData(ANNOUNCEMENTS_FILE, list);

        broadcast('ANNOUNCEMENT_REMOVED', { id: item.id });
        res.json({ success: true, message: 'Annuncio eliminato.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper per arricchire l'offerta con i dettagli dell'annuncio e utenti
async function enrichOffer(offer, announcements, users) {
    const ann = announcements.find(a => a.id === offer.announcementId);
    const buyer = users.find(u => u.id === offer.buyerId);
    const seller = users.find(u => u.id === offer.sellerId);
    const lastProp = offer.history && offer.history.length > 0 ? offer.history[offer.history.length - 1] : null;

    return {
        ...offer,
        announcementTitle: ann ? ann.title : 'Annuncio rimosso',
        announcementImage: ann ? ann.image : '',
        announcementOriginalPrice: ann ? ann.price : 0,
        announcementStatus: ann ? ann.status : 'deleted',
        buyerUsername: buyer ? buyer.username : 'Acquirente',
        sellerUsername: seller ? seller.username : 'Venditore',
        currentAmount: lastProp ? lastProp.amount : 0,
        lastMessage: lastProp ? lastProp.message : ''
    };
}

// ----------------------------------------------------------------------------
// 8. ROTTE API — OFFERTE E NEGOZIAZIONE
// ----------------------------------------------------------------------------
// GET: Offerte ricevute (come venditore)
app.get('/api/offers/received', requireAuth, async (req, res) => {
    try {
        const offers = await readData(OFFERS_FILE);
        const announcements = await readData(ANNOUNCEMENTS_FILE);
        const users = await readData(USERS_FILE);

        const received = offers.filter(o => o.sellerId === req.user.id);
        received.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        const enriched = await Promise.all(received.map(o => enrichOffer(o, announcements, users)));
        res.json({ success: true, offers: enriched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Offerte inviate (come compratore)
app.get('/api/offers/sent', requireAuth, async (req, res) => {
    try {
        const offers = await readData(OFFERS_FILE);
        const announcements = await readData(ANNOUNCEMENTS_FILE);
        const users = await readData(USERS_FILE);

        const sent = offers.filter(o => o.buyerId === req.user.id);
        sent.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        const enriched = await Promise.all(sent.map(o => enrichOffer(o, announcements, users)));
        res.json({ success: true, offers: enriched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Singola offerta
app.get('/api/offers/:id', requireAuth, async (req, res) => {
    try {
        const offers = await readData(OFFERS_FILE);
        const offer = offers.find(o => o.id === req.params.id);
        if (!offer) return res.status(404).json({ error: 'Trattativa non trovata.' });

        if (offer.sellerId !== req.user.id && offer.buyerId !== req.user.id) {
            return res.status(403).json({ error: 'Non sei autorizzato a visualizzare questa trattativa.' });
        }

        const announcements = await readData(ANNOUNCEMENTS_FILE);
        const users = await readData(USERS_FILE);
        res.json({ success: true, offer: await enrichOffer(offer, announcements, users) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Nuova offerta o richiesta di acquisto
app.post('/api/offers', requireAuth, async (req, res) => {
    try {
        const { announcementId, amount, message } = req.body;
        const numAmount = Number(amount);
        if (!announcementId || isNaN(numAmount) || numAmount < 0) {
            return res.status(400).json({ error: 'Dati offerta non validi.' });
        }

        const announcements = await readData(ANNOUNCEMENTS_FILE);
        const ann = announcements.find(a => a.id === announcementId);
        if (!ann || ann.status !== 'active') {
            return res.status(400).json({ error: 'L\'annuncio è già stato venduto o non accetta offerte.' });
        }

        // REGOLA: Non si possono fare offerte sui propri annunci
        if (ann.userId === req.user.id) {
            return res.status(400).json({ error: 'Non puoi fare un\'offerta su un tuo annuncio.' });
        }

        const offers = await readData(OFFERS_FILE);
        // Controllo trattativa attiva già esistente tra le due parti
        const existing = offers.find(o => o.announcementId === announcementId && o.buyerId === req.user.id && (o.status === 'pending_seller' || o.status === 'pending_buyer'));
        if (existing) {
            return res.status(400).json({ error: 'Hai già una trattativa attiva per questo annuncio.' });
        }

        const newId = getNextId(offers, 'offer');
        const now = new Date().toISOString();

        const newOffer = {
            id: newId,
            announcementId,
            buyerId: req.user.id,
            sellerId: ann.userId,
            status: 'pending_seller',
            history: [{
                id: 'prop1',
                fromUserId: req.user.id,
                toUserId: ann.userId,
                amount: numAmount,
                message: String(message || '').trim(),
                createdAt: now
            }],
            createdAt: now,
            updatedAt: now
        };

        offers.push(newOffer);
        await writeData(OFFERS_FILE, offers);

        const users = await readData(USERS_FILE);
        const enriched = await enrichOffer(newOffer, announcements, users);

        // Notifica WebSocket alle due parti
        sendToUsers([ann.userId, req.user.id], 'NEW_OFFER', enriched);

        res.status(201).json({ success: true, offer: enriched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Controfferta
app.post('/api/offers/:id/counter', requireAuth, async (req, res) => {
    try {
        const { amount, message } = req.body;
        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount < 0) {
            return res.status(400).json({ error: 'Importo non valido.' });
        }

        const offers = await readData(OFFERS_FILE);
        const offer = offers.find(o => o.id === req.params.id);
        if (!offer || (offer.status !== 'pending_seller' && offer.status !== 'pending_buyer')) {
            return res.status(400).json({ error: 'Trattativa non attiva o conclusa.' });
        }

        const announcements = await readData(ANNOUNCEMENTS_FILE);
        const ann = announcements.find(a => a.id === offer.announcementId);
        if (!ann || ann.status !== 'active') {
            return res.status(400).json({ error: 'L\'annuncio è già stato venduto a un altro acquirente.' });
        }

        const isSeller = offer.sellerId === req.user.id;
        const isBuyer = offer.buyerId === req.user.id;
        if (!isSeller && !isBuyer) return res.status(403).json({ error: 'Non autorizzato.' });

        if (offer.status === 'pending_seller' && !isSeller) {
            return res.status(400).json({ error: 'In attesa del venditore.' });
        }
        if (offer.status === 'pending_buyer' && !isBuyer) {
            return res.status(400).json({ error: 'In attesa dell\'acquirente.' });
        }

        const toUserId = isSeller ? offer.buyerId : offer.sellerId;
        const nextStatus = isSeller ? 'pending_buyer' : 'pending_seller';
        const now = new Date().toISOString();

        offer.history.push({
            id: `prop${offer.history.length + 1}`,
            fromUserId: req.user.id,
            toUserId,
            amount: numAmount,
            message: String(message || '').trim(),
            createdAt: now
        });
        offer.status = nextStatus;
        offer.updatedAt = now;

        await writeData(OFFERS_FILE, offers);

        const users = await readData(USERS_FILE);
        const enriched = await enrichOffer(offer, announcements, users);

        sendToUsers([offer.buyerId, offer.sellerId], 'COUNTER_OFFER', enriched);
        res.json({ success: true, offer: enriched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Accetta offerta (Regola: max 1 offerta accettata, altre annullate, annuncio 'sold')
app.post('/api/offers/:id/accept', requireAuth, async (req, res) => {
    try {
        const offers = await readData(OFFERS_FILE);
        const offer = offers.find(o => o.id === req.params.id);
        if (!offer || (offer.status !== 'pending_seller' && offer.status !== 'pending_buyer')) {
            return res.status(400).json({ error: 'Questa trattativa non è più in corso.' });
        }

        const announcements = await readData(ANNOUNCEMENTS_FILE);
        const ann = announcements.find(a => a.id === offer.announcementId);
        if (!ann || ann.status !== 'active') {
            return res.status(400).json({ error: 'Questo annuncio è già stato venduto o non è più disponibile.' });
        }

        const isSeller = offer.sellerId === req.user.id;
        const isBuyer = offer.buyerId === req.user.id;
        if (!isSeller && !isBuyer) return res.status(403).json({ error: 'Non autorizzato.' });

        if (offer.status === 'pending_seller' && !isSeller) {
            return res.status(400).json({ error: 'Solo il venditore può accettare.' });
        }
        if (offer.status === 'pending_buyer' && !isBuyer) {
            return res.status(400).json({ error: 'Solo l\'acquirente può accettare.' });
        }

        const now = new Date().toISOString();
        offer.status = 'accepted';
        offer.updatedAt = now;

        // L'annuncio passa a 'sold' (scompare dalla home page)
        ann.status = 'sold';
        ann.updatedAt = now;
        await writeData(ANNOUNCEMENTS_FILE, announcements);

        // Tutte le altre offerte per questo annuncio vengono automaticamente annullate
        const otherCancelled = [];
        offers.forEach(o => {
            if (o.announcementId === offer.announcementId && o.id !== offer.id) {
                if (o.status === 'pending_seller' || o.status === 'pending_buyer') {
                    o.status = 'cancelled';
                    o.updatedAt = now;
                    otherCancelled.push(o);
                }
            }
        });
        await writeData(OFFERS_FILE, offers);

        const users = await readData(USERS_FILE);
        const enriched = await enrichOffer(offer, announcements, users);

        // Notifica WebSocket a venditore e acquirente dell'offerta accettata
        sendToUsers([offer.buyerId, offer.sellerId], 'OFFER_ACCEPTED', enriched);

        // Notifica agli altri acquirenti che la loro offerta è stata annullata
        for (const c of otherCancelled) {
            const enrichedC = await enrichOffer(c, announcements, users);
            sendToUsers([c.buyerId], 'OFFER_CANCELLED', enrichedC);
        }

        // Notifica broadcast che l'annuncio non è più attivo (rimozione dalla bacheca)
        broadcast('ANNOUNCEMENT_UPDATED', await enrichAnnouncement(ann, users));

        res.json({ success: true, offer: enriched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Rifiuta offerta
app.post('/api/offers/:id/reject', requireAuth, async (req, res) => {
    try {
        const offers = await readData(OFFERS_FILE);
        const offer = offers.find(o => o.id === req.params.id);
        if (!offer || (offer.status !== 'pending_seller' && offer.status !== 'pending_buyer')) {
            return res.status(400).json({ error: 'Trattativa non attiva.' });
        }

        const isSeller = offer.sellerId === req.user.id;
        const isBuyer = offer.buyerId === req.user.id;
        if (!isSeller && !isBuyer) return res.status(403).json({ error: 'Non autorizzato.' });

        offer.status = 'rejected';
        offer.updatedAt = new Date().toISOString();
        await writeData(OFFERS_FILE, offers);

        const announcements = await readData(ANNOUNCEMENTS_FILE);
        const users = await readData(USERS_FILE);
        const enriched = await enrichOffer(offer, announcements, users);

        sendToUsers([offer.buyerId, offer.sellerId], 'OFFER_REJECTED', enriched);
        res.json({ success: true, offer: enriched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// 9. SERVER HTTP E WEBSOCKET INTEGRATO (Modulo ws nativo)
// ----------------------------------------------------------------------------
const server = http.createServer(app);

// WEBSOCKET: Creazione del server ws collegato alla stessa porta del server HTTP
const wsServer = new Server({ server, path: '/ws' });
let connectionCounter = 0;

wsServer.on('connection', (ws, req) => {
    connectionCounter++;
    ws.id = `conn_${connectionCounter}`;

    // Estrazione userId dalla query string: ws://localhost:3000/ws?userId=user1
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    ws.userId = url.searchParams.get('userId') || `anon_${connectionCounter}`;

    console.log(`[WebSocket] Connesso: ${ws.userId} (${ws.id})`);

    // Gestione messaggi client
    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'PING_APP') {
                if (ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: 'PONG_APP', data: { time: new Date().toISOString() } }));
                }
            }
        } catch (_) {}
    });

    ws.on('close', () => {
        console.log(`[WebSocket] Chiuso per: ${ws.userId} (${ws.id})`);
    });
});

/**
 * Broadcast WebSocket a TUTTI i client connessi
 * CONCETTO DIDATTICO: wsServer.clients.forEach()
 */
function broadcast(type, data = {}) {
    const payload = JSON.stringify({ type, data });
    wsServer.clients.forEach(client => {
        if (client.readyState === 1 /* OPEN */) {
            client.send(payload);
        }
    });
}

/**
 * Invio mirato WebSocket solo agli utenti specificati
 */
function sendToUsers(userIds, type, data = {}) {
    if (!Array.isArray(userIds)) return;
    const targetSet = new Set(userIds);
    const payload = JSON.stringify({ type, data });

    wsServer.clients.forEach(client => {
        if (targetSet.has(client.userId) && client.readyState === 1 /* OPEN */) {
            client.send(payload);
        }
    });
}

// Avvio server se eseguito come script principale
if (require.main === module) {
    server.listen(PORT, () => {
        console.log('====================================================');
        console.log(`Piemarket avviato su http://localhost:${PORT}`);
        console.log(`WebSocket attivo su ws://localhost:${PORT}/ws`);
        console.log('====================================================');
    });
}

module.exports = { app, server };
