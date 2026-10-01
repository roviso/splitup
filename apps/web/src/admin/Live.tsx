import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { api } from '../api';
import { Avatar, Button, Spinner, cx } from '../ui';
import { Head, Panel, useAdmin, type Feed, type FeedItem } from './kit';
import { FeedList, feedKey } from './feed';
import { Link } from 'react-router-dom';

const CATS = [
  { v: 'users', l: 'People' }, { v: 'money', l: 'Money' }, { v: 'groups', l: 'Groups' },
  { v: 'ai', l: 'AI' }, { v: 'auth', l: 'Sign-ins' }, { v: 'admin', l: 'Admin actions' },
];

export default function Live() {
  const [cats, setCats] = useState(CATS.map((c) => c.v));
  const [paused, setPaused] = useState(false);
  const q = useAdmin<Feed>(`/feed?limit=80&cats=${cats.join(',')}`, { refetchInterval: paused ? false : 4_000 });
  const [older, setOlder] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(false);
  // Flash what arrived since the last poll.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!q.data) return;
    const keys = q.data.items.map(feedKey);
    if (seen.current) setFresh(new Set(keys.filter((k) => !seen.current!.has(k))));
    seen.current = new Set([...(seen.current ?? []), ...keys]);
  }, [q.data]);
  useEffect(() => { setOlder(null); seen.current = null; }, [cats.join()]);

  const items: FeedItem[] = [...(q.data?.items ?? []), ...(older?.items ?? [])];
  const people = { ...older?.people, ...q.data?.people }, groups = { ...older?.groups, ...q.data?.groups };
  const more = async () => {
    const last = items.at(-1);
    if (!last) return;
    setLoading(true);
    const r = await api<Feed>(`/admin/feed?limit=80&cats=${cats.join(',')}&before=${encodeURIComponent(last.at)}`).finally(() => setLoading(false));
    setOlder((o) => ({ items: [...(o?.items ?? []), ...r.items], people: { ...o?.people, ...r.people }, groups: { ...o?.groups, ...r.groups } }));
  };
  const toggle = (v: string) => setCats((c) => (c.includes(v) ? (c.length > 1 ? c.filter((x) => x !== v) : c) : [...c, v]));

  return (
    <div className="space-y-6">
      <Head
        title={<span className="flex items-center gap-3">Live {!paused && <span className="live-dot" />}</span>}
        sub={paused ? 'Paused' : 'Updates every few seconds'}
        right={<Button variant="soft" size="sm" onClick={() => setPaused(!paused)}>{paused ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Pause</>}</Button>}
      />
      <div className="flex flex-wrap gap-2">
        {CATS.map((c) => (
          <button key={c.v} onClick={() => toggle(c.v)} aria-pressed={cats.includes(c.v)}
            className={cx('h-8 rounded-full border px-3 text-sm font-semibold transition cursor-pointer', cats.includes(c.v) ? 'border-ink bg-ink text-on-ink' : 'border-line text-muted hover:text-ink')}>
            {c.l}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <Panel pad={false} className={cx(q.isPlaceholderData && 'refetching')}>
          {q.data ? <FeedList items={items} who={people} groups={groups} fresh={fresh} /> : <Spinner />}
          {items.length >= 80 && <div className="border-t border-line p-3 text-center"><Button variant="ghost" size="sm" busy={loading} onClick={more}>Load older</Button></div>}
        </Panel>
        <Panel title="Online now" sub={q.data ? `${q.data.online?.length ?? 0} people · ${q.data.streams ?? 0} open tabs/devices` : undefined} className="self-start">
          {!q.data?.online?.length ? <p className="text-sm text-muted">Nobody has the app open right now.</p> : (
            <ul className="space-y-2">
              {q.data.online.map((p) => (
                <li key={p.id}><Link to={`/admin/users/${p.id}`} className="flex items-center gap-2 text-sm hover:underline">
                  <span className="relative"><Avatar id={p.id} name={p.name} size={28} /><span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-owed ring-2 ring-surface" /></span>
                  <span className="truncate font-semibold">{p.name}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
