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

/** Like the real player: the speed can only be set through a method, not by assignment. */
function newPlayer() {
  const listeners: ((s: { didJustFinish: boolean }) => void)[] = [];
  const player = {
    setPlaybackRate: jest.fn(),
    play: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn((_: string, cb: (s: { didJustFinish: boolean }) => void) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    }),
    finish: () => listeners.forEach((l) => l({ didJustFinish: true })),
  };
  Object.defineProperty(player, 'playbackRate', { get: () => 1, enumerable: true });
  return player;
}

type TestPlayer = ReturnType<typeof newPlayer>;

/** One shared player, for tests that play a single chunk. */
function fakePlayer(): TestPlayer {
  const player = newPlayer();
  makePlayer.mockReturnValue(player);
  return player;
}

/** A new player for every chunk, in the order they are created. */
function playersPerChunk(): TestPlayer[] {
  const players: TestPlayer[] = [];
  makePlayer.mockImplementation(() => {
    const p = newPlayer();
    players.push(p);
    return p;
  });
  return players;
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
    expect(player.setPlaybackRate).toHaveBeenCalledWith(expect.any(Number), 'high');
    expect(player.setPlaybackRate.mock.calls[0][0]).toBeGreaterThan(1); // firm is brisk
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

  it('does not touch the read-only playbackRate (the bug that silenced the server voice)', async () => {
    const player = fakePlayer();
    synthesize.mockResolvedValue(new Uint8Array([1]));
    // assigning would throw "Cannot assign to property 'playbackRate' which has only a getter"
    await expect(speak('Hello', { tone: 'firm' })).resolves.toBeDefined();
    expect(Speech.speak).not.toHaveBeenCalled();
    expect(player.play).toHaveBeenCalled();
  });

  describe('a long reply', () => {
    const LONG =
      'Done, I added your dentist appointment for tomorrow at 3 pm. ' +
      'I will remind you ten minutes before it starts, and I have also kept your evening free. ' +
      'Anything else you would like me to arrange for the day?';

    it('asks for every part at once, and starts with the short first one', async () => {
      const players = playersPerChunk();
      synthesize.mockImplementation(async (t) => new Uint8Array([t.length]));
      await speak(LONG);
      expect(synthesize).toHaveBeenCalledTimes(2);
      expect(synthesize.mock.calls[0][0].length).toBeLessThan(synthesize.mock.calls[1][0].length);
      expect(players).toHaveLength(1); // only the first part is playing so far
      expect(players[0].play).toHaveBeenCalled();
    });

    it('plays the parts back to back and finishes once, at the end', async () => {
      const players = playersPerChunk();
      synthesize.mockImplementation(async (t) => new Uint8Array([t.length]));
      const onEnd = jest.fn();
      await speak(LONG, { onEnd });

      players[0].finish();
      await new Promise((r) => setTimeout(r, 0));
      expect(players).toHaveLength(2);
      expect(players[1].play).toHaveBeenCalled();
      expect(onEnd).not.toHaveBeenCalled(); // still talking

      players[1].finish();
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(mockFiles.every((f) => f.deleted)).toBe(true);
    });

    it('finishes in the phone’s voice if a later part fails, instead of stopping mid-reply', async () => {
      const players = playersPerChunk();
      synthesize
        .mockResolvedValueOnce(new Uint8Array([1]))
        .mockRejectedValueOnce(new ApiError('quota exceeded', 502));
      const onEnd = jest.fn();
      await speak(LONG, { onEnd });
      players[0].finish();
      await new Promise((r) => setTimeout(r, 0));
      expect(Speech.speak).toHaveBeenCalledTimes(1);
      expect((Speech.speak as jest.Mock).mock.calls[0][0]).toMatch(/^I will remind you/);
    });

    it('stopping part-way ends everything and never starts the next part', async () => {
      const players = playersPerChunk();
      synthesize.mockImplementation(async (t) => new Uint8Array([t.length]));
      const onEnd = jest.fn();
      const handle = await speak(LONG, { onEnd });
      handle.stop();
      await new Promise((r) => setTimeout(r, 0));
      expect(players).toHaveLength(1);
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(mockFiles[0].deleted).toBe(true);
    });
  });
});
