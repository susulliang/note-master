import { FileSpreadsheet, GitBranch, Layers3 } from 'lucide-react';
import { useState } from 'react';
import SheetsPage from '@/pages/SheetsPage';
import MindmapPage from '@/pages/MindmapPage';
import './CollabSpacePage.css';

interface CollabSpacePageProps {
  username: string;
}

type CollabTab = 'sheets' | 'mindmaps';

export default function CollabSpacePage({ username }: CollabSpacePageProps) {
  const params = new URLSearchParams(window.location.search);
  const initialDocumentId = params.get('document') ?? undefined;
  const [activeTab, setActiveTab] = useState<CollabTab>(
    params.get('type') === 'mindmap' ? 'mindmaps' : 'sheets',
  );

  return (
    <section className="collab-space-page">
      <header className="collab-space-header">
        <div className="collab-space-brand">
          <span className="collab-space-brand-icon"><Layers3 className="size-5" /></span>
          <div>
            <p>SHARED WORKSPACE</p>
            <h1>Collab Space</h1>
          </div>
        </div>
        <nav className="collab-space-tabs" aria-label="Collaboration document types">
          <button
            type="button"
            className={activeTab === 'sheets' ? 'is-active' : ''}
            aria-pressed={activeTab === 'sheets'}
            onClick={() => setActiveTab('sheets')}
          ><FileSpreadsheet className="size-4" /> Sheets</button>
          <button
            type="button"
            className={activeTab === 'mindmaps' ? 'is-active' : ''}
            aria-pressed={activeTab === 'mindmaps'}
            onClick={() => setActiveTab('mindmaps')}
          ><GitBranch className="size-4" /> Mind maps</button>
        </nav>
      </header>
      <div className="collab-space-content">
        {activeTab === 'sheets'
          ? <SheetsPage username={username} initialDocumentId={initialDocumentId} />
          : <MindmapPage username={username} initialDocumentId={initialDocumentId} />}
      </div>
    </section>
  );
}
