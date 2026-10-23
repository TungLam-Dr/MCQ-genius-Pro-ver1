import fs from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

async function testAll40() {
  const data = new Uint8Array(fs.readFileSync('public/assets/aistudio/ANS_BLOCK_1_TIM_M_CH_b9667482.pdf'));
  const doc = await pdfjs.getDocument({ data }).promise;

  let fullText = '';
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items as any[];

    let lastY: number | null = null;
    let lastXEnd: number | null = null;
    let pageLines: string[] = [];
    let currentLine = '';

    for (const item of items) {
      if (!item || typeof item.str !== 'string') continue;
      const x = item.transform ? item.transform[4] : 0;
      const y = item.transform ? item.transform[5] : 0;
      const width = item.width || 0;

      if (lastY !== null && Math.abs(y - lastY) > 3) {
        if (currentLine.trim()) pageLines.push(currentLine.trim());
        currentLine = item.str;
      } else {
        if (lastXEnd !== null) {
          const gap = x - lastXEnd;
          if (gap > 1.8 && !currentLine.endsWith(' ') && !item.str.startsWith(' ')) {
            currentLine += ' ';
          }
        }
        currentLine += item.str;
      }
      lastY = y;
      lastXEnd = x + width;
    }
    if (currentLine.trim()) pageLines.push(currentLine.trim());
    fullText += `\n--- TRANG ${pageNum} ---\n` + pageLines.join('\n');
  }

  const câuBlockRegex = /(?:^|\n)(?=(?:Câu|Question|Q|Block\s*[\d\-]+\s*Câu|\[Câu|\(Câu)\s*\d+)/gi;
  const blocks = fullText.split(câuBlockRegex).map((b) => b.trim()).filter(Boolean);

  let detectedCount = 0;
  blocks.forEach((block) => {
    const câuHeaderMatch = block.match(/(?:Câu|Question|Q|Block\s*[\d\-]+\s*Câu|\[Câu|\(Câu)\s*(\d+)(?:\s*ID[\:\s]*(\d+))?/i);
    if (!câuHeaderMatch) return;
    const qNum = parseInt(câuHeaderMatch[1], 10);
    const qId = câuHeaderMatch[2];

    const explicitAnsMatch =
      block.match(/(?:Đáp án|Key|Lựa chọn đúng|đáp án đúng|Đáp án đúng|Phương án đúng)(?:\s+là)?[\:\s]*([A-J])\b/i) ||
      block.match(/\b([A-J])\s+(?:là đáp án đúng|chính xác|đúng)\b/i) ||
      block.match(/(?:Lựa chọn|Phương án)\s+([A-J])\s+(?:là|được chọn)/i);

    const incorrectChoicesFound = new Set<string>();

    const choicePattern = /\((?:Lựa chọn|Các lựa chọn|Phương án)\s+([^\)]+)\)/gi;

    let choiceMatch: RegExpExecArray | null;
    while ((choiceMatch = choicePattern.exec(block)) !== null) {
      const lettersStr = choiceMatch[1];
      const foundLetters = lettersStr.match(/\b[A-J]\b/gi) || [];
      foundLetters.forEach((l) => incorrectChoicesFound.add(l.toUpperCase()));
    }

    let correctLetter = '';
    if (explicitAnsMatch) {
      correctLetter = explicitAnsMatch[1].toUpperCase();
    } else if (incorrectChoicesFound.size >= 2) {
      let maxFoundCode = 68; // Default 'D' (4 choices)
      incorrectChoicesFound.forEach((l) => {
        const code = l.charCodeAt(0);
        if (code > maxFoundCode) maxFoundCode = code;
      });

      const optionsLimitCode = Math.max(69, maxFoundCode);

      for (let code = 65; code <= optionsLimitCode; code++) {
        const letter = String.fromCharCode(code);
        if (!incorrectChoicesFound.has(letter)) {
          correctLetter = letter;
          break;
        }
      }
    }

    if (correctLetter) {
      detectedCount++;
      console.log(`Q${qNum} (ID: ${qId}) => Correct Answer: ${correctLetter} (incorrect set: [${Array.from(incorrectChoicesFound).sort().join(', ')}])`);
    } else {
      console.log(`MISSED Q${qNum} (ID: ${qId}) | incorrect set: [${Array.from(incorrectChoicesFound).sort().join(', ')}]`);
    }
  });

  console.log(`TOTAL DETECTED: ${detectedCount} / ${blocks.length - 1}`);
}

testAll40().catch(console.error);
