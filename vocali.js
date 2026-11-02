/* ---------- Vocali: messaggi audio delle interviste e trascrizioni ----------
   I file stanno nel contenitore privato 'audio' di Supabase; la riga in 'vocali' tiene nome, collegamenti e trascrizione.
   La trascrizione la fa la funzione 'trascrivi' (supabase/functions/trascrivi) con OpenAI. */
const VC_EXT={opus:'audio/ogg',ogg:'audio/ogg',oga:'audio/ogg',m4a:'audio/mp4',mp4:'audio/mp4',aac:'audio/aac',mp3:'audio/mpeg',mpeg:'audio/mpeg',mpga:'audio/mpeg',wav:'audio/wav',webm:'audio/webm',flac:'audio/flac',amr:'audio/amr',caf:'audio/x-caf'};
const VC_ACCEPT='audio/*,.opus,.ogg,.oga,.m4a,.aac,.mp3,.wav,.webm,.flac,.amr';
const VC_MAX=25*1024*1024;
const VC_ST={nuovo:{l:'Da trascrivere',c:'var(--s-bozza)'},in_corso:{l:'Trascrizione in corso…',c:'var(--s-revisione)'},fatto:{l:'Trascritto',c:'var(--s-pubblicato)'},errore:{l:'Non trascritto',c:'var(--s-correggere)'}};
const vcPlayers=new Map();
/* Stato dei vocali: S.vocali, S.vcQ, S.vcEditing, S.vcDraft, S.vcUploading, S.vcBusy (definiti in app.js). */

function vcFromRow(r){return{id:r.id,path:r.path,name:r.name,mime:r.mime,size:r.size,duration:r.duration,testata:r.testata,articleId:r.article_id,
  contactId:r.contact_id,note:r.note||'',transcript:r.transcript||'',status:r.status,error:r.error||'',by:r.by_id,at:ms(r.created_at)}}
async function loadVocali(){const d=await q(sb.from('vocali').select('*').order('created_at',{ascending:false}).limit(500));
  S.vocali=d.map(vcFromRow);for(const v of S.vocali)if(v.status!=='in_corso')S.vcBusy.delete(v.id);render()}

const vcDur=s=>s?Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0'):'';
const vcSize=b=>b?(b<1048576?Math.max(1,Math.round(b/1024))+' KB':(b/1048576).toLocaleString('it-IT',{maximumFractionDigits:1})+' MB'):'';
function vcExt(f){const m=/\.([a-z0-9]{2,5})$/i.exec(f.name||'');let e=m?m[1].toLowerCase():'';
  if(!VC_EXT[e]){const t=(f.type||'').toLowerCase();e=/ogg|opus/.test(t)?'ogg':/mp4|m4a|aac/.test(t)?'m4a':/mpeg|mp3/.test(t)?'mp3':/wav/.test(t)?'wav':/webm/.test(t)?'webm':/amr/.test(t)?'amr':''}
  return e==='opus'||e==='oga'?'ogg':e==='mpeg'||e==='mpga'?'mp3':e==='mp4'?'m4a':e}
function vcProbe(file){return new Promise(res=>{try{const u=URL.createObjectURL(file);const a=new Audio();let done=false;
  const end=v=>{if(done)return;done=true;URL.revokeObjectURL(u);res(v)};
  a.preload='metadata';a.onloadedmetadata=()=>end(isFinite(a.duration)?a.duration:null);a.onerror=()=>end(null);setTimeout(()=>end(null),4000);a.src=u}catch(e){res(null)}})}

/* Carica uno o più file audio; poi avvia la trascrizione. */
async function uploadVocali(files,opt={}){files=[...files];if(!files.length)return;
  if(!S.me.canWrite){toast('Con il ruolo di lettore non puoi caricare vocali.');return}
  const testata=opt.testata||(S.testata!=='tutte'?S.testata:null);const made=[];
  for(const f of files){const ext=vcExt(f);
    if(!ext){toast('«'+f.name+'» non sembra un file audio.');continue}
    if(f.size>VC_MAX){toast('«'+f.name+'» è troppo grande: il limite è 25 MB (circa 2 ore di vocale WhatsApp).');continue}
    S.vcUploading++;render();
    try{const dur=await vcProbe(f);
      const path=S.me.id+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;
      const up=await sb.storage.from('audio').upload(path,f,{contentType:VC_EXT[ext]||f.type||'application/octet-stream',upsert:false});if(up.error)throw up.error;
      const name=(f.name&&!/^blob$/i.test(f.name))?f.name:'Vocale '+new Date().toLocaleString('it-IT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      const row=await q(sb.from('vocali').insert({path,name,mime:f.type||'',size:f.size,duration:dur,testata,article_id:opt.articleId||null,contact_id:opt.contactId||null,by_id:S.me.id}).select().single());
      const v=vcFromRow(row);S.vocali=[v,...S.vocali.filter(x=>x.id!==v.id)];made.push(v)}
    catch(e){toast(errMsg(e).replace('La foto è troppo grande: il limite è 50 MB','Il file è troppo grande: il limite è 25 MB'))}
    finally{S.vcUploading--;render()}}
  if(made.length){toast(made.length===1?'Vocale caricato: lo sto trascrivendo':made.length+' vocali caricati: li sto trascrivendo');
    for(const v of made)transcribe(v,true)}}
function pickAudio(opt){const i=h('input',{type:'file',accept:VC_ACCEPT,multiple:true,style:'display:none',onchange:()=>{uploadVocali(i.files,opt);i.remove()}});document.body.append(i);i.click()}

async function transcribe(v,quiet){if(S.vcBusy.has(v.id))return;S.vcBusy.add(v.id);v.status='in_corso';v.error='';render();
  try{const {data,error}=await sb.functions.invoke('trascrivi',{body:{id:v.id}});
    if(error){let m='';try{const j=await error.context.json();m=j.error||''}catch(e){}throw new Error(m||error.message)}
    v.status='fatto';v.transcript=(data&&data.text)||'';if(!quiet)toast('Trascrizione pronta')}
  catch(e){v.status='errore';v.error=String(e.message||e);
    toast(/Failed to send|fetch/i.test(v.error)?'La trascrizione non è raggiungibile. Riprova tra poco.':v.error)}
  S.vcBusy.delete(v.id);render();loadVocali().catch(()=>{})}

async function vcUpdate(v,patch,msg){try{const r=await q(sb.from('vocali').update(patch).eq('id',v.id).select('id'));if(!r.length)throw{code:'perm'};Object.assign(v,vcFromRow({...vcToRow(v),...patch}));msg&&toast(msg);render();loadVocali()}catch(e){toast(errMsg(e))}}
function vcToRow(v){return{id:v.id,path:v.path,name:v.name,mime:v.mime,size:v.size,duration:v.duration,testata:v.testata,article_id:v.articleId,contact_id:v.contactId,note:v.note,transcript:v.transcript,status:v.status,error:v.error,by_id:v.by,created_at:v.at&&new Date(v.at).toISOString()}}

/* Lettore: si crea solo quando si preme Ascolta (link firmato valido un'ora) e resta lo stesso fra un aggiornamento e l'altro. */
function vcPlayer(v){let p=vcPlayers.get(v.id);if(p)return p;
  const box=h('div',{class:'vcplay'});
  const btn=h('button',{class:'btn sm',onclick:async()=>{btn.disabled=true;btn.textContent='Apro…';
    try{const {data,error}=await sb.storage.from('audio').createSignedUrl(v.path,3600);if(error)throw error;
      const a=h('audio',{controls:true,preload:'auto',src:data.signedUrl});
      a.addEventListener('error',()=>box.replaceChildren(h('span',{class:'muted',style:'font-size:13px'},'Questo telefono non riesce a riprodurre il formato del vocale. Puoi comunque trascriverlo o scaricarlo.')));
      box.replaceChildren(a);a.play().catch(()=>{})}
    catch(e){btn.disabled=false;btn.textContent='▶ Ascolta';toast(errMsg(e))}}},'▶ Ascolta');
  box.append(btn);vcPlayers.set(v.id,box);return box}
async function vcDownload(v){try{const {data,error}=await sb.storage.from('audio').createSignedUrl(v.path,600,{download:v.name||'vocale'});if(error)throw error;location.href=data.signedUrl}catch(e){toast(errMsg(e))}}
async function vcDelete(v){try{const r=await q(sb.from('vocali').delete().eq('id',v.id).select('id'));if(!r.length)throw{code:'perm'};
  sb.storage.from('audio').remove([v.path]).catch(()=>{});vcPlayers.delete(v.id);S.vocali=S.vocali.filter(x=>x.id!==v.id);toast('Vocale eliminato');render()}catch(e){toast(errMsg(e))}}
async function vcCopy(v){try{await navigator.clipboard.writeText(v.transcript);toast('Trascrizione copiata')}catch(e){toast('Copia non riuscita: tieni premuto sul testo per selezionarlo.')}}

/* Aggiunge la trascrizione in fondo al testo dell'articolo. */
async function vcAddToArticle(v,a){const text=v.transcript.trim();if(!text)return;
  if(S.editing&&S.current===a.id&&S.draft){S.draft.body=(S.draft.body.trim()?S.draft.body.replace(/\s+$/,'')+'\n\n':'')+text;
    const ta=document.getElementById('f-body');if(ta)ta.value=S.draft.body;queueSave();toast('Trascrizione aggiunta in fondo al testo');return}
  if(!canEditArt(a)){toast('Non puoi modificare questo articolo.');return}
  if(a.lockedBy&&a.lockedBy!==S.me.id&&a.lockedUntil>Date.now()){toast(pname(a.lockedBy)+' sta modificando l\'articolo: riprova quando ha finito, oppure usa Copia.');return}
  await patchArt(a,{body:((a.body||'').trim()?a.body.replace(/\s+$/,'')+'\n\n':'')+text,updatedAt:Date.now(),updatedBy:S.me.id},'Trascrizione aggiunta in fondo al testo')}
async function vcToArticle(v){let t=v.testata||(S.testata!=='tutte'?S.testata:null);
  if(!t){modal({title:'Per quale testata?',small:true,body:close=>({body:h('div',{class:'tpick'},TK.map(k=>h('button',{type:'button',onclick:()=>{close();v.testata=k;vcToArticle(v)}},h('img',{src:TESTATE[k].logo,alt:''}),TESTATE[k].name))),foot:[h('button',{class:'btn',onclick:close},'Annulla')]})});return}
  const c=v.contactId&&(S.contatti||[]).find(x=>x.id===v.contactId);const now=Date.now();
  const title=v.note||(c?'Intervista a '+c.name:'');
  try{const row=await q(sb.from('articles').insert({testata:t,title,section:'Interviste',body:v.transcript,author_id:S.me.id,updated_by:S.me.id,history:[{s:'bozza',by:S.me.id,at:now}]}).select().single());
    await q(sb.from('vocali').update({article_id:row.id,testata:t}).eq('id',v.id));
    const art=artFromRow(row);S.articles=[art,...S.articles.filter(x=>x.id!==art.id)];toast('Bozza creata dalla trascrizione');go('articolo',art.id);startEdit(art);loadVocali()}
  catch(e){toast(errMsg(e))}}

/* Dettagli: titolo, intervistato, articolo, testata. */
function vcDetails(v){const d={note:v.note,contactId:v.contactId||'',articleId:v.articleId||'',testata:v.testata||''};
  modal({title:'Dettagli del vocale',small:true,body:close=>{
    const arts=S.articles.filter(a=>a.status!=='pubblicato'||a.id===v.articleId).sort((x,y)=>(y.updatedAt||0)-(x.updatedAt||0));
    const sel=(id,val,opts,on)=>h('select',{id,onchange:e=>on(e.target.value)},opts.map(([k,l])=>{const o=h('option',{value:k},l);if(k===val)o.selected=true;return o}));
    return{body:h('div',{class:'apform'},
      h('div',{class:'field wide'},h('label',{for:'vc-note'},'Di cosa si tratta'),h('input',{id:'vc-note',value:d.note,placeholder:'Es. Intervista a Mario Rossi, risposta 2',oninput:e=>d.note=e.target.value})),
      h('div',{class:'field wide'},h('label',{for:'vc-c'},'Chi parla (dalla Rubrica)'),sel('vc-c',d.contactId,[['','Nessuno'],...(S.contatti||[]).map(c=>[c.id,c.name+(c.role?' · '+c.role:'')])],x=>d.contactId=x)),
      h('div',{class:'field wide'},h('label',{for:'vc-a'},'Articolo'),sel('vc-a',d.articleId,[['','Nessuno'],...arts.map(a=>[a.id,'['+TESTATE[tOf(a)].short+'] '+(a.title||'Senza titolo')])],x=>{d.articleId=x;const a=S.articles.find(y=>y.id===x);if(a)d.testata=tOf(a)})),
      h('div',{class:'field wide'},h('label',{for:'vc-t'},'Testata'),sel('vc-t',d.testata,[['','Nessuna'],...TK.map(k=>[k,TESTATE[k].name])],x=>d.testata=x))),
      foot:[h('div',{class:'spacer'}),h('button',{class:'btn',onclick:close},'Annulla'),h('button',{class:'btn primary',onclick:()=>{close();
        vcUpdate(v,{note:d.note.trim(),contact_id:d.contactId||null,article_id:d.articleId||null,testata:d.testata||null},'Vocale aggiornato')}},'Salva')]}}})}

function vcCard(v,inArticle){const st=VC_ST[v.status]||VC_ST.nuovo;const busy=v.status==='in_corso'||S.vcBusy.has(v.id);
  const a=v.articleId&&S.articles.find(x=>x.id===v.articleId);const c=v.contactId&&(S.contatti||[]).find(x=>x.id===v.contactId);
  const canDel=S.me.isDir||v.by===S.me.id;const editing=S.vcEditing===v.id;let armed=false;
  const del=canDel?h('button',{class:'btn danger sm',onclick:()=>{if(!armed){armed=true;del.textContent='Conferma';return}vcDelete(v)}},'Elimina'):null;
  let tr;
  if(editing){const ta=h('textarea',{id:'vc-ed-'+v.id,rows:8,value:S.vcDraft,oninput:e=>S.vcDraft=e.target.value});
    tr=h('div',{class:'vctr'},ta,h('div',{class:'ops'},h('button',{class:'btn primary sm',onclick:()=>{const t=S.vcDraft;S.vcEditing=null;vcUpdate(v,{transcript:t,status:t.trim()?'fatto':v.status},'Trascrizione salvata')}},'Salva'),
      h('button',{class:'btn sm',onclick:()=>{S.vcEditing=null;render()}},'Annulla')))}
  else if(v.transcript)tr=h('div',{class:'vctr'},h('div',{class:'vctext'},v.transcript),h('div',{class:'ops'},
    h('button',{class:'btn sm',onclick:()=>vcCopy(v)},'Copia'),
    S.me.canWrite?h('button',{class:'btn sm',onclick:()=>{S.vcEditing=v.id;S.vcDraft=v.transcript;render();setTimeout(()=>{const t=document.getElementById('vc-ed-'+v.id);t&&t.focus()},20)}},'Correggi'):null,
    S.me.canWrite&&a?h('button',{class:'btn primary sm',onclick:()=>vcAddToArticle(v,a)},'Aggiungi al testo'):null,
    S.me.canWrite&&!a?h('button',{class:'btn primary sm',onclick:()=>vcToArticle(v)},'Crea articolo'):null,
    S.me.canWrite&&!busy?h('button',{class:'btn ghost sm',onclick:()=>transcribe(v)},'Ritrascrivi'):null));
  else tr=h('div',{class:'vctr'},
    busy?h('div',{class:'vcwait'},h('span',{class:'spin','aria-hidden':'true'}),'Sto trascrivendo… di solito bastano pochi secondi.')
      :v.error?h('div',{class:'vcerr'},v.error):h('div',{class:'muted',style:'font-size:13px'},'Non ancora trascritto.'),
    S.me.canWrite&&!busy?h('div',{class:'ops'},h('button',{class:'btn primary sm',onclick:()=>transcribe(v)},v.error?'Riprova a trascrivere':'Trascrivi'),
      h('button',{class:'btn sm',onclick:()=>{S.vcEditing=v.id;S.vcDraft='';render()}},'Scrivi a mano')):null);
  return h('article',{class:'vocale',style:'--k:'+st.c},
    h('div',{class:'h'},v.testata&&TESTATE[v.testata]?tchip(v.testata):null,h('span',{class:'kind'},st.l),h('span',null,[vcDur(v.duration),vcSize(v.size)].filter(Boolean).join(' · '))),
    h('div',{class:'vcname'},'🎙 ',v.note||v.name||'Vocale'),
    v.note&&v.name?h('div',{class:'muted',style:'font-size:12px;overflow-wrap:anywhere'},v.name):null,
    h('div',{class:'h'},avatar(v.by),h('span',null,'Caricato da ',h('b',null,pname(v.by)),' · '+ago(v.at))),
    (c||(a&&!inArticle))?h('div',{class:'vclinks'},c?h('span',null,'👤 ',h('b',null,c.name)):null,
      a&&!inArticle?h('button',{class:'linkish',onclick:()=>go('articolo',a.id)},'📰 '+(a.title||'Senza titolo')):null):null,
    vcPlayer(v),tr,
    h('div',{class:'ops'},S.me.canWrite?h('button',{class:'btn ghost sm',onclick:()=>vcDetails(v)},'Dettagli'):null,
      h('button',{class:'btn ghost sm',onclick:()=>vcDownload(v)},'Scarica'),h('div',{class:'spacer'}),del))}

function vcHelp(){return h('details',{class:'vchelp'},h('summary',null,'Come prendo i vocali da WhatsApp?'),
  h('p',null,h('b',null,'iPhone: '),'in WhatsApp tieni premuto il vocale → Inoltra → icona Condividi (in basso a destra) → "Salva su File". Poi qui tocca "Carica vocali" → Sfoglia e scegli il file. Si possono selezionare più vocali insieme.'),
  h('p',null,h('b',null,'Android: '),'con l\'app installata, tieni premuto il vocale in WhatsApp → Condividi → FuxiaNet 1. Il vocale arriva qui e si trascrive da solo. In alternativa salvalo e usa "Carica vocali".'),
  h('p',null,h('b',null,'Computer: '),'trascina i file audio in questa pagina, oppure usa "Carica vocali" (da WhatsApp Web: menu del vocale → Scarica).'),
  h('p',{class:'muted'},'La trascrizione è parola per parola: rileggila sempre ascoltando il vocale, soprattutto nomi propri e numeri.'))}

function renderVocali(){const qq=S.vcQ.trim().toLowerCase();
  const all=S.vocali.filter(v=>S.testata==='tutte'||!v.testata||v.testata===S.testata);
  const list=all.filter(v=>!qq||[v.name,v.note,v.transcript,((S.contatti||[]).find(c=>c.id===v.contactId)||{}).name].join(' ').toLowerCase().includes(qq));
  const top=h('div',{class:'toolbar'},h('h1',null,'Vocali'),h('span',{class:'muted'},all.length+(all.length===1?' vocale':' vocali')),h('div',{class:'spacer'}),
    h('input',{id:'vc-cerca',class:'search',type:'search',placeholder:'Cerca nelle trascrizioni…',value:S.vcQ,oninput:e=>{S.vcQ=e.target.value;render()}}),
    S.me.canWrite?h('button',{class:'btn primary',onclick:()=>pickAudio()},'＋ Carica vocali'):null);
  const wrap=h('div',{class:'vcpage',ondragover:e=>{e.preventDefault()},ondrop:e=>{e.preventDefault();if(e.dataTransfer.files.length)uploadVocali(e.dataTransfer.files)}},
    top,S.vcUploading?h('div',{class:'banner'},h('span',{class:'spin','aria-hidden':'true'}),'Caricamento di '+S.vcUploading+(S.vcUploading===1?' vocale…':' vocali…')):null,vcHelp(),
    list.length?h('div',{class:'aplist'},list.map(v=>vcCard(v))):h('div',{class:'hint',style:'margin-top:16px'},qq?'Nessun vocale trovato.':'Nessun vocale ancora. Carica le risposte delle interviste: verranno trascritte parola per parola.'));
  return wrap}

/* Pannello nell'articolo */
function vocaliPanel(a){const list=S.vocali.filter(v=>v.articleId===a.id);
  return h('section',{class:'panel'},h('h2',null,'Vocali dell\'intervista',S.me.canWrite?h('button',{class:'btn sm',onclick:()=>pickAudio({articleId:a.id,testata:tOf(a)})},'＋ Carica'):null),
    S.vcUploading?h('div',{class:'vcwait'},h('span',{class:'spin','aria-hidden':'true'}),'Caricamento…'):null,
    list.length?h('div',{class:'vcside'},list.map(v=>vcCard(v,true))):h('p',{class:'muted',style:'margin:0;font-size:13px'},'Carica qui i vocali WhatsApp dell\'intervistato: vengono trascritti parola per parola e con un tocco li aggiungi al testo.'))}

/* Vocali condivisi da WhatsApp su Android (share_target nel manifest, raccolti da sw.js) */
async function takeShared(){if(!('caches' in window)||!S.me.canWrite)return;
  try{const c=await caches.open('condivisi');const keys=await c.keys();if(!keys.length)return;const files=[];
    for(const k of keys){const r=await c.match(k);if(r){const b=await r.blob();files.push(new File([b],decodeURIComponent(r.headers.get('x-name')||'vocale.ogg'),{type:b.type}))}await c.delete(k)}
    if(files.length){if(S.view!=='vocali')go('vocali');uploadVocali(files)}}catch(e){console.warn(e)}}
