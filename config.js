// Collegamento al progetto Supabase della redazione.
// Questi due valori sono pubblici per natura: i permessi veri li fanno le regole del database.
// NON inserire mai qui la chiave "service_role" / "secret".
window.CONFIG = {
  SUPABASE_URL: '',       // es. https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: ''   // chiave "anon public" (o "publishable")
};
