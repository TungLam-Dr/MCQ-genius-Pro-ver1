import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
}

export interface ExtractedPdfPage {
  pageNum: number;
  text: string;
  images: string[]; // base64 images found on page
  imagePlacements: { dataUrl: string; sourceId?: string; pageNum: number }[];
  answerExcerpts?: { sourceId?: string; sourceNumber: number; pageNum: number; dataUrl: string }[];
}

type Matrix = [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}

// PDF image operators inherit transforms from earlier save/transform commands.
// Their unit square gives the exact displayed rectangle, unlike image index order.
function imageBoxes(ops: any, viewport: any) {
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  let matrix: Matrix = [...identity];
  const stack: Matrix[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn === pdfjs.OPS.save) stack.push([...matrix]);
    else if (fn === pdfjs.OPS.restore) matrix = stack.pop() || [...identity];
    else if (fn === pdfjs.OPS.transform) matrix = multiply(matrix, ops.argsArray[i] as Matrix);
    else if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject) {
      const corners = [[0,0], [1,0], [0,1], [1,1]].map(([x,y]) =>
        viewport.convertToViewportPoint(matrix[0]*x+matrix[2]*y+matrix[4], matrix[1]*x+matrix[3]*y+matrix[5]));
      const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      const w = Math.max(...xs)-x, h = Math.max(...ys)-y;
      // Ignore tiny icons and masks; keep substantive figures only.
      if (w >= 45 && h >= 25) boxes.push({x,y,w,h});
    }
  }
  return boxes;
}

export async function parsePdfBuffer(buffer: ArrayBuffer | Uint8Array, options: {extractImages?: boolean; extractAnswerPages?: boolean} = {}): Promise<{
  numPages: number;
  fullText: string;
  pages: ExtractedPdfPage[];
}> {
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;

  let fullText = '';
  const pages: ExtractedPdfPage[] = [];
  let lastQuestionId: string | undefined;
  let lastAnswerQuestion: { sourceId?: string; sourceNumber: number } | undefined;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    // Reconstruct page text line by line using y position and x coordinate gaps
    const items = content.items as any[];
    let lastY: number | null = null;
    let lastXEnd: number | null = null;
    let pageLines: string[] = [];
    const anchors: { y: number; sourceId: string }[] = [];
    const answerAnchors: { y: number; sourceId?: string; sourceNumber: number }[] = [];
    let currentLine = '';
    let currentY = 0;
    const finishLine = () => {
      if (!currentLine.trim()) return;
      pageLines.push(currentLine.trim());
      const match = currentLine.match(/^\s*(?:Câu|Question|Q)\s*\d+\s*(?:[.):-]\s*)?ID\s*:?\s*(\d+)/i);
      if (match) anchors.push({ y: page.getViewport({scale:1}).height - currentY, sourceId: match[1] });
      if (options.extractAnswerPages) {
        const answer = currentLine.match(/^\s*(?:Câu|Question|Q)\s*(\d+)\s*(?:[.):-]\s*)?(?:ID\s*:?\s*(\d+))\b/i);
        if (answer) answerAnchors.push({y:page.getViewport({scale:1}).height-currentY,sourceNumber:Number(answer[1]),sourceId:answer[2]});
      }
    };

    for (const item of items) {
      if (!item || typeof item.str !== 'string') continue;

      const x = item.transform ? item.transform[4] : 0;
      const y = item.transform ? item.transform[5] : 0;
      const width = item.width || 0;

      if (lastY === null) {
        currentLine = item.str;
        currentY = y;
      } else if (Math.abs(y - lastY) > 3) {
        finishLine();
        currentLine = item.str;
        currentY = y;
      } else {
        if (lastXEnd !== null) {
          const gap = x - lastXEnd;
          if (gap > 1.5 && !currentLine.endsWith(' ') && !item.str.startsWith(' ')) {
            currentLine += ' ';
          }
        }
        currentLine += item.str;
      }
      lastY = y;
      lastXEnd = x + width;
    }
    finishLine();

    const pageText = pageLines.join('\n');
    const imagesOnPage: string[] = [];
    const imagePlacements: ExtractedPdfPage['imagePlacements'] = [];
    const answerExcerpts: NonNullable<ExtractedPdfPage['answerExcerpts']> = [];

    // Preserve PDF-only diagrams, vector tables and captions by retaining a
    // readable crop of every explanation page. Split pages with two questions
    // at their printed headers so images never drift to the next answer.
    if (options.extractAnswerPages && typeof document !== 'undefined') {
      const scale = 1.6;
      const viewport = page.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({canvasContext:ctx,canvas,viewport} as any).promise;
        const bounds = [0,...answerAnchors.map(a=>Math.max(0,a.y-20)),viewport.height/scale];
        for (let i=0;i<bounds.length-1;i++) {
          const owner = i===0 ? lastAnswerQuestion : answerAnchors[i-1];
          if (!owner) continue;
          const top = Math.floor(bounds[i]*scale);
          const bottom = Math.min(canvas.height,Math.ceil(bounds[i+1]*scale));
          if (bottom-top<35) continue;
          const crop = document.createElement('canvas');
          crop.width=canvas.width; crop.height=bottom-top;
          crop.getContext('2d')?.drawImage(canvas,0,top,canvas.width,crop.height,0,0,canvas.width,crop.height);
          answerExcerpts.push({sourceNumber:owner.sourceNumber,sourceId:owner.sourceId,pageNum,dataUrl:crop.toDataURL('image/jpeg',0.82)});
        }
      }
    }
    if (answerAnchors.length) lastAnswerQuestion=answerAnchors.at(-1);

    // Render only pages containing displayed figures, then crop their actual
    // PDF rectangles. This also handles JPEG, inline images, masks and charts.
    if (options.extractImages !== false) try {
      const ops = await page.getOperatorList();
      const view = page.getViewport({scale: 1});
      const boxes = imageBoxes(ops, view).sort((a,b) => a.y-b.y);
      if (boxes.length && typeof document !== 'undefined') {
        const scale = 1.8;
        const viewport = page.getViewport({scale});
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        await page.render({canvasContext:ctx, canvas, viewport} as any).promise;
        for (const box of boxes) {
          const x = Math.max(0, Math.floor(box.x*scale)-3), y = Math.max(0, Math.floor(box.y*scale)-3);
          const w = Math.min(canvas.width-x, Math.ceil(box.w*scale)+6);
          const h = Math.min(canvas.height-y, Math.ceil(box.h*scale)+6);
          if (w <= 0 || h <= 0) continue;
          const cropped = document.createElement('canvas');
          cropped.width = w; cropped.height = h;
          cropped.getContext('2d')?.drawImage(canvas,x,y,w,h,0,0,w,h);
          const dataUrl = cropped.toDataURL('image/jpeg', 0.9);
          const sourceId = [...anchors].reverse().find(a => a.y <= box.y + 3)?.sourceId || lastQuestionId;
          imagesOnPage.push(dataUrl);
          imagePlacements.push({dataUrl,sourceId,pageNum});
        }
      }
    } catch {
      // A text-only import remains available if rendering fails.
    }
    if (anchors.length) lastQuestionId = anchors.at(-1)!.sourceId;

    pages.push({
      pageNum,
      text: pageText,
      images: imagesOnPage,
      imagePlacements,
      answerExcerpts,
    });

    fullText += `\n--- TRANG ${pageNum} ---\n` + pageText;
  }

  return {
    numPages: doc.numPages,
    fullText,
    pages,
  };
}
