import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  History,
  Info,
  Lightbulb,
  LoaderCircle,
  Network,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Signal,
  Sparkles,
  Target,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import {
  getGetTroubleshootingSessionQueryKey,
  getListTroubleshootingSessionsQueryKey,
  useCreateTroubleshootingSession,
  useGetTroubleshootingSession,
  useHealthCheck,
  useListTroubleshootingSessions,
  useSubmitFixVerification,
  useSubmitTroubleshootingAnswer,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';

const queryClient = new QueryClient();

type SessionStatus = 'collecting' | 'diagnosing' | 'ready_to_fix' | 'verifying' | 'resolved' | 'retrying' | string;
type SessionLike = {
  id: string;
  status: SessionStatus;
  step: number;
  created_at: string;
  updated_at: string;
  question: { key: string; prompt: string; helper: string; progress: number; total: number } | null;
  symptom_summary: {
    device: string;
    symptom: string;
    onset: string;
    frequency: string;
    scope: string;
    error_codes: string;
    recent_changes: string;
  } | null;
  diagnosis: {
    top_causes: { cause: string; confidence: string; reasoning: string }[];
    recommended_diagnostic_test: string;
  } | null;
  fix: { cause_addressed: string; steps: string[]; verification_question: string } | null;
  attempts: number;
  transcript: { role: string; text: string; timestamp: string }[];
};

const statusCopy: Record<string, { label: string; color: string; note: string }> = {
  collecting: { label: 'Collecting signals', color: 'amber', note: 'A few focused questions' },
  diagnosing: { label: 'Reading the pattern', color: 'teal', note: 'The diagnosis agent is working' },
  ready_to_fix: { label: 'Fix plan ready', color: 'coral', note: 'A clear next move is waiting' },
  verifying: { label: 'Checking the fix', color: 'teal', note: 'One last signal from you' },
  resolved: { label: 'Resolved', color: 'green', note: 'Your network is back in range' },
  retrying: { label: 'Trying another path', color: 'amber', note: 'We learned something useful' },
};

const workflowSteps = [
  { key: 'collecting', label: 'Collect', detail: 'Hear what changed', icon: CircleHelp },
  { key: 'diagnosing', label: 'Diagnose', detail: 'Find the likely cause', icon: Target },
  { key: 'ready_to_fix', label: 'Fix', detail: 'Take the next best step', icon: Zap },
  { key: 'verifying', label: 'Verify', detail: 'Confirm the signal', icon: ShieldCheck },
];

function formatDate(value: string, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date);
}

function statusFor(status: string) {
  return statusCopy[status] ?? { label: status.replace('_', ' '), color: 'teal', note: 'Session in progress' };
}

function SignalBars({ level = 3 }: { level?: number }) {
  return (
    <span className="signal-bars" data-level={level} aria-label={`Signal level ${level} of 4`}>
      <span /><span /><span /><span />
    </span>
  );
}

function BrandMark() {
  return (
    <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] shadow-[0_6px_14px_rgba(220,158,40,.22)]">
      <span className="absolute h-5 w-5 rounded-full border-2 border-[hsl(var(--foreground)/.85)]" />
      <span className="absolute h-2 w-2 rounded-full bg-[hsl(var(--foreground))]" />
      <span className="absolute -right-0.5 top-1 h-1.5 w-1.5 rounded-full bg-[hsl(var(--card))]" />
    </span>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: health, isError: healthError } = useHealthCheck();
  const navItems = [
    { href: '/', label: 'New session', icon: Sparkles, testId: 'link-new-session' },
    { href: '/history', label: 'Session history', icon: History, testId: 'link-session-history' },
    { href: '/about', label: 'How it works', icon: Info, testId: 'link-how-it-works' },
  ];
  const isSession = location.startsWith('/session/');

  return (
    <div className="app-noise min-h-[100dvh]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-[hsl(var(--sidebar-foreground)/.11)] bg-[hsl(var(--sidebar,var(--primary)))] px-5 py-6 text-[hsl(var(--sidebar-foreground,var(--primary-foreground)))] md:flex">
        <Link href="/" data-testid="link-brand-home" className="focus-ring flex items-center gap-3 rounded-xl px-2 py-1.5">
          <BrandMark />
          <span>
            <span className="block text-[15px] font-bold tracking-[-.03em]">identifier<span className="text-[hsl(var(--accent))]">.</span>studio</span>
            <span className="mono mt-0.5 block text-[9px] uppercase tracking-[.17em] text-[hsl(var(--sidebar-foreground)/.52)]">network clarity</span>
          </span>
        </Link>

        <div className="mt-14 px-2">
          <p className="eyebrow text-[hsl(var(--sidebar-foreground)/.45)]">Workspace</p>
          <nav className="mt-4 space-y-1.5" aria-label="Primary navigation">
            {navItems.map(({ href, label, icon: Icon, testId }) => {
              const active = href === '/' ? location === '/' : location.startsWith(href);
              return (
                <Link
                  href={href}
                  key={href}
                  data-testid={testId}
                  className={`focus-ring interactive group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold ${active ? 'bg-[hsl(var(--sidebar-foreground)/.12)] text-[hsl(var(--sidebar-foreground))]' : 'text-[hsl(var(--sidebar-foreground)/.62)] hover:bg-[hsl(var(--sidebar-foreground)/.07)] hover:text-[hsl(var(--sidebar-foreground))]'}`}
                >
                  <Icon size={16} strokeWidth={active ? 2.4 : 1.8} />
                  <span>{label}</span>
                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto space-y-4 px-2">
          <div className="rounded-2xl border border-[hsl(var(--sidebar-foreground)/.11)] bg-[hsl(var(--sidebar-foreground)/.06)] p-3.5">
            <div className="flex items-center gap-2">
              <span className={`pulse-dot h-2 w-2 rounded-full ${healthError ? 'bg-[hsl(var(--destructive))]' : 'bg-[hsl(var(--accent))]'}`} />
              <span className="eyebrow text-[hsl(var(--sidebar-foreground)/.68)]">{healthError ? 'Service check' : 'System ready'}</span>
            </div>
            <p data-testid="status-system-health" className="mt-2 text-[11px] leading-relaxed text-[hsl(var(--sidebar-foreground)/.48)]">
              {healthError ? 'The studio is having trouble checking in.' : health?.status === 'ok' ? 'Agents are standing by for a signal.' : 'Secure workspace for focused diagnosis.'}
            </p>
          </div>
          <p className="mono text-[9px] tracking-[.08em] text-[hsl(var(--sidebar-foreground)/.35)]">v1.0 / PRIVATE BY DESIGN</p>
        </div>
      </aside>

      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[hsl(var(--border)/.8)] bg-[hsl(var(--background)/.88)] px-5 py-3.5 backdrop-blur-xl md:hidden">
        <Link href="/" data-testid="link-mobile-brand-home" className="focus-ring flex items-center gap-2.5">
          <BrandMark />
          <span className="text-sm font-bold tracking-[-.03em]">identifier<span className="text-[hsl(var(--accent-foreground))]">.</span>studio</span>
        </Link>
        <div className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon, testId }) => (
            <Link href={href} key={href} aria-label={label} data-testid={`mobile-${testId}`} className={`focus-ring rounded-lg p-2 ${location === href ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
              <Icon size={17} />
            </Link>
          ))}
        </div>
      </header>

      <main className={`${isSession ? '' : 'max-w-[1440px]'} ml-0 min-h-[calc(100dvh-65px)] px-5 py-7 sm:px-8 md:ml-[248px] md:min-h-[100dvh] md:px-10 md:py-9 lg:px-14`}>
        {children}
      </main>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="page-enter flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p className="eyebrow text-[hsl(var(--primary))]">{eyebrow}</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-bold leading-[1.05] tracking-[-.055em] text-[hsl(var(--foreground))] sm:text-[42px]">{title}</h1>
        {description && <p className="mt-3 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function SessionSkeleton() {
  return (
    <div className="space-y-5" data-testid="loading-session">
      <div className="loader-line h-4 w-28 rounded-full" />
      <div className="loader-line h-10 w-3/4 rounded-xl" />
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div className="loader-line h-64 rounded-2xl" />
        <div className="loader-line h-96 rounded-2xl" />
      </div>
    </div>
  );
}

function HomePage() {
  const [, setLocation] = useLocation();
  const queryClientInstance = useQueryClient();
  const { data: sessions, isLoading, isError, refetch } = useListTroubleshootingSessions();
  const createSession = useCreateTroubleshootingSession();
  const activeSession = useMemo(
    () => (sessions ?? []).find((session) => !['resolved'].includes(session.status)),
    [sessions],
  );
  const startSession = () => {
    createSession.mutate(undefined, {
      onSuccess: (session) => {
        queryClientInstance.invalidateQueries({ queryKey: getListTroubleshootingSessionsQueryKey() });
        setLocation(`/session/${session.id}`);
      },
    });
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="page-enter grid gap-8 lg:grid-cols-[1.06fr_.94fr] lg:items-center lg:gap-14">
        <section className="pt-3 lg:pt-8">
          <div className="flex items-center gap-2 text-[hsl(var(--primary))]">
            <Signal size={16} />
            <span className="eyebrow">A calmer way to troubleshoot</span>
          </div>
          <h1 data-testid="text-home-headline" className="mt-6 max-w-[680px] text-[clamp(3.2rem,8vw,6.6rem)] font-bold leading-[.88] tracking-[-.085em] text-[hsl(var(--foreground))]">
            Get back<br /><span className="text-[hsl(var(--primary))]">in range.</span>
          </h1>
          <p className="mt-7 max-w-[510px] text-base leading-7 text-[hsl(var(--muted-foreground))] sm:text-lg">
            A guided workspace for when Wi-Fi, an app, or the whole network starts acting strange. No jargon wall. Just the next useful question.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <button onClick={startSession} disabled={createSession.isPending} data-testid="button-start-session" className="focus-ring interactive inline-flex items-center gap-3 rounded-xl bg-[hsl(var(--primary))] px-5 py-3.5 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-[0_10px_22px_rgba(35,92,94,.2)] disabled:cursor-wait disabled:opacity-70">
              {createSession.isPending ? <LoaderCircle size={17} className="animate-spin" /> : <Sparkles size={17} />}
              {createSession.isPending ? 'Opening your workspace' : 'Start a new session'}
              {!createSession.isPending && <ArrowRight size={16} />}
            </button>
            <span className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><LockIcon /> Private by design</span>
          </div>
          {createSession.isError && (
            <div data-testid="error-create-session" className="mt-4 flex max-w-md items-start gap-2 rounded-xl border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.08)] p-3 text-xs text-[hsl(var(--destructive))]">
              <X size={15} className="mt-0.5 shrink-0" /> We could not open a session. Check the connection and try again.
            </div>
          )}
        </section>

        <section className="relative min-h-[380px] overflow-hidden rounded-[28px] border border-[hsl(var(--primary)/.16)] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] shadow-[0_25px_65px_rgba(35,92,94,.18)] sm:p-8">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-[hsl(var(--accent)/.25)]" />
          <div className="absolute -right-7 -top-11 h-48 w-48 rounded-full border border-[hsl(var(--accent)/.18)]" />
          <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-[hsl(var(--accent)/.08)] blur-3xl" />
          <div className="relative flex h-full flex-col justify-between gap-16">
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow text-[hsl(var(--primary-foreground)/.53)]">Control room / 01</p>
                <h2 className="mt-3 max-w-[270px] text-2xl font-bold leading-tight tracking-[-.045em]">One signal at a time.</h2>
              </div>
              <div data-testid="display-signal-status" className="flex items-center gap-2 rounded-full border border-[hsl(var(--primary-foreground)/.18)] px-3 py-1.5 text-[10px] text-[hsl(var(--primary-foreground)/.72)]">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" /> STANDING BY
              </div>
            </div>
            <div>
              <div className="flex items-end justify-between border-b border-[hsl(var(--primary-foreground)/.16)] pb-4">
                <div className="flex items-end gap-4">
                  <SignalBars level={3} />
                  <span className="mono text-4xl tracking-[-.1em]">03<span className="text-base text-[hsl(var(--primary-foreground)/.42)]">/04</span></span>
                </div>
                <span className="eyebrow text-[hsl(var(--primary-foreground)/.48)]">signal clarity</span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {['Collect facts', 'Trace cause', 'Verify fix'].map((label, index) => (
                  <div key={label} className={`${index === 0 ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--primary-foreground)/.4)]'}`}>
                    <span className="mono text-[10px]">0{index + 1}</span>
                    <p className="mt-1 text-[11px] leading-4">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-16 border-t border-[hsl(var(--border))] pt-7">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-3" data-testid="loading-home-sessions">
            {[1, 2, 3].map((item) => <div key={item} className="loader-line h-24 rounded-2xl" />)}
          </div>
        ) : isError ? (
          <div data-testid="error-home-sessions" className="flex flex-col gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.55)] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold">Recent sessions are out of range.</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Your new session can still start when the service is reachable.</p></div>
            <button onClick={() => refetch()} data-testid="button-retry-home-sessions" className="focus-ring inline-flex items-center gap-2 self-start rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-semibold hover:bg-[hsl(var(--secondary))]"><RefreshCw size={14} /> Retry</button>
          </div>
        ) : activeSession ? (
          <div data-testid={`card-active-session-${activeSession.id}`} className="surface flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[hsl(var(--accent)/.2)] text-[hsl(var(--primary))]"><Activity size={19} /></div>
              <div><div className="flex items-center gap-2"><span className="eyebrow text-[hsl(var(--primary))]">Active session</span><span className="h-1 w-1 rounded-full bg-[hsl(var(--accent))]" /></div><p data-testid={`text-active-session-${activeSession.id}`} className="mt-1 text-sm font-semibold">{activeSession.label || 'Untitled network check'}</p><p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">Updated {formatDate(activeSession.updated_at, true)} · {statusFor(activeSession.status).label}</p></div>
            </div>
            <Link href={`/session/${activeSession.id}`} data-testid={`link-continue-session-${activeSession.id}`} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--secondary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary))] hover:bg-[hsl(var(--secondary)/.7)]">Continue session <ChevronRight size={15} /></Link>
          </div>
        ) : (
          <div data-testid="empty-home-sessions" className="flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(var(--secondary))]"><Clock3 size={14} /></span> No open sessions. When something feels off, start here.</div>
        )}
      </div>
    </div>
  );
}

function LockIcon() {
  return <span className="grid h-4 w-4 place-items-center rounded border border-[hsl(var(--muted-foreground)/.4)]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--muted-foreground))]" /></span>;
}

function HistoryPage() {
  const { data: sessions, isLoading, isError, refetch } = useListTroubleshootingSessions();
  return (
    <div className="mx-auto max-w-[1080px]">
      <PageHeader eyebrow="Workspace / history" title="Every signal leaves a trail." description="Reopen a previous session to see what changed, what was tested, and what brought the network back." />
      <div className="mt-10">
        {isLoading ? (
          <div className="space-y-3" data-testid="loading-history">{[1, 2, 3, 4].map((item) => <div key={item} className="loader-line h-[86px] rounded-2xl" />)}</div>
        ) : isError ? (
          <div data-testid="error-history" className="surface rounded-2xl p-8 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]"><RefreshCw size={19} /></div><h2 className="mt-4 font-bold">History could not load</h2><p className="mx-auto mt-2 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">The archive is taking a moment to respond.</p><button onClick={() => refetch()} data-testid="button-retry-history" className="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))]"><RefreshCw size={14} /> Try again</button></div>
        ) : !sessions?.length ? (
          <div data-testid="empty-history" className="surface relative overflow-hidden rounded-2xl p-10 text-center sm:p-16"><div className="absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 rounded-full bg-[hsl(var(--accent)/.12)] blur-3xl" /><div className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><History size={23} /></div><h2 className="relative mt-5 text-xl font-bold tracking-[-.03em]">Your trail starts here.</h2><p className="relative mx-auto mt-2 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">Completed sessions will appear here with the clues and fixes that mattered.</p><Link href="/" data-testid="link-start-from-empty-history" className="focus-ring relative mt-6 inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))]">Start a session <ArrowRight size={14} /></Link></div>
        ) : (
          <div className="space-y-3" data-testid="list-session-history">
            {sessions.map((session, index) => {
              const meta = statusFor(session.status);
              return (
                <Link href={`/session/${session.id}`} key={session.id} data-testid={`row-session-${session.id}`} className="surface interactive focus-ring group grid gap-4 rounded-2xl p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
                  <div className="flex items-center gap-4">
                    <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${index === 0 ? 'bg-[hsl(var(--accent)/.22)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'}`}><FileText size={18} /></div>
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p data-testid={`text-session-label-${session.id}`} className="truncate text-sm font-bold">{session.label || 'Network troubleshooting session'}</p><span data-testid={`status-session-${session.id}`} className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] ${meta.color === 'amber' ? 'bg-[hsl(var(--accent)/.18)] text-[hsl(32,73%,35%)]' : meta.color === 'green' ? 'bg-[hsl(151,34%,87%)] text-[hsl(154,43%,28%)]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]'}`}>{meta.label}</span></div><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{formatDate(session.created_at, true)} <span className="mx-1 text-[hsl(var(--border))]">/</span> {session.attempts} {session.attempts === 1 ? 'attempt' : 'attempts'}</p></div>
                  </div>
                  <div className="flex items-center justify-between gap-6 pl-[60px] text-xs text-[hsl(var(--muted-foreground))] sm:justify-end sm:pl-0"><span>{meta.note}</span><ChevronRight size={17} className="text-[hsl(var(--primary))] transition-transform group-hover:translate-x-1" /></div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AboutPage() {
  const agents = [
    { number: '01', title: 'Collector', icon: CircleHelp, accent: 'amber', text: 'Turns a vague “the internet is weird” into a small, useful set of facts. Device, timing, scope, and what changed — no interrogation.' },
    { number: '02', title: 'Diagnosis', icon: Target, accent: 'teal', text: 'Reads the pattern across your answers, ranks the likely causes, and chooses the least disruptive test that can separate them.' },
    { number: '03', title: 'Fix', icon: Zap, accent: 'coral', text: 'Gives you a short plan written for a human standing in front of a router, not a technician reading a manual.' },
  ];
  return (
    <div className="mx-auto max-w-[1080px]">
      <PageHeader eyebrow="Workspace / about" title="A specialist team for a noisy problem." description="identifier.studio keeps the troubleshooting loop calm: collect the right signal, trace the pattern, make one considered change, then check the result." />
      <section className="page-enter stagger-1 relative mt-12 overflow-hidden rounded-[26px] bg-[hsl(var(--primary))] p-7 text-[hsl(var(--primary-foreground))] sm:p-10">
        <div className="absolute right-0 top-0 h-full w-1/2 opacity-40" style={{ backgroundImage: 'linear-gradient(90deg, transparent, hsl(var(--accent) / .12)), repeating-linear-gradient(0deg, transparent 0 28px, hsl(var(--primary-foreground) / .09) 29px)' }} />
        <div className="relative max-w-2xl"><p className="eyebrow text-[hsl(var(--accent))]">The operating principle</p><h2 className="mt-4 text-3xl font-bold leading-tight tracking-[-.055em] sm:text-5xl">Less guessing.<br />More signal.</h2><p className="mt-5 max-w-lg text-sm leading-6 text-[hsl(var(--primary-foreground)/.68)]">The workspace remembers the path so you do not have to. Every question earns its place, every recommendation comes with reasoning, and every fix gets a verification step.</p></div>
        <div className="relative mt-10 flex items-center gap-3 text-[hsl(var(--accent))]"><Signal size={18} /><span className="eyebrow">human-readable diagnostics / always</span></div>
      </section>
      <section className="mt-14">
        <div className="flex items-end justify-between gap-4"><div><p className="eyebrow text-[hsl(var(--primary))]">The workflow</p><h2 className="mt-2 text-2xl font-bold tracking-[-.045em]">Three agents. One clear path.</h2></div><span className="mono hidden text-[10px] text-[hsl(var(--muted-foreground))] sm:block">SIGNAL / 03.0</span></div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {agents.map(({ number, title, icon: Icon, accent, text }) => (
            <article key={title} className="surface-strong interactive rounded-2xl p-5">
              <div className="flex items-center justify-between"><span className="mono text-xs text-[hsl(var(--muted-foreground))]">{number}</span><span className={`grid h-9 w-9 place-items-center rounded-lg ${accent === 'amber' ? 'bg-[hsl(var(--accent)/.2)] text-[hsl(var(--primary))]' : accent === 'coral' ? 'bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]'}`}><Icon size={17} /></span></div>
              <h3 className="mt-8 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="mt-14 grid gap-5 border-t border-[hsl(var(--border))] pt-8 sm:grid-cols-2">
        <div className="flex gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><ShieldCheck size={16} /></div><div><h3 className="text-sm font-bold">Private by design</h3><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Your session is a focused workspace, not a public forum. We ask for only what helps the diagnosis.</p></div></div>
        <div className="flex gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[hsl(var(--accent)/.2)] text-[hsl(var(--primary))]"><Network size={16} /></div><div><h3 className="text-sm font-bold">Progress you can see</h3><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">The current agent, step, and next move are always visible — especially when the network is not.</p></div></div>
      </section>
    </div>
  );
}

function WorkflowRail({ status, step }: { status: string; step: number }) {
  const activeIndex = Math.max(0, workflowSteps.findIndex((item) => item.key === status));
  return (
    <aside className="surface-strong rounded-2xl p-4 md:sticky md:top-8 md:h-fit">
      <div className="flex items-center justify-between"><p className="eyebrow text-[hsl(var(--primary))]">Specialist path</p><span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">0{Math.min(activeIndex + 1, 4)} / 04</span></div>
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible">
        {workflowSteps.map(({ key, label, detail, icon: Icon }, index) => {
          const complete = index < activeIndex || status === 'resolved';
          const active = index === activeIndex && status !== 'resolved';
          return <div key={key} className={`relative flex min-w-[150px] items-center gap-3 rounded-xl p-3 md:min-w-0 ${active ? 'bg-[hsl(var(--secondary))]' : ''}`}>
            {index < workflowSteps.length - 1 && <span className={`absolute bottom-[-10px] left-[23px] hidden h-3 w-px md:block ${complete ? 'bg-[hsl(var(--primary)/.65)]' : 'bg-[hsl(var(--border))]'}`} />}
            <span className={`relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-lg ${complete ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : active ? 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>{complete ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}</span>
            <span><span className={`block text-xs font-bold ${active ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{label}</span><span className="mt-0.5 block whitespace-nowrap text-[10px] text-[hsl(var(--muted-foreground))] md:whitespace-normal">{active ? detail : complete ? 'Complete' : 'Up next'}</span></span>
          </div>;
        })}
      </div>
      <div className="mt-5 hidden border-t border-[hsl(var(--border))] pt-4 md:block"><p className="text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">Step {step || activeIndex + 1} is saved as you move. You can pause and come back to this exact signal.</p></div>
    </aside>
  );
}

function SummaryStrip({ session }: { session: SessionLike }) {
  const summary = session.symptom_summary;
  if (!summary) return null;
  const items = [['Device', summary.device], ['Scope', summary.scope], ['Started', summary.onset]];
  return <div data-testid="display-symptom-summary" className="grid gap-px overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--border))] sm:grid-cols-3">{items.map(([label, value]) => <div key={label} className="bg-[hsl(var(--card))] px-3.5 py-3"><p className="eyebrow text-[hsl(var(--muted-foreground))]">{label}</p><p className="mt-1 truncate text-xs font-semibold">{value || 'Not noted'}</p></div>)}</div>;
}

function CollectorPanel({ session, onSubmitted }: { session: SessionLike; onSubmitted: (answer: string) => void }) {
  const [answer, setAnswer] = useState('');
  useEffect(() => setAnswer(''), [session.question?.key]);
  const question = session.question;
  if (!question) return <div data-testid="empty-collector-question" className="surface rounded-2xl p-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><CircleHelp size={21} /></div><h2 className="mt-4 font-bold">The next question is still arriving.</h2><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Stay here for a moment, or reopen the session to refresh its signal.</p></div>;
  return (
    <section className="surface rounded-2xl p-5 sm:p-7" data-testid="panel-collector-question">
      <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-[hsl(var(--primary))]"><CircleHelp size={16} /><span className="eyebrow">Collector agent</span></div><p data-testid="display-question-progress" className="mono mt-3 text-[10px] text-[hsl(var(--muted-foreground))]">SIGNAL {String(question.progress).padStart(2, '0')} / {String(question.total).padStart(2, '0')}</p></div><div className="w-24 sm:w-36"><div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]"><div className="h-full rounded-full bg-[hsl(var(--accent))] transition-all duration-500" style={{ width: `${Math.min(100, (question.progress / question.total) * 100)}%` }} /></div></div></div>
      <h2 data-testid="display-collector-prompt" className="mt-9 max-w-2xl text-2xl font-bold leading-tight tracking-[-.045em] sm:text-3xl">{question.prompt}</h2>
      <p data-testid="display-collector-helper" className="mt-3 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">{question.helper}</p>
      <form onSubmit={(event) => { event.preventDefault(); if (answer.trim()) onSubmitted(answer.trim()); }} className="mt-7">
        <label htmlFor="session-answer" className="eyebrow text-[hsl(var(--muted-foreground))]">Your answer</label>
        <textarea id="session-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} data-testid="input-troubleshooting-answer" rows={4} placeholder="Write what you notice in your own words…" className="focus-ring mt-2 w-full resize-none rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.5)] px-4 py-3 text-sm leading-6 outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground)/.7)] focus:border-[hsl(var(--accent))]" />
        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-[hsl(var(--muted-foreground))]">There is no wrong answer. Specific is useful; uncertain is useful too.</p><button type="submit" disabled={!answer.trim()} data-testid="button-submit-answer" className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))] transition-opacity disabled:cursor-not-allowed disabled:opacity-40">Continue <ArrowRight size={14} /></button></div>
      </form>
    </section>
  );
}

function DiagnosisPanel({ session }: { session: SessionLike }) {
  const diagnosis = session.diagnosis;
  if (!diagnosis) return <AgentWorking title="Reading the pattern" detail="The diagnosis agent is comparing your signals and choosing a useful test." />;
  return <section className="space-y-5" data-testid="panel-diagnosis"><div className="surface rounded-2xl p-5 sm:p-7"><div className="flex items-center gap-2 text-[hsl(var(--primary))]"><Target size={16} /><span className="eyebrow">Diagnosis agent</span></div><h2 className="mt-5 text-2xl font-bold tracking-[-.045em]">Here is what the pattern points to.</h2><div className="mt-6 space-y-3">{diagnosis.top_causes.map((cause, index) => <div key={`${cause.cause}-${index}`} data-testid={`display-diagnosis-cause-${index}`} className={`rounded-xl border p-4 ${index === 0 ? 'border-[hsl(var(--accent)/.65)] bg-[hsl(var(--accent)/.09)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--background)/.35)]'}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">{cause.cause}</p><span className="mono rounded-full bg-[hsl(var(--card))] px-2 py-1 text-[9px] uppercase tracking-[.08em] text-[hsl(var(--primary))]">{cause.confidence} confidence</span></div><p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{cause.reasoning}</p></div>)}</div></div><div className="rounded-2xl border border-[hsl(var(--primary)/.18)] bg-[hsl(var(--secondary)/.6)] p-5"><div className="flex gap-3"><Lightbulb size={17} className="mt-0.5 shrink-0 text-[hsl(var(--accent-foreground))]" /><div><p className="eyebrow text-[hsl(var(--primary))]">Recommended diagnostic test</p><p data-testid="display-recommended-test" className="mt-2 text-sm font-semibold leading-6">{diagnosis.recommended_diagnostic_test}</p></div></div></div></section>;
}

function FixPanel({ session, onVerify }: { session: SessionLike; onVerify: (worked: boolean) => void }) {
  const fix = session.fix;
  if (!fix) return <AgentWorking title="Building a fix plan" detail="The fix agent is turning the likely cause into a safe, reversible next step." />;
  return <section className="space-y-5" data-testid="panel-fix"><div className="surface rounded-2xl p-5 sm:p-7"><div className="flex items-center gap-2 text-[hsl(var(--destructive))]"><Zap size={16} /><span className="eyebrow">Fix agent</span></div><h2 className="mt-5 text-2xl font-bold tracking-[-.045em]">{fix.cause_addressed}</h2><ol className="mt-7 space-y-4">{fix.steps.map((step, index) => <li key={`${step}-${index}`} data-testid={`display-fix-step-${index}`} className="flex gap-3"><span className="mono grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[hsl(var(--secondary))] text-[10px] font-bold text-[hsl(var(--primary))]">{String(index + 1).padStart(2, '0')}</span><p className="pt-0.5 text-sm leading-6">{step}</p></li>)}</ol></div><div className="surface rounded-2xl p-5 sm:p-7"><p className="eyebrow text-[hsl(var(--primary))]">Verification</p><h3 data-testid="display-verification-question" className="mt-3 text-lg font-bold leading-6">{fix.verification_question}</h3><div className="mt-5 grid gap-2 sm:grid-cols-2"><button onClick={() => onVerify(true)} data-testid="button-fix-worked" className="focus-ring interactive inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-3 text-xs font-bold text-[hsl(var(--primary-foreground))]"><Check size={15} /> Yes, it is back</button><button onClick={() => onVerify(false)} data-testid="button-fix-not-worked" className="focus-ring interactive inline-flex items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] px-4 py-3 text-xs font-bold hover:bg-[hsl(var(--secondary))]"><RotateCcw size={15} /> Not yet</button></div></div></section>;
}

function AgentWorking({ title, detail }: { title: string; detail: string }) {
  return <div data-testid="state-agent-working" className="surface rounded-2xl p-7 sm:p-10"><div className="flex items-center gap-2 text-[hsl(var(--primary))]"><Activity size={16} /><span className="eyebrow">Specialist agent active</span></div><div className="mt-10 space-y-3"><div className="loader-line h-3 w-24 rounded-full" /><div className="loader-line h-8 w-3/4 rounded-lg" /><div className="loader-line h-3 w-full rounded-full" /><div className="loader-line h-3 w-5/6 rounded-full" /></div><h2 className="mt-9 text-xl font-bold tracking-[-.03em]">{title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-[hsl(var(--muted-foreground))]">{detail}</p></div>;
}

function ResolvedPanel({ session }: { session: SessionLike }) {
  return <section data-testid="panel-resolved" className="relative overflow-hidden rounded-2xl bg-[hsl(var(--primary))] p-7 text-[hsl(var(--primary-foreground))] shadow-[0_20px_45px_rgba(35,92,94,.16)] sm:p-10"><div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border border-[hsl(var(--accent)/.25)]" /><div className="relative"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"><Check size={22} strokeWidth={3} /></div><p className="eyebrow mt-8 text-[hsl(var(--accent))]">Signal restored</p><h2 className="mt-3 text-3xl font-bold tracking-[-.055em] sm:text-4xl">You are back in range.</h2><p className="mt-4 max-w-lg text-sm leading-6 text-[hsl(var(--primary-foreground)/.68)]">The session is complete. Your trail is saved so the next strange network moment starts with more context.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/history" data-testid="link-resolved-history" className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--accent))] px-4 py-3 text-xs font-bold text-[hsl(var(--foreground))]">View session history <ArrowRight size={14} /></Link><Link href="/" data-testid="link-resolved-new-session" className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--primary-foreground)/.2)] px-4 py-3 text-xs font-bold text-[hsl(var(--primary-foreground))]">New session</Link></div></div></section>;
}

function Transcript({ entries }: { entries: SessionLike['transcript'] }) {
  if (!entries?.length) return null;
  return <details className="surface rounded-2xl group" data-testid="disclosure-transcript"><summary data-testid="button-toggle-transcript" className="focus-ring flex cursor-pointer list-none items-center justify-between p-4 text-sm font-bold"><span className="flex items-center gap-2"><FileText size={15} className="text-[hsl(var(--primary))]" /> Session transcript <span className="mono text-[10px] font-normal text-[hsl(var(--muted-foreground))]">{entries.length} entries</span></span><ChevronRight size={16} className="transition-transform group-open:rotate-90" /></summary><div className="border-t border-[hsl(var(--border))] px-4 pb-4 pt-2">{entries.map((entry, index) => <div key={`${entry.timestamp}-${index}`} data-testid={`transcript-entry-${index}`} className="grid grid-cols-[72px_1fr] gap-3 border-b border-[hsl(var(--border)/.6)] py-3 last:border-0"><span className={`eyebrow ${entry.role === 'assistant' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--destructive))]'}`}>{entry.role === 'assistant' ? 'Agent' : 'You'}</span><p className="text-xs leading-5 text-[hsl(var(--muted-foreground))]">{entry.text}</p></div>)}</div></details>;
}

function SessionPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const queryClientInstance = useQueryClient();
  const detailKey = getGetTroubleshootingSessionQueryKey(id);
  const { data: session, isLoading, isError, refetch } = useGetTroubleshootingSession(id, { query: { enabled: Boolean(id), queryKey: detailKey, refetchInterval: 2500 } });
  const submitAnswer = useSubmitTroubleshootingAnswer();
  const submitVerification = useSubmitFixVerification();
  const typedSession = session as SessionLike | undefined;

  const applySession = (next: SessionLike) => {
    queryClientInstance.setQueryData(detailKey, next);
    queryClientInstance.invalidateQueries({ queryKey: getListTroubleshootingSessionsQueryKey() });
  };
  const handleAnswer = (answer: string) => {
    if (!id) return;
    submitAnswer.mutate({ sessionId: id, data: { answer } }, { onSuccess: (next) => applySession(next as SessionLike) });
  };
  const handleVerify = (worked: boolean) => {
    if (!id) return;
    submitVerification.mutate({ sessionId: id, data: { worked } }, { onSuccess: (next) => applySession(next as SessionLike) });
  };

  if (isLoading) return <div className="mx-auto max-w-[1050px]"><SessionSkeleton /></div>;
  if (isError || !typedSession) return <div className="mx-auto max-w-[650px] pt-10"><div data-testid="error-session-detail" className="surface rounded-2xl p-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]"><Wifi size={21} /></div><h1 className="mt-5 text-xl font-bold">This signal is out of range.</h1><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">We could not open this session right now. Your history is still safe.</p><div className="mt-6 flex justify-center gap-3"><button onClick={() => refetch()} data-testid="button-retry-session-detail" className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))]"><RefreshCw size={14} /> Retry</button><Link href="/history" data-testid="link-back-to-history-error" className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-4 py-2.5 text-xs font-bold"><ArrowLeft size={14} /> History</Link></div></div></div>;

  const meta = statusFor(typedSession.status);
  const isSubmitting = submitAnswer.isPending || submitVerification.isPending;
  return (
    <div className="mx-auto max-w-[1240px] page-enter">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><Link href="/" data-testid="link-session-back-home" className="focus-ring inline-flex w-fit items-center gap-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"><ArrowLeft size={14} /> Leave workspace</Link><div className="flex items-center gap-3"><span className={`pulse-dot h-2 w-2 rounded-full ${meta.color === 'amber' ? 'bg-[hsl(var(--accent))]' : meta.color === 'coral' ? 'bg-[hsl(var(--destructive))]' : 'bg-[hsl(var(--primary))]'}`} /><span data-testid="status-session-detail" className="eyebrow text-[hsl(var(--muted-foreground))]">{meta.label}</span><span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">ID {typedSession.id.slice(0, 8)}</span></div></div>
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow text-[hsl(var(--primary))]">Live troubleshooting workspace</p><h1 data-testid="text-session-title" className="mt-2 text-2xl font-bold tracking-[-.05em] sm:text-3xl">{typedSession.symptom_summary?.device ? `${typedSession.symptom_summary.device} signal check` : 'Your signal check'}</h1></div><p className="text-xs text-[hsl(var(--muted-foreground))]">Opened {formatDate(typedSession.created_at, true)}</p></div>
      <SummaryStrip session={typedSession} />
      <div className="mt-5 grid gap-5 md:grid-cols-[230px_1fr]">
        <WorkflowRail status={typedSession.status} step={typedSession.step} />
        <div className="min-w-0 space-y-5">
          {typedSession.status === 'collecting' || typedSession.status === 'retrying' ? <CollectorPanel session={typedSession} onSubmitted={handleAnswer} /> : typedSession.status === 'diagnosing' ? <DiagnosisPanel session={typedSession} /> : typedSession.status === 'ready_to_fix' ? <FixPanel session={typedSession} onVerify={handleVerify} /> : typedSession.status === 'verifying' ? <AgentWorking title="Checking your answer" detail="We are recording the result and preparing the cleanest next move." /> : typedSession.status === 'resolved' ? <ResolvedPanel session={typedSession} /> : <AgentWorking title="Preparing the next signal" detail="The workspace is lining up the next specialist." />}
          {(submitAnswer.isError || submitVerification.isError) && <div data-testid="error-session-mutation" className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.08)] p-3 text-xs text-[hsl(var(--destructive))]"><span className="flex items-center gap-2"><X size={14} /> We could not save that signal. Your last answer is still here.</span><button onClick={() => refetch()} data-testid="button-refresh-after-mutation-error" className="font-bold underline">Refresh</button></div>}
          {isSubmitting && <div data-testid="status-saving-session" className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><LoaderCircle size={14} className="animate-spin text-[hsl(var(--primary))]" /> Saving this signal…</div>}
          <Transcript entries={typedSession.transcript} />
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <AppShell>
      <ErrorBoundary resetKey={useLocation()[0]}>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/history" component={HistoryPage} />
          <Route path="/about" component={AboutPage} />
          <Route path="/session/:id" component={SessionPage} />
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;