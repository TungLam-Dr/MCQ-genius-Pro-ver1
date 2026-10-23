import React, { useState, useEffect, useRef } from 'react';
import { Question, DebateChatMessage, DebateMode } from '../types/quiz';
import { askGeminiDebate } from '../services/gemini';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  User,
  Bot,
  HelpCircle,
  Lightbulb,
  Split,
  BookOpen,
  Shuffle,
  GraduationCap,
} from 'lucide-react';

interface GeminiDebateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  question: Question;
  userSelectedOption: number | null;
}

export const GeminiDebateDrawer: React.FC<GeminiDebateDrawerProps> = ({
  isOpen,
  onClose,
  question,
  userSelectedOption,
}) => {
  const [messages, setMessages] = useState<DebateChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfusionModal, setShowConfusionModal] = useState(false);
  const [selectedConfusionOpts, setSelectedConfusionOpts] = useState<number[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Initial trigger when drawer opens
  useEffect(() => {
    if (isOpen && question) {
      setMessages([]);
      setSelectedConfusionOpts([]);
      setShowConfusionModal(false);
      fetchInitialDebate();
    }
  }, [isOpen, question?.id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!isOpen || !question) return null;

  const isCorrect = userSelectedOption === question.correctAnswer;
  const userOptionText =
    userSelectedOption !== null && userSelectedOption !== undefined
      ? question.options[userSelectedOption]
      : 'Bỏ trống (Chưa chọn)';

  const fetchInitialDebate = async () => {
    setIsLoading(true);
    try {
      const responseText = await askGeminiDebate({
        question: question.question,
        options: question.options,
        correctAnswer: question.correctAnswer,
        userSelectedOption,
        explanation: question.explanation,
        chatHistory: [],
        mode: 'initial',
      });

      setMessages([
        {
          id: `msg-${Date.now()}`,
          sender: 'ai',
          text: responseText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      setMessages([
        {
          id: `msg-err`,
          sender: 'ai',
          text: `Rất tiếc, Gemini Study Buddy tạm thời chưa thể kết nối (${err?.message || 'Lỗi mạng'}). Vui lòng kiểm tra và thử lại!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to trigger specific interactive debate modes
  const handleTriggerDebateMode = async (
    mode: DebateMode,
    userDisplayText: string,
    confusedOptsText: string[] = []
  ) => {
    if (isLoading) return;

    const newMsgHistory: DebateChatMessage[] = [
      ...messages,
      {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: userDisplayText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];

    setMessages(newMsgHistory);
    setIsLoading(true);

    try {
      const aiReply = await askGeminiDebate({
        question: question.question,
        options: question.options,
        correctAnswer: question.correctAnswer,
        userSelectedOption,
        explanation: question.explanation,
        chatHistory: newMsgHistory.map((m) => ({ sender: m.sender, text: m.text })),
        mode,
        confusedOptions: confusedOptsText,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: aiReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: 'Có lỗi kết nối khi xử lý chế độ tranh luận này. Bạn hãy thử lại nhé!',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userText = inputMessage.trim();
    setInputMessage('');

    const newMsgHistory: DebateChatMessage[] = [
      ...messages,
      {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: userText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];

    setMessages(newMsgHistory);
    setIsLoading(true);

    try {
      const aiReply = await askGeminiDebate({
        question: question.question,
        options: question.options,
        correctAnswer: question.correctAnswer,
        userSelectedOption,
        explanation: question.explanation,
        chatHistory: newMsgHistory.map((m) => ({ sender: m.sender, text: m.text })),
        userMessage: userText,
        mode: 'chat',
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: aiReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: 'Có lỗi kết nối. Bạn hãy gửi lại tin nhắn nhé.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const submitConfusionSelection = () => {
    if (selectedConfusionOpts.length !== 2) return;
    const optLabels = selectedConfusionOpts.map(
      (idx) => `${String.fromCharCode(65 + idx)} (${question.options[idx]})`
    );

    setShowConfusionModal(false);
    handleTriggerDebateMode(
      'confused_between',
      `Tôi đang rất phân vân giữa 2 phương án: ${optLabels.join(' và ')}`,
      optLabels
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex justify-end">
      <div className="bg-slate-900 text-white w-full max-w-2xl h-full flex flex-col shadow-2xl border-l border-slate-800 animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 p-0.5 shadow-lg shadow-purple-600/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-purple-200 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-sm text-white">Bạn Học Gemini - Tranh Luận Tương Tác</h3>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-semibold">
                  Multi-turn AI Buddy
                </span>
              </div>
              <p className="text-xs text-slate-400">Trao đổi hai chiều, tháo gỡ bẫy &amp; thử thách tình huống mới</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Question Snapshot Banner */}
        <div className="p-3.5 bg-slate-950/60 border-b border-slate-800 text-xs space-y-1.5 shrink-0">
          <p className="font-bold text-indigo-300 line-clamp-2">
            Đề bài: "{question.question}"
          </p>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">
              Bạn chọn:{' '}
              <strong className={isCorrect ? 'text-emerald-400' : 'text-red-400'}>
                {userOptionText}
              </strong>
            </span>
            <span className="text-slate-500 font-mono">
              {question.options.length} Lựa chọn
            </span>
          </div>
        </div>

        {/* Action Panel - 6 Interactive Debate Operations */}
        <div className="p-3 bg-slate-950/90 border-b border-slate-800 shrink-0 space-y-1.5">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Thao Tác Tranh Luận Nhanh:</span>
            <span className="text-[10px] text-purple-400 font-normal">Hỏi từng bước &amp; thử thách tư duy</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
            {/* 1. Để tôi giải thích trước */}
            <button
              onClick={() =>
                handleTriggerDebateMode(
                  'explain_first',
                  'Để tôi tự giải thích lập luận lựa chọn của mình trước nhé!'
                )
              }
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-indigo-900/40 hover:border-indigo-500 border border-slate-700/80 text-left transition-all flex items-center space-x-2 text-slate-200"
            >
              <HelpCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="font-medium truncate">Để tôi giải thích trước</span>
            </button>

            {/* 2. Gợi ý, chưa tiết lộ */}
            <button
              onClick={() =>
                handleTriggerDebateMode(
                  'hint_step',
                  'Gợi ý cho mình từng bước nhé (chưa tiết lộ đáp án ngay).'
                )
              }
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-amber-900/40 hover:border-amber-500 border border-slate-700/80 text-left transition-all flex items-center space-x-2 text-slate-200"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-medium truncate">Gợi ý, chưa lộ đáp án</span>
            </button>

            {/* 3. Phân vân 2 đáp án */}
            <button
              onClick={() => {
                setSelectedConfusionOpts([]);
                setShowConfusionModal(true);
              }}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-purple-900/40 hover:border-purple-500 border border-slate-700/80 text-left transition-all flex items-center space-x-2 text-slate-200"
            >
              <Split className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="font-medium truncate">Phân vân 2 đáp án</span>
            </button>

            {/* 4. Giải thích đầy đủ */}
            <button
              onClick={() =>
                handleTriggerDebateMode(
                  'full_explanation',
                  'Cho mình xem giải thích đầy đủ kèm lý do loại các phương án khác.'
                )
              }
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-emerald-900/40 hover:border-emerald-500 border border-slate-700/80 text-left transition-all flex items-center space-x-2 text-slate-200"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-medium truncate">Giải thích đầy đủ</span>
            </button>

            {/* 5. Thay đổi tình huống */}
            <button
              onClick={() =>
                handleTriggerDebateMode(
                  'change_scenario',
                  'Hãy tự đổi tình huống đề bài (What-if) để thử thách thêm cho mình!'
                )
              }
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-cyan-900/40 hover:border-cyan-500 border border-slate-700/80 text-left transition-all flex items-center space-x-2 text-slate-200"
            >
              <Shuffle className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="font-medium truncate">Thay đổi tình huống</span>
            </button>

            {/* 6. Để tôi giảng lại */}
            <button
              onClick={() =>
                handleTriggerDebateMode(
                  'teach_back',
                  'Để mình thử đóng vai người thầy giảng lại câu này xem đúng chưa.'
                )
              }
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-pink-900/40 hover:border-pink-500 border border-slate-700/80 text-left transition-all flex items-center space-x-2 text-slate-200"
            >
              <GraduationCap className="w-3.5 h-3.5 text-pink-400 shrink-0" />
              <span className="font-medium truncate">Để tôi giảng lại</span>
            </button>
          </div>
        </div>

        {/* Modal Selection for Confused Between 2 Options */}
        {showConfusionModal && (
          <div className="p-3 bg-purple-950/80 border-b border-purple-800 text-xs space-y-2 shrink-0 animate-in fade-in duration-200">
            <div className="flex items-center justify-between font-bold text-purple-200">
              <span>Chọn 2 phương án bạn đang phân vân:</span>
              <button
                onClick={() => setShowConfusionModal(false)}
                className="text-purple-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {question.options.map((opt, idx) => {
                const isSelected = selectedConfusionOpts.includes(idx);
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedConfusionOpts(selectedConfusionOpts.filter((i) => i !== idx));
                      } else {
                        if (selectedConfusionOpts.length < 2) {
                          setSelectedConfusionOpts([...selectedConfusionOpts, idx]);
                        }
                      }
                    }}
                    className={`p-2 rounded-lg text-left text-[11px] border flex items-center space-x-2 ${
                      isSelected
                        ? 'bg-purple-600 border-purple-400 text-white font-bold'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="font-bold shrink-0">{String.fromCharCode(65 + idx)}.</span>
                    <span className="truncate">{opt}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={submitConfusionSelection}
                disabled={selectedConfusionOpts.length !== 2}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-[11px] rounded-lg transition-all"
              >
                Gửi Phân Vân (2 Lựa Chọn)
              </button>
            </div>
          </div>
        )}

        {/* Chat Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start space-x-3 ${msg.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white'
                }`}
              >
                {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed space-y-2 shadow-lg ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : 'bg-slate-800/90 text-slate-200 border border-slate-700/80 rounded-tl-none whitespace-pre-wrap'
                }`}
              >
                <div>{msg.text}</div>
                {msg.id === 'msg-err' && (
                  <button
                    onClick={fetchInitialDebate}
                    className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] transition-all shadow-md"
                  >
                    <span>Thử lại kết nối</span>
                  </button>
                )}
                <div className="text-[10px] text-slate-400 text-right opacity-70">{msg.timestamp}</div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center space-x-3 text-slate-400 text-xs py-2">
              <div className="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <span className="animate-pulse">Gemini Study Buddy đang suy nghĩ câu hỏi tương tác tiếp theo...</span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Input Form */}
        <form onSubmit={handleSendMessage} className="p-4 bg-slate-950 border-t border-slate-800 flex items-center space-x-2 shrink-0">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Trả lời Gemini hoặc hỏi tiếp (VD: Mình chọn vì từ khóa trong đề...)"
            className="flex-1 px-4 py-2.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-500"
          />
          <button
            type="submit"
            disabled={isLoading || !inputMessage.trim()}
            className="p-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl disabled:opacity-40 transition-all shadow-md shadow-purple-600/30"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
