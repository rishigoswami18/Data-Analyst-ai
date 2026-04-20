import { Bot, Sparkles, User2 } from 'lucide-react';

export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={['flex gap-4', isUser ? 'justify-end' : 'justify-start'].join(' ')}>
      {!isUser ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-400">
          <Bot className="h-5 w-5" />
        </div>
      ) : null}

      <div
        className={[
          'max-w-3xl rounded-[28px] border px-5 py-4 shadow-panel',
          isUser
            ? 'border-accent-500/20 bg-accent-500/15 text-white'
            : 'border-outline bg-slate-900/75 text-slate-100'
        ].join(' ')}
      >
        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted">
          {isUser ? <User2 className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span>{isUser ? 'You' : 'Assistant'}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
        {message.chartUrl ? (
          <div className="mt-5 overflow-hidden rounded-3xl border border-outline bg-slate-950/70">
            <img src={message.chartUrl} alt="Analysis chart" className="h-auto w-full object-cover" />
          </div>
        ) : null}
      </div>

      {isUser ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-300">
          <User2 className="h-5 w-5" />
        </div>
      ) : null}
    </div>
  );
}
