import { LegalDocument } from '@/features/legal/LegalDocument';
import { TERMS } from '@/features/legal/content';

export default function Terms() {
  return <LegalDocument doc={TERMS} />;
}
