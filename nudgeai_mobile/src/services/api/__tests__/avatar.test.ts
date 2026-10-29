import axios from 'axios';

import { api } from '../client';
import { profileApi } from '../endpoints/profile';

jest.mock('../client', () => ({ api: { post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
const mockBytes = new Uint8Array([1, 2, 3]);
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ bytes: async () => mockBytes })),
}));
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));

const post = jest.mocked(api.post);
const put = jest.mocked(api.put);
const direct = jest.mocked(axios.post);

const user = { id: 'u', avatar_url: 'https://res.cloudinary.com/c/image/upload/v1/x.jpg' };
const cloudinaryIntent = {
  data: {
    method: 'cloudinary',
    max_bytes: 2_000_000,
    upload_url: 'https://api.cloudinary.com/v1_1/c/image/upload',
    fields: { api_key: 'k', signature: 's', public_id: 'u-abcd1234' },
    file_field: 'file',
  },
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('uploadAvatar', () => {
  it('uploads straight to Cloudinary, reports progress, then attaches the image', async () => {
    post.mockResolvedValueOnce(cloudinaryIntent);
    direct.mockImplementation(async (_url, _form, config) => {
      config?.onUploadProgress?.({ progress: 0.5 } as never);
      return { data: { secure_url: user.avatar_url } };
    });
    put.mockResolvedValue({ data: user });
    const progress: number[] = [];

    const saved = await profileApi.uploadAvatar('file:///photo.png', (p) => progress.push(p));

    expect(direct).toHaveBeenCalledWith(
      cloudinaryIntent.data.upload_url,
      expect.any(FormData),
      expect.anything()
    );
    expect(put).toHaveBeenCalledWith('/profile/avatar', { url: user.avatar_url });
    expect(progress).toEqual([0.5]);
    expect(saved).toBe(user);
  });

  it('falls back to the API route when the direct upload fails', async () => {
    post.mockResolvedValueOnce(cloudinaryIntent);
    direct.mockRejectedValue(new Error('network'));
    post.mockResolvedValueOnce({ data: user });

    const saved = await profileApi.uploadAvatar('file:///photo.jpg');

    expect(post).toHaveBeenLastCalledWith(
      '/profile/avatar',
      mockBytes,
      expect.objectContaining({
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );
    expect(saved).toBe(user);
  });

  it('uses the API route straight away when Cloudinary is not configured', async () => {
    post.mockResolvedValueOnce({ data: { method: 'api', max_bytes: 1 } });
    post.mockResolvedValueOnce({ data: user });
    await profileApi.uploadAvatar('file:///photo.webp');
    expect(direct).not.toHaveBeenCalled();
    expect(post).toHaveBeenLastCalledWith(
      '/profile/avatar',
      mockBytes,
      expect.objectContaining({
        headers: { 'Content-Type': 'image/webp' },
      })
    );
  });
});
