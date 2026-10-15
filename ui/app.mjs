import { responseDb } from './response.mjs';

const $ = selector => document.querySelector(selector);
const invoke = window.__TAURI__?.core?.invoke;
const referenceFilters = [[29,-.9,2],[50,-5.4,.5],[60,1,1],[240,-4.5,1.5],[2000,2.5,1.2],[5900,3.8,1.1],[10000,4.8,2]];
let name = 'Harman 2018 target', skipped = [8], pending = null, importVersion = 0;
let rows = referenceFilters.map(([frequency,gain,q], i) => ({id:i+1, kind:'PK', frequency, gain, q, enabled:true}));
rows.push({id:8,kind:'PK',frequency:1000,gain:0,q:1,enabled:false});
let selectedBand = 0;

const tabs = [...document.querySelectorAll('[role="tab"]')];
function showTab(id, focus = false) {
  closeBandEditor(false);
  for (const tab of tabs) {
    const active = tab.getAttribute('aria-controls') === id;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    if (active && focus) tab.focus();
  }
  $('#status-detail').hidden = true;
  $('#status-info').setAttribute('aria-expanded', 'false');
}
for (const [index, tab] of tabs.entries()) {
  tab.onclick = () => showTab(tab.getAttribute('aria-controls'));
  tab.onkeydown = event => {
    let target;
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = tabs.length - 1;
    if (target !== undefined) {
      event.preventDefault();
      showTab(tabs[target].getAttribute('aria-controls'), true);
    }
  };
}

const appWindow = window.__TAURI__?.window?.getCurrentWindow();
for (const [id, action] of [['minimize', 'minimize'], ['close', 'close']]) {
  $(`#${id}`).disabled = !appWindow;
  $(`#${id}`).onclick = async () => {
    try { await appWindow[action](); }
    catch (error) { message(String(error.message ?? error), true); }
  };
}
$('#pin').disabled = !appWindow;
$('#pin').onclick = async () => {
  $('#pin').disabled = true;
  try {
    const pinned = !(await appWindow.isAlwaysOnTop());
    await appWindow.setAlwaysOnTop(pinned);
    $('#pin').setAttribute('aria-pressed', String(pinned));
    $('#pin').title = pinned ? 'Unpin window' : 'Keep on top';
    $('#pin').setAttribute('aria-label', $('#pin').title);
  } catch (error) { message(String(error.message ?? error), true); }
  finally { $('#pin').disabled = false; }
};
$('#choose-profile').onclick = () => $('#profile-file').click();
$('#status-info').onclick = () => {
  const detail = $('#status-detail');
  detail.hidden = !detail.hidden;
  $('#status-info').setAttribute('aria-expanded', String(!detail.hidden));
};
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeBandEditor();
    $('#status-detail').hidden = true;
    $('#status-info').setAttribute('aria-expanded', 'false');
  }
});

function message(text, error = false) {
  $('#message').textContent = text;
  $('#message').classList.toggle('error', error);
  $('#message').title = text;
  $('#status-detail').textContent = text;
  $('#status-detail').hidden = true;
  $('#status-info').setAttribute('aria-expanded', 'false');
}

function draft() {
  if (!$('#preamp').checkValidity()) throw Error('Enter a finite preamp value.');
  for (const [index, filter] of rows.entries()) {
    if (filter.enabled && !validBand(filter)) {
      throw Error(`Check band ${index + 1}: use 20–20,000 Hz, a finite gain, and Q greater than zero.`);
    }
  }
  const filters = rows.filter(row => row.enabled).map(({enabled,...filter}) => filter);
  if (!filters.length) throw Error('Enable at least one filter.');
  const disabled = skipped.filter(id => !filters.some(filter => filter.id === id));
  return {name, preamp: Number($('#preamp').value), filters, disabled_filters: disabled};
}

function validBand(filter) {
  return [filter.frequency, filter.gain, filter.q].every(Number.isFinite)
    && filter.frequency >= 20 && filter.frequency <= 20000 && filter.q > 0;
}

function closeBandEditor(restoreFocus = true) {
  const wasOpen = !$('#band-editor').hidden;
  $('#band-editor').hidden = true;
  for (const button of $('#bands').children) {
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-pressed', 'false');
  }
  if (wasOpen && restoreFocus) $('#bands').children[selectedBand]?.focus();
}

function openBandEditor(index) {
  selectedBand = index;
  const filter = rows[index];
  $('#band-title').textContent = `Band ${String(index + 1).padStart(2, '0')}`;
  $('#band-enabled').checked = filter.enabled;
  $('#band-kind').value = filter.kind;
  for (const field of ['frequency', 'gain', 'q']) {
    const input = $(`#band-${field}`);
    input.value = Number.isFinite(filter[field]) ? filter[field] : '';
    input.setCustomValidity(field === 'q' && filter.q <= 0 ? 'Q must be greater than zero.' : '');
  }
  $('#band-editor').hidden = false;
  update();
  $('#band-enabled').focus();
}

function renderBands() {
  $('#bands').replaceChildren();
  rows.forEach((_, index) => {
    const button = document.createElement('button');
    button.className = 'band-button';
    button.setAttribute('aria-controls', 'band-editor');
    button.innerHTML = '<strong></strong><span></span>';
    button.onclick = () => openBandEditor(index);
    button.onkeydown = event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % rows.length;
      if (event.key === 'ArrowLeft') next = (index + rows.length - 1) % rows.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = rows.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        openBandEditor(next);
        $('#bands').children[next].focus();
      }
    };
    $('#bands').append(button);
  });
}

function update() {
  for (const [index, button] of [...$('#bands').children].entries()) {
    const filter = rows[index];
    const frequency = Number.isFinite(filter.frequency) ? String(Number((filter.frequency >= 1000 ? filter.frequency / 1000 : filter.frequency).toFixed(1))) + (filter.frequency >= 1000 ? 'k' : '') : '?';
    const invalid = filter.enabled && !validBand(filter);
    const selected = index === selectedBand && !$('#band-editor').hidden;
    button.querySelector('strong').textContent = String(index + 1).padStart(2, '0');
    button.querySelector('span').textContent = filter.enabled ? `${frequency} Hz` : 'Off';
    button.classList.toggle('off', !filter.enabled);
    button.classList.toggle('invalid', invalid);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-expanded', String(selected));
    button.setAttribute('aria-label', `Edit band ${index + 1}, ${filter.enabled ? 'enabled' : 'disabled'}, ${filter.frequency} Hz, ${filter.gain} dB, Q ${filter.q}${invalid ? ', invalid settings' : ''}`);
    button.title = `Band ${index + 1} · ${filter.frequency} Hz · ${filter.gain} dB · Q ${filter.q}${invalid ? ' · Check settings' : ''}`;
  }
  $('#band-enabled-label').textContent = rows[selectedBand].enabled ? 'Enabled' : 'Disabled';
  $('#profile-name').textContent=name;
  $('#band-count').textContent=`${rows.filter(row=>row.enabled).length} / 8 bands`;
  try {
    const current=draft();
    if(!Number.isFinite(current.preamp)||current.filters.some(f=>![f.frequency,f.gain,f.q].every(Number.isFinite)||f.q<=0))throw Error('Enter finite EQ values and a positive Q.');
    draw(current);
    message('Offline draft · no settings applied.');
  } catch(error){$('#response').replaceChildren();message(error.message,true);}
}

function draw(profile) {
  const svg=$('#response'), ns='http://www.w3.org/2000/svg';
  svg.replaceChildren();
  const height = svg.clientWidth ? Math.max(160, svg.clientHeight * 920 / svg.clientWidth) : 240;
  const bottom = height - 32;
  svg.setAttribute('viewBox', `0 0 920 ${height}`);
  const add=(tag,attributes,text)=>{const el=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attributes))el.setAttribute(key,value);if(text)el.textContent=text;svg.append(el);return el;};
  const points=Array.from({length:321},(_,i)=>{const hz=20*1000**(i/320);return {hz,db:responseDb(profile.filters,profile.preamp,hz)};});
  if(points.some(p=>!Number.isFinite(p.db)))throw Error('These filter values cannot be plotted.');
  const lo=Math.floor(Math.min(-12,...points.map(p=>p.db))/6)*6,hi=Math.ceil(Math.max(6,...points.map(p=>p.db))/6)*6;
  const x=hz=>42+Math.log(hz/20)/Math.log(1000)*858,y=db=>12+(hi-db)/(hi-lo)*(bottom-12);
  for(let i=0;i<=4;i++){const db=lo+(hi-lo)*i/4;add('line',{x1:42,x2:900,y1:y(db),y2:y(db),class:Math.abs(db)<.01?'zero-line':'grid-line'});add('text',{x:32,y:y(db)+3,'text-anchor':'end',class:'axis-label'},`${db.toFixed(0)}`);}
  for(const hz of [20,50,100,200,500,1000,2000,5000,10000,20000]){add('line',{x1:x(hz),x2:x(hz),y1:12,y2:bottom,class:'grid-line'});add('text',{x:x(hz),y:height-9,'text-anchor':'middle',class:'axis-label'},hz>=1000?`${hz/1000}k`:`${hz}`);}
  const path=points.map((p,i)=>`${i?'L':'M'}${x(p.hz).toFixed(2)},${y(p.db).toFixed(2)}`).join(' ');
  add('path',{d:`${path} L900,${bottom} L42,${bottom} Z`,class:'curve-fill'});add('path',{d:path,class:'curve'});
  const band = rows[selectedBand];
  if (band?.enabled) {
    const db = responseDb(profile.filters, profile.preamp, band.frequency);
    add('line', {x1:x(band.frequency),x2:x(band.frequency),y1:12,y2:bottom,class:'band-guide'});
    add('circle', {cx:x(band.frequency),cy:y(db),r:7,class:'band-dot'});
  }
}

function useProfile(profile) {
  closeBandEditor(false);
  name=profile.name;skipped=profile.disabled_filters;rows=profile.filters.map(filter=>({...filter,enabled:true}));
  let id=Math.max(0,...rows.map(row=>row.id));
  while(rows.length<8)rows.push({id:++id,kind:'PK',frequency:1000,gain:0,q:1,enabled:false});
  selectedBand=0;
  $('#preamp').value=profile.preamp;renderBands();update();
  $('#condition').textContent='Imported draft · match ANC to the profile’s measurement condition.';
}

$('#preamp').oninput=update;
$('#close-band').onclick = () => { closeBandEditor(); update(); };
$('#band-enabled').onchange = event => { rows[selectedBand].enabled = event.target.checked; update(); };
$('#band-kind').onchange = event => { rows[selectedBand].kind = event.target.value; update(); };
for (const field of ['frequency', 'gain', 'q']) {
  $(`#band-${field}`).oninput = event => {
    const input = event.target;
    rows[selectedBand][field] = input.value === '' ? NaN : Number(input.value);
    input.setCustomValidity(field === 'q' && rows[selectedBand].q <= 0 ? 'Q must be greater than zero.' : '');
    update();
  };
}
$('#profile-file').onchange=async event=>{
  const version=++importVersion;pending=null;$('#import-preview').hidden=true;
  const file=event.target.files[0];if(!file)return;
  try{
    if(!invoke)throw Error('File import needs the desktop app. This browser view is a visual preview.');
    if(file.size>256*1024)throw Error('Profile exceeds the 256 KB import limit.');
    const profile=await invoke('import_autoeq',{text:await file.text(),name:file.name.replace(/\.txt$/i,'')});
    if(version!==importVersion)return;
    pending=profile;$('#import-name').textContent=profile.name;
    $('#import-summary').textContent=`${profile.filters.length}/8 bands · ${profile.preamp} dB preamp · ${profile.disabled_filters.length} disabled rows skipped. Confirm to replace your draft.`;
    $('#import-preview').hidden=false;message('Profile validated. Review the import before replacing your draft.');
  }catch(error){if(version===importVersion)message(String(error.message??error),true);}
  finally{event.target.value='';}
};
$('#use-import').onclick=()=>{if(pending){useProfile(pending);pending=null;$('#import-preview').hidden=true;showTab('eq', true);}};
$('#cancel-import').onclick=()=>{++importVersion;pending=null;$('#import-preview').hidden=true;message('Import cancelled. Your draft is unchanged.');};
$('#reference').onclick=async()=>{try{if(!invoke)throw Error('Load reference needs the desktop app. The preview starts with the reference tuning.');const profile=await invoke('reference_profile');++importVersion;pending=null;$('#import-preview').hidden=true;useProfile(profile);$('#condition').textContent='Reference tuning · ANC maximum.';showTab('eq', true);}catch(error){message(String(error.message??error),true);}};
$('#validate').onclick=async()=>{try{if(!invoke)throw Error('Rust validation needs the desktop app. This is a visual preview.');await invoke('validate_profile',{profile:draft()});message('Draft valid · no settings applied.');}catch(error){message(String(error.message??error),true);}};
renderBands();update();
new ResizeObserver(() => {
  try { draw(draft()); }
  catch { $('#response').replaceChildren(); }
}).observe($('#response'));
if(!invoke)message('Browser preview · editing and graph work here. Import and Rust validation require the desktop app.');
