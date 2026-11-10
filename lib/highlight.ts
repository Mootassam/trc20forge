/**
 * Tiny, linear-time Solidity / JSON highlighter. One left-to-right pass with a
 * sticky regex per token class, so it can never backtrack catastrophically.
 */
export type Token = { t: "comment" | "string" | "keyword" | "type" | "number" | "fn" | "plain"; v: string };

const KEYWORDS = new Set([
  "pragma", "solidity", "contract", "function", "returns", "return", "event", "emit", "constructor", "mapping",
  "external", "public", "private", "internal", "pure", "view", "payable", "memory", "storage", "calldata",
  "constant", "immutable", "indexed", "require", "if", "else", "for", "while", "unchecked", "true", "false",
  "type", "import", "interface", "library", "modifier", "override", "virtual", "this", "msg", "new", "delete",
]);
const TYPES = /^(address|bool|string|bytes\d*|u?int\d*)$/;

const RULES: [Token["t"], RegExp][] = [
  ["comment", /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
  ["string", /"(?:[^"\\\n]|\\.)*"/y],
  ["number", /\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:e\d+)?)\b/y],
  ["plain", /[A-Za-z_$][A-Za-z0-9_$]*/y], // identifiers, classified below
  ["plain", /\s+/y],
  ["plain", /[^\sA-Za-z0-9_$"/]+|\//y],
];

export function tokenize(code: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < code.length) {
    let matched = false;
    for (const [kind, re] of RULES) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (!m || m[0].length === 0) continue;
      let t = kind;
      const v = m[0];
      if (kind === "plain" && /^[A-Za-z_$]/.test(v)) {
        if (KEYWORDS.has(v)) t = "keyword";
        else if (TYPES.test(v)) t = "type";
        else if (code[i + v.length] === "(") t = "fn";
        else if (/^[A-Z]/.test(v)) t = "type";
      }
      const last = out[out.length - 1];
      if (last && last.t === t && t === "plain") last.v += v;
      else out.push({ t, v });
      i += v.length;
      matched = true;
      break;
    }
    if (!matched) {
      out.push({ t: "plain", v: code[i] });
      i++;
    }
  }
  return out;
}

/** Splits tokens into lines (tokens spanning newlines, e.g. block comments, are cut). */
export function tokenLines(code: string): Token[][] {
  const lines: Token[][] = [[]];
  for (const tok of tokenize(code)) {
    const parts = tok.v.split("\n");
    parts.forEach((p, idx) => {
      if (idx > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ t: tok.t, v: p });
    });
  }
  return lines;
}
