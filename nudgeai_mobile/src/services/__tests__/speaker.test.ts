import { createAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

import { ApiError } from '../api/errors';
import { speechApi } from '../api/endpoints/speech';
import { resetSpeakerState, speak, startSpeech } from '../speaker';

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

/** Let every pending promise run: the pipeline works in the background. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

describe('speak', () => {
  it('plays the server voice from a temporary file and cleans up when it ends', async () => {
    const player = fakePlayer();
    synthesize.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const onEnd = jest.fn();

    await speak('Do **deep work** now', { tone: 'firm', onEnd });
    await settle();

    expect(synthesize).toHaveBeenCalledWith('Do deep work now'); // no asterisks reach the voice
    expect(mockFiles[0].written).toEqual(new Uint8Array([1, 2, 3]));
    expect(player.setPlaybackRate).toHaveBeenCalledWith(expect.any(Number), 'high');
    expect(player.setPlaybackRate.mock.calls[0][0]).toBeGreaterThan(1); // firm is brisk
    expect(player.play).toHaveBeenCalled();
    expect(Speech.speak).not.toHaveBeenCalled();
    expect(mockFiles[0].deleted).toBe(false);

    player.finish();
    await settle();
    expect(mockFiles[0].deleted).toBe(true);
    expect(player.remove).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('can be stopped, once, and still cleans up', async () => {
    const player = fakePlayer();
    synthesize.mockResolvedValue(new Uint8Array([1]));
    const onEnd = jest.fn();
    const handle = await speak('Hello', { onEnd });
    await settle();
    handle.stop();
    handle.stop();
    player.finish(); // a late "finished" event must not double-clean
    await settle();
    expect(mockFiles[0].deleted).toBe(true);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('falls back to the phone’s voice when the server voice is not set up', async () => {
    synthesize.mockRejectedValue(new ApiError('spoken replies are not set up on the server', 503));
    await speak('Hello Ada', { tone: 'gentle' });
    await settle();
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    const [text, opts] = (Speech.speak as jest.Mock).mock.calls[0];
    expect(text).toBe('Hello Ada');
    expect(opts.rate).toBeLessThan(1); // gentle is slow
  });

  it('does not wait on a dead server voice for every line', async () => {
    synthesize.mockRejectedValue(new ApiError('down', 502));
    await speak('First');
    await settle();
    await speak('Second');
    await settle();
    expect(synthesize).toHaveBeenCalledTimes(1); // the second line went straight to the phone
    expect(Speech.speak).toHaveBeenCalledTimes(2);
  });

  it('falls back if the audio can’t be played', async () => {
    synthesize.mockResolvedValue(new Uint8Array([1]));
    makePlayer.mockImplementation(() => {
      throw new Error('no audio output');
    });
    await speak('Hello');
    await settle();
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });

  it('uses only the phone’s voice in demo mode, with no network call', async () => {
    mockDemo = true;
    await speak('Hello');
    await settle();
    expect(synthesize).not.toHaveBeenCalled();
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });

  it('says nothing, and reports it ended, for empty text', async () => {
    const onEnd = jest.fn();
    await speak('  ', { onEnd });
    await settle();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(synthesize).not.toHaveBeenCalled();
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it('does not touch the read-only playbackRate (the bug that silenced the server voice)', async () => {
    const player = fakePlayer();
    synthesize.mockResolvedValue(new Uint8Array([1]));
    // assigning would throw "Cannot assign to property 'playbackRate' which has only a getter"
    await speak('Hello', { tone: 'firm' });
    await settle();
    expect(Speech.speak).not.toHaveBeenCalled();
    expect(player.play).toHaveBeenCalled();
  });
});

describe('startSpeech: a reply that is still being written', () => {
  const S1 = 'Okay, I have added your dentist visit for tomorrow at three.';
  const S2 = 'I will remind you ten minutes before it starts, so you are ready.';
  const S3 = 'Is there anything else you would like me to arrange for the day?';

  it('starts voicing the first sentence before the rest has even been written', async () => {
    const players = playersPerChunk();
    synthesize.mockImplementation(async (t) => new Uint8Array([t.length]));
    const session = startSpeech();

    session.push('Okay, I have added your dentist visit ');
    session.push('for tomorrow at three. ');
    await settle();
    expect(synthesize).not.toHaveBeenCalled(); // the sentence might not be over yet

    session.push('I will remind'); // the next sentence has begun, so the first is certainly done
    await settle();
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledWith(S1);
    expect(players).toHaveLength(1);
    expect(players[0].play).toHaveBeenCalled(); // and it is already playing
  });

  it('plays sentences in order, back to back, and ends once after the last', async () => {
    const players = playersPerChunk();
    synthesize.mockImplementation(async (t) => new Uint8Array([t.length]));
    const onEnd = jest.fn();
    const session = startSpeech({ onEnd });

    session.push(`${S1} ${S2} ${S3}`);
    session.end();
    await settle();
    expect(players).toHaveLength(1);
    players[0].finish();
    await settle();
    expect(players).toHaveLength(2);
    expect(onEnd).not.toHaveBeenCalled();
    players[1].finish();
    await settle();
    players[2]?.finish();
    await settle();
    expect(synthesize.mock.calls.map((c) => c[0])).toEqual([S1, S2, S3]);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(mockFiles.every((f) => f.deleted)).toBe(true);
  });

  it('never has more than two sentences being voiced at once', async () => {
    playersPerChunk();
    const release: (() => void)[] = [];
    let open = 0;
    let peak = 0;
    synthesize.mockImplementation(
      () =>
        new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
          open += 1;
          peak = Math.max(peak, open);
          release.push(() => {
            open -= 1;
            resolve(new Uint8Array([1]));
          });
        })
    );
    const session = startSpeech();
    session.push(`${S1} ${S2} ${S3} And one more sentence to be spoken, to make four in all.`);
    session.end();
    await settle();
    expect(peak).toBe(2); // ElevenLabs' free plan refuses more
    release.forEach((r) => r());
  });

  it('plays what has arrived while later sentences are still being voiced', async () => {
    const players = playersPerChunk();
    const second = { resolve: (_: Uint8Array<ArrayBuffer>) => undefined as void };
    synthesize
      .mockResolvedValueOnce(new Uint8Array([1]))
      .mockReturnValueOnce(new Promise<Uint8Array<ArrayBuffer>>((r) => (second.resolve = r)));
    const session = startSpeech();
    session.push(`${S1} ${S2} Next`);
    await settle();
    expect(players).toHaveLength(1); // sentence one plays without waiting for sentence two
    players[0].finish();
    await settle();
    expect(players).toHaveLength(1); // two isn't ready: wait for it, don't skip it
    second.resolve(new Uint8Array([2]));
    await settle();
    expect(players).toHaveLength(2);
  });

  it('keeps going in the phone’s voice if one sentence fails', async () => {
    const players = playersPerChunk();
    synthesize
      .mockResolvedValueOnce(new Uint8Array([1]))
      .mockRejectedValueOnce(new ApiError('quota exceeded', 502));
    const session = startSpeech();
    session.push(`${S1} ${S2} ${S3}`);
    session.end();
    await settle();
    players[0].finish();
    await settle();
    expect((Speech.speak as jest.Mock).mock.calls[0][0]).toBe(S2);
  });

  it('says only the gist of a very long reply, cut at a sentence', async () => {
    playersPerChunk();
    synthesize.mockImplementation(async (t) => new Uint8Array([t.length]));
    const long = Array.from(
      { length: 30 },
      (_, i) => `This is sentence number ${i + 1} of a long reply.`
    ).join(' ');
    const session = startSpeech();
    session.push(long);
    session.end();
    await settle();
    const spoken = synthesize.mock.calls.map((c) => c[0]).join(' ');
    expect(spoken.length).toBeLessThanOrEqual(280);
    expect(spoken.endsWith('.')).toBe(true);
  });

  it('stops everything when told to, and ignores text that arrives afterwards', async () => {
    const players = playersPerChunk();
    synthesize.mockImplementation(async (t) => new Uint8Array([t.length]));
    const onEnd = jest.fn();
    const session = startSpeech({ onEnd });
    session.push(`${S1} ${S2} Next`);
    await settle();
    session.stop();
    session.push(`${S3} And more.`);
    session.end();
    await settle();
    expect(players).toHaveLength(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(mockFiles[0].deleted).toBe(true);
  });

  it('reports the end even if nothing was ever said', async () => {
    const onEnd = jest.fn();
    const session = startSpeech({ onEnd });
    session.end();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
