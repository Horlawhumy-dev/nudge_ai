import { refreshSession } from '../api/client';
import { getTokens } from '../api/tokens';
import { liveUrl, openLiveTranscription, READY_TIMEOUT_MS } from '../liveTranscribe';

let mockDemo = false;
jest.mock('@/constants/env', () => ({
  get DEMO_MODE() {
    return mockDemo;
  },
  API_URL: 'https://host.test/api/v1',
}));
jest.mock('../api/client', () => ({ refreshSession: jest.fn() }));
jest.mock('../api/tokens', () => ({ getTokens: jest.fn() }));

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  binaryType = '';
  sent: (string | ArrayBuffer)[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
  // helpers the tests use to play the server
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  say(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const getTokensMock = getTokens as jest.Mock;
const refresh = refreshSession as jest.Mock;
const callbacks = () => ({
  onPartial: jest.fn(),
  onSpeech: jest.fn(),
  onTurn: jest.fn(),
  onFail: jest.fn(),
});
const flush = () => new Promise<void>((r) => setImmediate(() => r()));
const pcm = (...values: number[]) => new Int16Array(values);
const bytesOf = (data: string | ArrayBuffer) => Array.from(new Int16Array(data as ArrayBuffer));
const last = () => FakeSocket.all[FakeSocket.all.length - 1];

beforeEach(() => {
  jest.clearAllMocks();
  mockDemo = false;
  FakeSocket.all = [];
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
  getTokensMock.mockResolvedValue({ accessToken: 'tok-1', refreshToken: 'r' });
});

describe('liveUrl', () => {
  it('turns the API address into the WebSocket address', () => {
    expect(liveUrl('https://host.test/api/v1')).toBe('wss://host.test/api/v1/speech/live');
    expect(liveUrl('http://192.168.1.5:8079/api/v1/')).toBe(
      'ws://192.168.1.5:8079/api/v1/speech/live'
    );
  });
});

describe('openLiveTranscription', () => {
  it('is unavailable in demo mode', () => {
    mockDemo = true;
    expect(openLiveTranscription(callbacks())).toBeNull();
  });

  it('asks to start with the access token, in hands-free mode', async () => {
    openLiveTranscription(callbacks());
    await flush();
    last().open();
    expect(last().url).toBe('wss://host.test/api/v1/speech/live');
    expect(last().binaryType).toBe('arraybuffer');
    expect(JSON.parse(last().sent[0] as string)).toEqual({
      type: 'start',
      token: 'tok-1',
      mode: 'ENDPOINTING',
    });
  });

  it('holds audio until the server is ready, then sends it in order, then streams', async () => {
    const live = openLiveTranscription(callbacks())!;
    await flush();
    last().open();
    live.sendAudio(pcm(1, 2));
    live.sendAudio(pcm(3));
    expect(last().sent).toHaveLength(1); // only the start message so far

    last().say({ type: 'ready' });
    expect(last().sent.slice(1).map(bytesOf)).toEqual([[1, 2], [3]]);

    live.sendAudio(pcm(4, 5, 6));
    expect(bytesOf(last().sent[3])).toEqual([4, 5, 6]);
  });

  it('keeps only the most recent ten seconds while waiting', async () => {
    const live = openLiveTranscription(callbacks())!;
    await flush();
    last().open();
    for (let i = 0; i < 15; i += 1) live.sendAudio(new Int16Array(16_000).fill(i)); // 15 s
    last().say({ type: 'ready' });
    const sent = last().sent.slice(1).map(bytesOf);
    expect(sent.length).toBe(10);
    expect(sent[0][0]).toBe(5); // the oldest five seconds were dropped
  });

  it('passes the words, the speech state and the finished sentence to the app', async () => {
    const cb = callbacks();
    openLiveTranscription(cb);
    await flush();
    last().open();
    last().say({ type: 'ready' });
    last().say({ type: 'speech', active: true });
    last().say({ type: 'partial', text: 'push my deep' });
    last().say({ type: 'turn', text: 'push my deep work to 11 am please' });
    expect(cb.onSpeech).toHaveBeenCalledWith(true);
    expect(cb.onPartial).toHaveBeenCalledWith('push my deep');
    expect(cb.onTurn).toHaveBeenCalledWith('push my deep work to 11 am please');
    expect(cb.onFail).not.toHaveBeenCalled();
  });

  it('tells the server the recording ended, now or as soon as it is ready', async () => {
    const early = openLiveTranscription(callbacks())!;
    await flush();
    last().open();
    early.stop(); // before ready: remembered
    last().say({ type: 'ready' });
    expect(JSON.parse(last().sent[last().sent.length - 1] as string)).toEqual({ type: 'stop' });

    FakeSocket.all = [];
    const late = openLiveTranscription(callbacks())!;
    await flush();
    last().open();
    last().say({ type: 'ready' });
    late.stop();
    expect(JSON.parse(last().sent[last().sent.length - 1] as string)).toEqual({ type: 'stop' });
  });

  it('retries once with a refreshed login when the token has expired', async () => {
    const cb = callbacks();
    openLiveTranscription(cb);
    await flush();
    last().open();
    refresh.mockImplementation(async () => {
      getTokensMock.mockResolvedValue({ accessToken: 'tok-2', refreshToken: 'r2' });
      return 'tok-2';
    });
    last().say({ type: 'error', code: 'unauthorized' });
    await flush();
    expect(FakeSocket.all).toHaveLength(2);
    last().open();
    expect(JSON.parse(last().sent[0] as string).token).toBe('tok-2');
    expect(cb.onFail).not.toHaveBeenCalled();

    last().say({ type: 'error', code: 'unauthorized' }); // refused again: give up, don't loop
    expect(cb.onFail).toHaveBeenCalledWith('unauthorized');
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('fails once, for any other server error, and stops sending', async () => {
    const cb = callbacks();
    const live = openLiveTranscription(cb)!;
    await flush();
    last().open();
    last().say({ type: 'error', code: 'unavailable' });
    last().say({ type: 'error', code: 'unavailable' });
    expect(cb.onFail).toHaveBeenCalledTimes(1);
    expect(cb.onFail).toHaveBeenCalledWith('unavailable');
    const before = last().sent.length;
    live.sendAudio(pcm(1));
    expect(last().sent.length).toBe(before);
  });

  it('treats a connection that drops before the sentence as a failure', async () => {
    const cb = callbacks();
    openLiveTranscription(cb);
    await flush();
    last().open();
    last().say({ type: 'ready' });
    last().close();
    expect(cb.onFail).toHaveBeenCalledWith('closed');
  });

  it('does not treat the close after a finished sentence as a failure', async () => {
    const cb = callbacks();
    openLiveTranscription(cb);
    await flush();
    last().open();
    last().say({ type: 'ready' });
    last().say({ type: 'turn', text: 'done' });
    last().close();
    expect(cb.onFail).not.toHaveBeenCalled();
  });

  it('never reports a failure for a hang-up it asked for', async () => {
    const cb = callbacks();
    const live = openLiveTranscription(cb)!;
    await flush();
    last().open();
    live.close();
    expect(last().closed).toBe(true);
    expect(cb.onFail).not.toHaveBeenCalled();
  });

  it('fails when there is no login to present', async () => {
    getTokensMock.mockResolvedValue(null);
    const cb = callbacks();
    openLiveTranscription(cb);
    await flush();
    expect(cb.onFail).toHaveBeenCalledWith('unauthorized');
    expect(FakeSocket.all).toHaveLength(0);
  });

  it('gives up if the server never says it is ready', async () => {
    jest.useFakeTimers();
    try {
      const cb = callbacks();
      openLiveTranscription(cb);
      await jest.advanceTimersByTimeAsync(0);
      last().open();
      await jest.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 1);
      expect(cb.onFail).toHaveBeenCalledWith('timeout');
      expect(last().closed).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
