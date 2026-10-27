import { Image } from 'expo-image';
import type { ImageSource } from 'expo-image';

type AvatarProps = {
  source?: ImageSource | number;
  size?: number;
  onError?: () => void;
};

export function Avatar({
  source = require('@/assets/images/avatar.png'),
  size = 48,
  onError,
}: AvatarProps) {
  return (
    <Image
      source={source}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      onError={onError}
    />
  );
}
