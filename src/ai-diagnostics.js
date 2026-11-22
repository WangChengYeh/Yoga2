import { APP_VERSION } from './release.js?v=0.9.34';
export const AI_STAGE_NAMES={idle:'尚未啟動',environment:'瀏覽器環境',adapter:'取得 GPU',worker:'啟動背景執行緒',workerGpu:'背景 GPU 檢查（最多 10 秒）',sdk:'下載 AI 程式',model:'下載／載入模型',repair:'清除此模型快取並重新下載（只重試一次）',ready:'模型就緒',inference:'產生回答'};
const descriptions={
 INSECURE_CONTEXT:'頁面不是安全環境，瀏覽器可能不開放 WebGPU。請用 HTTPS 開啟正式網站。',
 WEBGPU_UNAVAILABLE:'瀏覽器沒有提供 navigator.gpu，無法執行 WebLLM。',
 GPU_ADAPTER_NULL:'WebGPU API 存在，但 requestAdapter() 回傳 null，瀏覽器未提供可用 GPU。瀏覽器沒有回傳更詳細原因；不能據此判定記憶體不足。',
 GPU_CHECK_TIMEOUT:'取得 GPU 超過 10 秒，瀏覽器未完成 requestAdapter()。尚未開始下載模型；這不能證明記憶體不足。已取消本次啟動，可稍後重試。',
 GPU_ADAPTER_ERROR:'瀏覽器在取得 GPU 時拋出錯誤；詳見原始錯誤。',
 WORKER_UNAVAILABLE:'瀏覽器沒有提供 Worker，無法啟動本機 AI 背景執行緒。',
 WORKER_START_ERROR:'背景執行緒建立或啟動失敗；可能涉及執行環境或載入限制，實際證據見原始錯誤。',
 WORKER_RUNTIME_ERROR:'背景執行緒發生未捕捉錯誤；詳見原始錯誤。',
 WORKER_MESSAGE_ERROR:'瀏覽器無法傳送或解碼背景執行緒訊息。',
 WORKER_GPU_UNAVAILABLE:'主頁可使用 WebGPU，但背景執行緒沒有 navigator.gpu。',
 WORKER_GPU_ADAPTER_NULL:'背景執行緒的 requestAdapter() 回傳 null；瀏覽器未提供更詳細原因。',
 SDK_LOAD_ERROR:'AI 程式下載或初始化失敗；不是模型推論失敗。',
 MODEL_SHARD_INVALID:'模型權重分片為空或長度不符，無法使用。這是權重資料讀取問題，不能據此判定 DRAM 不足。可按「重新下載模型」重試。',
 MODEL_CACHE_ERROR:'無法清除此模型快取，請查看原始儲存錯誤。',
 MODEL_LOAD_ERROR:'模型下載、編譯或 GPU 配置失敗；若無明確錯誤，不能判定是記憶體不足。',
 GPU_MEMORY_ERROR:'瀏覽器或 AI 執行器明確回報記憶體配置失敗。',
 RESOURCE_LOAD_ERROR:'程式或模型資源請求失敗；請查看失敗資源與 HTTP 狀態。',
 GPU_VALIDATION_ERROR:'瀏覽器回報 GPU 驗證失敗，請查看原始錯誤與 GPU 限制。',
 GPU_DEVICE_LOST:'瀏覽器或 AI 執行器回報 GPU 裝置已遺失。',
 INFERENCE_ERROR:'模型已啟動，但產生回答時失敗。',
 LOAD_TIMEOUT:'載入超過 180 秒，已終止。逾時本身不能證明網路或記憶體是哪一項出問題。',
 INFERENCE_TIMEOUT:'產生回答超過 45 秒，已終止；瀏覽器未提供明確根因。',
};
export function cleanAIText(value,redactions=[]) {
 let text=String(value??'');
 for(const secret of redactions)if(secret)text=text.split(String(secret)).join('[已省略問答文字]');
 text=text.replace(/https?:\/\/[^\s<>"']+/g,url=>{try{const u=new URL(url);return u.origin+u.pathname;}catch{return '[URL]';}});
 text=text.replace(/(?:Bearer\s+)[\w.-]+/gi,'Bearer [redacted]');
 return text.length>1600?text.slice(0,1600)+' [已截短]':text;
}
export function aiErrorDetail(error,redactions=[]) {
 return {name:cleanAIText(error?.name||'Error'),message:cleanAIText(error?.message||error||'瀏覽器未提供錯誤訊息。',redactions),...(error?.stack?{stack:cleanAIText(error.stack,redactions)}:{}),...(error?.filename?{location:cleanAIText(error.filename)+':'+(error.lineno||0)+':'+(error.colno||0)}:{}),...(error?.cause?{cause:cleanAIText(error.cause?.message||error.cause,redactions)}:{})};
}
export function aiErrorCode(error,stage,resource) {
 if(['WORKER_UNAVAILABLE','GPU_CHECK_TIMEOUT','MODEL_SHARD_INVALID','MODEL_CACHE_ERROR'].includes(error?.code))return error.code;
 const text=String(error?.message||error||'');
 if(/Tensor-cache record range .*exceeds shard size|AI_SHARD_SIZE_MISMATCH/i.test(text))return 'MODEL_SHARD_INVALID';
 if(error?.name==='GPUOutOfMemoryError'||/out of memory|failed to allocate|allocation failed/i.test(text))return 'GPU_MEMORY_ERROR';
 if(error?.name==='GPUValidationError')return 'GPU_VALIDATION_ERROR';
 if(error?.name==='GPUDeviceLostError'||/device.*lost|lost.*device/i.test(text))return 'GPU_DEVICE_LOST';
 if(resource&&/fetch|network|http|download/i.test(text))return 'RESOURCE_LOAD_ERROR';
 return ({adapter:'GPU_ADAPTER_ERROR',worker:'WORKER_START_ERROR',workerGpu:'GPU_ADAPTER_ERROR',sdk:'SDK_LOAD_ERROR',model:'MODEL_LOAD_ERROR',inference:'INFERENCE_ERROR'})[stage]||'WORKER_RUNTIME_ERROR';
}
export function aiEnvironment(nav=globalThis.navigator,win=globalThis.window) {
 return {version:APP_VERSION,userAgent:nav?.userAgent||'unavailable',secureContext:globalThis.isSecureContext??null,webgpu:Boolean(nav?.gpu),worker:typeof globalThis.Worker==='function',online:nav?.onLine??null,deviceMemoryGB:nav?.deviceMemory??null,screen:win?{width:win.innerWidth,height:win.innerHeight,dpr:win.devicePixelRatio}:null};
}
export function aiFailureMessage(failure) {
 return `AI 啟動／執行失敗 [${failure.code}]\n失敗階段：${AI_STAGE_NAMES[failure.stage]||failure.stage}\n${descriptions[failure.code]||'未分類錯誤，請查看診斷。'}\n原始錯誤：${failure.error?.name||'Error'}: ${failure.error?.message||'未提供'}${failure.resource?`\n最近失敗資源：${failure.resource.url}（HTTP ${failure.resource.status??'無回應'}）`:''}\n基本指令仍可使用。`;
}
