import AuthPanel from '@/components/AuthPanel';

interface LoginPageProps {
  onLoginComplete: () => void;
}

export default function LoginPage({ onLoginComplete }: LoginPageProps) {
  return <AuthPanel presentation="page" required onClose={onLoginComplete} />;
}
