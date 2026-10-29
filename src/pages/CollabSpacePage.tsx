import {
  FileSpreadsheet,
  FolderOpen,
  GitBranch,
  ListTodo,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import SheetsPage from '@/pages/SheetsPage';
import MindmapPage from '@/pages/MindmapPage';
import CollabDrivePage from '@/pages/CollabDrivePage';
import CollabTasksPage from '@/pages/CollabTasksPage';
import './CollabSpacePage.css';
import './CollabToolsPage.css';

interface CollabSpacePageProps {
  username: string;
}

type CollabTab = 'sheets' | 'mindmaps' | 'drive' | 'tasks';

export default function CollabSpacePage({ username }: CollabSpacePageProps) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initialDocumentId = params.get('document') ?? undefined;
  const initialTaskId = params.get('task');
  const initialFileId = params.get('file');
  const initialDriveScope = params.get('scope') === 'personal' ? 'personal' : 'team';
  const [activeTab, setActiveTab] = useState<CollabTab>(
    params.get('type') === 'mindmap'
      ? 'mindmaps'
      : params.get('type') === 'drive'
        ? 'drive'
        : params.get('type') === 'tasks'
          ? 'tasks'
          : 'sheets',
  );
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('type');
    setActiveTab(requested === 'mindmap'
      ? 'mindmaps'
      : requested === 'drive'
        ? 'drive'
        : requested === 'tasks'
          ? 'tasks'
          : 'sheets');
  }, [location.search]);
  const tabs = [
    { id: 'sheets' as const, label: 'Sheets', icon: FileSpreadsheet, group: 'Documents' },
    { id: 'mindmaps' as const, label: 'Mind maps', icon: GitBranch, group: 'Documents' },
    { id: 'drive' as const, label: 'Team Drive', icon: FolderOpen, group: 'Workspace' },
    { id: 'tasks' as const, label: 'Tasks', icon: ListTodo, group: 'Workspace' },
  ];

  return (
    <section className="collab-space-page">
      <aside className="collab-space-sidebar">
        <div className="collab-space-brand">
          <span className="collab-space-brand-icon"><UsersRound className="size-5" /></span>
          <div>
            <p>SHARED WORKSPACE</p>
            <h1>Collab Space</h1>
          </div>
        </div>
        <nav className="collab-space-tabs" aria-label="Collaboration document types">
          {['Documents', 'Workspace'].map((group) => (
            <div key={group} className="collab-nav-group">
              <p>{group}</p>
              {tabs.filter((tab) => tab.group === group).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={activeTab === id ? 'is-active' : ''}
                  aria-pressed={activeTab === id}
                  onClick={() => setActiveTab(id)}
                ><Icon className="size-4" /><span>{label}</span></button>
              ))}
            </div>
          ))}
        </nav>
        <div className="collab-space-sidebar-footer">
          <span className="collab-space-live-dot" />
          <span>Changes sync live</span>
        </div>
      </aside>
      <div className="collab-space-content">
        {activeTab === 'sheets' && <SheetsPage username={username} initialDocumentId={initialDocumentId} />}
        {activeTab === 'mindmaps' && <MindmapPage username={username} initialDocumentId={initialDocumentId} />}
        {activeTab === 'drive' && <CollabDrivePage username={username} initialFileId={initialFileId} initialScope={initialDriveScope} />}
        {activeTab === 'tasks' && <CollabTasksPage username={username} initialTaskId={initialTaskId} />}
      </div>
    </section>
  );
}
