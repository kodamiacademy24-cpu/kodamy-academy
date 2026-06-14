// KODAMI APP — Core

// Fondo
const heroBg = document.getElementById('heroBg');
const bgImg = new Image();
bgImg.onload = () => heroBg && heroBg.classList.add('loaded');
bgImg.src = 'fondo.png';

// Mascotas
['mascotSensei','mascotNova'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    if(el.complete) el.classList.add('img-ready');
    else el.addEventListener('load', () => el.classList.add('img-ready'));
  }
});

// Cursor
if (!isMobile) {
  document.body.classList.add('has-mouse');
  const wrap = document.getElementById('cursorWrap');
  let mx=0, my=0, cx=0, cy=0, cursorState='idle';
  document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; });
  (function anim(){
    cx += (mx-cx)*.2; cy += (my-cy)*.2;
    if (wrap) wrap.style.transform = `translate(${cx}px,${cy}px)`;
    requestAnimationFrame(anim);
  })();
  const hoverSel = 'a,button,.materia-tab,.pill,.card-btn,.search-btn,.chat-send,.chat-action-btn,.chat-action-icon,.mascot,[onclick]';
  const textSel = 'input,textarea';
  document.addEventListener('mouseover', e => {
    if (e.target.closest(textSel)) setState('text-mode');
    else if (e.target.closest(hoverSel)) setState('hovering');
    else setState('idle');
  });
  document.addEventListener('mouseout', e => { if (!e.relatedTarget || !e.relatedTarget.closest) setState('idle'); });
  document.querySelectorAll('input,textarea').forEach(el => {
    el.addEventListener('focus', () => setState('text-mode'));
    el.addEventListener('blur', () => setState('idle'));
  });
  function setState(s) {
    if (cursorState === s || !wrap) return;
    wrap.classList.remove(cursorState);
    wrap.classList.add(s);
    cursorState = s;
  }
  window.setCursorDragging = d => setState(d?'dragging':'idle');
  window.setCursorTheme = a => {
    if (!wrap) return;
    a === 'nova' ? wrap.classList.add('nova-active') : wrap.classList.remove('nova-active');
  };
} else {
  window.setCursorDragging = () => {};
  window.setCursorTheme = () => {};
}

// Estrellas
const sc = document.getElementById('starsCanvas');
if (sc) {
  const sx = sc.getContext('2d');
  function resize() { sc.width = window.innerWidth; sc.height = window.innerHeight; }
  resize(); window.addEventListener('resize', resize);
  const n = isMobile ? 30 : 100;
  const stars = Array.from({length:n}, () => ({
    x: Math.random()*window.innerWidth, y: Math.random()*window.innerHeight,
    size: Math.random()*1.2+.2, opacity: Math.random()*.6+.1, dir: Math.random()>.5?1:-1
  }));
  const meteors = [];
  if (!isMobile) setInterval(() => { if (meteors.length < 5) meteors.push({x:Math.random()*window.innerWidth, y:Math.random()*window.innerHeight*.3, len:Math.random()*140+60, speed:Math.random()*7+4, opacity:1, angle:Math.PI/4}); }, 2500);
  function draw() {
    sx.clearRect(0,0,sc.width,sc.height);
    stars.forEach(s => { s.opacity += .003*s.dir; if (s.opacity >= .8 || s.opacity <= .05) s.dir *= -1; sx.beginPath(); sx.arc(s.x,s.y,s.size,0,Math.PI*2); sx.fillStyle = `rgba(200,169,110,${s.opacity})`; sx.fill(); });
    for (let i = meteors.length-1; i >= 0; i--) {
      const m = meteors[i];
      const gx = sx.createLinearGradient(m.x,m.y,m.x-Math.cos(m.angle)*m.len,m.y-Math.sin(m.angle)*m.len);
      gx.addColorStop(0, `rgba(255,220,150,${m.opacity})`); gx.addColorStop(1,'rgba(200,169,110,0)');
      sx.beginPath(); sx.moveTo(m.x,m.y); sx.lineTo(m.x-Math.cos(m.angle)*m.len,m.y-Math.sin(m.angle)*m.len);
      sx.strokeStyle = gx; sx.lineWidth = 2; sx.stroke();
      m.x += Math.cos(m.angle)*m.speed; m.y += Math.sin(m.angle)*m.speed; m.opacity -= .018;
      if (m.opacity <= 0 || m.x > sc.width+100 || m.y > sc.height+100) meteors.splice(i,1);
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// Parallax
if (!isMobile) {
  const heroBgEl = document.getElementById('heroBg');
  if (heroBgEl) {
    document.addEventListener('mousemove', e => {
      const x = (e.clientX/window.innerWidth-.5)*10, y = (e.clientY/window.innerHeight-.5)*10;
      heroBgEl.style.transform = `translate(${x}px,${y}px) scale(1.02)`;
    });
  }
}

// Partículas
if (!isMobile) {
  document.addEventListener('click', e => {
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('div'); p.className = 'particle';
      const angle = Math.random()*Math.PI*2, dist = 30+Math.random()*50;
      p.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;width:${3+Math.random()*4}px;height:${3+Math.random()*4}px;background:${Math.random()>.5?'var(--craft)':'rgba(200,169,110,.5)'};--tx:${Math.cos(angle)*dist}px;--ty:${Math.sin(angle)*dist}px;`;
      document.body.appendChild(p); setTimeout(() => p.remove(), 800);
    }
  });
}

// Mascotas drag
if (!isMobile) {
  const WAYPOINTS = [{x:0,y:0},{x:.5,y:0},{x:1,y:0},{x:1,y:.5},{x:1,y:1},{x:.5,y:1},{x:0,y:1},{x:0,y:.5}];
  const MS = 75, EDGE = 10;
  class MascotController {
    constructor(el, agent) {
      this.el = el; this.agent = agent;
      if (!el) return;
      this.x = Math.random()*(window.innerWidth-MS); this.y = Math.random()*(window.innerHeight-MS);
      this.targetX = this.x; this.targetY = this.y;
      this.state = 'idle'; this.facingRight = true; this.pauseTimer = 0; this.speed = 1.5+Math.random();
      this.el.style.left = this.x+'px'; this.el.style.top = this.y+'px';
      this.el.style.position = 'fixed';
      this.pickNextWaypoint(); this.setupDrag();
      this.el.addEventListener('click', () => { if (this.state !== 'dragging' && this.state !== 'returning') openChat(this.agent); });
    }
    pickNextWaypoint() {
      const wp = WAYPOINTS[Math.floor(Math.random()*WAYPOINTS.length)];
      const vw = window.innerWidth, vh = window.innerHeight;
      this.targetX = wp.x*(vw-MS-EDGE*2)+EDGE; this.targetY = wp.y*(vh-MS-EDGE*2)+EDGE; this.state = 'moving';
    }
    update() {
      if (!this.el || this.state === 'in-chat' || this.state === 'dragging') return;
      if (this.state === 'idle') { this.pauseTimer--; if (this.pauseTimer <= 0) this.pickNextWaypoint(); return; }
      const dx = this.targetX-this.x, dy = this.targetY-this.y, dist = Math.sqrt(dx*dx+dy*dy);
      if (dist < 3) { this.x=this.targetX; this.y=this.targetY; this.state='idle'; this.pauseTimer=60+Math.random()*120; }
      else {
        const spd = this.state === 'returning' ? 4 : this.speed;
        this.x += dx/dist*spd; this.y += dy/dist*spd;
        const r = dx>0; if (r !== this.facingRight) { this.facingRight=r; this.el.style.transform=r?'scaleX(1)':'scaleX(-1)'; }
      }
      this.el.style.left = this.x+'px'; this.el.style.top = this.y+'px';
    }
    setupDrag() {
      if (!this.el) return;
      let sX, sY, moved, offX, offY;
      const onDown = e => {
        if (this.state === 'in-chat') return; e.preventDefault();
        const cx = e.touches?e.touches[0].clientX:e.clientX, cy = e.touches?e.touches[0].clientY:e.clientY;
        offX = cx-this.x; offY = cy-this.y; sX=cx; sY=cy; moved=false;
        this.state='dragging'; this.el.classList.add('dragging-mascot'); setCursorDragging(true);
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, {passive:false}); document.addEventListener('touchend', onUp);
      };
      const onMove = e => {
        e.preventDefault();
        const cx = e.touches?e.touches[0].clientX:e.clientX, cy = e.touches?e.touches[0].clientY:e.clientY;
        if (Math.abs(cx-sX)>5||Math.abs(cy-sY)>5) moved=true;
        this.x = Math.max(0,Math.min(window.innerWidth-MS,cx-offX));
        this.y = Math.max(0,Math.min(window.innerHeight-MS,cy-offY));
        if (this.el) { this.el.style.left=this.x+'px'; this.el.style.top=this.y+'px'; }
      };
      const onUp = () => {
        document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp);
        document.removeEventListener('touchmove',onMove); document.removeEventListener('touchend',onUp);
        if (!this.el) return;
        this.el.classList.remove('dragging-mascot'); setCursorDragging(false);
        if (!moved) { this.state='idle'; return; }
        const vw=window.innerWidth, vh=window.innerHeight;
        let bd=Infinity, bw=WAYPOINTS[0];
        WAYPOINTS.forEach(wp => { const wx=wp.x*(vw-MS-EDGE*2)+EDGE, wy=wp.y*(vh-MS-EDGE*2)+EDGE, d=Math.sqrt((this.x-wx)**2+(this.y-wy)**2); if (d<bd) { bd=d; bw=wp; } });
        this.targetX=bw.x*(vw-MS-EDGE*2)+EDGE; this.targetY=bw.y*(vh-MS-EDGE*2)+EDGE; this.state='returning';
      };
      this.el.addEventListener('mousedown', onDown);
      this.el.addEventListener('touchstart', onDown, {passive:false});
    }
    enterChat() { this.state='in-chat'; if (this.el) this.el.classList.add('in-chat'); }
    exitChat() { if (this.el) { this.el.classList.remove('in-chat'); this.state='moving'; this.pickNextWaypoint(); } }
  }
  window.senseiCtrl = new MascotController(document.getElementById('mascotSensei'), 'sensei');
  window.novaCtrl = new MascotController(document.getElementById('mascotNova'), 'nova');
  (function loop(){ if (window.senseiCtrl) window.senseiCtrl.update(); if (window.novaCtrl) window.novaCtrl.update(); requestAnimationFrame(loop); })();
} else {
  window.senseiCtrl = { enterChat:()=>{}, exitChat:()=>{} };
  window.novaCtrl = { enterChat:()=>{}, exitChat:()=>{} };
  // Móvil: mascotas estáticas reducidas
  ['mascotSensei','mascotNova'].forEach((id,i) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('mobile-static');
      el.style.bottom = '90px';
      el.style.top = 'auto';
      el.style.position = 'fixed';
      el.style.width = '40px'; el.style.height = '40px';
      if (i===0) { el.style.left = '10px'; el.style.right = 'auto'; }
      else { el.style.right = '10px'; el.style.left = 'auto'; }
      el.addEventListener('click', () => openChat(i===0?'sensei':'nova'));
    }
  });
}

// Tilt 3D
if (!isMobile) {
  document.addEventListener('mousemove', e => {
    document.querySelectorAll('.resource-card').forEach(card => {
      const r = card.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const x = (e.clientX-r.left)/r.width-.5, y = (e.clientY-r.top)/r.height-.5;
        card.style.transform = `perspective(800px) rotateY(${x*8}deg) rotateX(${-y*8}deg) translateY(-4px)`;
      } else { card.style.transform = ''; }
    });
  });
}

// Stats counter + reveal
const obs = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) {
    e.target.classList.add('visible');
    if (e.target.id === 'statsBar') {
      document.querySelectorAll('[data-target]').forEach(el => {
        const t = +el.dataset.target; let c = 0;
        const iv = setInterval(() => { c = Math.min(c+t/40, t); el.textContent = Math.floor(c); if (c >= t) clearInterval(iv); }, 35);
      });
    }
  }
}), { threshold: .1 });
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
