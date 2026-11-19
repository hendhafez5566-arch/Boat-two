import { redirect } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const route = await params;
  redirect(`/dashboard/flows/${route.id}`);
}
