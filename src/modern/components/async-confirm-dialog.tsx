import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';

type AsyncConfirmDialogProps = {
  allowed: boolean;
  children?: ReactNode;
  confirmLabel: string;
  description: string;
  destructive?: boolean;
  disabled?: boolean;
  failureMessage: string;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
  open: boolean;
  pendingLabel: string;
  title: string;
};

/** The action's pending and failure states live in the same dialog as its confirmation. */
export function AsyncConfirmDialog(props: AsyncConfirmDialogProps) {
  const { t } = useTranslator();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!props.open) setError(null);
  }, [props.open]);
  useEffect(() => {
    if (props.open && !props.allowed && !pending && !error) props.onClose();
  }, [props.open, props.allowed, props.onClose, pending, error]);
  const confirm = async () => {
    if (inFlight.current || !props.allowed || props.disabled) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await props.onConfirm();
      props.onClose();
    } catch (failure) {
      setError(getErrorMessage(failure, props.failureMessage));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !inFlight.current) props.onClose();
      }}
    >
      <DialogContent className="w-11/12 max-w-md">
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>{props.description}</DialogDescription>
        {props.children}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-4">
          <Button disabled={pending} onClick={props.onClose} variant="ghost">
            {t('common.cancel')}
          </Button>
          <Button
            disabled={pending || props.disabled || !props.allowed}
            onClick={() => void confirm()}
            variant={props.destructive ? 'destructive' : 'default'}
          >
            {pending ? props.pendingLabel : props.confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
