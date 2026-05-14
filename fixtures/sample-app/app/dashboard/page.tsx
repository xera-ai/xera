import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const c = await cookies();
  const session = c.get('session');
  if (!session) redirect('/login');
  return (
    <main>
      <h1>Dashboard</h1>
      <p>Welcome, {session.value}</p>
    </main>
  );
}
