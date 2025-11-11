// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

// React application demonstrating various ImGui components
import React, { useState } from 'react';
import {
  Root,
  Window,
  Rect,
  Circle,
  Text,
  SameLine,
  Button,
  Separator,
  Group,
  Indent,
  CollapsingHeader,
} from 'react-imgui';
import { StockTable } from './StockTable.jsx';
import { BouncingBall } from './BouncingBall.jsx';
import { ControlledWindow } from './ControlledWindow.jsx';

export function App() {
  const [counter1, setCounter1] = useState(0);
  const [counter2, setCounter2] = useState(0);

  console.debug('App rendering, counter1 =', counter1, 'counter2 =', counter2);

  return (
    <Root>
      {/* Background decorations - rendered first, behind windows */}
      <Rect x={10} y={10} width={150} height={100} color="#3030A0C0" filled={true} />
      <Rect x={200} y={400} width={180} height={80} color="#A03030C0" filled={true} />
      <Circle x={700} y={500} radius={60} color="#30A030C0" filled={true} segments={32} />
      <Circle x={900} y={100} radius={40} color="#A0A030C0" filled={true} segments={24} />

      {/* Status bar at the top */}
      <Rect x={0} y={0} width={1200} height={25} color="#00000080" filled={true} />
      <Text color="#00FF00">React + ImGui Showcase</Text>
      <SameLine />
      <Text color="#FFFF00">  |  Counters: {counter1} / {counter2}</Text>
      <SameLine />
      <Text color="#00FFFF">  |  Total clicks: {counter1 + counter2}</Text>

      {/* All the existing windows */}
      <BouncingBall />
      <StockTable />
      <ControlledWindow />

      <Window title="Hello from React!" defaultX={20} defaultY={40}>
        <Text>This is a React component rendering to ImGui</Text>
        <Text>React's reconciler is working perfectly!</Text>

        <Separator />

        <Button onClick={() => setCounter1(counter1 + 1)}>
          Click me!
        </Button>
        <SameLine />
        <Text>Button clicked {counter1} times</Text>
      </Window>

      <Window title="Component Playground" defaultX={650} defaultY={40}>
        <Text color="#00FFFF">Welcome to the React + ImGui demo!</Text>

        <Separator />

        <Group>
          <Text color="#FFFF00">Counter Demo:</Text>
          <Button onClick={() => setCounter2(counter2 + 1)}>
            Increment
          </Button>
          <SameLine />
          <Button onClick={() => setCounter2(counter2 - 1)}>
            Decrement
          </Button>
          <SameLine />
          <Button onClick={() => setCounter2(0)}>
            Reset
          </Button>
          <Text color={counter2 === 0 ? "#888888" : "#FFFFFF"}>
            Current value: {counter2}
          </Text>
        </Group>

        <Separator />

        <Group>
          <Text color="#FFFF00">Quick Math:</Text>
          <Indent>
            <Text color="#00FF00">Counter x 2 = {counter2 * 2}</Text>
            <Text color="#00FF00">Counter squared = {counter2 * counter2}</Text>
            <Text color="#00FFFF">Counter is {counter2 % 2 === 0 ? 'EVEN' : 'ODD'}</Text>
          </Indent>
        </Group>

        <Separator />

        <Group>
          <Text color="#FFFF00">Status Indicators:</Text>
          <Indent>
            <Text color={counter2 > 10 ? "#FF4444" : "#4444FF"}>
              {counter2 > 10 ? '[HOT] Counter is high!' : '[COOL] Counter is low'}
            </Text>
            <Text color={counter2 < 0 ? "#FFAA00" : "#00FF00"}>
              {counter2 < 0 ? '[WARN] Negative territory!' : '[OK] Positive vibes'}
            </Text>
          </Indent>
        </Group>

        <Separator />

        <CollapsingHeader title="Architecture Info">
          <Text>React 19.2.0 with custom reconciler</Text>
          <Text>Static Hermes (typed + untyped units)</Text>
          <Text>Zero-overhead FFI to DearImGui</Text>
          <Text>Event loop with setTimeout/Promises</Text>
          <Text color="#FF00FF">Root component for fullscreen canvas!</Text>
        </CollapsingHeader>

        <Separator />

        <Text>Quick Actions:</Text>
        <Button onClick={() => setCounter2(Math.floor(Math.random() * 100))}>
          Random (0-99)
        </Button>
        <SameLine />
        <Button onClick={() => setCounter2(counter2 + 10)}>
          +10
        </Button>
        <SameLine />
        <Button onClick={() => setCounter2(counter2 - 10)}>
          -10
        </Button>
      </Window>

      {/* Footer info bar */}
      <Rect x={0} y={575} width={1200} height={25} color="#00000080" filled={true} />
      <Text color="#888888">Root component demo - Background shapes and overlay elements render behind/above all windows</Text>
    </Root>
  );
}
