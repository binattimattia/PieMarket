# PIEMARKET — Flusso e Funzionamento Passo per Passo (Versione Compatta Unificata)

> **Architettura compatta:**  
> Il codice è ora racchiuso in soli due file principali:
> - **[server.js](file:///home/mattia/Documenti/TPSIT/server.js)**: Tutto il backend (Express, I/O JSON con `fs`, WebSocket con `ws` e rotte API).
> - **[public/js/client.js](file:///home/mattia/Documenti/TPSIT/public/js/client.js)**: Tutto il frontend JavaScript (gestione `localStorage`, client WebSocket e DOM di tutte le pagine).

---

## 1. Mappa dei Dati (`data/`)

- `users.json`: Elenco utenti con credenziali e regione (es. `user1`, `user2`).
- `announcements.json`: Annunci pubblicati con stato `active`, `sold` o `deleted` (es. `announcement1`).
- `offers.json`: Trattative tra utenti con array `history` contenente lo storico cronologico delle proposte (es. `offer1`).

---

## 2. Flusso delle Azioni

### 1. Registrazione e Vincolo Piemonte
- L'utente inserisce i dati su `/register`.
- Se la regione non è *Piemonte*, il modulo viene bloccato sia nel browser che dal server con risposta 400.
- Se valida, il server assegna l'ID progressivo (`user1`, `user2`...) e salva l'utente in `data/users.json`.
- Il client salva l'utente in `localStorage` e atterra su `/`.

### 2. Login e Logout
- Su `/login`, il server confronta direttamente email e password.
- Se corrette, restituisce l'utente che viene salvato in `localStorage`.
- Cliccando su "Logout", `localStorage` viene svuotato e l'utente reindirizzato a `/login`.

### 3. Connessione WebSocket
- Lo script `client.js` apre il socket su `ws://localhost:3000/ws?userId=user1`.
- Il server unificato in `server.js` legge `userId` dai parametri dell'URL e associa il socket.

### 4. Bacheca Annunci (Home)
- Chiama `GET /api/announcements`: il server restituisce **solo gli annunci con stato `active`**. Gli oggetti venduti non compaiono.
- La pubblicazione di un nuovo annuncio invia una notifica broadcast via WebSocket a tutti i client connessi, inserendo la card in cima alla pagina.

### 5. Regola Logica dell'Accettazione Unica
- Un venditore può ricevere più offerte per lo stesso oggetto da compratori diversi.
- Nel momento in cui il venditore clicca **Accetta**:
  1. L'offerta accettata passa allo stato `accepted`;
  2. L'annuncio passa a `sold` e **scompare istantaneamente dalla Home page**;
  3. Tutte le altre offerte concorrenti per quello stesso annuncio passano automaticamente a `cancelled` (*Annullata: oggetto venduto*);
  4. Agli altri acquirenti viene notificato via WebSocket che la loro offerta è stata annullata perché l'oggetto è stato venduto;
  5. Il server rifiuta qualsiasi ulteriore tentativo di accettare offerte o di negoziare su quell'oggetto.
