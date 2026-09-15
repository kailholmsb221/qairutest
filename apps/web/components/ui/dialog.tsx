'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogContent({ children, className, ...rest }: DialogPrimitive.DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="cmd-overlay" />
      <DialogPrimitive.Content className={className ?? 'cmd glass'} {...rest}>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
