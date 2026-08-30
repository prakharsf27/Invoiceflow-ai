import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Send, Bot, ArrowRight, AlertTriangle, MessageSquare, HelpCircle } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { copilotService } from '../services/copilotService';
import type { CopilotMessage } from '../types';

export const CopilotPage: React.FC = () => {
  const navigate = useNavigate();
  const { invoices, suppliers, showToast } = useApp();
  const { user } = useAuth();

  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content: `Hello ${user?.name || 'there'}! I am your AI Finance Copilot. I analyze ${user?.companyName || 'your company'}'s live invoices, PO matches, bank detail changes, and upcoming payables. What would you like to investigate today?`,
      timestamp: '10:00 AM',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const suggestedQuestions = [
    'What needs my attention today?',
    'Which invoices are overdue?',
    'Show priority attention invoices',
    'Which suppliers changed their bank details?',
    'Show total payables summary',
    'Which invoices are PO matched vs mismatched?',
    'How many invoices were auto-cleared?',
    'Are there any high risk vendors?',
  ];

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || isTyping) return;

    setErrorMsg(null);
    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await copilotService.askCopilot(textToSend);

      const assistantMsg: CopilotMessage = {
        id: response.id || `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.content,
        timestamp: response.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        structuredData: response.structuredData as any,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Copilot query error:', err);
      const msg = err?.message || 'Failed to query Copilot. Please try again.';
      setErrorMsg(msg);
      showToast(msg, 'error');

      const fallbackMsg: CopilotMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error analyzing your company records: ${msg}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="h-[calc(100vh-8.5rem)] flex flex-col md:flex-row gap-5">
      {/* Left Chat Window */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Chat Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                AI Finance Copilot
              </h2>
              <p className="text-[11px] text-slate-500">
                Connected to {user?.companyName || 'your organization'} dataset ({invoices.length} invoices, {suppliers.length} vendors).
              </p>
            </div>
          </div>
          <Badge variant="purple" size="sm">Gemini 2.5 Flash</Badge>
        </div>

        {/* Message Stream */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 text-xs leading-relaxed ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-slate-700" />
                </div>
              )}

              <div
                className={`max-w-xl p-3.5 rounded-xl space-y-2.5 ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50 border border-slate-200 text-slate-800'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {/* Structured Action Cards */}
                {msg.structuredData && (
                  <div className="p-3 bg-white border border-slate-200 rounded-lg text-slate-900 space-y-2 mt-2 shadow-xs">
                    {msg.structuredData.title && (
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                        <span>{msg.structuredData.title}</span>
                      </div>
                    )}

                    {msg.structuredData.highlightItem && (
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between font-semibold">
                          <span>{msg.structuredData.highlightItem.title}</span>
                          {msg.structuredData.highlightItem.amount && (
                            <span className="font-bold text-rose-600">
                              {msg.structuredData.highlightItem.amount}
                            </span>
                          )}
                        </div>

                        {msg.structuredData.highlightItem.risk && (
                          <div className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded w-max">
                            {msg.structuredData.highlightItem.risk}
                          </div>
                        )}

                        {msg.structuredData.highlightItem.reasons && (
                          <ul className="list-disc pl-4 text-slate-500 text-[11px] space-y-0.5">
                            {msg.structuredData.highlightItem.reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        )}

                        {msg.structuredData.highlightItem.actionUrl && (
                          <div className="pt-1.5">
                            <Button
                              onClick={() => navigate(msg.structuredData!.highlightItem!.actionUrl!)}
                              variant="primary"
                              size="sm"
                              className="w-full text-xs cursor-pointer gap-1"
                            >
                              <span>{msg.structuredData.highlightItem.actionLabel || 'View Record'}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className={`text-[10px] text-right ${msg.role === 'user' ? 'text-slate-400' : 'text-slate-400'}`}>
                  {msg.timestamp}
                </div>
              </div>

              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 text-xs font-bold">
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center gap-2 text-xs text-slate-500 pl-10">
              <Sparkles className="w-3.5 h-3.5 animate-spin text-brand-600" />
              <span>Analyzing organization dataset...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-200 bg-white space-y-2">
          {errorMsg && (
            <div className="text-[11px] text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask Copilot about invoices, suppliers, PO mismatches, or upcoming payables..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isTyping}
              className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 focus:bg-white transition-all disabled:opacity-50"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!input.trim() || isTyping}
              className="gap-1 px-3 cursor-pointer shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ask</span>
            </Button>
          </form>
        </div>
      </div>

      {/* Right Suggested Questions Sidebar */}
      <div className="w-full md:w-72 flex flex-col gap-3">
        <Card className="p-4 space-y-3 border-slate-200/90 bg-white">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
            <HelpCircle className="w-4 h-4 text-brand-600" />
            <span>Suggested Inquiries</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Click any query to analyze your company's live records:
          </p>

          <div className="flex flex-col gap-1.5">
            {suggestedQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(q)}
                disabled={isTyping}
                className="text-left text-xs p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/70 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </Card>

        {/* AI Capabilities Notice */}
        <Card className="p-4 space-y-2 bg-slate-50 border-slate-200/80 text-xs text-slate-600">
          <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-slate-700" />
            <span>Company Data Isolation</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Copilot only accesses MongoDB records for your organization (<span className="font-mono text-slate-700 font-semibold">{user?.companyName}</span>).
          </p>
        </Card>
      </div>
    </div>
  );
};
