import { APP_VERSION } from './release.js?v=0.9.7';

export function parseRelease(value) {
  if (!value || typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version)) throw new Error('Invalid release metadata');
  return { version:value.version };
}
export function updateURL(current, version, nonce) {
  const url=new URL(current);
  url.searchParams.set('version',parseRelease({version}).version);
  url.searchParams.set('refresh',String(nonce));
  return url.href;
}
export function setupUpdater({ document, location, fetch, now=()=>Date.now() }) {
  const button=document.getElementById('app-version'),status=document.getElementById('update-status');
  button.textContent=`v${APP_VERSION}`;
  let updating=false;
  button.addEventListener('click',async()=>{
    if(updating)return;updating=true;button.disabled=true;status.textContent='正在檢查最新版…';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const manifest=new URL('./version.json',location.href);manifest.searchParams.set('check',String(now()));
      const response=await fetch(manifest.href,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
      if(!response.ok)throw new Error('Update check failed');
      const release=parseRelease(await response.json());
      status.textContent=release.version===APP_VERSION?'已是最新版，正在重新載入。':`正在更新至 v${release.version}…`;
      location.replace(updateURL(location.href,release.version,now()));
    }catch{status.textContent='更新檢查失敗，仍可繼續使用；點版號再試。';updating=false;button.disabled=false;}
    finally{clearTimeout(timer);}
  });
}
