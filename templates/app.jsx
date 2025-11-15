import React, { useState } from 'react';
import { Window, Text, Separator, Button, Root } from 'react-imgui';

export function App() {
  const [count, setCount] = useState(0);

  return (
    <Root>
      <Window title="My React + ImGui App" defaultX={20} defaultY={20}>
        <Text>Welcome to your new React + ImGui application!</Text>
        <Separator />
        <Button onClick={() => setCount(count + 1)}>
          Click me!
        </Button>
        <Text>Button clicked {count} times</Text>
      </Window>
    </Root>
  );
}
