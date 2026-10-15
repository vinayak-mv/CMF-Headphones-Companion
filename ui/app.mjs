import { responseDb } from './response.mjs';

const $ = selector => document.querySelector(selector);
const invoke = window.__TAURI__?.core?.invoke;
const referenceFilters = [[29,-.9,2],[50,-5.4,.5],[60,1,1],[240,-4.5,1.5],[2000,2.5,1.2],[5900,3.8,1.1],[10000,4.8,2]];
let name = 'Harman 2018 target', skipped = [8], pending = null, importVersion = 0;
let rows = referenceFilters.map(([frequency,gain,q], i) => ({id:i+1, kind:'PK', frequency, gain, q, enabled:true}));
rows.push({id:8,kind:'PK',frequency:1000,gain:0,q:1,enabled:false});

function message(text, error = false) {
  $('#message').textContent = text;
  $('#message').classList.toggle('error', error);
}

function draft() {
  if (!$('#preamp').checkValidity()) throw Error('Enter a finite preamp value.');
  for (const row of $('#bands').rows) {
    if (!row.querySelector('[type=checkbox]').checked) continue;
    for (const input of row.querySelectorAll('input[type=number]')) {
      if (!input.checkValidity()) throw Error('Check the highlighted EQ values. Frequency must be 20–20,000 Hz and Q must be positive.');
    }
  }
  const filters = rows.filter(row => row.enabled).map(({enabled,...filter}) => filter);
  if (!filters.length) throw Error('Enable at least one filter.');
  const disabled = skipped.filter(id => !filters.some(filter => filter.id === id));
  return {name, preamp: Number($('#preamp').value), filters, disabled_filters: disabled};
}

function renderRows() {
  $('#bands').replaceChildren();
  rows.forEach((filter, index) => {
    const row = document.createElement('tr');
    row.classList.toggle('off', !filter.enabled);
    const band = document.createElement('td'); band.textContent = String(index + 1).padStart(2,'0'); row.append(band);
    const enabledCell = document.createElement('td'), enabled = document.createElement('input');
    enabled.type = 'checkbox'; enabled.checked = filter.enabled; enabled.setAttribute('aria-label',`Enable band ${index+1}`);
    enabled.onchange = () => {filter.enabled = enabled.checked; row.classList.toggle('off',!filter.enabled); update();};
    enabledCell.append(enabled); row.append(enabledCell);
    const typeCell = document.createElement('td'), select = document.createElement('select');
    for (const [value,label] of [['PK','Peak'],['LS','Low shelf'],['HS','High shelf']]) {const option = document.createElement('option'); option.value=value; option.textContent=label; select.append(option);}
    select.value = filter.kind; select.setAttribute('aria-label',`Band ${index+1} type`);
    select.onchange = () => {filter.kind=select.value; update();}; typeCell.append(select); row.append(typeCell);
    for (const [field,step] of [['frequency','1'],['gain','.1'],['q','.001']]) {
      const cell = document.createElement('td'), input = document.createElement('input');
      input.type='number'; input.step=step; input.value=filter[field]; input.required=true;
      input.setAttribute('aria-label',`Band ${index+1} ${field}`);
      if(field==='frequency'){input.min='20';input.max='20000';input.step='any';}
      if(field==='q'){input.min='0';input.step='any';}
      input.oninput=()=>{filter[field]=input.value===''?NaN:Number(input.value);input.setCustomValidity(field==='q'&&filter.q<=0?'Q must be greater than zero.':'');update();};
      cell.append(input);row.append(cell);
    }
    $('#bands').append(row);
  });
}

function update() {
  $('#profile-name').textContent=name;
  $('#band-count').textContent=`${rows.filter(row=>row.enabled).length} / 8 active bands`;
  try {
    const current=draft();
    if(!Number.isFinite(current.preamp)||current.filters.some(f=>![f.frequency,f.gain,f.q].every(Number.isFinite)||f.q<=0))throw Error('Enter finite EQ values and a positive Q.');
    draw(current);
    message('Offline draft. No settings have been sent to your headphones.');
  } catch(error){message(error.message,true);}
}

function draw(profile) {
  const svg=$('#response'), ns='http://www.w3.org/2000/svg';
  svg.replaceChildren();
  const add=(tag,attributes,text)=>{const el=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attributes))el.setAttribute(key,value);if(text)el.textContent=text;svg.append(el);return el;};
  const points=Array.from({length:321},(_,i)=>{const hz=20*1000**(i/320);return {hz,db:responseDb(profile.filters,profile.preamp,hz)};});
  if(points.some(p=>!Number.isFinite(p.db)))throw Error('These filter values cannot be plotted.');
  const lo=Math.floor(Math.min(-12,...points.map(p=>p.db))/6)*6,hi=Math.ceil(Math.max(6,...points.map(p=>p.db))/6)*6;
  const x=hz=>42+Math.log(hz/20)/Math.log(1000)*858,y=db=>12+(hi-db)/(hi-lo)*196;
  for(let i=0;i<=4;i++){const db=lo+(hi-lo)*i/4;add('line',{x1:42,x2:900,y1:y(db),y2:y(db),class:Math.abs(db)<.01?'zero-line':'grid-line'});add('text',{x:32,y:y(db)+3,'text-anchor':'end',class:'axis-label'},`${db.toFixed(0)}`);}
  for(const hz of [20,50,100,200,500,1000,2000,5000,10000,20000]){add('line',{x1:x(hz),x2:x(hz),y1:12,y2:208,class:'grid-line'});add('text',{x:x(hz),y:229,'text-anchor':'middle',class:'axis-label'},hz>=1000?`${hz/1000}k`:`${hz}`);}
  const path=points.map((p,i)=>`${i?'L':'M'}${x(p.hz).toFixed(2)},${y(p.db).toFixed(2)}`).join(' ');
  add('path',{d:`${path} L900,208 L42,208 Z`,class:'curve-fill'});add('path',{d:path,class:'curve'});
}

function useProfile(profile) {
  name=profile.name;skipped=profile.disabled_filters;rows=profile.filters.map(filter=>({...filter,enabled:true}));
  let id=Math.max(0,...rows.map(row=>row.id));
  while(rows.length<8)rows.push({id:++id,kind:'PK',frequency:1000,gain:0,q:1,enabled:false});
  $('#preamp').value=profile.preamp;renderRows();update();
  $('#condition').textContent='Imported settings are a draft. Set ANC to suit the profile’s measurement condition before listening.';
}

$('#preamp').oninput=update;
$('#profile-file').onchange=async event=>{
  const version=++importVersion;pending=null;$('#import-preview').hidden=true;
  const file=event.target.files[0];if(!file)return;
  try{
    if(!invoke)throw Error('File import needs the desktop app. This browser view is a visual preview.');
    if(file.size>256*1024)throw Error('Profile exceeds the 256 KB import limit.');
    const profile=await invoke('import_autoeq',{text:await file.text(),name:file.name.replace(/\.txt$/i,'')});
    if(version!==importVersion)return;
    pending=profile;$('#import-name').textContent=profile.name;
    $('#import-summary').textContent=`${profile.filters.length}/8 active filters · ${profile.preamp} dB preamp · ${profile.disabled_filters.length} disabled rows skipped. Your current draft is unchanged until you choose Use in editor.`;
    $('#import-preview').hidden=false;message('Profile validated. Review the import before replacing your draft.');
  }catch(error){if(version===importVersion)message(String(error.message??error),true);}
  finally{event.target.value='';}
};
$('#use-import').onclick=()=>{if(pending){useProfile(pending);pending=null;$('#import-preview').hidden=true;}};
$('#cancel-import').onclick=()=>{++importVersion;pending=null;$('#import-preview').hidden=true;message('Import cancelled. Your draft is unchanged.');};
$('#reference').onclick=async()=>{try{if(!invoke)throw Error('Load reference needs the desktop app. The preview starts with the reference tuning.');const profile=await invoke('reference_profile');++importVersion;pending=null;$('#import-preview').hidden=true;useProfile(profile);}catch(error){message(String(error.message??error),true);}};
$('#validate').onclick=async()=>{try{if(!invoke)throw Error('Rust validation needs the desktop app. This is a visual preview.');await invoke('validate_profile',{profile:draft()});message('Draft validated: ready for future device integration. No headphone settings changed.');}catch(error){message(String(error.message??error),true);}};
renderRows();update();
if(!invoke)message('Browser preview · editing and graph work here. Import and Rust validation require the desktop app.');
