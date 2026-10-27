import { API_VERSION } from '@mqi/shared';

export function App() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 p-4">
      <h1 className="text-2xl text-brand">TCF MQI Survey</h1>
      <p className="text-ink-soft">API v{API_VERSION}</p>
    </main>
  );
}
