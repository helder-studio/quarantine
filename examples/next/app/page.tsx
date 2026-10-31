import { Demo } from './demo';

export default function Page() {
  return (
    <main>
      <h1>@helder-studio/quarantine</h1>
      <p>
        Crash the widget 3 times within a minute and it switches off for 30 seconds, even across
        reloads. The rest of the page keeps working.
      </p>
      <Demo />
    </main>
  );
}
