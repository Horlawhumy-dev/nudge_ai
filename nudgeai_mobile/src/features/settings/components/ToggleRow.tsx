import { ListRow, Toggle, type IconName } from '@/components/ui';

type ToggleRowProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function ToggleRow({ title, subtitle, icon, value, onValueChange }: ToggleRowProps) {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      trailing={<Toggle value={value} onValueChange={onValueChange} accessibilityLabel={title} />}
    />
  );
}
