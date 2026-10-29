import {
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  ListTodo,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  createCollabTask,
  deleteCollabTask,
  findChatUsers,
  listCollabTasks,
  setCollabTaskCompleted,
  type ChatUser,
  type CollabTask,
} from '@/lib/chat-client';

interface CollabTasksPageProps {
  username: string;
  initialTaskId?: string | null;
}

type TaskScope = 'team' | 'personal';

function dueLabel(timestamp: number | null): { text: string; tone: string } {
  if (!timestamp) return { text: 'No due date', tone: 'neutral' };
  const due = new Date(timestamp);
  const today = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;
  const prefix = dueDay < todayDay ? 'Overdue' : dueDay === todayDay ? 'Today' : dueDay === todayDay + day ? 'Tomorrow' : due.toLocaleDateString();
  return {
    text: `${prefix} · ${due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`,
    tone: dueDay < todayDay ? 'overdue' : dueDay === todayDay ? 'today' : 'neutral',
  };
}

export default function CollabTasksPage({ username, initialTaskId = null }: CollabTasksPageProps) {
  const [scope, setScope] = useState<TaskScope>('team');
  const [tasks, setTasks] = useState<CollabTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [assignee, setAssignee] = useState(username);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [userResults, setUserResults] = useState<ChatUser[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<ChatUser[]>([]);

  const refresh = useCallback(async () => {
    try {
      setTasks(await listCollabTasks());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!initialTaskId || loading) return;
    const task = tasks.find((item) => item.id === initialTaskId);
    if (task) setScope(task.scope);
    requestAnimationFrame(() => document.getElementById(initialTaskId)?.scrollIntoView({ block: 'center' }));
  }, [initialTaskId, loading, tasks]);

  useEffect(() => {
    if (!createOpen || !assigneeQuery.trim()) {
      setUserResults([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      void findChatUsers(assigneeQuery.trim())
        .then((users) => { if (alive) setUserResults(users); })
        .catch(() => undefined);
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [assigneeQuery, createOpen]);

  useEffect(() => {
    if (!createOpen || mentionQuery === null) {
      setMentionResults([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      void findChatUsers(mentionQuery)
        .then((users) => { if (alive) setMentionResults(users); })
        .catch(() => undefined);
    }, 160);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [createOpen, mentionQuery]);

  const insertTaskMention = (person: ChatUser) => {
    setDescription((current) => current.replace(
      /(^|\s)@[\w.-]*$/,
      (_match, prefix: string) => `${prefix}@${person.username} `,
    ));
    setMentionQuery(null);
  };

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return tasks.filter((task) => (
      (task.scope === scope || task.mentions.some((name) => name.toLowerCase() === username.toLowerCase())) &&
      (!needle || `${task.title} ${task.description} ${task.owner} ${task.assignee}`.toLocaleLowerCase().includes(needle))
    ));
  }, [query, scope, tasks, username]);

  const sections = useMemo(() => {
    const now = new Date();
    const active = visibleTasks.filter((task) => !task.completedAt);
    const completed = visibleTasks.filter((task) => !!task.completedAt);
    return [
      { id: 'overdue', title: 'Overdue', items: active.filter((task) => !!task.dueAt && task.dueAt < now.getTime()) },
      { id: 'today', title: 'Today & upcoming', items: active.filter((task) => !task.dueAt || task.dueAt >= now.getTime()).sort((a, b) => (
        (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER)
      )) },
      { id: 'completed', title: 'Completed', items: completed },
    ].filter((section) => section.items.length > 0 || section.id === 'today');
  }, [visibleTasks]);

  const submitTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    try {
      setSaving(true);
      await createCollabTask({
        title: title.trim(),
        description: description.trim(),
        scope,
        assignee,
        dueAt: dueAt ? new Date(dueAt).getTime() : null,
      });
      setTitle('');
      setDescription('');
      setDueAt('');
      setAssignee(username);
      setAssigneeQuery('');
      setCreateOpen(false);
      await refresh();
      toast.success(scope === 'team' ? 'Shared task created.' : 'Personal task created.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create this task.');
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = async (task: CollabTask) => {
    const completed = !task.completedAt;
    setTasks((current) => current.map((item) => item.id === task.id
      ? { ...item, completedAt: completed ? Date.now() : null }
      : item));
    try {
      await setCollabTaskCompleted(task.id, completed);
    } catch (error) {
      await refresh();
      toast.error(error instanceof Error ? error.message : 'Could not update this task.');
    }
  };

  const removeTask = async (task: CollabTask) => {
    if (task.owner.toLowerCase() !== username.toLowerCase()) return;
    if (!window.confirm(`Delete “${task.title}”?`)) return;
    try {
      await deleteCollabTask(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete this task.');
    }
  };

  return (
    <section className="collab-tool-page collab-tasks-page">
      <header className="collab-tool-header">
        <div>
          <p className="collab-tool-eyebrow">Shared follow-through</p>
          <h2>Tasks</h2>
          <p className="collab-tool-subtitle">Personal reminders and team-owned actions, with dates and mentions.</p>
        </div>
        <button type="button" className="collab-tool-primary" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New task
        </button>
      </header>

      <div className="collab-tasks-controls">
        <div className="collab-segmented" aria-label="Task list">
          {(['team', 'personal'] as const).map((item) => (
            <button key={item} type="button" aria-pressed={scope === item} onClick={() => setScope(item)}>
              {item === 'team' ? <Users className="size-3.5" /> : <ListTodo className="size-3.5" />}
              {item === 'team' ? 'Team tasks' : 'My tasks'}
            </button>
          ))}
        </div>
        <label className="collab-drive-search">
          <Search className="size-4" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter tasks" />
        </label>
        <span className="collab-tasks-count">{visibleTasks.length} tasks</span>
      </div>

      <div className="collab-task-board">
        {loading && <p className="collab-tool-empty">Loading tasks…</p>}
        {!loading && visibleTasks.length === 0 && (
          <div className="collab-task-empty">
            <span><CheckCircle2 className="size-6" /></span>
            <strong>{query ? 'No matching tasks' : scope === 'team' ? 'A clear team queue' : 'Nothing on your list'}</strong>
            <p>{query ? 'Try a different search.' : 'Add an action with an owner and due time when the team needs to follow up.'}</p>
            {!query && <button type="button" className="collab-tool-primary" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Add a task</button>}
          </div>
        )}
        {sections.map((section) => section.items.length > 0 && (
          <section key={section.id} className={`collab-task-section is-${section.id}`}>
            <h3>{section.title}<span>{section.items.length}</span></h3>
            {section.items.map((task) => {
              const due = dueLabel(task.dueAt);
              return (
                <article key={task.id} id={task.id === initialTaskId ? 'collab-task-highlight' : undefined} className={`collab-task-card ${task.completedAt ? 'is-complete' : ''}`}>
                  <button type="button" className="collab-task-check" aria-label={task.completedAt ? 'Mark task incomplete' : 'Complete task'} onClick={() => void toggleComplete(task)}>
                    {task.completedAt ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
                  </button>
                  <div className="collab-task-copy">
                    <h4>{task.title}</h4>
                    {task.description && <p>{task.description}</p>}
                    <div className="collab-task-meta">
                      <span className={`collab-task-due is-${due.tone}`}>
                        {task.dueAt ? <CalendarClock className="size-3.5" /> : <Clock3 className="size-3.5" />}
                        {due.text}
                      </span>
                      <span>{task.scope === 'team' ? 'Team' : 'Personal'} · {task.owner === task.assignee ? task.owner : `Assigned to ${task.assignee}`}</span>
                      {task.mentions.map((name) => <span key={name} className="collab-task-mention">@{name}</span>)}
                    </div>
                  </div>
                  {task.owner.toLowerCase() === username.toLowerCase() && (
                    <button type="button" className="collab-tool-icon is-danger" aria-label={`Delete ${task.title}`} onClick={() => void removeTask(task)}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>

      {createOpen && (
        <div className="collab-tool-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCreateOpen(false);
        }}>
          <form className="collab-tool-modal" onSubmit={(event) => void submitTask(event)}>
            <header>
              <div><p className="collab-tool-eyebrow">A clear next step</p><h3>New task</h3></div>
              <button type="button" className="collab-tool-icon" aria-label="Close task form" onClick={() => setCreateOpen(false)}><X className="size-4" /></button>
            </header>
            <label>Task title
              <input autoFocus maxLength={200} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Send the replacement tracking number" />
            </label>
            <label>Details and mentions
              <textarea
                maxLength={8_000}
                rows={4}
                value={description}
                onChange={(event) => {
                  const value = event.target.value;
                  setDescription(value);
                  const match = /(?:^|\s)@([\w.-]*)$/.exec(value);
                  setMentionQuery(match ? match[1] : null);
                }}
                placeholder="Add context. Type @username to notify a teammate."
              />
              {mentionQuery !== null && (
                <div className="collab-task-mention-options">
                  {mentionResults.slice(0, 7).map((person) => (
                    <button key={person.username} type="button" onClick={() => insertTaskMention(person)}>
                      @{person.username}<Check className="size-3.5" />
                    </button>
                  ))}
                  {!mentionResults.length && <p>No matching teammates.</p>}
                </div>
              )}
            </label>
            <div className="collab-task-form-row">
              <label>Due date & time
                <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
              </label>
              <label>Assignee
                <select value={assignee} onChange={(event) => setAssignee(event.target.value)} disabled={scope === 'personal'}>
                  <option value={username}>{username} (me)</option>
                  {userResults.map((person) => <option key={person.username} value={person.username}>{person.username}</option>)}
                </select>
              </label>
            </div>
            <label className="collab-task-assignee-search">Find another assignee
              <input value={assigneeQuery} onChange={(event) => setAssigneeQuery(event.target.value)} placeholder={scope === 'personal' ? 'Personal tasks stay with you' : 'Search teammates'} disabled={scope === 'personal'} />
              {assigneeQuery && userResults.length > 0 && (
                <div className="collab-task-assignee-options">
                  {userResults.map((person) => (
                    <button key={person.username} type="button" onClick={() => { setAssignee(person.username); setAssigneeQuery(''); }}>
                      {person.username}<Check className="size-3.5" />
                    </button>
                  ))}
                </div>
              )}
            </label>
            <div className="collab-task-scope-choice">
              <button type="button" aria-pressed={scope === 'personal'} onClick={() => { setScope('personal'); setAssignee(username); setAssigneeQuery(''); }}>Personal</button>
              <button type="button" aria-pressed={scope === 'team'} onClick={() => setScope('team')}>Shared with team</button>
            </div>
            <p className="collab-task-form-hint">Use @username in the details to notify teammates mentioned in this task.</p>
            <footer>
              <button type="button" className="collab-tool-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit" className="collab-tool-primary" disabled={!title.trim() || saving}>{saving ? 'Saving…' : 'Create task'}</button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
