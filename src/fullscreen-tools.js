// Move the original controls (and their listeners/state), never duplicate them.
export function setupFullscreenTools({document}) {
  const menu=document.getElementById('practice-settings'),panel=document.getElementById('practice-settings-content');
  if(!menu||!panel)return {setActive(){}};
  const elements=[document.getElementById('guidance-control'),document.getElementById('quality'),document.getElementById('report-problem'),document.querySelector('.skeleton-controls'),document.querySelector('.view-tools')].filter(Boolean);
  const homes=elements.map(element=>{const marker=document.createComment('fullscreen-control');element.parentNode.insertBefore(marker,element);return {element,marker};});
  panel.addEventListener('click',event=>{const button=event.target.closest?.('button');if(button&&(button.id==='report-problem'||button.hasAttribute('data-view')||button.id==='reset-view'))menu.open=false;},{capture:true});
  return {setActive(active){
    menu.open=false;
    for(const {element,marker} of homes){if(active)panel.appendChild(element);else marker.parentNode.insertBefore(element,marker.nextSibling);}
  }};
}
