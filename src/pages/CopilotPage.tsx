import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Send, Bot, ArrowRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { formatFullINR } from '../lib/utils';
import type { CopilotMessage } from '../types';

export const CopilotPage: React.FC = () => {
  const navigate = useNavigate();
  const { askCopilot, invoices, suppliers } = useApp();
  const { user } = useAuth();

  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content: `Hello ${user?.name || 'there'}! I am your AI Finance Copilot. I analyze your company's live invoices, PO matches, bank detail changes, and upcoming payables. What would you like to investigate today?`,
      timestamp: '10:00 AM'
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const suggestedQuestions = [
    'What needs my attention today?',
    'Which invoices are overdue?',
    'Show priority attention invoices',
    'Which suppliers changed their bank details?',
    'Show total payables',
    'Which invoices are duplicates?',
    'How many invoices were auto-cleared?',
    'How much time was saved?',
  ];

  const handleSend = (queryText?: string) => {
    const textToSend = queryText || input;
    if (!textToSend.trim()) return;

    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const response = askCopilot(textToSend);
      
      const assistantMsg: CopilotMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      if (response.relatedInvoices && response.relatedInvoices.length > 0) {
        const first = response.relatedInvoices[0];
        assistantMsg.structuredData = {
          type: 'recommendation',
          title: 'Related Financial Record:',
          highlightItem: {
            title: `${first.supplierName} (${first.invoiceNumber})`,
            amount: formatFullINR(first.amount),
            reasons: [first.aiStatus, first.aiRecommendation],
            actionLabel: 'Inspect Invoice Details',
            actionUrl: `/app/invoices/${first.id}`,
          }
        };
      }

      setMessages((prev) => [...prev, assistantMsg]);
      setIsTyping(false);
    }, 400);
  };

  return (
    <div className="h-[calc(100vh-8.5rem)] flex flex-col md:flex-row gap-6">
      {/* Left Chat Window */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Chat Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-purple-50/50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                ✦ Finance Copilot
              </h2>
              <p className="text-[11px] text-slate-500">
                Connected to live company dataset ({invoices.length} invoices indexed).
              </p>
            </div>
          </div>
          <Badge variant="purple" size="sm">AI Engine Live</Badge>
        </div>

        {/* Message Stream */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 text-xs leading-relaxed ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-700 border border-brand-200/70 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-xl p-3.5 rounded-xl space-y-2.5 ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50 border border-slate-200/80 text-slate-800'
                }`}
              >
                <p>{msg.content}</p>

                {/* Structured Action Cards */}
                {msg.structuredData && (
                  <div className="p-3 bg-white border border-slate-200 rounded-lg text-slate-900 space-y-2 mt-2 shadow-xs">
                    {msg.structuredData.title && (
                      <div className="font-bold text-xs text-brand-800">
                        {msg.structuredData.title}
                      </div>
                    )}

                    {msg.structuredData.highlightItem && (
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between font-semibold">
                          <span>{msg.structuredData.highlightItem.title}</span>
                          <span className="font-bold text-rose-600">
                            {msg.structuredData.highlightItem.amount}
                          </span>
                        </div>

                        {msg.structuredData.highlightItem.reasons && (
                          <ul className="list-disc pl-4 text-slate-500 text-[11px] space-y-0.5">
                            {msg.structuredData.highlightItem.reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        )}

                        {msg.structuredData.highlightItem.actionUrl && (
                          <div className="pt-1">
                            <Button
                              onClick={() => navigate(msg.structuredData!.highlightItem!.actionUrl!)}
                              variant="brand"
                              size="sm"
                              className="w-full text-xs cursor-pointer"
                            >
                              <span>{msg.structuredData.highlightItem.actionLabel || 'View Record'}</span>
                              <ArrowRight className="w-3.5 h-3.5 ml-1" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="text-[10px] text-slate-400 text-right">
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
            <div className="flex items-center gap-2 text-xs text-brand-600 pl-10">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>Analyzing live company records...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-100 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask anything about invoices, POs, vendors, or overdue bills..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
            />
            <Button type="submit" variant="brand" size="sm" disabled={!input.trim()} className="cursor-pointer">
              <Send className="w-3.5 h-3.5" />
            </Button>
          </form>
        </div>
      </div>

      {/* Right Sidebar: Context & Quick Prompts */}
      <div className="w-full md:w-80 space-y-4">
        <Card className="p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-brand-600" /> Suggested Prompts
          </h3>
          <div className="space-y-1.5">
            {suggestedQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(q)}
                className="w-full text-left p-2 rounded-lg text-xs bg-slate-50 hover:bg-brand-50 hover:text-brand-700 text-slate-700 border border-slate-100 transition-colors cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-4 space-y-2 bg-gradient-to-br from-slate-900 to-slate-800 text-white text-xs">
          <h4 className="font-bold text-white flex items-center gap-1.5">
            ✦ AI Operations Context
          </h4>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            InvoiceFlow Copilot has indexed {invoices.length} vendor invoices and {suppliers.length} registered suppliers for {user?.companyName || 'your organization'}.
          </p>
        </Card>
      </div>
    </div>
  );
};
