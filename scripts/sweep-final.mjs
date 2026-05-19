/* sweep-final.mjs — Batch 8: FINALE comprehensive sweep.
 * Tokeniseert ALLE resterende hardcoded component-hex (kleurtinten,
 * accent-shades, fill/stroke-iconen, box-shadow, select-pijl-residu).
 * Robuuste parser (comments+url beschermd, per-decl, property=laatste id,
 * --token-defs gevrijwaard). Palette-indirectie: light = EXACT de hex
 * (LIGHT BYTE-IDENTIEK); dark = HSL/rol-bewust. Token-prefix per ROL
 * (pt=tekst/icoon, pb=border, ps=achtergrond, px=overig) zodat dark
 * rol-correct is. Brand-exact -> bestaand semantisch token.
 * Reuse bestaand <prefix>-<hex> indien al gedefinieerd. Alleen styles.css.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CSS = join(dirname(fileURLToPath(import.meta.url)), "..", "styles.css");
let src = readFileSync(CSS, "utf8");

const comments = [];
src = src.replace(/\/\*[\s\S]*?\*\//g, (m) => { comments.push(m); return ` C${comments.length - 1} `; });
const urls = [];
src = src.replace(/url\([^)]*\)/gi, (m) => { urls.push(m); return `URL${urls.length - 1}URL`; });

const defined = new Set();
{ let x; const re=/--(p|pb|ps|pt|px)-([0-9a-f]{6})\s*:/g; while((x=re.exec(src))) defined.add(`${x[1]}-${x[2]}`); }

const ACCENT = { "2563eb":"--blue","dc2626":"--red","16a34a":"--green","ca8a04":"--yellow" };
const need = new Map();
let count = 0;

const ex = h => (h.length===3 ? h.split("").map(c=>c+c).join("") : h).toLowerCase();
function rgb(h){ return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function toHsl([r,g,b]){ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn; let h=0,s=0,l=(mx+mn)/2;
  if(d){ s=l>0.5? d/(2-mx-mn): d/(mx+mn);
    h = mx===r ? (g-b)/d+(g<b?6:0) : mx===g ? (b-r)/d+2 : (r-g)/d+4; h/=6; }
  return [h,s,l]; }
function hslHex([h,s,l]){ let r,g,b; if(!s){r=g=b=l;} else{
  const q=l<0.5? l*(1+s): l+s-l*s, p=2*l-q;
  const t=(x)=>{ if(x<0)x+=1; if(x>1)x-=1; if(x<1/6)return p+(q-p)*6*x; if(x<1/2)return q; if(x<2/3)return p+(q-p)*(2/3-x)*6; return p; };
  r=t(h+1/3); g=t(h); b=t(h-1/3); }
  const H=n=>Math.round(n*255).toString(16).padStart(2,"0"); return `#${H(r)}${H(g)}${H(b)}`; }
function lum(c){ return (0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255; }

function prefixFor(prop){
  if (prop==="color"||prop==="-webkit-text-fill-color"||prop==="fill"||prop==="stroke") return "pt";
  if (/(^|-)border|outline/.test(prop)) return "pb";
  if (prop==="background"||prop==="background-color") return "ps";
  return "px";
}
function darkFor(prefix, c){
  const [h,s,l]=toHsl(c), L=lum(c), neutral = s<0.12;
  if (prefix==="pt"){
    if (neutral){ if(L>=0.72) return null; return L<0.30?"#f5f6f8":L<0.55?"#c7ccd6":"#9aa3b2"; }
    return hslHex([h, Math.min(s,0.85), Math.min(0.80, Math.max(0.64, l<0.5? 0.68 : l))]);
  }
  if (prefix==="pb"){
    if (neutral) return "#1f242d";
    return hslHex([h, Math.min(s,0.6), 0.42]);
  }
  if (prefix==="ps"){
    if (neutral) return l>0.6 ? "#1a1f28" : "#1f242d";
    if (l>0.8) return hslHex([h, Math.min(s,0.32), 0.16]);   // lichte tint -> donkere tint
    return hslHex([h, Math.min(s,0.5), 0.38]);
  }
  // px / overig
  if (neutral) return l>0.5 ? "#1f242d" : "#9aa3b2";
  return hslHex([h, Math.min(s,0.6), Math.min(0.62, Math.max(0.40, l))]);
}

function tokenFor(prop, hx){
  const h = ex(hx);
  if (ACCENT[h]) { count++; return `var(${ACCENT[h]})`; }
  const prefix = prefixFor(prop);
  const c = rgb(h);
  // bestaande token (zelfde prefix) hergebruiken
  if (defined.has(`${prefix}-${h}`)) { count++; return `var(--${prefix}-${h})`; }
  const dark = darkFor(prefix, c);
  if (dark === null) return "#" + hx;          // lichte tekst-op-accent: laat staan
  const key = `${prefix}-${h}`;
  if (!need.has(key)) need.set(key, { key, hex:h, dark });
  count++; return `var(--${key})`;
}

let out="", buf="";
for (let i=0;i<src.length;i++){ const ch=src[i];
  if (ch==="{"){ out+=buf+ch; buf=""; }
  else if (ch==="}"){
    out += buf.split(";").map((decl)=>{
      const ci=decl.indexOf(":"); if(ci<0) return decl;
      const head=decl.slice(0,ci);
      // property = begin van declaratie ná comment-placeholders/whitespace.
      // Custom-property-definitie (--x:, ook met cijfers) NOOIT aanraken.
      const cleaned=head.replace(/\sC\d+\s/g," ").trim();
      if(cleaned.startsWith("--")) return decl;
      const pn=(cleaned.match(/[a-zA-Z-]+$/)||[""])[0].toLowerCase();
      return head+":"+decl.slice(ci+1).replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,(m,hx)=>tokenFor(pn,hx));
    }).join(";");
    out+=ch; buf="";
  } else buf+=ch;
}
out+=buf;

if (need.size){
  const it=[...need.values()];
  const L=":root {\n"+it.map(t=>`  --${t.key}: #${t.hex};`).join("\n")+"\n}\n";
  const D='[data-theme="dark"] {\n'+it.map(t=>`  --${t.key}: ${t.dark};`).join("\n")+"\n}\n";
  const blk=`\n/* PALETTE finale (batch 8) — light = exact, dark = HSL/rol */\n${L}${D}`;
  const a="--p-arrow-chip: rgba(20, 24, 33, 0.85);";
  const ai=out.indexOf(a);
  const at = ai>=0 ? out.indexOf("}",ai)+1 : out.indexOf("}",out.indexOf(":root {"))+1;
  out = out.slice(0,at) + "\n" + blk + out.slice(at);
}
out = out.replace(/URL(\d+)URL/g,(_m,n)=>urls[Number(n)]);
out = out.replace(/ C(\d+) /g,(_m,n)=>comments[Number(n)]);
writeFileSync(CSS,out,"utf8");
console.log(`Finale sweep: ${count} vervangingen; ${need.size} nieuwe palette-tokens.`);
