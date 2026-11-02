import { cn } from '@/lib/utils';
import type { ROLES } from '@/schema/promise';

type Role = (typeof ROLES)[number];

/** Government and support parties get a filled chip, opposition an outline. */
export function isFilledRole(role: Role): boolean {
  return role !== 'opposition';
}

const SIZES = {
  inline: 'h-7 w-8 rounded-md text-xs border-[1.5px]',
  card: 'size-10 rounded-lg text-sm border-2',
  board: 'size-11 rounded-lg text-sm border-2',
  header: 'size-[72px] rounded-lg text-2xl border-2',
} as const;

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  /** Party code, e.g. "KD". Letters only, no party colours. */
  party: string;
  /** The party's role in the selected term, from the term record, never from the party itself. */
  role: Role;
  size?: keyof typeof SIZES;
}

/** Neutral letter chip in mono type; the role is the only thing that varies. */
export function PartyChip({ party, role, size = 'card', className, ...rest }: Props) {
  const filled = isFilledRole(role);
  return (
    <span
      data-role={role}
      className={cn(
        'inline-flex shrink-0 items-center justify-center border-foreground font-mono font-medium',
        filled ? 'bg-foreground text-background' : 'bg-transparent text-foreground',
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {party}
    </span>
  );
}
