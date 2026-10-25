import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StudioHeader } from '../components/layout/StudioHeader';
import type { AppMode, EngineStatus } from '../types/studio';

describe('StudioHeader', () => {
  const defaultProps = {
    activeMode: 'transcribe' as AppMode,
    onSelectMode: vi.fn(),
    engineStatus: 'idle' as EngineStatus,
    isModelReady: true,
  };

  it('renders the brand title and chic diamond icon', () => {
    render(<StudioHeader {...defaultProps} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Audio Subtitles');
    expect(
      screen.getByText(/In-Browser Subtitling Suite · 100% Private & Local/i)
    ).toBeInTheDocument();
  });

  it('renders all four mode navigation pills', () => {
    render(<StudioHeader {...defaultProps} />);
    expect(screen.getByRole('tab', { name: /file transcriber/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /live captions/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /video studio/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /subtitle editor/i })).toBeInTheDocument();
  });

  it('marks activeMode pill with active class and aria-selected', () => {
    const { rerender } = render(<StudioHeader {...defaultProps} activeMode="transcribe" />);
    const transcribeTab = screen.getByRole('tab', { name: /file transcriber/i });
    expect(transcribeTab).toHaveClass('nav-pill--active');
    expect(transcribeTab).toHaveAttribute('aria-selected', 'true');

    rerender(<StudioHeader {...defaultProps} activeMode="editor" />);
    const editorTab = screen.getByRole('tab', { name: /subtitle editor/i });
    expect(editorTab).toHaveClass('nav-pill--active');
    expect(editorTab).toHaveAttribute('aria-selected', 'true');
    expect(transcribeTab).not.toHaveClass('nav-pill--active');
  });

  it('calls onSelectMode when a navigation pill is clicked', () => {
    const onSelectMode = vi.fn();
    render(<StudioHeader {...defaultProps} onSelectMode={onSelectMode} />);

    const liveTab = screen.getByRole('tab', { name: /live captions/i });
    fireEvent.click(liveTab);
    expect(onSelectMode).toHaveBeenCalledWith('live');

    const videoTab = screen.getByRole('tab', { name: /video studio/i });
    fireEvent.click(videoTab);
    expect(onSelectMode).toHaveBeenCalledWith('video');
  });

  it('displays Whisper AI Ready when model is ready and engine is idle', () => {
    render(<StudioHeader {...defaultProps} engineStatus="idle" isModelReady={true} />);
    expect(screen.getByText('Whisper AI Ready')).toBeInTheDocument();
    expect(screen.getByTestId('whisper-status-dot')).toHaveClass('jewel-dot--done');
    expect(screen.getByText('FFmpeg WASM')).toBeInTheDocument();
  });

  it('displays Whisper Loading... when model is loading', () => {
    render(<StudioHeader {...defaultProps} engineStatus="loading_model" isModelReady={false} />);
    expect(screen.getByText('Whisper Loading...')).toBeInTheDocument();
    expect(screen.getByTestId('whisper-status-dot')).toHaveClass('jewel-dot--loading');
  });

  it('displays Whisper Active when processing audio', () => {
    render(<StudioHeader {...defaultProps} engineStatus="processing" isModelReady={true} />);
    expect(screen.getByText('Whisper Active')).toBeInTheDocument();
    expect(screen.getByTestId('whisper-status-dot')).toHaveClass('jewel-dot--processing');
  });

  it('displays Whisper Standby when idle and model is not yet ready', () => {
    render(<StudioHeader {...defaultProps} engineStatus="idle" isModelReady={false} />);
    expect(screen.getByText('Whisper Standby')).toBeInTheDocument();
    expect(screen.getByTestId('whisper-status-dot')).toHaveClass('jewel-dot--idle');
  });

  it('displays Whisper Error when engine encounters an error', () => {
    render(<StudioHeader {...defaultProps} engineStatus="error" isModelReady={false} />);
    expect(screen.getByText('Whisper Error')).toBeInTheDocument();
    expect(screen.getByTestId('whisper-status-dot')).toHaveClass('jewel-dot--error');
  });
});
