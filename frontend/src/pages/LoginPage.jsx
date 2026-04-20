import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Sparkles } from 'lucide-react';

import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import { useAuth } from '../contexts/AuthContext';

const initialFormState = {
  login: { email: '', password: '' },
  signup: { name: '', email: '', password: '' }
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const nextPath = location.state?.from?.pathname || '/dashboard';

  function updateField(key, value) {
    setForm((current) => ({
      ...current,
      [mode]: {
        ...current[mode],
        [key]: value
      }
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      if (mode === 'login') {
        await login(form.login);
      } else {
        await signup(form.signup);
      }
      navigate(nextPath, { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  const activeForm = form[mode];

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10 sm:px-6">
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_minmax(360px,430px)]">
        <Card className="relative overflow-hidden p-8 sm:p-12">
          <div className="absolute inset-0 bg-gradient-to-br from-accent-500/10 via-transparent to-blue-500/10" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent-400/20 bg-accent-500/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-accent-300">
              <Sparkles className="h-3.5 w-3.5" />
              AI Data Analysis Assistant
            </div>
            <h1 className="mt-8 max-w-xl text-balance text-4xl font-semibold leading-tight text-white sm:text-6xl">
              Analyze datasets through a focused, production-ready workspace.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
              Separate authentication, dashboard, and analysis flows keep the product calm and intuitive.
              Upload securely, review recent datasets, and jump into a chat-based analyst experience.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {[
                ['Private workspace', 'Keep datasets and session context tied to your account.'],
                ['Fast onboarding', 'Start with upload on the dashboard, then move into analysis.'],
                ['Chart-ready answers', 'Surface charts and narrative insights in one conversation.'],
                ['Modern UX', 'Minimal screens, clear states, and less cognitive load.']
              ].map(([title, description]) => (
                <div key={title} className="rounded-3xl border border-outline bg-white/5 p-5">
                  <h2 className="text-base font-semibold text-white">{title}</h2>
                  <p className="mt-2 text-sm leading-7 text-muted">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-400">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-accent-300">Access</p>
              <h2 className="text-2xl font-semibold text-white">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h2>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 rounded-2xl border border-outline bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={[
                'rounded-2xl px-4 py-3 text-sm font-medium transition',
                mode === 'login' ? 'bg-accent-500/15 text-white' : 'text-muted hover:text-white'
              ].join(' ')}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={[
                'rounded-2xl px-4 py-3 text-sm font-medium transition',
                mode === 'signup' ? 'bg-accent-500/15 text-white' : 'text-muted hover:text-white'
              ].join(' ')}
            >
              Sign up
            </button>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {mode === 'signup' ? (
              <label className="block space-y-2">
                <span className="text-sm text-muted">Full name</span>
                <Input
                  value={activeForm.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  placeholder="Aisha Patel"
                  autoComplete="name"
                />
              </label>
            ) : null}

            <label className="block space-y-2">
              <span className="text-sm text-muted">Email</span>
              <Input
                value={activeForm.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="you@company.com"
                type="email"
                autoComplete="email"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-muted">Password</span>
              <Input
                value={activeForm.password}
                onChange={(event) => updateField('password', event.target.value)}
                placeholder={mode === 'login' ? 'Enter your password' : 'At least 6 characters'}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

            <Button type="submit" size="lg" isLoading={submitting} className="w-full">
              <span>{mode === 'login' ? 'Continue to dashboard' : 'Create account'}</span>
              {!submitting ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>
          </form>

          <p className="mt-5 text-sm leading-7 text-muted">
            {mode === 'login'
              ? 'Use your account to access the dashboard, upload datasets, and continue previous analysis.'
              : 'Your account keeps the experience focused and your uploaded dataset session private.'}
          </p>
        </Card>
      </div>
    </div>
  );
}
