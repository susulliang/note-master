import SmartDocsPage from '@/pages/SmartDocsPage';

interface SmartTodosPageProps {
  username: string;
  initialDocumentId?: string;
  onDocumentChange?: (documentId: string | null) => void;
  embedded?: boolean;
}

export default function SmartTodosPage(props: SmartTodosPageProps) {
  return <SmartDocsPage {...props} documentKind="smarttodo" />;
}
