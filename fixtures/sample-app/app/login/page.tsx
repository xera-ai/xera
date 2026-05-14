'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }),
    });
    if (res.ok) window.location.href = '/dashboard';
    else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Login failed');
    }
  };
  return (
    <main>
      <h1>Sign in</h1>
      <form onSubmit={submit}>
        <label>Email <input name="email" type="email" /></label>
        <label>Password <input name="password" type="password" /></label>
        <button type="submit">Sign in</button>
      </form>
      {error && <div role="alert">{error}</div>}
    </main>
  );
}
