import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';

import { useTranslator } from '@/i18n';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
export const PortalContainerContext = React.createContext<HTMLElement | null>(null);

function DialogPortal({ container, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Portal>) {
  const inheritedContainer = React.useContext(PortalContainerContext);
  return <DialogPrimitive.Portal container={container ?? inheritedContainer} {...props} />;
}
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn('fixed inset-0 bg-overlay/55 backdrop-blur-sm', className)}
    ref={ref}
    {...props}
  />
));

DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

function CloseLabel() {
  const { t } = useTranslator();
  return <span className="sr-only">{t('common.close')}</span>;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { variant?: 'default' | 'navigation' }
>(({ children, className, variant = 'default', ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      aria-modal="true"
      className={cn(
        'fixed left-1/2 top-1/2 z-50 overscroll-contain w-11/12 max-w-dialog -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl',
        variant === 'navigation' &&
          'inset-y-0 left-0 top-0 h-dvh w-72 max-w-navigation-drawer translate-x-0 translate-y-0 overflow-y-auto rounded-none p-4',
        className,
      )}
      ref={ref}
      {...props}
    >
      {children}
      <DialogClose className="absolute right-4 top-4 flex items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11 rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground">
        <X className="h-4 w-4" />
        <CloseLabel />
      </DialogClose>
    </DialogPrimitive.Content>
  </DialogPortal>
));

DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    className={cn('text-lg text-balance font-semibold text-foreground', className)}
    ref={ref}
    {...props}
  />
));

DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} ref={ref} {...props} />
));

DialogDescription.displayName = DialogPrimitive.Description.displayName;

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger };
