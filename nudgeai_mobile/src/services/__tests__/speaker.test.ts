import { createAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

import { ApiError } from '../api/errors';
import { speechApi } from '../api/endpoints/speech';
import { resetSpeakerState, speak } from '../speaker';

const mockFiles: { uri: string; deleted: boolean; written?: Uint8Array }[] = [];
let mockDemo = false;

jest.mock('@/constants/env', () => ({
  get DEMO_MODE() {
    return mockDemo;
  },
  API_URL: 'http://api.test',
}));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class {
    uri: string;
    deleted = false;
    written?: Uint8Array;
    constructor(dir: string, name: string) {
      this.uri = `${dir}${name}`;
      mockFiles.push(this);
    }
    create() {}
    write(bytes: Uint8Array) {
      this.written = bytes;
    }
    delete() {
      this.deleted = true;
    }
  },
}));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => undefined),
  createAudioPlayer: jest.fn(),
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => undefined) }));
jest.mock('../api/endpoints/speech');

const synthesize = jest.mocked(speechApi.synthesize);
const makePlayer = createAudioPlayer as jest.Mock;

function fakePlayer() {
  const listeners: ((s: { didJustFinish: boolean }) => void)[] = [];
  const player = {
    playbackRate: 1,
    shouldCorrectPitch: false,
    play: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn((_: string, cb: (s: { didJustFinish: boolean }) => void) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    }),
    finish: () => listeners.forEach((l) => l({ didJustFinish: true })),
  };
  makePlayer.mockReturnValue(player);
  return player;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.length = 0;
  mockDemo = false;
  resetSpeakerState();
});

describe('speak', () => {
  it('plays the server voice from a temporary file and cleans up when it ends', async () => {
    const player = fakePlayer();
    synthesize.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const onEnd = jest.fn();

    await speak('Do **deep work** now', { tone: 'firm', onEnd });

    expect(synthesize).toHaveBeenCalledWith('Do deep work now'); // no asterisks reach the voice
    expect(mockFiles[0].written).toEqual(new Uint8Array([1, 2, 3]));
    expect(player.playbackRate).toBeGreaterThan(1); // firm is brisk
    expect(player.play).toHaveBeenCalled();
    expect(Speech.speak).not.toHaveBeenCalled();
    expect(mockFiles[0].deleted).toBe(false);

    player.finish();
    expect(mockFiles[0].deleted).toBe(true);
    expect(player.remove).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('can be stopped, once, and still cleans up', async () => {
    const player = fakePlayer();
    synthesize.mockResolvedValue(new Uint8Array([1]));
    const onEnd = jest.fn();
    const handle = await speak('Hello', { onEnd });
    handle.stop();
    handle.stop();
    player.finish(); // a late "finished" event must not double-clean
    expect(mockFiles[0].deleted).toBe(true);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('falls back to the phone’s voice when the server voice is not set up', async () => {
    synthesize.mockRejectedValue(new ApiError('spoken replies are not set up on the server', 503));
    await speak('Hello Ada', { tone: 'gentle' });
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    const [text, opts] = (Speech.speak as jest.Mock).mock.calls[0];
    expect(text).toBe('Hello Ada');
    expect(opts.rate).toBeLessThan(1); // gentle is slow
  });

  it('does not wait on a dead server voice for every line', async () => {
    synthesize.mockRejectedValue(new ApiError('down', 502));
    await speak('First');
    await speak('Second');
    expect(synthesize).toHaveBeenCalledTimes(1); // the second line went straight to the phone
    expect(Speech.speak).toHaveBeenCalledTimes(2);
  });

  it('falls back if the audio can’t be played', async () => {
    synthesize.mockResolvedValue(new Uint8Array([1]));
    makePlayer.mockImplementation(() => {
      throw new Error('no audio output');
    });
    await speak('Hello');
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });

  it('uses only the phone’s voice in demo mode, with no network call', async () => {
    mockDemo = true;
    await speak('Hello');
    expect(synthesize).not.toHaveBeenCalled();
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });

  it('says nothing, and reports it ended, for empty text', async () => {
    const onEnd = jest.fn();
    await speak('  ', { onEnd });
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(synthesize).not.toHaveBeenCalled();
    expect(Speech.speak).not.toHaveBeenCalled();
  });
});
