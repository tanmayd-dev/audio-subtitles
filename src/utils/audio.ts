/**
 * Audio utility functions for decoding browser audio files into
 * a Float32Array at 16kHz — as required by the Whisper model.
 */

/**
 * Re-samples a Float32Array from one sample rate to 16000 Hz.
 * Uses linear interpolation for quality.
 */
export function resampleTo16kHz(
    buffer: Float32Array,
    sourceSampleRate: number
): Float32Array {
    if (sourceSampleRate === 16000) return buffer;

    const targetRate = 16000;
    const ratio = sourceSampleRate / targetRate;
    const targetLength = Math.round(buffer.length / ratio);
    const output = new Float32Array(targetLength);

    for (let i = 0; i < targetLength; i++) {
        const pos = i * ratio;
        const index = Math.floor(pos);
        const frac = pos - index;
        const a = buffer[index] ?? 0;
        const b = buffer[index + 1] ?? 0;
        output[i] = a + frac * (b - a);
    }
    return output;
}

/**
 * Decodes a browser File (any audio/video format the browser supports)
 * into a 16kHz mono Float32Array for Whisper inference.
 *
 * @param file - The audio/video File object from the user's file input.
 * @returns A promise resolving to the 16kHz mono PCM buffer.
 */
export async function decodeAudioFile(file: File): Promise<Float32Array> {
    const arrayBuffer = await file.arrayBuffer();

    // Decode with the browser's native decoder — supports ogg, mp3, mp4, wav, etc.
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Mix down to mono by averaging all channels
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const monoBuffer = new Float32Array(length);

    for (let c = 0; c < numChannels; c++) {
        const channelData = audioBuffer.getChannelData(c);
        for (let i = 0; i < length; i++) {
            monoBuffer[i] += channelData[i] / numChannels;
        }
    }

    await audioCtx.close();

    // Resample to 16kHz if needed
    return resampleTo16kHz(monoBuffer, audioBuffer.sampleRate);
}
