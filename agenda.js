'use strict';
/* =====================================================================
   Agenda della redazione e pagina "Oggi".
   Usa le funzioni di app.js: h, S, sb, q, go, render, modal, toast, errMsg,
   avatar, pname, tchip, TK, TESTATE, STATO, dueChip, byName, ms, later, inT.
   ===================================================================== */

const AK={
  telefonata:{l:'Telefonata',c:'#2f6fd1'},
  intervista:{l:'Intervista',c:'#ec009c'},
  riunione:{l:'Riunione',c:'#6a3fd0'},
  incontro:{l:'Incontro',c:'#0f8b8d'},
  scadenza:{l:'Scadenza',c:'#d2560e'},
  altro:{l:'Altro',c:'#7d6b75'}};
const AST={da_fare:'Da fare',completato:'Completato',rinviato:'Rinviato',annullato:'Annullato'};
const AVIS={tutti:'Tutta la redazione',direzione:'Solo direzione',privato:'Solo me e l\'assegnato'};
const AREP={no:'Non si ripete',giorno:'Ogni giorno',settimana:'Ogni settimana',mese:'Ogni mese'};
const AREM=[[null,'Nessun promemoria'],[0,'All\'ora esatta'],[10,'10 minuti prima'],[30,'30 minuti prima'],[60,'1 ora prima'],[120,'2 ore prima'],[1440,'1 giorno prima'],[2880,'2 giorni prima']];
const GIORNI=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];

/* ---------- date ---------- */
const p2=n=>String(n).padStart(2,'0');
const dkey=d=>d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());
const fromKey=k=>{const[y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
const sod=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const addDays=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n,d.getHours(),d.getMinutes());
const hhmm=t=>{const d=new Date(t);return p2(d.getHours())+':'+p2(d.getMinutes())};
const weekStart=d=>{const s=sod(d);return addDays(s,-((s.getDay()+6)%7))};
const longDay=d=>d.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
function addMonthsKeep(base,n){const y=base.getFullYear(),m=base.getMonth()+n,day=base.getDate();
  const last=new Date(y,m+1,0).getDate();return new Date(y,m,Math.min(day,last),base.getHours(),base.getMinutes())}

/* Tutte le volte in cui un appuntamento cade tra from e to (Date, to escluso). */
function occurrences(a,from,to){
  const out=[];const start=new Date(a.start);
  const until=a.until?addDays(fromKey(a.until),1):null;
  const push=d=>{if(d>=from&&d<to&&(!until||d<until)){const k=dkey(d);
    out.push({a,at:d.getTime(),key:k,done:a.status==='completato'||a.doneDates.includes(k),cancelled:a.status==='annullato'})}};
  if(a.repeat==='no'){push(start);return out}
  if(a.repeat==='giorno'||a.repeat==='settimana'){const step=a.repeat==='giorno'?1:7;
    let n=Math.max(0,Math.floor((sod(from)-sod(start))/864e5/step)-1);
    for(let i=0;i<800;i++,n++){const d=addDays(start,n*step);if(d>=to||(until&&d>=until))break;push(d)}
    return out}
  let n=Math.max(0,(from.getFullYear()-start.getFullYear())*12+from.getMonth()-start.getMonth()-1);
  for(let i=0;i<400;i++,n++){const d=addMonthsKeep(start,n);if(d>=to||(until&&d>=until))break;push(d)}
  return out}
function apInScope(a){return(S.testata==='tutte'||!a.testata||a.testata===S.testata)&&(!S.agMine||a.assignee===S.me.id||a.by===S.me.id)}
function occBetween(from,to,list){const out=[];for(const a of(list||S.appt).filter(apInScope))out.push(...occurrences(a,from,to));
  return out.sort((x,y)=>(x.a.allDay===y.a.allDay?0:x.a.allDay?-1:1)||x.at-y.at)}

/* ---------- dati ---------- */
function apFromRow(r){return{id:r.id,kind:r.kind,title:r.title,start:ms(r.starts_at),allDay:r.all_day,remind:r.remind_min,notes:r.notes,
  contactId:r.contact_id,articleId:r.article_id,assignee:r.assignee_id,by:r.created_by,vis:r.visibility,status:r.status,
  repeat:r.repeat,until:r.repeat_until,doneDates:r.done_dates||[],testata:r.testata}}
async function loadAppt(){const d=await q(sb.from('appuntamenti').select('*').order('starts_at'));S.appt=d.map(apFromRow);render()}
const contactById=id=>id&&S.contatti.find(c=>c.id===id);
const articleById=id=>id&&S.articles.find(a=>a.id===id);
function apTitle(a){if(a.title)return a.title;const c=contactById(a.contactId);return AK[a.kind].l+(c?' con '+c.name:'')}

/* ---------- elementi riutilizzabili ---------- */
function occItem(o,opts={}){const a=o.a;const k=AK[a.kind]||AK.altro;const c=contactById(a.contactId);const art=articleById(a.articleId);
  const late=!o.done&&!o.cancelled&&(a.allDay?o.key<dkey(new Date()):o.at<Date.now());
  const when=a.allDay?(a.kind==='scadenza'?'In giornata':'Tutto il giorno'):hhmm(o.at);
  return h('button',{class:'occ'+(o.done?' done':'')+(o.cancelled?' cancelled':'')+(late?' late':''),style:'--k:'+k.c,onclick:()=>apptModal(a,o.key)},
    h('span',{class:'occ-when mono'},opts.showDay?cap(new Date(o.at).toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'}))+(a.allDay?'':' · '+hhmm(o.at)):when),
    h('span',{class:'occ-main'},h('span',{class:'occ-kind'},k.l,a.repeat!=='no'?' · '+AREP[a.repeat].toLowerCase():''),
      h('b',null,apTitle(a)),
      (c||art)?h('span',{class:'occ-sub'},[c?c.name+(c.phone?' · '+c.phone:''):null,art?'Articolo: '+(art.title||'Senza titolo'):null].filter(Boolean).join(' — ')):null),
    h('span',{class:'occ-side'},a.testata&&S.testata==='tutte'?tchip(a.testata):null,
      o.done?h('span',{class:'ast ok'},'Fatto'):o.cancelled?h('span',{class:'ast no'},'Annullato'):a.status==='rinviato'?h('span',{class:'ast mv'},'Rinviato'):late?h('span',{class:'ast late'},'In ritardo'):null,
      a.vis!=='tutti'?h('span',{class:'ast lock',title:AVIS[a.vis]},a.vis==='direzione'?'Direzione':'Privato'):null,
      a.assignee?avatar(a.assignee):null))}

/* ---------- vista Agenda ---------- */
function renderAgenda(){const mode=S.agMode||'settimana';const ref=S.agDate?fromKey(S.agDate):sod(new Date());
  const move=n=>{let d;if(mode==='giorno')d=addDays(ref,n);else if(mode==='settimana')d=addDays(ref,7*n);else d=new Date(ref.getFullYear(),ref.getMonth()+n,1);S.agDate=dkey(d);render()};
  let title;
  if(mode==='giorno')title=cap(longDay(ref));
  else if(mode==='settimana'){const a=weekStart(ref),b=addDays(a,6);title=a.getDate()+(a.getMonth()!==b.getMonth()?' '+a.toLocaleDateString('it-IT',{month:'short'}):'')+' – '+b.getDate()+' '+b.toLocaleDateString('it-IT',{month:'long',year:'numeric'})}
  else title=cap(ref.toLocaleDateString('it-IT',{month:'long',year:'numeric'}));
  const top=h('div',{class:'toolbar'},h('h1',null,'Agenda'),h('div',{class:'spacer'}),
    S.me.canWrite?h('button',{class:'btn primary',onclick:()=>apptModal(null,null,{day:mode==='giorno'?dkey(ref):null})},'＋ Nuovo appuntamento'):null);
  const bar=h('div',{class:'agbar'},
    h('div',{class:'tseg agseg',role:'group','aria-label':'Vista'},[['giorno','Giorno'],['settimana','Settimana'],['mese','Mese']].map(([k,l])=>h('button',{'aria-pressed':String(mode===k),onclick:()=>{S.agMode=k;render()}},l))),
    h('div',{class:'agnav'},h('button',{class:'btn sm','aria-label':'Precedente',onclick:()=>move(-1)},'‹'),h('button',{class:'btn sm',onclick:()=>{S.agDate=null;render()}},'Oggi'),h('button',{class:'btn sm','aria-label':'Successivo',onclick:()=>move(1)},'›')),
    h('b',{class:'agtitle'},title),
    h('label',{class:'chk'},h('input',{id:'ag-mine',type:'checkbox',checked:S.agMine||null,onchange:e=>{S.agMine=e.target.checked;render()}}),'Solo i miei'));
  let body;
  if(mode==='giorno'){const list=occBetween(ref,addDays(ref,1));
    body=h('section',{class:'panel agday'},list.length?h('div',{class:'occlist'},list.map(o=>occItem(o))):h('p',{class:'muted',style:'margin:0'},'Nessun impegno in questo giorno.'))}
  else if(mode==='settimana'){const a=weekStart(ref);const today=dkey(new Date());
    body=h('div',{class:'agweek'},[0,1,2,3,4,5,6].map(i=>{const d=addDays(a,i);const list=occBetween(d,addDays(d,1));
      return h('section',{class:'agcol'+(dkey(d)===today?' today':'')},
        h('button',{class:'agcol-h',onclick:()=>{S.agMode='giorno';S.agDate=dkey(d);render()}},h('span',null,GIORNI[i]),h('b',null,d.getDate())),
        list.length?h('div',{class:'occlist'},list.map(o=>occItem(o))):h('p',{class:'muted agempty'},'—'),
        S.me.canWrite?h('button',{class:'agadd','aria-label':'Aggiungi il '+longDay(d),onclick:()=>apptModal(null,null,{day:dkey(d)})},'＋'):null)}))}
  else{const first=new Date(ref.getFullYear(),ref.getMonth(),1);const g0=weekStart(first);const today=dkey(new Date());
    const end=addDays(weekStart(new Date(ref.getFullYear(),ref.getMonth()+1,0)),7);const all=occBetween(g0,end);
    const cells=[];for(let d=g0;d<end;d=addDays(d,1)){const k=dkey(d);const list=all.filter(o=>o.key===k);
      cells.push(h('button',{class:'agcell'+(d.getMonth()!==ref.getMonth()?' out':'')+(k===today?' today':''),onclick:()=>{S.agMode='giorno';S.agDate=k;render()},'aria-label':longDay(d)+(list.length?', '+list.length+' impegni':'')},
        h('span',{class:'agnum'},d.getDate()),
        h('span',{class:'agdots'},list.slice(0,3).map(o=>h('span',{class:'agchip'+(o.done||o.cancelled?' done':''),style:'--k:'+AK[o.a.kind].c},(o.a.allDay?'':hhmm(o.at)+' ')+apTitle(o.a))),
          list.length>3?h('span',{class:'agmore'},'+'+(list.length-3)):null)))}
    body=h('div',{class:'agmonth'},GIORNI.map(g=>h('div',{class:'aghead'},g)),cells)}
  const legend=h('div',{class:'aglegend'},Object.values(AK).map(k=>h('span',{style:'--k:'+k.c},k.l)));
  return h('div',null,top,bar,body,legend)}

/* ---------- modulo appuntamento ---------- */
// Per gli impegni senza orario il promemoria si calcola rispetto alle 9:00 di quel giorno.
function remLabel(v,l,allDay){if(!allDay||v==null)return l;if(v===0)return'Alle 9:00 del giorno';if(v<1440)return l.replace('prima','prima delle 9:00');return l.replace('prima','prima, alle 9:00')}
function remindAt(start,allDay,remind){if(remind==null)return null;const base=allDay?new Date(start).setHours(9,0,0,0):start;return base-remind*60000}
function apptModal(a,occKey,preset){preset=preset||{};const edit=S.me.canWrite;const isNew=!a;
  const st=a?new Date(a.start):null;
  const d={kind:a?a.kind:(preset.kind||'telefonata'),title:a?a.title:'',day:a?dkey(st):(preset.day||dkey(new Date())),time:a&&!a.allDay?hhmm(a.start):(preset.time||'15:00'),
    allDay:a?a.allDay:false,remind:a?a.remind:30,notes:a?a.notes:'',contactId:a?a.contactId:(preset.contactId||null),articleId:a?a.articleId:(preset.articleId||null),
    assignee:a?a.assignee:S.me.id,vis:a?a.vis:'tutti',status:a?a.status:'da_fare',repeat:a?a.repeat:'no',until:a?a.until||'':'',testata:a?a.testata:(preset.testata||(S.testata!=='tutte'?S.testata:null))};
  modal({title:isNew?'Nuovo appuntamento':(edit?'Appuntamento':apTitle(a)),body:close=>{
    const wrap=h('div',{class:'apform'});
    const seg=(name,opts,val,set,dis)=>h('div',{class:'tseg agseg wrap',role:'group','aria-label':name},opts.map(([k,l])=>h('button',{type:'button','aria-pressed':String(val===k),disabled:(dis&&dis(k))||null,onclick:()=>{set(k);draw()}},l)));
    const field=(id,label,el,wide)=>h('div',{class:'field'+(wide?' wide':'')},h('label',{for:id},label),el);
    const contacts=[...S.contatti].sort((x,y)=>x.name.localeCompare(y.name));
    const arts=S.articles.filter(x=>x.status!=='pubblicato'||x.id===d.articleId);
    const team=S.team.filter(p=>p.role==='redattore'||p.role==='direttore');
    let draw=function(){const ro=!edit;
      wrap.replaceChildren(
        h('div',{class:'field wide'},h('label',null,'Tipo'),seg('Tipo',Object.entries(AK).map(([k,v])=>[k,v.l]),d.kind,v=>{d.kind=v;if(v==='scadenza'&&isNew)d.allDay=true})),
        field('ap-title','Titolo (facoltativo)',h('input',{id:'ap-title',value:d.title,placeholder:'Es. Intervista telefonica con l\'artista',oninput:e=>{d.title=e.target.value},readonly:ro||null}),true),
        field('ap-day',d.kind==='scadenza'?'Entro il giorno':'Giorno',h('input',{id:'ap-day',type:'date',value:d.day,onchange:e=>{d.day=e.target.value},readonly:ro||null})),
        h('div',{class:'field'},h('label',{for:'ap-time'},'Ora'),
          h('div',{class:'inline'},h('input',{id:'ap-time',type:'time',value:d.time,disabled:d.allDay||null,onchange:e=>{d.time=e.target.value},readonly:ro||null}),
            h('label',{class:'chk'},h('input',{id:'ap-allday',type:'checkbox',checked:d.allDay||null,disabled:ro||null,onchange:e=>{d.allDay=e.target.checked;draw()}}),'Senza orario'))),
        field('ap-remind','Promemoria',h('select',{id:'ap-remind',disabled:ro||null,onchange:e=>{d.remind=e.target.value===''?null:Number(e.target.value)}},
          AREM.map(([v,l])=>h('option',{value:v==null?'':String(v),selected:(d.remind==null?v==null:d.remind===v)||null},remLabel(v,l,d.allDay))))),
        field('ap-contact','Contatto in Rubrica',h('select',{id:'ap-contact',disabled:ro||null,onchange:e=>{d.contactId=e.target.value||null;callSlot.replaceChildren(callBox()||'')}},h('option',{value:''},'— Nessuno —'),
          contacts.map(c=>h('option',{value:c.id,selected:c.id===d.contactId||null},c.name+(c.org?' · '+c.org:''))))),
        field('ap-art','Articolo collegato',h('select',{id:'ap-art',disabled:ro||null,onchange:e=>{d.articleId=e.target.value||null}},h('option',{value:''},'— Nessuno —'),
          arts.map(x=>h('option',{value:x.id,selected:x.id===d.articleId||null},(x.title||'Senza titolo')+' · '+TESTATE[tOf(x)].short)))),
        field('ap-who','Assegnato a',h('select',{id:'ap-who',disabled:ro||null,onchange:e=>{d.assignee=e.target.value||null}},h('option',{value:''},'— Nessuno —'),
          team.map(p=>h('option',{value:p.id,selected:p.id===d.assignee||null},p.name+(p.id===S.me.id?' (tu)':''))))),
        field('ap-testata','Testata',h('select',{id:'ap-testata',disabled:ro||null,onchange:e=>{d.testata=e.target.value||null}},
          [['','Tutte'],['fuxia','Fuxia'],['rnv','RNV'],['ch1','1Channel']].map(([v,l])=>h('option',{value:v,selected:(d.testata||'')===v||null},l)))),
        h('div',{class:'field wide'},h('label',null,'Chi lo vede'),seg('Chi lo vede',Object.entries(AVIS),d.vis,v=>{d.vis=v},k=>ro||(k==='direzione'&&!S.me.isDir))),
        field('ap-rep','Ripetizione',h('select',{id:'ap-rep',disabled:ro||null,onchange:e=>{d.repeat=e.target.value;draw()}},Object.entries(AREP).map(([k,l])=>h('option',{value:k,selected:d.repeat===k||null},l)))),
        d.repeat!=='no'?field('ap-until','Fino al (facoltativo)',h('input',{id:'ap-until',type:'date',value:d.until,onchange:e=>{d.until=e.target.value},readonly:ro||null})):h('div'),
        isNew?null:h('div',{class:'field wide'},h('label',null,'Stato'),seg('Stato',Object.entries(AST),d.status,v=>{d.status=v},()=>ro),
          d.status==='rinviato'?h('p',{class:'muted',style:'margin:6px 0 0;font-size:13px'},'Ricordati di cambiare giorno e ora qui sopra con la nuova data.'):null),
        field('ap-notes','Note',h('textarea',{id:'ap-notes',rows:'4',value:d.notes,placeholder:'Argomenti da trattare, domande, numeri utili, dettagli dell\'incontro…',oninput:e=>{d.notes=e.target.value},readonly:ro||null,style:'width:100%;resize:vertical'}),true),
        a?h('p',{class:'muted wide',style:'font-size:12px;margin:0'},'Creato da '+pname(a.by)+(a.vis!=='tutti'?' · visibile: '+AVIS[a.vis].toLowerCase():'')):null)};
    const callBox=()=>{const c=contactById(d.contactId);if(!c||!(c.phone||c.phone2||c.email))return null;
      return h('div',{class:'clinks',style:'margin-bottom:12px'},h('span',{class:'muted',style:'font-size:13px;align-self:center'},c.name+':'),
        c.phone?h('a',{class:'clink call',href:telHref(c.phone)},'📞 Chiama ',c.phone):null,c.phone2?h('a',{class:'clink call',href:telHref(c.phone2)},'📞 ',c.phone2):null,
        c.email?h('a',{class:'clink',href:'mailto:'+c.email},'✉ ',c.email):null)};
    const callSlot=h('div');const _draw=draw;draw=function(){_draw();callSlot.replaceChildren(callBox()||'')};
    draw();
    function row(){const [y,m,dd]=d.day.split('-').map(Number);const[hh,mi]=(d.allDay?'09:00':d.time||'09:00').split(':').map(Number);
      return{kind:d.kind,title:d.title.trim(),starts_at:new Date(y,m-1,dd,d.allDay?0:hh,d.allDay?0:mi).toISOString(),all_day:d.allDay,remind_min:d.remind,notes:d.notes.trim(),
        contact_id:d.contactId,article_id:d.articleId,assignee_id:d.assignee,visibility:d.vis,status:d.status,repeat:d.repeat,repeat_until:d.repeat!=='no'&&d.until?d.until:null,testata:d.testata,updated_at:new Date().toISOString()}}
    const save=async()=>{if(!d.day){toast('Scegli il giorno.');return}
      try{if(isNew)await q(sb.from('appuntamenti').insert({...row(),created_by:S.me.id}));
        else{const r=await q(sb.from('appuntamenti').update(row()).eq('id',a.id).select('id'));if(!r.length)throw{code:'perm'}}
        close();toast(isNew?'Appuntamento aggiunto':'Appuntamento aggiornato');loadAppt()}catch(e){toast(errMsg(e))}};
    const doneOnce=a&&a.repeat!=='no'&&occKey?h('button',{class:'btn',onclick:async()=>{const set=new Set(a.doneDates);set.has(occKey)?set.delete(occKey):set.add(occKey);
      try{await q(sb.from('appuntamenti').update({done_dates:[...set]}).eq('id',a.id));close();toast(set.has(occKey)?'Segnato come fatto per il '+fromKey(occKey).toLocaleDateString('it-IT'):'Riaperto');loadAppt()}catch(e){toast(errMsg(e))}}},
      a.doneDates.includes(occKey)?'Riapri questa volta':'✓ Fatto questa volta'):null;
    const canDel=a&&(S.me.isDir||a.by===S.me.id);let armed=false;
    const del=canDel?h('button',{class:'btn danger',onclick:async()=>{if(!armed){armed=true;del.textContent='Conferma eliminazione';return}
      try{const r=await q(sb.from('appuntamenti').delete().eq('id',a.id).select('id'));if(!r.length)throw{code:'perm'};close();toast('Appuntamento eliminato');loadAppt()}catch(e){toast(errMsg(e))}}},'Elimina'):null;
    const ics=a?h('button',{class:'btn',onclick:()=>downloadIcs(a)},'Aggiungi al calendario del telefono'):null;
    return{body:h('div',null,callSlot,wrap),foot:[del,ics,doneOnce,h('div',{class:'spacer'}),h('button',{class:'btn',onclick:close},edit?'Annulla':'Chiudi'),edit?h('button',{class:'btn primary',onclick:save},'Salva'):null]}}});
  if(isNew)setTimeout(()=>{const t=document.getElementById('ap-title');t&&t.focus()},30)}

/* ---------- file .ics per il calendario del telefono ---------- */
function icsEsc(s){return String(s||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/[,;]/g,m=>'\\'+m)}
function icsUtc(t){const d=new Date(t);return d.getUTCFullYear()+p2(d.getUTCMonth()+1)+p2(d.getUTCDate())+'T'+p2(d.getUTCHours())+p2(d.getUTCMinutes())+'00Z'}
function icsDate(t){const d=new Date(t);return d.getFullYear()+p2(d.getMonth()+1)+p2(d.getDate())}
function buildIcs(a){const c=contactById(a.contactId);const art=articleById(a.articleId);
  const desc=[AK[a.kind].l,c?'Contatto: '+c.name+(c.phone?' – '+c.phone:'')+(c.email?' – '+c.email:''):'',art?'Articolo: '+(art.title||'Senza titolo'):'',a.notes].filter(Boolean).join('\n');
  const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//FuxiaNet//Redazione//IT','CALSCALE:GREGORIAN','BEGIN:VEVENT',
    'UID:'+a.id+'@redazione-fuxianet','DTSTAMP:'+icsUtc(Date.now()),'SUMMARY:'+icsEsc(apTitle(a)),'DESCRIPTION:'+icsEsc(desc)];
  if(a.allDay){L.push('DTSTART;VALUE=DATE:'+icsDate(a.start),'DTEND;VALUE=DATE:'+icsDate(addDays(new Date(a.start),1)))}
  else L.push('DTSTART:'+icsUtc(a.start),'DTEND:'+icsUtc(a.start+30*60000));
  if(c&&c.address)L.push('LOCATION:'+icsEsc(c.address));
  if(a.repeat!=='no'){let r='RRULE:FREQ='+{giorno:'DAILY',settimana:'WEEKLY',mese:'MONTHLY'}[a.repeat];if(a.until)r+=';UNTIL='+a.until.replace(/-/g,'')+'T235959Z';L.push(r)}
  if(a.remind!=null){const off=a.allDay?540-a.remind:-a.remind;// minuti rispetto all'inizio dell'evento
    L.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+icsEsc(apTitle(a)),'TRIGGER:'+(off>=0?'PT'+off+'M':'-PT'+(-off)+'M'),'END:VALARM')}
  L.push('END:VEVENT','END:VCALENDAR');return L.join('\r\n')+'\r\n'}
function downloadIcs(a){const blob=new Blob([buildIcs(a)],{type:'text/calendar;charset=utf-8'});const url=URL.createObjectURL(blob);
  const el=h('a',{href:url,download:(apTitle(a).replace(/[^\w\- àèéìòù]/gi,'').trim()||'appuntamento')+'.ics'});document.body.append(el);el.click();el.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);toast('Apri il file scaricato e scegli "Aggiungi" nel calendario')}

/* ---------- riquadri riutilizzati in Rubrica e Articolo ---------- */
function apptListFor(filter,emptyText){const now=sod(new Date());const list=occBetween(addDays(now,-7),addDays(now,120),S.appt.filter(filter));
  const seen=new Set();const uniq=list.filter(o=>o.a.repeat==='no'||!seen.has(o.a.id)&&seen.add(o.a.id));
  return uniq.length?h('div',{class:'occlist'},uniq.slice(0,8).map(o=>occItem(o,{showDay:true}))):h('p',{class:'muted',style:'margin:0;font-size:14px'},emptyText)}
function contactAppts(c){return h('section',{class:'apbox'},h('div',{class:'apbox-h'},h('b',null,'Appuntamenti'),
    S.me.canWrite?h('button',{class:'btn sm primary',onclick:()=>apptModal(null,null,{contactId:c.id})},'＋ Appuntamento'):null),
  apptListFor(a=>a.contactId===c.id,'Nessun appuntamento con questo contatto.'))}
function articleAppts(art){return h('div',null,h('div',{class:'k'},'Appuntamenti'),
  h('div',{style:'display:grid;gap:8px'},apptListFor(a=>a.articleId===art.id,'Nessuno collegato.'),
    S.me.canWrite?h('div',null,h('button',{class:'btn sm',onclick:()=>apptModal(null,null,{articleId:art.id,kind:'intervista',testata:tOf(art)})},'＋ Appuntamento')):null))}

/* ---------- pagina Oggi ---------- */
function renderOggi(){const now=new Date();const t0=sod(now);const hour=now.getHours();
  const hi=(hour<13?'Buongiorno':hour<18?'Buon pomeriggio':'Buonasera')+(S.me.name?', '+S.me.name.split(' ')[0]:'');
  const today=occBetween(t0,addDays(t0,1));
  // in ritardo: per gli appuntamenti che si ripetono conta solo l'ultima volta
  const lateAll=occBetween(addDays(t0,-30),t0).filter(o=>!o.done&&!o.cancelled);const lastRep={};
  for(const o of lateAll)if(o.a.repeat!=='no')lastRep[o.a.id]=o;
  const late=lateAll.filter(o=>o.a.repeat==='no'||lastRep[o.a.id]===o)
    .concat(today.filter(o=>!o.a.allDay&&o.at<Date.now()-3600e3&&!o.done&&!o.cancelled&&o.a.repeat==='no'));
  const next=occBetween(addDays(t0,1),addDays(t0,8));
  const arts=S.articles.filter(inT);
  const dueArts=arts.filter(a=>a.deadline&&a.status!=='pubblicato'&&a.deadline<addDays(t0,8).getTime()).sort((x,y)=>x.deadline-y.deadline);
  const mine=arts.filter(a=>a.status!=='pubblicato'&&(a.assigneeId===S.me.id||(!a.assigneeId&&a.authorId===S.me.id)));
  const cnt=k=>arts.filter(a=>(a.status||'bozza')===k).length;
  const notes=S.appunti.filter(x=>!x.done&&(S.testata==='tutte'||!x.testata||x.testata===S.testata)).slice(0,5);
  const card=(title,action,...kids)=>h('section',{class:'panel oggi-card'},h('h2',null,h('span',null,title),action||null),kids);
  const artRow=a=>h('button',{class:'occ art',style:'--k:'+STATO[a.status||'bozza'].c,onclick:()=>go('articolo',a.id)},
    h('span',{class:'occ-main'},h('b',null,a.title||'Senza titolo'),h('span',{class:'occ-sub'},byName(a))),
    h('span',{class:'occ-side'},h('span',{class:'pill',style:'--c:'+STATO[a.status||'bozza'].c},STATO[a.status||'bozza'].l),dueChip(a)));
  const byDay={};for(const o of next)(byDay[o.key]=byDay[o.key]||[]).push(o);
  return h('div',{class:'oggi'},
    h('div',{class:'oggi-head'},h('div',null,h('div',{class:'eyebrow'},cap(longDay(now))),h('h1',null,hi)),
      S.me.canWrite?h('div',{class:'oggi-actions'},h('button',{class:'btn primary',onclick:()=>apptModal(null,null,{})},'＋ Appuntamento'),
        h('button',{class:'btn',onclick:()=>go('appunti')},'＋ Appunto'),h('button',{class:'btn',onclick:newArticle},'＋ Articolo')):null),
    h('div',{class:'oggi-stats'},[['revisione','In revisione'],['correggere','Da correggere'],['pronto','Pronti'],['bozza','In bozza']].map(([k,l])=>
      h('button',{class:'stat',style:'--c:'+STATO[k].c,onclick:()=>{S.rstato=k;go('riepilogo')}},h('b',{class:'mono'},cnt(k)),h('span',null,l)))),
    h('div',{class:'oggi-grid'},
      card('In agenda oggi',h('button',{class:'btn sm',onclick:()=>{S.agMode='giorno';S.agDate=null;go('agenda')}},'Apri agenda'),
        today.length?h('div',{class:'occlist'},today.map(o=>occItem(o))):h('p',{class:'muted',style:'margin:0'},'Nessun impegno oggi.')),
      late.length?card('In ritardo',null,h('div',{class:'occlist'},late.map(o=>occItem(o,{showDay:true})))):null,
      card('Prossimi 7 giorni',null,next.length?Object.keys(byDay).map(k=>h('div',{class:'oggi-day'},h('div',{class:'eyebrow'},cap(longDay(fromKey(k)))),h('div',{class:'occlist'},byDay[k].map(o=>occItem(o)))))
        :h('p',{class:'muted',style:'margin:0'},'Niente in programma nella prossima settimana.')),
      card('Consegne degli articoli',h('button',{class:'btn sm',onclick:()=>go('riepilogo')},'Riepilogo'),
        dueArts.length?h('div',{class:'occlist'},dueArts.slice(0,8).map(artRow)):h('p',{class:'muted',style:'margin:0'},'Nessuna consegna nei prossimi 7 giorni.')),
      card('Il mio lavoro',null,mine.length?h('div',{class:'occlist'},mine.slice(0,6).map(artRow)):h('p',{class:'muted',style:'margin:0'},'Nessun articolo assegnato a te in lavorazione.')),
      card('Ultimi appunti',h('button',{class:'btn sm',onclick:()=>go('appunti')},'Tutti'),
        notes.length?h('div',{class:'occlist'},notes.map(n=>{const k=AP_KINDS[n.kind]||AP_KINDS.promemoria;
          return h('button',{class:'occ art',style:'--k:'+k.c,onclick:()=>go('appunti')},
            h('span',{class:'occ-main'},h('span',{class:'occ-kind'},k.l),h('b',{class:'clamp'},n.text),h('span',{class:'occ-sub'},pname(n.by)+' · '+ago(n.at))))})):h('p',{class:'muted',style:'margin:0'},'Nessun appunto aperto.'))))}
