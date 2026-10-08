/*! @live-codes/dart-wasm — run Dart and Flutter in the browser, with no compilation server. */
(()=>{var R;function D(s){R=s==null?void 0:new URL(s)}function T(){return R}var A=(s,e)=>typeof s=="string"&&s.startsWith(e)&&!s.endsWith(".gz"),k=s=>`
(function () {
  var realFetch = fetch.bind(globalThis);
  var base = ${JSON.stringify(s)};
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
`,N=s=>`
(function () {
  var base = ${JSON.stringify(s)};
  var current;

  var inflate = function (url) {
    return fetch(url + '.gz').then(function (response) {
      if (!response.ok) return null;
      var stream = response.body.pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).text().then(function (code) {
        // Flagged so the module-capture hook does not mistake this for a compiled module:
        // flutter_web.js is a DDC bundle too, and 129 MB of it does not belong in that list.
        self.__dartWasmInflatingBlob = true;
        try {
          return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        } finally {
          self.__dartWasmInflatingBlob = false;
        }
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
`;async function W(s,e=fetch){let t=s.body.pipeThrough(new DecompressionStream("gzip"));return new Uint8Array(await new Response(t).arrayBuffer())}function M({assetBase:s,fetch:e=fetch}){let t=new Map;return r=>{if(!A(r,s))return Promise.resolve(r);if(t.has(r))return t.get(r);let n=(async()=>{let o=await e(r+".gz");if(!o.ok)return r;let c=await W(o,e);return URL.createObjectURL(new Blob([c],{type:"text/javascript"}))})().catch(()=>r);return t.set(r,n),n}}var b={console:"workspace/sandbox/console",error:"workspace/sandbox/error",unhandledRejection:"workspace/sandbox/unhandledRejection"};function S(s){return new URL(s,document.baseURI)}var x=class{#t;#n=1;#e=new Map;#s=new Map;constructor(e){this.#t=e,e.onmessage=t=>this.#o(t.data),e.onmessageerror=()=>{for(let t of this.#e.values())t.reject(new Error("Dart worker dropped a message it could not deserialize."));this.#e.clear()},e.start()}on(e,t){return this.#s.set(e,t),this}request(e,t){let r=this.#n++;return new Promise((n,o)=>{this.#e.set(r,{resolve:n,reject:o}),this.#r({jsonrpc:"2.0",id:r,method:e,params:t})})}notify(e,t){this.#r({jsonrpc:"2.0",method:e,params:t})}#r(e){let t=[],r,n;for(let c of["params","result"]){let a=e?.[c];!a||typeof a!="object"||(a.port instanceof MessagePort&&(r=a.port,t.push(r),delete a.port),a.bytes instanceof Uint8Array&&(n=a.bytes,delete a.bytes))}let o={payload:JSON.stringify(e)};r&&(o.port=r),n&&(o.bytes=n),this.#t.postMessage(o,t)}#o(e){if(!e||typeof e.payload!="string")return;let t;try{t=JSON.parse(e.payload)}catch{return}for(let n of["params","result"]){let o=t?.[n];!o||typeof o!="object"||(e.port!==void 0&&(o.port=e.port),e.bytes!==void 0&&(o.bytes=e.bytes))}if(typeof t.method=="string"){this.#s.get(t.method)?.(t.params,t);return}let r=this.#e.get(t.id);r&&(this.#e.delete(t.id),t.error?r.reject(Object.assign(new Error(t.error.message),{name:"DartWorkerError",code:t.error.code,data:t.error.data})):r.resolve(t.result))}};function P({assetBaseUrl:s,options:e={}}={}){let t=S(s),r=new URL("worker.js",t).href,n=`
    import { Worker } from ${JSON.stringify(r)};
    // worker.js fetches worker.wasm inside create(), and the Dart side fetches sdk.tar once
    // it is running. Both go through globalThis.fetch, so shimming it here covers both \u2014
    // installing it after the import is fine, because worker.js only fetches when called.
    ${k(t.href)}
    try {
      const worker = await Worker.create(${JSON.stringify(e)});
      const { port1, port2 } = new MessageChannel();
      worker.session(port1);
      self.postMessage({ action: 'session' }, [port2]);
    } catch (error) {
      self.postMessage({ action: 'error', message: String(error?.stack ?? error) });
    }
  `,o=URL.createObjectURL(new Blob([n],{type:"text/javascript"})),c=new Worker(o,{type:"module",name:"dartpad-worker"});return new Promise((a,u)=>{c.onmessage=i=>{i.data?.action==="session"?a({worker:c,port:i.ports[0],blobUrl:o}):i.data?.action==="error"&&u(new Error(`Dart worker failed to start:
${i.data.message}`))},c.onerror=i=>{u(new Error(`Dart worker crashed: ${i.message||i.type}`))}})}var q=`
  (function () {
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (blob) {
      const url = createObjectURL(blob);
      try {
        // The inflater hands the SDK its own DDC bundles as blobs; those are not the ones
        // this is looking for.
        if (self.__dartWasmInflatingBlob) return url;
        if (blob && typeof blob.text === 'function' && /javascript/.test(blob.type)) {
          blob.text().then(function (code) {
            window.parent.postMessage({ action: 'module', code: code }, '*');
          });
        }
      } catch (_) {}
      return url;
    };
  })();
`;function C({assetBaseUrl:s,container:e,timeout:t=18e4,onModule:r}={}){let n=S(s),o=new URL("sandbox.js",n).href,c=M({assetBase:n.href}),a=document.createElement("iframe");a.setAttribute("sandbox","allow-scripts allow-same-origin"),a.title="Dart sandbox",e.append(a);let u,i=new Promise((p,l)=>{u={resolve:p,reject:l}});function d(p){let l=p?.$dartLoader;if(!l||typeof l.forceLoadScript!="function"||l.__dartWasmInflating)return;let L=l.forceLoadScript;l.__dartWasmInflating=!0,l.forceLoadScript=(v,E)=>{c(v).then(B=>L(B,E)).catch(()=>L(v,E))}}let w=p=>{if(p.source!==a.contentWindow)return;let l=p.data;!l||typeof l!="object"||(l.action==="connect"?(clearTimeout(f),d(a.contentWindow),u.resolve(l.port)):l.action==="module"?r?.(l.code):l.action==="error"&&(clearTimeout(f),u.reject(new Error(`Dart sandbox failed to load:
${l.message}`))))},f=setTimeout(()=>{u.reject(new Error("Timed out waiting for the Dart sandbox to boot."))},t);return window.addEventListener("message",w),a.srcdoc=["<!DOCTYPE html>",'<html><head><meta charset="utf-8">',`<script>${k(n.href)}${N(n.href)}${r?q:""}<\/script>`,`<script src="${o}" defer><\/script>`,"</head><body></body></html>"].join(""),{iframe:a,ready:i,close:()=>{clearTimeout(f),window.removeEventListener("message",w),a.remove()}}}var m=class s{#t;#n;#e;#s;#r=null;#o;constructor({worker:e,blobUrl:t,rpc:r,workspaceId:n,workspaceFolder:o,assetBaseUrl:c,container:a,onModule:u}){this.#t=e,this.#n=t,this.#s=c,this.#e=a,this.#o=u,this.rpc=r,this.workspaceId=n,this.workspaceFolder=o}static async create({assetBaseUrl:e,container:t,onModule:r}={}){let n=S(e),{worker:o,port:c,blobUrl:a}=await P({assetBaseUrl:e}),u=new x(c),{workspaceId:i,workspaceFolder:d}=await u.request("createWorkspace",{});return new s({worker:o,blobUrl:a,rpc:u,workspaceId:i,workspaceFolder:d,assetBaseUrl:n,container:t,onModule:r})}writeFile(e,t){return this.rpc.request("workspace/writeFileFromText",{workspaceId:this.workspaceId,uri:e,text:t})}async readFile(e){let{text:t}=await this.rpc.request("workspace/readFileAsText",{workspaceId:this.workspaceId,uri:e});return t}async stat(e){try{return await this.rpc.request("workspace/stat",{workspaceId:this.workspaceId,uri:e})}catch{return null}}pub(e,t=[]){return this.rpc.request("workspace/pub",{workspaceId:this.workspaceId,uri:".",command:e,args:t})}async#i(){let e=C({assetBaseUrl:this.#s,container:this.#e,onModule:this.#o}),t=await e.ready,{sandboxId:r,modes:n}=await this.rpc.request("workspace/connectSandbox",{workspaceId:this.workspaceId,port:t});return this.#r={sandboxId:r,modes:n,close:e.close},this.#r}async#a(){let e=this.#r;e&&(this.#r=null,e.close(),await this.rpc.request("workspace/sandbox/close",{workspaceId:this.workspaceId,sandboxId:e.sandboxId}).catch(()=>{}))}async run(e,t="console"){await this.#a();let{sandboxId:r}=await this.#i();return this.rpc.request("workspace/sandbox/run",{workspaceId:this.workspaceId,sandboxId:r,path:e,mode:t})}async dispose(){try{await this.#a(),await this.rpc.request("workspace/dispose",{workspaceId:this.workspaceId})}finally{this.#t.terminate(),URL.revokeObjectURL(this.#n)}}};var g={dart:{id:"dart",label:"Dart",directory:"dart/",defaultMode:"console",runModes:["console"]},flutter:{id:"flutter",label:"Flutter",directory:"flutter/",defaultMode:"flutter",runModes:["console","flutter"]}},U=Object.keys(g);function I(s){let e="setSourceMap(",t=s.indexOf(e);if(t===-1)return null;let r=s.slice(t+e.length),n=r.indexOf(",");if(n===-1)return null;let o=r.slice(n+1).trimStart(),c=o[0];if(c!=="'"&&c!=='"')return null;let a=-1;for(let i=1;i<o.length;i+=1){if(o[i]==="\\"){i+=1;continue}if(o[i]===c){a=i;break}}if(a===-1)return null;let u=o.slice(1,a);for(let i of[u,u.replace(/\\(["\\/])/g,"$1")])try{let d=JSON.parse(i);if(d&&typeof d=="object")return d}catch{}return null}var F=s=>{let e=typeof s=="string"?g[s]:s;if(!e?.directory)throw new TypeError(`dart-wasm: unknown engine ${JSON.stringify(s)}. Use one of: ${U.join(", ")}.`);return e};function G(s,e){let t=e??T();if(!t)throw new TypeError("dart-wasm: no asset base URL. Pass `baseUrl`, or use a build that can work it out.");let r=typeof document<"u"?document.baseURI:self.location.href;return new URL(s.directory,new URL(t,r))}function z(s,e){if(e){let r=typeof e=="string"?document.querySelector(e):e;if(!r)throw new TypeError(`dart-wasm: container not found: ${String(e)}`);return{element:r,owned:!1}}if(s.id==="flutter")throw new TypeError("dart-wasm: `container` is required for engine 'flutter' - the app renders into the sandbox.");let t=document.createElement("div");return t.dataset.dartWasmSandbox="",t.style.display="none",document.body.append(t),{element:t,owned:!0}}function j(s=[]){return s.map(e=>{if(e&&typeof e=="object"){if(!e.name)throw new TypeError("dart-wasm: a dependency needs a name");return`  ${e.name}: ${e.constraint??"any"}`}let t=String(e).trim(),r=t.indexOf(":"),n=(r===-1?t:t.slice(0,r)).trim();if(n==="")throw new TypeError("dart-wasm: empty dependency name");return`  ${n}: ${r===-1?"any":t.slice(r+1).trim()}`})}function y(s,e=[]){return["name: dartpad_pad","environment:","  sdk: '>=3.0.0 <4.0.0'","dependencies:",...F(s).id==="flutter"?["  flutter:","    sdk: flutter"]:[],...j(e),""].join(`
`)}var h=class s{#t;#n;#e;#s;#r;#o;#i;#a;#l;#c=[];#u;constructor({spec:e,assetBaseUrl:t,session:r,container:n,ownsContainer:o,onConsole:c,onError:a,onLog:u,onModule:i}){this.#t=e,this.#n=t,this.#e=r,this.#s=n,this.#r=o,this.#o=c,this.#i=a,this.#a=u,this.#l=i,r.rpc.on(b.console,d=>{this.#o?.({message:d?.message??""})}),r.rpc.on(b.error,d=>{this.#i?.({message:d?.message??""})}),r.rpc.on(b.unhandledRejection,d=>{this.#i?.({message:d?.message??""})})}static async create({engine:e="dart",baseUrl:t,container:r,onConsole:n,onError:o,onLog:c,onModule:a}={}){let u=F(e),i=G(u,t),{element:d,owned:w}=z(u,r),f={push:()=>{}},O=await m.create({assetBaseUrl:i,container:d,onModule:l=>f.push(l)}),p=new s({spec:u,assetBaseUrl:i,session:O,container:d,ownsContainer:w,onConsole:n,onError:o,onLog:c,onModule:a});return f.push=l=>p.#d(l),p}#d(e){if(!e.startsWith("// Generated by DDC"))return;let t={code:e,map:I(e)};this.#c.push(t),this.#l?.(t)}get engine(){return this.#t.id}get modes(){return[...this.#t.runModes]}get assetBaseUrl(){return new URL(this.#n)}get container(){return this.#s}writeFile(e,t){return this.#e.writeFile(e,t)}readFile(e){return this.#e.readFile(e)}pub(e,t=[]){return this.#e.pub(e,t)}async resolve(e){let t=e??this.#u??y(this.#t);if(t===this.#u)return"";await this.#e.writeFile("pubspec.yaml",t);let{log:r}=await this.#e.pub("get");return this.#u=t,r?.trim()&&this.#a?.({message:r.trim(),source:"pub"}),r??""}async runFile(e="main.dart",t=this.#t.defaultMode){if(!this.#t.runModes.includes(t))throw new TypeError(`dart-wasm: engine '${this.#t.id}' does not have a '${t}' mode. Use one of: ${this.#t.runModes.join(", ")}.`);this.#c=[];let{log:r}=await this.#e.run(e,t);return r?.trim()&&this.#a?.({message:r.trim(),source:"compiler"}),{log:r??"",modules:[...this.#c]}}async run(e,{dependencies:t,pubspec:r,file:n="main.dart",mode:o}={}){return await this.resolve(r??y(this.#t,t??[])),await this.#e.writeFile(n,e),this.runFile(n,o)}async dispose(){await this.#e.dispose(),this.#r&&this.#s.remove()}},_=s=>h.create(s);var $=(()=>{if(typeof document<"u"&&document.currentScript?.src)return document.currentScript.src;if(typeof self<"u"&&self.location?.href)return self.location.href})();$&&D(new URL("./",$));globalThis.DartWasm={Dartpad:h,createDartpad:_,ENGINES:g,ENGINE_IDS:U,buildPubspec:y,dependencyLines:j,parseSourceMap:I};})();
