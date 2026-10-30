import {
  FileSpreadsheet,
  FileText,
  FolderOpen,
  GitBranch,
  ListTodo,
  CheckSquare2,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SheetsPage from '@/pages/SheetsPage';
import MindmapPage from '@/pages/MindmapPage';
import CollabDrivePage from '@/pages/CollabDrivePage';
import CollabTasksPage from '@/pages/CollabTasksPage';
import SmartDocsPage from '@/pages/SmartDocsPage';
import SmartTodosPage from '@/pages/SmartTodosPage';
import { rememberRecentCollabResource } from '@/lib/workspace-recent';
import './CollabSpacePage.css';
import './CollabToolsPage.css';

interface CollabSpacePageProps {
  username: string;
}

type CollabTab = 'sheets' | 'mindmaps' | 'smartdocs' | 'smarttodos' | 'drive' | 'tasks';

export default function CollabSpacePage({ username }: CollabSpacePageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;
  const params = new URLSearchParams(location.search);
  const initialDocumentId = params.get('document') ?? undefined;
  const initialTaskId = params.get('task');
  const initialFileId = params.get('file');
  const initialDriveScope = params.get('scope') === 'personal' ? 'personal' : 'team';
  const [activeTab, setActiveTab] = useState<CollabTab>(
    params.get('type') === 'smarttodo'
      ? 'smarttodos'
      : params.get('type') === 'smartdocs' || params.get('type') === 'smartdoc'
      ? 'smartdocs'
      : params.get('type') === 'mindmap'
      ? 'mindmaps'
      : params.get('type') === 'drive'
        ? 'drive'
        : params.get('type') === 'tasks'
          ? 'tasks'
          : 'sheets',
  );
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('type');
    setActiveTab(requested === 'smarttodo'
      ? 'smarttodos'
      : requested === 'smartdocs' || requested === 'smartdoc'
      ? 'smartdocs'
      : requested === 'mindmap'
      ? 'mindmaps'
      : requested === 'drive'
        ? 'drive'
        : requested === 'tasks'
          ? 'tasks'
          : 'sheets');
  }, [location.search]);
  useEffect(() => {
    if (location.pathname === '/collab') rememberRecentCollabResource(username, location.search);
  }, [location.pathname, location.search, username]);

  const commitRoute = useCallback((next: URLSearchParams) => {
    const current = locationRef.current;
    const search = next.toString();
    const target = `/collab${search ? `?${search}` : ''}`;
    if (`${current.pathname}${current.search}` !== target) navigate(target);
  }, [navigate]);

  const selectTab = useCallback((tab: CollabTab) => {
    const params = new URLSearchParams();
    params.set('type', tab === 'smarttodos' ? 'smarttodo' : tab === 'smartdocs' ? 'smartdoc' : tab === 'mindmaps' ? 'mindmap' : tab);
    commitRoute(params);
  }, [commitRoute]);

  const onDocumentChange = useCallback((type: 'sheet' | 'mindmap' | 'smartdoc' | 'smarttodo', documentId: string | null) => {
    const params = new URLSearchParams(locationRef.current.search);
    params.set('type', type);
    params.delete('file');
    params.delete('task');
    params.delete('scope');
    if (documentId) params.set('document', documentId);
    else params.delete('document');
    commitRoute(params);
    if (documentId) rememberRecentCollabResource(username, params.toString());
  }, [commitRoute, username]);

  const onDriveFileChange = useCallback((fileId: string | null, scope: 'team' | 'personal') => {
    const params = new URLSearchParams(locationRef.current.search);
    params.set('type', 'drive');
    params.set('scope', scope);
    params.delete('document');
    params.delete('task');
    if (fileId) params.set('file', fileId);
    else params.delete('file');
    commitRoute(params);
    if (fileId) rememberRecentCollabResource(username, params.toString());
  }, [commitRoute, username]);
  const onSheetChange = useCallback((id: string | null) => onDocumentChange('sheet', id), [onDocumentChange]);
  const onMindmapChange = useCallback((id: string | null) => onDocumentChange('mindmap', id), [onDocumentChange]);
  const onSmartDocChange = useCallback((id: string | null) => onDocumentChange('smartdoc', id), [onDocumentChange]);
  const onSmartTodoChange = useCallback((id: string | null) => onDocumentChange('smarttodo', id), [onDocumentChange]);
  const tabs = [
    { id: 'sheets' as const, label: 'Sheets', icon: FileSpreadsheet, group: 'Documents' },
    { id: 'mindmaps' as const, label: 'Mind maps', icon: GitBranch, group: 'Documents' },
    { id: 'smartdocs' as const, label: 'Smart Docs', icon: FileText, group: 'Documents' },
    { id: 'smarttodos' as const, label: 'Smart Todos', icon: CheckSquare2, group: 'Documents' },
    { id: 'drive' as const, label: 'Team Drive', icon: FolderOpen, group: 'Workspace' },
    { id: 'tasks' as const, label: 'Tasks and Calendar', icon: ListTodo, group: 'Workspace' },
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
                  onClick={() => {
                    setActiveTab(id);
                    selectTab(id);
                  }}
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
        {activeTab === 'sheets' && <SheetsPage username={username} initialDocumentId={initialDocumentId} onDocumentChange={onSheetChange} />}
        {activeTab === 'mindmaps' && <MindmapPage username={username} initialDocumentId={initialDocumentId} onDocumentChange={onMindmapChange} />}
        {activeTab === 'smartdocs' && <SmartDocsPage username={username} initialDocumentId={initialDocumentId} onDocumentChange={onSmartDocChange} />}
        {activeTab === 'smarttodos' && <SmartTodosPage username={username} initialDocumentId={initialDocumentId} onDocumentChange={onSmartTodoChange} />}
        {activeTab === 'drive' && <CollabDrivePage username={username} initialFileId={initialFileId} initialScope={initialDriveScope} onFileChange={onDriveFileChange} />}
        {activeTab === 'tasks' && <CollabTasksPage username={username} initialTaskId={initialTaskId} />}
      </div>
    </section>
  );
}
