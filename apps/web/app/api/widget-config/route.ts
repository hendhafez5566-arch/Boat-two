import { NextResponse } from 'next/server';

export function GET() {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const scriptUrl = base.replace(/\/$/, '') + '/widget.js?v=preview-startup-3';
  return NextResponse.json({ scriptUrl });
}
