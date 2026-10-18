import { redirect } from 'next/navigation';

// Landing page: go straight to Home. P2 may replace this with a login check.
export default function Index() {
  redirect('/home');
}
