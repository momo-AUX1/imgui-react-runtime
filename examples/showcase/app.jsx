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
  StyleSheet,
  Tree,
  TreeNode,
  TabBar,
  TabItem,
  ListBox,
  InputText,
  InputTextMultiline,
  InputFloat,
  InputInt,
  InputDouble,
  Tooltip,
  PopupModal,
} from 'react-imgui';
import { StockTable } from './StockTable.jsx';
import { BouncingBall } from './BouncingBall.jsx';
import { ControlledWindow } from './ControlledWindow.jsx';

const styles = StyleSheet.create({
  statusGlow: { color: '#7DF9FF' },
  sectionTitle: { color: '#FFD369' },
  cautionText: { color: '#FF9F43' },
  pillButton: { backgroundColor: '#2F2963', color: '#F4F4F4', width: 140 },
  noteHeader: { color: '#A29BFE' },
  noteBody: { color: '#EAEAEA' },
});

const accentPalettes = [
  { name: 'Neon Pulse', primary: '#08F7FE', secondary: '#FE53BB', text: '#F5D300' },
  { name: 'Aurora Mist', primary: '#7CF9A6', secondary: '#70A1FF', text: '#FAD6FF' },
  { name: 'Solar Ember', primary: '#FFB347', secondary: '#FF416C', text: '#FFF5E1' },
];

export function App() {
  const [counter1, setCounter1] = useState(0);
  const [counter2, setCounter2] = useState(0);
  const [activeTab, setActiveTab] = useState('inputs');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [displayName, setDisplayName] = useState('Explorer');
  const [notes, setNotes] = useState('The runtime now speaks fluent ImGui.\nTry the new widgets and styling helpers!');
  const [exposure, setExposure] = useState(1.25);
  const [sampleCount, setSampleCount] = useState(64);
  const [budget, setBudget] = useState(4200.5);
  const [showAboutModal, setShowAboutModal] = useState(false);

  const palette = accentPalettes[paletteIndex] || accentPalettes[0];
  const accentButtonStyle = StyleSheet.compose(styles.pillButton, {
    backgroundColor: palette.primary,
    color: '#1B1B1B',
  });
  const accentTextStyle = { color: palette.text };
  const secondaryTextStyle = { color: palette.secondary };
  const paletteItems = accentPalettes.map((item) => item.name);

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
    <Text style={styles.statusGlow}>React + ImGui Showcase</Text>
    <SameLine />
    <Text style={accentTextStyle}>  |  Counters: {counter1} / {counter2}</Text>
    <SameLine />
    <Text style={secondaryTextStyle}>  |  Total clicks: {counter1 + counter2}</Text>

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
        <Text style={accentTextStyle}>Welcome to the React + ImGui demo!</Text>
        <Text style={secondaryTextStyle}>Palette: {palette.name}</Text>

        <Separator />

        <TabBar id="component-playground-tabs">
          <TabItem
            label="Inputs"
            id="inputs"
            selected={activeTab === 'inputs'}
            onSelect={() => setActiveTab('inputs')}
          >
            {activeTab === 'inputs' && (
              <>
                <Text style={styles.sectionTitle}>Editable Controls</Text>
                <InputText label="Display name" value={displayName} onChange={(value) => setDisplayName(value)} />
                <InputTextMultiline
                  label="Session notes"
                  value={notes}
                  onChange={(value) => setNotes(value)}
                  width={320}
                  height={100}
                />
                <InputFloat
                  label="Exposure"
                  value={exposure}
                  step={0.05}
                  onChange={(value) => setExposure(value)}
                />
                <InputInt
                  label="Sample count"
                  value={sampleCount}
                  step={1}
                  onChange={(value) => setSampleCount(value)}
                />
                <InputDouble
                  label="Frame budget (ms)"
                  value={budget}
                  step={0.5}
                  onChange={(value) => setBudget(value)}
                />
                <Text style={styles.statusGlow}>
                  Preview: {displayName} • {sampleCount} samples • {exposure.toFixed(2)}x exposure • {budget.toFixed(1)} ms budget
                </Text>
              </>
            )}
          </TabItem>
          <TabItem
            label="Data & Hierarchy"
            id="data"
            selected={activeTab === 'data'}
            onSelect={() => setActiveTab('data')}
          >
            {activeTab === 'data' && (
              <>
                <Group>
                  <Text style={styles.sectionTitle}>Palette Presets</Text>
                  <ListBox
                    label="Accent palette"
                    items={paletteItems}
                    selectedIndex={paletteIndex}
                    heightInItems={3}
                    onChange={(index) => setPaletteIndex(index)}
                  />
                  <Text style={accentTextStyle}>Primary color: {palette.primary}</Text>
                  <Text style={secondaryTextStyle}>Secondary color: {palette.secondary}</Text>
                </Group>
                <Separator />
                <Tree label="Runtime Layout" defaultOpen>
                  <TreeNode label="Windows" defaultOpen>
                    <Text>- Hello from React</Text>
                    <Text>- Component Playground</Text>
                    <Text>- Controlled Window</Text>
                  </TreeNode>
                  <TreeNode label="Decorations">
                    <Text>- Background Rectangles</Text>
                    <Text>- Status Bar Overlay</Text>
                    <Text>- Floating Circles</Text>
                  </TreeNode>
                  <TreeNode label="Demo Nodes">
                    <Text>- Palette Switcher</Text>
                    <Text>- Input Suite</Text>
                  </TreeNode>
                </Tree>
              </>
            )}
          </TabItem>
          <TabItem
            label="Insights"
            id="insights"
            selected={activeTab === 'insights'}
            onSelect={() => setActiveTab('insights')}
          >
            {activeTab === 'insights' && (
              <>
                <Text style={styles.sectionTitle}>Counter Telemetry</Text>
                <Text style={styles.statusGlow}>
                  Counter1: {counter1} • Counter2: {counter2} • Total: {counter1 + counter2}
                </Text>
                <Text style={counter2 > 25 ? styles.cautionText : accentTextStyle}>
                  {counter2 > 25 ? 'Warning: stress testing the counter!' : 'Counters are within nominal range.'}
                </Text>
                <Separator />
                <Text style={styles.noteHeader}>Notes</Text>
                <Text style={styles.noteBody}>{notes}</Text>
              </>
            )}
          </TabItem>
        </TabBar>

        <Separator />

        <Group>
          <Button style={accentButtonStyle} onClick={() => setShowAboutModal(true)}>
            Styled Action
          </Button>
          <Tooltip followItem>
            <Text>Opens a themed PopupModal using StyleSheet colors.</Text>
          </Tooltip>
          <SameLine />
          <Button onClick={() => setCounter2(counter2 + 1)}>+1</Button>
          <SameLine />
          <Button onClick={() => setCounter2(Math.max(0, counter2 - 1))}>-1</Button>
          <SameLine />
          <Button onClick={() => setCounter2(0)}>Reset</Button>
        </Group>
      </Window>

      <PopupModal id="about-modal" open={showAboutModal} onClose={() => setShowAboutModal(false)}>
        <Text style={styles.sectionTitle}>About this Showcase</Text>
        <Separator />
        <Text style={styles.noteBody}>This popup highlights the new PopupModal primitive with StyleSheet-driven styling.</Text>
        <Text style={styles.statusGlow}>Active palette: {palette.name}</Text>
        <Button onClick={() => setShowAboutModal(false)}>Close</Button>
      </PopupModal>

      {/* Footer info bar */}
      <Rect x={0} y={575} width={1200} height={25} color="#00000080" filled={true} />
      <Text color="#888888">Root component demo - Background shapes and overlay elements render behind/above all windows</Text>
    </Root>
  );
}
