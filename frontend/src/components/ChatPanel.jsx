import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { LABEL_STYLES, percent } from "../labels";
import { btn, cx, input, muted } from "../ui";
import Icon from "./Icon";

const SUGGESTIONS = ["summary", "show spam", "any phishing?", "why is #1 spam?", "fetch my emails"];

function scrollToEmail(id) {
  document.getElementById(`email-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function ChatPanel({ onRefresh, onPreferencesChanged }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([
    { from: "bot", text: 'Hi! Ask me about your unread emails - try "summary" or "show spam". Type "help" for more.' },
  ]);
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send(value) {
    const message = value.trim();
    if (!message || sending) return;
    setText("");
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
      setMessages((current) => [...current, { from: "bot", text: error.message }]);
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask SafeInbox"
        className={cx(btn.primary, "fixed right-5 bottom-5 z-40 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 p-3.5 shadow-lg shadow-indigo-600/30 sm:px-5 sm:py-3")}
      >
        <Icon name="chat" className="h-5 w-5" />
        <span className="hidden sm:inline">Ask SafeInbox</span>
      </button>
    );
  }

  return (
    <section
      className="fixed inset-x-2 bottom-2 z-40 flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:h-[520px] sm:w-[380px]"
      aria-label="SafeInbox assistant"
    >
      <header className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
            <Icon name="chat" className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold">SafeInbox assistant</span>
            <span className="block text-xs text-indigo-100">Ask about your unread emails</span>
          </span>
        </span>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
          aria-label="Close chat"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.from === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={cx(
                "max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm leading-6",
                message.from === "user"
                  ? "rounded-br-md bg-indigo-600 text-white"
                  : "rounded-bl-md bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
              )}
            >
              {message.text}
              {message.items?.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {message.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => scrollToEmail(item.id)}
                        className="w-full rounded-lg bg-white px-2.5 py-1.5 text-left transition hover:ring-1 hover:ring-indigo-300 dark:bg-slate-900"
                      >
                        <span className="block truncate font-medium text-slate-900 dark:text-white">
                          #{item.index} {item.title}
                        </span>
                        <span className={cx("flex justify-between gap-2 text-xs", muted)}>
                          <span className="truncate">{item.subtitle}</span>
                          <span className="shrink-0">
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
        {sending && <p className={cx("text-xs", muted)}>Thinking…</p>}
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => send(suggestion)}
            className="whitespace-nowrap rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-indigo-300"
          >
            {suggestion}
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(text);
        }}
        className="flex gap-2 border-t border-slate-100 p-3 dark:border-slate-800"
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ask a question…"
          maxLength={500}
          className={input}
          aria-label="Question"
        />
        <button type="submit" disabled={sending || !text.trim()} className={cx(btn.primary, "px-3")} aria-label="Send">
          <Icon name="send" />
        </button>
      </form>
    </section>
  );
}
