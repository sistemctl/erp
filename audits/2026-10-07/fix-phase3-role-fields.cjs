const fs=require('node:fs');const dir='frontend/assets/js/modules';
for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.ts'))) {
 let s=fs.readFileSync(`${dir}/${f}`,'utf8');const ids=new Map();
 for(const m of s.matchAll(/<(input|select|textarea)\b[^>]*\bid="([^"]+)"/g)){if(!ids.has(m[2]))ids.set(m[2],new Set());ids.get(m[2]).add(m[1]);}
 let changed=false;for(const [id,k] of ids)if(k.size>1){const re=new RegExp(`requireElement\\('${id}', HTML(?:Input|Select|TextArea)Element\\)`,'g');if(re.test(s)){s=s.replace(re,`requireField('${id}')`);changed=true;}}
 if(changed){if(!/import \{[^}]*\brequireField\b[^}]*\}/.test(s))s=`import { requireField } from '../utils/dom.js';\n`+s;fs.writeFileSync(`${dir}/${f}`,s);}
}
