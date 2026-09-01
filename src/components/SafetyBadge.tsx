import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import type { SafetyInfo } from '@/lib/safety';
import { SAFETY_STYLES } from '@/lib/safety';

const ICON = {
  safe: ShieldCheck,
  caution: ShieldQuestion,
  risky: ShieldAlert,
};

export function SafetyBadge({ info }: { info: SafetyInfo }) {
  const Icon = ICON[info.level];
  const style = SAFETY_STYLES[info.level];
  return (
    <span
      title={info.reason}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${style.badge}`}
    >
      <Icon size={12} />
      {info.label}
    </span>
  );
}
