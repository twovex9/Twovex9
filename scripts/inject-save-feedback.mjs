import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const d = path.join(__dirname, "..");
const ins = "\n  <script src=\"save-feedback.js\" defer></script>\n";

for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".html"))) {
  const p = path.join(d, f);
  let s = fs.readFileSync(p, "utf8");
  if (s.includes("save-feedback.js")) {
    console.log("skip", f);
    continue;
  }
  const m = s.match(/<body[^>]*>/i);
  if (!m) {
    console.log("no body", f);
    continue;
  }
  const i = s.indexOf(m[0]) + m[0].length;
  s = s.slice(0, i) + ins + s.slice(i);
  fs.writeFileSync(p, s);
  console.log("ok", f);
}
