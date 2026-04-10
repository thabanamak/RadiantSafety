"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Bot, User, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface SafetyChatbotProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUGGESTIONS = [
  "Is it safe to walk through Fitzroy at night?",
  "What areas should I avoid in Melbourne?",
  "Safety tips for using late-night trams?",
  "How safe is St Kilda at night?",
];

export default function SafetyChatbot({ isOpen, onClose }: SafetyChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (!isOpen) return null;

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.content ?? data.error ?? "Something went wrong.",
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Connection error. Please check your network and try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="pointer-events-auto fixed bottom-6 right-24 z-50 flex h-[520px] w-96 flex-col rounded-2xl border border-radiant-border bg-radiant-surface/95 shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-radiant-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-radiant-red/15">
            <ShieldAlert className="h-4 w-4 text-radiant-red" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-100">Safety AI</p>
            <p className="text-[10px] text-radiant-green">Online</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-radiant-card hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <EmptyState onSuggestion={sendMessage} />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs">Thinking...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-radiant-border px-4 py-3"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about safety in Melbourne..."
          disabled={isLoading}
          className="flex-1 bg-transparent text-xs text-gray-200 placeholder-gray-600 outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all",
            input.trim() && !isLoading
              ? "bg-radiant-red text-white shadow-sm shadow-red-500/20 hover:shadow-red-500/40"
              : "bg-radiant-card text-gray-600"
          )}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-radiant-red/10">
        <Bot className="h-6 w-6 text-radiant-red" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-200">Safety AI Assistant</p>
        <p className="mt-1 text-xs text-gray-500">
          Ask me anything about safety in Melbourne
        </p>
      </div>
      <div className="mt-2 flex w-full flex-col gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="rounded-lg border border-radiant-border px-3 py-2 text-left text-[11px] text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-blue-500/20" : "bg-radiant-red/15"
        )}
      >
        {isUser ? (
          <User className="h-3 w-3 text-blue-400" />
        ) : (
          <Bot className="h-3 w-3 text-radiant-red" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed",
          isUser
            ? "bg-blue-500/10 text-gray-200"
            : "bg-radiant-card text-gray-300"
        )}
      >
        {message.content.split("\n").map((line, i) => (
          <p key={i} className={i > 0 ? "mt-1.5" : ""}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
