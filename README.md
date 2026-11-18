# PIEMARKET — Piattaforma Web Regionale per il Piemonte (Versione Compatta e Didattica)

Progetto didattico per la materia **TPSIT**, sviluppato secondo una struttura **compatta, lineare e semplice da comprendere**, mantenendo al contempo ordine e pulizia del codice.

---

## 1. Architettura Compatta del Progetto

Il codice è stato unificato per evitare dispersioni in molteplici sottocartelle:
- **Tutto il Backend in un unico file**: [server.js](file:///home/mattia/Documenti/TPSIT/server.js) contiene la configurazione di Express, il modulo core `http`, il server WebSocket (`ws`), la lettura/scrittura atomica dei file JSON e tutte le rotte API;
- **Tutto il Frontend JavaScript in un unico file**: [public/js/client.js](file:///home/mattia/Documenti/TPSIT/public/js/client.js) gestisce lo stato utente, la connessione WebSocket, le chiamate HTTP e la manipolazione del DOM di tutte le pagine;
- **Persistenza su 3 file JSON essenziali**: memorizzati in `data/` (`users.json`, `announcements.json`, `offers.json`).

```text
piemarket/
│
├── server.js                      # Tutto il backend (Express, rotte API, I/O JSON, ws)
├── package.json                   # Dipendenze essenziali: express, ws, multer
├── test.js                        # Test di verifica automatico
├── README.md                      # Documentazione del progetto
├── FLUSSO_FUNZIONALITA_PIEMARKET.md # Spiegazione passo per passo
│
├── data/                          # Cartella dati JSON
│   ├── users.json                 # Utenti registrati (ID user1, user2...)
│   ├── announcements.json         # Annunci pubblicati (ID announcement1, announcement2...)
│   └── offers.json                # Trattative (ID offer1, offer2...)
│
├── public/                        # Risorse statiche
│   ├── css/style.css              # Foglio di stile personalizzato
│   ├── js/client.js               # Tutto il codice JavaScript client unificato
│   ├── images/placeholder.png     # Immagine di fallback
│   └── uploads/                   # Immagini caricate per gli annunci
│
└── views/                         # Pagine HTML responsive
    ├── home.html                  # Bacheca annunci attivi
    ├── login.html                 # Accesso
    ├── register.html              # Registrazione (esclusiva per il Piemonte)
    ├── offers.html                # Centro trattative (Ricevute / Inviate)
    └── my-announcements.html     # Gestione dei propri annunci
```

---

## 2. Punti Chiave e Regole Applicative

1. **Registrazione Riservata al Piemonte**: sia nel browser che sul server è verificato che la regione sia esclusivamente `"Piemonte"`.
2. **ID Progressivi Semplici**: `user1`, `user2`, `announcement1`, `offer1`...
3. **Autenticazione senza Cookie**: i dati dell'utente loggato risiedono in `localStorage` nel browser e vengono comunicati al server tramite l'header HTTP `x-user-id` e la query string WebSocket (`/ws?userId=user1`).
4. **Regola di Esclusività delle Offerte**: il venditore può accettare **una sola offerta** per annuncio. All'accettazione, l'annuncio passa a `sold` e tutte le altre offerte aperte per quell'annuncio vengono automaticamente annullate (`cancelled`).
5. **Home Page Pulita**: gli annunci venduti scompaiono istantaneamente dalla bacheca principale.
6. **Nessun Popup Invasivo**: le notifiche a comparsa sono state eliminate, mantenendo conferme chiare e dialog standard.
7. **Footer Minimale**: in tutte le pagine compare esclusivamente `Piemarket 2026`.

---

## 3. Installazione e Avvio

1. Installazione dipendenze minime:
   ```bash
   npm install
   ```

2. Avvio del server:
   ```bash
   npm start
   ```
   Raggiungibile all'indirizzo: `http://localhost:3000`.

3. Verifica automatizzata:
   ```bash
   npm test
   ```
