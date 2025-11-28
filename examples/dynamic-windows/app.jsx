// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

import React, { useState } from 'react';
import { Window, Text, Separator, Button } from 'react-imgui';

export function App() {
  const [windows, setWindows] = useState([
    { id: 1, title: 'Window 1' },
    { id: 2, title: 'Window 2' },
  ]);
  const [nextId, setNextId] = useState(3);

  const addWindow = () => {
    setWindows([...windows, { id: nextId, title: `Window ${nextId}` }]);
    setNextId(nextId + 1);
  };

  const closeWindow = (windowId) => {
    setWindows(windows.filter((w) => w.id !== windowId));
  };

  return (
    <>
      <Window title="Control Panel" defaultX={20} defaultY={20} defaultWidth={300} defaultHeight={150}>
        <Text color="#FFFF00">Dynamic Window Manager</Text>
        <Separator />
        <Text>Total windows: {windows.length}</Text>
        <Button onClick={addWindow}>Add New Window</Button>
        <Separator />
        <Text color="#888888">Click the X button on any window to close it</Text>
      </Window>

      {windows.map(w => (
        <Window
          key={w.id}
          title={w.title}
          defaultX={100 + w.id * 30}
          defaultY={100 + w.id * 30}
          defaultWidth={400}
          defaultHeight={200}
          onClose={() => closeWindow(w.id)}
        >
          <Text color="#00FFFF">This is {w.title}</Text>
          <Separator />
          <Text>Window ID: {w.id}</Text>
          <Text>Click the X button in the title bar to close this window</Text>
          <Separator />
          <Text color="#00FF00">Each window can be closed independently</Text>
        </Window>
      ))}
    </>
  );
}
