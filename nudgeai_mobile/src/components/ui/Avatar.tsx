import { Image } from 'expo-image';
import type { ImageSource } from 'expo-image';

type AvatarProps = {
  source?: ImageSource | number;
  size?: number;
};

export function Avatar({ source = require('@/assets/images/avatar.png'), size = 48 }: AvatarProps) {
  return <Image source={source} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
}
