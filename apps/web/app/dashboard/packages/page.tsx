import { redirect } from 'next/navigation';

export default function LegacySubscriptionRoute() {
  redirect('/dashboard/subscription?tab=plans');
}
