import './globals.css';

// Minimal root layout so the app runs. P2 owns the app shell
// (navigation, login guard, app/(app)/layout.js) and will extend this.
export const metadata = {
  title: 'RemitEase',
  description: 'Send money home with transparent rates.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
