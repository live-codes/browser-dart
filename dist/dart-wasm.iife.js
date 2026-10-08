/*! @live-codes/dart-wasm — run Dart and Flutter in the browser, with no compilation server. */
(()=>{var D;function N(n){D=n==null?void 0:new URL(n)}function w(){return D}var E={dart:{id:"dart",label:"Dart",directory:"dart/",defaultMode:"console",runModes:["console"]},flutter:{id:"flutter",label:"Flutter",directory:"flutter/",defaultMode:"flutter",runModes:["console","flutter"]}},j=Object.keys(E),h=n=>{let e=typeof n=="string"?E[n]:n;if(!e?.directory)throw new TypeError(`dart-wasm: unknown engine ${JSON.stringify(n)}. Use one of: ${j.join(", ")}.`);return e};function y(n,e,t){let r=e??t;if(!r)throw new TypeError("dart-wasm: no asset base URL. Pass `baseUrl`, or use a build that can work it out.");let s=typeof document<"u"?document.baseURI:self.location.href;return new URL(n.directory,new URL(r,s))}function L(n=[]){return n.map(e=>{if(e&&typeof e=="object"){if(!e.name)throw new TypeError("dart-wasm: a dependency needs a name");return`  ${e.name}: ${e.constraint??"any"}`}let t=String(e).trim(),r=t.indexOf(":"),s=(r===-1?t:t.slice(0,r)).trim();if(s==="")throw new TypeError("dart-wasm: empty dependency name");return`  ${s}: ${r===-1?"any":t.slice(r+1).trim()}`})}function U(n,e=[]){return["name: dartpad_pad","environment:","  sdk: '>=3.9.0 <4.0.0'","dependencies:",...h(n).id==="flutter"?["  flutter:","    sdk: flutter"]:[],...L(e),""].join(`
`)}function v(n){let e="setSourceMap(",t=n.indexOf(e);if(t===-1)return null;let r=n.slice(t+e.length),s=r.indexOf(",");if(s===-1)return null;let o=r.slice(s+1).trimStart(),a=o[0];if(a!=="'"&&a!=='"')return null;let c=-1;for(let i=1;i<o.length;i+=1){if(o[i]==="\\"){i+=1;continue}if(o[i]===a){c=i;break}}if(c===-1)return null;let d=o.slice(1,c);for(let i of[d,d.replace(/\\(["\\/])/g,"$1")])try{let l=JSON.parse(i);if(l&&typeof l=="object")return l}catch{}return null}var P=["worker.wasm","sdk.tar","dart_sdk.js","dart_sdk.js.map","flutter_web.js","flutter_web.js.map"],B=JSON.stringify(P),V=n=>{let e=n.indexOf("?"),t=e===-1?n:n.slice(0,e);return t.slice(t.lastIndexOf("/")+1)};var Z=(n,e)=>typeof n=="string"&&n.startsWith(e)&&P.includes(V(n)),I=n=>`
(function () {
  var realFetch = fetch.bind(globalThis);
  var base = ${JSON.stringify(n)};
  var gzipped = ${B};
  var isGzipped = function (url) {
    var path = url.split('?')[0];
    return gzipped.indexOf(path.slice(path.lastIndexOf('/') + 1)) !== -1;
  };
  globalThis.fetch = function (input, init) {
    var url = typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : input && input.url;
    if (typeof url !== 'string' || url.indexOf(base) !== 0 || !isGzipped(url)) {
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
`,F=n=>`
(function () {
  var base = ${JSON.stringify(n)};
  var current;

  var gzipped = ${B};
  var isGzipped = function (url) {
    var path = url.split('?')[0];
    return gzipped.indexOf(path.slice(path.lastIndexOf('/') + 1)) !== -1;
  };

  var inflate = function (url) {
    if (!isGzipped(url)) return Promise.resolve(null);
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
`;async function K(n,e=fetch){let t=n.body.pipeThrough(new DecompressionStream("gzip"));return new Uint8Array(await new Response(t).arrayBuffer())}function O({assetBase:n,fetch:e=fetch}){let t=new Map;return r=>{if(!Z(r,n))return Promise.resolve(r);if(t.has(r))return t.get(r);let s=(async()=>{let o=await e(r+".gz");if(!o.ok)return r;let a=await K(o,e);return URL.createObjectURL(new Blob([a],{type:"text/javascript"}))})().catch(()=>r);return t.set(r,s),s}}function H(n){let e=typeof document<"u"?document.baseURI:self.location.href;return new URL(n,e)}var S=class{#e;#i=1;#t=new Map;#o=new Map;#n=new Map;constructor(e){this.#e=e,e.onmessage=t=>this.#a(t.data),e.onmessageerror=()=>{for(let t of this.#t.values())t.reject(new Error("the Dart worker dropped a message it could not deserialize."));this.#t.clear()},e.start()}on(e,t){return this.#o.set(e,t),this}handle(e,t){return this.#n.set(e,t),this}request(e,t){let r=this.#i++;return new Promise((s,o)=>{this.#t.set(r,{resolve:s,reject:o}),this.#r({jsonrpc:"2.0",id:r,method:e,params:t})})}notify(e,t){this.#r({jsonrpc:"2.0",method:e,params:t})}#r(e){let t=[],r,s;for(let a of["params","result"]){let c=e?.[a];!c||typeof c!="object"||(c.port instanceof MessagePort&&(r=c.port,t.push(r),delete c.port),c.bytes instanceof Uint8Array&&(s=c.bytes,delete c.bytes))}let o={payload:JSON.stringify(e)};r&&(o.port=r),s&&(o.bytes=s),this.#e.postMessage(o,t)}#a(e){if(!e||typeof e.payload!="string")return;let t;try{t=JSON.parse(e.payload)}catch{return}for(let s of["params","result"]){let o=t?.[s];!o||typeof o!="object"||(e.port!==void 0&&(o.port=e.port),e.bytes!==void 0&&(o.bytes=e.bytes))}if(typeof t.method=="string"){let s=this.#n.get(t.method);if(s){this.#s(s,t);return}this.#o.get(t.method)?.(t.params,t);return}let r=this.#t.get(t.id);r&&(this.#t.delete(t.id),t.error?r.reject(Object.assign(new Error(t.error.message),{name:"DartWorkerError",code:t.error.code,data:t.error.data})):r.resolve(t.result))}#s(e,t){if(t.id===void 0){Promise.resolve().then(()=>e(t.params));return}Promise.resolve().then(()=>e(t.params)).then(r=>this.#r({jsonrpc:"2.0",id:t.id,result:r??{}})).catch(r=>this.#r({jsonrpc:"2.0",id:t.id,error:{code:-32e3,message:String(r?.message??r)}}))}};function A({assetBaseUrl:n,options:e={}}={}){let t=H(n),r=new URL("worker.js",t).href,s=`
    // worker.js fetches worker.wasm inside create(), and the Dart side fetches sdk.tar once it is
    // running. Both go through globalThis.fetch, so shimming it here covers both.
    ${I(t.href)}
    import(${JSON.stringify(r)})
      .then(({ Worker }) => Worker.create(${JSON.stringify(e)}))
      .then((worker) => {
        const { port1, port2 } = new MessageChannel();
        worker.session(port1);
        self.postMessage({ action: 'session' }, [port2]);
      })
      .catch((error) => {
        self.postMessage({ action: 'error', message: String(error?.stack ?? error) });
      });
  `,o=URL.createObjectURL(new Blob([s],{type:"text/javascript"})),a=new Worker(o);return new Promise((c,d)=>{a.onmessage=i=>{i.data?.action==="session"?c({worker:a,port:i.ports[0],blobUrl:o}):i.data?.action==="error"&&d(new Error(`the Dart worker failed to start:
${i.data.message}`))},a.onerror=i=>{d(new Error(`the Dart worker crashed: ${i.message||i.type}`))}})}var X={hotRestart:{generation:0},hotReload:{generation:0},getHotRestartGeneration:{generation:0},getHotReloadGeneration:{generation:0},appMetrics:{},invokeExtension:{result:""},close:{}},g=class n{#e;#i;#t;#o;#n;#r;#a;#s;#c;#l;#d={modules:[],libraryUri:null,mode:null};constructor({spec:e,assetBaseUrl:t,worker:r,blobUrl:s,rpc:o,workspaceId:a,workspaceFolder:c,onLog:d}){this.#e=e,this.#i=t,this.#t=r,this.#o=s,this.#n=o,this.#r=a,this.#a=c,this.#l=d}static async create({engine:e="dart",baseUrl:t,assetBaseUrl:r,onLog:s}={}){let o=h(e),a=r?new URL(r):y(o,t,w()),{worker:c,port:d,blobUrl:i}=await A({assetBaseUrl:a}),l=new S(d),{workspaceId:u,workspaceFolder:m}=await l.request("createWorkspace",{}),f=new n({spec:o,assetBaseUrl:a,worker:c,blobUrl:i,rpc:l,workspaceId:u,workspaceFolder:m,onLog:s});return f.#s=await f.#u(),f}async#u(){let e=new MessageChannel,t=new S(e.port1);t.handle("loadModule",({code:s,moduleName:o})=>(this.#d.modules.push({name:o,code:s,map:v(s)}),{})),t.handle("run",({libraryUri:s,mode:o})=>(this.#d.libraryUri=s,this.#d.mode=o,{status:"running"}));for(let[s,o]of Object.entries(X))t.handle(s,()=>o);let{sandboxId:r}=await this.#n.request("workspace/connectSandbox",{workspaceId:this.#r,port:e.port2});return r}get engine(){return this.#e.id}get modes(){return[...this.#e.runModes]}get assetBaseUrl(){return new URL(this.#i)}writeFile(e,t){return this.#n.request("workspace/writeFileFromText",{workspaceId:this.#r,uri:e,text:t})}async readFile(e){let{text:t}=await this.#n.request("workspace/readFileAsText",{workspaceId:this.#r,uri:e});return t}pub(e,t=[]){return this.#n.request("workspace/pub",{workspaceId:this.#r,uri:".",command:e,args:t})}async resolve(e){let t=e??this.#c??U(this.#e);if(t===this.#c)return"";await this.writeFile("pubspec.yaml",t);let{log:r}=await this.pub("get");return this.#c=t,r?.trim()&&this.#l?.({message:r.trim(),source:"pub"}),r??""}async compile(e,{dependencies:t,pubspec:r,file:s="main.dart",mode:o}={}){return await this.resolve(r??U(this.#e,t??[])),await this.writeFile(s,e),this.compileFile(s,o)}async compileFile(e="main.dart",t=this.#e.defaultMode){if(!this.#e.runModes.includes(t))throw new TypeError(`dart-wasm: engine '${this.#e.id}' does not have a '${t}' mode. Use one of: ${this.#e.runModes.join(", ")}.`);let r=this.#d;r.modules=[],r.libraryUri=null,r.mode=null,this.#s!==void 0&&(await this.#n.request("workspace/sandbox/close",{workspaceId:this.#r,sandboxId:this.#s}).catch(()=>{}),this.#s=void 0),this.#s=await this.#u();let{log:s}=await this.#n.request("workspace/sandbox/run",{workspaceId:this.#r,sandboxId:this.#s,path:e,mode:t});if(!r.libraryUri)throw new Error("dart-wasm: the compiler produced no runnable entrypoint");return s?.trim()&&this.#l?.({message:s.trim(),source:"compiler"}),{engine:this.#e.id,mode:t,modules:r.modules,libraryUri:r.libraryUri,log:s??""}}dispose(){this.#t.terminate(),URL.revokeObjectURL(this.#o)}},M=n=>g.create(n);function Y(n,e){let t=n?.$dartLoader;if(!t||typeof t.forceLoadScript!="function"||t.__dartWasmInflating)return;let r=t.forceLoadScript;t.__dartWasmInflating=!0,t.forceLoadScript=(s,o)=>{e(s).then(a=>r(a,o)).catch(()=>r(s,o))}}var C=n=>`${I(n)}${F(n)}`;function W({iframe:n,assetBase:e,timeout:t}){let r=O({assetBase:e});return new Promise((s,o)=>{let a=d=>{if(d.source!==n.contentWindow)return;let i=d.data;!i||typeof i!="object"||(i.action==="connect"?(clearTimeout(c),window.removeEventListener("message",a),Y(n.contentWindow,r),s({iframe:n,port:i.port})):i.action==="error"&&(clearTimeout(c),window.removeEventListener("message",a),o(new Error(`the Dart sandbox failed to load:
${i.message}`))))},c=setTimeout(()=>{window.removeEventListener("message",a),o(new Error("timed out waiting for the Dart sandbox to boot."))},t);window.addEventListener("message",a)})}function Q({assetBase:n,container:e,timeout:t}){let r=document.createElement("iframe");r.setAttribute("sandbox","allow-scripts allow-same-origin"),r.title="Dart sandbox",e.append(r);let s=new URL("sandbox.js",n).href;return r.srcdoc=["<!DOCTYPE html>",'<html><head><meta charset="utf-8">',`<script>${C(n.href)}<\/script>`,`<script src="${s}" defer><\/script>`,"</head><body></body></html>"].join(""),W({iframe:r,assetBase:n.href,timeout:t})}function ee({iframe:n,assetBase:e,timeout:t}){let r=n.contentDocument;if(!r)throw new Error("dart-wasm: the given iframe has no same-origin document to run in");if(r.defaultView.__dartWasmSandbox)throw new Error("dart-wasm: that iframe is already running a Dart sandbox");r.defaultView.__dartWasmSandbox=!0;let s=r.createElement("script");s.textContent=C(e.href),r.head.append(s);let o=r.createElement("script");return o.src=new URL("sandbox.js",e).href,r.head.append(o),W({iframe:n,assetBase:e.href,timeout:t})}function te(n){if(n){let t=typeof n=="string"?document.querySelector(n):n;if(!t)throw new TypeError(`dart-wasm: container not found: ${String(n)}`);return{element:t,owned:!1}}let e=document.createElement("div");return e.dataset.dartWasmSandbox="",e.style.display="none",document.body.append(e),{element:e,owned:!0}}var b=class n{#e;#i;#t;#o;#n;#r;#a;#s;#c=!1;constructor({spec:e,assetBaseUrl:t,iframe:r,ownsIframe:s,ownedContainer:o,port:a,onConsole:c,onError:d}){this.#e=e,this.#i=t,this.#t=r,this.#o=s,this.#n=o,this.#a=c,this.#s=d,this.#r=new S(a),this.#r.on("console",({level:i,message:l})=>this.#a?.({level:i,message:l})),this.#r.on("error",({message:i})=>this.#s?.({message:i})),this.#r.on("unhandledRejection",({message:i})=>this.#s?.({message:i}))}static async create({engine:e="dart",baseUrl:t,assetBaseUrl:r,container:s,iframe:o,timeout:a=18e4,onConsole:c,onError:d}={}){let i=h(e),l=r?new URL(r):y(i,t,w()),u,m=null;if(o)u=await ee({iframe:o,assetBase:l,timeout:a});else{if(!s&&i.id==="flutter")throw new TypeError("dart-wasm: `container` is required for engine 'flutter' - the app renders into the sandbox.");let f=te(s);m=f.owned?f.element:null,u=await Q({assetBase:l,container:f.element,timeout:a})}return new n({spec:i,assetBaseUrl:l,iframe:u.iframe,ownsIframe:!o,ownedContainer:m,port:u.port,onConsole:c,onError:d})}get engine(){return this.#e.id}get modes(){return[...this.#e.runModes]}get assetBaseUrl(){return new URL(this.#i)}get iframe(){return this.#t}async run(e,{onConsole:t,onError:r}={}){if(this.#c)throw new Error("dart-wasm: this runner has been disposed");if(!e?.libraryUri)throw new TypeError("dart-wasm: expected a compiled program, with a `libraryUri`");t&&(this.#a=t),r&&(this.#s=r);for(let s of e.modules??[])await this.#r.request("loadModule",{code:s.code,moduleName:s.name});return this.#r.request("run",{libraryUri:e.libraryUri,mode:e.mode})}dispose(){this.#c=!0,this.#o&&this.#t.remove(),this.#n?.remove()}},_=n=>b.create(n);function re(n,e){return new Promise((t,r)=>{let s=n.createElement("script");s.src=e,s.async=!1,s.onload=()=>t(),s.onerror=()=>r(new Error(`dart-wasm: failed to load ${e}`)),n.head.append(s)})}var ne={dart:["ddc_module_loader.js","dart_stack_trace_mapper.js","dart_sdk.js"],flutter:["ddc_module_loader.js","dart_stack_trace_mapper.js","flutter.js","dart_sdk.js","flutter_web.js"]},se="https://www.gstatic.com/flutter-canvaskit/c3edad8766a937c49d66380894017cad401aab51/",G="Starting application from main method in: ";function oe(n,e){let t=n.console,r=Object.create(t);Object.defineProperty(r,"log",{value:(...s)=>{if(!(typeof s[0]=="string"&&s[0].startsWith(G)))return t.log.apply(t,s)}}),n.console=r;try{return e()}finally{n.console=t}}var z=new Map,x=class{#e;#i;#t;#o=0;constructor({scope:e,engine:t,assetBaseUrl:r}){this.#e=e,this.#i=t,this.#t=r}get engine(){return this.#i}get assetBaseUrl(){return new URL(this.#t)}get embedder(){return this.#e.dartDevEmbedder}async loadModule({name:e,code:t}){let r=this.#e,s=r.$dartLoader;if(!s)throw new Error("dart-wasm: the DDC module loader is not loaded");let o=r.URL.createObjectURL(new r.Blob([`${t}
//# sourceURL=${e}.js?${this.#o++}
`],{type:"application/javascript"}));s.moduleIdToUrl.set(e,o),s.urlToModuleId.set(o,e),await new Promise(a=>s.forceLoadScript(o,a))}runMain(e,t={}){let r=this.#e.dartDevEmbedder;if(!r)throw new Error("dart-wasm: the DDC runtime is not loaded");return oe(this.#e,()=>r.runMain(e,t))}async#n(e){let t=this.#e,r=t._flutter?.loader;if(!r)throw new Error("dart-wasm: flutter.js is not loaded");let s=t.URL.createObjectURL(new t.Blob([`(function () {
            var real = self.console;
            var filtered = Object.create(real);
            Object.defineProperty(filtered, 'log', { value: function () {
              if (typeof arguments[0] === 'string' &&
                  arguments[0].indexOf(${JSON.stringify(G)}) === 0) return;
              return real.log.apply(real, arguments);
            } });
            self.console = filtered;
            try {
              self.dartDevEmbedder.runMain(${JSON.stringify(e)}, {});
            } finally {
              self.console = real;
            }
          })();`],{type:"application/javascript"}));try{await(await(await new Promise(c=>{r.loadEntrypoint({entrypointUrl:s,onEntrypointLoaded:c})})).initializeEngine({canvasKitBaseUrl:se,assetBase:this.#t.href})).runApp()}finally{t.URL.revokeObjectURL(s)}}async run(e){if(!e?.libraryUri)throw new TypeError("dart-wasm: expected a compiled program, with a `libraryUri`");for(let t of e.modules??[])await this.loadModule(t);return e.mode==="flutter"?this.#n(e.libraryUri):this.runMain(e.libraryUri)}};function T({engine:n="dart",baseUrl:e,assetBaseUrl:t,document:r=typeof document<"u"?document:void 0,onConsole:s,onError:o}={}){if(!r)return Promise.reject(new TypeError("dart-wasm: loadRuntime needs a document"));let a=h(n),c=t?new URL(t):y(a,e,w()),d=`${a.id}@${c.href}`,i=z.get(d);if(i)return i;let l=(async()=>{let u=r.defaultView??globalThis,m=O({assetBase:c.href});for(let p of ne[a.id])await re(r,await m(new URL(p,c).href));let f=u.$dartStackTraceUtility,$=u.dartDevEmbedder;if(f?.setSourceMapProvider&&$?.debugger&&f.setSourceMapProvider(p=>{let R=String(p).replace(/\.js\?\d+$/,"");return $.debugger.getSourceMap(R)??null}),typeof s=="function"){let p=u.console.log;u.console.log=(...R)=>{p.apply(u.console,R),s({level:"log",message:R.map(String).join(" ")})}}return typeof o=="function"&&(u.addEventListener("error",p=>{o({message:String(p.error?.stack??p.message??p)})}),u.addEventListener("unhandledrejection",p=>{o({message:String(p.reason?.stack??p.reason??p)})})),new x({scope:u,engine:a.id,assetBaseUrl:c})})();return z.set(d,l),l}function ie(n,e){if(e){let r=typeof e=="string"?document.querySelector(e):e;if(!r)throw new TypeError(`dart-wasm: container not found: ${String(e)}`);return{element:r,owned:!1}}if(n.id==="flutter")throw new TypeError("dart-wasm: `container` is required for engine 'flutter' - the app renders into the sandbox.");let t=document.createElement("div");return t.dataset.dartWasmSandbox="",t.style.display="none",document.body.append(t),{element:t,owned:!0}}var k=class n{#e;#i;#t;#o=null;#n;#r;#a;#s;#c;#l;constructor({spec:e,assetBaseUrl:t,compiler:r,container:s,ownsContainer:o,onConsole:a,onError:c,onLog:d,onModule:i}){this.#e=e,this.#i=t,this.#t=r,this.#n=s,this.#r=o,this.#a=a,this.#s=c,this.#c=d,this.#l=i}static async create({engine:e="dart",baseUrl:t,container:r,onConsole:s,onError:o,onLog:a,onModule:c}={}){let d=h(e),i=y(d,t,w()),{element:l,owned:u}=ie(d,r),m=await g.create({engine:e,assetBaseUrl:i,onLog:a});return new n({spec:d,assetBaseUrl:i,compiler:m,container:l,ownsContainer:u,onConsole:s,onError:o,onLog:a,onModule:c})}get engine(){return this.#e.id}get modes(){return[...this.#e.runModes]}get assetBaseUrl(){return new URL(this.#i)}get container(){return this.#n}writeFile(e,t){return this.#t.writeFile(e,t)}readFile(e){return this.#t.readFile(e)}pub(e,t=[]){return this.#t.pub(e,t)}resolve(e){return this.#t.resolve(e)}async run(e,t){return this.#d(await this.#t.compile(e,t))}async runFile(e="main.dart",t){return this.#d(await this.#t.compileFile(e,t))}async#d(e){for(let t of e.modules)this.#l?.(t);return await this.#o?.dispose(),this.#o=await b.create({engine:this.#e.id,assetBaseUrl:this.#i,container:this.#n,onConsole:this.#a,onError:this.#s}),await this.#o.run(e),{log:e.log,modules:e.modules}}async dispose(){await this.#o?.dispose(),this.#t.dispose(),this.#r&&this.#n.remove()}},q=n=>k.create(n);var J=(()=>{if(typeof document<"u"&&document.currentScript?.src)return document.currentScript.src;if(typeof self<"u"&&self.location?.href)return self.location.href})();if(J)try{N(new URL("./",J))}catch{}globalThis.DartWasm={createCompiler:M,Compiler:g,createRunner:_,Runner:b,loadRuntime:T,Runtime:x,createDartpad:q,Dartpad:k,ENGINES:E,ENGINE_IDS:j,buildPubspec:U,dependencyLines:L,parseSourceMap:v};})();
