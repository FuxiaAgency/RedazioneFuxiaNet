// Funzione "trascrivi": trascrive un vocale con OpenAI e salva il testo nella tabella vocali.
// Lavora con i permessi di chi la chiama (nessuna chiave di servizio): le regole del database valgono anche qui.
// Segreti: OPENAI_API_KEY (obbligatorio), OPENAI_TRANSCRIBE_MODEL (facoltativo, predefinito gpt-4o-transcribe).
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const PROMPT =
  "Messaggio vocale in italiano, risposta a un'intervista giornalistica. Trascrizione fedele parola per parola, con punteggiatura.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });

  let id = "";
  try { ({ id } = await req.json()); } catch { /* corpo non valido */ }
  if (!id) return json({ error: "Manca il vocale da trascrivere." }, 400);

  const { data: role } = await sb.rpc("my_role");
  if (role !== "redattore" && role !== "direttore") {
    return json({ error: "Solo redattori e direttori possono trascrivere." }, 403);
  }

  const { data: v, error: e1 } = await sb.from("vocali").select("id,path").eq("id", id).single();
  if (e1 || !v) return json({ error: "Vocale non trovato." }, 404);

  const fail = async (msg: string, code: string, status = 500) => {
    await sb.from("vocali").update({ status: "errore", error: msg }).eq("id", id);
    return json({ error: msg, code }, status);
  };

  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return fail("La trascrizione non è ancora attiva: manca la chiave di OpenAI.", "no_key", 503);

  await sb.from("vocali").update({ status: "in_corso", error: "" }).eq("id", id);

  const { data: blob, error: e2 } = await sb.storage.from("audio").download(v.path);
  if (e2 || !blob) return fail("Non riesco a leggere il file audio.", "no_file");

  const ext = (v.path.split(".").pop() || "ogg").toLowerCase();
  const call = async (model: string) => {
    const fd = new FormData();
    fd.append("file", new File([blob], "vocale." + ext, { type: blob.type || "audio/ogg" }));
    fd.append("model", model);
    fd.append("language", "it");
    fd.append("response_format", "json");
    if (model === "whisper-1") fd.append("temperature", "0");
    else fd.append("prompt", PROMPT);
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key },
      body: fd,
    });
    const t = await r.text();
    let j: { text?: string; error?: { message?: string; code?: string } } = {};
    try { j = JSON.parse(t); } catch { /* risposta non JSON */ }
    return { ok: r.ok, status: r.status, text: j.text ?? "", err: j.error?.message ?? t.slice(0, 300), code: j.error?.code ?? "" };
  };

  const model = Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-transcribe";
  let r = await call(model);
  // Vocali molto lunghi o formati rifiutati dal modello nuovo: riprova con whisper-1.
  if (!r.ok && r.status === 400 && model !== "whisper-1") r = await call("whisper-1");

  if (!r.ok) {
    const m = r.status === 401
      ? "La chiave di OpenAI non è valida."
      : r.code === "insufficient_quota"
      ? "Il credito di OpenAI è finito: ricaricalo su platform.openai.com (Billing)."
      : r.status === 429
      ? "OpenAI è occupato: riprova tra un minuto."
      : "OpenAI non è riuscito a trascrivere il vocale: " + r.err;
    return fail(m, "openai", 502);
  }

  const text = r.text.trim();
  await sb.from("vocali").update({ transcript: text, status: "fatto", error: "" }).eq("id", id);
  return json({ text });
});
