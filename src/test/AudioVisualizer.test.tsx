import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AudioVisualizer } from '../components/studio/AudioVisualizer';

describe('AudioVisualizer component', () => {
  it('renders in standby idle state', () => {
    render(<AudioVisualizer isActive={false} rmsLevel={0} source="idle" />);

    expect(screen.getByRole('region', { name: /live audio stream visualizer/i })).toBeInTheDocument();
    expect(screen.getByText('Standby')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders microphone active mode with jewel pulsing indicator', () => {
    const { container } = render(
      <AudioVisualizer isActive={true} rmsLevel={0.42} source="mic" />
    );

    expect(screen.getByText('Live Microphone')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(container.querySelector('.jewel-indicator--active')).toBeInTheDocument();
  });

  it('renders tab active mode with percentage and active status', () => {
    const { container } = render(
      <AudioVisualizer isActive={true} rmsLevel={0.85} source="tab" />
    );

    expect(screen.getByText('Tab / System Audio')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(container.querySelector('.crystalline-visualizer--active')).toBeInTheDocument();
  });

  it('clamps rms levels gracefully above 1 or below 0', () => {
    render(<AudioVisualizer isActive={true} rmsLevel={1.8} source="mic" />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
