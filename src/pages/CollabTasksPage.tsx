import {
  Bell,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
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
import { getRoster, ROSTER_MONTHS } from '@/data/roster-index';
import { isWorkedShift } from '@/lib/roster-shifts';
import { getLiveCell, useRosterLiveVersion } from '@/lib/roster-live';
import { fetchRosterMonth, subscribeRosterMonth, type RosterCell } from '@/lib/roster-sync';
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
type CalendarView = 'calendar' | 'list';
type TaskKind = 'task' | 'reminder';

const DAY_HOURS = Array.from({ length: 24 }, (_value, hour) => hour);

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfWeek(date: Date): Date {
  const dayOffset = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - dayOffset);
}

function dateTimeLocalValue(date: Date): string {
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function hourLabel(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

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
  const [view, setView] = useState<CalendarView>('calendar');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [tasks, setTasks] = useState<CollabTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [kind, setKind] = useState<TaskKind>('task');
  const [assignee, setAssignee] = useState(username);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [userResults, setUserResults] = useState<ChatUser[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<ChatUser[]>([]);
  const [rosterCells, setRosterCells] = useState<Record<string, string>>({});
  const rosterLiveVersion = useRosterLiveVersion();
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_value, index) => (
    new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index)
  )), [weekStart]);
  const rosterMonthKeys = useMemo(
    () => [...new Set(weekDays.map((day) => dateKey(day).slice(0, 7)))],
    [weekDays],
  );

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
    if (task) {
      setScope(task.scope);
      setView('list');
    }
    requestAnimationFrame(() => document.getElementById(initialTaskId)?.scrollIntoView({ block: 'center' }));
  }, [initialTaskId, loading, tasks]);

  useEffect(() => {
    let alive = true;
    const mergeRosterCells = (cells: RosterCell[]) => {
      setRosterCells((current) => {
        const next = { ...current };
        for (const cell of cells) next[`${cell.en}|${cell.iso}`] = cell.code;
        return next;
      });
    };
    const unsubscribers = rosterMonthKeys.map((monthKey) => {
      void fetchRosterMonth(monthKey).then((cells) => {
        if (alive && cells.length) mergeRosterCells(cells);
      });
      return subscribeRosterMonth(monthKey, {
        onCell: (cell) => { if (alive) mergeRosterCells([cell]); },
        onCells: (cells) => { if (alive) mergeRosterCells(cells); },
      });
    });
    return () => {
      alive = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [rosterMonthKeys]);

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

  const workerTagsByDay = useMemo(() => {
    const latestRoster = getRoster(ROSTER_MONTHS[ROSTER_MONTHS.length - 1] ?? '');
    return new Map(weekDays.map((day) => {
      const iso = dateKey(day);
      const monthKey = iso.slice(0, 7);
      const agents = getRoster(monthKey) ?? latestRoster ?? [];
      const agentByName = new Map(agents.map((agent) => [agent.en, agent]));
      const names = new Set(agentByName.keys());
      Object.keys(rosterCells).forEach((key) => {
        if (key.endsWith(`|${iso}`)) names.add(key.slice(0, -(iso.length + 1)));
      });
      const workers = [...names].flatMap((name) => {
        const key = `${name}|${iso}`;
        const code = getLiveCell(monthKey, key)?.code
          ?? rosterCells[key]
          ?? agentByName.get(name)?.shifts[iso]
          ?? '';
        return isWorkedShift(code) ? [{ name, code }] : [];
      });
      return [iso, workers] as const;
    }));
  }, [rosterCells, rosterLiveVersion, weekDays]);

  const tasksBySlot = useMemo(() => {
    const slots = new Map<string, CollabTask[]>();
    for (const task of visibleTasks) {
      if (task.dueAt === null) continue;
      const due = new Date(task.dueAt);
      const key = `${dateKey(due)}|${due.getHours()}`;
      slots.set(key, [...(slots.get(key) ?? []), task]);
    }
    for (const slot of slots.values()) slot.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
    return slots;
  }, [visibleTasks]);

  const weekLabel = `${weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const openCalendarSlot = (day: Date, hour: number) => {
    const due = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0);
    setDueAt(dateTimeLocalValue(due));
    setKind('task');
    setTitle('');
    setDescription('');
    setAssignee(username);
    setCreateOpen(true);
  };
  const openNewTask = () => {
    setTitle('');
    setDescription('');
    setDueAt('');
    setKind('task');
    setAssignee(username);
    setAssigneeQuery('');
    setCreateOpen(true);
  };

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
        kind,
      });
      setTitle('');
      setDescription('');
      setDueAt('');
      setKind('task');
      setAssignee(username);
      setAssigneeQuery('');
      setCreateOpen(false);
      await refresh();
      toast.success(kind === 'reminder'
        ? scope === 'team' ? 'Shared reminder created.' : 'Personal reminder created.'
        : scope === 'team' ? 'Shared task created.' : 'Personal task created.');
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
          <h2>Tasks and Calendar</h2>
          <p className="collab-tool-subtitle">A shared week view for tasks, reminders, and the working roster.</p>
        </div>
        <button type="button" className="collab-tool-primary" onClick={openNewTask}>
          <Plus className="size-4" /> New task or reminder
        </button>
      </header>

      <div className="collab-tasks-controls">
        <div className="collab-segmented" aria-label="Task scope">
          {(['team', 'personal'] as const).map((item) => (
            <button key={item} type="button" aria-pressed={scope === item} onClick={() => setScope(item)}>
              {item === 'team' ? <Users className="size-3.5" /> : <ListTodo className="size-3.5" />}
              {item === 'team' ? 'Team tasks' : 'My tasks'}
            </button>
          ))}
        </div>
        <div className="collab-task-view-toggle" aria-label="Task view">
          <button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>
            <CalendarClock className="size-3.5" /> Calendar
          </button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
            <ListTodo className="size-3.5" /> List
          </button>
        </div>
        <label className="collab-drive-search">
          <Search className="size-4" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter tasks" />
        </label>
        <span className="collab-tasks-count">{visibleTasks.length} tasks</span>
      </div>

      {view === 'calendar' ? (
        <div className="collab-calendar-view">
          <div className="collab-calendar-toolbar">
            <div className="collab-calendar-week-nav">
              <button type="button" aria-label="Previous week" onClick={() => setWeekStart((current) => (
                new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7)
              ))}><ChevronLeft className="size-4" /></button>
              <h3>{weekLabel}</h3>
              <button type="button" aria-label="Next week" onClick={() => setWeekStart((current) => (
                new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7)
              ))}><ChevronRight className="size-4" /></button>
              <button type="button" className="collab-calendar-today" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
            </div>
            <span>{loading ? 'Loading shared tasks…' : 'Select a time slot to add a task or reminder'}</span>
          </div>
          <div className="collab-calendar-scroll">
            {weekDays.map((day) => {
              const iso = dateKey(day);
              const workers = workerTagsByDay.get(iso) ?? [];
              const dayTasks = visibleTasks.filter((task) => (
                task.dueAt !== null && dateKey(new Date(task.dueAt)) === iso
              ));
              const today = iso === dateKey(new Date());
              return (
                <section className="collab-calendar-day" key={iso}>
                  <header className="collab-calendar-day-header">
                    <div className="collab-calendar-day-title">
                      <span>{day.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                      <strong>{day.getDate()}</strong>
                      <small>{day.toLocaleDateString(undefined, { month: 'short' })}</small>
                      {today && <em>Today</em>}
                    </div>
                    <div className="collab-calendar-workers" aria-label={`${workers.length} people working`}>
                      {workers.slice(0, 6).map((worker) => (
                        <span key={worker.name} title={`${worker.name} · ${worker.code}`}>
                          {worker.name.split(/\s+/)[0]} <b>{worker.code}</b>
                        </span>
                      ))}
                      {workers.length > 6 && <small>+{workers.length - 6}</small>}
                      {!workers.length && <small>No roster shifts</small>}
                    </div>
                    <span className="collab-calendar-day-count">{dayTasks.length} scheduled</span>
                  </header>
                  <div className="collab-calendar-time-grid">
                    {DAY_HOURS.map((hour) => {
                      const slotTasks = tasksBySlot.get(`${iso}|${hour}`) ?? [];
                      return (
                        <div className="collab-calendar-time-row" key={hour}>
                          <time>{hourLabel(hour)}</time>
                          <div className="collab-calendar-slot">
                            {slotTasks.map((task) => (
                              <article
                                className={`collab-calendar-entry ${task.completedAt ? 'is-complete' : ''} ${task.kind === 'reminder' ? 'is-reminder' : ''}`}
                                key={task.id}
                                title={task.description || task.title}
                              >
                                <button
                                  type="button"
                                  aria-label={task.completedAt ? 'Mark incomplete' : 'Complete'}
                                  onClick={() => void toggleComplete(task)}
                                >
                                  {task.completedAt
                                    ? <CheckCircle2 className="size-3.5" />
                                    : task.kind === 'reminder'
                                      ? <Bell className="size-3.5" />
                                      : <Circle className="size-3.5" />}
                                </button>
                                <span><strong>{task.title}</strong><small>{task.kind === 'reminder' ? 'Reminder' : 'Task'} · {task.assignee}</small></span>
                                {task.owner.toLowerCase() === username.toLowerCase() && (
                                  <button type="button" aria-label={`Delete ${task.title}`} onClick={() => void removeTask(task)}>
                                    <X className="size-3" />
                                  </button>
                                )}
                              </article>
                            ))}
                            <button
                              type="button"
                              className="collab-calendar-add-slot"
                              aria-label={`Add a task or reminder on ${day.toLocaleDateString()} at ${hourLabel(hour)}`}
                              title="Add a task or reminder"
                              onClick={() => openCalendarSlot(day, hour)}
                            ><Plus className="size-3.5" /><span>Add</span></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          {visibleTasks.some((task) => task.dueAt === null) && (
            <p className="collab-calendar-unscheduled">
              {visibleTasks.filter((task) => task.dueAt === null).length} unscheduled items are in the List view.
            </p>
          )}
        </div>
      ) : (
        <div className="collab-task-board">
          {loading && <p className="collab-tool-empty">Loading tasks…</p>}
          {!loading && visibleTasks.length === 0 && (
            <div className="collab-task-empty">
              <span><CheckCircle2 className="size-6" /></span>
              <strong>{query ? 'No matching tasks' : scope === 'team' ? 'A clear team queue' : 'Nothing on your list'}</strong>
              <p>{query ? 'Try a different search.' : 'Add an action with an owner and due time when the team needs to follow up.'}</p>
              {!query && <button type="button" className="collab-tool-primary" onClick={openNewTask}><Plus className="size-4" /> Add a task</button>}
            </div>
          )}
          {sections.map((section) => section.items.length > 0 && (
            <section key={section.id} className={`collab-task-section is-${section.id}`}>
              <h3>{section.title}<span>{section.items.length}</span></h3>
              {section.items.map((task) => {
                const due = dueLabel(task.dueAt);
                return (
                  <article key={task.id} id={task.id === initialTaskId ? 'collab-task-highlight' : undefined} className={`collab-task-card ${task.completedAt ? 'is-complete' : ''}`}>
                    <button type="button" className="collab-task-check" aria-label={task.completedAt ? 'Mark task incomplete' : task.kind === 'reminder' ? 'Complete reminder' : 'Complete task'} onClick={() => void toggleComplete(task)}>
                      {task.completedAt ? <CheckCircle2 className="size-5" /> : task.kind === 'reminder' ? <Bell className="size-4" /> : <Circle className="size-5" />}
                    </button>
                    <div className="collab-task-copy">
                      <h4>{task.title}</h4>
                      {task.description && <p>{task.description}</p>}
                      <div className="collab-task-meta">
                        <span className={`collab-task-due is-${due.tone}`}>
                          {task.dueAt ? <CalendarClock className="size-3.5" /> : <Clock3 className="size-3.5" />}
                          {due.text}
                        </span>
                        <span>{task.kind === 'reminder' ? 'Reminder' : 'Task'} · {task.scope === 'team' ? 'Team' : 'Personal'} · {task.owner === task.assignee ? task.owner : `Assigned to ${task.assignee}`}</span>
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
      )}

      {createOpen && (
        <div className="collab-tool-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCreateOpen(false);
        }}>
          <form className="collab-tool-modal" onSubmit={(event) => void submitTask(event)}>
            <header>
              <div><p className="collab-tool-eyebrow">A clear next step</p><h3>New {kind === 'reminder' ? 'reminder' : 'task'}</h3></div>
              <button type="button" className="collab-tool-icon" aria-label="Close task form" onClick={() => setCreateOpen(false)}><X className="size-4" /></button>
            </header>
            <label>Task title
              <input autoFocus maxLength={200} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Send the replacement tracking number" />
            </label>
            <label>Entry type
              <select value={kind} onChange={(event) => setKind(event.target.value as TaskKind)}>
                <option value="task">Task</option>
                <option value="reminder">Reminder</option>
              </select>
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
              <button type="submit" className="collab-tool-primary" disabled={!title.trim() || saving}>
                {saving ? 'Saving…' : `Create ${kind === 'reminder' ? 'reminder' : 'task'}`}
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
