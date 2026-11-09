import fs from "node:fs";
import { parse } from "@babel/parser";

const html = fs.readFileSync("index.html", "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) {
  throw new Error("No Babel/JSX script block was found in index.html.");
}
for (let index = 0; index < scripts.length; index += 1) {
  parse(scripts[index][1], { sourceType: "script", plugins: ["jsx"] });
  process.stdout.write("Parsed Babel script block " + (index + 1) + " successfully.\n");
}
