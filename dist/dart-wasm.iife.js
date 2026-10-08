/*! @live-codes/dart-wasm — run Dart and Flutter in the browser, with no compilation server. */
(()=>{var j;function O(n){j=n==null?void 0:new URL(n)}function y(){return j}var S={dart:{id:"dart",label:"Dart",directory:"dart/",defaultMode:"console",runModes:["console"]},flutter:{id:"flutter",label:"Flutter",directory:"flutter/",defaultMode:"flutter",runModes:["console","flutter"]}},E=Object.keys(S),h=n=>{let e=typeof n=="string"?S[n]:n;if(!e?.directory)throw new TypeError(`dart-wasm: unknown engine ${JSON.stringify(n)}. Use one of: ${E.join(", ")}.`);return e};function g(n,e,t){let r=e??t;if(!r)throw new TypeError("dart-wasm: no asset base URL. Pass `baseUrl`, or use a build that can work it out.");let s=typeof document<"u"?document.baseURI:self.location.href;return new URL(n.directory,new URL(r,s))}function v(n=[]){return n.map(e=>{if(e&&typeof e=="object"){if(!e.name)throw new TypeError("dart-wasm: a dependency needs a name");return`  ${e.name}: ${e.constraint??"any"}`}let t=String(e).trim(),r=t.indexOf(":"),s=(r===-1?t:t.slice(0,r)).trim();if(s==="")throw new TypeError("dart-wasm: empty dependency name");return`  ${s}: ${r===-1?"any":t.slice(r+1).trim()}`})}function x(n,e=[]){return["name: dartpad_pad","environment:","  sdk: '>=3.0.0 <4.0.0'","dependencies:",...h(n).id==="flutter"?["  flutter:","    sdk: flutter"]:[],...v(e),""].join(`
`)}function U(n){let e="setSourceMap(",t=n.indexOf(e);if(t===-1)return null;let r=n.slice(t+e.length),s=r.indexOf(",");if(s===-1)return null;let o=r.slice(s+1).trimStart(),a=o[0];if(a!=="'"&&a!=='"')return null;let c=-1;for(let i=1;i<o.length;i+=1){if(o[i]==="\\"){i+=1;continue}if(o[i]===a){c=i;break}}if(c===-1)return null;let u=o.slice(1,c);for(let i of[u,u.replace(/\\(["\\/])/g,"$1")])try{let d=JSON.parse(i);if(d&&typeof d=="object")return d}catch{}return null}var P=(n,e)=>typeof n=="string"&&n.startsWith(e)&&!n.endsWith(".gz"),R=n=>`
(function () {
  var realFetch = fetch.bind(globalThis);
  var base = ${JSON.stringify(n)};
  globalThis.fetch = function (input, init) {
    var url = typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : input && input.url;
    if (typeof url !== 'string' || url.indexOf(base) !== 0 || url.slice(-3) === '.gz') {
      return realFetch(input, init);
    }
    return realFetch(url + '.gz', init).then(function (compressed) {
      if (!compressed.ok) return realFetch(input, init);
      return new Response(compressed.body.pipeThrough(new DecompressionStream('gzip')), {
        headers: {
          'content-type': url.slice(-5) === '.wasm' ? 'application/wasm' : 'application/octet-stream',
        },
      });
    }, function () {
      // A host that answers 404 without CORS headers makes this probe *reject* rather than
      // resolve with ok === false, so the fallback has to be wired to the rejection too.
      return realFetch(input, init);
    });
  };
})();
`,M=n=>`
(function () {
  var base = ${JSON.stringify(n)};
  var current;

  var inflate = function (url) {
    return fetch(url + '.gz').then(function (response) {
      if (!response.ok) return null;
      var stream = response.body.pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).text().then(function (code) {
        return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      });
    }).catch(function () { return null; });
  };

  Object.defineProperty(self, '$dartpadSandboxScripts', {
    configurable: true,
    get: function () { return current; },
    set: function (value) {
      if (!Array.isArray(value) || value.__dartWasmInflating) {
        current = value;
        return;
      }
      var list = value.slice();
      Object.defineProperty(list, '__dartWasmInflating', { value: true });
      Object.defineProperty(list, 'map', {
        value: function (fn) {
          return Array.prototype.map.call(this, function (entry) {
            if (typeof entry !== 'string') return fn(entry);
            return inflate(new URL(entry, base).href).then(function (blobUrl) {
              return fn(blobUrl || entry);
            });
          });
        },
      });
      current = list;
    },
  });
})();
`;async function W(n,e=fetch){let t=n.body.pipeThrough(new DecompressionStream("gzip"));return new Uint8Array(await new Response(t).arrayBuffer())}function T({assetBase:n,fetch:e=fetch}){let t=new Map;return r=>{if(!P(r,n))return Promise.resolve(r);if(t.has(r))return t.get(r);let s=(async()=>{let o=await e(r+".gz");if(!o.ok)return r;let a=await W(o,e);return URL.createObjectURL(new Blob([a],{type:"text/javascript"}))})().catch(()=>r);return t.set(r,s),s}}function A(n){let e=typeof document<"u"?document.baseURI:self.location.href;return new URL(n,e)}var m=class{#e;#i=1;#t=new Map;#s=new Map;#n=new Map;constructor(e){this.#e=e,e.onmessage=t=>this.#a(t.data),e.onmessageerror=()=>{for(let t of this.#t.values())t.reject(new Error("the Dart worker dropped a message it could not deserialize."));this.#t.clear()},e.start()}on(e,t){return this.#s.set(e,t),this}handle(e,t){return this.#n.set(e,t),this}request(e,t){let r=this.#i++;return new Promise((s,o)=>{this.#t.set(r,{resolve:s,reject:o}),this.#r({jsonrpc:"2.0",id:r,method:e,params:t})})}notify(e,t){this.#r({jsonrpc:"2.0",method:e,params:t})}#r(e){let t=[],r,s;for(let a of["params","result"]){let c=e?.[a];!c||typeof c!="object"||(c.port instanceof MessagePort&&(r=c.port,t.push(r),delete c.port),c.bytes instanceof Uint8Array&&(s=c.bytes,delete c.bytes))}let o={payload:JSON.stringify(e)};r&&(o.port=r),s&&(o.bytes=s),this.#e.postMessage(o,t)}#a(e){if(!e||typeof e.payload!="string")return;let t;try{t=JSON.parse(e.payload)}catch{return}for(let s of["params","result"]){let o=t?.[s];!o||typeof o!="object"||(e.port!==void 0&&(o.port=e.port),e.bytes!==void 0&&(o.bytes=e.bytes))}if(typeof t.method=="string"){let s=this.#n.get(t.method);if(s){this.#o(s,t);return}this.#s.get(t.method)?.(t.params,t);return}let r=this.#t.get(t.id);r&&(this.#t.delete(t.id),t.error?r.reject(Object.assign(new Error(t.error.message),{name:"DartWorkerError",code:t.error.code,data:t.error.data})):r.resolve(t.result))}#o(e,t){if(t.id===void 0){Promise.resolve().then(()=>e(t.params));return}Promise.resolve().then(()=>e(t.params)).then(r=>this.#r({jsonrpc:"2.0",id:t.id,result:r??{}})).catch(r=>this.#r({jsonrpc:"2.0",id:t.id,error:{code:-32e3,message:String(r?.message??r)}}))}};function F({assetBaseUrl:n,options:e={}}={}){let t=A(n),r=new URL("worker.js",t).href,s=`
    import { Worker } from ${JSON.stringify(r)};
    // worker.js fetches worker.wasm inside create(), and the Dart side fetches sdk.tar once it is
    // running. Both go through globalThis.fetch, so shimming it here covers both \u2014 installing it
    // after the import is fine, because worker.js only fetches when it is called.
    ${R(t.href)}
    try {
      const worker = await Worker.create(${JSON.stringify(e)});
      const { port1, port2 } = new MessageChannel();
      worker.session(port1);
      self.postMessage({ action: 'session' }, [port2]);
    } catch (error) {
      self.postMessage({ action: 'error', message: String(error?.stack ?? error) });
    }
  `,o=URL.createObjectURL(new Blob([s],{type:"text/javascript"})),a=new Worker(o,{type:"module",name:"dartpad-worker"});return new Promise((c,u)=>{a.onmessage=i=>{i.data?.action==="session"?c({worker:a,port:i.ports[0],blobUrl:o}):i.data?.action==="error"&&u(new Error(`the Dart worker failed to start:
${i.data.message}`))},a.onerror=i=>{u(new Error(`the Dart worker crashed: ${i.message||i.type}`))}})}var _={hotRestart:{generation:0},hotReload:{generation:0},getHotRestartGeneration:{generation:0},getHotReloadGeneration:{generation:0},appMetrics:{},invokeExtension:{result:""},close:{}},p=class n{#e;#i;#t;#s;#n;#r;#a;#o;#c;#d;#u={modules:[],libraryUri:null,mode:null};constructor({spec:e,assetBaseUrl:t,worker:r,blobUrl:s,rpc:o,workspaceId:a,workspaceFolder:c,onLog:u}){this.#e=e,this.#i=t,this.#t=r,this.#s=s,this.#n=o,this.#r=a,this.#a=c,this.#d=u}static async create({engine:e="dart",baseUrl:t,assetBaseUrl:r,onLog:s}={}){let o=h(e),a=r?new URL(r):g(o,t,y()),{worker:c,port:u,blobUrl:i}=await F({assetBaseUrl:a}),d=new m(u),{workspaceId:l,workspaceFolder:w}=await d.request("createWorkspace",{}),b=new n({spec:o,assetBaseUrl:a,worker:c,blobUrl:i,rpc:d,workspaceId:l,workspaceFolder:w,onLog:s});return await b.#l(),b}async#l(){let e=new MessageChannel,t=new m(e.port1);t.handle("loadModule",({code:s,moduleName:o})=>(this.#u.modules.push({name:o,code:s,map:U(s)}),{})),t.handle("run",({libraryUri:s,mode:o})=>(this.#u.libraryUri=s,this.#u.mode=o,{status:"running"}));for(let[s,o]of Object.entries(_))t.handle(s,()=>o);let{sandboxId:r}=await this.#n.request("workspace/connectSandbox",{workspaceId:this.#r,port:e.port2});this.#o=r}get engine(){return this.#e.id}get modes(){return[...this.#e.runModes]}get assetBaseUrl(){return new URL(this.#i)}writeFile(e,t){return this.#n.request("workspace/writeFileFromText",{workspaceId:this.#r,uri:e,text:t})}async readFile(e){let{text:t}=await this.#n.request("workspace/readFileAsText",{workspaceId:this.#r,uri:e});return t}pub(e,t=[]){return this.#n.request("workspace/pub",{workspaceId:this.#r,uri:".",command:e,args:t})}async resolve(e){let t=e??this.#c??x(this.#e);if(t===this.#c)return"";await this.writeFile("pubspec.yaml",t);let{log:r}=await this.pub("get");return this.#c=t,r?.trim()&&this.#d?.({message:r.trim(),source:"pub"}),r??""}async compile(e,{dependencies:t,pubspec:r,file:s="main.dart",mode:o}={}){return await this.resolve(r??x(this.#e,t??[])),await this.writeFile(s,e),this.compileFile(s,o)}async compileFile(e="main.dart",t=this.#e.defaultMode){if(!this.#e.runModes.includes(t))throw new TypeError(`dart-wasm: engine '${this.#e.id}' does not have a '${t}' mode. Use one of: ${this.#e.runModes.join(", ")}.`);let r=this.#u;r.modules=[],r.libraryUri=null,r.mode=null;let{log:s}=await this.#n.request("workspace/sandbox/run",{workspaceId:this.#r,sandboxId:this.#o,path:e,mode:t});if(!r.libraryUri)throw new Error("dart-wasm: the compiler produced no runnable entrypoint");return s?.trim()&&this.#d?.({message:s.trim(),source:"compiler"}),{engine:this.#e.id,mode:t,modules:r.modules,libraryUri:r.libraryUri,log:s??""}}dispose(){this.#t.terminate(),URL.revokeObjectURL(this.#s)}},I=n=>p.create(n);function C(n,e){let t=n?.$dartLoader;if(!t||typeof t.forceLoadScript!="function"||t.__dartWasmInflating)return;let r=t.forceLoadScript;t.__dartWasmInflating=!0,t.forceLoadScript=(s,o)=>{e(s).then(a=>r(a,o)).catch(()=>r(s,o))}}var D=n=>`${R(n)}${M(n)}`;function N({iframe:n,assetBase:e,timeout:t}){let r=T({assetBase:e});return new Promise((s,o)=>{let a=u=>{if(u.source!==n.contentWindow)return;let i=u.data;!i||typeof i!="object"||(i.action==="connect"?(clearTimeout(c),window.removeEventListener("message",a),C(n.contentWindow,r),s({iframe:n,port:i.port})):i.action==="error"&&(clearTimeout(c),window.removeEventListener("message",a),o(new Error(`the Dart sandbox failed to load:
${i.message}`))))},c=setTimeout(()=>{window.removeEventListener("message",a),o(new Error("timed out waiting for the Dart sandbox to boot."))},t);window.addEventListener("message",a)})}function q({assetBase:n,container:e,timeout:t}){let r=document.createElement("iframe");r.setAttribute("sandbox","allow-scripts allow-same-origin"),r.title="Dart sandbox",e.append(r);let s=new URL("sandbox.js",n).href;return r.srcdoc=["<!DOCTYPE html>",'<html><head><meta charset="utf-8">',`<script>${D(n.href)}<\/script>`,`<script src="${s}" defer><\/script>`,"</head><body></body></html>"].join(""),N({iframe:r,assetBase:n.href,timeout:t})}function G({iframe:n,assetBase:e,timeout:t}){let r=n.contentDocument;if(!r)throw new Error("dart-wasm: the given iframe has no same-origin document to run in");if(r.defaultView.__dartWasmSandbox)throw new Error("dart-wasm: that iframe is already running a Dart sandbox");r.defaultView.__dartWasmSandbox=!0;let s=r.createElement("script");s.textContent=D(e.href),r.head.append(s);let o=r.createElement("script");return o.src=new URL("sandbox.js",e).href,r.head.append(o),N({iframe:n,assetBase:e.href,timeout:t})}function z(n){if(n){let t=typeof n=="string"?document.querySelector(n):n;if(!t)throw new TypeError(`dart-wasm: container not found: ${String(n)}`);return{element:t,owned:!1}}let e=document.createElement("div");return e.dataset.dartWasmSandbox="",e.style.display="none",document.body.append(e),{element:e,owned:!0}}var f=class n{#e;#i;#t;#s;#n;#r;#a;#o;#c=!1;constructor({spec:e,assetBaseUrl:t,iframe:r,ownsIframe:s,ownedContainer:o,port:a,onConsole:c,onError:u}){this.#e=e,this.#i=t,this.#t=r,this.#s=s,this.#n=o,this.#a=c,this.#o=u,this.#r=new m(a),this.#r.on("console",({level:i,message:d})=>this.#a?.({level:i,message:d})),this.#r.on("error",({message:i})=>this.#o?.({message:i})),this.#r.on("unhandledRejection",({message:i})=>this.#o?.({message:i}))}static async create({engine:e="dart",baseUrl:t,assetBaseUrl:r,container:s,iframe:o,timeout:a=18e4,onConsole:c,onError:u}={}){let i=h(e),d=r?new URL(r):g(i,t,y()),l,w=null;if(o)l=await G({iframe:o,assetBase:d,timeout:a});else{if(!s&&i.id==="flutter")throw new TypeError("dart-wasm: `container` is required for engine 'flutter' - the app renders into the sandbox.");let b=z(s);w=b.owned?b.element:null,l=await q({assetBase:d,container:b.element,timeout:a})}return new n({spec:i,assetBaseUrl:d,iframe:l.iframe,ownsIframe:!o,ownedContainer:w,port:l.port,onConsole:c,onError:u})}get engine(){return this.#e.id}get modes(){return[...this.#e.runModes]}get assetBaseUrl(){return new URL(this.#i)}get iframe(){return this.#t}async run(e,{onConsole:t,onError:r}={}){if(this.#c)throw new Error("dart-wasm: this runner has been disposed");if(!e?.libraryUri)throw new TypeError("dart-wasm: expected a compiled program, with a `libraryUri`");t&&(this.#a=t),r&&(this.#o=r);for(let s of e.modules??[])await this.#r.request("loadModule",{code:s.code,moduleName:s.name});return this.#r.request("run",{libraryUri:e.libraryUri,mode:e.mode})}dispose(){this.#c=!0,this.#s&&this.#t.remove(),this.#n?.remove()}},L=n=>f.create(n);function J(n,e){if(e){let r=typeof e=="string"?document.querySelector(e):e;if(!r)throw new TypeError(`dart-wasm: container not found: ${String(e)}`);return{element:r,owned:!1}}if(n.id==="flutter")throw new TypeError("dart-wasm: `container` is required for engine 'flutter' - the app renders into the sandbox.");let t=document.createElement("div");return t.dataset.dartWasmSandbox="",t.style.display="none",document.body.append(t),{element:t,owned:!0}}var k=class n{#e;#i;#t;#s=null;#n;#r;#a;#o;#c;#d;constructor({spec:e,assetBaseUrl:t,compiler:r,container:s,ownsContainer:o,onConsole:a,onError:c,onLog:u,onModule:i}){this.#e=e,this.#i=t,this.#t=r,this.#n=s,this.#r=o,this.#a=a,this.#o=c,this.#c=u,this.#d=i}static async create({engine:e="dart",baseUrl:t,container:r,onConsole:s,onError:o,onLog:a,onModule:c}={}){let u=h(e),i=g(u,t,y()),{element:d,owned:l}=J(u,r),w=await p.create({engine:e,assetBaseUrl:i,onLog:a});return new n({spec:u,assetBaseUrl:i,compiler:w,container:d,ownsContainer:l,onConsole:s,onError:o,onLog:a,onModule:c})}get engine(){return this.#e.id}get modes(){return[...this.#e.runModes]}get assetBaseUrl(){return new URL(this.#i)}get container(){return this.#n}writeFile(e,t){return this.#t.writeFile(e,t)}readFile(e){return this.#t.readFile(e)}pub(e,t=[]){return this.#t.pub(e,t)}resolve(e){return this.#t.resolve(e)}async run(e,t){return this.#u(await this.#t.compile(e,t))}async runFile(e="main.dart",t){return this.#u(await this.#t.compileFile(e,t))}async#u(e){for(let t of e.modules)this.#d?.(t);return await this.#s?.dispose(),this.#s=await f.create({engine:this.#e.id,assetBaseUrl:this.#i,container:this.#n,onConsole:this.#a,onError:this.#o}),await this.#s.run(e),{log:e.log,modules:e.modules}}async dispose(){await this.#s?.dispose(),this.#t.dispose(),this.#r&&this.#n.remove()}},$=n=>k.create(n);var B=(()=>{if(typeof document<"u"&&document.currentScript?.src)return document.currentScript.src;if(typeof self<"u"&&self.location?.href)return self.location.href})();B&&O(new URL("./",B));globalThis.DartWasm={createCompiler:I,Compiler:p,createRunner:L,Runner:f,createDartpad:$,Dartpad:k,ENGINES:S,ENGINE_IDS:E,buildPubspec:x,dependencyLines:v,parseSourceMap:U};})();
