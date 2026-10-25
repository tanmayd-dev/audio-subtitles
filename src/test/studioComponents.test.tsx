import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubtitleEditor } from '../components/studio/SubtitleEditor';
import { TeleprompterView } from '../components/studio/TeleprompterView';
import type { SubtitleCue } from '../types/studio';

describe('SubtitleEditor', () => {
  const sampleCues: SubtitleCue[] = [
    { id: '1', start: 0, end: 2.5, text: 'Hello world' },
    { id: '2', start: 3.0, end: 5.5, text: 'Second subtitle cue' },
  ];

  it('renders list of cues with formatted timecodes', () => {
    render(
      <SubtitleEditor
        cues={sampleCues}
        currentTime={1.0}
        onCueChange={vi.fn()}
        onSeek={vi.fn()}
      />
    );

    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('Second subtitle cue')).toBeInTheDocument();
    expect(screen.getByText('2 cues')).toBeInTheDocument();
  });

  it('calls onSeek when play button is clicked', () => {
    const onSeek = vi.fn();
    render(
      <SubtitleEditor
        cues={sampleCues}
        currentTime={0}
        onCueChange={vi.fn()}
        onSeek={onSeek}
      />
    );

    const playBtns = screen.getAllByRole('button', { name: /jump to this cue/i });
    fireEvent.click(playBtns[0]);
    expect(onSeek).toHaveBeenCalledWith(0);
  });

  it('calls onCueChange when cue text is edited', () => {
    const onCueChange = vi.fn();
    render(
      <SubtitleEditor
        cues={sampleCues}
        currentTime={0}
        onCueChange={onCueChange}
        onSeek={vi.fn()}
      />
    );

    const textareas = screen.getAllByPlaceholderText('Enter subtitle text...');
    fireEvent.change(textareas[0], { target: { value: 'Updated hello' } });
    expect(onCueChange).toHaveBeenCalledWith([
      { id: '1', start: 0, end: 2.5, text: 'Updated hello' },
      sampleCues[1],
    ]);
  });
});

describe('TeleprompterView', () => {
  const sampleCues: SubtitleCue[] = [
    { id: '1', start: 0, end: 2, text: 'Live transcription chunk' },
  ];

  it('renders live transcription chunks', () => {
    render(
      <TeleprompterView
        cues={sampleCues}
        isRecording={true}
        onClear={vi.fn()}
        onCopy={vi.fn()}
        copied={false}
      />
    );

    expect(screen.getByText(/live transcribing/i)).toBeInTheDocument();
    expect(screen.getByText(/Live transcription chunk/)).toBeInTheDocument();
  });
});
