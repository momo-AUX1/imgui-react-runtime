// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

// Demonstration of controlled window position/size pattern
import React, { useState } from 'react';
import {
  Window,
  Text,
  Separator,
  Indent,
  Button,
  SameLine,
  CollapsingHeader,
} from 'react-imgui';

export function ControlledWindow() {
  // Controlled window state
  const [windowState, setWindowState] = useState({
    x: 300,
    y: 300,
    width: 350,
    height: 250
  });

  const snapToOrigin = () => {
    setWindowState(prev => ({ ...prev, x: 20, y: 20 }));
  };

  const snapToCenter = () => {
    // Approximate screen center
    setWindowState(prev => ({ ...prev, x: 400, y: 300 }));
  };

  const makeWide = () => {
    setWindowState(prev => ({ ...prev, width: 600, height: 250 }));
  };

  const makeTall = () => {
    setWindowState(prev => ({ ...prev, width: 350, height: 400 }));
  };

  return (
    <Window
      title="Controlled Window Demo"
      x={windowState.x}
      y={windowState.y}
      width={windowState.width}
      height={windowState.height}
      onWindowState={(x, y, width, height) => {
        setWindowState({ x, y, width, height });
      }}
    >
      <Text color="#FFAA00">This window is CONTROLLED by React state</Text>
      <Text>Try moving or resizing it - state updates automatically!</Text>

      <Separator />

      <Text color="#00FFFF">Current State:</Text>
      <Indent>
        <Text>Position: ({Math.round(windowState.x)}, {Math.round(windowState.y)})</Text>
        <Text>Size: {Math.round(windowState.width)} x {Math.round(windowState.height)}</Text>
      </Indent>

      <Separator />

      <Text color="#00FF00">Programmatic Control:</Text>

      <Button onClick={snapToOrigin}>Snap to Origin (20, 20)</Button>
      <Button onClick={snapToCenter}>Snap to Center (400, 300)</Button>

      <Separator />

      <Button onClick={makeWide}>Make Wide (600x250)</Button>
      <SameLine />
      <Button onClick={makeTall}>Make Tall (350x400)</Button>

      <Separator />

      <CollapsingHeader title="How This Works">
        <Text wrapped>
          This window uses x, y, width, and height props (not defaultX/defaultY).
          These props are enforced every frame using ImGuiCond_Always.
        </Text>
        <Text wrapped>
          When you move or resize the window, onWindowState fires with new values.
          We update React state, which updates the props, completing the cycle.
        </Text>
        <Text wrapped>
          The buttons demonstrate programmatic control: just update state!
        </Text>
      </CollapsingHeader>
    </Window>
  );
}
