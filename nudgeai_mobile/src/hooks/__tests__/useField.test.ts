import { act, renderHook } from '@testing-library/react-native';

import { validateEmail } from '@/lib/validation';

import { useField } from '../useField';

describe('useField', () => {
  it('stays quiet until the field is touched, then shows the validation message', async () => {
    const { result } = await renderHook(() => useField('', validateEmail));
    await act(async () => result.current.setValue('bad'));
    expect(result.current.error).toMatch(/valid email/); // always computed, for enabling submit
    expect(result.current.visibleError).toBeNull(); // but not shown while typing
    expect(result.current.valid).toBe(false);

    await act(async () => result.current.props.onBlur());
    expect(result.current.visibleError).toMatch(/valid email/);
    expect(result.current.props.error).toMatch(/valid email/);
    expect(result.current.props.success).toBe(false);
  });

  it('marks a touched, valid value as success', async () => {
    const { result } = await renderHook(() => useField('', validateEmail));
    await act(async () => result.current.setValue('a@b.co'));
    await act(async () => result.current.touch());
    expect(result.current.valid).toBe(true);
    expect(result.current.props.success).toBe(true);
    expect(result.current.props.error).toBeUndefined();
  });

  it('shows a remote error until the user edits the value', async () => {
    const { result } = await renderHook(() => useField('a@b.co', validateEmail));
    await act(async () => result.current.setRemoteError('Already registered'));
    expect(result.current.visibleError).toBe('Already registered');
    expect(result.current.props.success).toBe(false);
    await act(async () => result.current.setValue('c@d.co'));
    expect(result.current.visibleError).toBeNull();
  });

  it('resets to the initial state', async () => {
    const { result } = await renderHook(() => useField('x@y.co', validateEmail));
    await act(async () => {
      result.current.setValue('');
      result.current.touch();
    });
    expect(result.current.visibleError).toMatch(/Enter your email/);
    await act(async () => result.current.reset());
    expect(result.current.value).toBe('x@y.co');
    expect(result.current.visibleError).toBeNull();
  });
});
