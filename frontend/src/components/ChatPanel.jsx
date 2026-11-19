import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { LABEL_STYLES, percent } from "../labels";
import Icon from "./Icon";

const SUGGESTIONS = ["summary", "show spam", "any phishing?", "why is #1 spam?", "fetch my emails"];

function scrollToEmail(id) {
  document.getElementById(`email-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function ChatPanel({ onRefresh, onPreferencesChanged }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([
    { from: "bot", text: 'Hi! Ask me about your unread emails - try "summary" or "show spam". Type "help" for more.' },
  ]);
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send(text) {
    const message = text.trim();
    if (!message || sending) return;
    setInput("");
    setMessages((current) => [...current, { from: "user", text: message }]);
    setSending(true);
    try {
      const result = await api("/api/chat", { method: "POST", body: { message } });
      setMessages((current) => [...current, { from: "bot", text: result.reply, items: result.items }]);
      if (result.action === "refresh") {
        const summary = await onRefresh();
        if (summary) setMessages((current) => [...current, { from: "bot", text: summary }]);
      } else if (result.action === "preferences") {
        await onPreferencesChanged();
      }
    } catch (error) {
      setMessages((current) => [...current, { from: "bot", text: error.message, error: true }]);
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 font-medium text-white shadow-lg hover:bg-blue-700"
      >
        <Icon name="chat" className="h-5 w-5" />
        Ask SafeInbox
      </button>
    );
  }

  return (
    <section
      className="fixed inset-x-2 bottom-2 z-40 flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:h-[520px] sm:w-[380px]"
      aria-label="SafeInbox assistant"
    >
      <header className="flex items-center justify-between bg-blue-600 px-4 py-3 text-white">
        <span className="flex items-center gap-2 font-semibold">
          <Icon name="chat" className="h-5 w-5" /> SafeInbox assistant
        </span>
        <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-blue-700" aria-label="Close chat">
          <Icon name="close" className="h-5 w-5" />
        </button>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.from === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${
                message.from === "user"
                  ? "rounded-br-sm bg-blue-600 text-white"
                  : message.error
                  ? "rounded-bl-sm bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                  : "rounded-bl-sm bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
              }`}
            >
              {message.text}
              {message.items?.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {message.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => scrollToEmail(item.id)}
                        className="w-full rounded-lg bg-white px-2 py-1.5 text-left hover:ring-2 hover:ring-blue-400 dark:bg-slate-800"
                      >
                        <span className="block truncate font-medium text-slate-900 dark:text-white">
                          #{item.index} {item.title}
                        </span>
                        <span className="flex justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="truncate">{item.subtitle}</span>
                          <span style={{ color: LABEL_STYLES[item.label]?.color }}>
                            {LABEL_STYLES[item.label]?.short} {percent(item.score)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {sending && <div className="text-xs text-slate-400">SafeInbox is thinking…</div>}
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-t border-slate-200 px-3 py-2 dark:border-slate-700">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => send(suggestion)}
            className="whitespace-nowrap rounded-full border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            {suggestion}
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask a question…"
          maxLength={500}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
          aria-label="Question"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-lg bg-blue-600 px-3 text-white hover:bg-blue-700 disabled:opacity-50"
          aria-label="Send"
        >
          <Icon name="send" />
        </button>
      </form>
    </section>
  );
}
