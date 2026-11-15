// On phones a dialog slides up from the bottom like a native sheet; on larger screens it stays a
// centred dialog. Add to DialogContent's className.
export const SHEET_CLASS =
  "max-md:inset-x-0 max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-[28px] max-md:border-x-0 max-md:border-b-0 max-md:pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-md:data-[state=open]:slide-in-from-bottom max-md:data-[state=closed]:slide-out-to-bottom";
