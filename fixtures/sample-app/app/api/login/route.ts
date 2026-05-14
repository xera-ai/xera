import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const VALID = { 'alice@example.com': 'ValidPass123!' } as Record<string, string>;

export async function POST(req: Request) {
  const { email, password } = await req.json();
  if (VALID[email] === password) {
    const c = await cookies();
    c.set('session', email.split('@')[0], { httpOnly: true });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
}
