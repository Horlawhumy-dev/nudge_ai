import { ConfirmDialog } from '@/components/ui';

type ComingSoonDialogProps = {
  /** Feature name shown in the title; `null` hides the dialog. */
  feature: string | null;
  onClose: () => void;
};

/** Placeholder for settings entries whose backend or native integration isn't built yet. */
export function ComingSoonDialog({ feature, onClose }: ComingSoonDialogProps) {
  return (
    <ConfirmDialog
      visible={feature !== null}
      title={feature ?? ''}
      message="This is coming soon. It will be available once Nudge is connected to your account."
      confirmLabel="Got it"
      cancelLabel={null}
      onCancel={onClose}
      onConfirm={onClose}
    />
  );
}
