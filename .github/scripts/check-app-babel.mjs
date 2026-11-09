import fs from "node:fs";
import { parse } from "@babel/parser";

const html = fs.readFileSync("index.html", "utf8");
const openTag = '<script type="text/babel">';
const closeTag = "</script>";
const scripts = [];
let cursor = 0;
while (true) {
  const start = html.indexOf(openTag, cursor);
  if (start < 0) break;
  const contentStart = start + openTag.length;
  const end = html.indexOf(closeTag, contentStart);
  if (end < 0) throw new Error("A Babel script block is missing its closing tag.");
  scripts.push(html.slice(contentStart, end));
  cursor = end + closeTag.length;
}
if (!scripts.length) throw new Error("No Babel/JSX script block was found in index.html.");
for (let index = 0; index < scripts.length; index += 1) {
  parse(scripts[index], { sourceType: "script", plugins: ["jsx"] });
  process.stdout.write("Parsed Babel script block " + (index + 1) + " successfully.\n");
}
