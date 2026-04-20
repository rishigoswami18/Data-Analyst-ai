import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, MessageSquarePlus, SendHorizonal } from 'lucide-react';

import ChatMessage from '../components/analysis/ChatMessage';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { useDataset } from '../contexts/DatasetContext';

export default function AnalysisPage() {
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const { currentDataset, messages, chatLoading, sendMessage } = useDataset();

  const hasDataset = Boolean(currentDataset);
  const visibleMessages = useMemo(
    () => messages.filter((message) => hasDataset || message.role === 'assistant'),
    [hasDataset, messages]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visibleMessages, chatLoading]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!draft.trim()) return;

    try {
      setError('');
      const message = draft.trim();
      setDraft('');
      await sendMessage(message);
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  if (!hasDataset) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No dataset selected for analysis"
        description="Upload a CSV or XLSX file from the dashboard first. Once a dataset is active, this page becomes your focused chat workspace for trends, KPIs, summaries, and charts."
        action={
          <Button size="lg" onClick={() => navigate('/dashboard')}>
            Go to dashboard
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="flex min-h-[calc(100vh-170px)] flex-col overflow-hidden">
        <div className="border-b border-outline px-6 py-5">
          <p className="text-sm uppercase tracking-[0.24em] text-accent-300">Analysis</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-white">{currentDataset.filename}</h1>
              <p className="mt-1 text-sm text-muted">
                Ask questions about trends, categories, rankings, revenue, margin, or chart-based insights.
              </p>
            </div>
          </div>
        </div>

        <div className="scrollbar-subtle flex-1 space-y-5 overflow-y-auto px-6 py-6">
          {visibleMessages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {chatLoading ? (
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-400">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div className="rounded-[28px] border border-outline bg-slate-900/75 px-5 py-4 text-sm text-muted">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent-400" />
                  Thinking through the dataset...
                </div>
              </div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-outline px-6 py-5">
          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 lg:flex-row">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask a question about your dataset..."
              rows={3}
              className="min-h-[120px] flex-1 rounded-[28px] border border-outline bg-slate-950/85 px-5 py-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-accent-400 focus:ring-4 focus:ring-accent-500/10"
            />
            <Button type="submit" size="lg" isLoading={chatLoading} className="h-auto min-w-[160px] rounded-[28px]">
              <SendHorizonal className="h-4 w-4" />
              Analyze
            </Button>
          </form>
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-accent-300">Selected dataset</p>
          <h2 className="mt-3 text-xl font-semibold text-white">{currentDataset.filename}</h2>
          <p className="mt-3 text-sm leading-7 text-muted">
            {currentDataset.rows.toLocaleString()} rows • {currentDataset.columns} columns • {currentDataset.numeric_columns}{' '}
            numeric columns
          </p>
        </Card>

        <Card className="p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-accent-300">Suggested prompts</p>
          <div className="mt-4 space-y-3">
            {[
              'Summarize the top KPIs in this dataset.',
              'Show the top 5 categories by revenue and profit.',
              'Plot a monthly trend and explain the strongest period.',
              'Which segments are underperforming?'
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setDraft(prompt)}
                className="w-full rounded-2xl border border-outline bg-white/5 px-4 py-3 text-left text-sm text-muted transition hover:border-accent-400/35 hover:text-white"
              >
                <span className="flex items-start gap-3">
                  <MessageSquarePlus className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" />
                  <span>{prompt}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
