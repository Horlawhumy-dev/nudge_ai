import { LegalDocument } from '@/features/legal/LegalDocument';
import { PRIVACY } from '@/features/legal/content';

export default function PrivacyPolicy() {
  return <LegalDocument doc={PRIVACY} />;
}
