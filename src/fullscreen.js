// CSS fills the viewport on iPhone/webviews without Element Fullscreen support.
// Native fullscreen is requested directly from the button's user gesture.
export function setupFullscreen({document,window,onChange=()=>{}}) {
  const studio=document.querySelector('.studio'),button=document.getElementById('fullscreen-toggle');
  let active=false,ownedNative=false,scroll={x:0,y:0},focusBefore;
  const exitNative=()=>{
    if(document.fullscreenElement===studio&&document.exitFullscreen) {
      try {Promise.resolve(document.exitFullscreen()).catch(()=>{});}catch{/* CSS exit remains available. */}
    }
  };
  function setActive(value) {
    if(active===value)return;
    active=value;document.body.classList.toggle('practice-fullscreen',active);
    button.textContent=active?'退出全螢幕':'全螢幕';
    button.setAttribute('aria-pressed',String(active));
    studio.setAttribute('aria-label',active?'全螢幕 3D 教練互動畫面':'3D 教練互動畫面');
    onChange(active);
    if(!active){window.scrollTo(scroll.x,scroll.y);focusBefore?.focus?.({preventScroll:true});}
  }
  function exit(){setActive(false);exitNative();}
  function enter() {
    scroll={x:window.scrollX,y:window.scrollY};focusBefore=document.activeElement;
    setActive(true);
    if(studio.requestFullscreen) {
      try {Promise.resolve(studio.requestFullscreen()).then(()=>{if(!active)exitNative();}).catch(()=>{/* Keep viewport fullscreen. */});}
      catch{/* Keep viewport fullscreen. */}
    }
  }
  button.addEventListener('click',()=>active?exit():enter());
  document.addEventListener('fullscreenchange',()=>{
    if(document.fullscreenElement===studio){ownedNative=true;if(!active)exitNative();}
    else if(ownedNative){ownedNative=false;setActive(false);}
  });
  document.addEventListener('keydown',event=>{if(active&&event.key==='Escape')exit();});
  window.addEventListener('pagehide',exit);
  return {get active(){return active;},exit};
}
