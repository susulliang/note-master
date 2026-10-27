import AdminPanel from '@/components/AdminPanel';

interface AdminPageProps {
  onClose: () => void;
}

export default function AdminPage({ onClose }: AdminPageProps) {
  return <AdminPanel presentation="page" onClose={onClose} />;
}
