(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const pads = [];
  const padColors = ['#1688ff','#1aa3ff','#19ef65','#ff9c2e','#9138ff','#ff2d92','#18d8ef','#ffe000','#ff4d36','#1593ff','#d62cff','#19d7d0'];
  const defaultNames = ['JINGLE OPENING','AIRHORN','SWEEPER','SIREN','APPLAUSE','BLEEP','SUBDROP','LASER','KICKBEAT','SNARE','SCRATCH','STINGER'];
  const storageKey='proAudioControl.padNames.v6';
  const padNames = (() => { try { return Object.assign([...defaultNames], JSON.parse(localStorage.getItem(storageKey)||'[]')); } catch { return [...defaultNames]; } })();
  const AUDIO_DB_NAME='proAudioControl.audio.v1';
  const AUDIO_DB_VERSION=1;
  let audioDbPromise=null;
  function openAudioDb(){
    if(audioDbPromise) return audioDbPromise;
    if(!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB unavailable'));
    audioDbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(AUDIO_DB_NAME,AUDIO_DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('pads')) db.createObjectStore('pads',{keyPath:'id'});
        if(!db.objectStoreNames.contains('music')) db.createObjectStore('music',{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('IndexedDB open failed'));
    });
    return audioDbPromise;
  }
  async function dbPut(storeName,value){ try{const db=await openAudioDb();return await new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readwrite');tx.objectStore(storeName).put(value);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);});}catch{return false;} }
  async function dbDelete(storeName,id){ try{const db=await openAudioDb();return await new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readwrite');tx.objectStore(storeName).delete(id);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);});}catch{return false;} }
  async function dbClear(storeName){ try{const db=await openAudioDb();return await new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readwrite');tx.objectStore(storeName).clear();tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);});}catch{return false;} }
  async function dbGetAll(storeName){ try{const db=await openAudioDb();return await new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readonly');const req=tx.objectStore(storeName).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});}catch{return [];} }
  const padsArea = $('#padGrid');
  const multiFile = $('#multiFile');
  const musicFileInput = $('#musicFileInput');
  let audioCtx = null, masterGain = null, analyser = null, musicNode = null, musicGain = null;
  let master = 0.85, globalLoop=false, fadeMs=3000, masterTimerStart = Date.now(), activeDeck='ALL';
  let masterMuted=false, preMuteMaster=0.85;
  let visualizerFrame=0;
  const musicAudio = new Audio(); musicAudio.preload='metadata'; musicAudio.playsInline=true; musicAudio.setAttribute('playsinline',''); musicAudio.volume=.70;
  let musicObjectUrls=[]; let musicTracks=[]; let activeMusic=-1; let musicShuffle=false; let musicRepeat=false; let musicFadeTimer=null;
  const musicSeek = $('#musicSeek');

  const fmt = s => { if(!Number.isFinite(s)||s<0)s=0; const m=Math.floor(s/60).toString().padStart(2,'0'); const sec=Math.floor(s%60).toString().padStart(2,'0'); return `${m}:${sec}`; };
  const esc = s => String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const cleanName = n => n.replace(/\.[^/.]+$/,'').replace(/[_]+/g,' ').trim().toUpperCase() || 'UNTITLED';

  function fadeGain(gain, from, to, ms, onDone){
    if(!audioCtx || !gain){ onDone?.(); return null; }
    const now=audioCtx.currentTime;
    const dur=Math.max(.05, ms/1000);
    try{ gain.gain.cancelScheduledValues(now); }catch{}
    gain.gain.setValueAtTime(Math.max(0, Number(from)||0), now);
    gain.gain.linearRampToValueAtTime(Math.max(0, Number(to)||0), now+dur);
    return onDone ? setTimeout(onDone, ms+40) : null;
  }

  function currentPadGain(p){
    if(!p.fadeState) return p.gainLevel;
    const elapsed=Math.max(0, performance.now()-p.fadeState.started);
    const t=Math.min(1, elapsed/p.fadeState.duration);
    return p.fadeState.from + (p.fadeState.to-p.fadeState.from)*t;
  }

  function rampPadGain(p, target, ms, onDone){
    if(!p.gain || !audioCtx) return;
    clearTimeout(p.fadeTimer);
    const from=Math.max(0, Math.min(1, currentPadGain(p)));
    const to=Math.max(0, Math.min(1, Number(target)||0));
    const duration=Math.max(80, Number(ms)||0);
    p.gainLevel=from;
    p.fadeState={from,to,started:performance.now(),duration};
    p.gain.gain.cancelScheduledValues(audioCtx.currentTime);
    p.gain.gain.setValueAtTime(from,audioCtx.currentTime);
    p.gain.gain.linearRampToValueAtTime(to,audioCtx.currentTime+duration/1000);
    p.fadeTimer=setTimeout(()=>{
      p.gainLevel=to;
      p.fadeState=null;
      p.fadeTimer=null;
      onDone?.();
    },duration+45);
  }

  function stopAudioAtEnd(p){
    p.audio.pause();
    try{p.audio.currentTime=0;}catch{}
    p.el.classList.remove('playing');
    setPadActionState(p,'play',false);
    setPadActionState(p,'fadeIn',false);
    setPadActionState(p,'fadeOut',false);
    p.update();
    updateStatus();
  }

  function setPadActionState(p, act, on){
    const btn=p?.el?.querySelector(`[data-act=\"${act}\"]`);
    if(!btn) return;
    btn.classList.toggle('is-active',!!on);
    btn.setAttribute('aria-pressed', on?'true':'false');
  }

  // Persistent LOOP indicator: remains highlighted until LOOP is toggled off.
  function syncLoopButton(p){
    const btn=p?.el?.querySelector('[data-act="loop"]');
    if(!btn) return;
    const on=!!p.loop;
    btn.classList.toggle('loop-active',on);
    btn.classList.toggle('is-active',on);
    btn.dataset.loop=on?'on':'off';
    btn.textContent='⟳ LOOP';
    btn.setAttribute('aria-pressed',on?'true':'false');
    btn.setAttribute('title',on?'Loop aktif — tekan lagi untuk mematikan':'Aktifkan loop');
  }

  function pulsePadAction(p, act, ms=420){
    setPadActionState(p,act,true);
    clearTimeout(p[`_${act}PulseTimer`]);
    p[`_${act}PulseTimer`]=setTimeout(()=>setPadActionState(p,act,false),Math.max(120,ms));
  }

  function autoFadeOtherPads(except){
    // Crossfade all currently playing PADs, not just the immediately previous PAD.
    pads.forEach(other=>{
      if(other===except || !other.audio.src || other.audio.paused || other.audio.ended) return;
      other.fadeOut(fadeMs, true);
    });
  }

  function initAudio(){
    if(!audioCtx){
      audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      masterGain = audioCtx.createGain(); analyser = audioCtx.createAnalyser(); analyser.fftSize=128; analyser.smoothingTimeConstant=.72;
      masterGain.gain.value = master; masterGain.connect(analyser).connect(audioCtx.destination);
      musicNode = audioCtx.createMediaElementSource(musicAudio); musicGain = audioCtx.createGain(); musicGain.gain.value = .70; musicNode.connect(musicGain).connect(masterGain);
    }
    if(audioCtx.state==='suspended') audioCtx.resume();
  }

  function setMaster(v, remember=true){
    master=Math.max(0,Math.min(1,Number(v)||0));
    if(remember && !masterMuted) preMuteMaster=master;
    if(audioCtx) masterGain.gain.setTargetAtTime(master,audioCtx.currentTime,.01);
    const pct=Math.round(master*100);
    const db=master<=.001?'−∞':`${((master-1)*18).toFixed(1)} dB`;
    $('#masterDb').textContent=db; $('#masterVolTextBottom').textContent=`${pct}%`;
    $('#masterVolumeBottom').value=pct; try{localStorage.setItem('proAudioControl.masterVolume',String(pct));}catch{};
  }

  function waveform(container,count,seed,color){
    container.innerHTML=''; let x=seed*13+7;
    for(let i=0;i<count;i++){ x=(x*9301+49297)%233280; const h=7+Math.round((x/233280)*32); const bar=document.createElement('span'); bar.style.height=`${h}px`; if(color) bar.style.background=color; container.appendChild(bar); }
  }

  function saveNames(){ try{ localStorage.setItem(storageKey,JSON.stringify(padNames)); }catch{} }
  function resetPadWave(p){
    if(!p?.waveBars)return;
    p.smoothBars.fill(0);
    if (p.peakBars) p.peakBars.fill(0);
    p.waveBars.forEach((bar,i)=>{
      const base=8+Math.round((i%7)*1.7);
      bar.style.height=`${base}px`;
      bar.style.opacity='.42';
      bar.style.transform='scaleY(.65)';
    });
  }

  function updatePadWaves(){
    const now=performance.now();
    pads.forEach(p=>{
      if(!p.analyser || !p.analyserData || !p.waveBars?.length){
        if(p.waveBars?.length) resetPadWave(p);
        return;
      }
      const active=!p.audio.paused && !p.audio.ended && !!p.audio.src;
      if(!active){
        p.waveBars.forEach((bar,i)=>{
          const pulse=5.5+2.4*Math.sin(now/230+i*.62);
          bar.style.height=`${Math.max(5,pulse)}px`;
          bar.style.opacity='.22';
          bar.style.transform='scaleY(.64)';
        });
        return;
      }
      p.analyser.getByteFrequencyData(p.analyserData);
      const len=p.analyserData.length;
      const lowCount=Math.max(2,Math.floor(len*.10));
      let low=0, energy=0;
      for(let i=0;i<len;i++) energy += p.analyserData[i]||0;
      for(let i=0;i<lowCount;i++) low += p.analyserData[i]||0;
      low = low/(lowCount*255);
      energy = energy/(Math.max(1,len)*255);
      const beatBoost=Math.min(1, low*1.45 + energy*.35);
      p.waveBars.forEach((bar,i)=>{
        const pos=i/Math.max(1,p.waveBars.length-1);
        const start=Math.min(len-1,Math.floor(Math.pow(pos,1.48)*(len-1)));
        const span=Math.max(1,Math.floor(2.5+(1-pos)*3.5));
        const end=Math.min(len-1,start+span);
        let sum=0,count=0;
        for(let j=start;j<=end;j++){sum+=p.analyserData[j]||0;count++;}
        let v=(sum/Math.max(1,count))/255;
        const wavePhase=.035*Math.sin(now/75+i*.9);
        v=Math.max(0,Math.min(1,v*.72 + low*.24 + beatBoost*.16 + wavePhase));
        const old=p.smoothBars[i]||0;
        const smooth=old*.44+v*.56;
        p.smoothBars[i]=smooth;
        const peak=Math.max((p.peakBars?.[i]||0)*.965,smooth);
        if(p.peakBars) p.peakBars[i]=peak;
        const height=6+smooth*34;
        bar.style.height=`${height.toFixed(1)}px`;
        bar.style.opacity=`${(.46+smooth*.5).toFixed(2)}`;
        bar.style.transform=`scaleY(${(.76+smooth*.40).toFixed(2)})`;
        bar.style.filter=`brightness(${(1+smooth*.32).toFixed(2)})`;
      });
    });
    requestAnimationFrame(updatePadWaves);
  }


  function openPadFile(p){ p.fileInput.click(); }
  function editPadName(p){
    const current=$(`#name-${p.i}`).textContent;
    const value=prompt(`Edit nama PAD ${p.i}`, current);
    if(value===null)return;
    const next=value.trim(); if(!next)return;
    padNames[p.i-1]=next.toUpperCase(); saveNames(); $(`#name-${p.i}`).textContent=padNames[p.i-1];
  }

  function createPad(index){
    const n=index+1, color=padColors[index];
    const el=document.createElement('article');
    el.className='pad'; el.style.setProperty('--accent',color); el.dataset.deck=index<6?'A':'B'; el.dataset.pad=String(n);
    el.innerHTML=`<div class="pad-inner">
      <div class="pad-head">
        <div class="pad-num">${n}</div>
        <div style="min-width:0;flex:1;margin-left:7px"><div class="pad-name" id="name-${n}">${esc(padNames[index])}</div><div class="pad-time-row"><div class="pad-time" id="time-${n}">00:00 / 00:00</div><div class="pad-countdown" id="count-${n}">−00:00</div></div></div>
        <div class="pad-head-tools"><button class="mini-pad-btn" data-tool="edit" title="Edit nama">✎</button><button class="mini-pad-btn" data-tool="more" title="Menu PAD">⋮</button></div>
      </div>
      <div class="pad-wave-wrap"><div id="wave-${n}" class="waveform"></div><div class="pad-progress"><i id="progress-${n}"></i></div></div>
      <div class="pad-controls"><button class="pad-btn play" data-act="play">▶ PLAY</button><button class="pad-btn" data-act="stop">■ STOP</button><button class="pad-btn" data-act="cue">◉ CUE</button><button class="pad-btn" data-act="loop">⟳ LOOP</button><button class="pad-btn fade-in" data-act="fadeIn">↗ F.IN</button><button class="pad-btn fade-out" data-act="fadeOut">↘ F.OUT</button></div>
      <div class="pad-volume"><span>◖))</span><input id="vol-${n}" type="range" min="0" max="100" value="80"><b id="voltxt-${n}">80%</b></div>
      <div class="pad-add-row"><button class="add-music-btn" data-tool="add">＋ ADD MUSIC</button><button class="edit-name-btn" data-tool="edit" title="Edit nama">✎</button></div>
      <span class="state-dot"></span>
      <input id="file-${n}" type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac" hidden>
    </div>`;
    padsArea.appendChild(el); waveform($(`#wave-${n}`),42,index+1,color);
    const waveBars=$$(`#wave-${n} span`);
    const audio=new Audio(); audio.preload='metadata'; audio.playsInline=true; audio.setAttribute('playsinline','');
    const p={i:n,index,el,audio,persistId:`pad-${n}`,gain:null,node:null,analyser:null,analyserData:null,volume:.8,gainLevel:.8,fadeState:null,loop:false,objectUrl:null,fadeTimer:null,fileInput:$(`#file-${n}`),displayName:padNames[index],waveBars,smoothBars:waveBars.map(()=>0),peakBars:waveBars.map(()=>0)};
    p.connect=()=>{ initAudio(); if(!p.node){ p.node=audioCtx.createMediaElementSource(audio); p.gain=audioCtx.createGain(); p.analyser=audioCtx.createAnalyser(); p.analyser.fftSize=128; p.analyser.smoothingTimeConstant=.68; p.analyserData=new Uint8Array(p.analyser.frequencyBinCount); p.gain.gain.value=p.volume; p.node.connect(p.gain); p.gain.connect(p.analyser); p.analyser.connect(masterGain); } };
    p.load=(file, persist=true)=>{ if(!file)return; p.connect(); clearTimeout(p.fadeTimer); p.fadeState=null; audio.pause(); try{audio.currentTime=0;}catch{} if(p.objectUrl)URL.revokeObjectURL(p.objectUrl); p.objectUrl=URL.createObjectURL(file); audio.src=p.objectUrl; audio.loop=p.loop; el.classList.remove('playing','fading-out'); if(p.gain&&audioCtx){try{p.gain.gain.cancelScheduledValues(audioCtx.currentTime);p.gain.gain.setValueAtTime(p.volume,audioCtx.currentTime);}catch{}} p.gainLevel=p.volume; el.classList.add('loaded'); const name=cleanName(file.name); padNames[index]=name; saveNames(); $(`#name-${n}`).textContent=name; p.update(); resetPadWave(p); if(persist) dbPut('pads',{id:p.persistId,file,name,volume:p.volume,loop:p.loop}).catch(()=>{}); setStatus(`READY • PAD ${n} • ${name}`); };
    p.play=async restart=>{
      if(!audio.src){openPadFile(p);return;}
      p.connect();

      // Cancel any previous automation on this PAD before restarting it.
      clearTimeout(p.fadeTimer); p.fadeTimer=null; p.fadeState=null;
      const now=audioCtx.currentTime;
      try{
        p.gain.gain.cancelScheduledValues(now);
        // Every new PLAY starts from the beginning at zero gain, then fades in.
        p.gain.gain.setValueAtTime(0,now);
        p.gainLevel=0;
      }catch{}

      // Fade every other playing PAD out at the same time.
      autoFadeOtherPads(p);

      // PLAY always starts the selected PAD from 00:00.
      try{audio.currentTime=0;}catch{}
      el.classList.add('playing');
      el.classList.remove('fading-out');
      setPadActionState(p,'play',true);
      setPadActionState(p,'stop',false);
      setPadActionState(p,'fadeOut',false);
      setPadActionState(p,'fadeIn',true);
      try{
        if(audioCtx.state==='suspended') await audioCtx.resume();
        await audio.play();
        rampPadGain(p,p.volume,fadeMs,()=>setPadActionState(p,'fadeIn',false));
      }catch{
        setPadActionState(p,'fadeIn',false);
      }
      updateStatus();
    };
    p.stop=()=>{
      clearTimeout(p.fadeTimer); p.fadeState=null;
      audio.pause(); el.classList.remove('playing','fading-out');
      setPadActionState(p,'play',false);
      setPadActionState(p,'fadeIn',false);
      setPadActionState(p,'fadeOut',false);
      pulsePadAction(p,'stop',520);
      try{if(p.gain&&audioCtx){p.gain.gain.cancelScheduledValues(audioCtx.currentTime);p.gain.gain.setValueAtTime(p.volume,audioCtx.currentTime);}}catch{}
      p.gainLevel=p.volume; p.update(); updateStatus();
    };
    p.cue=()=>{ pulsePadAction(p,'cue',520); return p.play(true); };
    p.fadeIn=async(ms=fadeMs)=>{
      if(!audio.src)return;
      p.connect();
      clearTimeout(p.fadeTimer); p.fadeState=null;
      try{
        if(audio.paused) await audio.play();
        p.gain.gain.cancelScheduledValues(audioCtx.currentTime);
        p.gain.gain.setValueAtTime(0,audioCtx.currentTime);
        p.gainLevel=0;
      }catch{}
      el.classList.add('playing');
      setPadActionState(p,'play',true);
      setPadActionState(p,'fadeOut',false);
      setPadActionState(p,'fadeIn',true);
      rampPadGain(p,p.volume,ms,()=>setPadActionState(p,'fadeIn',false));
      updateStatus();
    };
    p.fadeOut=(ms=fadeMs, stopAtEnd=true)=>{
      if(!audio.src || !p.gain || audio.paused || audio.ended) return;
      el.classList.add('fading-out');
      setPadActionState(p,'fadeOut',true);
      setPadActionState(p,'fadeIn',false);
      const done=()=>{
        try{
          if(stopAtEnd){
            audio.pause();
            audio.currentTime=0; // Reset the previous PAD for the next cue.
          }
          const now=audioCtx.currentTime;
          p.gain.gain.cancelScheduledValues(now);
          p.gain.gain.setValueAtTime(stopAtEnd?0:p.volume,now);
        }catch{}
        p.gainLevel=stopAtEnd?0:p.volume;
        p.fadeState=null;
        p.fadeTimer=null;
        if(stopAtEnd) el.classList.remove('playing');
        if(stopAtEnd) setPadActionState(p,'play',false);
        setPadActionState(p,'fadeOut',false);
        el.classList.remove('fading-out');
        p.update(); updateStatus();
      };
      rampPadGain(p,0,ms,done);
      updateStatus();
    };
    p.setVolume=v=>{
      p.volume=Math.max(0,Math.min(1,Number(v)));
      clearTimeout(p.fadeTimer); p.fadeState=null; p.gainLevel=p.volume;
      if(p.gain&&audioCtx){
        const now=audioCtx.currentTime;
        try{p.gain.gain.cancelScheduledValues(now);}catch{}
        p.gain.gain.setTargetAtTime(p.volume,audioCtx.currentTime,.01);
      }
      const pct=Math.round(p.volume*100);
      $(`#vol-${n}`).value=pct;$(`#voltxt-${n}`).textContent=`${pct}%`;
    };
    p.reset=()=>{clearTimeout(p.fadeTimer);p.fadeState=null;audio.pause();try{audio.currentTime=0;}catch{}try{if(p.gain&&audioCtx){p.gain.gain.cancelScheduledValues(audioCtx.currentTime);p.gain.gain.setValueAtTime(p.volume,audioCtx.currentTime);}}catch{}p.gainLevel=p.volume;el.classList.remove('playing','fading-out');setPadActionState(p,'play',false);setPadActionState(p,'stop',false);setPadActionState(p,'cue',false);setPadActionState(p,'fadeIn',false);setPadActionState(p,'fadeOut',false);p.update();updateStatus();};
    p.clear=()=>{p.reset();dbDelete('pads',p.persistId).catch(()=>{});if(p.objectUrl)URL.revokeObjectURL(p.objectUrl);p.objectUrl=null;audio.removeAttribute('src');audio.load();p.loop=false;audio.loop=false;setPadActionState(p,'loop',false);syncLoopButton(p);el.classList.remove('loaded','playing');padNames[index]=defaultNames[index];saveNames();$(`#name-${n}`).textContent=padNames[index];p.update();};
    p.update=()=>{const d=audio.duration,c=audio.currentTime,valid=Number.isFinite(d)&&d>0;const pr=valid?Math.min(100,c/d*100):0;const remain=valid?Math.max(0,d-c):0;$(`#time-${n}`).textContent=`${fmt(c)} / ${fmt(d)}`;$(`#count-${n}`).textContent=valid?`−${fmt(remain)}`:'−00:00';$(`#progress-${n}`).style.width=`${pr}%`;};
    audio.addEventListener('timeupdate',p.update); audio.addEventListener('loadedmetadata',p.update); audio.addEventListener('ended',()=>{if(!p.loop){el.classList.remove('playing');setPadActionState(p,'play',false);}p.update();updateStatus();});
    el.addEventListener('click',async e=>{
      const b=e.target.closest('[data-act],[data-tool]'); if(!b)return; e.preventDefault();
      if(b.dataset.act){ const a=b.dataset.act; if(a==='play')await p.play(false); else if(a==='stop')p.stop(); else if(a==='cue')p.cue(); else if(a==='fadeIn')p.fadeIn(); else if(a==='fadeOut')p.fadeOut(); else if(a==='loop'){p.loop=!p.loop;audio.loop=p.loop;setPadActionState(p,'loop',p.loop);syncLoopButton(p);} return; }
      const t=b.dataset.tool; if(t==='add')openPadFile(p); else if(t==='edit')editPadName(p); else if(t==='more'){ if(confirm(`Kosongkan PAD ${n}?`))p.clear(); }
    });
    $(`#vol-${n}`).addEventListener('input',e=>p.setVolume(e.target.value/100));
    $(`#wave-${n}`).addEventListener('click',e=>{if(!Number.isFinite(audio.duration)||audio.duration<=0)return;const r=e.currentTarget.getBoundingClientRect();audio.currentTime=Math.max(0,Math.min(audio.duration,(e.clientX-r.left)/r.width*audio.duration));p.update();});
    p.fileInput.addEventListener('change',e=>{p.load(e.target.files[0]);e.target.value='';});
    pads.push(p);
  }
  for(let i=0;i<12;i++)createPad(i);
  installAudioDropZones();
  async function restoreLocalAudio(){
    const [savedPads,savedMusic]=await Promise.all([dbGetAll('pads'),dbGetAll('music')]);
    for(const rec of savedPads){
      const index=Math.max(0,Math.min(11,Number(String(rec.id).replace('pad-',''))-1));
      const p=pads[index];
      if(!p || !rec.file) continue;
      p.volume=Number.isFinite(rec.volume)?Math.max(0,Math.min(1,rec.volume)):.8;
      $(`#vol-${p.i}`).value=Math.round(p.volume*100); $(`#voltxt-${p.i}`).textContent=`${Math.round(p.volume*100)}%`;
      p.loop=!!rec.loop; setPadActionState(p,'loop',p.loop); syncLoopButton(p);
      p.load(rec.file,false);
    }
    for(const rec of savedMusic.sort((a,b)=>(a.order||0)-(b.order||0))){
      if(!rec.file) continue;
      const url=URL.createObjectURL(rec.file); musicObjectUrls.push(url);
      musicTracks.push({id:rec.id,name:rec.name||cleanName(rec.file.name||'UNTITLED'),artist:rec.artist||'LOCAL FILE',url,duration:rec.duration||'--:--',order:rec.order||Date.now()+Math.random(),addedAt:rec.addedAt||Date.now(),file:rec.file});
    }
    renderTracks();
    if(activeMusic<0&&musicTracks.length) activeMusic=0;
  }
  restoreLocalAudio().catch(()=>{});
  pads.forEach(resetPadWave);
  updatePadWaves();

  function setStatus(text,mode=''){const s=$('#statusLine');s.textContent=text;s.className='status-line'+(mode?' '+mode:'');}
  function updateStatus(){
    const playing=pads.filter(p=>!p.audio.paused&&!p.audio.ended&&p.audio.src);
    if(!playing.length){document.title='PRO-AUDIO-CONTROL';setStatus('READY • Tidak ada PAD yang sedang diputar');return;}
    document.title=`ON AIR • ${playing.map(p=>'PAD '+p.i).join(' + ')}`;setStatus(`ON AIR • ${playing.map(p=>`PAD ${p.i} — ${$(`#name-${p.i}`).textContent}`).join('  |  ')}`,'onair');
  }

  function updateClock(){
    const d=new Date(); const time=d.toLocaleTimeString('en-GB',{hour12:false}); const date=d.toLocaleDateString('id-ID',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
    $('#clock').textContent=time;$('#dateText').textContent=date;$('#panelTime').textContent=time.replaceAll(':','.');$('#panelDate').textContent=date;
    const elapsed=Date.now()-masterTimerStart, totalSec=Math.floor(elapsed/1000), h=Math.floor(totalSec/3600), m=Math.floor((totalSec%3600)/60), s=totalSec%60, f=Math.floor((Date.now()%1000)/40);
    $('#masterTimer').textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
  }
  updateClock();setInterval(updateClock,250);

  function updatePadCountdowns(){
    pads.forEach(p=>{
      if(!p.audio || !p.audio.src) return;
      p.update();
    });
    visualizerFrame=requestAnimationFrame(updatePadCountdowns);
  }
  updatePadCountdowns();


  const leds=$('#meterLeds'); for(let i=0;i<15;i++){const z=document.createElement('i');z.style.height=`${22+Math.random()*76}%`;leds.appendChild(z);}
  setInterval(()=>{const lv=master*100;[...leds.children].forEach((z,i)=>{const threshold=i/leds.children.length*100;z.style.opacity=lv>threshold?(.65+Math.random()*.35):.12;});},100);

  const AUDIO_FILE_PATTERN=/\.(mp3|wav|ogg|m4a|aac|flac|webm|opus)$/i;
  function isAudioFile(file){ return !!file && (String(file.type||'').startsWith('audio/') || AUDIO_FILE_PATTERN.test(String(file.name||''))); }
  function extractAudioFiles(dataTransfer){ return dataTransfer ? [...(dataTransfer.files||[])].filter(isAudioFile) : []; }
  function clearAudioDropIndicators(){
    $$('.pad.drag-over, .pads-area.drag-over-zone, .music-panel.drag-over-zone').forEach(el=>{
      el.classList.remove('drag-over','drag-over-zone');
    });
  }

  function setupFileDropZone(el, handler, className='drag-over'){
    if(!el) return;
    let active=false;
    const hasFiles=e=>{
      const dt=e.dataTransfer;
      return !!dt && ((dt.files&&dt.files.length) || [...(dt.items||[])].some(item=>item.kind==='file'));
    };
    const enter=()=>{ active=true; el.classList.add(className); };
    const leave=()=>{ active=false; el.classList.remove(className); };

    el.addEventListener('dragenter',e=>{
      if(!hasFiles(e)) return;
      e.preventDefault();
      enter();
    });
    el.addEventListener('dragover',e=>{
      if(!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.dataTransfer) e.dataTransfer.dropEffect='copy';
      enter();
    });
    el.addEventListener('dragleave',e=>{
      if(!hasFiles(e)) return;
      // Ignore the synthetic dragleave caused by moving between children.
      if(e.relatedTarget && el.contains(e.relatedTarget)) return;
      leave();
      clearAudioDropIndicators();
    });
    el.addEventListener('drop',e=>{
      if(!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      leave();
      clearAudioDropIndicators();
      const files=extractAudioFiles(e.dataTransfer);
      if(files.length) handler(files,e);
      // Render/update can change the DOM, so clear once more on the next frame.
      requestAnimationFrame(clearAudioDropIndicators);
      setTimeout(clearAudioDropIndicators,60);
    });
  }

  function installAudioDropZones(){
    pads.forEach(p=>setupFileDropZone(p.el, files=>{
      const slot=p.index;
      loadMany(files,slot);
      setStatus(`PAD ${p.i} • ${files.length} file audio dimuat mulai dari PAD ${p.i}`);
    },'drag-over'));

    setupFileDropZone(padsArea?.closest('.pads-area') || padsArea, files=>{
      const firstEmpty=pads.findIndex(p=>!p.audio.src);
      const start=firstEmpty>=0?firstEmpty:0;
      loadMany(files,start);
      setStatus(`AUDIO PADS • ${files.length} file dimuat mulai dari PAD ${start+1}`);
    },'drag-over-zone');

    setupFileDropZone($('.music-panel'), files=>{
      addMusicFiles(files);
      setStatus(`MUSIC PLAYER • ${files.length} file audio ditambahkan`);
    },'drag-over-zone');
  }

  // Prevent the browser from opening dropped audio files when dropped outside an app drop zone.
  window.addEventListener('dragover',e=>{
    if(e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  });
  window.addEventListener('drop',e=>{
    if(e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    clearAudioDropIndicators();
    setTimeout(clearAudioDropIndicators,60);
  }, true);
  window.addEventListener('dragend',clearAudioDropIndicators,true);
  window.addEventListener('blur',clearAudioDropIndicators);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) clearAudioDropIndicators();
  });

  function loadMany(files,startIndex=0){ [...files].slice(0,12-startIndex).forEach((f,i)=>pads[startIndex+i]?.load(f)); }
  function applyDeck(deck){activeDeck=deck;$$('.deck-chip').forEach(b=>b.classList.remove('active'));$(`#deck${deck==='ALL'?'All':deck}`).classList.add('active');pads.forEach(p=>p.el.style.display=deck==='ALL'||p.el.dataset.deck===deck?'block':'none');$$('.deck-buttons button').forEach(b=>b.classList.remove('active'));$(`#bc${deck==='ALL'?'All':deck}`).classList.add('active');}

  $('#deckAll').addEventListener('click',()=>applyDeck('ALL')); $('#deckA').addEventListener('click',()=>applyDeck('A')); $('#deckB').addEventListener('click',()=>applyDeck('B')); applyDeck('ALL');
  $('#addAllBtn').addEventListener('click',()=>multiFile.click()); $('#multiFile').addEventListener('change',e=>{loadMany(e.target.files,0);e.target.value='';});
  function stopMusicPlayer(resetPosition=true){
    if(musicFadeTimer){clearTimeout(musicFadeTimer);musicFadeTimer=null;}
    try{musicAudio.pause();}catch{}
    if(resetPosition){try{musicAudio.currentTime=0;}catch{}}
    // Cancel any pending gain automation so the next PLAY starts cleanly.
    if(audioCtx && musicGain){
      try{
        const now=audioCtx.currentTime;
        musicGain.gain.cancelScheduledValues(now);
        const target=Number($('#musicVolume').value)/100;
        musicGain.gain.setValueAtTime(target,now);
      }catch{}
    }
    $('#musicPlayBtn').textContent='▶';
    $('#musicProgressFill').style.width='0%';
    if(!musicTracks.length) $('#musicTime').textContent='00:00 / 00:00';
    renderTracks();
  }

  async function clearMusicPlayer(){
    const hadTracks=musicTracks.length>0;
    if(hadTracks && !confirm('Clear semua musik dari Music Player dan playlist?')) return;
    stopMusicPlayer(true);
    musicObjectUrls.forEach(url=>{try{URL.revokeObjectURL(url);}catch{}});
    musicObjectUrls=[];
    musicTracks=[];
    activeMusic=-1;
    await dbClear('music');
    $('#musicTitle').textContent='Belum ada musik';
    $('#musicArtist').textContent='Pilih ADD untuk memasukkan file audio';
    $('#musicTime').textContent='00:00 / 00:00';
    $('#musicProgressFill').style.width='0%';
    if(musicSeek){musicSeek.value=0;musicSeek.max=0;musicSeek.disabled=true;}
    $('#musicSeekStart').textContent='00:00';
    $('#musicSeekEnd').textContent='00:00';
    $('#albumArt').textContent='♪';
    renderTracks();
    setStatus('READY • Music Player dikosongkan');
  }

  function stopAllAudio(){
    pads.forEach(p=>p.stop());
    stopMusicPlayer(true);
    setStatus('STOP ALL • Semua PAD + Music Player dihentikan','alert');
  }

  $('#stopAllBtn').addEventListener('click',stopAllAudio); $('#stopActiveBtn').addEventListener('click',()=>pads.filter(p=>!p.audio.paused).forEach(p=>p.stop()));
  $('#loopAllBtn').addEventListener('click',()=>{globalLoop=!globalLoop;pads.forEach(p=>{p.loop=globalLoop;p.audio.loop=globalLoop;setPadActionState(p,'loop',p.loop);syncLoopButton(p);});$('#loopAllBtn').classList.toggle('active',globalLoop);});
  $('#muteAllBtn').addEventListener('click',()=>{pads.forEach(p=>p.setVolume(0));setStatus('MUTE ALL • Volume semua PAD = 0%','alert');});
  $('#clearAllBtn').addEventListener('click',()=>{if(!confirm('Clear semua materi audio, nama PAD, dan volume 12 PAD?'))return;pads.forEach(p=>{p.clear();p.setVolume(.8);p.loop=false;p.audio.loop=false;setPadActionState(p,'loop',false);syncLoopButton(p);});globalLoop=false;$('#loopAllBtn').classList.remove('active');setStatus('READY • Semua PAD dikosongkan');});

  $('#masterVolumeBottom').addEventListener('input',e=>setMaster(Number(e.target.value)/100));
  let savedMaster=.85; try{const mv=Number(localStorage.getItem('proAudioControl.masterVolume')); if(Number.isFinite(mv)) savedMaster=Math.max(0,Math.min(100,mv))/100;}catch{} setMaster(savedMaster,false);
  const settingsModal=$('#settingsModal');
  const themeOptions=[...document.querySelectorAll('.theme-option')];
  const themeNames=['broadcast','studio','midnight','emerald','amber'];
  function applyTheme(theme, remember=true){
    const safe=themeNames.includes(theme)?theme:'broadcast';
    themeNames.forEach(name=>document.body.classList.toggle(`theme-${name}`,safe===name));
    document.body.dataset.theme=safe;
    themeOptions.forEach(btn=>btn.classList.toggle('active',btn.dataset.theme===safe));
    if(remember){try{localStorage.setItem('proAudioControl.theme',safe);}catch{}}
  }
  function openSettings(){settingsModal.hidden=false;settingsModal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');}
  function closeSettings(){settingsModal.hidden=true;settingsModal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');}
  let savedTheme='broadcast';
  try{const t=localStorage.getItem('proAudioControl.theme'); if(themeNames.includes(t))savedTheme=t;}catch{}
  applyTheme(savedTheme,false);
  $('#settingsBtn').addEventListener('click',openSettings);
  $('#settingsCloseBtn').addEventListener('click',closeSettings);
  $('#settingsDoneBtn').addEventListener('click',closeSettings);
  settingsModal.querySelector('[data-settings-close]')?.addEventListener('click',closeSettings);
  themeOptions.forEach(btn=>btn.addEventListener('click',()=>applyTheme(btn.dataset.theme,true)));
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && !settingsModal.hidden)closeSettings();});
  $('#minBtn').addEventListener('click',()=>window.electronAPI?.minimize());
  $('#maxBtn').addEventListener('click',()=>window.electronAPI?.toggleMaximize());
  $('#closeBtn').addEventListener('click',()=>window.electronAPI?.close());

  $('#crossfade').addEventListener('input',e=>{const x=Number(e.target.value)/100;pads.forEach(p=>{if(p.audio.paused)return;const deckLevel=p.index<6?1-x:x;p.setVolume(Math.min(p.volume,deckLevel));});});
  $('#fadeDown').addEventListener('click',()=>{fadeMs=Math.max(500,fadeMs-500);$('#fadeTimeValue').textContent=`00:${String(fadeMs/1000).padStart(2,'0')}`;});
  $('#fadeUp').addEventListener('click',()=>{fadeMs=Math.min(10000,fadeMs+500);$('#fadeTimeValue').textContent=`00:${String(fadeMs/1000).padStart(2,'0')}`;});
  $('#bcA').addEventListener('click',()=>applyDeck('A')); $('#bcB').addEventListener('click',()=>applyDeck('B')); $('#bcAll').addEventListener('click',()=>applyDeck('ALL'));

  function sortTracks(){
    const mode=$('#playlistMode').value;
    if(mode==='alpha')musicTracks.sort((a,b)=>a.name.localeCompare(b.name));
    else if(mode==='recent')musicTracks.sort((a,b)=>b.addedAt-a.addedAt);
    else musicTracks.sort((a,b)=>a.order-b.order);
  }

  async function persistMusicOrder(){
    const base=Date.now();
    for(let i=0;i<musicTracks.length;i++){
      musicTracks[i].order=base+i;
      const t=musicTracks[i];
      await dbPut('music',{id:t.id,file:t.file,name:t.name,artist:t.artist,duration:t.duration,order:t.order,addedAt:t.addedAt}).catch(()=>{});
    }
  }

  function setPlaylistManualMode(){
    const mode=$('#playlistMode');
    if(mode.value!=='default'){
      mode.value='default';
    }
  }

  function syncActiveMusicById(activeId){
    if(activeId){
      const idx=musicTracks.findIndex(t=>t.id===activeId);
      activeMusic=idx>=0?idx:Math.max(0,Math.min(activeMusic,musicTracks.length-1));
    }else if(activeMusic>=musicTracks.length){
      activeMusic=musicTracks.length?musicTracks.length-1:-1;
    }
  }

  function renderTracks(){
    const list=$('#trackList');
    const activeId=musicTracks[activeMusic]?.id || null;
    list.innerHTML='';
    sortTracks();
    syncActiveMusicById(activeId);
    $('#trackCount').textContent=`${musicTracks.length} Track${musicTracks.length===1?'':'s'}`;
    musicTracks.forEach((t,i)=>{
      const row=document.createElement('div');
      row.className='track'+(i===activeMusic?' active':'');
      row.dataset.trackId=t.id;
      row.innerHTML=`<span class="num">${String(i+1).padStart(2,'0')}</span><span class="drag-handle" title="Geser untuk mengubah urutan" aria-label="Geser ${esc(t.name)}">⋮⋮</span><span class="track-info"><strong>${esc(t.name)}</strong><span>${esc(t.artist)}</span></span><span class="dur">${t.duration||'--:--'}</span><button class="track-delete" type="button" title="Hapus lagu" aria-label="Hapus ${esc(t.name)}">×</button>`;
      row.addEventListener('dblclick',(e)=>{ if(e.target.closest('.track-delete,.drag-handle')) return; playMusic(i); });
      row.addEventListener('click',(e)=>{ if(e.target.closest('.track-delete,.drag-handle')) return; activeMusic=i;renderTracks(); });
      row.querySelector('.track-delete').addEventListener('click',(e)=>{e.stopPropagation(); removeMusicTrack(t.id);});
      list.appendChild(row);
    });
    installPlaylistDrag(list);
  }

  function installPlaylistDrag(list){
    let drag=null;

    const clearDragVisuals=()=>{
      $$('.track.dragging, .track.drag-over-before, .track.drag-over-after',list).forEach(el=>el.classList.remove('dragging','drag-over-before','drag-over-after'));
    };

    const finish=async(cancelled=false)=>{
      if(!drag)return;
      const id=drag.id;
      const moved=drag.moved;
      drag.handle.releasePointerCapture?.(drag.pointerId);
      clearDragVisuals();
      drag=null;
      if(!cancelled && moved){
        setPlaylistManualMode();
        await persistMusicOrder();
        // Re-render to refresh numbering and active-row state without changing the selected song.
        renderTracks();
        setStatus('PLAYLIST • Urutan lagu diperbarui');
      }
    };

    const onPointerMove=(e)=>{
      if(!drag || e.pointerId!==drag.pointerId)return;
      const dx=e.clientX-drag.startX, dy=e.clientY-drag.startY;
      if(!drag.started){
        if(Math.hypot(dx,dy)<5)return;
        drag.started=true;
        drag.row.classList.add('dragging');
        setPlaylistManualMode();
      }
      drag.moved=true;
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.track');
      if(!target || !list.contains(target) || target===drag.row)return;
      clearDragVisuals();
      drag.row.classList.add('dragging');
      const rect=target.getBoundingClientRect();
      const before=e.clientY < rect.top + rect.height/2;
      target.classList.add(before?'drag-over-before':'drag-over-after');
      const from=musicTracks.findIndex(t=>t.id===drag.id);
      const toId=target.dataset.trackId;
      const to=musicTracks.findIndex(t=>t.id===toId);
      if(from<0 || to<0 || from===to)return;
      const [item]=musicTracks.splice(from,1);
      let insertIndex=musicTracks.findIndex(t=>t.id===toId);
      if(!before)insertIndex+=1;
      musicTracks.splice(insertIndex,0,item);

      if(before){list.insertBefore(drag.row,target);}
      else if(target.nextSibling)list.insertBefore(drag.row,target.nextSibling);
      else list.appendChild(drag.row);
      clearDragVisuals();
      drag.row.classList.add('dragging');
    };

    const onPointerUp=e=>{if(drag&&e.pointerId===drag.pointerId)finish(false);};
    const onPointerCancel=e=>{if(drag&&e.pointerId===drag.pointerId)finish(true);};

    $$('.drag-handle',list).forEach(handle=>{
      handle.addEventListener('pointerdown',e=>{
        if(e.button!==undefined && e.button!==0)return;
        e.preventDefault();
        const row=handle.closest('.track');
        if(!row)return;
        clearDragVisuals();
        drag={id:row.dataset.trackId,row,handle,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,started:false,moved:false};
        try{handle.setPointerCapture(e.pointerId);}catch{}
      });
      handle.addEventListener('pointermove',onPointerMove);
      handle.addEventListener('pointerup',onPointerUp);
      handle.addEventListener('pointercancel',onPointerCancel);
      handle.addEventListener('lostpointercapture',()=>{if(drag && !drag.moved)finish(true);});
    });
  }
  async function removeMusicTrack(trackId){
    const idx=musicTracks.findIndex(t=>t.id===trackId);
    if(idx<0) return;
    const track=musicTracks[idx];
    const wasActive=idx===activeMusic;
    if(!confirm(`Hapus "${track.name}" dari Music Player?`)) return;
    if(wasActive){
      stopMusicPlayer(true);
    }
    musicTracks.splice(idx,1);
    try{await dbDelete('music',track.id);}catch{}
    if(track.url){
      try{URL.revokeObjectURL(track.url);}catch{}
      musicObjectUrls=musicObjectUrls.filter(u=>u!==track.url);
    }
    if(!musicTracks.length){
      activeMusic=-1;
      $('#musicTitle').textContent='Belum ada musik';
      $('#musicArtist').textContent='Pilih ADD untuk memasukkan file audio';
      $('#musicTime').textContent='00:00 / 00:00';
      if(musicSeek){musicSeek.value=0;musicSeek.max=0;musicSeek.disabled=true;}
      $('#musicSeekStart').textContent='00:00';
      $('#musicSeekEnd').textContent='00:00';
      $('#albumArt').textContent='♪';
    }else if(wasActive){
      activeMusic=Math.min(idx,musicTracks.length-1);
      const next=musicTracks[activeMusic];
      $('#musicTitle').textContent=next.name;
      $('#musicArtist').textContent=next.artist;
      $('#musicTime').textContent=`00:00 / ${next.duration||'00:00'}`;
      $('#musicProgressFill').style.width='0%';
      if(musicSeek){musicSeek.value=0;musicSeek.max=0;musicSeek.disabled=true;}
      $('#musicSeekStart').textContent='00:00';
      $('#musicSeekEnd').textContent=next.duration||'00:00';
    }else if(idx<activeMusic){
      activeMusic-=1;
    }
    renderTracks();
    setStatus(`MUSIC PLAYER • Dihapus: ${track.name}`);
  }

  function addMusicFiles(files){
    [...files].forEach((file)=>{
      const url=URL.createObjectURL(file); musicObjectUrls.push(url);
      const temp=new Audio();temp.preload='metadata';
      const track={id:(crypto.randomUUID?crypto.randomUUID():`m-${Date.now()}-${Math.random()}`),name:cleanName(file.name),artist:'LOCAL FILE',url,duration:'--:--',order:Date.now()+Math.random(),addedAt:Date.now(),file};
      const metaUrl=URL.createObjectURL(file);
      temp.addEventListener('loadedmetadata',()=>{track.duration=fmt(temp.duration);dbPut('music',{id:track.id,file,name:track.name,artist:track.artist,duration:track.duration,order:track.order,addedAt:track.addedAt}).catch(()=>{});renderTracks();URL.revokeObjectURL(metaUrl);});temp.src=metaUrl;
      musicTracks.push(track); dbPut('music',{id:track.id,file,name:track.name,artist:track.artist,duration:track.duration,order:track.order,addedAt:track.addedAt}).catch(()=>{});
    });
    renderTracks(); if(activeMusic<0&&musicTracks.length){activeMusic=0;renderTracks();}
  }
  function playMusic(i){
    if(i<0||i>=musicTracks.length)return;
    initAudio();
    activeMusic=i;
    const t=musicTracks[i];
    const target=Number($('#musicVolume').value)/100;
    if(musicFadeTimer){clearTimeout(musicFadeTimer);musicFadeTimer=null;}
    try{
      musicGain.gain.cancelScheduledValues(audioCtx.currentTime);
      musicGain.gain.setValueAtTime(0,audioCtx.currentTime);
    }catch{}
    musicAudio.src=t.url;
    musicAudio.load();
    try{musicAudio.currentTime=0;}catch{}
    $('#musicTitle').textContent=t.name;
    $('#musicArtist').textContent=t.artist;
    $('#musicTime').textContent=`00:00 / ${t.duration||'00:00'}`;
    if(musicSeek){musicSeek.value=0;musicSeek.disabled=true;}
    $('#musicSeekStart').textContent='00:00';
    $('#musicSeekEnd').textContent=t.duration||'00:00';
    $('#musicProgressFill').style.width='0%';
    renderTracks();
    musicAudio.play().catch(()=>{});
    fadeGain(musicGain,0,target,fadeMs);
  }
  function fadeOutMusic(ms=fadeMs){
    if(musicAudio.paused || !musicGain || !audioCtx) return;
    if(musicFadeTimer) clearTimeout(musicFadeTimer);
    const current=musicGain.gain.value;
    musicFadeTimer=fadeGain(musicGain,current,0,ms,()=>{
      musicAudio.pause();
      try{musicGain.gain.setValueAtTime(Number($('#musicVolume').value)/100,audioCtx.currentTime);}catch{}
      $('#musicPlayBtn').textContent='▶';
      musicFadeTimer=null;
    });
  }

  $('#musicFadeOutBtn').addEventListener('click',()=>fadeOutMusic());
  $('#musicClearAllBtn').addEventListener('click',clearMusicPlayer);
  $('#musicStopBtn').addEventListener('click',()=>stopMusicPlayer(true));
  $('#musicAddBtn').addEventListener('click',()=>musicFileInput.click()); musicFileInput.addEventListener('change',e=>{addMusicFiles(e.target.files);e.target.value='';}); $('#playlistMode').addEventListener('change',renderTracks);
  $('#musicPlayBtn').addEventListener('click',()=>{if(!musicTracks.length){musicFileInput.click();return;}if(musicAudio.paused){if(activeMusic<0)activeMusic=0;playMusic(activeMusic);}else musicAudio.pause();});
  $('#prevBtn').addEventListener('click',()=>{if(!musicTracks.length)return;activeMusic=(activeMusic-1+musicTracks.length)%musicTracks.length;playMusic(activeMusic);});
  $('#nextBtn').addEventListener('click',()=>{if(!musicTracks.length)return;activeMusic=musicShuffle?Math.floor(Math.random()*musicTracks.length):(activeMusic+1)%musicTracks.length;playMusic(activeMusic);});
  $('#shuffleBtn').addEventListener('click',()=>{musicShuffle=!musicShuffle;$('#shuffleBtn').classList.toggle('active',musicShuffle);});
  $('#repeatBtn').addEventListener('click',()=>{musicRepeat=!musicRepeat;$('#repeatBtn').classList.toggle('active',musicRepeat);});
  $('#musicVolume').addEventListener('input',e=>{
    const v=Number(e.target.value)/100;
    initAudio();
    musicAudio.volume=1;
    if(musicGain&&audioCtx)musicGain.gain.setTargetAtTime(v,audioCtx.currentTime,.01);
    $('#musicVolText').textContent=`${e.target.value}%`;
  });
  musicAudio.volume=1;
  musicAudio.addEventListener('play',()=>{$('#musicPlayBtn').textContent='❚❚';});
  musicAudio.addEventListener('pause',()=>{$('#musicPlayBtn').textContent='▶';});
  musicAudio.addEventListener('loadedmetadata',()=>{
    const d=Number.isFinite(musicAudio.duration)?musicAudio.duration:0;
    if(musicSeek){musicSeek.max=d;musicSeek.value=Math.min(musicAudio.currentTime||0,d);musicSeek.disabled=!d;}
    $('#musicSeekEnd').textContent=fmt(d);
    $('#musicTime').textContent=`${fmt(musicAudio.currentTime)} / ${fmt(d)}`;
  });
  musicAudio.addEventListener('durationchange',()=>{
    const d=Number.isFinite(musicAudio.duration)?musicAudio.duration:0;
    if(musicSeek){musicSeek.max=d;musicSeek.disabled=!d;}
    $('#musicSeekEnd').textContent=fmt(d);
  });
  musicAudio.addEventListener('timeupdate',()=>{
    const d=Number.isFinite(musicAudio.duration)?musicAudio.duration:0;
    const cur=Number.isFinite(musicAudio.currentTime)?musicAudio.currentTime:0;
    const p=d?cur/d*100:0;
    $('#musicProgressFill').style.width=`${p}%`;
    $('#musicTime').textContent=`${fmt(cur)} / ${fmt(d)}`;
    $('#musicSeekStart').textContent=fmt(cur);
    $('#musicSeekEnd').textContent=fmt(d);
    if(musicSeek && document.activeElement!==musicSeek) musicSeek.value=cur;
  });
  musicAudio.addEventListener('seeked',()=>{
    const cur=Number.isFinite(musicAudio.currentTime)?musicAudio.currentTime:0;
    if(musicSeek)musicSeek.value=cur;
  });
  if(musicSeek){
    musicSeek.addEventListener('input',()=>{
      const d=Number.isFinite(musicAudio.duration)?musicAudio.duration:0;
      if(!d)return;
      const next=Math.max(0,Math.min(d,Number(musicSeek.value)));
      try{musicAudio.currentTime=next;}catch{}
      $('#musicSeekStart').textContent=fmt(next);
      $('#musicTime').textContent=`${fmt(next)} / ${fmt(d)}`;
      $('#musicProgressFill').style.width=`${next/d*100}%`;
    });
    musicSeek.addEventListener('change',()=>{
      const d=Number.isFinite(musicAudio.duration)?musicAudio.duration:0;
      if(!d)return;
      const next=Math.max(0,Math.min(d,Number(musicSeek.value)));
      try{musicAudio.currentTime=next;}catch{}
    });
  }
  musicAudio.addEventListener('ended',()=>{if(musicRepeat){musicAudio.currentTime=0;if(musicSeek)musicSeek.value=0;musicAudio.play();}else if(musicTracks.length){$('#nextBtn').click();}});
  const visualizerCanvas=$('#visualizerCanvas');
  const visualizerCtx=visualizerCanvas?.getContext('2d');
  function resizeVisualizer(){
    if(!visualizerCanvas||!visualizerCtx)return;
    const rect=visualizerCanvas.getBoundingClientRect();
    const dpr=Math.min(window.devicePixelRatio||1,2);
    visualizerCanvas.width=Math.max(1,Math.floor(rect.width*dpr));
    visualizerCanvas.height=Math.max(1,Math.floor(rect.height*dpr));
    visualizerCtx.setTransform(dpr,0,0,dpr,0,0);
  }
  function drawVisualizer(){
    if(!visualizerCanvas||!visualizerCtx){return;}
    const w=visualizerCanvas.clientWidth,h=visualizerCanvas.clientHeight;
    visualizerCtx.clearRect(0,0,w,h);
    visualizerCtx.fillStyle='#06111b';visualizerCtx.fillRect(0,0,w,h);
    const bars=34;
    let data=new Uint8Array(bars);
    if(analyser){data=new Uint8Array(analyser.frequencyBinCount);analyser.getByteFrequencyData(data);}
    for(let i=0;i<bars;i++){
      const src=Math.floor(i*(data.length/bars));
      const val=(data[src]||0)/255;
      const pulse=(musicAudio.paused && pads.every(p=>p.audio.paused))?0.04:val;
      const bh=Math.max(3,pulse*(h-8));
      const bw=Math.max(2,(w-2*(bars-1))/bars);
      const x=i*(bw+2);
      const grad=visualizerCtx.createLinearGradient(0,h-bh,0,h);
      grad.addColorStop(0,'#9a6dff');grad.addColorStop(.45,'#20c8ff');grad.addColorStop(1,'#08e6a4');
      visualizerCtx.fillStyle=grad;
      visualizerCtx.fillRect(x,h-bh,bw,bh);
    }
    requestAnimationFrame(drawVisualizer);
  }
  window.addEventListener('resize',resizeVisualizer);
  resizeVisualizer();drawVisualizer();
  waveform($('#musicWave'),74,9,'#2bbfff'); renderTracks();

  window.addEventListener('beforeunload',()=>musicObjectUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch{}}));
  document.addEventListener('keydown',e=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
    if(e.key==='Escape'){pads.forEach(p=>p.stop());return;}
    if(e.code.startsWith('Digit')){const d=e.key==='0'?10:Number(e.key);if(d>=1&&d<=10)pads[d-1].play(false);return;}
    if(e.key==='ArrowUp'){e.preventDefault();setMaster(master+.05);return;}
    if(e.key==='ArrowDown'){e.preventDefault();setMaster(master-.05);return;}
    if(e.key.toLowerCase()==='p'){e.preventDefault();$('#musicPlayBtn').click();return;}
  });
})();
