let engine;
self.onmessage=async({data})=>{
  try{
    if(data.type==='load'){
      const {MLCEngine}=await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.89/+esm');
      engine=new MLCEngine({initProgressCallback:report=>self.postMessage({type:'progress',progress:report.progress})});
      await engine.reload(`Qwen2.5-0.5B-Instruct-${data.half?'q4f16_1':'q4f32_1'}-MLC`,{context_window_size:1024});
      self.postMessage({type:'ready'});
    }else if(data.type==='ask'&&engine){
      const result=await engine.chat.completions.create({messages:data.messages,max_tokens:160,temperature:.3,stream:false});
      self.postMessage({type:'reply',id:data.id,text:result.choices[0]?.message?.content||''});
    }
  }catch{self.postMessage({type:'error'});}
};
