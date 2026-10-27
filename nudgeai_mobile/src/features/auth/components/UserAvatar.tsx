import { useState } from 'react';

import { Avatar } from '@/components/ui';
import { useAuthStore } from '@/store/useAuthStore';

/** The signed-in user's photo, falling back to the bundled avatar if the saved file is gone. */
export function UserAvatar({ size = 48 }: { size?: number }) {
  const uri = useAuthStore((s) => s.user?.avatarUri);
  const [failed, setFailed] = useState(false);
  return (
    <Avatar
      size={size}
      source={uri && !failed ? { uri } : undefined}
      onError={() => setFailed(true)}
    />
  );
}
