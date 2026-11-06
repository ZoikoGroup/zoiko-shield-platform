const fs = require("fs");
const path = require("path");

const xmlPath = path.resolve(__dirname, "..", "docx_extracted", "word", "document.xml");
const xml = fs.readFileSync(xmlPath, "utf-8");

// Parse paragraphs <w:p>
const paragraphs = [];
const pMatches = xml.match(/<w:p(?:\s|>).*?<\/w:p>/gs) || [];

for (const p of pMatches) {
  const textMatches = p.match(/<w:t(?:\s|>).*?<\/w:t>/gs) || [];
  const text = textMatches
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("")
    .trim();
  if (text) {
    paragraphs.push(text);
  }
}

const output = paragraphs.join("\n\n");
fs.writeFileSync(path.resolve(__dirname, "..", "parsed_bug_report.txt"), output, "utf-8");
console.log("Extracted text length:", output.length);
console.log(output);

