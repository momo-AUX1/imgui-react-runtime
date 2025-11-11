import React, { useState } from 'react';

export function App() {
  const [count, setCount] = useState(0);

  return (
    <window title="My React + ImGui App" defaultX={20} defaultY={20}>
      <text>Welcome to your new React + ImGui application!</text>
      <separator />
      <button onClick={() => setCount(count + 1)}>
        Click me!
      </button>
      <text>Button clicked {count} times</text>
    </window>
  );
}
