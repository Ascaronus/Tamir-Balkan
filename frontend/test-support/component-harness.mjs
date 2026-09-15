import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
export function load(path,mocks={},globals={}) {
 const exports={}
 const source=fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const jsx=(type,props,key)=>({type,props,key})
 vm.runInNewContext(code,{exports,require:id=>id==='react/jsx-runtime'?{jsx,jsxs:jsx}:id in mocks?mocks[id]:(()=>{throw Error('Missing mock '+id)})(),URL,URLSearchParams,console,process,AbortSignal,...globals})
 return exports
}
export function hooks(){
 let slots=[],pos=0,effects=[]
 return {react:{
  useState(init){const i=pos++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},
  useRef(v){const i=pos++;return slots[i]??={current:v}},
  useEffect(fn,deps){const i=pos++;if(!slots[i]||deps.some((d,j)=>d!==slots[i][j])){slots[i]=deps;effects.push(fn)}},
  useCallback:f=>f,useMemo:f=>f(),createContext:()=>({Provider:'Provider'})
 },render(f){pos=0;return f()},async flush(){effects.splice(0).forEach(f=>f());await new Promise(r=>setImmediate(r))}}
}
export function find(tree,predicate){
 if(!tree)return null
 if(Array.isArray(tree)){for(const c of tree){const r=find(c,predicate);if(r)return r}return null}
 if(typeof tree==='object'){if(predicate(tree))return tree;return find(tree.props?.children,predicate)}
 return null
}
