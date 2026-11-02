# FuxiaNet 1 · Redazione

La redazione di Fuxia Magazine, Rete NeTVision e 1Channel.

La redazione online delle due testate: articoli con stati (Bozza, In revisione, Da correggere, Pronto, Pubblicato), note e correzioni a margine, foto e gallerie, scadenze e assegnazioni, Riepilogo, Menabò ed Edizione per ciascuna testata. Si installa sul telefono come un'app.

## Com'è fatta

- **Sito statico** (HTML, CSS, JavaScript, nessuna compilazione) pubblicato su **Netlify**.
- **Supabase** conserva articoli, note, foto e gestisce gli accessi con email e password.
- I permessi veri stanno nel database (`supabase/schema.sql`): anche chi manomettesse la pagina non potrebbe pubblicare o cambiare ruoli senza essere direttore.

| File | A cosa serve |
|---|---|
| `index.html` | La pagina dell'app |
| `app.js` | Tutta la logica |
| `agenda.js` | Agenda (appuntamenti, calendario, file .ics) e pagina Oggi |
| `vocali.js` | Vocali WhatsApp delle interviste e trascrizioni |
| `supabase/functions/trascrivi/` | Funzione che trascrive i vocali con OpenAI |
| `style.css` | Aspetto e colori (fucsia per Fuxia, blu e oro per RNV, rosso-verde-oro per 1Channel) |
| `config.js` | Indirizzo e chiave pubblica di Supabase |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installazione sul telefono |
| `img/` | Loghi e banner delle testate |
| `supabase/schema.sql` | Tabelle, ruoli e regole di accesso |

## Messa in funzione (una volta sola)

1. **Supabase → SQL Editor → New query**: incolla tutto `supabase/schema.sql` e premi **Run**. Si può rieseguire senza perdere dati.
2. **Supabase → Authentication → URL Configuration**: in *Site URL* metti l'indirizzo Netlify dell'app (es. `https://redazione-fuxia.netlify.app`) e aggiungilo anche in *Redirect URLs*.
3. **Supabase → Authentication → Sign In / Providers → Email**: consigliato spegnere *Confirm email*. L'accesso lo dà comunque il direttore, e il servizio email gratuito di Supabase manda poche email l'ora.
4. Copia in `config.js` il *Project URL* e la chiave *anon public* (Project Settings → API). **Mai** la chiave *service_role/secret*.
5. **Netlify → Add new site → Import from Git → GitHub** → scegli questo archivio. Lascia vuoto il comando di build, cartella di pubblicazione `.`.
6. La **prima persona che si iscrive diventa direttore**. Poi, dalla scheda **Squadra**, approva gli altri e sceglie i ruoli.

## Ruoli (per testata, dal 02/11/2026)

- Ognuno ha un ruolo **per ciascuna testata** (tabella `ruoli_testata`): nessuno, lettore, redattore o direttore. Tutti gli approvati leggono tutte le testate.
- **Lettore**: legge e basta. **Redattore**: in quella testata scrive, corregge, lascia note, carica foto e vocali. **Direttore**: in più pubblica e ritira e gestisce i ruoli di quella testata.
- **Amministratore** (`profiles.role = 'direttore'`): tutto su tutte le testate; nomina altri amministratori e sospende gli accessi. Deve sempre restarne almeno uno.
- `profiles.role`: `in_attesa` (non approvato), `lettore` (approvato), `direttore` (amministratore). Un direttore di testata può approvare chi è in attesa.
- Funzioni SQL: `can_write(testata)`, `is_director_of(testata)`, `is_admin()`; nell'app `canWriteT()`, `isDirT()`, `writableT()`.

## Installare sul telefono

- **Android (Chrome)**: apri il link, menu ⋮ → *Installa app* (o dal profilo nell'app, pulsante *Installa l'app*).
- **iPhone (Safari)**: apri il link, pulsante Condividi → *Aggiungi alla schermata Home*.

## Icona

L'icona attuale è "FuxiaNet 1" (Fuxia bianco, Net oro, 1 rosso in un riquadro bianco) sui tre colori delle testate, con linea oro e scritta REDAZIONE (icons/fuxianet1/riga.png). Il nome sotto l'icona è "FuxiaNet 1" (`short_name` nel manifest). Le alternative sono in `icons/opt_fuxia.png` e `icons/opt_rnv.png`: per cambiarla vanno rigenerati `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`, `favicon-32.png` dall'opzione scelta.

## Note per chi modifica il codice (anche Claude)

- Nessuna dipendenza da installare; `supabase-js` 2.45.4 arriva da jsDelivr.
- `app.js` disegna l'interfaccia con la funzione `h()`; ogni vista è una funzione `renderX()`. Lo stato è nell'oggetto `S`.
- Nel codice gli articoli usano nomi camelCase (`coverId`), nel database snake_case (`cover_id`): la conversione è in `artFromRow` / `artToRow` (mappa `A2R`).
- Aggiornamenti in tempo reale: canale Supabase su tutte le tabelle, che ricarica la tabella cambiata.
- Blocco di modifica: funzioni SQL `acquire_lock` / `release_lock` (45 secondi, rinnovato ogni 25).
- Se aggiungi un campo agli articoli: colonna in `schema.sql` (con `add column if not exists`), voce in `A2R` e in `artFromRow`.
- Dopo modifiche importanti a `app.js` o `style.css`, aumenta il numero in `CACHE` dentro `sw.js` così i telefoni scaricano la versione nuova.

## Agenda e pagina Oggi

- Tabella `appuntamenti` (vedi fondo di `supabase/schema.sql`): tipo, data e ora (o senza orario), promemoria in minuti, contatto e articolo collegati, assegnato, visibilità (`tutti`, `direzione`, `privato`), stato, ripetizione (`giorno`, `settimana`, `mese`) con data di fine, `done_dates` per segnare fatta una singola volta di un appuntamento ricorrente.
- Visibilità: `privato` lo vedono solo chi l'ha creato e chi è assegnato; `direzione` i direttori più creatore e assegnato. Solo i direttori possono creare appuntamenti `direzione`.
- Le ripetizioni si calcolano nel browser (`occurrences()` in `agenda.js`). Per gli impegni senza orario il promemoria si conta dalle 9:00 del giorno.
- "Aggiungi al calendario del telefono" scarica un file .ics con allarme: rete di sicurezza in attesa delle notifiche push.
- Le consegne degli articoli (campo `deadline`) compaiono da sole nelle viste dell'Agenda come tipo "Consegna articolo": sono calcolate al volo da `articleDeadlines()` in `agenda.js`, non salvate in `appuntamenti`. Toccandole si apre l'articolo.
- Pagina iniziale: `#oggi`.

## Vocali e trascrizioni

- Pagina **Vocali** (`#vocali`) e pannello "Vocali dell'intervista" in ogni articolo. Tabella `vocali` e contenitore **privato** `audio` (limite 25 MB): i file si aprono con link firmati validi un'ora.
- Dopo il caricamento parte da sola la trascrizione: la funzione Supabase `trascrivi` scarica il file con i permessi di chi la chiama e lo manda a OpenAI (`gpt-4o-transcribe`, ripiego `whisper-1`). Segreto obbligatorio `OPENAI_API_KEY`; facoltativo `OPENAI_TRANSCRIBE_MODEL`.
- Le estensioni `.opus` di WhatsApp vengono salvate come `.ogg`, accettato da OpenAI. Se un telefono non riesce a riprodurre il formato, il lettore lo dice e resta la possibilità di scaricarlo.
- Android: `share_target` nel manifest; `sw.js` raccoglie i file condivisi nella cache `condivisi` e l'app li carica all'apertura (`takeShared()`). iPhone: WhatsApp → Condividi → Salva su File, poi "Carica vocali".

## Menabò

Tolto dal menu su richiesta della redazione (21/10/2026). Il codice (`renderMenabo`) e la tabella `menabo` restano: per ripristinarlo basta rimettere la voce nel menu, in `parseHash` e togliere i `return` iniziali di `where()` e `mbOrder()`.

## Testate

Tre testate: `fuxia` (Fuxia Magazine), `rnv` (Rete NeTVision), `ch1` (1Channel, aggiunta il 23/10/2026). Per aggiungerne un'altra: voce in `TESTATE` e `TK` in `app.js`, pulsanti testata (`tsw`, `tseg`, selettori in Appunti e Agenda), tema `:root[data-testata="..."]` e chip in `style.css`, logo e banner in `img/`, e i vincoli `*_testata_check` nel database (vedi fondo di `supabase/schema.sql`).

## Collegamenti per Claude

Dal 24/10/2026 Claude ha accesso diretto a questi servizi e applica da solo le modifiche:
- **GitHub**: `FuxiaAgency/RedazioneFuxiaNet` (Netlify pubblica ogni commit su `main`).
- **Supabase**: progetto `fvdxjdnomfiouqtvdbxh` ("FuxiaAgency's Project"). Le modifiche al database vanno applicate come migrazione e aggiunte in fondo a `supabase/schema.sql`.
- **Netlify**: sito `redazione-fuxianet` (id `f6307f00-c7c5-4a0d-94f9-bb22c9519a5f`).
