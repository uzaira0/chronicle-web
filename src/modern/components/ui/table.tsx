import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { useTranslator } from '@/i18n';
import { cn } from '@/lib/utils';

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, tabIndex = 0, ...props }, ref) => {
    const { t } = useTranslator();
    return (
      <section
        aria-label={props['aria-labelledby'] ? undefined : props['aria-label'] || t('common.scrollable_table')}
        aria-labelledby={props['aria-labelledby']}
        className="eq-table-wrap relative w-full max-w-full overflow-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        tabIndex={tabIndex}
      >
        <table className={cn('eq-table w-full caption-bottom text-sm', className)} ref={ref} {...props} />
      </section>
    );
  },
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead className={cn('[&_tr]:border-b', className)} ref={ref} {...props} />,
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody className={cn('[&_tr:last-child]:border-0', className)} ref={ref} {...props} />
  ),
);
TableBody.displayName = 'TableBody';

const rowVariants = cva('border-b hover:bg-muted/50 data-[state=selected]:bg-muted', {
  variants: { variant: { default: '', lazy: 'row-offscreen-lazy', detail: 'bg-muted/30' } },
});

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & VariantProps<typeof rowVariants>
>(({ className, variant, ...props }, ref) => (
  <tr className={cn(rowVariants({ variant }), className)} ref={ref} {...props} />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      className={cn(
        'h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
TableHead.displayName = 'TableHead';

const cellVariants = cva('p-4 align-middle [&:has([role=checkbox])]:pr-0', {
  variants: {
    tone: { muted: 'text-muted-foreground', expanded: 'bg-muted/30' },
    size: { small: 'text-xs' },
    weight: { medium: 'font-medium', semibold: 'font-semibold' },
    truncate: { true: 'truncate' },
    padding: { selection: 'px-1' },
  },
});

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & VariantProps<typeof cellVariants>
>(({ className, tone, size, weight, truncate, padding, ...props }, ref) => (
  <td className={cn(cellVariants({ tone, size, weight, truncate, padding }), className)} ref={ref} {...props} />
));
TableCell.displayName = 'TableCell';

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
