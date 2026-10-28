import { SseParser } from '../sse';

describe('SseParser', () => {
  it('parses events with JSON payloads', () => {
    const p = new SseParser();
    const events = p.push(
      'event: conversation\ndata: {"id":"c1","title":"Hi"}\n\nevent: message\ndata: {"content":"Hello"}\n\n'
    );
    expect(events).toEqual([
      { event: 'conversation', data: { id: 'c1', title: 'Hi' } },
      { event: 'message', data: { content: 'Hello' } },
    ]);
  });

  it('waits for the blank line when a chunk ends mid-event', () => {
    const p = new SseParser();
    expect(p.push('event: message\ndata: {"content":"Hel')).toEqual([]);
    expect(p.push('lo"}\n')).toEqual([]);
    expect(p.push('\nevent: done\ndata: {}\n\n')).toEqual([
      { event: 'message', data: { content: 'Hello' } },
      { event: 'done', data: {} },
    ]);
  });

  it('handles CRLF, comments and non-JSON data', () => {
    const p = new SseParser();
    expect(p.push(': keep-alive\r\n\r\nevent: error\r\ndata: plain text\r\n\r\n')).toEqual([
      { event: 'error', data: 'plain text' },
    ]);
  });

  it('joins multi-line data', () => {
    expect(new SseParser().push('data: a\ndata: b\n\n')).toEqual([
      { event: 'message', data: 'a\nb' },
    ]);
  });
});
