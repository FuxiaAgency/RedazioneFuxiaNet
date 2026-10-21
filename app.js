'use strict';
const STATI=[
  {k:'bozza',l:'Bozza',c:'var(--s-bozza)',hint:'Articoli appena iniziati'},
  {k:'revisione',l:'In revisione',c:'var(--s-revisione)',hint:'Pronti per essere letti e corretti'},
  {k:'correggere',l:'Da correggere',c:'var(--s-correggere)',hint:'Tornano all\'autore con le correzioni'},
  {k:'pronto',l:'Pronto',c:'var(--s-pronto)',hint:'In attesa del via libera del direttore'},
  {k:'pubblicato',l:'Pubblicato',c:'var(--s-pubblicato)',hint:'Visibili nell\'Edizione'}];
const STATO=Object.fromEntries(STATI.map(s=>[s.k,s]));
const SEZIONI=['Attualità','Cronaca','Musica','Televisione','Intrattenimento','Interviste','Cultura','Sport','Opinioni'];
const KINDS={nota:{l:'Nota',c:'var(--accent)'},suggerimento:{l:'Suggerimento',c:'var(--s-revisione)'},correzione:{l:'Correzione',c:'var(--pencil)'}};
const BATTUTE_CARTELLA=1800;
const TESTATE={
  fuxia:{k:'fuxia',name:'Fuxia Magazine',short:'Fuxia',logo:'img/fuxia_logo.png',banner:'img/fuxia_banner.jpg',motto:'Non è per tutti. È per chi vibra.'},
  rnv:{k:'rnv',name:'Rete NeTVision',short:'RNV',logo:'img/rnv_logo.png',banner:'img/rnv_banner.jpg',motto:'Rete NeTVision'}};
const TK=['fuxia','rnv'];
const tOf=a=>a&&a.testata==='rnv'?'rnv':'fuxia';
const inT=a=>S.testata==='tutte'||tOf(a)===S.testata;
const viewT=()=>S.testata==='tutte'?TK:[S.testata];
const tchip=t=>h('span',{class:'tchip t-'+t},TESTATE[t].short);
function setTestata(t){S.testata=t;try{localStorage.setItem('redazione.testata',t)}catch(e){}document.documentElement.dataset.testata=t;render()}

const S={me:{id:null,name:'',role:null,isDir:false,canWrite:false},team:[],
  articles:[],photos:[],appunti:[],contatti:[],rbQ:'',apFilter:'tutti',apHideDone:true,apKind:'promemoria',apTestata:null,menabi:{fuxia:null,rnv:null},testata:'fuxia',people:{},loaded:false,started:false,
  view:'tavolo',current:null,notes:[],editing:false,draft:null,
  filter:{q:'',mine:false},noteKind:'nota',hideResolved:false,
  lockTimer:null,saveTimer:null,saving:false,savePending:false,authMode:'login',installEvt:null};
/* ---------- dati (Supabase) ---------- */
let sb=null;
const ms=t=>t?new Date(t).getTime():null;
const iso=t=>t==null?null:new Date(t).toISOString();
async function q(p){const {data,error}=await p;if(error)throw error;return data}
const A2R={testata:'testata',title:'title',kicker:'kicker',summary:'summary',section:'section',firma:'firma',body:'body',coverId:'cover_id',gallery:'gallery',status:'status',
  authorId:'author_id',assigneeId:'assignee_id',deadline:'deadline',history:'history',updatedAt:'updated_at',updatedBy:'updated_by',publishedAt:'published_at'};
const TIMEF=new Set(['deadline','updatedAt','publishedAt']);
function artFromRow(r){return{id:r.id,testata:r.testata,title:r.title,kicker:r.kicker,summary:r.summary,section:r.section,firma:r.firma,body:r.body,coverId:r.cover_id,
  gallery:r.gallery||[],status:r.status,authorId:r.author_id,assigneeId:r.assignee_id,deadline:ms(r.deadline),history:r.history||[],createdAt:ms(r.created_at),
  updatedAt:ms(r.updated_at),updatedBy:r.updated_by,publishedAt:ms(r.published_at),lockedBy:r.locked_by,lockedUntil:ms(r.locked_until)}}
function artToRow(p){const o={};for(const[k,v]of Object.entries(p)){const c=A2R[k];if(c)o[c]=TIMEF.has(k)?iso(v):v}return o}
const API={async updateArt(id,patch){const d=await q(sb.from('articles').update(artToRow(patch)).eq('id',id).select('id'));if(!d.length)throw{code:'perm'};return d}};
function purl(p){return p&&p.path?CONFIG.SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/object/public/foto/'+p.path:''}
function later(fn,wait=250){let t;return()=>{clearTimeout(t);t=setTimeout(()=>fn().catch(e=>console.warn(e)),wait)}}
async function loadArticles(){const d=await q(sb.from('articles').select('*').order('updated_at',{ascending:false}));S.articles=d.map(artFromRow);S.loaded=true;render()}
async function loadPhotos(){const d=await q(sb.from('photos').select('*').order('created_at',{ascending:false}));
  S.photos=d.map(r=>({id:r.id,path:r.path,caption:r.caption,credit:r.credit,name:r.name,by:r.by_id,at:ms(r.created_at)}));modalRedraw&&modalRedraw();render()}
async function loadMenabo(){const d=await q(sb.from('menabo').select('*'));S.menabi={fuxia:null,rnv:null};for(const r of d)S.menabi[r.testata]=r.data;render()}
async function loadNotes(){if(S.view!=='articolo'||!S.current)return;const id=S.current;
  const d=await q(sb.from('notes').select('*').eq('article_id',id).order('created_at'));if(S.current!==id)return;
  S.notes=d.map(r=>({id:r.id,kind:r.kind,text:r.text,quote:r.quote,by:r.by_id,at:ms(r.created_at),resolved:r.resolved}));render()}
async function loadPeople(){const d=await q(sb.from('profiles').select('*').order('created_at'));S.team=d;
  S.people=Object.fromEntries(d.map(p=>[p.id,{id:p.id,name:p.name,email:p.email,role:p.role,color:colorFor(p.id)}]));
  const me=S.people[S.me.id];const was=S.me.role;
  if(me){S.me.name=me.name;S.me.role=me.role;S.me.isDir=me.role==='direttore';S.me.canWrite=me.role==='redattore'||me.role==='direttore';S.me.canRead=me.role!=='in_attesa'}
  if(was!==S.me.role){if(S.me.role==='in_attesa'){showWaiting();return}if(!S.started||was==='in_attesa'){enterApp();return}}
  render()}
function reloadAll(){return Promise.all([loadArticles(),loadPhotos(),loadMenabo(),loadPeople(),loadNotes(),loadAppunti(),loadContatti()]).catch(e=>toast(errMsg(e)))}
let channel=null;
function subscribe(){if(channel)return;const ra=later(loadArticles),rp=later(loadPhotos),rpe=later(loadPeople),rm=later(loadMenabo),rn=later(loadNotes,150);
  const on=(c,t,f)=>c.on('postgres_changes',{event:'*',schema:'public',table:t},f);
  channel=sb.channel('redazione');on(on(on(on(on(channel,'articles',ra),'photos',rp),'profiles',rpe),'menabo',rm),'notes',rn);on(channel,'appunti',later(loadAppunti));on(channel,'contatti',later(loadContatti));channel.subscribe()}
/* ---------- accesso ---------- */
function shell(){document.documentElement.dataset.testata=S.testata}
async function start(user){if(S.me.id===user.id&&S.started)return;S.me.id=user.id;
  try{await loadPeople()}catch(e){showAuth(errMsg(e));return}
  if(!S.people[user.id]){showAuth('Profilo non trovato. Se il database è appena stato creato, esci e iscriviti di nuovo.');return}
  subscribe()}
async function enterApp(){if(S.authMode==='newpass')return;S.started=true;shell();render();
  try{await Promise.all([loadArticles(),loadPhotos(),loadMenabo()]);loadAppunti().catch(()=>{});loadContatti().catch(()=>{});if(S.view==='articolo')loadNotes()}catch(e){toast(errMsg(e))}}
function authFrame(...kids){S.started=false;document.documentElement.dataset.testata='tutte';document.querySelector('.mast').hidden=true;
  document.getElementById('main').replaceChildren(h('div',{class:'auth'},h('div',{class:'auth-box'},
    h('div',{class:'auth-logos'},TK.map(k=>h('img',{src:TESTATE[k].logo,alt:TESTATE[k].name}))),h('div',{class:'auth-card'},kids))))}
function showAuth(msg,ok){const m=S.authMode;const f={};
  const field=(id,label,type,extra)=>{const i=h('input',Object.assign({id,type,required:true},extra||{}));f[id]=i;return h('div',{class:'field'},h('label',{for:id},label),i)};
  const note=msg?h('div',{class:'auth-msg'+(ok?'':' err')},msg):null;
  const sw=(mode,label)=>h('button',{type:'button',onclick:()=>{S.authMode=mode;showAuth()}},label);
  let title,sub,fields,btn,links;
  if(m==='signup'){title='Iscriviti';sub='Dopo l\'iscrizione un direttore ti darà accesso alla redazione.';
    fields=[field('a-name','Nome e cognome','text',{autocomplete:'name'}),field('a-email','Email','email',{autocomplete:'email'}),field('a-pass','Password (almeno 8 caratteri)','password',{autocomplete:'new-password',minlength:'8'})];
    btn='Crea l\'account';links=[sw('login','Hai già un account? Entra')]}
  else if(m==='reset'){title='Password dimenticata';sub='Ti mandiamo un\'email con il link per sceglierne una nuova.';
    fields=[field('a-email','Email','email',{autocomplete:'email'})];btn='Manda il link';links=[sw('login','Torna all\'accesso')]}
  else if(m==='newpass'){title='Nuova password';sub='Scegli la nuova password per entrare.';
    fields=[field('a-pass','Nuova password (almeno 8 caratteri)','password',{autocomplete:'new-password',minlength:'8'})];btn='Salva la password';links=[]}
  else{title='Entra in redazione';sub='Fuxia Magazine · Rete NeTVision';
    fields=[field('a-email','Email','email',{autocomplete:'email'}),field('a-pass','Password','password',{autocomplete:'current-password'})];
    btn='Entra';links=[sw('signup','Iscriviti'),sw('reset','Password dimenticata?')]}
  const submit=h('button',{class:'btn primary',type:'submit'},btn);
  const form=h('form',{style:'display:grid;gap:14px',onsubmit:async e=>{e.preventDefault();submit.disabled=true;
    try{const email=f['a-email']&&f['a-email'].value.trim(),password=f['a-pass']&&f['a-pass'].value;
      if(m==='login'){const r=await sb.auth.signInWithPassword({email,password});if(r.error)throw r.error}
      else if(m==='signup'){const r=await sb.auth.signUp({email,password,options:{data:{name:f['a-name'].value.trim()},emailRedirectTo:location.origin+location.pathname}});if(r.error)throw r.error;
        if(!r.data.session){S.authMode='login';showAuth('Ti abbiamo mandato un\'email: apri il link per confermare l\'indirizzo, poi entra qui.',true);return}}
      else if(m==='reset'){const r=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(r.error)throw r.error;
        S.authMode='login';showAuth('Email inviata. Apri il link che trovi nella posta.',true);return}
      else if(m==='newpass'){const r=await sb.auth.updateUser({password});if(r.error)throw r.error;S.authMode='login';
        const s=await sb.auth.getSession();if(s.data.session){start(s.data.session.user);return}showAuth('Password aggiornata. Ora entra.',true);return}}
    catch(err){submit.disabled=false;const t=String(err.message||'');
      showAuth(/Invalid login/i.test(t)?'Email o password non corrette.':/already registered/i.test(t)?'Questa email è già iscritta: entra o recupera la password.':/Email not confirmed/i.test(t)?'Devi prima confermare l\'email: apri il link che ti abbiamo mandato.':errMsg(err));
      return}
    submit.disabled=false}},fields,submit);
  authFrame(h('h1',null,title),h('p',null,sub),note,form,links.length?h('div',{class:'auth-links'},links):null)}
function showWaiting(){if(S.authMode==='newpass')return;authFrame(h('h1',null,'Quasi fatto, '+(S.me.name||'benvenuto')),
  h('p',null,'Il tuo account è stato creato. Ora un direttore deve darti accesso alla redazione: appena lo fa, questa pagina si apre da sola.'),
  h('div',{class:'auth-links'},h('button',{type:'button',onclick:()=>loadPeople().catch(()=>{})},'Controlla di nuovo'),h('button',{type:'button',onclick:()=>sb.auth.signOut()},'Esci')))}
function showSetup(){authFrame(h('h1',null,'Configurazione mancante'),h('p',null,'Inserisci l\'indirizzo del progetto Supabase e la chiave pubblica nel file config.js, poi ricarica la pagina.'))}
/* ---------- squadra (solo direttori) ---------- */
const RUOLI={in_attesa:'In attesa',lettore:'Lettore',redattore:'Redattore',direttore:'Direttore'};
function renderSquadra(){if(!S.me.isDir)return h('p',{class:'muted'},'Questa sezione è riservata ai direttori.');
  const team=[...S.team].sort((a,b)=>(a.role==='in_attesa'?0:1)-(b.role==='in_attesa'?0:1)||a.name.localeCompare(b.name));
  const link=location.origin+location.pathname;
  return h('div',null,h('div',{class:'toolbar'},h('h1',null,'Squadra'),h('span',{class:'muted'},team.length+' persone')),
    h('div',{class:'agenda'},h('div',{class:'eyebrow'},'Come invitare un collega'),
      h('p',{style:'margin:8px 0 10px'},'Mandagli il link della redazione. Si iscrive con la sua email, compare qui come "In attesa" e tu scegli il suo ruolo.'),
      h('div',{class:'install'},h('code',{class:'mono',style:'overflow-wrap:anywhere'},link),h('button',{class:'btn sm',onclick:()=>{navigator.clipboard&&navigator.clipboard.writeText(link).then(()=>toast('Link copiato'),()=>toast('Copia il link selezionandolo'))}},'Copia link'))),
    h('div',{class:'team'},team.map(p=>{const sel=h('select',{id:'role-'+p.id,'aria-label':'Ruolo di '+p.name,onchange:async e=>{const v=e.target.value;
        try{await q(sb.from('profiles').update({role:v}).eq('id',p.id));toast(p.name+': '+RUOLI[v]);loadPeople()}catch(err){toast(errMsg(err));loadPeople()}}},
      Object.entries(RUOLI).map(([k,l])=>h('option',{value:k,selected:p.role===k||null},l)));
      return h('div',{class:'member'+(p.role==='in_attesa'?' pending':'')},avatar(p.id),h('div',{class:'who2'},h('b',null,p.name+(p.id===S.me.id?' (tu)':'')),h('span',null,p.email||'')),sel)})),
    h('p',{class:'muted',style:'margin-top:14px;font-size:13px'},'Lettore: vede tutto ma non scrive. Redattore: scrive, corregge, lascia note e carica foto. Direttore: in più pubblica, prepara il menabò e gestisce la squadra.'))}
/* ---------- profilo e installazione ---------- */
function profileModal(){modal({title:'Il mio profilo',small:true,body:close=>{
  const nm=h('input',{id:'my-name',class:'search',style:'width:100%',value:S.me.name||'',maxlength:'80'});
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  const inst=standalone?null:h('div',{class:'agenda',style:'margin:0'},h('div',{class:'eyebrow'},'App sul telefono'),
    S.installEvt?h('div',{style:'margin-top:8px'},h('button',{class:'btn primary sm',onclick:async()=>{const ev=S.installEvt;S.installEvt=null;ev.prompt();close()}},'Installa l\'app')):
    h('p',{style:'margin:8px 0 0;font-size:14px'},ios?'Su iPhone: tocca il pulsante Condividi di Safari, poi "Aggiungi alla schermata Home".':'Apri il menu del browser e scegli "Installa app" o "Aggiungi a schermata Home".'));
  return{body:h('div',{style:'display:grid;gap:14px'},h('div',{class:'field'},h('label',{for:'my-name'},'Il mio nome'),nm),h('p',{class:'muted',style:'margin:0;font-size:13px'},'Ruolo: '+RUOLI[S.me.role||'lettore']),inst),
    foot:[h('button',{class:'btn danger',onclick:()=>sb.auth.signOut()},'Esci'),h('div',{class:'spacer'}),h('button',{class:'btn',onclick:close},'Chiudi'),
      h('button',{class:'btn primary',onclick:async()=>{const v=nm.value.trim();if(!v)return;try{await q(sb.from('profiles').update({name:v}).eq('id',S.me.id));close();toast('Nome aggiornato');loadPeople()}catch(e){toast(errMsg(e))}}},'Salva')]}}})}
/* ---------- utilità ---------- */
function h(tag,attrs,...kids){const el=document.createElement(tag);
  if(attrs)for(const[k,v]of Object.entries(attrs)){if(v==null||v===false)continue;
    if(k==='class')el.className=v;else if(k==='text')el.textContent=v;else if(k==='style')el.style.cssText=v;
    else if(k==='value')el.value=v;else if(k.startsWith('on'))el.addEventListener(k.slice(2),v);
    else el.setAttribute(k,v===true?'':v)}
  for(const c of kids.flat(Infinity)){if(c==null||c===false)continue;el.append(c instanceof Node?c:document.createTextNode(String(c)))}
  return el}
const rtf=new Intl.RelativeTimeFormat('it',{numeric:'auto'});
function ago(t){if(!t)return'';const d=(t-Date.now())/1000;const a=Math.abs(d);
  if(a<60)return'adesso';if(a<3600)return rtf.format(Math.round(d/60),'minute');if(a<86400)return rtf.format(Math.round(d/3600),'hour');
  if(a<86400*7)return rtf.format(Math.round(d/86400),'day');return new Date(t).toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'})}
const fullDate=t=>t?new Date(t).toLocaleString('it-IT',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,3600)}
const COLORS=['#ec009c','#14229a','#1f8a55','#d2560e','#6a3fd0','#0f8b8d','#b7791f','#b8007a','#2f6fd1','#7d6b75'];
function colorFor(id){let n=0;for(const c of String(id||''))n=(n*31+c.charCodeAt(0))>>>0;return COLORS[n%COLORS.length]}
function person(id){return S.people[id]||{name:'',color:'var(--muted)'}}
function pname(id,fallback='Qualcuno'){if(id&&id===S.me.id)return person(id).name||S.me.name||'Tu';return person(id).name||fallback}
function initials(n){const p=String(n||'').trim().split(/\s+/).filter(Boolean);return((p[0]||'?')[0]+(p[1]?p[1][0]:'')).toUpperCase()}
function avatar(id){const p=person(id);return h('span',{class:'av ini',style:'background:'+(p.color||colorFor(id)),'aria-hidden':'true'},initials(p.name))}
function ensurePeople(){}
function photoById(pid){return S.photos.find(p=>p.id===pid)}
function errMsg(e){const m=String((e&&(e.message||e.error_description))||'');
  if(/Solo|direttore|pubblicat/i.test(m))return m;
  if(e&&e.code==='perm'||/row-level security|permission/i.test(m))return'Non hai il permesso per questa operazione.';
  if(/Payload too large|exceeded|maximum allowed size/i.test(m))return'La foto è troppo grande: il limite è 50 MB.';
  if(/fetch|network|Failed to fetch/i.test(m))return'Connessione assente. Controlla internet e riprova.';
  return m?'Operazione non riuscita: '+m:'Operazione non riuscita. Riprova.'}
function canSetStatus(art,k){if(!S.me.canWrite)return false;if(k==='pubblicato'||art.status==='pubblicato')return S.me.isDir;return true}
function canEditArt(art){return S.me.canWrite&&(art.status!=='pubblicato'||S.me.isDir)}
function canDeleteArt(art){return S.me.isDir||(art.authorId&&art.authorId===S.me.id&&art.status!=='pubblicato')}
const battute=s=>(s||'').length;
const parole=s=>((s||'').trim().match(/\S+/g)||[]).length;

/* ---------- testo dell'articolo ---------- */
function inline(s){const out=[];const re=/\*\*(.+?)\*\*|\*(.+?)\*/g;let last=0,m;
  const txt=t=>t.split('\n').flatMap((l,i)=>i?[h('br'),l]:[l]);
  while((m=re.exec(s))){if(m.index>last)out.push(txt(s.slice(last,m.index)));out.push(m[1]?h('strong',null,m[1]):h('em',null,m[2]));last=re.lastIndex}
  out.push(txt(s.slice(last)));return out}
function figure(pid,big){const p=photoById(pid);
  if(!p)return h('div',{class:'missing'},'Foto non più disponibile nell\'archivio');
  return h('figure',null,h('img',{src:purl(p),alt:p.caption||'',loading:'lazy',onclick:()=>lightbox(pid)}),
    (p.caption||p.credit)?h('figcaption',null,p.caption||'',p.credit?[' ',h('span',{class:'credit'},'Foto: '+p.credit)]:null):null)}
function renderBody(text){const out=h('div',{class:'prose'});
  for(const b0 of (text||'').replace(/\r/g,'').split(/\n{2,}/)){const b=b0.trim();if(!b)continue;let m;
    if((m=b.match(/^\[foto:([\w.~:@+-]+)\]$/)))out.append(figure(m[1]));
    else if(b.startsWith('## '))out.append(h('h3',null,inline(b.slice(3))));
    else if(b.startsWith('>'))out.append(h('blockquote',null,inline(b.replace(/^>\s?/gm,''))));
    else out.append(h('p',null,inline(b)))}
  if(!out.childNodes.length)out.append(h('p',{class:'muted'},'Il testo non è ancora stato scritto.'));
  return out}

/* ---------- navigazione ---------- */
function hashOf(view,id){return'#'+(view==='articolo'?'a-'+id:view)}
function parseHash(){const s=(location.hash||'').slice(1);if(s.startsWith('a-'))return{view:'articolo',id:s.slice(2)};
  return{view:['edizione','foto','tavolo','menabo','riepilogo','squadra','appunti','rubrica'].includes(s)?s:'tavolo',id:null}}
function go(view,id,fromPop){
  if(S.editing&&!(view==='articolo'&&id===S.current))stopEdit();
  const changed=view!=='articolo'||id!==S.current;
  S.view=view;S.current=id||null;
  if(changed){S.notes=[];if(view==='articolo')loadNotes().catch(()=>{})}
  if(!fromPop){try{history.pushState(null,'',hashOf(view,id))}catch(e){}}
  window.scrollTo(0,0);render()}
/* ---------- render ---------- */
function render(){if(!S.started)return;renderMast();
  const main=document.getElementById('main');
  if(!S.loaded){main.replaceChildren(h('p',{class:'skeleton'},'Apertura della redazione…'));return}
  if(S.view==='articolo')return renderArticle(main);
  if(S.view==='edizione')return main.replaceChildren(renderEdizione());
  if(S.view==='foto')return main.replaceChildren(renderFoto());
  if(S.view==='menabo')return main.replaceChildren(renderMenabo());
  if(S.view==='riepilogo')return main.replaceChildren(renderRiepilogo());
  if(S.view==='squadra')return main.replaceChildren(renderSquadra());
  if(S.view==='rubrica'){const ae=document.activeElement,fid=ae&&ae.id,ss=ae&&ae.selectionStart;
    main.replaceChildren(renderRubrica());if(fid){const el=document.getElementById(fid);if(el){el.focus();try{el.setSelectionRange(ss,ss)}catch(e){}}}return}
  if(S.view==='appunti'){const ae=document.activeElement,fid=ae&&ae.id,ss=ae&&ae.selectionStart,se=ae&&ae.selectionEnd;
    main.replaceChildren(renderAppunti());if(fid){const el=document.getElementById(fid);if(el){el.focus();try{el.setSelectionRange(ss,se)}catch(e){}}}return}
  const f=document.activeElement&&document.activeElement.id==='cerca'?document.activeElement.selectionStart:null;
  main.replaceChildren(renderTavolo());
  if(f!=null){const i=document.getElementById('cerca');if(i){i.focus();try{i.setSelectionRange(f,f)}catch(e){}}}}
function renderMast(){const m=document.getElementById('mast');document.querySelector('.mast').hidden=false;
  const tab=(v,l,extra)=>h('button',{'aria-current':S.view===v||(v==='tavolo'&&S.view==='articolo')?'page':null,onclick:()=>go(v)},l,extra);
  const T=S.testata;const pending=S.team.filter(p=>p.role==='in_attesa').length;
  const brand=h('div',{class:'brand-row'},T==='tutte'?h('div',{class:'logos'},TK.map(k=>h('img',{class:'logo-m',src:TESTATE[k].logo,alt:TESTATE[k].name}))):h('img',{class:'logo-m',src:TESTATE[T].logo,alt:TESTATE[T].name}),
    h('div',{class:'brand'},h('small',null,'Redazione'),h('b',null,T==='tutte'?'Tutte le testate':TESTATE[T].name)));
  const sw=h('div',{class:'tsw',role:'group','aria-label':'Testata'},[['fuxia','Fuxia'],['rnv','RNV'],['tutte','Tutte']].map(([k,l])=>h('button',{class:'t-'+k,'aria-pressed':String(T===k),onclick:()=>setTestata(k)},l)));
  m.replaceChildren(brand,sw,h('nav',{class:'nav'},tab('tavolo','Tavolo di lavoro'),tab('appunti','Appunti'),tab('rubrica','Rubrica'),tab('riepilogo','Riepilogo'),tab('menabo','Menabò'),tab('edizione','Edizione'),tab('foto','Archivio foto'),
      S.me.isDir?tab('squadra','Squadra',pending?h('span',{class:'badge'},pending):null):null),
    h('div',{class:'spacer'}),
    S.me.canWrite&&S.loaded?h('button',{class:'btn primary',onclick:newArticle},'＋ Nuovo articolo'):null,
    h('button',{class:'me-btn',onclick:profileModal,'aria-label':'Il mio profilo'},avatar(S.me.id),h('span',{class:'role'+(S.me.isDir?' dir':'')},S.me.isDir?'Direttore':(S.me.canWrite?'Redattore':'Lettore'))))}
function filtered(){const q=S.filter.q.trim().toLowerCase();
  return S.articles.filter(a=>inT(a)&&(!S.filter.mine||a.authorId===S.me.id||a.assigneeId===S.me.id)&&(!q||[a.title,a.kicker,a.summary,a.section,a.firma].join(' ').toLowerCase().includes(q)))}

function renderTavolo(){const arts=filtered();ensurePeople(arts.flatMap(a=>[a.authorId,a.assigneeId]));
  const top=h('div',{class:'toolbar'},h('h1',null,'Tavolo di lavoro'),h('div',{class:'spacer'}),
    h('input',{id:'cerca',class:'search',type:'search',placeholder:'Cerca titolo, sezione…',value:S.filter.q,oninput:e=>{S.filter.q=e.target.value;render()}}),
    S.me.id?h('label',{class:'chk'},h('input',{id:'miei',type:'checkbox',checked:S.filter.mine||null,onchange:e=>{S.filter.mine=e.target.checked;render()}}),'Solo i miei'):null);
  if(!S.articles.length)return h('div',null,top,emptyState());
  const board=h('div',{class:'board'},STATI.map(st=>{const list=arts.filter(a=>(a.status||'bozza')===st.k);
    return h('section',{class:'col'},h('header',null,h('span',{class:'pill',style:'--c:'+st.c},st.l),h('span',{class:'n'},list.length)),
      list.length?list.map(card):h('div',{class:'hint'},st.hint))}));
  return h('div',null,top,agenda(arts),h('div',{class:'boardwrap'},board))}

function agenda(arts){const up=arts.filter(a=>a.deadline&&a.status!=='pubblicato').sort((x,y)=>x.deadline-y.deadline).slice(0,6);
  if(!up.length)return null;
  return h('section',{class:'agenda'},h('div',{class:'eyebrow'},'Prossime consegne'),h('div',{class:'rows'},up.map(a=>h('button',{class:'r',onclick:()=>go('articolo',a.id)},
    dueChip(a),h('span',{class:'tt'},a.title||'Senza titolo'),h('span',{class:'pp'},avatar(a.assigneeId||a.authorId),h('span',null,pname(a.assigneeId||a.authorId)))))))}

function card(a){const p=a.coverId&&photoById(a.coverId);
  return h('button',{class:'card',onclick:()=>go('articolo',a.id)},
    p?h('img',{class:'thumb',src:purl(p),alt:'',loading:'lazy'}):null,
    (S.testata==='tutte'||a.section)?h('span',{style:'display:flex;gap:8px;align-items:center'},S.testata==='tutte'?tchip(tOf(a)):null,a.section?h('span',{class:'kick'},a.section):null):null,
    h('span',{class:'t'+(a.title?'':' empty')},a.title||'Senza titolo'),
    h('span',{class:'meta'},avatar(a.assigneeId||a.authorId),h('span',null,byName(a)),h('span',null,'· '+ago(a.updatedAt))),
    h('span',{class:'meta mono'},dueChip(a),h('span',null,battute(a.body).toLocaleString('it-IT')+' battute'),where(a.id).length?h('span',null,'· pag. '+where(a.id).map(w=>w.n).join(', ')):null))}

function emptyState(){return h('div',{class:'empty-state'},
  h('div',null,h('h2',null,'Il tavolo è vuoto'),h('p',{class:'muted',style:'margin:0 0 16px'},'Qui compariranno gli articoli della redazione, divisi per stato: Bozza, In revisione, Da correggere, Pronto e Pubblicato.'),
    S.me.canWrite?h('button',{class:'btn primary',onclick:newArticle},'＋ Scrivi il primo articolo'):h('p',{class:'muted'},'Con il ruolo di lettore puoi seguire il lavoro. Per scrivere chiedi al direttore di nominarti redattore.')),
  h('div',null,h('div',{class:'eyebrow',style:'margin-bottom:10px'},'Come funziona'),h('ol',null,
    h('li',null,'Ogni collega si iscrive dal link della redazione; il direttore lo approva dalla scheda ',h('b',null,'Squadra'),'.'),
    h('li',null,'Ogni redattore scrive in Bozza e lo invia In revisione.'),
    h('li',null,'Tutti possono lasciare note, suggerimenti e correzioni a margine.'),
    h('li',null,'Quando è Pronto, solo il direttore lo pubblica nell\'Edizione.'))))}
/* ---------- articolo ---------- */
function renderArticle(main){const a=S.articles.find(x=>x.id===S.current);
  if(!a){main.replaceChildren(h('div',{class:'empty-state'},h('div',null,h('h2',null,'Articolo non trovato'),h('p',{class:'muted'},'Potrebbe essere stato eliminato.'),h('button',{class:'btn',onclick:()=>go('tavolo')},'Torna al tavolo'))));return}
  ensurePeople([a.authorId,a.assigneeId,a.updatedBy,...S.notes.map(n=>n.by),...(a.history||[]).map(x=>x.by),S.lock&&S.lock.by]);
  let grid=main.querySelector('.art[data-id="'+a.id+'"]');
  if(!grid){grid=h('div',{class:'art','data-id':a.id},h('div',{class:'sheet',id:'sheet'}),h('aside',{class:'side',id:'side'}));main.replaceChildren(grid)}
  const sheet=grid.querySelector('#sheet');
  if(!(S.editing&&sheet.dataset.mode==='edit')){sheet.dataset.mode=S.editing?'edit':'read';sheet.replaceChildren(...articleSheet(a))}
  else{const hd=sheet.querySelector('#arthead');hd&&hd.replaceWith(articleHead(a))}
  const keep={};const act=document.activeElement;
  for(const k of['note-text','note-quote','f-deadline']){const el=document.getElementById(k);if(el)keep[k]={v:el.value,f:act===el,s:el.selectionStart,e:el.selectionEnd}}
  grid.querySelector('#side').replaceChildren(incaricoPanel(a),notesPanel(a),historyPanel(a));
  for(const[k,o]of Object.entries(keep)){const el=document.getElementById(k);if(!el)continue;el.value=o.v;if(o.f){el.focus();try{el.setSelectionRange(o.s,o.e)}catch(e){}}}}

function articleHead(a){const st=a.status||'bozza';
  const lockedByOther=a.lockedBy&&a.lockedUntil>Date.now()&&a.lockedBy!==S.me.id&&!S.editing;
  return h('div',{id:'arthead'},
    h('button',{class:'back',onclick:()=>go('tavolo')},'← Tavolo di lavoro'),
    h('div',{class:'rail',role:'group','aria-label':'Stato dell\'articolo'},STATI.map(s=>h('button',{style:'--c:'+s.c,'aria-pressed':String(st===s.k),
      disabled:(!canSetStatus(a,s.k)&&st!==s.k)||null,title:s.k==='pubblicato'&&!S.me.isDir?'Solo il direttore può pubblicare':null,
      onclick:()=>st!==s.k&&setStatus(a,s.k)},s.l))),
    h('div',{class:'rail-note'},STATO[st].hint+(st==='pronto'&&!S.me.isDir?' · solo il direttore può pubblicare':'')+(a.publishedAt&&st==='pubblicato'?' · pubblicato '+fullDate(a.publishedAt):'')),
    lockedByOther?h('div',{class:'banner warn'},avatar(a.lockedBy),h('span',null,h('b',null,pname(a.lockedBy)),' sta modificando questo articolo. Puoi leggerlo e lasciare note intanto.')):null,
    h('div',{class:'actions'},
      S.editing?[h('button',{class:'btn primary',onclick:()=>{stopEdit();render()}},'✓ Fine modifica'),h('span',{class:'savestate',id:'savestate'},'Salvataggio automatico attivo')]
      :canEditArt(a)?h('button',{class:'btn primary',disabled:lockedByOther||null,onclick:()=>startEdit(a)},'✎ Modifica'):null,
      h('div',{class:'spacer'}),
      canDeleteArt(a)&&!S.editing?h('button',{class:'btn danger sm',onclick:()=>confirmDelete(a)},'Elimina'):null))}
function articleSheet(a){const head=articleHead(a);
  if(S.editing)return[head,editorForm()];
  const cover=a.coverId&&photoById(a.coverId);
  const gal=(a.gallery||[]).filter(photoById);
  return[head,h('article',{class:'read'},
    h('div',{style:'margin-bottom:8px'},tchip(tOf(a))),
    a.kicker||a.section?h('div',{class:'kicker'},[a.section,a.kicker].filter(Boolean).join(' · ')):null,
    h('h1',null,a.title||'Senza titolo'),
    a.summary?h('p',{class:'summary'},a.summary):null,
    h('div',{class:'byline'},avatar(a.assigneeId||a.authorId),h('span',null,'di ',h('b',null,byName(a))),
      h('span',null,'· aggiornato '+ago(a.updatedAt)+(a.updatedBy&&a.updatedBy!==a.authorId?' da '+pname(a.updatedBy):'')),
      h('span',{class:'mono'},'· '+battute(a.body).toLocaleString('it-IT')+' battute, '+(battute(a.body)/BATTUTE_CARTELLA).toLocaleString('it-IT',{maximumFractionDigits:1})+' cartelle')),
    cover?h('figure',{class:'cover'},figure(a.coverId).childNodes[0],cover.caption||cover.credit?h('figcaption',null,cover.caption||'',cover.credit?[' ',h('span',{class:'credit'},'Foto: '+cover.credit)]:null):null):null,
    renderBody(a.body),
    gal.length?h('section',{class:'gal'},h('h3',null,'Galleria · '+gal.length+' foto'),h('div',{class:'galgrid'},gal.map(pid=>figure(pid)))):null)]}

/* --- modifica con blocco --- */
async function startEdit(a){
  try{const ok=await q(sb.rpc('acquire_lock',{aid:a.id,secs:45}));
    if(!ok){toast('Qualcun altro sta modificando questo articolo. Riprova tra un minuto.');return}}
  catch(e){toast(errMsg(e));return}
  S.draft={title:a.title||'',kicker:a.kicker||'',summary:a.summary||'',section:a.section||'',firma:a.firma||'',body:a.body||'',coverId:a.coverId||null,gallery:[...(a.gallery||[])]};
  S.editing=true;const id=a.id;
  S.lockTimer=setInterval(()=>{if(S.current!==id)return;sb.rpc('acquire_lock',{aid:id,secs:45}).then(()=>{},()=>{})},25000);
  render()}
function stopEdit(){if(!S.editing)return;const id=S.current;flushSave();clearInterval(S.lockTimer);S.editing=false;S.draft=null;
  sb.rpc('release_lock',{aid:id}).then(()=>{},()=>{})}
function queueSave(){const s=document.getElementById('savestate');s&&(s.textContent='Modifiche non ancora salvate…');clearTimeout(S.saveTimer);S.saveTimer=setTimeout(save,1200)}
function flushSave(){if(S.saveTimer){clearTimeout(S.saveTimer);S.saveTimer=null;save()}}
async function save(){S.saveTimer=null;if(!S.draft)return;if(S.saving){S.savePending=true;return}
  S.saving=true;const id=S.current;const d=S.draft;
  try{await API.updateArt(id,{...d,gallery:[...d.gallery],updatedAt:Date.now(),updatedBy:S.me.id});
    const s=document.getElementById('savestate');s&&(s.textContent='Salvato alle '+new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}))}
  catch(e){const s=document.getElementById('savestate');s&&(s.textContent='Non salvato. '+errMsg(e))}
  S.saving=false;if(S.savePending){S.savePending=false;save()}}
function editorForm(){const d=S.draft;
  const bind=(k)=>e=>{d[k]=e.target.value;queueSave();if(k==='body')updCounts()};
  const body=h('textarea',{id:'f-body',class:'body',value:d.body,oninput:bind('body'),placeholder:'Scrivi qui il pezzo. Lascia una riga vuota tra un paragrafo e l\'altro.'});
  const counts=h('div',{class:'counts mono',id:'counts'});
  function updCounts(){const b=battute(d.body);counts.replaceChildren(h('span',null,b.toLocaleString('it-IT')+' battute'),h('span',null,parole(d.body).toLocaleString('it-IT')+' parole'),h('span',null,(b/BATTUTE_CARTELLA).toLocaleString('it-IT',{maximumFractionDigits:1})+' cartelle'))}
  updCounts();
  function wrap(pre,post){const s=body.selectionStart,e=body.selectionEnd,v=body.value;const sel=v.slice(s,e)||'testo';
    body.value=v.slice(0,s)+pre+sel+post+v.slice(e);body.focus();body.setSelectionRange(s+pre.length,s+pre.length+sel.length);d.body=body.value;queueSave();updCounts()}
  function block(prefix){const s=body.selectionStart,v=body.value;const ls=v.lastIndexOf('\n',s-1)+1;
    body.value=v.slice(0,ls)+prefix+v.slice(ls);body.focus();body.setSelectionRange(s+prefix.length,s+prefix.length);d.body=body.value;queueSave();updCounts()}
  function insertPhoto(){pickPhotos({multi:false,title:'Foto nel testo',onPick:ids=>{if(!ids[0])return;const s=body.selectionStart,v=body.value;
    const tok='\n\n[foto:'+ids[0]+']\n\n';body.value=v.slice(0,s)+tok+v.slice(s);d.body=body.value;queueSave();updCounts();body.focus()}})}
  const sec=h('select',{id:'f-section',onchange:bind('section')},h('option',{value:''},'— Scegli —'),SEZIONI.map(s=>h('option',{value:s,selected:d.section===s||null},s)),
    d.section&&!SEZIONI.includes(d.section)?h('option',{value:d.section,selected:true},d.section):null);
  return h('div',{class:'form'},
    h('div',{class:'row2'},h('div',{class:'field'},h('label',{for:'f-section'},'Sezione'),sec),
      h('div',{class:'field'},h('label',{for:'f-kicker'},'Occhiello'),h('input',{id:'f-kicker',value:d.kicker,oninput:bind('kicker'),placeholder:'Es. Il caso'}))),
    h('div',{class:'field'},h('label',{for:'f-title'},'Titolo'),h('input',{id:'f-title',class:'title',value:d.title,oninput:bind('title'),placeholder:'Il titolo del pezzo'})),
    h('div',{class:'field'},h('label',{for:'f-summary'},'Sommario'),h('textarea',{id:'f-summary',class:'summary',value:d.summary,oninput:bind('summary'),placeholder:'Due righe che riassumono la notizia'})),
    h('div',{class:'field'},h('label',{for:'f-firma'},'Firma'),h('input',{id:'f-firma',value:d.firma,oninput:bind('firma'),placeholder:'Lascia vuoto per usare il tuo nome'})),
    coverBox(),
    h('div',{class:'field'},h('label',{for:'f-body'},'Testo'),
      h('div',{class:'fmt'},h('button',{type:'button',onclick:()=>wrap('**','**'),title:'Grassetto'},h('b',null,'G')),h('button',{type:'button',onclick:()=>wrap('*','*'),title:'Corsivo'},h('i',null,'C')),
        h('button',{type:'button',onclick:()=>block('## ')},'Intertitolo'),h('button',{type:'button',onclick:()=>block('> ')},'Citazione'),
        h('button',{type:'button',onclick:insertPhoto},'Foto nel testo'),h('div',{class:'spacer'}),counts),
      body),
    galleryBox())}

function coverBox(){const d=S.draft;const p=d.coverId&&photoById(d.coverId);
  const box=h('div',{class:'mediabox',id:'coverbox'},h('div',{class:'head'},h('span',{class:'eyebrow'},'Foto di apertura')),
    h('div',{class:'coverslot'},p?h('img',{src:purl(p),alt:''}):h('span',{class:'muted'},'Nessuna foto di apertura.'),
      h('button',{type:'button',class:'btn sm',onclick:()=>pickPhotos({multi:false,title:'Foto di apertura',onPick:ids=>{if(ids[0]){d.coverId=ids[0];queueSave();document.getElementById('coverbox').replaceWith(coverBox())}}})},p?'Cambia':'Scegli o carica'),
      p?h('button',{type:'button',class:'btn sm ghost',onclick:()=>{d.coverId=null;queueSave();document.getElementById('coverbox').replaceWith(coverBox())}},'Rimuovi'):null));
  return box}
function galleryBox(){const d=S.draft;
  const redraw=()=>{queueSave();document.getElementById('galbox').replaceWith(galleryBox())};
  const move=(i,dir)=>{const j=i+dir;if(j<0||j>=d.gallery.length)return;[d.gallery[i],d.gallery[j]]=[d.gallery[j],d.gallery[i]];redraw()};
  return h('div',{class:'mediabox',id:'galbox'},h('div',{class:'head'},h('span',{class:'eyebrow'},'Galleria · '+d.gallery.length+' foto'),
      h('button',{type:'button',class:'btn sm',onclick:()=>pickPhotos({multi:true,title:'Aggiungi alla galleria',preselect:d.gallery,onPick:ids=>{d.gallery=ids;redraw()}})},'＋ Aggiungi foto')),
    d.gallery.length?h('div',{class:'tiles'},d.gallery.map((pid,i)=>{const p=photoById(pid);
      return h('div',{class:'tile'},p?h('img',{src:purl(p),alt:p.caption||''}):h('div',{class:'missing'},'Rimossa'),
        h('button',{type:'button',class:'x','aria-label':'Togli dalla galleria',onclick:()=>{d.gallery.splice(i,1);redraw()}},'✕'),
        h('div',{class:'ord'},h('button',{type:'button','aria-label':'Sposta prima',onclick:()=>move(i,-1)},'‹'),h('button',{type:'button','aria-label':'Sposta dopo',onclick:()=>move(i,1)},'›')))}))
    :h('span',{class:'muted'},'Le foto della galleria compaiono in fondo all\'articolo.'))}

async function setStatus(a,k){if(!canSetStatus(a,k))return;const hist=[...(a.history||[]),{s:k,by:S.me.id,at:Date.now()}].slice(-40);
  const patch={status:k,history:hist,updatedAt:Date.now(),updatedBy:S.me.id};if(k==='pubblicato')patch.publishedAt=Date.now();
  try{await API.updateArt(a.id,patch);toast('Stato: '+STATO[k].l);loadArticles()}catch(e){toast(errMsg(e))}}
async function newArticle(t){if(typeof t!=='string')t=S.testata;if(t==='tutte'){chooseTestata();return}const now=Date.now();
  try{const row=await q(sb.from('articles').insert({testata:t,author_id:S.me.id,updated_by:S.me.id,history:[{s:'bozza',by:S.me.id,at:now}]}).select().single());
    const a=artFromRow(row);if(!S.articles.find(x=>x.id===a.id))S.articles=[a,...S.articles];go('articolo',a.id);startEdit(a)}
  catch(e){toast(errMsg(e))}}
function chooseTestata(){modal({title:'Per quale testata scrivi?',small:true,body:close=>({body:h('div',{class:'tpick'},TK.map(k=>h('button',{type:'button',onclick:()=>{close();newArticle(k)}},h('img',{src:TESTATE[k].logo,alt:''}),TESTATE[k].name))),foot:[h('button',{class:'btn',onclick:close},'Annulla')]})})}
function confirmDelete(a){modal({title:'Eliminare l\'articolo?',small:true,body:close=>({
  body:h('p',{style:'margin:0'},'«'+(a.title||'Senza titolo')+'» verrà eliminato per tutta la redazione, insieme alle sue note. Le foto restano nell\'archivio.'),
  foot:[h('button',{class:'btn',onclick:close},'Annulla'),h('button',{class:'btn danger',onclick:async()=>{
    try{const d=await q(sb.from('articles').delete().eq('id',a.id).select('id'));if(!d.length)throw{code:'perm'};
      S.articles=S.articles.filter(x=>x.id!==a.id);close();go('tavolo');toast('Articolo eliminato')}catch(e){toast(errMsg(e))}}},'Elimina')]})})}
/* --- incarico: assegnazione e scadenza --- */
function byName(a){return a.firma||pname(a.assigneeId||a.authorId)}
function pad(n){return String(n).padStart(2,'0')}
function toLocalInput(t){if(!t)return'';const d=new Date(t);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())}
const shortDate=t=>new Date(t).toLocaleString('it-IT',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
function dueChip(a){if(!a.deadline||a.status==='pubblicato')return null;const ms=a.deadline-Date.now();
  const cls=ms<0?'due over':ms<864e5?'due soon':'due';
  return h('span',{class:cls,title:'Consegna: '+fullDate(a.deadline)},ms<0?'In ritardo · '+shortDate(a.deadline):'Consegna '+shortDate(a.deadline))}
function canPlan(a){return S.me.canWrite&&(S.me.isDir||a.authorId===S.me.id)}
async function patchArt(a,patch,msg){try{await API.updateArt(a.id,patch);msg&&toast(msg);loadArticles()}catch(e){toast(errMsg(e))}}
function incaricoPanel(a){const can=canPlan(a);const ws=where(a.id);
  const dl=h('input',{type:'datetime-local',id:'f-deadline',value:toLocalInput(a.deadline),'aria-label':'Data e ora di consegna'});
  return h('section',{class:'panel'},h('h2',null,'Incarico'),h('div',{class:'kv'},
    h('div',null,h('div',{class:'k'},'Testata'),h('div',{class:'v'},canEditArt(a)?h('div',{class:'tseg',role:'group','aria-label':'Testata'},TK.map(k=>h('button',{class:'t-'+k,'aria-pressed':String(tOf(a)===k),onclick:()=>{if(tOf(a)!==k)patchArt(a,{testata:k},'Spostato su '+TESTATE[k].name)}},TESTATE[k].short))):tchip(tOf(a)))),
    h('div',null,h('div',{class:'k'},'Assegnato a'),h('div',{class:'v'},
      a.assigneeId?[avatar(a.assigneeId),h('b',null,pname(a.assigneeId))]:h('span',{class:'muted'},'Nessuno'),
      can?h('button',{class:'btn sm',onclick:()=>pickPerson(a)},a.assigneeId?'Cambia':'Assegna'):null)),
    h('div',null,h('div',{class:'k'},'Consegna'),h('div',{class:'v'},
      a.deadline?(dueChip(a)||h('span',null,fullDate(a.deadline))):h('span',{class:'muted'},'Nessuna scadenza')),
      can?h('div',{class:'v',style:'margin-top:8px'},dl,
        h('button',{class:'btn sm primary',onclick:()=>{if(!dl.value){toast('Scegli data e ora di consegna.');return}patchArt(a,{deadline:new Date(dl.value).getTime()},'Scadenza salvata')}},'Salva'),
        a.deadline?h('button',{class:'btn sm ghost',onclick:()=>patchArt(a,{deadline:null},'Scadenza rimossa')},'Rimuovi'):null):null),
    h('div',null,h('div',{class:'k'},'Nel menabò'),h('div',{class:'v'},ws.length?ws.map(w=>h('span',{class:'pill',style:'--c:var(--accent)'},'Pag. '+w.n+' · '+w.page+' · '+SLOT[w.kind].l)):h('span',{class:'muted'},'Non ancora impaginato')))))}
function pickPerson(a){
  modal({title:'Assegna l\'articolo',small:true,body:close=>{
    const pick=async id=>{close();await patchArt(a,{assigneeId:id},id?'Assegnato a '+pname(id):'Assegnazione rimossa')};
    const team=S.team.filter(p=>p.role==='redattore'||p.role==='direttore');
    const list=h('div',{class:'people'},team.map(p=>h('button',{type:'button',onclick:()=>pick(p.id)},avatar(p.id),h('span',{style:'flex:1'},p.name+(p.id===S.me.id?' (tu)':'')),h('span',{class:'muted',style:'font-size:12px'},p.role==='direttore'?'Direttore':'Redattore'))),
      a.assigneeId?h('button',{type:'button',onclick:()=>pick(null)},h('span',{class:'av',style:'background:var(--hover)'}),h('span',{class:'muted'},'Togli l\'assegnazione')):null);
    return{body:h('div',null,team.length?list:h('p',{class:'muted'},'Nessun redattore ancora approvato.')),foot:[h('button',{class:'btn',onclick:close},'Chiudi')]}}})}
/* --- note --- */
function notesPanel(a){const open=S.notes.filter(n=>!n.resolved).length;
  const list=S.notes.filter(n=>!S.hideResolved||!n.resolved);
  const ta=h('textarea',{id:'note-text',placeholder:S.noteKind==='correzione'?'Scrivi la versione corretta…':S.noteKind==='suggerimento'?'Cosa proponi di cambiare?':'Lascia una nota alla redazione…'});
  const quote=h('input',{id:'note-quote',class:'quote',placeholder:'Frase del testo a cui si riferisce (facoltativo)'});
  const kinds=h('div',{class:'kinds',role:'group','aria-label':'Tipo di nota'},Object.entries(KINDS).map(([k,v])=>h('button',{type:'button',style:'--k:'+v.c,'aria-pressed':String(S.noteKind===k),onclick:()=>{S.noteKind=k;const keepT=ta.value,keepQ=quote.value;render();const t=document.getElementById('note-text'),q2=document.getElementById('note-quote');if(t){t.value=keepT;t.focus()}if(q2)q2.value=keepQ}},v.l)));
  async function add(){const text=ta.value.trim();if(!text)return;
    try{await q(sb.from('notes').insert({article_id:a.id,text,quote:quote.value.trim(),kind:S.noteKind,by_id:S.me.id}));ta.value='';quote.value='';loadNotes()}catch(e){toast(errMsg(e))}}
  return h('section',{class:'panel'},h('h2',null,h('span',null,'Note e correzioni'),h('span',{class:'mono muted',style:'font-size:12px;font-weight:400'},open+' aperte')),
    S.me.canWrite?h('div',{class:'composer'},kinds,S.noteKind!=='nota'?quote:null,ta,h('div',{class:'row'},
      h('label',{class:'filt'},h('input',{id:'hide-res',type:'checkbox',checked:S.hideResolved||null,onchange:e=>{S.hideResolved=e.target.checked;render()}}),'Nascondi risolte'),
      h('button',{class:'btn primary sm',onclick:add},'Aggiungi'))):null,
    h('div',{class:'notes'},list.length?list.slice().reverse().map(n=>noteItem(a,n)):h('p',{class:'muted',style:'margin:0;font-size:14px'},'Nessuna nota. Usa le correzioni per segnalare refusi e le note per dare indicazioni all\'autore.')))}
function noteItem(a,n){const k=KINDS[n.kind]||KINDS.nota;const mine=n.by===S.me.id;
  const act=p=>p.then(r=>{if(r.error)throw r.error;loadNotes()}).catch(e=>toast(errMsg(e)));
  return h('div',{class:'note'+(n.resolved?' resolved':''),style:'--k:'+k.c},
    h('div',{class:'h'},h('span',{class:'kind'},k.l),h('b',null,pname(n.by)),h('span',null,ago(n.at)),h('div',{class:'spacer'}),
      S.me.canWrite?h('div',{class:'ops'},h('button',{onclick:()=>act(sb.from('notes').update({resolved:!n.resolved}).eq('id',n.id))},n.resolved?'Riapri':'Risolta'),
        mine||S.me.isDir?h('button',{onclick:()=>act(sb.from('notes').delete().eq('id',n.id))},'Elimina'):null):null),
    n.quote?h('div',{class:'q'+(n.kind==='correzione'?' del':'')},'«'+n.quote+'»'):null,
    h('div',{class:'txt'},n.kind==='correzione'&&n.quote?'→ '+n.text:n.text))}
function historyPanel(a){const hs=(a.history||[]).slice().reverse().slice(0,12);
  return h('section',{class:'panel'},h('h2',null,'Cronologia'),h('div',{class:'hist'},hs.length?hs.map(x=>h('div',null,h('span',{class:'pill',style:'--c:'+(STATO[x.s]||STATO.bozza).c},(STATO[x.s]||STATO.bozza).l),h('span',null,pname(x.by)),h('span',{class:'muted'},ago(x.at)))):h('span',{class:'muted'},'—')))}

/* ---------- edizione ---------- */
function renderEdizione(){return h('div',{class:'ed-stack'},viewT().map(renderEdizioneFor))}
function renderEdizioneFor(t){const ord=mbOrder(t);const rank=a=>ord.has(a.id)?ord.get(a.id):1e6;
  const pub=S.articles.filter(a=>a.status==='pubblicato'&&tOf(a)===t).sort((x,y)=>(rank(x)-rank(y))||((y.publishedAt||0)-(x.publishedAt||0)));
  ensurePeople(pub.map(a=>a.authorId));
  const head=h('div',{class:'ed-head'},h('h1',null,TESTATE[t].name),h('p',null,new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+' · '+pub.length+' articoli pubblicati'));
  const banner=h('img',{class:'banner-img',src:TESTATE[t].banner,alt:TESTATE[t].name+' · '+TESTATE[t].motto});
  if(!pub.length)return h('div',null,banner,h('div',{class:'sheet'},head,h('p',{class:'muted',style:'text-align:center'},'Ancora nessun articolo pubblicato per '+TESTATE[t].name+'. Quando il direttore pubblica un pezzo, appare qui come lo leggeranno i lettori.')));
  const [lead,...rest]=pub;const lp=lead.coverId&&photoById(lead.coverId);
  return h('div',null,banner,h('div',{class:'sheet'},head,
    h('button',{class:'lead',onclick:()=>go('articolo',lead.id)},lp?h('img',{src:purl(lp),alt:''}):null,
      h('div',null,h('span',{class:'kick'},[lead.section,lead.kicker].filter(Boolean).join(' · ')),h('h2',null,lead.title||'Senza titolo'),lead.summary?h('p',null,lead.summary):null,h('div',{class:'muted',style:'margin-top:12px;font-size:13px'},'di '+byName(lead)))),
    h('div',{class:'edgrid'},rest.map(a=>{const p=a.coverId&&photoById(a.coverId);
      return h('button',{class:'story',onclick:()=>go('articolo',a.id)},p?h('img',{src:purl(p),alt:'',loading:'lazy'}):null,h('span',{class:'kick'},a.section||''),h('h3',null,a.title||'Senza titolo'),a.summary?h('p',null,a.summary):null)}))))}

/* ---------- riepilogo ---------- */
function renderRiepilogo(){const all=S.articles.filter(inT);const who=a=>a.assigneeId||a.authorId||'?';
  ensurePeople(all.map(who));
  const idx=Object.fromEntries(STATI.map((s,i)=>[s.k,i]));const stOf=a=>a.status||'bozza';
  const sel=S.rstato||null;
  const rows=all.filter(a=>!sel||stOf(a)===sel).sort((x,y)=>(idx[stOf(x)]-idx[stOf(y)])||((x.deadline||9e15)-(y.deadline||9e15))||((y.updatedAt||0)-(x.updatedAt||0)));
  const top=h('div',{class:'toolbar'},h('h1',null,'Riepilogo'),h('span',{class:'muted'},all.length+' articoli in tutto'));
  if(!all.length)return h('div',null,top,h('p',{class:'muted'},'Quando la redazione inizierà a scrivere, qui vedrai tutti gli articoli uno sotto l\'altro, con chi se ne occupa e a che punto sono.'));
  const chips=h('div',{class:'chips',role:'group','aria-label':'Filtra per stato'},
    h('button',{'aria-pressed':String(!sel),onclick:()=>{S.rstato=null;render()}},'Tutti ',h('i',null,all.length)),
    STATI.map(s=>h('button',{style:'--c:'+s.c,'aria-pressed':String(sel===s.k),onclick:()=>{S.rstato=sel===s.k?null:s.k;render()}},s.l,' ',h('i',null,all.filter(a=>stOf(a)===s.k).length))));
  const people=[...new Set(all.map(who))];
  const whoBox=h('div',{class:'who'},people.map(pid=>{const mine=all.filter(a=>who(a)===pid);const late=mine.filter(a=>a.deadline&&a.deadline<Date.now()&&stOf(a)!=='pubblicato').length;
    return h('div',{class:'whocard'},h('div',{class:'n'},avatar(pid),h('span',null,pname(pid)),h('span',{class:'tot'},mine.length+(mine.length===1?' pezzo':' pezzi'))),
      h('div',{class:'stack'},STATI.map(s=>{const n=mine.filter(a=>stOf(a)===s.k).length;return n?h('i',{style:'background:'+s.c+';width:'+(n/mine.length*100)+'%',title:s.l+': '+n}):null})),
      h('div',{class:'lg'},STATI.map(s=>{const n=mine.filter(a=>stOf(a)===s.k).length;return n?h('span',{style:'--c:'+s.c},h('b',null,n),' '+s.l.toLowerCase()):null}),late?h('span',{style:'--c:var(--pencil)'},h('b',null,late),' in ritardo'):null))}));
  const list=h('div',{class:'rlist'},h('div',{class:'rhead'},h('span',null,'Stato'),h('span',null,'Articolo'),h('span',null,'Chi'),h('span',null,'Consegna'),h('span',null,'Pagina'),h('span',null,'Aggiornato')),
    rows.map(a=>{const st=STATO[stOf(a)];const w=where(a.id);
      return h('button',{class:'rrow',style:'--c:'+st.c,onclick:()=>go('articolo',a.id)},
        h('span',null,h('span',{class:'pill',style:'--c:'+st.c},st.l)),
        h('span',{class:'tt'},(S.testata==='tutte'||a.section)?h('span',{style:'display:flex;gap:8px;align-items:center'},S.testata==='tutte'?tchip(tOf(a)):null,a.section?h('span',{class:'kick'},a.section):null):null,h('b',null,a.title||'Senza titolo')),
        h('span',{class:'pp'},avatar(who(a)),h('span',null,byName(a))),
        h('span',null,dueChip(a)||h('span',{class:'sm'},a.status==='pubblicato'&&a.publishedAt?'Uscito '+ago(a.publishedAt):'—')),
        h('span',{class:'sm mono'},w.length?'Pag. '+w.map(x=>x.n).join(', '):'—'),
        h('span',{class:'sm c-up'},ago(a.updatedAt)))}),
    rows.length?null:h('p',{class:'muted'},'Nessun articolo in questo stato.'));
  return h('div',null,top,h('div',{class:'eyebrow',style:'margin-bottom:8px'},'Chi fa cosa'),whoBox,chips,list)}

/* ---------- menabò ---------- */
const SLOT={apertura:{l:'Apertura',d:'Il pezzo principale della pagina'},spalla:{l:'Spalla',d:'Colonna laterale'},taglio:{l:'Taglio',d:'Pezzo in basso'},breve:{l:'Breve',d:'Notizia corta'}};
const uid=()=>Math.random().toString(36).slice(2,10);
const todayISO=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
function mbDefault(){const pg=(title,kinds)=>({id:uid(),title,slots:kinds.map(kind=>({id:uid(),kind,articleId:null}))});
  return{date:todayISO(),pages:[pg('Prima pagina',['apertura','spalla','taglio']),pg('Cronaca',['apertura','taglio','breve','breve']),
    pg('Musica e TV',['apertura','spalla','taglio']),pg('Cultura',['apertura','spalla']),pg('Sport',['apertura','taglio','breve'])]}}
function where(aid){const out=[];for(const t of TK){const mb=S.menabi[t];if(!mb)continue;(mb.pages||[]).forEach((p,i)=>(p.slots||[]).forEach(s=>{if(s.articleId===aid)out.push({t,n:i+1,page:p.title,kind:s.kind})}))}return out}
function mbOrder(t){const m=new Map();let i=0;const mb=S.menabi[t];if(mb)for(const p of mb.pages||[])for(const s of p.slots||[]){if(s.articleId&&!m.has(s.articleId))m.set(s.articleId,i);i++}return m}
let mbChain=Promise.resolve();
function mbSave(t,mut){if(!S.me.isDir)return;const next=JSON.parse(JSON.stringify(S.menabi[t]||mbDefault()));mut(next);S.menabi[t]=next;render();
  mbChain=mbChain.then(()=>q(sb.from('menabo').upsert({testata:t,data:next,updated_at:new Date().toISOString()}))).catch(e=>{toast(errMsg(e));loadMenabo()})}
function renderMenaboFor(t){const mb=S.menabi[t];const dir=S.me.isDir;
  const intro=h('p',{class:'muted mb-intro'},'Il menabò è lo schema dell\'edizione: per ogni pagina si decide quale pezzo va in apertura, di spalla, di taglio e nelle brevi. Il colore di ogni spazio mostra a che punto è l\'articolo.');
  const top=h('div',{class:'toolbar'},h('h1',null,'Menabò'));
  if(!mb)return h('div',{class:'mb-t'},tHead(t),h('div',{class:'empty-state'},h('div',null,h('h2',null,'Nessun menabò per ora'),
    h('p',{class:'muted'},dir?'Parti da uno schema con cinque pagine tipiche: puoi rinominarle, aggiungerne o toglierne, e cambiare gli spazi.':'Il direttore non ha ancora impostato il menabò dell\'edizione.'),
    dir?h('button',{class:'btn primary',onclick:()=>mbSave(t,()=>{})},'Crea il menabò'):null)));
  const slots=(mb.pages||[]).flatMap(p=>p.slots||[]);const arts=slots.map(s=>s.articleId&&S.articles.find(a=>a.id===s.articleId)).filter(Boolean);
  ensurePeople(arts.map(a=>a.assigneeId||a.authorId));
  const cnt=k=>arts.filter(a=>(a.status||'bozza')===k).length;const tot=slots.length||1;
  const bar=h('div',{class:'mb-bar'},
    h('label',{class:'chk'},'Edizione del ',dir?h('input',{type:'date',id:'mb-date-'+t,value:mb.date||todayISO(),onchange:e=>mbSave(t,m=>{m.date=e.target.value})}):h('b',null,mb.date?new Date(mb.date+'T12:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'}):'—')),
    h('div',{class:'mb-prog'},h('div',{class:'bar'},STATI.map(s=>h('i',{style:'background:'+s.c+';width:'+(cnt(s.k)/tot*100)+'%',title:s.l}))),
      h('span',null,(mb.pages||[]).length+' pagine · '+slots.length+' spazi · '+arts.length+' occupati · '+(cnt('pronto')+cnt('pubblicato'))+' pronti o pubblicati')),
    dir?h('button',{class:'btn sm',onclick:()=>mbSave(t,m=>m.pages.push({id:uid(),title:'Nuova pagina',slots:[{id:uid(),kind:'apertura',articleId:null}]}))},'＋ Pagina'):null,
    dir?h('button',{class:'btn sm ghost',onclick:()=>confirmClearMb(t)},'Svuota per nuova edizione'):null);
  return h('div',{class:'mb-t'},tHead(t),bar,h('div',{class:'mb-pages'},(mb.pages||[]).map((p,i)=>mbPage(t,p,i))))}

function mbPage(t,p,i){const dir=S.me.isDir;const n=S.menabi[t].pages.length;let delArmed=false;
  const del=h('button',{title:'Elimina pagina',onclick:()=>{if(!delArmed){delArmed=true;del.textContent='Conferma';return}mbSave(t,m=>m.pages.splice(i,1))}},'✕');
  return h('section',{class:'mb-page'},h('header',null,h('span',{class:'num'},'P. '+(i+1)),
      dir?h('input',{class:'ttl',id:'mb-t-'+p.id,value:p.title,'aria-label':'Nome della pagina',onchange:e=>mbSave(t,m=>{m.pages[i].title=e.target.value.trim()||'Pagina'})}):h('span',{class:'ttl'},p.title),
      dir?h('div',{class:'pops'},h('button',{title:'Sposta prima',disabled:i===0||null,onclick:()=>mbSave(t,m=>{[m.pages[i-1],m.pages[i]]=[m.pages[i],m.pages[i-1]]})},'‹'),
        h('button',{title:'Sposta dopo',disabled:i===n-1||null,onclick:()=>mbSave(t,m=>{[m.pages[i+1],m.pages[i]]=[m.pages[i],m.pages[i+1]]})},'›'),del):null),
    h('div',{class:'mb-slots'},(p.slots||[]).map((s,j)=>mbSlot(t,p,i,s,j))),
    dir?h('div',{class:'mb-add'},'Aggiungi:',Object.entries(SLOT).map(([k,v])=>h('button',{title:v.d,onclick:()=>mbSave(t,m=>m.pages[i].slots.push({id:uid(),kind:k,articleId:null}))},v.l))):null)}

function mbSlot(t,p,i,s,j){const a=s.articleId&&S.articles.find(x=>x.id===s.articleId);const st=a&&STATO[a.status||'bozza'];const dir=S.me.isDir;
  const open=()=>{if(dir)pickArticle(t,i,j);else if(a)go('articolo',a.id)};
  return h('div',{class:'slot k-'+s.kind+(a?' filled':''),style:st?'--c:'+st.c:null,role:'button',tabindex:'0',onclick:open,onkeydown:e=>{if(e.key==='Enter')open()}},
    h('span',{class:'sk'},SLOT[s.kind].l),
    a?[h('span',{class:'st'},a.title||'Senza titolo'),h('span',{class:'sm'},h('span',{class:'pill',style:'--c:'+st.c},st.l),h('span',null,byName(a)),dueChip(a))]
     :h('span',{class:'free'},s.articleId?'Articolo eliminato':dir?'Tocca per scegliere un pezzo':'Spazio libero'),
    dir?h('button',{class:'rm',title:'Togli questo spazio','aria-label':'Togli questo spazio',onclick:e=>{e.stopPropagation();mbSave(t,m=>m.pages[i].slots.splice(j,1))}},'✕'):null)}

function pickArticle(t,i,j){const slot=S.menabi[t].pages[i].slots[j];
  modal({title:'Pag. '+(i+1)+' · '+SLOT[slot.kind].l,body:close=>{const q=h('input',{id:'mb-cerca',class:'search',style:'width:100%;margin-bottom:8px',type:'search',placeholder:'Cerca un articolo'});
    const list=h('div');
    const draw=()=>{const qq=q.value.trim().toLowerCase();list.replaceChildren(...S.articles.filter(a=>tOf(a)===t).filter(a=>!qq||[a.title,a.section].join(' ').toLowerCase().includes(t)).map(a=>{const st=STATO[a.status||'bozza'];const w=where(a.id);
      return h('button',{type:'button',class:'pickrow',onclick:()=>{close();mbSave(t,m=>{m.pages[i].slots[j].articleId=a.id})}},h('span',{class:'pill',style:'--c:'+st.c},st.l),
        h('span',{class:'tt'},a.title||'Senza titolo',h('div',{class:'where'},[a.section,byName(a),w.length?'già a pag. '+w.map(x=>x.n).join(', '):''].filter(Boolean).join(' · '))),dueChip(a))}));
      if(!list.childNodes.length)list.append(h('p',{class:'muted'},'Nessun articolo. Crealo dal Tavolo di lavoro e poi impaginalo qui.'))};
    q.addEventListener('input',draw);draw();
    return{body:h('div',null,q,list),foot:[slot.articleId?h('button',{class:'btn ghost',onclick:()=>{close();mbSave(t,m=>{m.pages[i].slots[j].articleId=null})}},'Libera lo spazio'):null,h('div',{class:'spacer'}),h('button',{class:'btn',onclick:close},'Annulla')]}}})}

function confirmClearMb(t){modal({title:'Nuova edizione',small:true,body:close=>({body:h('p',{style:'margin:0'},'Le pagine e gli spazi restano, ma tutti gli articoli vengono tolti dal menabò. Gli articoli non vengono cancellati.'),
  foot:[h('button',{class:'btn',onclick:close},'Annulla'),h('button',{class:'btn primary',onclick:()=>{close();mbSave(t,m=>{m.date=todayISO();m.pages.forEach(p=>p.slots.forEach(s=>s.articleId=null))});toast('Menabò pronto per la nuova edizione')}},'Svuota')]})})}

function tHead(t){return S.testata==='tutte'?h('div',{class:'thead'},h('img',{src:TESTATE[t].logo,alt:''}),TESTATE[t].name):null}
function renderMenabo(){const top=h('div',{class:'toolbar'},h('h1',null,'Menabò'));
  const intro=h('p',{class:'muted mb-intro'},'Il menabò è lo schema dell\'edizione: per ogni pagina si decide quale pezzo va in apertura, di spalla, di taglio e nelle brevi. Il colore di ogni spazio mostra a che punto è l\'articolo. Ogni testata ha il suo.');
  return h('div',null,top,intro,viewT().map(renderMenaboFor))}

/* ---------- archivio foto ---------- */
async function prepImage(file){if(/gif|svg/.test(file.type))return file;
  try{const bmp=await createImageBitmap(file);const sc=Math.min(1,2400/Math.max(bmp.width,bmp.height));
    if(sc===1&&file.size<3e6&&/jpeg|png|webp/.test(file.type))return file;
    const c=document.createElement('canvas');c.width=Math.round(bmp.width*sc);c.height=Math.round(bmp.height*sc);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
    return await new Promise(r=>c.toBlob(b=>r(b||file),'image/jpeg',.86))}catch(e){return file}}
async function uploadFiles(files){if(!S.me.canWrite){toast('Non hai il permesso di caricare foto.');return[]}
  const ids=[];const list=[...files].filter(f=>f.type.startsWith('image/'));
  if(!list.length){toast('Scegli dei file immagine (JPG, PNG, WebP, GIF).');return ids}
  for(let i=0;i<list.length;i++){toast('Caricamento foto '+(i+1)+' di '+list.length+'…');
    try{const b=await prepImage(list[i]);const type=/^image\/(png|jpeg|gif|webp)$/.test(b.type)?b.type:'image/jpeg';
      const ext={'image/png':'png','image/gif':'gif','image/webp':'webp'}[type]||'jpg';
      const path=new Date().toISOString().slice(0,7)+'/'+crypto.randomUUID()+'.'+ext;
      const up=await sb.storage.from('foto').upload(path,b,{contentType:type,cacheControl:'31536000',upsert:false});if(up.error)throw up.error;
      const row=await q(sb.from('photos').insert({path,name:list[i].name.replace(/\.[^.]+$/,''),by_id:S.me.id}).select().single());ids.push(row.id)}
    catch(e){toast(errMsg(e));break}}
  if(ids.length){toast(ids.length===1?'Foto caricata':ids.length+' foto caricate');await loadPhotos()}return ids}
function fileButton(label,onDone,cls){const inp=h('input',{type:'file',accept:'image/*',multiple:true,hidden:true,onchange:async e=>{const ids=await uploadFiles(e.target.files);e.target.value='';onDone&&onDone(ids)}});
  return h('span',null,inp,h('button',{type:'button',class:cls||'btn primary',onclick:()=>inp.click()},label))}

function renderFoto(){ensurePeople(S.photos.map(p=>p.by));
  const usedIn=pid=>S.articles.filter(a=>a.coverId===pid||(a.gallery||[]).includes(pid)||(a.body||'').includes('[foto:'+pid+']')).length;
  const drop=S.me.canWrite?h('div',{class:'drop',ondragover:e=>{e.preventDefault();e.currentTarget.classList.add('on')},ondragleave:e=>e.currentTarget.classList.remove('on'),
    ondrop:e=>{e.preventDefault();e.currentTarget.classList.remove('on');uploadFiles(e.dataTransfer.files)}},
    'Trascina qui le foto oppure ',fileButton('Carica foto',null,'btn sm')):null;
  return h('div',null,h('div',{class:'toolbar'},h('h1',null,'Archivio foto'),h('span',{class:'muted'},S.photos.length+' foto')),
    S.me.canWrite?drop:h('p',{class:'muted'},'Puoi consultare l\'archivio. Per caricare foto serve l\'invito con il permesso di modifica.'),
    S.photos.length?h('div',{class:'photogrid'},S.photos.map(p=>h('button',{class:'ph',onclick:()=>photoDetail(p.id)},h('img',{src:purl(p),alt:p.caption||'',loading:'lazy'}),
      h('div',{class:'c'},h('b',null,p.caption||p.name||'Senza didascalia'),h('span',{class:'u'},(p.credit?'Foto: '+p.credit+' · ':'')+'usata in '+usedIn(p.id)+' articoli')))))
    :h('p',{class:'muted'},'L\'archivio è vuoto. Le foto caricate qui si possono usare in tutti gli articoli, come apertura, in galleria o dentro il testo.'))}

function photoDetail(pid){const p=photoById(pid);if(!p)return;
  modal({title:'Foto',body:close=>{const cap=h('input',{id:'ph-cap',class:'search',style:'width:100%',value:p.caption||'',placeholder:'Didascalia'});
    const cr=h('input',{id:'ph-cr',class:'search',style:'width:100%',value:p.credit||'',placeholder:'Autore della foto / agenzia'});
    const canDel=S.me.isDir||p.by===S.me.id;let confirmDel=false;
    const delBtn=h('button',{class:'btn danger',onclick:async()=>{if(!confirmDel){confirmDel=true;delBtn.textContent='Conferma eliminazione';return}
      try{const d=await q(sb.from('photos').delete().eq('id',p.id).select('id'));if(!d.length)throw{code:'perm'};
        await sb.storage.from('foto').remove([p.path]);close();toast('Foto eliminata');loadPhotos()}catch(e){toast(errMsg(e))}}},'Elimina foto');
    return{body:h('div',{class:'lightbox',style:'display:grid;gap:12px'},h('img',{src:purl(p),alt:p.caption||''}),
      S.me.canWrite?h('div',{class:'row2'},h('div',{class:'field'},h('label',{for:'ph-cap'},'Didascalia'),cap),h('div',{class:'field'},h('label',{for:'ph-cr'},'Credito'),cr)):h('p',null,p.caption||'',p.credit?' · Foto: '+p.credit:''),
      h('p',{class:'muted',style:'margin:0;font-size:13px'},'Caricata da '+pname(p.by)+' '+ago(p.at)+'. Se la elimini, sparisce anche dagli articoli che la usano.')),
      foot:[canDel?delBtn:null,h('div',{class:'spacer'}),h('button',{class:'btn',onclick:close},'Chiudi'),
        S.me.canWrite?h('button',{class:'btn primary',onclick:async()=>{try{await q(sb.from('photos').update({caption:cap.value.trim(),credit:cr.value.trim()}).eq('id',p.id));close();toast('Didascalia salvata');loadPhotos()}catch(e){toast(errMsg(e))}}},'Salva'):null]}}})}
function lightbox(pid){const p=photoById(pid);if(!p)return;modal({title:p.caption||'Foto',body:close=>({body:h('div',{class:'lightbox'},h('img',{src:purl(p),alt:p.caption||''}),p.credit?h('p',{class:'muted',style:'text-align:center'},'Foto: '+p.credit):null),foot:[h('button',{class:'btn',onclick:close},'Chiudi')]})})}

function pickPhotos({multi,title,preselect,onPick}){let sel=new Set(preselect||[]);
  modal({title,body:close=>{const grid=h('div',{class:'photogrid'});
    const draw=()=>grid.replaceChildren(...(S.photos.length?S.photos.map(p=>h('button',{type:'button',class:'ph'+(sel.has(p.id)?' sel':''),'aria-pressed':String(sel.has(p.id)),onclick:()=>{
      if(multi){sel.has(p.id)?sel.delete(p.id):sel.add(p.id);draw()}else{close();onPick([p.id])}}},
      h('img',{src:purl(p),alt:p.caption||'',loading:'lazy'}),h('div',{class:'c'},h('b',null,p.caption||p.name||'Senza didascalia')))):[h('p',{class:'muted'},'L\'archivio è vuoto: carica la prima foto.')]));
    draw();
    const up=S.me.canWrite?fileButton('Carica nuove foto',ids=>{if(!ids.length)return;if(!multi){close();onPick([ids[0]]);return}ids.forEach(i=>sel.add(i));setTimeout(draw,600)},'btn'):null;
    return{body:grid,foot:[up,h('div',{class:'spacer'}),h('button',{class:'btn',onclick:close},'Annulla'),
      multi?h('button',{class:'btn primary',onclick:()=>{const order=[...(preselect||[]).filter(i=>sel.has(i)),...[...sel].filter(i=>!(preselect||[]).includes(i))];close();onPick(order)}},'Conferma'):null],redraw:draw}}})}

let modalRedraw=null;
function modal({title,small,body}){const layer=document.getElementById('layer');
  const close=()=>{layer.replaceChildren();modalRedraw=null;document.removeEventListener('keydown',esc)};
  const esc=e=>{if(e.key==='Escape')close()};document.addEventListener('keydown',esc);
  const r=body(close);modalRedraw=r.redraw||null;
  const m=h('div',{class:'modal'+(small?' small':''),role:'dialog','aria-modal':'true','aria-label':title},
    h('header',null,h('h2',null,title),h('button',{class:'btn ghost sm','aria-label':'Chiudi',onclick:close},'✕')),h('div',{class:'body'},r.body),r.foot?h('footer',null,r.foot):null);
  layer.replaceChildren(h('div',{class:'overlay',onclick:e=>{if(e.target===e.currentTarget)close()}},m))}

/* ---------- appunti: blocco note condiviso ---------- */
const AP_KINDS={promemoria:{l:'Promemoria',c:'var(--s-correggere)',ph:'Es. Ricordiamoci di chiedere le foto all\'ufficio stampa'},
  notizia:{l:'Notizia',c:'var(--s-accent)',ph:'Es. Apre un nuovo locale in centro sabato: vale un pezzo?'},
  intervista:{l:'Intervista',c:'var(--s-pubblicato)',ph:'Es. Intervista al sindaco confermata per giovedì alle 11'},
  idea:{l:'Idea',c:'var(--s-pronto)',ph:'Es. Rubrica settimanale sui ristoranti della città'}};
async function loadAppunti(){const d=await q(sb.from('appunti').select('*').order('created_at',{ascending:false}).limit(500));
  S.appunti=d.map(r=>({id:r.id,kind:r.kind,text:r.text,link:r.link,testata:r.testata,done:r.done,by:r.by_id,at:ms(r.created_at),articleId:r.article_id}));render()}
function apInView(a){return S.testata==='tutte'||!a.testata||a.testata===S.testata}
function renderAppunti(){const all=S.appunti.filter(apInView);
  const list=all.filter(a=>(S.apFilter==='tutti'||a.kind===S.apFilter)&&(!S.apHideDone||!a.done));
  const top=h('div',{class:'toolbar'},h('h1',null,'Appunti'),h('span',{class:'muted'},all.filter(a=>!a.done).length+' da fare · '+all.filter(a=>a.done).length+' fatti'));
  const intro=h('p',{class:'muted',style:'margin:-6px 0 16px;max-width:70ch'},'Il blocco note della redazione: promemoria, notizie da seguire, interviste, idee. Tutti leggono tutto; quando un appunto diventa un pezzo, trasformalo in articolo con un tocco.');
  const ta=h('textarea',{id:'ap-text',placeholder:AP_KINDS[S.apKind].ph,style:'width:100%;min-height:90px;border:1px solid var(--rule);background:var(--paper);color:var(--ink);border-radius:8px;padding:10px;resize:vertical'});
  const link=h('input',{id:'ap-link',class:'quote',type:'url',placeholder:'Link utile (facoltativo)',style:'width:100%;margin-top:8px'});
  const keep=()=>({t:ta.value,l:link.value});const restore=k=>{const t=document.getElementById('ap-text'),l=document.getElementById('ap-link');if(t){t.value=k.t;t.focus()}if(l)l.value=k.l};
  const kinds=h('div',{class:'kinds',role:'group','aria-label':'Tipo di appunto'},Object.entries(AP_KINDS).map(([k,v])=>h('button',{type:'button',style:'--k:'+v.c,'aria-pressed':String(S.apKind===k),onclick:()=>{const kk=keep();S.apKind=k;render();restore(kk)}},v.l)));
  const tsel=h('div',{class:'tseg',role:'group','aria-label':'Per quale testata'},[[null,'Entrambe'],['fuxia','Fuxia'],['rnv','RNV']].map(([k,l])=>h('button',{type:'button',class:k?'t-'+k:'','aria-pressed':String(S.apTestata===k),onclick:()=>{const kk=keep();S.apTestata=k;render();restore(kk)}},l)));
  async function add(){const text=ta.value.trim();if(!text){ta.focus();return}
    try{await q(sb.from('appunti').insert({kind:S.apKind,text,link:link.value.trim(),testata:S.apTestata,by_id:S.me.id}));ta.value='';link.value='';toast('Appunto aggiunto');loadAppunti()}catch(e){toast(errMsg(e))}}
  const composer=S.me.canWrite?h('section',{class:'panel',style:'margin-bottom:18px'},h('h2',null,'Nuovo appunto'),
    h('div',{class:'composer'},kinds,ta,link,h('div',{class:'row'},h('div',{class:'filt',style:'gap:8px'},h('span',null,'Testata'),tsel),h('button',{class:'btn primary sm',onclick:add},'Aggiungi')))):null;
  const chips=h('div',{class:'chips',role:'group','aria-label':'Filtra'},
    h('button',{'aria-pressed':String(S.apFilter==='tutti'),onclick:()=>{S.apFilter='tutti';render()}},'Tutti ',h('i',null,all.length)),
    Object.entries(AP_KINDS).map(([k,v])=>h('button',{style:'--c:'+v.c,'aria-pressed':String(S.apFilter===k),onclick:()=>{S.apFilter=S.apFilter===k?'tutti':k;render()}},v.l,' ',h('i',null,all.filter(a=>a.kind===k).length))),
    h('label',{class:'chk',style:'margin-left:auto'},h('input',{id:'ap-hide',type:'checkbox',checked:S.apHideDone||null,onchange:e=>{S.apHideDone=e.target.checked;render()}}),'Nascondi i fatti'));
  return h('div',null,top,intro,composer,chips,list.length?h('div',{class:'aplist'},list.map(apCard)):h('p',{class:'muted'},all.length?'Nessun appunto con questi filtri.':'Ancora nessun appunto. Scrivi il primo qui sopra.'))}
function apCanEdit(a){return S.me.canWrite&&(a.by===S.me.id||S.me.isDir)}
function apEditForm(a){const d=S.apDraft;const k=AP_KINDS[d.kind]||AP_KINDS.promemoria;
  const save=async()=>{const text=d.text.trim();if(!text){toast('L\'appunto non può essere vuoto.');return}
    try{const r=await q(sb.from('appunti').update({kind:d.kind,text,link:d.link.trim(),testata:d.testata}).eq('id',a.id).select('id'));if(!r.length)throw{code:'perm'};
      S.apEditing=null;S.apDraft=null;toast('Appunto modificato');loadAppunti()}catch(e){toast(errMsg(e))}};
  return h('article',{class:'appunto editing',style:'--k:'+k.c},
    h('div',{class:'kinds',role:'group','aria-label':'Tipo di appunto'},Object.entries(AP_KINDS).map(([kk,v])=>h('button',{type:'button',style:'--k:'+v.c,'aria-pressed':String(d.kind===kk),onclick:()=>{d.kind=kk;render()}},v.l))),
    h('textarea',{id:'ap-edit-text','aria-label':'Testo dell\'appunto',value:d.text,oninput:e=>{d.text=e.target.value},style:'width:100%;min-height:110px;border:1px solid var(--rule);background:var(--paper);color:var(--ink);border-radius:8px;padding:10px;resize:vertical;font:inherit'}),
    h('input',{id:'ap-edit-link',class:'quote',type:'url','aria-label':'Link',placeholder:'Link utile (facoltativo)',value:d.link,oninput:e=>{d.link=e.target.value},style:'width:100%'}),
    h('div',{class:'filt',style:'gap:8px;flex-wrap:wrap'},h('span',null,'Testata'),h('div',{class:'tseg',role:'group','aria-label':'Testata'},[[null,'Entrambe'],['fuxia','Fuxia'],['rnv','RNV']].map(([kk,l])=>h('button',{type:'button',class:kk?'t-'+kk:'','aria-pressed':String(d.testata===kk),onclick:()=>{d.testata=kk;render()}},l)))),
    h('div',{class:'ops'},h('button',{class:'btn primary sm',onclick:save},'Salva'),h('button',{class:'btn sm',onclick:()=>{S.apEditing=null;S.apDraft=null;render()}},'Annulla')))}
function apCard(a){if(S.apEditing===a.id&&S.apDraft)return apEditForm(a);const k=AP_KINDS[a.kind]||AP_KINDS.promemoria;const mine=a.by===S.me.id;
  const act=p=>p.then(r=>{if(r&&r.error)throw r.error;loadAppunti()}).catch(e=>toast(errMsg(e)));
  const art=a.articleId&&S.articles.find(x=>x.id===a.articleId);
  return h('article',{class:'appunto'+(a.done?' done':''),style:'--k:'+k.c},
    h('div',{class:'h'},h('span',{class:'kind'},k.l),a.testata?tchip(a.testata):null,avatar(a.by),h('b',null,pname(a.by)),h('span',null,ago(a.at))),
    h('div',{class:'txt'},a.text),
    a.link?h('a',{class:'aplink',href:/^https?:\/\//i.test(a.link)?a.link:'https://'+a.link,target:'_blank',rel:'noopener'},a.link):null,
    S.me.canWrite?h('div',{class:'ops'},
      h('button',{class:'btn sm',onclick:()=>act(sb.from('appunti').update({done:!a.done}).eq('id',a.id))},a.done?'Riapri':'✓ Fatto'),
      art?h('button',{class:'btn sm',onclick:()=>go('articolo',art.id)},'Apri l\'articolo'):h('button',{class:'btn sm',onclick:()=>apToArticle(a)},'Trasforma in articolo'),
      apCanEdit(a)?h('button',{class:'btn sm',onclick:()=>{S.apEditing=a.id;S.apDraft={kind:a.kind,text:a.text,link:a.link||'',testata:a.testata||null};render();setTimeout(()=>{const t=document.getElementById('ap-edit-text');t&&t.focus()},0)}},'✎ Modifica'):null,
      h('div',{class:'spacer'}),
      mine||S.me.isDir?h('button',{class:'btn sm ghost',onclick:()=>act(sb.from('appunti').delete().eq('id',a.id))},'Elimina'):null):null)}
async function apToArticle(a){let t=a.testata||(S.testata!=='tutte'?S.testata:null);
  if(!t){modal({title:'Per quale testata?',small:true,body:close=>({body:h('div',{class:'tpick'},TK.map(k=>h('button',{type:'button',onclick:()=>{close();a.testata=k;apToArticle(a)}},h('img',{src:TESTATE[k].logo,alt:''}),TESTATE[k].name))),foot:[h('button',{class:'btn',onclick:close},'Annulla')]})});return}
  const first=a.text.split('\n')[0].trim();const now=Date.now();
  try{const row=await q(sb.from('articles').insert({testata:t,title:first.length<=120?first:first.slice(0,117)+'…',body:a.text+(a.link?'\n\nFonte: '+a.link:''),author_id:S.me.id,updated_by:S.me.id,history:[{s:'bozza',by:S.me.id,at:now}]}).select().single());
    await q(sb.from('appunti').update({article_id:row.id}).eq('id',a.id));
    const art=artFromRow(row);S.articles=[art,...S.articles.filter(x=>x.id!==art.id)];toast('Bozza creata dall\'appunto');go('articolo',art.id);startEdit(art);loadAppunti()}
  catch(e){toast(errMsg(e))}}

/* ---------- rubrica: contatti condivisi ---------- */
const CF=[['name','Nome e cognome','text','name'],['role','Ruolo o qualifica','text','organization-title'],['org','Ente, azienda o testata','text','organization'],
  ['phone','Telefono','tel','tel'],['phone2','Altro telefono','tel','tel'],['email','Email','email','email'],['website','Sito web','url','url'],
  ['instagram','Instagram','text',''],['facebook','Facebook','text',''],['x','X (Twitter)','text',''],['address','Indirizzo','text','street-address'],['notes','Note','textarea','']];
async function loadContatti(){const d=await q(sb.from('contatti').select('*').order('name'));S.contatti=d;render()}
function socialUrl(kind,v){v=String(v||'').trim();if(!v)return'';if(/^https?:\/\//i.test(v))return v;
  if(/^(www\.)?(instagram|facebook|x|twitter)\.com\//i.test(v))return'https://'+v;
  const hnd=v.replace(/^@/,'');return{instagram:'https://instagram.com/',facebook:'https://facebook.com/',x:'https://x.com/'}[kind]+encodeURIComponent(hnd)}
function webUrl(v){v=String(v||'').trim();return!v?'':/^https?:\/\//i.test(v)?v:'https://'+v}
const telHref=v=>'tel:'+String(v).replace(/[^\d+]/g,'');
function cLinks(c){const L=[];
  if(c.phone)L.push(h('a',{class:'clink',href:telHref(c.phone)},'📞 ',c.phone));
  if(c.phone2)L.push(h('a',{class:'clink',href:telHref(c.phone2)},'📞 ',c.phone2));
  if(c.email)L.push(h('a',{class:'clink',href:'mailto:'+c.email},'✉ ',c.email));
  if(c.website)L.push(h('a',{class:'clink',href:webUrl(c.website),target:'_blank',rel:'noopener'},'🌐 Sito'));
  if(c.instagram)L.push(h('a',{class:'clink',href:socialUrl('instagram',c.instagram),target:'_blank',rel:'noopener'},'Instagram'));
  if(c.facebook)L.push(h('a',{class:'clink',href:socialUrl('facebook',c.facebook),target:'_blank',rel:'noopener'},'Facebook'));
  if(c.x)L.push(h('a',{class:'clink',href:socialUrl('x',c.x),target:'_blank',rel:'noopener'},'X'));
  if(c.address)L.push(h('a',{class:'clink',href:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(c.address),target:'_blank',rel:'noopener'},'📍 Mappa'));
  return L}
function renderRubrica(){const qq=S.rbQ.trim().toLowerCase();
  const list=S.contatti.filter(c=>!qq||CF.some(([k])=>String(c[k]||'').toLowerCase().includes(qq)));
  const top=h('div',{class:'toolbar'},h('h1',null,'Rubrica'),h('span',{class:'muted'},S.contatti.length+' contatti'),h('div',{class:'spacer'}),
    h('input',{id:'rb-cerca',class:'search',type:'search',placeholder:'Cerca nome, ente, telefono…',value:S.rbQ,oninput:e=>{S.rbQ=e.target.value;render()}}),
    S.me.canWrite?h('button',{class:'btn primary',onclick:()=>contactModal(null)},'＋ Nuovo contatto'):null);
  if(!S.contatti.length)return h('div',null,top,h('div',{class:'empty-state'},h('div',null,h('h2',null,'La rubrica è vuota'),
    h('p',{class:'muted'},'Qui la redazione raccoglie i contatti utili: uffici stampa, artisti, locali, fonti. Ognuno con telefono, email, social, indirizzo e note.'),
    S.me.canWrite?h('button',{class:'btn primary',onclick:()=>contactModal(null)},'＋ Aggiungi il primo contatto'):null)));
  const groups={};for(const c of list){const L=(c.name||'?').trim().charAt(0).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');(groups[/[A-Z]/.test(L)?L:'#']=groups[/[A-Z]/.test(L)?L:'#']||[]).push(c)}
  return h('div',null,top,list.length?Object.keys(groups).sort().map(L=>h('section',{class:'rbgroup'},h('div',{class:'rbletter'},L),h('div',{class:'rblist'},groups[L].map(contactCard))))
    :h('p',{class:'muted'},'Nessun contatto trovato.'))}
function contactCard(c){const sub=[c.role,c.org].filter(Boolean).join(' · ');
  return h('article',{class:'contact'},
    h('button',{class:'chead',onclick:()=>contactModal(c),'aria-label':'Apri '+(c.name||'contatto')},h('span',{class:'av ini',style:'background:'+colorFor(c.id)},initials(c.name)),
      h('span',{class:'cname'},h('b',null,c.name||'Senza nome'),sub?h('span',null,sub):null)),
    h('div',{class:'clinks'},cLinks(c)),
    c.notes?h('div',{class:'cnotes'},c.notes):null)}
function contactModal(c){const edit=S.me.canWrite;const d=Object.assign({},c||{});
  modal({title:c?(edit?'Modifica contatto':c.name):'Nuovo contatto',body:close=>{
    const fields=CF.map(([k,l,t,ac])=>{const id='c-'+k;const inp=t==='textarea'?h('textarea',{id,value:d[k]||'',rows:'4',oninput:e=>{d[k]=e.target.value},style:'width:100%;resize:vertical'})
      :h('input',{id,type:t,value:d[k]||'',autocomplete:ac||'off',placeholder:k==='instagram'||k==='facebook'||k==='x'?'@nome oppure link':'',oninput:e=>{d[k]=e.target.value}});
      if(!edit)inp.setAttribute('readonly','');return h('div',{class:'field'+(k==='notes'||k==='address'?' wide':'')},h('label',{for:id},l),inp)});
    const canDel=c&&(S.me.isDir||c.by_id===S.me.id);let armed=false;
    const del=canDel?h('button',{class:'btn danger',onclick:async()=>{if(!armed){armed=true;del.textContent='Conferma eliminazione';return}
      try{const r=await q(sb.from('contatti').delete().eq('id',c.id).select('id'));if(!r.length)throw{code:'perm'};close();toast('Contatto eliminato');loadContatti()}catch(e){toast(errMsg(e))}}},'Elimina'):null;
    const save=async()=>{const row={};for(const[k]of CF)row[k]=String(d[k]||'').trim();if(!row.name){toast('Scrivi almeno il nome.');document.getElementById('c-name').focus();return}
      row.updated_at=new Date().toISOString();
      try{if(c){const r=await q(sb.from('contatti').update(row).eq('id',c.id).select('id'));if(!r.length)throw{code:'perm'}}
        else await q(sb.from('contatti').insert({...row,by_id:S.me.id}));close();toast(c?'Contatto aggiornato':'Contatto aggiunto');loadContatti()}catch(e){toast(errMsg(e))}};
    return{body:h('div',null,c?h('div',{class:'clinks',style:'margin-bottom:14px'},cLinks(c)):null,h('div',{class:'cform'},fields),
      c?h('p',{class:'muted',style:'font-size:12px;margin:12px 0 0'},'Aggiunto da '+pname(c.by_id)+(c.updated_at?' · aggiornato '+ago(ms(c.updated_at)):'')):null),
      foot:[del,h('div',{class:'spacer'}),h('button',{class:'btn',onclick:close},edit?'Annulla':'Chiudi'),edit?h('button',{class:'btn primary',onclick:save},'Salva'):null]}}})
  if(!c)setTimeout(()=>{const n=document.getElementById('c-name');n&&n.focus()},30)}

/* ---------- avvio ---------- */
async function boot(){
  const r=parseHash();S.view=r.view;S.current=r.id;
  try{const t=localStorage.getItem('redazione.testata');if(t&&(t==='tutte'||TESTATE[t]))S.testata=t}catch(e){}
  if(!window.CONFIG||!CONFIG.SUPABASE_URL||!CONFIG.SUPABASE_ANON_KEY){showSetup();return}
  if(/type=recovery/.test(location.hash))S.authMode='newpass';
  sb=supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'){S.authMode='newpass';showAuth();return}
    if(event==='SIGNED_OUT'){location.hash='';location.reload();return}
    if(session&&session.user&&S.me.id!==session.user.id&&S.authMode!=='newpass')setTimeout(()=>start(session.user),0)});
  const {data}=await sb.auth.getSession();
  if(S.authMode==='newpass')showAuth();else if(data.session)start(data.session.user);else showAuth();
}
window.addEventListener('popstate',()=>{if(!S.started)return;const r=parseHash();go(r.view,r.id,true)});
window.addEventListener('pagehide',()=>{if(S.editing)flushSave()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S.started&&S.me.canRead)reloadAll()});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();S.installEvt=e});
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
boot();
