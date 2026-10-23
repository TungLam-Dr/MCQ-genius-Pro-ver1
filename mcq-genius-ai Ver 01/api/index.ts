import 'dotenv/config';
import dns from 'node:dns';
import express, { Request, Response, NextFunction } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

// Ensure IPv4 first to avoid IPv6 hanging on cloud serverless / container environments
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore in environments where setDefaultResultOrder is not supported
}

const app = express();

// Middleware: Enable JSON payload up to 50MB for exam documents & base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware: Permissive CORS for Vercel preview environments and custom domains
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Helper: Get initialized Gemini client or throw descriptive error
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Chưa cấu hình biến môi trường GEMINI_API_KEY trên Vercel. Vui lòng vào Vercel Dashboard -> Project Settings -> Environment Variables, thêm "GEMINI_API_KEY" với API key của bạn và Redeploy lại.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Resilient Gemini Invocation with automatic fallback across reliable models
async function callGemini(options: { contents: any; config?: any }) {
  const ai = getGeminiClient();
  const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'];
  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      return await ai.models.generateContent({
        model,
        contents: options.contents,
        config: options.config,
      });
    } catch (err: any) {
      lastError = err;
      console.warn(`Model ${model} failed, trying next candidate:`, err?.message || err);
    }
  }

  throw lastError;
}

// Helper: Split text into smart chunks around question boundaries
function chunkDocumentText(text: string, maxChunkLength = 12000): string[] {
  if (text.length <= maxChunkLength) return [text];

  const questionHeaderRegex = /(?:^|\n)(?=Câu\s*\d+|Question\s*\d+|BLOCK\s*\d+)/gi;
  const blocks = text.split(questionHeaderRegex);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const block of blocks) {
    if ((currentChunk + '\n' + block).length > maxChunkLength && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = block;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + block;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// Router for Gemini endpoints
const geminiRouter = express.Router();

// 1. API: Parse uploaded file content with Chunked Batch Processing for 100% coverage
geminiRouter.post('/parse-file', async (req: Request, res: Response) => {
  try {
    const { rawContent, fileName, preParsedQuestions = [] } = req.body;

    if (!rawContent || typeof rawContent !== 'string') {
      return res.status(400).json({ error: 'Nội dung file không hợp lệ hoặc rỗng.' });
    }

    // If pre-parsed questions already captured >= 5 questions, perform batch enrichment or return directly
    if (Array.isArray(preParsedQuestions) && preParsedQuestions.length >= 5) {
      return res.json({
        success: true,
        data: {
          suggestedCategoryName: `Mục ${fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Tài Liệu'}`,
          questions: preParsedQuestions,
        },
      });
    }

    // Otherwise, chunk rawContent into batches of ~12,000 chars to avoid Gemini output token truncation
    const chunks = chunkDocumentText(rawContent, 12000);
    const allExtractedQuestions: any[] = [];
    let overallSuggestedCategory = `Mục ${fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Tài Liệu'}`;

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const prompt = `Bạn là chuyên gia khảo thí y khoa và trắc nghiệm (MCQ). 
Trích xuất TOÀN BỘ các câu hỏi trắc nghiệm (không bỏ sót bất kỳ câu nào) từ đoạn văn bản (Phần ${i + 1}/${chunks.length}) dưới đây:

--- VĂN BẢN TRÍCH XUẤT ---
${chunkText}
------------------------

Yêu cầu:
1. Phân tích từng câu hỏi, giữ nguyên nội dung case lâm sàng / đề bài.
2. Trích xuất tất cả các đáp án lựa chọn (A, B, C, D, E, F, G,...).
3. Xác định đáp án đúng chính xác nhất (0 cho A, 1 cho B, 2 cho C, 3 cho D,...).
4. Viết lời giải thích ngắn gọn lý do tại sao chọn đáp án đó.`;

      const response = await callGemini({
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedCategoryName: { type: Type.STRING },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    correctAnswer: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                    difficulty: { type: Type.STRING },
                  },
                  required: ['question', 'options', 'correctAnswer'],
                },
              },
            },
            required: ['questions'],
          },
        },
      });

      const parsedJson = JSON.parse(response.text || '{}');
      if (parsedJson.suggestedCategoryName && i === 0) {
        overallSuggestedCategory = parsedJson.suggestedCategoryName;
      }
      if (Array.isArray(parsedJson.questions)) {
        allExtractedQuestions.push(...parsedJson.questions);
      }
    }

    return res.json({
      success: true,
      data: {
        suggestedCategoryName: overallSuggestedCategory,
        questions: allExtractedQuestions,
      },
    });
  } catch (err: any) {
    console.error('Lỗi khi phân tích file bằng Gemini:', err);
    return res.status(500).json({
      error: err?.message || 'Không thể phân tích file bằng AI.',
    });
  }
});

// 2. API: Categorize questions into structured "Mục"
geminiRouter.post('/categorize', async (req: Request, res: Response) => {
  try {
    const { questions } = req.body;

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Danh sách câu hỏi rỗng.' });
    }

    // Process in batches of 30 if > 30 questions to avoid huge prompt payloads
    const batchSize = 30;
    const allCategories: any[] = [];

    for (let i = 0; i < questions.length; i += batchSize) {
      const batch = questions.slice(i, i + batchSize);
      const prompt = `Phân loại danh sách ${batch.length} câu hỏi trắc nghiệm sau thành các mục (categories) rõ ràng, khoa học:
${JSON.stringify(
  batch.map((q: any, idx: number) => ({ idIndex: i + idx, question: q.question, category: q.categoryName })),
  null,
  2
)}

Nhóm các câu hỏi thành các Mục (3-6 mục). Trả về JSON với "categories":
- name: Tên mục
- description: Mô tả
- icon: Calculator | Languages | Atom | Landmark | Code | BookOpen | Sparkles | Activity
- questionIndices: Mảng các chỉ số câu hỏi thuộc về mục này (theo idIndex).`;

      const response = await callGemini({
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              categories: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    icon: { type: Type.STRING },
                    questionIndices: {
                      type: Type.ARRAY,
                      items: { type: Type.INTEGER },
                    },
                  },
                  required: ['name', 'description', 'questionIndices'],
                },
              },
            },
            required: ['categories'],
          },
        },
      });

      const result = JSON.parse(response.text || '{}');
      if (Array.isArray(result.categories)) {
        allCategories.push(...result.categories);
      }
    }

    return res.json({ success: true, data: { categories: allCategories } });
  } catch (err: any) {
    console.error('Lỗi phân loại mục:', err);
    return res.status(500).json({ error: err?.message || 'Không thể phân loại mục.' });
  }
});

// 3. API: Generate new MCQ questions
geminiRouter.post('/generate-questions', async (req: Request, res: Response) => {
  try {
    const { topic, count = 5, difficulty = 'medium' } = req.body;

    const prompt = `Tạo ${count} câu hỏi trắc nghiệm MCQ chất lượng cao về chủ đề "${topic || 'Tổng hợp kiến thức'}" ở độ khó "${difficulty}".
Mỗi câu hỏi có 4 lựa chọn (A, B, C, D) với duy nhất 1 đáp án đúng và lời giải chi tiết.`;

    const response = await callGemini({
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            categoryName: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  correctAnswer: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                  difficulty: { type: Type.STRING },
                },
                required: ['question', 'options', 'correctAnswer', 'explanation'],
              },
            },
          },
          required: ['categoryName', 'questions'],
        },
      },
    });

    const result = JSON.parse(response.text || '{}');
    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('Lỗi tạo câu hỏi AI:', err);
    return res.status(500).json({ error: err?.message || 'Không thể tạo câu hỏi từ AI.' });
  }
});

// 4. API: AI Study Buddy Debate & Interactive Learning ("Bạn học Gemini")
geminiRouter.post('/debate', async (req: Request, res: Response) => {
  try {
    const {
      question,
      options,
      correctAnswer,
      userSelectedOption,
      explanation,
      chatHistory = [],
      userMessage,
      mode = 'initial',
      confusedOptions = [],
    } = req.body;

    const correctOptText = options[correctAnswer] ?? `Lựa chọn ${correctAnswer + 1}`;
    const userOptText =
      userSelectedOption !== null && userSelectedOption !== undefined
        ? options[userSelectedOption] ?? `Lựa chọn ${userSelectedOption + 1}`
        : 'Chưa chọn (bỏ trống)';
    const isCorrect = userSelectedOption === correctAnswer;

    let modeInstruction = '';

    switch (mode) {
      case 'explain_first':
        modeInstruction = `
CHẾ ĐỘ "ĐỂ TÔI GIẢI THÍCH TRƯỚC":
1. Bạn đóng vai Gemini Study Buddy. Hãy đặt 1 CÂU HỎI THÂN THIỆN, BẮT MẮT hỏi người học xem họ dựa vào dữ kiện, công thức hay từ khóa nào trong đề bài để chọn phương án "${userOptText}".
2. TUYỆT ĐỐI KHÔNG tiết lộ ngay đáp án đúng hay sai, KHÔNG giảng bài dài dòng.
3. Hãy dừng lại và CHỜ người học phản hồi lập luận của họ trước!`;
        break;

      case 'hint_step':
        modeInstruction = `
CHẾ ĐỘ "GỢI Ý, CHƯA TIẾT LỘ ĐÁP ÁN":
1. Cung cấp gợi ý theo nấc tư duy (ví dụ: Nấc 1 - Khái niệm/quy luật cốt lõi cần nhớ, hoặc Nấc 2 - Dữ kiện mấu chốt trong đề cần chú ý).
2. TUYỆT ĐỐI KHÔNG nói ra đáp án đúng (là ${correctOptText}) và KHÔNG loại trừ hết các phương án còn lại.
3. Kết thúc bằng 1 câu hỏi gợi mở ngắn gọn thúc đẩy người học tự suy luận tiếp. CHỜ người học trả lời!`;
        break;

      case 'confused_between':
        modeInstruction = `
CHẾ ĐỘ "TÔI PHÂN VÂN GIỮA 2 ĐÁP ÁN":
1. Người học đang phân vân giữa các phương án: ${confusedOptions.length > 0 ? confusedOptions.join(' và ') : 'hai phương án trong đề'}.
2. Hãy xác định điểm khác biệt bản chất hoặc bẫy cốt lõi giữa hai phương án này.
3. Đặt 1 CÂU HỎI TRỌNG TÂM xoáy vào dữ kiện trong đề bài giúp người học tự phân biệt và đưa ra lựa chọn cuối cùng. CHỜ người học trả lời trước khi chốt đáp án!`;
        break;

      case 'full_explanation':
        modeInstruction = `
CHẾ ĐỘ "GIẢI THÍCH ĐẦY ĐỦ":
1. Nêu rõ đáp án chính xác: ${String.fromCharCode(65 + correctAnswer)}. ${correctOptText}.
2. Trình bày lập luận logic ngắn gọn, từng bước rõ ràng.
3. Phân tích tại sao từng phương án còn lại chưa đúng (hoặc bẫy yếu tố nào).
4. Đưa ra nguồn đối chiếu/kiến thức chuẩn (hoặc mẹo nhớ nhanh).`;
        break;

      case 'change_scenario':
        modeInstruction = `
CHẾ ĐỘ "THAY ĐỔI TÌNH HUỐNG (WHAT-IF)":
1. Hãy tự sáng tạo một biến thể tình huống mới dựa trên câu hỏi gốc (ví dụ: thay đổi thông số, đảo ngược điều kiện, đổi triệu chứng/mốc thời gian).
2. Làm nổi bật dữ kiện đã thay đổi bằng chữ IN HOA hoặc định dạng nổi bật.
3. Đặt câu hỏi thử thách: "Với tình huống mới này, bạn sẽ chọn đáp án nào?" và CHỜ người học suy nghĩ trả lời!`;
        break;

      case 'teach_back':
        modeInstruction = `
CHẾ ĐỘ "ĐỂ TÔI GIẢNG LẠI":
1. Đóng vai người bạn lắng nghe, mời người học giải thích lại khái niệm hoặc quy trình trong câu hỏi này bằng chính từ ngữ của họ.
2. Đặt 1 câu hỏi khích lệ ngắn gọn (VD: "Hãy thử đóng vai người thầy giải thích ngắn gọn nguyên lý câu này cho mình nghe nhé!").
3. CHỜ người học giảng lại, sau đó bạn sẽ nhận xét nhẹ nhàng về điểm chính xác, phần còn thiếu hoặc mâu thuẫn.`;
        break;

      default:
        // 'initial' or 'chat'
        modeInstruction = `
CHẾ ĐỘ TRANH LUẬN TỰ DO:
1. Nhận xét ngắn gọn về phương án người học chọn (${userOptText} - ${isCorrect ? 'Đã chính xác!' : 'Chưa chính xác'}).
2. Nếu người học trả lời câu hỏi trước đó, hãy nhận xét tư duy của họ (đúng ở đâu, chưa chuẩn ở đâu).
3. Đặt 1 câu hỏi đúng trọng tâm để dẫn dắt người học đào sâu kiến thức và CHỜ người học phản hồi. Tránh viết một bài văn quá dài!`;
        break;
    }

    const systemInstruction = `Bạn là "Gemini AI Study Buddy" - người bạn học cùng bàn thân thiện, thông thái, hóm hỉnh và cực kỳ sâu sắc.
Mục tiêu hàng đầu của bạn là thúc đẩy người học TỰ TƯ DUY thông qua trao đổi nhiều lượt (multi-turn debate), KHÔNG tuồn một bài giảng quá dài khi chưa được yêu cầu.

${modeInstruction}

Quy tắc trình bày:
- Sử dụng xưng hô "mình" - "bạn" thân thiện như bạn bè ôn thi cùng nhau.
- Văn phong tự nhiên, súc tích, dễ nhớ, có emoji sinh động.
- Khi không ở chế độ "Giải thích đầy đủ", luôn kết thúc bằng một CÂU HỎI NGẮN TRỌNG TÂM và chờ người học trả lời.`;

    const contents: any[] = [];

    const contextPrompt = `Dưới đây là ngữ cảnh câu hỏi MCQ:
- Câu hỏi: "${question}"
- Các lựa chọn: ${options.map((o: string, idx: number) => `\n  ${String.fromCharCode(65 + idx)}. ${o}`).join('')}
- Đáp án đúng (bí mật nội bộ ngoại trừ khi giải thích đầy đủ): ${String.fromCharCode(65 + correctAnswer)}. ${correctOptText}
- Lựa chọn của người học: ${userSelectedOption !== null && userSelectedOption !== undefined ? `${String.fromCharCode(65 + userSelectedOption)}. ${userOptText}` : 'Bỏ trống'}
- Lời giải gốc tham khảo: "${explanation || 'Chưa có'}"
${userMessage ? `- Lời nhắn từ người học: "${userMessage}"` : ''}`;

    if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach((item: any) => {
        contents.push({
          role: item.sender === 'user' ? 'user' : 'model',
          parts: [{ text: item.text }],
        });
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: contextPrompt }],
    });

    const response = await callGemini({
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return res.json({
      success: true,
      text: response.text,
    });
  } catch (err: any) {
    console.error('Lỗi khi tranh luận cùng Gemini:', err);
    return res.status(500).json({ error: err?.message || 'Không thể kết nối với Gemini Study Buddy.' });
  }
});

// 5. Health Check: Verify Gemini connectivity
geminiRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const resAi = await callGemini({ contents: 'Trả lời OK nếu hệ thống Gemini hoạt động bình thường' });
    return res.json({ success: true, message: 'Gemini connected', response: resAi.text });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Gemini error' });
  }
});

// Register routes under both /api/gemini and /gemini so rewrites match reliably
app.use('/api/gemini', geminiRouter);
app.use('/gemini', geminiRouter);

// API health check endpoint for Vercel & diagnostics (excluding '/' so frontend SPA is served on root)
app.get(['/api', '/api/health', '/health'], (_req: Request, res: Response) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  res.json({
    status: 'ok',
    message: 'MCQ Genius API Serverless Function is running on Vercel',
    geminiApiKeyConfigured: hasKey,
    hint: hasKey ? undefined : 'Please configure GEMINI_API_KEY in Vercel Project Settings > Environment Variables',
  });
});

export default app;
